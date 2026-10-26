import {el,errorView} from './components.mjs';
export async function openFinance(app){
 return app.windows.open({id:'finance',title:'实时收支流水',subtitle:'现金增减、供应商欠款与任务奖励分开记；跨日记录保留',pauseReason:'查看收支流水',render:async ctx=>{
  const r=await ctx.query('ledger.live');if(!r.ok){ctx.body.append(errorView(r.error,()=>ctx.refresh()));return;}
  ctx.body.append(el('p',{class:'note-card',text:`当前现金 ${app.formatMoney(r.data.cash)} · 进货欠款 ${app.formatMoney(r.data.debt)} · 开店借款 ${app.formatMoney(r.data.campaignDebt||0)}`}));
  for(const e of r.data.items)ctx.body.append(el('div',{class:'note-card'},[
   el('p',{class:'note-card__title',text:`第 ${e.day} 天 ${Math.floor(e.minute/60).toString().padStart(2,'0')}:${Math.floor(e.minute%60).toString().padStart(2,'0')} · ${e.label}`}),
   el('strong',{style:{color:e.amount<0?'#ffac9e':'#a9efb4'},text:`现金 ${e.amount>=0?'+':''}${app.formatMoney(e.amount)}${e.debtDelta?' · 进货欠款 '+(e.debtDelta>0?'+':'')+app.formatMoney(e.debtDelta):''}${e.campaignDebtDelta?' · 开店借款 '+(e.campaignDebtDelta>0?'+':'')+app.formatMoney(e.campaignDebtDelta):''}`}),
   el('p',{class:'small muted',text:`${e.grossIncome?'奖励总额 '+app.formatMoney(e.grossIncome)+'；收入优先偿还欠款。 ':''}现金余额 ${app.formatMoney(e.balance)} · 进货欠款余额 ${app.formatMoney(e.debt)} · 开店借款余额 ${app.formatMoney(e.campaignDebt||0)}`})
  ]));
  if(!r.data.items.length)ctx.body.append(el('p',{text:'暂无收支记录。'}));
 }});
}
