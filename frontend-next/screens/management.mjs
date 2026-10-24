import {el,clear,errorView,newRequestId} from '../../frontend/ui/components.mjs';
import {queryAll,unwrap} from '../services/views.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';
import {managementView} from '../services/management-view.mjs';
import {mount as mountBook} from '../components/management/day-book.mjs';
import {mount as mountGuide} from '../components/management/guide-regulars.mjs';
import {mount as mountCustomers} from '../components/management/hud-customers.mjs';
import {mount as mountOperations} from '../components/management/operations.mjs';

const TYPES={report:{title:'经营手账与日报',mount:mountBook},guide:{title:'引导 · 熟客 · 本店故事',mount:mountGuide},customers:{title:'顾客与牌桌',mount:mountCustomers},operations:{title:'经营操作 · 设施 · 熟客订单',mount:mountOperations}};
export async function openManagementView(app,{kind='report',tab='upgrades'}={}){
  const spec=TYPES[kind];
  const existing=app.windows.stack.find(item=>item.id==='experience-'+kind)?.handle;
  if(existing){const handle=app.windows.open({id:existing.id});handle.chooseManagementTab?.(tab);return handle;}
  return app.windows.open({id:'experience-'+kind,title:spec.title,width:'window--wide',pauseReason:spec.title,render:async ctx=>{
    ctx.handle.managementDispose?.();
    let disposed=false,controller=null,pendingTimer=null,loading=null;
    let requestedTab=tab;ctx.handle.chooseManagementTab=next=>{requestedTab=next;controller?.setTab?.(next);};
    const identity=app.snapshot().worldId+':'+app.snapshot().branchId;
    const active=()=>!disposed&&!ctx.handle.closed&&identity===app.snapshot().worldId+':'+app.snapshot().branchId;
    const op=app.experienceOperation??={};
    if(op.operation&&`${op.operation.worldId}:${op.operation.branchId}`!==identity)op.operation.status='stale';
    const root=el('div',{'data-live-management':kind}),status=el('div',{role:'status'}),recovery=el('section',{hidden:true,'data-management-recovery':'true'});ctx.body.append(status,recovery,root);
    function recoveryState(){recovery.hidden=!['unknown','submitting'].includes(op.operation?.status);}
    for(const [label,fn]of [['查询原操作',recoverOperation],['使用原号重试',retryOperation]])recovery.append(el('button',{class:'btn',text:label,onclick:async()=>{const r=await fn(app,ctx,op);if(!active())return;status.textContent=r.ok?'已确认原操作结果。':r.error.message;recoveryState();await refresh().catch(()=>{});}}));
    const query=(name,p={})=>ctx.query(name,p).then(unwrap);
    async function refresh(){
      if(!active())return;if(loading)return loading;
      loading=(async()=>{
        if(kind==='operations'){
          const [s,people,upgrades,orders,cards]=await Promise.all([query('shop.snapshot'),query('management.people'),query('management.upgrades'),query('management.orders'),queryAll(ctx,'inventory.list',{grouped:true,kind:'card',location:'collection'})]);
          if(!active())return;const view={snapshot:s,people,upgrades,orders,cards,atMarket:app.isNearInteraction('store.secondaryMarket')};controller?.update(view);return view;
        }
        const [s,i,l,finance,g,events,stories,people,upgrades,tasks,room,listings]=await Promise.all([query('shop.snapshot'),query('management.insights'),query('ledger.daily'),query('ledger.live'),query('experience.guide'),query('experience.events'),query('experience.stories'),query('management.people'),query('management.upgrades'),query('tasks.list'),query('room.snapshot'),queryAll(ctx,'market.list',{tab:'mine'})]);
        if(!active())return;const view=managementView({snapshot:s,insights:i,ledger:l,finance,guide:g,events,stories,people,upgrades,tasks:Array.isArray(tasks)?tasks:tasks.items||[],room,listings});controller?.update(view);return view;
      })().finally(()=>{loading=null;});return loading;
    }
    async function command(type,payload={}){
      if(!active())return {ok:false,error:{code:'STALE_OPERATION',message:'窗口已关闭或进度已切换。'}};
      const result=await performOperation(app,ctx,op,{type,payload,requestId:newRequestId('management')});
      if(active())recoveryState();
      if(active())await refresh().catch(()=>{});return result;
    }
    const navigate=(id,panel,options={})=>{app.goToInteraction(id,panel,options);return {ok:true,message:'已前往对应设施。'};};
    const actions={supplierOpen:()=>navigate('store.counter','supplier'),retailOpen:()=>navigate('store.retail','supplier',{purchaseTab:'retail'}),managementOpen:()=>{app.openPanel('management');return {ok:true};},financeOpen:()=>{app.openPanel('finance');return {ok:true};},tradingOpen:()=>navigate('store.secondaryMarket','market'),customerDetail:()=>{app.openPanel('management',{tab:'people'});return {ok:true};},tableRecord:()=>navigate('battleRoom.service','combat'),businessOpen:()=>command('business.open'),businessClose:()=>command('business.close'),businessNextDay:()=>command('business.nextDay'),reportView:()=>{app.openPanel('report');return {ok:true};},guideSkip:()=>command('experience.setGuideSkipped',{skipped:true}),regularTalk:personId=>command('neighbors.act',{personId,action:'talk'}),
      upgrade:p=>command('upgrades.purchase',p),neighbor:p=>command('neighbors.act',p),goMarket:()=>navigate('store.secondaryMarket','management',{tab:'people'}),goSupplier:()=>navigate('store.counter','supplier'),
      async guideChoice(stepId){const g=await query('experience.guide'),step=g.steps.find(x=>x.id===stepId);if(!step)return {ok:false,error:{code:'NOT_FOUND',message:'找不到这一步。'}};if(step.id==='community-day'){await app.openPanel('guide');return {ok:true};}if(step.id==='close-first'){await app.openPanel('report');return {ok:true};}if(step.id==='meet-regular'){await app.openPanel('management',{tab:'people'});return {ok:true};}if(step.guide){const panels={'store.counter':'supplier','store.retail':'supplier','store.opening':'opening','store.secondaryMarket':'market','battleRoom.service':'combat'};return navigate(step.guide,panels[step.guide],step.guide==='store.retail'?{purchaseTab:'retail'}:{});}app.openPanel('management');return {ok:true};},
      async eventIntent(){const e=await query('experience.events'),today=e.items.find(v=>v.day===app.snapshot().clock.day);if(today)return {ok:true,message:`${today.title}：${{scheduled:'已安排，等待正常进店与比赛',completed:'已完成',ended:'已结束'}[today.status]}（${today.completedMatches}/${today.matchesRequired} 场）。`};if(!e.available)return {ok:false,error:{code:'EVENT_UNAVAILABLE',message:e.reasons.map(r=>r.message).join('；')}};return command('experience.scheduleEvent',{eventId:e.proposal.id});},
      adviceAction:({params})=>{const id=params?.guide||'store.counter';return navigate(id,id==='store.retail'?'supplier':id==='battleRoom.service'?'combat':'supplier',id==='store.retail'?{purchaseTab:'retail'}:{});},
      nextDayIntent:item=>{if(item.intent==='supplier')return navigate('store.counter','supplier');app.openPanel('guide');return {ok:true};},
    };
    let off=()=>{};
    const dispose=()=>{if(disposed)return;disposed=true;clearTimeout(pendingTimer);controller?.dispose();off();};ctx.handle.managementDispose=dispose;ctx.onCleanup(dispose);
    off=app.host.subscribe(event=>{
      if(!active()||!controller||!['snapshotUpdated','actorsUpdated'].includes(event.type)||pendingTimer)return;
      pendingTimer=setTimeout(()=>{pendingTimer=null;refresh().catch(error=>{if(active())status.textContent=error.message;});},250);
    });
    try{const view=await refresh();if(!active()||!view)return;controller=spec.mount({root,view,actions,assets:{money:app.formatMoney,portrait:id=>app.manifest.characters[id]?.portrait}});
      controller.setTab?.(requestedTab);
      if(kind==='guide'&&view.guide.skipped)root.prepend(el('button',{class:'btn',text:'重新显示引导',onclick:async()=>{await command('experience.setGuideSkipped',{skipped:false});}}));
      recoveryState();
    }catch(error){if(active()){clear(root);root.append(errorView({code:error.code||'VIEW_ERROR',message:error.message},()=>ctx.refresh()));}}
  }});
}
export const openDayReport=app=>openManagementView(app,{kind:'report'});
export const openGuide=app=>openManagementView(app,{kind:'guide'});
export const openCustomers=app=>openManagementView(app,{kind:'customers'});
export const openManagement=(app,o={})=>openManagementView(app,{...o,kind:'operations'});
