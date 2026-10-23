import {id,need} from '../modules/backend/common.mjs';

// One real, isolated noname iframe. No score-based substitute outcomes.
export function createNpcEngine(runtime,{document=globalThis.document,window=globalThis.window,fetch=globalThis.fetch,intervalMs=400,loadTimeoutMs=60000,stallTimeoutMs=120000}={}){
  let active=null,timer=null,pumping=false,disposed=false;
  function control(paused){if(!active?.ready||active.paused===paused)return;active.paused=paused;active.frame.contentWindow?.postMessage({channel:'noname-shop-engine-control',matchId:active.gameId,token:active.token,action:paused?'pause':'resume'},active.origin);}
  function remove(){if(!active)return;window.removeEventListener('message',active.listener);active.frame.remove();active=null;}
  async function launch(match){
    const expected=runtime.backgroundState();
    const response=await fetch('/api/runtime',{signal:AbortSignal.timeout(6000)});need(response.ok,'ENGINE_UNAVAILABLE','无法读取后台引擎地址。');const engine=await response.json();need(engine.ready&&engine.integrationVersion===2,'ENGINE_UNAVAILABLE','后台引擎未就绪。');
    if(disposed){await runtime.interrupt(match.matchId);return;}
    const frame=document.createElement('iframe'),token=id('engine-control'),url=new URL(engine.engineOrigin),world=runtime.backgroundState();
    need(world.worldId===expected.worldId&&world.branchId===expected.branchId&&world.matches.some(m=>m.matchId===match.matchId&&m.gameId===match.gameId),'STALE_EVENT','载入期间世界或比赛已切换。');
    frame.title='NPC 后台对局';frame.dataset.shopNpcEngine=match.matchId;frame.setAttribute('aria-hidden','true');frame.tabIndex=-1;frame.style.cssText='position:fixed;left:-10000px;top:0;width:960px;height:640px;visibility:hidden;pointer-events:none;border:0';
    for(const [key,value] of Object.entries({packer:1,match:match.gameId,parentOrigin:window.location.origin,general:match.mine[0].generalId,opponent:match.enemy[0].generalId,duelMode:match.mode,roster:JSON.stringify(match.mine.map(c=>c.generalId)),opponentRoster:JSON.stringify(match.enemy.map(c=>c.generalId)),first:match.first,initialHand:match.rules.initialHand,firstDrawPenalty:match.rules.firstDrawPenalty,shopBackground:1,shopControlToken:token,shopRoundLimit:match.rules.aiRoundLimit||60}))url.searchParams.set(key,String(value));
    const instance={frame,gameId:match.gameId,matchId:match.matchId,worldId:world.worldId,branchId:world.branchId,origin:engine.engineOrigin,token,ready:false,paused:null,lastCheckedAt:Date.now(),loadingMs:0,idleMs:0,listener:null};
    instance.listener=event=>{
      const message=event.data;
      if(active!==instance||event.origin!==instance.origin||event.source!==frame.contentWindow||message?.channel!=='noname-packer'||message.matchId!==instance.gameId)return;
      if(message.type==='ready'){instance.ready=true;control(runtime.backgroundState().paused);}
      if(message.type==='playing')instance.idleMs=0;
      if(['ready','replacement','result'].includes(message.type))runtime.trustedEngineEvent(instance.matchId,message).catch(error=>console.warn('NPC 过期事件已忽略：',error.message));
      if(message.type==='error')instance.error=String(message.text||'后台引擎报告错误。');
    };
    active=instance;window.addEventListener('message',instance.listener);document.body.append(frame);frame.src=url.href;
  }
  async function pump(){
    if(disposed||pumping)return;pumping=true;
    try{
      const state=runtime.backgroundState();
      if(active){
        const current=state.matches.find(m=>m.matchId===active.matchId);
        if(state.worldId!==active.worldId||state.branchId!==active.branchId||!current||current.gameId!==active.gameId||current.status!=='running'){remove();}
        else {
          control(state.paused);
          const elapsed=Math.min(2000,Math.max(0,Date.now()-active.lastCheckedAt));active.lastCheckedAt=Date.now();
          if(!state.paused){if(active.ready)active.idleMs+=elapsed;else active.loadingMs+=elapsed;}
          if(!state.paused&&(active.error||active.loadingMs>loadTimeoutMs||active.idleMs>stallTimeoutMs)){const {matchId}=active;const reason=active.error||(active.ready?'后台牌局长时间无进展，按技术中断作废，不计战绩。':'后台引擎载入超时。');remove();await runtime.failBackgroundMatch(matchId,reason);}
          return;
        }
      }
      if(state.paused)return;
      const match=state.matches.find(m=>m.seated&&['prepared','awaitingNext','interrupted'].includes(m.status));if(!match)return;
      try{const started=await runtime.startBackgroundMatch(match.matchId);if(!disposed)await launch(started);}
      catch(error){if(!['WORLD_PAUSED','NOT_READY','STALE_EVENT'].includes(error.code))await runtime.failBackgroundMatch(match.matchId,error.message);}
    }finally{pumping=false;}
  }
  return {
    start(){if(!timer&&!disposed){timer=setInterval(()=>pump().catch(error=>console.warn('NPC 引擎调度：',error.message)),intervalMs);timer.unref?.();}},
    async pump(){await pump();},
    async dispose(){disposed=true;clearInterval(timer);timer=null;const matchId=active?.matchId;remove();if(matchId)await runtime.interrupt(matchId);}
  };
}
