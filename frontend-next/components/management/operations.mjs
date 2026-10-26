import {el,injectStyles} from './shared.mjs';
import {BASE_CSS} from './styles.mjs';

export function mount({root,view,actions,assets={}}){
 injectStyles('base',BASE_CSS);injectStyles('operations',`
 .pc-ops .pc-op-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,245px),1fr));gap:12px}
 .pc-ops .pc-op-actions{display:flex;flex-wrap:wrap;gap:8px;margin-top:10px}
 .pc-ops button{min-height:40px}.pc-ops img{width:90px;height:145px;object-fit:contain;float:right;margin-left:10px}
 .pc-ops p{overflow-wrap:anywhere}.pc-ops [aria-selected=true]{border-color:var(--pc-gold)}
 .pc-ops .pc-card h3{font-size:15px;line-height:1.35}
 `);
 root.classList.add('pc-root','pc-ops');let disposed=false,busy=false,tab='upgrades',message='',tileMessage={};
 const money=n=>n==null?'—':assets.money?.(n)??`${n} 游戏币`;
 const button=(label,fn,disabled=false)=>el('button',{class:'btn',text:label,disabled:busy||disabled,onclick:fn});
 async function act(name,payload){if(busy||disposed)return;busy=true;const key=payload&&payload.personId;message='正在提交…';if(key)tileMessage[key]='正在提交…';render();try{const r=await actions[name](payload);if(!disposed){message=r.ok?(r.data?.note||'操作已完成。'):(r.error?.message||'操作失败。');if(key)tileMessage[key]=message;}}catch(e){if(!disposed)message=e.message;if(key&&!disposed)tileMessage[key]=e.message;}finally{busy=false;if(!disposed)render();}}
 function render(){
  if(disposed)return;const v=view;root.replaceChildren();
  root.append(el('p',{text:`可用现金 ${money(v.snapshot.wallet.available)} · 设施和订单按真实状态结算。`}),el('div',{class:'pc-op-actions',role:'tablist'},[['upgrades','设施与升级'],['people','员工与熟客'],['orders','待办订单']].map(([id,label])=>button(label,()=>{tab=id;render();}))),el('p',{role:'status',text:message}));
  [...root.querySelectorAll('[role=tablist] button')].forEach((b,i)=>b.setAttribute('aria-selected',String(['upgrades','people','orders'][i]===tab)));
  const grid=el('div',{class:'pc-op-grid'});root.append(grid);
  const tile=(title,text,buttons=[],image)=>el('article',{class:'pc-card'},[image?el('img',{src:image,alt:title}):null,el('h3',{text:title}),...text.map(text=>el('p',{text})),el('div',{class:'pc-op-actions'},buttons)]);
  const station=()=>button('前往二级市场交付 / 收卡',()=>actions.goMarket());
  function neighbor(n){const p=n.pending,buttons=[button('交谈',()=>act('neighbor',{personId:n.personId,action:'talk'}))],text=[`关系 ${n.relation} · “${n.dialog}”`];
   if(p){const held=v.cards.filter(c=>c.cardKey===p.cardKey).reduce((s,c)=>s+c.available,0);text.push(`${p.kind==='offer'?'出售实物':'寻卡申请'}：${p.cardName||p.cardKey} ×${p.quantity}`,`金额 ${money(p.amount)} · 第 ${p.expiresDay} 天结束前有效`,p.status==='accepted'?'已接单，买家货款已托管。':'尚未接单。');
    if(p.kind==='offer')buttons.push(button('支付并收下',()=>act('neighbor',{personId:n.personId,orderId:p.orderId,action:'buy'}),!v.atMarket||v.snapshot.wallet.available<p.amount));
    if(p.kind==='purchase'&&p.status==='offered')buttons.push(button('接受寻卡申请',()=>act('neighbor',{personId:n.personId,orderId:p.orderId,action:'accept'})));
    if(p.kind==='purchase'&&p.status==='accepted'){text.push(`收藏中可交付 ${held} 张`);buttons.push(button('交付一张并收款',()=>act('neighbor',{personId:n.personId,orderId:p.orderId,action:'deliver'}),!v.atMarket||held<1));}
    buttons.push(button('拒绝 / 取消申请',()=>act('neighbor',{personId:n.personId,orderId:p.orderId,action:'decline'})));if(!v.atMarket)buttons.push(station());
   }else text.push('目前没有待处理申请。');
   if(tileMessage[n.personId])text.push(`操作反馈：${tileMessage[n.personId]}`);
   return tile(n.name,text,buttons,assets.portrait?.(n.portrait));
  }
  if(tab==='upgrades')for(const u of v.upgrades.items)grid.append(tile(`${u.name} · Lv ${u.level}/${u.maxLevel}`,[u.effect,u.currentBenefits?`当前：${u.currentBenefits}`:"",u.nextBenefits?`升级后：${u.nextBenefits}`:"",`下一档 ${u.level>=u.maxLevel?'已满级':money(u.nextCost)}`,u.unlockHint||'',u.dailyCost?`每级日薪 ${money(u.dailyCost)} · 当前每日 ${money(u.currentDailyCost)} · 升级后每日 ${money(u.nextDailyCost)}`:'无每日工资'],[button('购买下一档',()=>act('upgrade',{upgradeId:u.upgradeId}),!u.unlocked||v.snapshot.wallet.available<u.nextCost)]));
  if(tab==='people'){
   for(const s of v.people.items){const u=v.upgrades.items.find(u=>u.upgradeId===s.personId.replace('staff:',''));grid.append(tile(s.name,[`${s.role} · ${s.hired?s.mood:'未雇佣'}`,`每日合同工资 ${money(s.wage)}；休息日仍支付。`,s.note],[button(s.hired?(s.mood==='休息'?'安排当班':'安排休息'):'雇佣',()=>act('neighbor',{personId:s.personId,action:s.hired?'schedule':'hire',...(s.hired?{onDuty:s.mood==='休息'}:{})}),!s.hired&&(!u?.unlocked||v.snapshot.wallet.available<u.nextCost))]));}
   for(const n of v.people.neighbors)grid.append(neighbor(n));
  }
  if(tab==='orders'){
   for(const o of v.orders.items.filter(o=>o.unit==='card')){const n=v.people.neighbors.find(n=>n.pending?.orderId===o.orderId);if(n)grid.append(neighbor(n));}
   const supply=v.orders.items.filter(o=>o.unit!=='card');for(const o of supply)grid.append(tile(o.themeName,[`${o.unit==='box'?'整盒':'散包'} ×${o.quantity} · ${o.status==='arrived'?'已到货':o.status==='pending'?'运输中':o.status}`,`已付款 ${money(o.total)}`],[button('去采购柜台查看 / 签收',()=>actions.goSupplier())]));
   if(!v.orders.items.length)grid.append(el('p',{text:'没有待处理订单。'}));
  }
 }
 return {update(next){view=next;render();},setTab(next){tab=next==='neighbors'?'people':['upgrades','people','orders'].includes(next)?next:'upgrades';render();},dispose(){disposed=true;root.replaceChildren();}};
}
