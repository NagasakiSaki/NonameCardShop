import {mountTableLobby} from '../components/combat/lobby.mjs';
import {mountRosterPicker} from '../components/combat/picker.mjs';
import {fitPanel} from '../services/panel-shell.mjs';
import {performOperation,recoverOperation} from '../services/operations.mjs';
import {el,newRequestId} from '../../frontend/ui/components.mjs';
import {openCombat as openBattle} from '../../frontend/ui/combat-room.mjs';

const identity=app=>app.snapshot().worldId+':'+app.snapshot().branchId;
async function openPicker(app,{mode,currentRefs,onConfirm,parentActive}){
  return app.windows.open({id:'roster-picker',title:'选择武将',pauseReason:'选择武将',width:'window--wide',render:async ctx=>{
    fitPanel(ctx);let disposed=false,controller;const branch=identity(app),active=()=>!disposed&&!ctx.handle.closed&&identity(app)===branch&&parentActive();
    const root=el('div',{'data-facility-root':'roster'}),message=el('div',{role:'status'});ctx.body.append(message,root);
    ctx.onCleanup(()=>{disposed=true;controller?.dispose();});
    const [eligible,favorites]=await Promise.all([ctx.query('combat.eligible',{mode}),ctx.query('player.favorites')]);if(!active())return;
    if(!eligible.ok||!favorites.ok){message.textContent=eligible.error?.message||favorites.error.message;return;}
    const operation=app.favoriteOperation??={};
    if(operation.operation&&`${operation.operation.worldId}:${operation.operation.branchId}`!==branch)operation.operation.status='stale';
    controller=mountRosterPicker({root,view:{mode,items:eligible.data.items,favoriteCardKeys:favorites.data.cardKeys},draft:{mode,selectedRefs:[...currentRefs]},actions:{
      cancel:()=>ctx.handle.close(),
      selectLineup({inventoryRefs,mode}){if(active()){const cards=inventoryRefs.map(ref=>eligible.data.items.find(i=>i.inventoryRef===ref));if(cards.some(c=>!c?.eligible))return;onConfirm({inventoryRefs:[...inventoryRefs],mode,cards});}ctx.handle.close();},
      async loadCardDetail({cardKey}){const r=await ctx.query('catalog.detail',{cardKey});if(!active()||!r.ok)return [];return r.data.skills.map(s=>({title:s.name||s.id,text:s.description||'暂无技能说明。'}));},
      async setFavorite(payload){
        const result=await performOperation(app,ctx,operation,{requestId:newRequestId('favorite'),type:'player.setFavorite',payload});
        if(active()&&!result.ok){message.replaceChildren(el('span',{text:result.error.message}));if(operation.operation?.status==='unknown')message.append(el('button',{class:'btn btn--sm',text:'查看收藏结果',onclick:async()=>{const found=await recoverOperation(app,ctx,operation);if(!active())return;message.textContent=found.ok?'收藏已保存。':found.error.message;const f=await ctx.query('player.favorites');if(f.ok&&active())controller.update({favoriteCardKeys:f.data.cardKeys});}}));}
        return result;
      },
    }});
  }});
}
export async function openCombat(app,options={}){
  const status=await app.query('combat.queue');
  if(status.ok&&status.data.playerMatch)return openBattle(app,{...options,battleOnly:true,autoStart:true});
  const id=options.tableId?'combat-'+options.tableId:'combat-lobby';
  return app.windows.open({id,title:options.tableId?'牌桌报名':'牌桌大厅',pauseReason:'牌桌报名',width:'window--wide',render:async ctx=>{
    fitPanel(ctx);let disposed=false,controller;const branch=identity(app),active=()=>!disposed&&!ctx.handle.closed&&branch===identity(app);
    const saved=app.lobbyDraft?.identity===branch?app.lobbyDraft.state:{};
    const tabs=el('div',{class:'surface-actions'}),root=el('div',{'data-facility-root':'lobby'}),message=el('div',{role:'status'});ctx.body.append(tabs,message,root);ctx.element.dataset.lobbyPage='tables';
    for(const [key,label]of [['tables','牌桌'],['lineup','阵容与报名'],['fees','开桌费']])tabs.append(el('button',{class:'btn btn--sm',text:label,onclick:()=>{ctx.element.dataset.lobbyPage=key;}}));
    const operation=app.tableOperation??={};
    if(operation.operation&&`${operation.operation.worldId}:${operation.operation.branchId}`!==branch)operation.operation.status='stale';
    async function refresh(){
      const [room,settings,queue]=await Promise.all([ctx.query('room.snapshot'),ctx.query('room.settings'),ctx.query('combat.queue')]);if(!active())return;
      if(!room.ok||!settings.ok||!queue.ok){message.textContent=room.error?.message||settings.error?.message||queue.error?.message;return;}
      const result={tables:room.data.tables.filter(t=>!options.tableId||t.tableId===options.tableId).map(t=>({...t,mode:['bo3','kof'].includes(t.mode)?t.mode:null})),balance:app.snapshot().wallet.available,mode:saved.mode||'kof',queue:queue.data.player?{...queue.data.player,status:'waiting'}:{status:'none'},tableFeeConfig:{currentFee:settings.data.amount,minFee:settings.data.min,maxFee:settings.data.max,step:1,presets:[0,3,5,10,20],note:'顾客每人支付此桌费；已接受的费用保持原值。店长参赛免费。'}};
      controller?.update(result);return result;
    }
    const view=await refresh();if(!view||!active())return;
    controller=mountTableLobby({root,view,draft:saved,actions:{
      close:()=>ctx.handle.close(),
      goToTable:({tableId})=>{ctx.handle.close();app.goToInteraction(tableId,'combat',{tableId});},
      openRosterPicker:args=>openPicker(app,{...args,parentActive:active}),
      async setTableFee(payload){const r=await performOperation(app,ctx,operation,{requestId:newRequestId('table-fee'),type:'room.setTableFee',payload});if(active()){await refresh();if(!r.ok)showError(r,operation);}return r;},
      async joinQueue(payload){const op=app.queueOperation??={},r=await performOperation(app,ctx,op,{requestId:newRequestId('join-queue'),type:'combat.joinQueue',payload});if(!active())return r;if(r.ok)ctx.handle.close();else showError(r,op);return r;},
      async leaveQueue(){const op=app.queueOperation??={},r=await performOperation(app,ctx,op,{requestId:newRequestId('leave-queue'),type:'combat.leaveQueue',payload:{}});if(active()){if(!r.ok)showError(r,op);await refresh();}return r;},
    }});
    function showError(result,draft){message.replaceChildren(el('span',{text:result.error.message}));if(draft.operation?.status==='unknown')message.append(el('button',{class:'btn btn--sm',text:'查看上次操作结果',onclick:async()=>{const found=await recoverOperation(app,ctx,draft);if(!active())return;message.textContent=found.ok?'操作已确认。':found.error.message;await refresh();}}));}
    ctx.onCleanup(()=>{disposed=true;if(controller){app.lobbyDraft={identity:branch,state:controller.getDraft()};controller.dispose();}});
  }});
}
