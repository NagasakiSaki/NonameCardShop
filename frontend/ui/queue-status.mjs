// Non-modal map status: no pause lease, global keys, timers or movement ownership.
import {el,newRequestId} from './components.mjs';
import {performOperation,recoverOperation,retryOperation} from '../../frontend-next/services/operations.mjs';
import {mountWaitingBar} from '../../frontend-next/components/combat/waiting-bar.mjs';

export function mountQueueStatus(app){
  const root=el('aside',{'data-queue-status':'true','aria-label':'候战状态',style:{position:'fixed',bottom:'16px',left:'16px',zIndex:'180',maxWidth:'calc(100vw - 32px)',padding:'10px',background:'#17232b',border:'1px solid #b58a3b',borderRadius:'8px',display:'flex',gap:'8px',alignItems:'center',flexWrap:'wrap'}});
  root.style.background='transparent';root.style.border='none';root.style.padding='0';root.style.left='16px';root.style.width='calc(100vw - 32px)';root.style.pointerEvents='none';
  const banner=el('div',{style:{background:'#17232b',padding:'8px',borderRadius:'6px',pointerEvents:'auto'}}),barRoot=el('div',{style:{flex:'1',minWidth:'0'}});root.append(banner,barRoot);document.body.append(root);let disposed=false,busy=false,signature='';
  const operation=app.queueOperation??={};
  const ctx={canSubmit:()=>!disposed,submit:req=>app.command(req),query:(name,p)=>app.query(name,p)};
  const waitingBar=mountWaitingBar({root:barRoot,view:{status:'none'},actions:{leaveQueue:()=>run('combat.leaveQueue'),setWaitMode:({autoMove})=>run('combat.setWaitMode',{mode:autoMove?'wander':'manual'}),goToTable:()=>{const m=app.snapshot().matchmaking;if(m?.match)app.openPanel('combat',{tableId:m.match.tableId});else app.goToInteraction(m?.player?.tableId||'battleRoom.service','combat',{tableId:m?.player?.tableId});},openLobby:()=>app.openPanel('combat')}});
  async function run(type,payload={},recover=false,retry=false){
    if(busy)return;busy=true;signature='';render();
    try{
      const result=recover?await(retry?retryOperation(app,ctx,operation):recoverOperation(app,ctx,operation)):await performOperation(app,ctx,operation,{requestId:newRequestId('queue'),type,payload});
      if(!disposed&&!result.ok)app.toast('error','操作尚未完成',result.error.message);
      if(!disposed)await app.refreshSnapshot();
    }finally{busy=false;signature='';render();}
  }
  function render(){
    if(disposed)return;
    const snapshot=app.snapshot(),q=snapshot.matchmaking?.player,m=snapshot.matchmaking?.match,op=operation.operation;
    if(op&&(op.worldId!==snapshot.worldId||op.branchId!==snapshot.branchId))op.status='stale';
    const unknown=['unknown','submitting'].includes(op?.status),next=JSON.stringify([q?.queueId,q?.waitMode,m?.matchId,m?.status,unknown,busy,app.windows.depth]);
    root.hidden=app.windows.depth>0||!q&&!m&&!unknown;
    if(next===signature)return;signature=next;banner.replaceChildren();banner.hidden=!unknown;
    if(unknown){waitingBar.update({status:'none'});banner.append(el('span',{text:'正在确认上次操作'}),el('button',{class:'btn btn--sm',text:'查看结果',disabled:busy,onclick:()=>run(null,{},true)}),el('button',{class:'btn btn--sm',text:'原操作重试',disabled:busy,onclick:()=>run(null,{},true,true)}));return;}
    waitingBar.update({status:q?'waiting':m?m.status==='prepared'?'opponent_ready':m.status==='interrupted'?'error':'playing':'none',tableId:q?.tableId||m?.tableId,tableLabel:'店内牌桌',mode:q?.mode||m?.mode,lineup:q?.lineup||m?.lineup||[],autoMove:q?.waitMode==='wander'});
    for(const button of barRoot.querySelectorAll('button'))button.disabled=busy;
  }
  render();return {render,dispose(){disposed=true;waitingBar.dispose();root.remove();}};
}
