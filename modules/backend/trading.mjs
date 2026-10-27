import {RATED_FORMATS} from './strength-modes.mjs';
import {printingMeta,physicalGroupKey} from './card-finishes.mjs';
import {marketEligible,MARKET_RARITIES} from './market-policy.mjs';
import {clone,need,integer,serial,sum,credit,debit,clamp,random,page} from './common.mjs';
import {openPacket,unsealBox,makeSealed} from './products.mjs';
import {note,enterCirculation} from './world.mjs';
export {enterCirculation} from './world.mjs';
export {receiveOrder} from './fulfillment.mjs';
import {trashItems,discardCard,customerBehavior,ensureCustomerTraits,canScavenge,unwantedCards,scavenge} from './trash.mjs';
import {pathfind,moveActor} from './navigation.mjs';
import {managementEffects} from './management.mjs';
import {productEnabled} from './distribution.mjs';
import {preferredPurchaseChannel} from './customer-demand.mjs';
import {customerAppearance} from './customer-identity.mjs';
import {onSite,arriveCustomer,departCustomer,lingerCustomer,customerTarget} from './visits.mjs';
import {isV7,customerBudget,customerClass,initialCustomerWallet} from './v7-policy.mjs';
import {FEEDBACK_REASONS} from './experience.mjs';

