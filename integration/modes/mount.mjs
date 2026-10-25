import {validateRoundPlan,digestPlan,expectedIdentity,stableJSON,mapNativeResult} from './round-plan.mjs';

const fail=(code,message)=>Object.assign(Error(message),{code});
const activeWindows=new WeakMap();
const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
export async function probeModeCapabilities(engineOrigin,{fetch=globalThis.fetch,signal}={}){
  const response=await fetch(new URL('/shop-integration/modes/capabilities.json',engineOrigin),{cache:'no-store',signal});
  if(!response.ok)throw fail('ENGINE_UNAVAILABLE','无法获取原生模式能力。');return response.json();
}
export function validateNativeEvent({event,origin,source,expected,token,plan}){
  const m=event?.data;
  if(event?.origin!==origin||event.source!==source||!m||m.channel!=='noname-shop-native'||m.token!==token||m.gameId!==plan.gameId)return null;
  if(['loading','error','restart-request'].includes(m.type))return {type:m.type,text:typeof m.text==='string'?m.text.slice(0,500):''};
  if(!['ready','playing','result','controlPending','controlChanged','controlRejected'].includes(m.type)||Object.entries(expected).some(([k,v])=>m[k]!==v))return null;
  if(!Array.isArray(m.seats)||m.seats.length!==plan.seats.length||new Set(m.seats.map(s=>s.seatId)).size!==plan.seats.length)return null;
  if(m.seats.some(s=>{const p=plan.seats.find(p=>p.seatId===s.seatId);return !p||['teamId','role','controller','generalId'].some(k=>s[k]!==p[k])||typeof s.alive!=='boolean';}))return null;
  if(m.type==='result'&&(m.completed!==true||m.simulated!==false||m.resultId!==plan.gameId+':result'||!(m.winningTeamId===null||plan.seats.some(s=>s.teamId===m.winningTeamId))))return null;
  const controlEvent=m.type.startsWith('control');
  if(controlEvent&&(!/^[a-zA-Z0-9_.:-]{1,150}$/.test(m.requestId||'')||!Number.isSafeInteger(m.control?.revision)||m.control.revision<0||!plan.seats.some(s=>s.seatId===m.control.activeSeatId&&s.teamId===plan.playerTeamId)))return null;
  // Never forward private or arbitrary message fields as trusted business data.
  return {type:m.type,...expected,seats:m.seats.map(s=>({seatId:s.seatId,teamId:s.teamId,role:s.role,controller:s.controller,generalId:s.generalId,alive:s.alive,hp:s.hp,maxHp:s.maxHp,handCount:s.handCount,controlled:s.controlled})),...(m.type==='result'?{resultId:m.resultId,winningTeamId:m.winningTeamId,completed:true,simulated:false}:{}),...(controlEvent?{requestId:m.requestId,code:typeof m.code==='string'?m.code.slice(0,100):null,message:typeof m.message==='string'?m.message.slice(0,500):'',control:{revision:m.control.revision,primarySeatId:plan.controlledSeatId,activeSeatId:m.control.activeSeatId,pendingSeatId:plan.seats.some(s=>s.seatId===m.control.pendingSeatId&&s.teamId===plan.playerTeamId)?m.control.pendingSeatId:null,enabled:m.control.enabled===true}}:{}),round:Number.isSafeInteger(m.round)?m.round:0};
}

