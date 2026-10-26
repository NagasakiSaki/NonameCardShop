import {RATED_FORMATS} from './strength-modes.mjs';
import {clone,page,sum} from './common.mjs';
import {cardSummary} from './catalog.mjs';
import {owned,free,referencePrice} from './trading.mjs';
import {managementEffects,shelfUsed} from './management.mjs';
import {trashItems} from './trash.mjs';
import {productEnabled} from './distribution.mjs';

export function inventoryView(w,catalog,input={}){
  let items=(input.location==='trash'?trashItems(w):owned(w)).filter(i=>i.kind==='card'&&(input.location?i.location===input.location:i.location!=='trash'));
  const groups=new Map();
  for(const item of items){
    const key=`${item.cardKey}|${item.printVersion}|${item.printedRarity}|${item.location}`;
    const card=catalog.byKey.get(item.cardKey);
    if(!groups.has(key))groups.set(key,{...cardSummary(card),referencePrice:{amount:referencePrice(w,catalog,item.cardKey)},inventoryRef:item.inventoryRef,inventoryRefs:[],availableRefs:[],printedRarity:item.printedRarity,printVersion:item.printVersion,location:item.location,owned:0,available:0,protected:0,locked:0,listed:0});
    const row=groups.get(key);row.inventoryRefs.push(item.inventoryRef);row.owned++;if(item.location==='collection'&&free(item)){row.available++;row.availableRefs.push(item.inventoryRef);}row.protected+=item.protected?1:0;row.locked+=item.lock?1:0;row.listed+=item.location==='market'?1:0;
  }
  let rows=[...groups.values()].filter(i=>(!input.search||`${i.name} ${i.generalId}`.includes(input.search))&&(!input.rarity||i.printedRarity===input.rarity)&&(!input.filter||input.filter==='all'||input.filter==='duplicate'&&i.owned>1||input.filter==='protected'&&i.protected>0||input.filter==='listed'&&i.listed>0));
  rows.sort(input.sort==='name'?(a,b)=>a.name.localeCompare(b.name,'zh'):input.sort==='owned-desc'?(a,b)=>b.owned-a.owned:input.sort==='score-asc'?(a,b)=>a.globalScore-b.globalScore:(a,b)=>b.globalScore-a.globalScore);
  return page(rows,input);
}
export function cardDetailView(w,catalog,card,stats){
  const items=owned(w).filter(i=>i.kind==='card'&&i.cardKey===card.cardKey&&i.location!=='trash'),available=items.filter(i=>i.location==='collection'&&free(i));
  const holdings={owned:items.length,available:available.length,protected:items.filter(i=>i.protected).length,locked:items.filter(i=>i.lock).length,listed:items.filter(i=>i.location==='market').length};
  const printings=[...new Set(items.map(i=>i.printedRarity))];
  return {...cardSummary(card),title:card.title,faction:card.group,pack:card.pack,printedRarity:printings.length===1?printings[0]:printings.length?'多印刷版':'未持有',printings,skills:clone(card.skills),power:clone(card.power),holdings,
    copies:items.map(i=>({inventoryRef:i.inventoryRef,printedRarity:i.printedRarity,printVersion:i.printVersion,location:i.location,protected:i.protected,locked:!!i.lock,available:i.location==='collection'&&free(i)})),
    price:referencePrice(w,catalog,card.cardKey),referencePrice:{amount:referencePrice(w,catalog,card.cardKey)},circulation:w.circulation[card.cardKey]||null,
    marketEligibility:{eligible:available.length>0,reasons:available.length?[]:[{code:'NO_AVAILABLE_COPY',message:'没有可出售的未锁定收藏副本。'}]},
    combatEligibility:{eligible:available.length>0,reasons:available.length?[]:[{code:'NO_AVAILABLE_COPY',message:'没有可参赛的未锁定收藏副本。'}]},
    stats:Object.fromEntries([...stats.map(s=>[s.mode,{...s,sessions:s.games}]),['sampleSufficient',stats.some(s=>s.games>=20)],['note','三模式分别记录整场队伍战绩；仅计实际出场武将。含 NPC 模拟对局，模拟场次单独标记。']]),skillSourceAvailable:true};
}
export function ledgerView(w,catalog,report){
  const daily=report||w.daily,day=report?.day||w.clock.day;
  const sealedSales=daily.sealedSales??sum(w.log.filter(e=>e.day===day&&e.type==='packSaleCompleted').map(e=>e.amount));
  const secondarySales=(daily.goods||0)-sealedSales,wages=daily.wages||0;
  return {day,...clone(daily),wallet:clone(report?.walletAtClose??w.wallet),walletAsOf:report?(report.walletAtClose?'day-close':'current-fallback'):'current',valuationAsOf:report?(report.unsoldValuationAtClose!==undefined?'day-close':'current-fallback'):'current',revenue:{sealedSales,secondarySales,serviceIncome:daily.service||0,total:(daily.goods||0)+(daily.service||0)},
    cost:{procurement:daily.purchases||0,wages,rent:Math.max(0,(daily.operating||0)-wages),tableFees:0,costOfGoods:daily.cogs||0,investment:daily.investment||0},
    combat:{net:daily.matchNet||0,stakeOut:Math.max(0,daily.matchNet||0),stakeIn:Math.max(0,-(daily.matchNet||0)),rake:daily.rake||0},escrow:{held:w.wallet.escrowLiability},
    netProfit:(daily.goods||0)+(daily.service||0)-(daily.cogs||0)-(daily.operating||0),
    unsoldValuation:report?.unsoldValuationAtClose??sum(owned(w).filter(i=>i.location!=='trash').map(i=>i.kind==='card'?referencePrice(w,catalog,i.cardKey):i.retailPrice||i.cost)),
    note:'采购与设施购置是现金流；利润扣已售商品成本和日结运营费，未售库存估值不计收入。'};
}
export function retailView(w){
  const groups=new Map(),e=managementEffects(w);
  for(const item of owned(w).filter(i=>['pack','box'].includes(i.kind)&&['stock','retail'].includes(i.location)&&productEnabled(w.rules,i.productId))){
    const key=`${item.productId}|${item.productVersion}|${item.kind}`;
    if(!groups.has(key))groups.set(key,{shelfId:key,productId:item.productId,label:w.products.find(p=>p.productId===item.productId)?.name||item.productId,productVersion:item.productVersion,kind:item.kind==='box'?'sealed-box':'sealed-pack',stock:0,warehouse:0,capacity:e.shelfCapacity,unitAmount:item.retailPrice,inventoryRefs:[],stockRefs:[]});
    const row=groups.get(key);if(item.location==='retail'){if(row.stock===0)row.unitAmount=item.retailPrice;row.stock++;if(free(item))row.inventoryRefs.push(item.inventoryRef);}else if(free(item)){row.warehouse++;row.stockRefs.push(item.inventoryRef);}
  }
  return {shelves:[...groups.values()],capacity:e.shelfCapacity,used:shelfUsed(w),note:`全店共 ${e.shelfCapacity} 商品位，已用 ${shelfUsed(w)}；每盒占 ${e.boxShelfUnits} 位。不同实物可有不同标价，当前显示首件标价。`};
}
export function marketView(w,catalog,p){
  const holdings=new Map();
  for(const item of owned(w).filter(i=>i.kind==='card'&&i.location!=='trash')){
    if(!holdings.has(item.cardKey))holdings.set(item.cardKey,{owned:0,available:0,listed:0,protected:0,locked:0});
    const h=holdings.get(item.cardKey);h.owned++;h.available+=item.location==='collection'&&free(item)?1:0;h.listed+=item.location==='market'?1:0;h.protected+=item.protected?1:0;h.locked+=item.lock?1:0;
  }
  const matches=(key,printed)=>{const c=catalog.byKey.get(key);return (!p.search||c.name.includes(p.search))&&(!p.rarity||(printed||c.currentRarity)===p.rarity);};
  const fields=key=>{const c=catalog.byKey.get(key),sessions=sum(RATED_FORMATS.map(mode=>{const s=w.stats[`${key}|${mode}`];return s?s.wins+s.losses+s.draws:0;}));return {...cardSummary(c),holdings:clone(holdings.get(key)||{owned:0,available:0,listed:0,protected:0,locked:0}),rarity:c.currentRarity,referencePrice:referencePrice(w,catalog,key),priceBreakdown:{globalScore:c.globalScore,sessions,note:'参考行情按日更新；实际成交以挂单报价为准。'},priceComponents:{powerBase:c.issuanceValue,current:referencePrice(w,catalog,key),note:'参考行情按日更新；实际成交以挂单报价为准。'}};};
  if(p.tab==='history')return {...page(w.log.filter(e=>e.type==='secondaryTradeCompleted'&&matches(e.cardKey)).reverse().map(e=>({...fields(e.cardKey),...clone(e),at:e.minute,quantity:1,unitAmount:e.amount,direction:e.buyerId==='player'?'buy':'sell'})),p),note:'当前存档保留的最近真实成交记录。'};
  if(p.tab==='bids')return page((w.management?.requests||[]).filter(r=>r.kind==='purchase'&&['offered','accepted'].includes(r.status)&&matches(r.cardKey)).map(r=>({...fields(r.cardKey),...clone(r),bidId:r.orderId,buyer:w.npcs.find(n=>n.actorId===r.actorId)?.name,unitAmount:r.amount})),p);
  return page(w.listings.filter(l=>(p.status?l.status===p.status:l.status==='active')&&(!p.ownerId||l.ownerId===p.ownerId)&&(!p.tab||p.tab!=='mine'||l.ownerId==='player')&&(!p.tab||p.tab!=='buy'||l.ownerId!=='player')&&matches(l.cardKey,w.items[l.inventoryRef]?.printedRarity)).map(l=>({...fields(l.cardKey),...clone(l),quantity:1,rarity:w.items[l.inventoryRef]?.printedRarity,sellerType:l.ownerId==='player'?'shop':'npc',sellerName:l.ownerId==='player'?'本店':w.npcs.find(n=>n.actorId===l.ownerId)?.name})),p);
}
export function archiveMeta(a){const {world,...meta}=a;return {...clone(meta),saveId:a.id,archiveId:a.id,branch:a.branchId,source:['start','close'].includes(a.slot)?'auto':'manual',status:'readable'};}
export function dayArchiveViews(archives,branchId,lineage=[]){
  const byDay=new Map();
  const branches=[branchId,...lineage],rank=a=>{const index=branches.indexOf(a.branchId);return index<0?Number.MAX_SAFE_INTEGER:index;};
  for(const a of archives.filter(a=>a.slot==='start'&&a.minute===480).sort((a,b)=>rank(a)-rank(b)||(b.createdAt-a.createdAt))){if(!byDay.has(a.day))byDay.set(a.day,{...archiveMeta(a),source:'day-start',restoresDayStart:true});}
  return [...byDay.values()].sort((a,b)=>b.day-a.day);
}

/** Public sealed inventory excludes manufactured packet/card contents. Counts and refs are authoritative. */
export function sealedInventoryView(w){
  const groups=new Map();
  for(const item of owned(w).filter(i=>['pack','box'].includes(i.kind)&&['stock','retail'].includes(i.location))){
    const groupId=JSON.stringify([item.productId,item.productVersion,item.kind]);
    if(!groups.has(groupId))groups.set(groupId,{groupId,productId:item.productId,productVersion:item.productVersion,kind:item.kind,name:w.products.find(p=>p.productId===item.productId)?.name||item.productId,owned:0,warehouse:0,available:0,onShelf:0,protected:0,locked:0,inventoryRefs:[],retailRefs:[],spec:clone(item.spec||{}),suggestedRetail:item.suggestedRetail??null,retired:!productEnabled(w.rules,item.productId)});
    const row=groups.get(groupId);row.owned++;row.protected+=item.protected?1:0;row.locked+=item.lock?1:0;
    if(item.location==='retail'){row.onShelf++;if(free(item))row.retailRefs.push(item.inventoryRef);}
    else {row.warehouse++;if(free(item)){row.available++;row.inventoryRefs.push(item.inventoryRef);}}
  }
  return {items:[...groups.values()],total:groups.size};
}
