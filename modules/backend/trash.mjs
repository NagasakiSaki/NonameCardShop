import {need,random} from './common.mjs';
import {note,enterCirculation} from './world.mjs';

export const TRASH_OWNER='public:trash';
export const DEFAULT_CUSTOMER_BEHAVIOR=Object.freeze({
  openingSeconds:3,sortingSeconds:2,searchSeconds:2,
  keepCopies:1,minimumKeptCards:3,discardChance:{N:.65,R:.25,SR:0,SSR:0},
  scavengerChance:.3,poorWallet:400,poorInitialWallet:200,
  pickupLimit:2,pickupCooldownMinutes:90
});
export function customerBehavior(w){return {...DEFAULT_CUSTOMER_BEHAVIOR,...w.rules.customerBehavior,discardChance:{...DEFAULT_CUSTOMER_BEHAVIOR.discardChance,...w.rules.customerBehavior?.discardChance}};}
export const trashItems=w=>Object.values(w.items).filter(i=>i.kind==='card'&&i.location==='trash'&&!i.lock&&!i.protected);
export function discardCard(w,item,actorId){
  need(item?.ownerId===actorId&&item.kind==='card'&&item.location==='collection'&&!item.lock&&!item.protected,'ITEM_LOCKED','只能丢弃未保护、未占用的收藏卡。');
  item.trash={discardedBy:actorId,day:w.clock.day,minute:w.clock.minute,cost:item.cost};
  item.ownerId=TRASH_OWNER;item.location='trash';
  note(w,'cardDiscarded',{inventoryRef:item.inventoryRef,cardKey:item.cardKey,discardedBy:actorId});
}
export function pickTrashCard(w,item,actorId){
  need(actorId==='player'||w.npcs.some(n=>n.actorId===actorId),'NOT_FOUND','拾取者不存在。');
  need(item?.kind==='card'&&item.location==='trash'&&!item.lock&&!item.protected,'OUT_OF_STOCK','这张卡已被捡走或不在垃圾桶里。');
  const discardedBy=item.trash?.discardedBy??item.ownerId;
  // Recovering one's own card preserves its basis; someone else's discarded card is free.
  item.cost=discardedBy===actorId?item.cost:0;
  item.ownerId=actorId;item.location='collection';
  item.lastTrashPickup={actorId,discardedBy,day:w.clock.day,minute:w.clock.minute};delete item.trash;
  enterCirculation(w,item.cardKey,'trashPickup',item.inventoryRef);
  note(w,'trashCardPickedUp',{inventoryRef:item.inventoryRef,cardKey:item.cardKey,actorId,discardedBy});
  return item;
}
export function ensureCustomerTraits(w,npc){
  if(npc.scavenger===undefined)npc.scavenger=random(w)<customerBehavior(w).scavengerChance;
}
export function canScavenge(w,npc){
  const policy=customerBehavior(w),stamp=w.clock.day*1440+w.clock.minute;
  return npc.scavenger===true&&npc.wallet.available<=policy.poorWallet&&stamp>=(npc.nextScavengeAt??0);
}
export function unwantedCards(w,catalog,npc,refs){
  const policy=customerBehavior(w),cards=Object.values(w.items).filter(i=>i.ownerId===npc.actorId&&i.kind==='card'&&i.location==='collection');
  const score=i=>catalog.byKey.get(i.cardKey)?.globalScore??0;
  const best=new Set([...cards].sort((a,b)=>score(b)-score(a)).slice(0,policy.minimumKeptCards).map(i=>i.inventoryRef));
  const counts=new Map();for(const i of Object.values(w.items).filter(i=>i.ownerId===npc.actorId&&i.kind==='card'))counts.set(i.cardKey,(counts.get(i.cardKey)||0)+1);
  return refs.map(ref=>w.items[ref]).filter(Boolean).sort((a,b)=>score(a)-score(b)).filter(i=>{
    if(i.ownerId!==npc.actorId||i.location!=='collection'||i.protected||i.lock||best.has(i.inventoryRef))return false;
    // SR/SSR are kept by default even when duplicated; all preferences remain configurable.
    const chance=policy.discardChance[i.printedRarity]??0;
    if(chance<=0)return false;
    const discard=(counts.get(i.cardKey)>policy.keepCopies)||random(w)<chance;
    if(discard)counts.set(i.cardKey,counts.get(i.cardKey)-1);
    return discard;
  }).map(i=>i.inventoryRef);
}
export function scavenge(w,catalog,npc){
  if(!canScavenge(w,npc))return [];
  const policy=customerBehavior(w),held=new Set(Object.values(w.items).filter(i=>i.ownerId===npc.actorId&&i.kind==='card').map(i=>i.cardKey));
  const cards=trashItems(w).sort((a,b)=>Number(held.has(a.cardKey))-Number(held.has(b.cardKey))||(catalog.byKey.get(b.cardKey)?.globalScore??0)-(catalog.byKey.get(a.cardKey)?.globalScore??0));
  // Prefer distinct generals; a second trip can still collect an available duplicate.
  const selected=[];for(const card of cards)if(selected.length<policy.pickupLimit&&!selected.some(i=>i.cardKey===card.cardKey))selected.push(card);
  for(const card of selected)pickTrashCard(w,card,npc.actorId);
  npc.nextScavengeAt=w.clock.day*1440+w.clock.minute+policy.pickupCooldownMinutes;
  return selected;
}
