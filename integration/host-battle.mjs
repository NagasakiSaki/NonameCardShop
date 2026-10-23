import {need} from '../modules/backend/common.mjs';

export function createBattleMount(runtime){
  const active=new Map();
  async function mount({container,matchId}){
    need(container&&typeof container.replaceChildren==='function','INVALID_INPUT','对战容器不存在。');
    need(!active.size,'MATCH_ACTIVE','同一会话只能挂载一场需要本人操作的比赛。');
    const response=await fetch('/api/runtime',{signal:AbortSignal.timeout(6000)});
    need(response.ok,'ENGINE_UNAVAILABLE','本地引擎服务无法连接。');const engine=await response.json();
    need(engine.ready&&engine.integrationVersion===2,'ENGINE_UNAVAILABLE','引擎服务尚未就绪或版本不匹配。');
    const state=runtime.inspect().world,match=state.matches.find(m=>m.matchId===matchId);
    need(match?.status==='running','INVALID_STATE','请先调用 combat.start / combat.continue。');
    const frame=document.createElement('iframe');frame.title='无名杀原版对局';frame.allow='autoplay; fullscreen';frame.style.cssText='width:100%;height:100%;border:0;min-height:480px';
    const lease=await runtime.pause.acquire({ownerId:`battle:${matchId}`,reason:'玩家对局'});
    const url=new URL(engine.engineOrigin);
    const roster=match.mine.map(c=>c.generalId),opponentRoster=match.enemy.map(c=>c.generalId);
    for(const [key,value] of Object.entries({packer:1,match:match.gameId,parentOrigin:location.origin,general:roster[0],opponent:opponentRoster[0],duelMode:match.mode,roster:JSON.stringify(roster),opponentRoster:JSON.stringify(opponentRoster),first:match.first,initialHand:match.rules.initialHand,firstDrawPenalty:match.rules.firstDrawPenalty}))url.searchParams.set(key,String(value));
    let disposed=false;
    const listener=event=>{
      const message=event.data;
      if(disposed||event.origin!==engine.engineOrigin||event.source!==frame.contentWindow||message?.channel!=='noname-packer'||message.matchId!==match.gameId)return;
      if(['ready','replacement','result'].includes(message.type))runtime.trustedEngineEvent(matchId,message).catch(error=>console.warn('已忽略过期或非法引擎事件：',error.message));
    };
    const dispose=()=>{if(disposed)return;disposed=true;window.removeEventListener('message',listener);frame.remove();active.delete(matchId);runtime.interrupt(matchId).finally(()=>runtime.pause.release(lease.leaseId)).catch(console.error);};
    window.addEventListener('message',listener);active.set(matchId,dispose);container.replaceChildren(frame);frame.src=url.href;
    return {dispose};
  }
  mount.disposeAll=()=>{for(const dispose of [...active.values()])dispose();};
  return mount;
}
