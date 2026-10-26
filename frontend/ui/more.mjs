import {el,newRequestId} from './components.mjs';
const GROUPS={
 business:{title:'经营',items:[['supplier','进货','store.counter'],['warehouse','仓库'],['retail','零售货架','store.retail'],['checkout','收银记录','store.checkout'],['management','设施与员工'],['customers','顾客与牌桌']]},
 cards:{title:'卡牌',items:[['opening','拆包','store.opening'],['inventory','我的收藏'],['market','二级市场','store.secondaryMarket'],['trash','垃圾桶','store.trash']]},
 people:{title:'人物与挑战',items:[['allies','高手伙伴与挑战'],['story','街角故事'],['guide','开店指引与熟客']]},
 records:{title:'记录与设置',items:[['tasks','任务'],['report','营业日报'],['finance','收支流水'],['saves','存档管理'],['settings','设置'],['help','游戏手册']]}
};
export function openMore(app){return app.windows.open({id:'more',title:'店铺菜单',pauseReason:'店铺菜单',render:ctx=>{
 let group=null;
 function go(kind,anchor){ctx.handle.close();if(anchor){app.goToInteraction(anchor,kind==='retail'||kind==='checkout'?'supplier':kind,kind==='retail'?{purchaseTab:'retail'}:kind==='checkout'?{interaction:'store.checkout'}:{});}else app.openPanel(kind);}
 function paint(){
  ctx.body.replaceChildren();ctx.foot.replaceChildren();
  if(!group){
   const clock=app.snapshot().clock,row=el('div',{class:'surface-actions',style:{display:'flex',gap:'10px',flexWrap:'wrap'}});
   row.append(el('button',{class:'btn',text:clock.manualPaused?'继续时钟':'手动暂停',onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('menu-pause'),type:'clock.setManualPause',payload:{paused:!app.snapshot().clock.manualPaused}});if(r.ok){await app.refreshSnapshot();paint();}}}));
   for(const speed of [1,2,4])row.append(el('button',{class:'btn',text:speed+'倍速','aria-pressed':clock.speed===speed,onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('menu-speed'),type:'clock.setSpeed',payload:{speed}});if(r.ok){await app.refreshSnapshot();paint();}}}));
   ctx.body.append(el('p',{class:'small muted',text:'营业操作与店铺功能分类收在这里；打开菜单时游戏时间暂停。'}),row);
  }
  const list=el('div',{class:'surface-actions',style:{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'12px'}});
  if(!group)for(const [id,spec]of Object.entries(GROUPS))list.append(el('button',{class:'btn',text:spec.title,onclick:()=>{group=id;paint();}}));
  else for(const [kind,label,anchor]of GROUPS[group].items){if(kind==='story'&&!app.connection.capabilities?.narrative)continue;list.append(el('button',{class:'btn',text:label,onclick:()=>go(kind,anchor)}));}
  ctx.body.append(list);if(group)ctx.foot.append(el('button',{class:'btn',text:'返回分类',onclick:()=>{group=null;paint();}}));
 }
 paint();
}});}