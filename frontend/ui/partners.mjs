import {el,newRequestId} from './components.mjs';

const DUTIES={attraction:'招呼顾客',checkout:'协助收银',wholesale:'联系供货'};
export function openAllies(app){
 let tab='partners';
 return app.windows.open({id:'allies-v7',title:'高手伙伴与挑战',pauseReason:'查看伙伴与挑战',width:'window--wide',render:async ctx=>{
  let disposed=false;ctx.onCleanup(()=>{disposed=true;});
  const [result,progress,future]=await Promise.all([ctx.query('allies.list'),ctx.query('progression.status'),ctx.query('longTerm.status')]);if(disposed)return;
  if(!result.ok){ctx.body.append(el('p',{text:result.error.message}));return;}
  const view=result.data,nav=el('div',{class:'v7-actions'}),content=el('div');
  ctx.body.append(nav,content);
  function paint(){
   nav.replaceChildren();content.replaceChildren();
   for(const [id,label]of [['partners','伙伴排班'],['challenges','高手来访'],['future','账务与远景']])nav.append(el('button',{class:'btn',text:label,'aria-pressed':tab===id,onclick:()=>{tab=id;paint();}}));
   if(tab==='partners'){
    content.append(el('p',{text:`当班 ${view.slots.used}/${view.slots.max} · 引客 +${Math.round(view.effects.attractionRate*100)}% · 收银用时 −${Math.round(view.effects.checkoutReductionRate*100)}% · 进货优惠 ${Math.round(view.effects.wholesaleDiscountRate*100)}%`}),el('p',{class:'small',text:'伙伴不收工资。每人选择一项工作；合计上限：引客 30%、收银减时 40%、进货优惠 15%。休息中的伙伴仍保留在名册。'}));
    if(!view.allies.length)content.append(el('p',{text:'第 2 天起每两天有高手来访。赢下整场挑战后，她会成为经营伙伴。'}));
    const cards=el('div',{class:'partner-grid'});content.append(cards);
    for(const ally of view.allies){
     const row=el('article',{class:'partner-card'}),select=el('select',{'aria-label':ally.name+'工作'});
     select.append(el('option',{value:'',text:'休息'}));for(const [value,text]of Object.entries(DUTIES))select.append(el('option',{value,text}));select.value=ally.onDuty?ally.assignedDuty||ally.defaultDuty:'';
     const image=app.manifest.characters[ally.appearanceId]?.portrait;if(image)row.append(el('img',{src:image,alt:ally.name}));
     const detail=el('div',{},[el('h3',{text:ally.name}),el('p',{text:ally.onDuty?'当班 · '+DUTIES[ally.assignedDuty||ally.defaultDuty]:'休息中'}),el('p',{class:'small',text:`个人效果 ${Math.round(ally.rate*100)}% · 第 ${ally.recruitedAtDay??'—'} 天加入`}),select]);row.append(detail);cards.append(row);
     select.onchange=async()=>{select.disabled=true;const r=await ctx.submit({requestId:newRequestId('ally-duty'),type:'allies.assign',payload:{allyId:ally.allyId,dutyId:select.value||null}});if(disposed)return;if(!r.ok)app.toast('error','安排未完成',r.error.message);await ctx.handle.refresh();};
    }
   }else if(tab==='challenges'){
    if(!progress.ok){content.append(el('p',{text:progress.error.message}));return;}
    const p=progress.data;content.append(el('p',{text:`已通过 ${p.clearedStagesCount}/${p.totalStages} 场 · 高手间隔 2 天。延期不推进挑战，胜利后至少隔两天才会迎来下一位。`}),el('p',{class:'small',text:'落败后可立即再战并重新选将，也可约明天。同一天的落败延期赠包只发一次；赠包不解锁供货。'}));
    for(const stage of p.schedule||[])content.append(el('div',{class:'partner-stage'},[el('strong',{text:stage.displayName+' · '+stage.productName}),el('span',{text:stage.status==='cleared'?'已成为伙伴':stage.stageId===p.activeStageId?`当前挑战 · 第 ${stage.dueDay} 天起`:`预计第 ${stage.dueDay} 天起`})]));
   }else{
    const f=future.ok?future.data:null,d=f?.debt;content.append(el('h3',{text:'第 7 天：账务来访'}),el('p',{text:d?`当前欠款 ${d.outstanding} 币 · 牌局获胜可减免 ${d.potentialReduction} 币。`:'账务资料暂不可用。'}),el('p',{text:d?.status==='resolved'?'已完成首次账务会谈。':`账务专员第 ${d?.nextVisitDay??7} 天起到店，可接战或约次日。没有欠款时可直接确认账目。`}));
    content.append(el('h3',{text:'后续开发方向'}),el('p',{text:(f?.outdoor.status==='unlocked-planned'?'店外探索资格已获得，':'店外探索资格待解锁，')+'户外地图尚未开放。'}),el('p',{text:'炒卡交易与卡片工艺系统正在规划。工艺稀缺性将与武将强度独立，现有卡牌均按普通工艺保留。'}));
   }
  }
  paint();
 }});
}
