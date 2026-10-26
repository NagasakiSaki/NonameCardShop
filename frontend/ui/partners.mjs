import {el,newRequestId} from './components.mjs';

const DUTIES={attraction:'招呼顾客',checkout:'协助收银',wholesale:'联系供货'};
export function openAllies(app,options={}){
 const existing=app.windows.stack.find(w=>w.id==='allies-v7');if(existing){existing.handle.choosePartnerTab?.(options.tab||'partners');return app.windows.open({id:'allies-v7'});}
 let tab=options.tab||'partners';
 return app.windows.open({id:'allies-v7',title:'高手伙伴与挑战',pauseReason:'查看伙伴与挑战',width:'window--wide',render:async ctx=>{
  let disposed=false;ctx.onCleanup(()=>{disposed=true;});
  const [result,progress,future]=await Promise.all([ctx.query('allies.list'),ctx.query('progression.status'),ctx.query('longTerm.status')]);if(disposed)return;
  if(!result.ok){ctx.body.append(el('p',{text:result.error.message}));return;}
  const view=result.data,nav=el('div',{class:'v7-actions'}),content=el('div');
  ctx.body.append(nav,content);
  function paint(){
   nav.replaceChildren();content.replaceChildren();
   for(const [id,label]of [['partners','伙伴排班'],['challenges','高手来访'],['future','经营目标与借款']])nav.append(el('button',{class:'btn',text:label,'aria-pressed':tab===id,onclick:()=>{tab=id;paint();}}));
   if(tab==='partners'){
    content.append(el('p',{text:`当班 ${view.slots.used}/${view.slots.max} · 引客 +${Math.round(view.effects.attractionRate*100)}% · 收银用时 −${Math.round(view.effects.checkoutReductionRate*100)}% · 进货优惠 ${Math.round(view.effects.wholesaleDiscountRate*100)}%`}),el('p',{class:'small',text:'伙伴不收工资。每人选择一项工作；合计上限：引客 30%、收银减时 40%、进货优惠 15%。休息中的伙伴仍保留在名册。'}));
    if(!view.allies.length)content.append(el('p',{text:'第一位高手第 2 天到访。击败当前高手后，下一位次日来访；未通过就顺延。'}));
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
    const p=progress.data;content.append(el('p',{text:`已通过 ${p.clearedStagesCount}/${p.totalStages} 场 · 每天最多推进一位高手。当前高手通关次日，下一位才会来访。`}),el('p',{class:'small',text:'落败后可立即再战并重新选将，也可约明天。同一天的落败延期赠包只发一次；赠包不解锁供货。'}));
    const next=p.schedule?.find(s=>s.status!=='cleared');for(const stage of p.schedule||[])content.append(el('div',{class:'partner-stage'},[el('strong',{text:stage.displayName+' · '+stage.productName}),el('span',{text:stage.status==='cleared'?'已成为伙伴':stage===next?`当前挑战 · 第 ${stage.dueDay} 天起`:'前一位通关后的次日来访'})]));
   }else{
    const f=future.ok?future.data:null,d=f?.debt,l=f?.loan,g=l?.currentGoal;content.append(el('h3',{text:'海玲与开店借款'}),el('p',{text:l?`总借款 ${l.principal} · 已还 ${l.paid} · 牌局抵扣 ${l.relieved} · 尚欠 ${l.outstanding} 币`:'借款资料暂不可用。'}),el('p',{class:'small',text:'剧情借款与进货欠款分账，营业收入不会自动扣走。每期可赢牌抵扣一次，剩余部分用经营收入还；延期不会重置进度。'}));
    if(g){
     content.append(el('h3',{text:g.title+(g.overdue?' · 已延期':'')}),el('p',{text:`第 ${g.dueDay} 天目标 ${g.amount} · 本期已还 ${g.paid} + 抵扣 ${g.relieved} · 还差 ${g.remaining} 币`}),el('p',{class:'small',text:g.remaining?`本期牌局可抵扣 ${d.potentialReduction} 币。先完成开局对话后即可提前分次还款；达到目标仍需在约定日期与海玲核对。`:`本期还款已备齐，请在第 ${g.dueDay} 天起与海玲核对。`}));
     if(g.remaining){const input=el('input',{class:'loan-payment-field',type:'number',min:1,max:Math.min(g.remaining,app.snapshot().wallet.available),value:Math.min(g.remaining,app.snapshot().wallet.available),'aria-label':'本次还款金额'}),message=el('p',{role:'status'}),pay=el('button',{class:'btn',text:'支付本次还款',disabled:l.intro.status!=='acknowledged'||app.snapshot().clock.phase==='closed'||app.snapshot().wallet.available<1,onclick:async()=>{pay.disabled=true;const request=app.pendingLoanRepayment??={requestId:newRequestId('loan-pay'),type:'debt.repay',payload:{milestoneId:g.id,amount:Number(input.value),proof:{worldId:app.snapshot().worldId,branchId:app.snapshot().branchId}}};const r=await ctx.submit(request);if(r.ok||r.error?.code!=='RESULT_UNKNOWN')app.pendingLoanRepayment=null;if(disposed)return;if(r.ok){await ctx.handle.refresh();}else{message.textContent=r.error.message;pay.textContent=r.error.code==='RESULT_UNKNOWN'?'核对上次还款':'支付本次还款';pay.disabled=false;}}});content.append(el('div',{class:'v7-actions'},[input,pay]),message);}
    }
    for(const m of l?.milestones||[])content.append(el('div',{class:'partner-stage'},[el('strong',{text:m.title}),el('span',{text:`第 ${m.dueDay} 天 · ${m.amount} 币 · ${m.status==='completed'?'已完成':m.id===g?.id?'当前阶段':'后续阶段'}`})]));
    content.append(el('h3',{text:'后续开发方向'}),el('p',{text:(f?.outdoor.status==='unlocked-planned'?'店外探索资格已获得，':'店外探索资格待解锁，')+'户外地图尚未开放。'}),el('p',{text:'炒卡交易与卡片工艺系统正在规划。工艺稀缺性将与武将强度独立，现有卡牌均按普通工艺保留。'}));
   }
  }
  ctx.handle.choosePartnerTab=id=>{tab=id;paint();};paint();
 }});
}
