import {need} from '../modules/backend/common.mjs';
import {mountNativeRound} from './modes/mount.mjs';

export function createBattleMount(runtime,{fetch=globalThis.fetch,document=globalThis.document,window=globalThis.window,loadTimeoutMs=60000}={}){
  const active=new Map(),controls=new Map();let mounting=false,generation=0;
  async function mount({container,matchId,signal,loadTimeoutMs:budgetOverride=null}){
    // 每场可覆盖等待预算：正式界面不传（用构造时的默认值），测试/诊断用它缩短真实超时等待。
    const budget=Number.isFinite(budgetOverride)&&budgetOverride>0?budgetOverride:loadTimeoutMs;
    need(container&&typeof container.replaceChildren==='function','INVALID_INPUT','对战容器不存在。');
    need(!mounting&&!active.size,'MATCH_ACTIVE','同一会话只能挂载一场需要本人操作的比赛。');
    mounting=true;const epoch=generation;let lease,frame,nativeHandle,startedGame,cleanup,disposed=false,loadingTimer,listener;
    const check=()=>need(epoch===generation&&!signal?.aborted&&container.isConnected!==false,'MOUNT_CANCELLED','牌局窗口已关闭，已取消载入。');
    const dispose=(reason,code=null)=>{if(disposed)return cleanup;disposed=true;clearTimeout(loadingTimer);if(listener)window.removeEventListener('message',listener);signal?.removeEventListener('abort',onAbort);frame?.remove();controls.delete(matchId);cleanup=Promise.resolve(nativeHandle?.dispose()).then(()=>startedGame?runtime.interrupt(matchId,reason,code):undefined).finally(async()=>{if(lease)await runtime.pause.release(lease.leaseId);active.delete(matchId);});return cleanup;};
    const onAbort=()=>{dispose().catch(console.error);};
    try{
    check();
    const response=await fetch('/api/runtime',{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000)});
    check();
    need(response.ok,'ENGINE_UNAVAILABLE','本地引擎服务无法连接。');const engine=await response.json();
    need(engine.ready&&engine.integrationVersion===2,'ENGINE_UNAVAILABLE','引擎服务尚未就绪或版本不匹配。');
    let state=runtime.inspect().world,match=state.matches.find(m=>m.matchId===matchId);
    need(match&&!match.background,'INVALID_STATE','玩家视图不能接管 NPC 后台牌局。');
    if(match.series?.phase==='interrupted')throw Object.assign(Error('请先选择重开当前小局，再重新选将。'),{code:'RECOVERY_REQUIRED'});
    if(['prepared','awaitingNext','interrupted'].includes(match.status)){
      const started=await runtime.command({requestId:`mount-${match.matchId}-${match.bout}-${match.gameId||'new'}`.replace(/[^a-zA-Z0-9_-]/g,'_').slice(-150),type:match.status==='prepared'?'combat.start':'combat.continue',payload:{matchId}});
      need(started.ok,started.error?.code||'ENGINE_UNAVAILABLE',started.error?.message||'比赛不能开始。');state=runtime.inspect().world;match=state.matches.find(m=>m.matchId===matchId);
    }
    need(match?.status==='running','INVALID_STATE','请先调用 combat.start / combat.continue。');
    startedGame=match.gameId;check();
    if(match.series&&match.mode!=='kof'){
      const planned=await runtime.query('combat.roundPlan',{matchId});check();need(planned.ok,planned.error?.code,planned.error?.message);
      // Native handles own their paired time lease and validate the full identity/token/plan.
      nativeHandle=await mountNativeRound({container,plan:planned.data,signal,onEvent:async message=>{
        if(message.type==='error'){await dispose(message.message,message.code||'ENGINE_ERROR');return;}
        if(['ready','playing','result','controlPending','controlChanged','controlRejected'].includes(message.type))await runtime.trustedEngineEvent(matchId,message);
      }},{engineOrigin:engine.engineOrigin,window,document,fetch,loadTimeoutMs:budget,acquirePause:p=>runtime.pause.acquire(p),releasePause:id=>runtime.pause.release(id)});
      check();controls.set(matchId,nativeHandle);active.set(matchId,dispose);
      signal?.addEventListener('abort',onAbort,{once:true});
      return {dispose:()=>dispose(),control:p=>nativeHandle.control(p)};
    }
    frame=document.createElement('iframe');frame.title='无名杀原版对局';frame.allow='autoplay; fullscreen';frame.style.cssText='width:100%;height:100%;border:0;min-height:480px';
    lease=await runtime.pause.acquire({ownerId:`battle:${matchId}`,reason:'玩家对局'});check();
    const url=new URL(engine.engineOrigin);
    const team=side=>match.series&&match.mode!=='kof'?match.series.round.seats.filter(s=>s.teamId===side):match[side];
    const roster=team('mine').map(c=>c.generalId),opponentRoster=team('enemy').map(c=>c.generalId);
    for(const [key,value] of Object.entries({packer:1,match:match.gameId,parentOrigin:window.location.origin,general:roster[0],opponent:opponentRoster[0],duelMode:match.mode,roster:JSON.stringify(roster),opponentRoster:JSON.stringify(opponentRoster),first:match.first,initialHand:match.rules.initialHand,firstDrawPenalty:match.rules.firstDrawPenalty}))url.searchParams.set(key,String(value));
    listener=event=>{
      const message=event.data;
      if(disposed||event.origin!==engine.engineOrigin||event.source!==frame.contentWindow||message?.channel!=='noname-packer'||message.matchId!==match.gameId)return;
      if(message.type==='ready')clearTimeout(loadingTimer);
      if(message.type==='error'){dispose(message.text||'原引擎发生错误，请重试或取消未开局比赛。','ENGINE_ERROR').catch(console.error);return;}
      if(['ready','replacement','result'].includes(message.type))runtime.trustedEngineEvent(matchId,message).catch(error=>console.warn('已忽略过期或非法引擎事件：',error.message));
    };
    window.addEventListener('message',listener);active.set(matchId,dispose);container.replaceChildren(frame);frame.src=url.href;
    signal?.addEventListener('abort',onAbort,{once:true});
    loadingTimer=setTimeout(()=>dispose('原引擎载入超时；阵容与比分保留，可重试或取消尚未开始的比赛。','ENGINE_TIMEOUT').catch(console.error),budget);loadingTimer.unref?.();
    return {dispose:()=>dispose()};
    }catch(error){await dispose(error.code==='MOUNT_CANCELLED'?undefined:error.message,error.code||null);throw error;}finally{mounting=false;}
  }
  mount.disposeAll=()=>{generation++;return Promise.all([...active.values()].map(dispose=>dispose()));};
  mount.control=({matchId,...input})=>{const handle=controls.get(matchId);need(handle,'NOT_READY','当前没有可接管的原生牌局。');return handle.control(input);};
  return mount;
}
