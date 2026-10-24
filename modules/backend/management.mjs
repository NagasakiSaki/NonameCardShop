import {clone,need,integer,serial,debit,credit,random,sum} from './common.mjs';
import {owned,free,referencePrice,income,enterCirculation} from './trading.mjs';
import {note} from './world.mjs';
import {productEnabled} from './distribution.mjs';
import {onSite} from './visits.mjs';

export function validateManagement(c){
  need(c?.version===1&&Array.isArray(c.upgrades)&&Array.isArray(c.regulars),'INVALID_CONFIG','经营扩展配置格式不正确。');
  for(const key of ['baseShelfCapacity','boxShelfUnits','restockIntervalMinutes','restockTargetPerProduct','warehouseReservePerProduct','baseConcurrentCustomers','orderDurationDays','maxRelationship','dialogueRelationship','completionRelationship'])integer(c[key],0,10000);
  need(c.baseShelfCapacity>0&&c.boxShelfUnits>0&&c.restockIntervalMinutes>0&&c.orderDurationDays>0,'INVALID_CONFIG','容量与周期必须大于零。');
  need(Number.isFinite(c.baseCheckoutSeconds)&&c.baseCheckoutSeconds>0&&Number.isFinite(c.cashierCheckoutSeconds)&&c.cashierCheckoutSeconds>0,'INVALID_CONFIG','结账等待时间不正确。');
  for(const list of [c.upgrades,c.regulars])need(new Set(list.map(x=>x.id)).size===list.length&&list.every(x=>/^[a-z][a-z0-9_-]*$/.test(x.id)&&!['constructor','prototype'].includes(x.id)),'INVALID_CONFIG','内容 ID 不合法或重复。');
  for(const u of c.upgrades){need(['shelf','showcase','table','cashier','stocker'].includes(u.effect)&&Array.isArray(u.costs)&&u.costs.length>=1&&u.costs.length<=10,'INVALID_CONFIG','设施效果或等级不合法。');u.costs.forEach(n=>integer(n,1));integer(u.minDay,1,365);integer(u.dailyCost,0);need(Number.isFinite(u.amount)&&u.amount>=0&&u.amount<=100,'INVALID_CONFIG','设施效果数值不合法。');}
  for(const r of c.regulars){integer(r.initialWallet,1);need(Array.isArray(r.dialogue)&&r.dialogue.length>0&&r.dialogue.every(t=>typeof t==='string')&&Number.isFinite(r.orderRate)&&r.orderRate>0&&Number.isFinite(r.offerRate)&&r.offerRate>0,'INVALID_CONFIG','街坊预算、报价或台词不正确。');}
  return c;
}
export function initialiseManagement(w,config){
  if(!w.management&&config){validateManagement(config);w.management={version:1,config:clone(config),levels:{},onDuty:{},relationships:{},talkedDays:{},requests:[],generatedDays:{},nextRestockAt:w.clock.day*1440+w.clock.minute+config.restockIntervalMinutes,restocked:0};}
  if(w.management)validateManagement(w.management.config);
}
export function configureManagement(w,config){
  validateManagement(config);const m=w.management;need(m,'FEATURE_UNAVAILABLE','经营扩展尚未加载。');
  need(m.requests.every(r=>!['offered','accepted'].includes(r.status)||config.regulars.some(n=>n.id===r.personId)),'ORDER_ACTIVE','不能删除有未结订单的街坊。');
  need(m.config.upgrades.every(u=>!(m.levels[u.id]||0)||config.upgrades.some(v=>v.id===u.id&&v.costs.length>=m.levels[u.id]&&v.dailyCost===u.dailyCost&&v.effect===u.effect)),'INVALID_CONFIG','不能删除已购设施或改写员工工资合同。');
  m.config=clone(config);ensureRegulars(w);note(w,'managementConfigChanged');return {note:'参数已应用，已报价订单金额与到期日保持不变。'};
}
export function managementEffects(w){
  const m=w.management,c=m?.config;
  const level=effect=>c?sum(c.upgrades.filter(u=>u.effect===effect).map(u=>(m.levels[u.id]||0)*(u.dailyCost&&m.onDuty[u.id]===false?0:u.amount))):0;
  return {shelfCapacity:Math.floor((c?.baseShelfCapacity??36)+level('shelf')),boxShelfUnits:c?.boxShelfUnits??4,tableFee:Math.round(w.rules.tableFee+level('table')),
    checkoutSeconds:level('cashier')?c.cashierCheckoutSeconds:c?.baseCheckoutSeconds??1,concurrentCustomers:Math.floor((c?.baseConcurrentCustomers??3)+level('cashier')),
    newCustomerWalletMultiplier:1+level('showcase'),stocker:level('stocker')>0,wages:c?sum(c.upgrades.map(u=>(m.levels[u.id]||0)*u.dailyCost)):0};
}
export function shelfUsed(w){const e=managementEffects(w);return sum(owned(w).filter(i=>i.location==='retail').map(i=>i.kind==='box'?e.boxShelfUnits:1));}
export function upgradesView(w){const m=w.management;if(!m)return {items:[],available:false};return {available:true,capacity:managementEffects(w),items:m.config.upgrades.map(u=>{const level=m.levels[u.id]||0;return {upgradeId:u.id,name:u.name,description:u.description,level,maxLevel:u.costs.length,nextCost:u.costs[level]??0,dailyCost:u.dailyCost,effect:u.description,unlocked:w.clock.day>=u.minDay&&level<u.costs.length,unlockHint:level>=u.costs.length?'已升满':`第 ${u.minDay} 天解锁`};})};}
export function purchaseUpgrade(w,upgradeId){
  const m=w.management,u=m?.config.upgrades.find(u=>u.id===upgradeId);need(u,'NOT_FOUND','设施或员工不存在。');const level=m.levels[u.id]||0;
  need(w.clock.phase!=='closed'&&w.clock.day>=u.minDay&&level<u.costs.length,'NOT_READY','未到解锁日期、已经升满或今天已结算。');
  debit(w.wallet,u.costs[level]);m.levels[u.id]=level+1;if(u.dailyCost)m.onDuty[u.id]=true;
  w.daily.investment=(w.daily.investment||0)+u.costs[level];note(w,'upgradePurchased',{upgradeId:u.id,level:level+1,amount:u.costs[level]});return {upgradeId:u.id,level:level+1,spent:u.costs[level]};
}
export function ensureRegulars(w){
  if(!w.management)return;
  for(const r of w.management.config.regulars){const actorId=`regular:${r.id}`;if(w.npcs.some(n=>n.actorId===actorId))continue;w.npcs.push({actorId,regularId:r.id,name:r.name,appearanceId:r.appearanceId,wallet:{available:r.initialWallet},roomId:'store',x:240,y:272,direction:'down',moving:false,activity:'away',presence:'offsite'});note(w,'regularJoined',{actorId,externalFunds:r.initialWallet});}
}
function refundRequest(w,request){
  if(request.fundsHeld){const npc=w.npcs.find(n=>n.actorId===request.actorId);credit(npc.wallet,request.fundsHeld);w.wallet.escrowLiability-=request.fundsHeld;request.fundsHeld=0;}
  if(request.inventoryRef&&w.items[request.inventoryRef]?.lock===request.orderId)w.items[request.inventoryRef].lock=null;
}
export function tickManagement(w,catalog){
  const m=w.management;if(!m)return;ensureRegulars(w);
  for(const request of m.requests)if(['offered','accepted'].includes(request.status)&&w.clock.day>request.expiresDay){refundRequest(w,request);request.status='expired';note(w,'neighborOrderExpired',{orderId:request.orderId});}
  if(w.clock.phase!=='open')return;
  for(const regular of m.config.regulars){
    const npc=w.npcs.find(n=>n.regularId===regular.id),generationKey=`${w.clock.day}:${regular.id}`;
    if(m.generatedDays[generationKey]||m.requests.some(o=>o.personId===regular.id&&['offered','accepted'].includes(o.status)))continue;
    const options=catalog.cards.filter(c=>w.circulation[c.cardKey]&&!owned(w,npc.actorId).some(i=>i.cardKey===c.cardKey));
    const preferred=options.filter(c=>c.group===regular.preferredGroup),pool=preferred.length?preferred:options;
    if(pool.length){const card=pool[Math.floor(random(w)*pool.length)],amount=Math.max(1,Math.round(referencePrice(w,catalog,card.cardKey)*regular.orderRate));if(amount<=npc.wallet.available){m.requests.push({orderId:serial(w,'neighbor-order'),kind:'purchase',personId:regular.id,actorId:npc.actorId,cardKey:card.cardKey,quantity:1,amount,status:'offered',day:w.clock.day,expiresDay:w.clock.day+m.config.orderDurationDays-1,fundsHeld:0});m.generatedDays[generationKey]=true;continue;}}
    const card=owned(w,npc.actorId).find(i=>i.kind==='card'&&free(i));
    if(card){const orderId=serial(w,'neighbor-offer');card.lock=orderId;m.requests.push({orderId,kind:'offer',personId:regular.id,actorId:npc.actorId,inventoryRef:card.inventoryRef,cardKey:card.cardKey,quantity:1,amount:Math.max(1,Math.round(referencePrice(w,catalog,card.cardKey)*regular.offerRate)),status:'offered',day:w.clock.day,expiresDay:w.clock.day+m.config.orderDurationDays-1,fundsHeld:0});enterCirculation(w,card.cardKey,'neighborMarketOffer',orderId);m.generatedDays[generationKey]=true;}
  }
  const e=managementEffects(w),stamp=w.clock.day*1440+w.clock.minute;
  if(e.stocker&&stamp>=m.nextRestockAt){
    m.nextRestockAt=stamp+m.config.restockIntervalMinutes;
    for(const productId of new Set(owned(w).filter(i=>i.kind==='pack'&&i.location==='stock'&&productEnabled(w.rules,i.productId)).map(i=>i.productId))){
      const stock=owned(w).filter(i=>i.kind==='pack'&&i.productId===productId&&i.location==='stock'&&free(i));let target=m.config.restockTargetPerProduct-owned(w).filter(i=>i.kind==='pack'&&i.productId===productId&&i.location==='retail').length;
      for(const item of stock.slice(m.config.warehouseReservePerProduct)){if(target<=0||shelfUsed(w)>=e.shelfCapacity)break;item.location='retail';target--;m.restocked++;note(w,'employeeRestocked',{inventoryRef:item.inventoryRef});}
    }
  }
}
export function peopleView(w,catalog){
  const m=w.management;
  const customers=w.npcs.filter(onSite).map(({wallet,trip,...npc})=>({...clone(npc),budget:wallet.available,ownedCards:owned(w,npc.actorId).filter(i=>i.kind==='card').length}));
  if(!m)return {items:[],neighbors:[],customers};
  return {items:m.config.upgrades.filter(u=>u.dailyCost>0).map(u=>({personId:`staff:${u.id}`,name:u.name,role:u.id==='cashier'?'收银':'补货',wage:u.dailyCost,hired:(m.levels[u.id]||0)>0,mood:m.onDuty[u.id]===false?'休息':'当班',note:u.description})),neighbors:m.config.regulars.map(r=>{const relation=m.relationships[r.id]||0;const request=m.requests.find(o=>o.personId===r.id&&['offered','accepted'].includes(o.status));return {personId:r.id,name:r.name,relation,portrait:r.appearanceId,dialog:r.dialogue[Math.min(r.dialogue.length-1,Math.floor(relation/10))],pending:request?{...clone(request),cardName:catalog?.byKey.get(request.cardKey)?.name,offer:request.amount,note:`第 ${request.expiresDay} 天结束前有效；${request.status==='accepted'?'资金已托管':'尚未接单'}`} :null};}),customers};
}
export function neighborAct(w,catalog,p){
  const m=w.management;need(m,'FEATURE_UNAVAILABLE','街坊扩展尚未加载。');
  if(String(p.personId).startsWith('staff:')){const upgradeId=p.personId.slice(6);if(p.action==='hire')return purchaseUpgrade(w,upgradeId);need(p.action==='schedule'&&(m.levels[upgradeId]||0)>0,'INVALID_INPUT','员工操作不正确。');m.onDuty[upgradeId]=typeof p.onDuty==='boolean'?p.onDuty:m.onDuty[upgradeId]===false;return {note:m.onDuty[upgradeId]?'已安排当班；工资在日结统一支付。':'已安排休息；当日合同工资照常结算。'};}
  const regular=m.config.regulars.find(r=>r.id===p.personId);need(regular,'NOT_FOUND','街坊不存在。');
  const relation=amount=>m.relationships[regular.id]=Math.min(m.config.maxRelationship,(m.relationships[regular.id]||0)+amount);
  if(p.action==='talk'){if(m.talkedDays[regular.id]!==w.clock.day){m.talkedDays[regular.id]=w.clock.day;relation(m.config.dialogueRelationship);}return {note:regular.dialogue[Math.min(regular.dialogue.length-1,Math.floor((m.relationships[regular.id]||0)/10))]};}
  const request=m.requests.find(o=>o.personId===regular.id&&(!p.orderId||o.orderId===p.orderId)&&['offered','accepted'].includes(o.status));need(request&&w.clock.day<=request.expiresDay,'NOT_FOUND','没有有效待办。');
  const npc=w.npcs.find(n=>n.actorId===request.actorId);
  if(p.action==='decline'){refundRequest(w,request);request.status='declined';return {note:'已取消；未消费的托管资金和实物锁定已退回。'};}
  if(p.action==='accept'){
    need(request.kind==='purchase'&&request.status==='offered','INVALID_STATE','该待办不能接单；收卡报价需明确使用 buy。');debit(npc.wallet,request.amount);request.fundsHeld=request.amount;w.wallet.escrowLiability+=request.amount;request.status='accepted';note(w,'neighborOrderAccepted',{orderId:request.orderId});return {orderId:request.orderId,note:'买家已预付托管，请在期限内到二级市场交付。'};
  }
  if(p.action==='deliver'){
    need(request.kind==='purchase'&&request.status==='accepted','INVALID_STATE','请先接受这笔预约。');const card=owned(w).find(i=>i.kind==='card'&&i.cardKey===request.cardKey&&i.location==='collection'&&free(i)&&(!p.inventoryRef||p.inventoryRef===i.inventoryRef));need(card,'OUT_OF_STOCK','没有符合要求的可售副本。');
    const cost=card.cost;card.ownerId=npc.actorId;card.cost=request.amount;w.wallet.escrowLiability-=request.fundsHeld;request.fundsHeld=0;income(w,request.amount);w.daily.goods+=request.amount;w.daily.cogs+=cost;w.lifetime.marketSales++;request.status='completed';relation(m.config.completionRelationship);enterCirculation(w,card.cardKey,'neighborMarketSale',request.orderId);note(w,'secondaryTradeCompleted',{orderId:request.orderId,cardKey:card.cardKey,buyerId:npc.actorId,amount:request.amount,source:'neighbor-order'});return {note:'已交卡收款，托管只结算一次。',amount:request.amount};
  }
  if(p.action==='buy'){
    need(request.kind==='offer'&&request.status==='offered','INVALID_STATE','这不是可购买的实物报价。');const card=w.items[request.inventoryRef];need(card?.ownerId===npc.actorId&&card.lock===request.orderId,'ITEM_LOCKED','收卡实物已变化。');debit(w.wallet,request.amount);credit(npc.wallet,request.amount);card.ownerId='player';card.location='collection';card.lock=null;card.cost=request.amount;request.status='completed';w.daily.purchases+=request.amount;relation(m.config.completionRelationship);note(w,'secondaryTradeCompleted',{orderId:request.orderId,cardKey:card.cardKey,buyerId:'player',amount:request.amount,source:'neighbor-offer'});return {note:'实物已放入收藏。',inventoryRef:card.inventoryRef,amount:request.amount};
  }
  need(false,'INVALID_INPUT','不支持的街坊操作。');
}