/** Native round only: the caller owns series scoring, roster locks and world time. */
export async function mountNativeRound({container,plan:raw,signal,onEvent=()=>{}},{engineOrigin,window=globalThis.window,document=globalThis.document,fetch=globalThis.fetch,loadTimeoutMs=60000,acquirePause=null,releasePause=null}={}){
  const plan=freeze(validateRoundPlan(raw)),planHash=await digestPlan(plan),expected=Object.freeze(expectedIdentity(plan,planHash));
  const origin=new URL(engineOrigin).origin;
  if(!/^http:\/\/127\.0\.0\.1:\d+$/.test(origin)||!container?.replaceChildren)throw fail('INVALID_INPUT','原生对局地址或容器无效。');
  if(signal?.aborted||container.isConnected===false)throw fail('MOUNT_CANCELLED','对局挂载已取消。');
  const capabilities=await probeModeCapabilities(origin,{fetch,signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000)});
  if(!capabilities.items?.some(p=>p.profileId===plan.profileId&&p.supported))throw fail('FEATURE_UNAVAILABLE','此原生模式与当前内核不兼容。');
  if(activeWindows.has(window))throw fail('MATCH_ACTIVE','当前窗口已有一场原生玩家牌局。');
  const token=[...crypto.getRandomValues(new Uint8Array(16))].map(n=>n.toString(16).padStart(2,'0')).join('');
  const frame=document.createElement('iframe');frame.title=plan.engineMode==='doudizhu'?'无名杀原生斗地主':'无名杀原生2v2';frame.style.cssText='width:100%;height:100%;border:0;min-height:480px';
  activeWindows.set(window,frame);
  let disposed=false,ready=false,receipt=null,timer,lease,cleanup=Promise.resolve();
  const dispatch=value=>{try{Promise.resolve(onEvent(value)).catch(error=>stop(error.code||'HOST_ERROR',error.message));}catch(error){stop(error.code||'HOST_ERROR',error.message);}};
  const dispose=()=>{
    if(disposed)return cleanup;disposed=true;clearTimeout(timer);signal?.removeEventListener('abort',onAbort);window.removeEventListener('message',listener);frame.remove();if(activeWindows.get(window)===frame)activeWindows.delete(window);
    cleanup=lease&&releasePause?Promise.resolve(releasePause(lease.leaseId||lease)):Promise.resolve();return cleanup;
  };
  const onAbort=()=>{dispose().catch(()=>{});};
  function stop(code,message){if(disposed)return;dispose().catch(()=>{});try{Promise.resolve(onEvent({type:'error',code,message,...expected})).catch(()=>{});}catch{}}
  const listener=event=>{
    if(disposed)return;
    const message=validateNativeEvent({event,origin,source:frame.contentWindow,expected,token,plan});if(!message)return;
    if(message.type==='error'||message.type==='restart-request'){stop('ENGINE_ERROR',message.text||'引擎请求重启，当前小局未自动记为胜利。');return;}
    if(message.type==='ready'){
      if(ready)return;
      if(message.seats.some(s=>s.controlled!==(s.seatId===plan.controlledSeatId))){stop('PROFILE_MISMATCH','AI席位控制状态不正确。');return;}
      ready=true;clearTimeout(timer);
    }
    if(message.type==='result'){
      if(!ready){stop('NOT_READY','引擎尚未就绪，不能接受赛果。');return;}
      const signature=stableJSON(message);
      if(receipt){if(receipt!==signature)stop('RESULT_CONFLICT','同一小局收到不同赛果。');return;}
      receipt=signature;dispatch({...mapNativeResult(message,plan),originVerified:true,sourceVerified:true});return;
    }
    dispatch(message);
  };
  try{
    if(acquirePause)lease=await acquirePause({ownerId:'native-round:'+plan.gameId,reason:'玩家对局'});
    if(signal?.aborted||container.isConnected===false)throw fail('MOUNT_CANCELLED','对局挂载已取消。');
    window.addEventListener('message',listener);signal?.addEventListener('abort',onAbort,{once:true});
    const url=new URL('/',origin);for(const [k,v]of Object.entries({packer:1,match:plan.gameId,parentOrigin:window.location.origin,nativeToken:token,nativePlan:JSON.stringify(plan)}))url.searchParams.set(k,v);
    frame.src=url.href;container.replaceChildren(frame);
    timer=setTimeout(()=>stop('ENGINE_TIMEOUT','原生牌局载入超时，请重试当前小局。'),loadTimeoutMs);
    return {frame,plan,planHash,dispose,
      control({action,seatId,requestId='native-control-'+crypto.randomUUID()}){
        if(disposed||!ready||receipt)throw fail('NOT_READY','当前不能切换控制席位。');
        if(!['takeover','release'].includes(action)||!/^[a-zA-Z0-9_.:-]{1,150}$/.test(requestId))throw fail('INVALID_CONTROL','控制请求不合法。');
        if(action==='takeover'&&!plan.seats.some(s=>s.seatId===seatId&&s.teamId===plan.playerTeamId))throw fail('NOT_TEAMMATE','只能接管自己阵营。');
        frame.contentWindow.postMessage({...expected,channel:'noname-shop-native-control',token,requestId,action,...(seatId?{seatId}:{})},origin);return {requestId};
      },get ready(){return ready;},get disposed(){return disposed;}};
  }catch(error){await dispose();throw error;}
}