export const owned=(w,ownerId='player')=>Object.values(w.items).filter(i=>i.ownerId===ownerId);
export const free=i=>!i.lock&&!i.protected;
export function playerItem(w,ref){const item=w.items[ref];need(item?.ownerId==='player','OUT_OF_STOCK','未持有这件商品。');return item;}
export function wallet(w,ownerId){if(ownerId==='player')return w.wallet;const npc=w.npcs.find(n=>n.actorId===ownerId);need(npc,'NOT_FOUND','顾客不存在。');return npc.wallet;}
export function income(w,amount){const paid=Math.min(w.wallet.debt,amount);w.wallet.debt-=paid;credit(w.wallet,amount-paid);}
export function referencePrice(w,catalog,cardKey){
  if(w.prices[cardKey])return w.prices[cardKey];
  const c=catalog.byKey.get(cardKey);need(c,'NOT_FOUND','卡牌不存在。');
  return c.issuanceValue;
}
export function updatePrices(w,catalog){
  const supplies=new Map(),trades=new Map();
  for(const i of Object.values(w.items))if(i.location==='market')supplies.set(i.cardKey,(supplies.get(i.cardKey)||0)+1);
  for(const e of w.log)if(e.type==='secondaryTradeCompleted'&&e.day>=w.clock.day-3)trades.set(e.cardKey,(trades.get(e.cardKey)||0)+1);
  for(const c of catalog.cards){
    const formats=RATED_FORMATS;
    const modes=formats.map(mode=>{const s=w.stats[`${c.cardKey}|${mode}`]||{wins:0,losses:0,draws:0};const n=s.wins+s.losses+s.draws;return clamp(1+2*n/(n+40)*((s.wins+.5*s.draws+10)/(n+20)-.5),.7,1.4);});
    const supplied=supplies.get(c.cardKey)||0;
    const demand=1+Math.min(.15,(trades.get(c.cardKey)||0)/(10+supplied*5));
    const performance=modes.reduce((a,b)=>a+b,0)/formats.length;
    const target=Math.round(c.issuanceValue*performance*demand),previous=w.prices[c.cardKey]||c.issuanceValue;
    w.prices[c.cardKey]=Math.max(1,Math.round(clamp(target,previous*(1-w.rules.priceDailyLimit),previous*(1+w.rules.priceDailyLimit))));
  }
}
export function inventoryList(w,catalog,p={}){
  const rows=(p.location==='trash'?trashItems(w):owned(w)).filter(i=>(!p.location||i.location===p.location)&&(!p.kind||i.kind===p.kind)).map(i=>{
    const card=i.kind==='card'?catalog.byKey.get(i.cardKey):null;
    return {inventoryRef:i.inventoryRef,kind:i.kind,cardKey:i.cardKey,productId:i.productId,printVersion:i.printVersion||i.productVersion,printedRarity:i.printedRarity,...(i.kind==='card'?printingMeta(i):{}),
      name:card?.name||i.productId,imageUrl:card?.imageUrl,referencePrice:card?{amount:referencePrice(w,catalog,i.cardKey)}:undefined,globalScore:card?.globalScore,currentRarity:card?.currentRarity,location:i.location,owned:1,available:free(i)&&!['market','retail'].includes(i.location)?1:0,protected:i.protected?1:0,locked:i.lock?1:0,listed:i.location==='market'||i.location==='retail'?1:0,
      cost:i.cost,eligible:!!w.circulation[i.cardKey],discardedBy:i.trash?.discardedBy??(i.location==='trash'?i.ownerId:undefined),discardedByName:i.trash?.discardedBy==='player'?'店长':w.npcs.find(n=>n.actorId===i.trash?.discardedBy)?.name,discardedDay:i.trash?.day,disabledReasons:!free(i)?[{code:'ITEM_LOCKED',message:'该实物有收藏保护或正在交易/参赛。'}]:[]};
  }).filter(i=>(!p.search||`${i.name} ${i.cardKey}`.includes(p.search))&&(!p.rarity||i.printedRarity===p.rarity));
  return page(rows,p);
}
export function openingPreview(w,p){
  const refs=p.inventoryRefs?new Set(p.inventoryRefs):null;
  const items=owned(w).filter(i=>i.location==='stock'&&free(i)&&(refs||productEnabled(w.rules,i.productId))&&(!refs||refs.has(i.inventoryRef))&&(!p.productId||i.productId===p.productId)&&(i.kind==='pack'||p.includeBoxes&&i.kind==='box'));
  let remaining=p.quantity===undefined?Infinity:integer(p.quantity,1,10000);const plan=[];
  for(const item of items){if(remaining<=0)break;const packs=Math.min(remaining,item.kind==='box'?24:1);plan.push({inventoryRef:item.inventoryRef,packs});remaining-=packs;}
  const selected=plan.map(p=>w.items[p.inventoryRef]),packs=sum(plan.map(p=>p.packs));
  return {kind:'opening',refs:selected.map(i=>i.inventoryRef),plan,fingerprint:fingerprint(selected),packs,cards:packs*5,boxes:selected.filter(i=>i.kind==='box').length,excluded:owned(w).filter(i=>['pack','box'].includes(i.kind)&&i.location==='stock'&&!free(i)).length};
}
export function fingerprint(items){return JSON.stringify(items.map(i=>[i.inventoryRef,i.ownerId,i.location,i.protected,i.lock]));}
export function executeOpening(w,preview,catalog){
  const items=preview.refs.map(r=>playerItem(w,r));need(fingerprint(items)===preview.fingerprint,'PREVIEW_EXPIRED','库存已变化，请重新确认开包。');
  const results=[],seen=new Set(owned(w).filter(i=>i.kind==='card').map(i=>i.cardKey)),isNew=new Set();
  for(const item of items){const packets=item.kind==='box'?unsealBox(w,item):[item],take=preview.plan?.find(p=>p.inventoryRef===item.inventoryRef)?.packs??packets.length;for(const packet of packets.slice(0,take)){const cards=openPacket(w,packet);for(const card of cards){if(!seen.has(card.cardKey))isNew.add(card.inventoryRef);seen.add(card.cardKey);}results.push(...cards);w.lifetime.opened++;}}
  need(results.length===preview.cards,'INVALID_STATE','开包数量不一致。');note(w,'cardsOpened',{quantity:results.length,packs:preview.packs});
  const cards=results.map(({cost,lock,...c})=>c);
  const opening={packs:preview.packs,byRarity:Object.fromEntries(['N','R','SR','SSR'].map(r=>[r,results.filter(c=>c.printedRarity===r).length])),results:cards.map(c=>({...c,name:catalog?.byKey.get(c.cardKey)?.name,imageUrl:catalog?.byKey.get(c.cardKey)?.imageUrl,rarity:c.printedRarity,isNew:isNew.has(c.inventoryRef)}))};
  return {cards,packs:preview.packs,opening};
}
export function surplusPreview(w,catalog,p={}){
  const groups=new Map();
  for(const item of owned(w).filter(i=>i.kind==='card'&&!['trash','market'].includes(i.location)&&marketEligible(catalog,i))){const k=physicalGroupKey(item,p);if(!groups.has(k))groups.set(k,[]);groups.get(k).push(item);}
  const refs=[],rows=[];
  for(const cards of groups.values()){
    if(!marketEligible(catalog,cards[0]))continue;
    if(p.rarity&&cards[0].printedRarity!==p.rarity)continue;
    const fixed=cards.filter(i=>!free(i)),movable=cards.filter(free).sort((a,b)=>b.cost-a.cost||a.inventoryRef.localeCompare(b.inventoryRef));
    const selected=movable.slice(fixed.length?0:1);refs.push(...selected.map(i=>i.inventoryRef));
    rows.push({cardKey:cards[0].cardKey,owned:cards.length,retained:cards.length-selected.length,quantity:selected.length});
  }
  const items=refs.map(r=>w.items[r]);return {kind:'surplus',refs,rows,fingerprint:fingerprint(items),sourceFingerprint:fingerprint(owned(w).filter(i=>i.kind==='card'&&!['trash','market'].includes(i.location))),quantity:refs.length,keep:1,newListings:refs.length,alreadyListed:owned(w).filter(i=>i.location==='market').length,lockedExcluded:owned(w).filter(i=>i.kind==='card'&&!free(i)).length,estimatedFee:0,estimatedAmount:sum(items.map(i=>referencePrice(w,catalog,i.cardKey))),feeAmount:0};
}
export function placeListing(w,catalog,item,unitAmount){
  need(marketEligible(catalog,item),'MARKET_RARITY','二级市场只交易 SR / SSR 印刷卡；N / R 仍可收藏、对战或丢弃。');
  need(item.kind==='card'&&item.location==='collection'&&free(item),'ITEM_LOCKED','仅可上架未保护、未占用的收藏单卡。');integer(unitAmount,1,1000000);
  const listing={listingId:serial(w,'listing'),inventoryRef:item.inventoryRef,ownerId:item.ownerId,cardKey:item.cardKey,unitAmount,status:'active',day:w.clock.day};
  item.location='market';item.lock=listing.listingId;w.listings.push(listing);enterCirculation(w,item.cardKey,'marketListingAccepted',listing.listingId);note(w,'marketListingAccepted',{listingId:listing.listingId,cardKey:item.cardKey});return listing;
}
export function listSurplus(w,catalog,preview,p){
  need(preview.sourceFingerprint===fingerprint(owned(w).filter(i=>i.kind==='card'&&!['trash','market'].includes(i.location))),'PREVIEW_EXPIRED','收藏保留或参赛状态已变化，请重新预览。');
  const items=preview.refs.map(r=>playerItem(w,r));need(fingerprint(items)===preview.fingerprint,'PREVIEW_EXPIRED','保留与库存状态已变化，请重新预览。');
  const multiplier=p.multiplier??1;need(Number.isFinite(multiplier)&&multiplier>=.5&&multiplier<=2,'INVALID_INPUT','定价倍率应在 0.5～2 之间。');
  return {created:items.length,listings:items.map(i=>placeListing(w,catalog,i,Math.max(1,Math.round(referencePrice(w,catalog,i.cardKey)*multiplier))))};
}
export function settleTrade(w,listing,buyerId){
  need(listing?.status==='active'&&listing.ownerId!==buyerId,'OUT_OF_STOCK','该挂单不可购买。');
  const item=w.items[listing.inventoryRef];need(item?.lock===listing.listingId,'OUT_OF_STOCK','挂单实物已变化。');
  need(MARKET_RARITIES.includes(item.printedRarity),'MARKET_RARITY','二级市场只交易 SR 和 SSR。');
  const buyer=buyerId==='player'?null:w.npcs.find(n=>n.actorId===buyerId);if(buyer)need(listing.unitAmount<=customerBudget(w,buyer),'INSUFFICIENT_FUNDS','本次购买预算不足。');
  debit(wallet(w,buyerId),listing.unitAmount);if(buyer?.visit)buyer.visit.budgetSpent=(buyer.visit.budgetSpent||0)+listing.unitAmount;
  const fee=listing.ownerId==='player'?0:Math.floor(listing.unitAmount*managementEffects(w).marketFee);
  if(listing.ownerId==='player'){income(w,listing.unitAmount);w.daily.goods+=listing.unitAmount;w.daily.cogs+=item.cost;w.lifetime.marketSales++;}
  else {credit(wallet(w,listing.ownerId),listing.unitAmount-fee);income(w,fee);w.daily.service+=fee;}
  if(buyerId==='player')w.daily.purchases+=listing.unitAmount;
  listing.status='sold';listing.buyerId=buyerId;item.ownerId=buyerId;item.location='collection';item.lock=null;item.cost=listing.unitAmount;
  note(w,'secondaryTradeCompleted',{listingId:listing.listingId,cardKey:item.cardKey,buyerId,sellerId:listing.ownerId,amount:listing.unitAmount,fee});return {listingId:listing.listingId,amount:listing.unitAmount,fee,inventoryRef:item.inventoryRef};
}
export function openCustomerPurchase(w,catalog,npc,inventoryRef){
  const item=w.items[inventoryRef];
  if(!item||item.ownerId!==npc.actorId||!['pack','box'].includes(item.kind))return [];
  const packets=item.kind==='box'?unsealBox(w,item):[item],cards=[];
  for(const packet of packets)for(const card of openPacket(w,packet)){cards.push(card);enterCirculation(w,card.cardKey,'customerPackOpened',packet.inventoryRef);}
  note(w,'customerPacksOpened',{actorId:npc.actorId,packs:packets.length,quantity:cards.length});
  return cards.map(i=>i.inventoryRef);
}
export function purchaseRetail(w,npc,item,{deferOpening=false}={}){
  need(item.retailPrice<=customerBudget(w,npc),'INSUFFICIENT_FUNDS','超出顾客本次消费预算。');
  need(productEnabled(w.rules,item.productId),'PRODUCT_UNAVAILABLE','该主题已停产，不再出售。');
  need(item.ownerId==='player'&&['pack','box'].includes(item.kind)&&item.location==='retail'&&free(item),'OUT_OF_STOCK','商品已售完或不可出售。');
  debit(npc.wallet,item.retailPrice);income(w,item.retailPrice);w.daily.goods+=item.retailPrice;w.daily.sealedSales=(w.daily.sealedSales||0)+item.retailPrice;w.daily.cogs+=item.cost;w.lifetime.sales++;
  if(npc.visit)npc.visit.budgetSpent=(npc.visit.budgetSpent||0)+item.retailPrice;
  item.ownerId=npc.actorId;item.location='stock';item.cost=item.retailPrice;
  note(w,'packSaleCompleted',{buyerId:npc.actorId,amount:item.retailPrice,productId:item.productId,kind:item.kind});
  if(!deferOpening)openCustomerPurchase(w,null,npc,item.inventoryRef);
  return item.inventoryRef;
}
function acceptableListing(w,catalog,npc,l){return l.status==='active'&&marketEligible(catalog,w.items[l.inventoryRef])&&l.ownerId!==npc.actorId&&l.unitAmount<=customerBudget(w,npc)&&l.unitAmount<=referencePrice(w,catalog,l.cardKey)*(w.rules.npcSinglePriceCeiling??1.4)*managementEffects(w).singlePriceCeilingMultiplier;}
function acceptableRetail(w,npc,i){const suggested=i.suggestedRetail??i.cost/(1-w.rules.retailMargin);return productEnabled(w.rules,i.productId)&&['pack','box'].includes(i.kind)&&i.location==='retail'&&free(i)&&i.retailPrice<=customerBudget(w,npc)&&i.retailPrice<=suggested*(w.rules.npcSealedPriceCeiling??1.4);}
export function customerFeedback(w,npc,reason,extra={}){
  if(!Object.hasOwn(FEEDBACK_REASONS,reason)||!npc.visit||npc.visit.issues?.includes(reason))return;
  note(w,'customerPurchaseRejected',{...extra,actorId:npc.actorId,visitId:npc.visit.visitId,reason});
}
/** The same choice logic drives the advertised intent, destination and checkout. */
export function customerDecision(w,catalog,npc){
  const regular=w.management?.config.regulars.find(r=>r.id===npc.regularId),held=new Set(owned(w,npc.actorId).filter(i=>i.kind==='card').map(i=>i.cardKey));
  const listings=w.listings.filter(l=>acceptableListing(w,catalog,npc,l)).sort((a,b)=>Number(held.has(a.cardKey))-Number(held.has(b.cardKey))||Number(catalog.byKey.get(b.cardKey)?.group===regular?.preferredGroup)-Number(catalog.byKey.get(a.cardKey)?.group===regular?.preferredGroup)||a.unitAmount-b.unitAmount);
  const retail=owned(w).filter(i=>productEnabled(w.rules,i.productId)&&['pack','box'].includes(i.kind)&&i.location==='retail'&&free(i));
  const buyerClass=customerClass(npc),targetRetail=buyerClass==='boxBuyer'?510:buyerClass==='enthusiast'?360:210;
  const desirability=i=>Math.abs((i.suggestedRetail??i.retailPrice)/(i.kind==='box'?24*.95:1)-targetRetail);
  const item=retail.filter(i=>acceptableRetail(w,npc,i)).sort((a,b)=>isV7(w)?(buyerClass==='boxBuyer'?Number(b.kind==='box')-Number(a.kind==='box'):0)||desirability(a)-desirability(b)||a.retailPrice-b.retailPrice:a.retailPrice-b.retailPrice)[0];
  if(listings.length&&(!item||preferredPurchaseChannel(npc)==='single'))return {listing:listings[0],intent:{kind:'single',label:held.has(listings[0].cardKey)?'看看单卡市场':'补一张缺少的卡',cardKey:listings[0].cardKey}};
  if(item)return {item,intent:{kind:'sealed',label:item.kind==='box'?'选购整盒':'选购卡包',productId:item.productId,unit:item.kind}};
  const offers=[...retail.map(i=>i.retailPrice),...w.listings.filter(l=>l.status==='active'&&l.ownerId!==npc.actorId).map(l=>l.unitAmount)];
  const reason=!offers.length?'out-of-stock':offers.every(price=>price>customerBudget(w,npc))?'budget':'price';
  return {reason,intent:{kind:'shopping',label:FEEDBACK_REASONS[reason]}};
}
function consignSurplus(w,catalog,npc){
  const cards=owned(w,npc.actorId).filter(i=>i.kind==='card'&&i.location==='collection'&&free(i)&&marketEligible(catalog,i));
  if(cards.length>customerBehavior(w).minimumKeptCards&&w.listings.filter(l=>l.ownerId===npc.actorId&&l.status==='active').length<2){const item=[...cards].sort((a,b)=>referencePrice(w,catalog,a.cardKey)-referencePrice(w,catalog,b.cardKey))[0];placeListing(w,catalog,item,referencePrice(w,catalog,item.cardKey));}
}
function customerPurchase(w,catalog,npc,{deferOpening=false}={}){
  const decision=customerDecision(w,catalog,npc),listing=decision.listing;
  if(listing)settleTrade(w,listing,npc.actorId);
  else {
    const item=decision.item;
    if(item){const ref=purchaseRetail(w,npc,item,{deferOpening:true});if(deferOpening)return ref;const refs=openCustomerPurchase(w,catalog,npc,ref);for(const ref of unwantedCards(w,catalog,npc,refs))discardCard(w,w.items[ref],npc.actorId);}
    else {customerFeedback(w,npc,decision.reason,{productId:npc.visit?.intent?.productId,kind:npc.visit?.intent?.unit});npc.label=FEEDBACK_REASONS[decision.reason];}
  }
  consignSurplus(w,catalog,npc);return null;
}
function exitShop(w,map,npc,reason='visit-complete'){
  const exit=map?.anchors['store.entry'];
  try{if(exit){npc.trip={stage:'exit',target:{...exit},path:pathfind(map,npc,exit),reason};npc.activity='leaving';npc.label='离店';return;}}catch(error){note(w,'npcPathUnavailable',{actorId:npc.actorId,stage:'exit',reason:error.message});}
  departCustomer(w,npc,reason);
}
function finishShopping(w,map,npc){if(w.clock.phase==='open'){const invited=w.experience?.events.some(e=>e.day===w.clock.day&&e.status==='scheduled'&&e.actorIds.includes(npc.actorId));lingerCustomer(w,npc,invited?customerBehavior(w).maxVisitSeconds:customerBehavior(w).lingerSeconds);}else exitShop(w,map,npc,'closing');}
function discardSelected(w,npc,refs){for(const ref of refs||[]){const i=w.items[ref];if(i?.ownerId===npc.actorId&&i.location==='collection'&&free(i))discardCard(w,i,npc.actorId);}}
// A manual early close completes paid visits once, so saves never strand sealed purchases or discard references across days.
export function finishCustomerVisits(w,catalog){
  for(const npc of w.npcs){const t=npc.trip;if(npc.currentMatchId)continue;
    // The round is already settled. A closed shop will no longer tick this exit route.
    // Complete departure here without replaying fees/results or carrying it into tomorrow.
    if(t?.kind==='match'){npc.returnAfterMatch=false;if(onSite(npc))departCustomer(w,npc,'business-closed');continue;}
    if(t?.stage==='opening'){const refs=openCustomerPurchase(w,catalog,npc,t.purchaseRef);discardSelected(w,npc,unwantedCards(w,catalog,npc,refs));}
    else if(t?.stage==='sorting'||t?.stage==='discard')discardSelected(w,npc,t.discardRefs);
    if(onSite(npc))departCustomer(w,npc,'business-closed');
  }
}
export function tickEconomy(w,catalog,{map=null,seconds=0}={}){
  if(!['open','closing'].includes(w.clock.phase))return;
  for(const order of w.orders)if(order.status==='pending'&&w.clock.day*1440+w.clock.minute>=order.dueAt)order.status='arrived';
  const elapsed=Math.max(0,seconds)*w.clock.speed,behavior=customerBehavior(w);
  if(map)for(const npc of w.npcs.filter(n=>!n.specialist&&!n.allyId&&onSite(n)&&n.roomId==='store'&&!n.currentRoomId&&!n.playerInviteUntil&&!n.returnAfterMatch&&!n.currentMatchId&&n.trip?.kind!=='match')){
    if(npc.visit)npc.visit.elapsedSeconds+=elapsed;
    if(!npc.trip){
      if(npc.visit)npc.visit.idleSeconds=Math.max(0,(npc.visit.idleSeconds||0)-elapsed);
      if(w.clock.phase!=='open'||npc.visit&&(npc.visit.elapsedSeconds>=behavior.maxVisitSeconds||npc.visit.idleSeconds<=0))exitShop(w,map,npc,w.clock.phase==='open'?'visit-complete':'closing');
      if(!npc.trip)continue;
    }
    const oldX=npc.x,oldY=npc.y;
    moveActor(map,npc,npc.trip,seconds*w.clock.speed);
    if(npc.trip.path.length){
      npc.trip.stallSeconds=Math.hypot(npc.x-oldX,npc.y-oldY)<.01?(npc.trip.stallSeconds||0)+elapsed:0;
      if(npc.trip.stallSeconds>=behavior.pathStallSeconds){const stage=npc.trip.stage;note(w,'npcPathStalled',{actorId:npc.actorId,stage});if(stage==='exit')departCustomer(w,npc,'exit-path-stalled');else exitShop(w,map,npc,'path-stalled');}
      else if(npc.visit?.elapsedSeconds>=behavior.maxVisitSeconds&&!['opening','sorting','discard','exit'].includes(npc.trip.stage))exitShop(w,map,npc,'visit-timeout');
      continue;
    }
    if(!npc.trip.path.length){
      if(npc.trip.stage==='checkout'){
        if(w.clock.phase!=='open'){exitShop(w,map,npc,'closing');continue;}
        if(npc.trip.waitSeconds==null)npc.trip.waitSeconds=managementEffects(w).checkoutSeconds;
        npc.trip.waitSeconds-=seconds*w.clock.speed;if(npc.trip.waitSeconds>0)continue;
        const purchaseRef=customerPurchase(w,catalog,npc,{deferOpening:true});
        if(purchaseRef){
          const station=map.anchors['store.opening'];let route=null;try{route=station?(customerTarget(w,map,station,npc)||{path:pathfind(map,npc,station)}):{path:[]};}catch{}
          if(!route){const refs=openCustomerPurchase(w,catalog,npc,purchaseRef);npc.trip={stage:'sorting',path:[],discardRefs:unwantedCards(w,catalog,npc,refs),waitSeconds:behavior.sortingSeconds};npc.activity='sorting';npc.label='挑选卡牌';}
          else {npc.trip={stage:'opening',...route,purchaseRef,waitSeconds:customerBehavior(w).openingSeconds};npc.activity='opening';npc.label='前往拆包台';}
        }
        else if(owned(w,npc.actorId).some(i=>i.kind==='card'&&i.location==='collection'&&free(i)&&w.circulation[i.cardKey]))finishShopping(w,map,npc);
        else exitShop(w,map,npc,'no-purchase');
      }else if(npc.trip.stage==='opening'){
        npc.trip.waitSeconds-=seconds*w.clock.speed;if(npc.trip.waitSeconds>0)continue;
        const refs=openCustomerPurchase(w,catalog,npc,npc.trip.purchaseRef),discardRefs=unwantedCards(w,catalog,npc,refs);
        npc.trip={stage:'sorting',path:[],discardRefs,waitSeconds:customerBehavior(w).sortingSeconds};npc.activity='sorting';npc.label='挑选卡牌';
      }else if(npc.trip.stage==='sorting'){
        npc.trip.waitSeconds-=seconds*w.clock.speed;if(npc.trip.waitSeconds>0)continue;
        const anchor=map.anchors['store.trash'];
        if(npc.trip.discardRefs.length&&anchor){try{npc.trip={stage:'discard',discardRefs:npc.trip.discardRefs,path:pathfind(map,npc,anchor)};npc.activity='discarding';npc.label='去丢弃卡牌';}catch(error){note(w,'npcPathUnavailable',{actorId:npc.actorId,stage:'discard',reason:error.message});exitShop(w,map,npc,'trash-unreachable');}}
        else {consignSurplus(w,catalog,npc);finishShopping(w,map,npc);}
      }else if(npc.trip.stage==='discard'){
        discardSelected(w,npc,npc.trip.discardRefs);consignSurplus(w,catalog,npc);finishShopping(w,map,npc);
      }else if(npc.trip.stage==='scavenge'){
        npc.trip.waitSeconds-=seconds*w.clock.speed;if(npc.trip.waitSeconds>0)continue;
        const picked=scavenge(w,catalog,npc);npc.trip={stage:'pickup-result',path:[],waitSeconds:1};npc.activity='scavenging';npc.label=picked.length?`捡到 ${picked.length} 张卡`:'桶里没合适的卡';
      }else if(npc.trip.stage==='pickup-result'){
        npc.trip.waitSeconds-=seconds*w.clock.speed;if(npc.trip.waitSeconds>0)continue;finishShopping(w,map,npc);
      }else if(npc.trip.stage==='exit'){departCustomer(w,npc,npc.trip.reason);}
      else {exitShop(w,map,npc,'unknown-stage');}
    }
  }
  if(w.clock.phase!=='open')return;
  const effects=managementEffects(w);
  for(const n of w.npcs.filter(n=>!n.specialist&&!n.allyId))ensureCustomerTraits(w,n);
  // Scavenging has its own cooldown and uses the same customer capacity and navigation as shopping.
  for(const npc of w.npcs.filter(n=>!n.currentRoomId&&!n.specialist&&!n.allyId&&onSite(n)&&!n.trip&&!n.currentMatchId&&n.roomId==='store'&&canScavenge(w,n))){
    if(!trashItems(w).length||w.npcs.filter(n=>!n.specialist&&!n.allyId&&n.trip&&n.trip.kind!=='match').length>=effects.concurrentCustomers)break;
    const anchor=map?.anchors['store.trash'];
    if(map&&anchor){try{const route=customerTarget(w,map,anchor,npc);if(route){npc.trip={stage:'scavenge',...route,waitSeconds:customerBehavior(w).searchSeconds};npc.activity='scavenging';npc.label='去翻垃圾桶';}}catch(error){note(w,'npcPathUnavailable',{actorId:npc.actorId,stage:'scavenge',reason:error.message});}}
    else if(!map)scavenge(w,catalog,npc);
  }
  if(w.clock.minute<w.nextNpcMinute)return;
  w.nextNpcMinute=w.clock.minute+w.rules.npcIntervalMinutes/(1+(effects.attractionRate||0));
  let npc;
  if(w.npcs.filter(n=>!n.specialist&&!n.allyId&&onSite(n)).length>=Math.min(w.rules.maxNpcs,effects.concurrentCustomers))return;
  const invited=w.experience?.events.find(e=>e.day===w.clock.day&&e.status==='scheduled')?.actorIds||[];
  const visitors=w.npcs.filter(n=>!n.specialist&&!n.allyId&&!n.currentRoomId&&!onSite(n)&&!n.currentMatchId&&(n.nextVisitAt||0)<=w.clock.day*1440+w.clock.minute).sort((a,b)=>Number(invited.includes(b.actorId))-Number(invited.includes(a.actorId))||(a.lastVisit?.leftAt||0)-(b.lastVisit?.leftAt||0));
  if(visitors.length&&(invited.includes(visitors[0].actorId)||w.npcs.filter(n=>!n.specialist&&!n.allyId).length>=w.rules.maxNpcs||random(w)<.5))npc=visitors[0];
  else {if(w.npcs.filter(n=>!n.specialist&&!n.allyId).length>=w.rules.maxNpcs)return;const i=w.npcs.length,actorId=serial(w,'npc'),purse=isV7(w)?initialCustomerWallet(w,actorId):null,scavenger=purse?purse.scavenger:random(w)<customerBehavior(w).scavengerChance,initialWallet=purse?Math.round(purse.available*effects.newCustomerWalletMultiplier):Math.round((scavenger?customerBehavior(w).poorInitialWallet:w.rules.npcInitialWallet)*effects.newCustomerWalletMultiplier);npc={actorId,name:customerBehavior(w).names[i%customerBehavior(w).names.length],appearanceId:customerAppearance(i),appearancePackVersion:1,wallet:purse?{...purse,available:initialWallet}:{available:initialWallet},roomId:'store',x:240,y:272,direction:'up',moving:false,activity:'shopping',scavenger};w.npcs.push(npc);note(w,'npcArrived',{actorId:npc.actorId,externalFunds:initialWallet});}
  const decision=customerDecision(w,catalog,npc);arriveCustomer(w,npc,map,invited.includes(npc.actorId)?{kind:'event',label:'参加新手交流会'}:decision.intent);
  if(invited.includes(npc.actorId)){lingerCustomer(w,npc,behavior.maxVisitSeconds);npc.label='等交流会牌友';return;}
  if(!npc.specialist&&!npc.allyId&&canScavenge(w,npc)&&trashItems(w).length){npc.visit.intent={kind:'scavenge',label:'找可回收的卡牌'};const anchor=map?.anchors['store.trash'];if(anchor){const route=customerTarget(w,map,anchor,npc);if(route){npc.trip={stage:'scavenge',...route,waitSeconds:customerBehavior(w).searchSeconds};npc.activity='scavenging';npc.label='去翻垃圾桶';return;}}if(!map){scavenge(w,catalog,npc);departCustomer(w,npc);return;}}
  if(map){
    const hasMarket=!!decision.listing;
    const anchor=map.anchors[hasMarket?'store.secondaryMarket':map.anchors['store.checkout']?'store.checkout':'store.counter'];
    if(anchor){const route=customerTarget(w,map,anchor,npc);if(route){npc.trip={stage:'checkout',...route};npc.navVersion=map.navVersion;npc.activity='walking';npc.label='选购卡牌';return;}exitShop(w,map,npc,'counter-unreachable');return;}
  }
  customerPurchase(w,catalog,npc);departCustomer(w,npc);
}
