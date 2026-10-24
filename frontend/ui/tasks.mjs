import {el,clear,stateView,errorView} from './components.mjs';
export async function openTasks(app){
 return app.windows.open({id:'tasks',title:'任务与自动奖励',subtitle:'每日任务每天重置；完成即到账，无需手动领取',pauseReason:'查看任务',render:async ctx=>{
  ctx.body.append(stateView({kind:'loading',title:'正在读取任务…'}));const r=await ctx.query('tasks.list');clear(ctx.body);
  if(!r.ok){ctx.body.append(errorView(r.error,()=>ctx.refresh()));return;}
  for(const scope of ['daily','starter']){
   const tasks=r.data.items.filter(t=>(t.scope||'starter')===scope);if(!tasks.length)continue;
   ctx.body.append(el('h3',{text:scope==='daily'?'每日营业任务':'一次性开店引导'}));
   for(const t of tasks){const goal=t.goal||1,done=t.completed??t.progress>=goal;
    ctx.body.append(el('div',{class:'note-card'},[
     el('p',{class:'note-card__title'},[t.title,el('span',{class:done?'badge badge--ok':'badge',text:t.claimed?'已自动到账':done?'完成':'进行中'})]),
     el('div',{class:'progress'},[el('div',{class:'progress__bar',style:{width:Math.min(100,Math.round(t.progress/goal*100))+'%'}})]),
     el('p',{class:'small',text:`进度 ${Math.min(t.progress,goal)} / ${goal} · 奖励 ${app.formatMoney(t.reward)}`}),
     el('p',{class:'small muted',text:t.hint||'完成后自动领取'}),
     el('button',{class:'btn btn--sm',text:'前往',onclick:()=>{ctx.handle.close();app.goToInteraction(t.target);}})
    ]));
   }
  }
  ctx.setFooter([el('button',{class:'btn btn--ghost',text:'关闭',onclick:()=>ctx.handle.close()})]);
 }});
}
