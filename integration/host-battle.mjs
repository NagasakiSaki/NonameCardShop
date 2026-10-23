import {need} from '../modules/backend/common.mjs';

export function createBattleMount(runtime,{fetch=globalThis.fetch,document=globalThis.document,window=globalThis.window,loadTimeoutMs=60000}={}){
  const active=new Map();let mounting=false,generation=0;
  async function mount({container,matchId,signal}){
    need(container&&typeof container.replaceChildren==='function','INVALID_INPUT','对战容器不存在。');
    need(!mounting&&!active.size,'MATCH_ACTIVE','同一会话只能挂载一场需要本人操作的比赛。');
    mounting=true;const epoch=generation;let lease,frame,startedGame,cleanup,disposed=false,loadingTimer,listener;
    const check=()=>need(epoch===generation&&!signal?.aborted&&container.isConnected!==false,'MOUNT_CANCELLED','牌局窗口已关闭，已取消载入。');
    const dispose=reason=>{if(disposed)return cleanup;disposed=true;clearTimeout(loadingTimer);if(listener)window.removeEventListener('message',listener);signal?.removeEventListener('abort',onAbort);frame?.remove();cleanup=(startedGame?runtime.interrupt(matchId,reason):Promise.resolve()).finally(async()=>{if(lease)await runtime.pause.release(lease.leaseId);active.delete(matchId);});return cleanup;};
    const onAbort=()=>{dispose().catch(console.error);};
    try{
    check();
    const response=await fetch('/api/runtime',{signal:signal?AbortSignal.any([signal,AbortSignal.timeout(6000)]):AbortSignal.timeout(6000)});
    check();
    need(response.ok,'ENGINE_UNAVAILABLE','本地引擎服务无法连接。');const engine=await response.json();
    need(engine.ready&&engine.integrationVersion===2,'ENGINE_UNAVAILABLE','引擎服务尚未就绪或版本不匹配。');
    let state=runtime.inspect().world,match=state.matches.find(m=>m.matchId===matchId);
    need(match&&!match.background,'INVALID_STATE','玩家视图不能接管 NPC 后台牌局。');
    if(['prepared','awaitingNext','interrupted'].includes(match.status)){
      const started=await runtime.command({requestId:`mount-${match.matchId}-${match.bout}-${match.gameId||'new'}`.slice(-150),type:match.status==='prepared'?'combat.start':'combat.continue',payload:{matchId}});
      need(started.ok,started.error?.code||'ENGINE_UNAVAILABLE',started.error?.message||'比赛不能开始。');state=runtime.inspect().world;match=state.matches.find(m=>m.matchId===matchId);
    }
    need(match?.status==='running','INVALID_STATE','请先调用 combat.start / combat.continue。');
    startedGame=match.gameId;check();
    frame=document.createElement('iframe');frame.title='无名杀原版对局';frame.allow='autoplay; fullscreen';frame.style.cssText='width:100%;height:100%;border:0;min-height:480px';
    lease=await runtime.pause.acquire({ownerId:`battle:${matchId}`,reason:'玩家对局'});check();
    const url=new URL(engine.engineOrigin);
    const roster=match.mine.map(c=>c.generalId),opponentRoster=match.enemy.map(c=>c.generalId);
    for(const [key,value] of Object.entries({packer:1,match:match.gameId,parentOrigin:window.location.origin,general:roster[0],opponent:opponentRoster[0],duelMode:match.mode,roster:JSON.stringify(roster),opponentRoster:JSON.stringify(opponentRoster),first:match.first,initialHand:match.rules.initialHand,firstDrawPenalty:match.rules.firstDrawPenalty}))url.searchParams.set(key,String(value));
    listener=event=>{
      const message=event.data;
      if(disposed||event.origin!==engine.engineOrigin||event.source!==frame.contentWindow||message?.channel!=='noname-packer'||message.matchId!==match.gameId)return;
      if(message.type==='ready')clearTimeout(loadingTimer);
      if(message.type==='error'){dispose(message.text||'原引擎发生错误，请重试或取消未开局比赛。').catch(console.error);return;}
      if(['ready','replacement','result'].includes(message.type))runtime.trustedEngineEvent(matchId,message).catch(error=>console.warn('已忽略过期或非法引擎事件：',error.message));
    };
    window.addEventListener('message',listener);active.set(matchId,dispose);container.replaceChildren(frame);frame.src=url.href;
    signal?.addEventListener('abort',onAbort,{once:true});
    loadingTimer=setTimeout(()=>dispose('原引擎载入超时；阵容与比分保留，可重试或取消尚未开始的比赛。').catch(console.error),loadTimeoutMs);loadingTimer.unref?.();
    return {dispose:()=>dispose()};
    }catch(error){await dispose(error.code==='MOUNT_CANCELLED'?undefined:error.message);throw error;}finally{mounting=false;}
  }
  mount.disposeAll=()=>{generation++;return Promise.all([...active.values()].map(dispose=>dispose()));};
  return mount;
}
