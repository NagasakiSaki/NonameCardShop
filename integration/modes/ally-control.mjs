// Requests change one controlled seat at a turn boundary. Never steal a pending
// card/target response from the player, and never enable whole-team autoswap.
export function createAllyControl({context,plan,bindings,emit,snapshot,isFinalised}){
  const {game,ui,_status}=context,primary=bindings.find(b=>b.seat.seatId===plan.controlledSeatId),receipts=new Map();
  let pending=null,revision=0;
  const state=()=>({revision,primarySeatId:plan.controlledSeatId,activeSeatId:game.me?._shopSeatId||null,pendingSeatId:pending?.target.seat.seatId||null,enabled:plan.controlPolicy!=='ai-only'});
  const publish=(type,requestId,extra={})=>emit(type,{requestId,...extra,control:state(),seats:snapshot()});
  function request(message){
    const {requestId,action,seatId}=message;
    if(typeof requestId!=='string'||!/^[a-zA-Z0-9_.:-]{1,150}$/.test(requestId))return;
    const signature=JSON.stringify([action,seatId??null]),existing=receipts.get(requestId);
    if(existing){if(existing.signature!==signature)publish('controlRejected',requestId,{code:'CONTROL_CONFLICT',message:'同一操作编号不能指定不同的接管目标。'});else publish(existing.type,requestId,existing.extra);return;}
    const reject=(code,text)=>{const extra={code,message:text};receipts.set(requestId,{signature,type:'controlRejected',extra});publish('controlRejected',requestId,extra);};
    if(receipts.size>=256){publish('controlRejected',requestId,{code:'CONTROL_LIMIT',message:'本局控制切换次数已达上限。'});return;}
    if(isFinalised()||_status.over){reject('ROUND_FINISHED','本局已经结束。');return;}
    if(plan.controlPolicy==='ai-only'){reject('CONTROL_DISABLED','本场未开启手动接管。');return;}
    if(!['takeover','release'].includes(action)){reject('INVALID_CONTROL','控制操作不合法。');return;}
    const target=action==='release'?primary:bindings.find(b=>b.seat.seatId===seatId);
    if(!target||target.seat.teamId!==plan.playerTeamId){reject('NOT_TEAMMATE','只能接管自己阵营的队友。');return;}
    if(action==='takeover'&&!target.player.isAlive()){reject('SEAT_DEAD','这位队友已经阵亡。');return;}
    if(pending){reject('CONTROL_PENDING','上一次切换正在等待回合边界。');return;}
    if(game.me===target.player){const extra={message:'当前已经是这个控制席位。'};receipts.set(requestId,{signature,type:'controlChanged',extra});publish('controlChanged',requestId,extra);return;}
    pending={requestId,signature,target};receipts.set(requestId,{signature,type:'controlPending',extra:{message:'当前操作完成后，在下一回合开始时切换。'}});
    publish('controlPending',requestId,receipts.get(requestId).extra);
  }
  function apply(){
    if(!pending||isFinalised()||_status.over)return;
    const p=pending;pending=null;
    if(p.target!==primary&&!p.target.player.isAlive()){
      const extra={code:'SEAT_DEAD',message:'目标队友已阵亡，本次切换已取消。'};receipts.set(p.requestId,{signature:p.signature,type:'controlRejected',extra});publish('controlRejected',p.requestId,extra);return;
    }
    game.swapPlayer(p.target.player);
    // This hook runs before the next turn's input is created. Returning to a dead
    // captain means observing the remaining AI, without reviving/switching teams.
    _status.auto=false;ui.auto?.classList.remove('glow');ui.arena.classList.remove('auto');
    revision++;
    const extra={message:p.target===primary?'已将队友交还AI，返回主将视角。':'已接管队友。'};
    receipts.set(p.requestId,{signature:p.signature,type:'controlChanged',extra});publish('controlChanged',p.requestId,extra);
  }
  return {request,apply,state};
}
