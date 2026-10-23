import {clone,need,integer,serial,sum,credit,debit,clamp,random,page} from './common.mjs';
import {openPacket,unsealBox,makeSealed} from './products.mjs';
import {note} from './world.mjs';
import {pathfind,moveActor} from './navigation.mjs';
import {managementEffects} from './management.mjs';

export const owned=(w,ownerId='player')=>Object.values(w.items).filter(i=>i.ownerId===ownerId);
export const free=i=>!i.lock&&!i.protected;
export function playerItem(w,ref){const item=w.items[ref];need(item?.ownerId==='player','OUT_OF_STOCK','未持有这件商品。');return item;}
export function wallet(w,ownerId){if(ownerId==='player')return w.wallet;const npc=w.npcs.find(n=>n.actorId===ownerId);need(npc,'NOT_FOUND','顾客不存在。');return npc.wallet;}
export function income(w,amount){const paid=Math.min(w.wallet.debt,amount);w.wallet.debt-=paid;credit(w.wallet,amount-paid);}
export function enterCirculation(w,cardKey,source,reference){if(!w.circulation[cardKey]){w.circulation[cardKey]={day:w.clock.day,source,reference};note(w,'cardEnteredCirculation',{cardKey,source,reference});}}
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
    const modes=['bo3','kof'].map(mode=>{const s=w.stats[`${c.cardKey}|${mode}`]||{wins:0,losses:0,draws:0};const n=s.wins+s.losses+s.draws;return clamp(1+2*n/(n+40)*((s.wins+.5*s.draws+10)/(n+20)-.5),.7,1.4);});
    const supplied=supplies.get(c.cardKey)||0;
    const demand=1+Math.min(.15,(trades.get(c.cardKey)||0)/(10+supplied*5));
    const target=Math.round(c.issuanceValue*(modes[0]*.65+modes[1]*.35)*demand),previous=w.prices[c.cardKey]||c.issuanceValue;
    w.prices[c.cardKey]=Math.max(1,Math.round(clamp(target,previous*(1-w.rules.priceDailyLimit),previous*(1+w.rules.priceDailyLimit))));
  }
}
export function inventoryList(w,catalog,p={}){
  const rows=owned(w).filter(i=>(!p.location||i.location===p.location)&&(!p.kind||i.kind===p.kind)).map(i=>{
    const card=i.kind==='card'?catalog.byKey.get(i.cardKey):null;
    return {inventoryRef:i.inventoryRef,kind:i.kind,cardKey:i.cardKey,productId:i.productId,printVersion:i.printVersion||i.productVersion,printedRarity:i.printedRarity,
      name:card?.name||i.productId,imageUrl:card?.imageUrl,globalScore:card?.globalScore,currentRarity:card?.currentRarity,location:i.location,owned:1,available:free(i)&&!['market','retail'].includes(i.location)?1:0,protected:i.protected?1:0,locked:i.lock?1:0,listed:i.location==='market'||i.location==='retail'?1:0,
      cost:i.cost,eligible:!!w.circulation[i.cardKey],disabledReasons:!free(i)?[{code:'ITEM_LOCKED',message:'该实物有收藏保护或正在交易/参赛。'}]:[]};
  }).filter(i=>(!p.search||`${i.name} ${i.cardKey}`.includes(p.search))&&(!p.rarity||i.printedRarity===p.rarity));
  return page(rows,p);
}
export function openingPreview(w,p){
  const refs=p.inventoryRefs?new Set(p.inventoryRefs):null;
  const items=owned(w).filter(i=>i.location==='stock'&&free(i)&&(!refs||refs.has(i.inventoryRef))&&(!p.productId||i.productId===p.productId)&&(i.kind==='pack'||p.includeBoxes&&i.kind==='box'));
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
  for(const item of owned(w).filter(i=>i.kind==='card'&&!['trash','market'].includes(i.location))){const k=p.mergePrints?item.cardKey:`${item.cardKey}|${item.printVersion}|${item.printedRarity}`;if(!groups.has(k))groups.set(k,[]);groups.get(k).push(item);}
  const refs=[],rows=[];
  for(const cards of groups.values()){
    if(p.rarity&&catalog.byKey.get(cards[0].cardKey)?.currentRarity!==p.rarity)continue;
    const fixed=cards.filter(i=>!free(i)),movable=cards.filter(free).sort((a,b)=>b.cost-a.cost||a.inventoryRef.localeCompare(b.inventoryRef));
    const selected=movable.slice(fixed.length?0:1);refs.push(...selected.map(i=>i.inventoryRef));
    rows.push({cardKey:cards[0].cardKey,owned:cards.length,retained:cards.length-selected.length,quantity:selected.length});
  }
  const items=refs.map(r=>w.items[r]);return {kind:'surplus',refs,rows,fingerprint:fingerprint(items),sourceFingerprint:fingerprint(owned(w).filter(i=>i.kind==='card'&&!['trash','market'].includes(i.location))),quantity:refs.length,keep:1,newListings:refs.length,alreadyListed:owned(w).filter(i=>i.location==='market').length,lockedExcluded:owned(w).filter(i=>i.kind==='card'&&!free(i)).length,estimatedFee:0,estimatedAmount:sum(items.map(i=>referencePrice(w,catalog,i.cardKey))),feeAmount:0};
}
export function placeListing(w,catalog,item,unitAmount){
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
  debit(wallet(w,buyerId),listing.unitAmount);
  const fee=listing.ownerId==='player'?0:Math.floor(listing.unitAmount*w.rules.marketFee);
  if(listing.ownerId==='player'){income(w,listing.unitAmount);w.daily.goods+=listing.unitAmount;w.daily.cogs+=item.cost;w.lifetime.marketSales++;}
  else {credit(wallet(w,listing.ownerId),listing.unitAmount-fee);income(w,fee);w.daily.service+=fee;}
  if(buyerId==='player')w.daily.purchases+=listing.unitAmount;
  listing.status='sold';listing.buyerId=buyerId;item.ownerId=buyerId;item.location='collection';item.lock=null;item.cost=listing.unitAmount;
  note(w,'secondaryTradeCompleted',{listingId:listing.listingId,cardKey:item.cardKey,buyerId,sellerId:listing.ownerId,amount:listing.unitAmount,fee});return {listingId:listing.listingId,amount:listing.unitAmount,fee,inventoryRef:item.inventoryRef};
}
export function receiveOrder(w,order){
  need(order?.status==='arrived','NOT_READY','订单尚未送达或已签收。');
  const refs=[];for(let i=0;i<order.quantity;i++)refs.push(makeSealed(w,order.product,order.unit,order.unitCost).inventoryRef);
  order.status='received';w.lifetime.received+=order.quantity*(order.unit==='box'?24:1);note(w,'goodsReceived',{orderId:order.orderId,quantity:refs.length});return {inventoryRefs:refs,stock:{packs:order.quantity*(order.unit==='box'?24:1)}};
}
export function purchaseRetail(w,npc,item){
  need(item.ownerId==='player'&&item.location==='retail'&&!item.lock,'OUT_OF_STOCK','商品已售完。');
  debit(npc.wallet,item.retailPrice);income(w,item.retailPrice);w.daily.goods+=item.retailPrice;w.daily.sealedSales=(w.daily.sealedSales||0)+item.retailPrice;w.daily.cogs+=item.cost;w.lifetime.sales++;
  item.ownerId=npc.actorId;item.location='stock';item.cost=item.retailPrice;
  const packets=item.kind==='box'?unsealBox(w,item):[item];
  for(const packet of packets)for(const card of openPacket(w,packet))enterCirculation(w,card.cardKey,'customerPackOpened',packet.inventoryRef);
  note(w,'packSaleCompleted',{buyerId:npc.actorId,amount:item.retailPrice,productId:item.productId});
}
function acceptableListing(w,catalog,npc,l){return l.status==='active'&&l.ownerId!==npc.actorId&&l.unitAmount<=npc.wallet.available&&l.unitAmount<=referencePrice(w,catalog,l.cardKey)*(w.rules.npcSinglePriceCeiling??1.4);}
function acceptableRetail(w,npc,i){const suggested=i.suggestedRetail??i.cost/(1-w.rules.retailMargin);return i.location==='retail'&&!i.lock&&i.retailPrice<=npc.wallet.available&&i.retailPrice<=suggested*(w.rules.npcSealedPriceCeiling??1.4);}
function customerPurchase(w,catalog,npc){
  const listing=w.listings.find(l=>acceptableListing(w,catalog,npc,l));
  if(listing)settleTrade(w,listing,npc.actorId);
  else {const item=owned(w).filter(i=>acceptableRetail(w,npc,i)).sort((a,b)=>a.retailPrice-b.retailPrice)[0];if(item)purchaseRetail(w,npc,item);}
  const cards=owned(w,npc.actorId).filter(i=>i.kind==='card'&&free(i));
  if(cards.length>3&&w.listings.filter(l=>l.ownerId===npc.actorId&&l.status==='active').length<2){const item=cards.at(-1);placeListing(w,catalog,item,referencePrice(w,catalog,item.cardKey));}
}
export function tickEconomy(w,catalog,{map=null,seconds=0}={}){
  if(w.clock.phase!=='open')return;
  for(const order of w.orders)if(order.status==='pending'&&w.clock.day*1440+w.clock.minute>=order.dueAt)order.status='arrived';
  if(map)for(const npc of w.npcs.filter(n=>n.trip&&n.trip.kind!=='match')){
    moveActor(map,npc,npc.trip,seconds*w.clock.speed);
    if(!npc.trip.path.length){
      if(npc.trip.stage==='checkout'){
        if(npc.trip.waitSeconds==null)npc.trip.waitSeconds=managementEffects(w).checkoutSeconds;
        npc.trip.waitSeconds-=seconds*w.clock.speed;if(npc.trip.waitSeconds>0)continue;
        customerPurchase(w,catalog,npc);const exit=map.anchors['store.entry'];
        npc.trip=exit?{stage:'exit',path:pathfind(map,npc,exit)}:null;npc.activity='leaving';
      }else {npc.trip=null;npc.activity='idle';npc.moving=false;}
    }
  }
  if(w.clock.minute<w.nextNpcMinute)return;
  w.nextNpcMinute=w.clock.minute+w.rules.npcIntervalMinutes;
  let npc;
  const effects=managementEffects(w);if(w.npcs.filter(n=>n.trip&&n.trip.kind!=='match').length>=effects.concurrentCustomers)return;
  if(w.npcs.length<w.rules.maxNpcs){const appearances=['rookie','collector','competitor','passerby','regular','bigspender'];const i=w.npcs.length,initialWallet=Math.round(w.rules.npcInitialWallet*effects.newCustomerWalletMultiplier);npc={actorId:serial(w,'npc'),name:`顾客 ${i+1}`,appearanceId:appearances[i%appearances.length],wallet:{available:initialWallet},roomId:'store',x:240,y:272,direction:'up',moving:false,activity:'shopping'};w.npcs.push(npc);note(w,'npcArrived',{actorId:npc.actorId,externalFunds:initialWallet});}
  else {const available=w.npcs.filter(n=>!n.trip&&!n.currentMatchId&&n.roomId==='store');if(!available.length)return;npc=available[Math.floor(random(w)*available.length)];}
  if(map){
    const entry=map.anchors['store.entry'];if((npc.activity==='idle'||!npc.navVersion)&&entry){npc.x=entry.x;npc.y=entry.y;}
    const hasMarket=w.listings.some(l=>acceptableListing(w,catalog,npc,l));
    const anchor=map.anchors[hasMarket?'store.secondaryMarket':'store.counter'];
    if(anchor){npc.trip={stage:'checkout',path:pathfind(map,npc,anchor)};npc.navVersion=map.navVersion;npc.activity='walking';return;}
  }
  customerPurchase(w,catalog,npc);npc.activity='idle';
}
