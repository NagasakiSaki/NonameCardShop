import {RARITIES,clone,need,sum,shuffle,pick,serial,clamp} from './common.mjs';
import {boxRecipe,distribution} from './distribution.mjs';
import {priceByStrength,strengthPricing} from './supply-pricing.mjs';

export function publishProducts(catalog,rules,day,marketPrices={}){
  const ratingVersion=catalog.cards[0]?.ratingVersion||rules.ratingVersion;
  let priceHash=2166136261;for(const ch of JSON.stringify([strengthPricing(rules),rules.referenceValues,rules.retailMargin,rules.roundTo]))priceHash=Math.imul(priceHash^ch.charCodeAt(0),16777619)>>>0;
  const economyVersion=priceHash.toString(16);
  return catalog.packs.map(pack=>{
    const local=Object.fromEntries(RARITIES.map(r=>[r,catalog.cards.filter(c=>c.pack===pack.id&&c.currentRarity===r).map(c=>c.cardKey)]));
    const poolSummary=Object.fromEntries(RARITIES.map(r=>[r,local[r].length]));
    const pools=Object.fromEntries(RARITIES.map(r=>[r,local[r].length?local[r]:catalog.pools[r]]));
    const weights=Object.fromEntries(RARITIES.map(r=>[r,local[r].length*rules.rarityWeights[r]]));
    const available=pools.SSR.length>0&&sum(Object.values(weights))>0;
    if(!available)return {productId:pack.id,themeId:pack.id,name:pack.name,availability:'unavailable',unavailableReason:'全局卡池缺少 SSR，无法履行整盒保底。',poolSummary};
    const {guaranteed,remainder,boxCounts}=boxRecipe(catalog,rules,catalog.cards.filter(c=>c.pack===pack.id));
    const packSlots=[...Array.from({length:4},()=>Object.fromEntries(RARITIES.map(r=>[r,remainder[r]/96]))),Object.fromEntries(RARITIES.map(r=>[r,guaranteed[r]/24]))];
    const values=Object.fromEntries(RARITIES.map(r=>[r,pools[r].length?sum(pools[r].map(k=>{const base=catalog.byKey.get(k).issuanceValue;return clamp(marketPrices[k]??base,base*.85,base*1.15);}))/pools[r].length:0]));
    const boxValue=sum(RARITIES.map(r=>boxCounts[r]*values[r]));
    const substitutions=RARITIES.filter(r=>boxCounts[r]>0&&!local[r].length);
    const collationVersion=distribution(rules).version;
    return {productId:pack.id,themeId:pack.id,name:pack.name,productVersion:`${ratingVersion}-${collationVersion}-economy${economyVersion}-day${day}`,ratingVersion,priceVersion:`supply-${economyVersion}-${collationVersion}-day${day}`,collationVersion,
      cardsPerPack:5,packsPerBox:24,poolSummary,boxCounts,guaranteed,remainder,pools,values,packSlots,
      packExpectedCounts:Object.fromEntries(RARITIES.map(r=>[r,boxCounts[r]/24])),packAtLeastOneProbabilities:Object.fromEntries(RARITIES.map(r=>[r,1-packSlots.reduce((n,s)=>n*(1-s[r]),1)])),
      guarantees:['每包 4 张 N/R 基础槽 + 1 张 R/SR/SSR 进阶槽',`整盒固定 ${boxCounts.N}N / ${boxCounts.R}R / ${boxCounts.SR}SR / ${boxCounts.SSR}SSR；散包无累计大保底`],
      substitutionSummary:substitutions.length?`${substitutions.join('/')} 缺档，使用全局同档补位。`:null,availability:'available',unavailableReason:null,
      ...priceByStrength(catalog.cards.filter(c=>c.pack===pack.id),rules),packExpectedValue:Math.round(boxValue/24),effectiveDay:day};
  });
}
export function productDTO(product){const {pools,guaranteed,remainder,values,...dto}=product;return {...clone(dto),themeName:product.name,unitAmounts:product.prices?{pack:product.prices.pack.wholesale,box:product.prices.box.wholesale}:null};}
function printed(world,product,rarity){const key=pick(world,product.pools[rarity]);return {cardKey:key,printedRarity:rarity,printVersion:product.productVersion,ratingVersion:product.ratingVersion,source:product.poolSummary[rarity]?'theme':'global-substitution'};}
export function manufactureBox(world,product){
  const list=counts=>shuffle(world,RARITIES.flatMap(r=>Array.from({length:counts[r]},()=>r)));
  const rare=list(product.guaranteed),rest=list(product.remainder);
  return rare.map((r,i)=>[printed(world,product,r),...rest.slice(i*4,i*4+4).map(r=>printed(world,product,r))]);
}
export function manufacturePack(world,product){
  return product.packSlots.map(slot=>{const n=pickRarity(world,slot);return printed(world,product,n);});
}
function pickRarity(world,weights){let n=pickUnit(world);for(const r of RARITIES){n-=weights[r];if(n<1e-12&&weights[r]>0)return r;}return RARITIES.findLast(r=>weights[r]>0);}
function pickUnit(world){world.seed=(Math.imul(world.seed,1664525)+1013904223)>>>0;return world.seed/4294967296;}
export function makeSealed(world,product,unit,cost,ownerId='player'){
  const item={inventoryRef:serial(world,'item'),kind:unit,productId:product.productId,productVersion:product.productVersion,ownerId,location:'stock',cost,protected:false,lock:null,retailPrice:product.prices[unit].retail,suggestedRetail:product.prices[unit].retail,
    spec:{cardsPerPack:5,packsPerBox:24,boxCounts:clone(product.boxCounts),guarantees:clone(product.guarantees)}};
  if(unit==='box')item.packets=manufactureBox(world,product);else item.cards=manufacturePack(world,product);
  world.items[item.inventoryRef]=item;return item;
}
export function unsealBox(world,item){
  need(item.kind==='box'&&item.location==='stock'&&!item.lock,'ITEM_LOCKED','只能拆开仓库中未锁定的卡盒。');
  const total=item.packets.length;
  const packets=item.packets.map((cards,i)=>({inventoryRef:serial(world,'item'),kind:'pack',productId:item.productId,productVersion:item.productVersion,ownerId:item.ownerId,location:'stock',cost:Math.floor(item.cost/total)+(i<item.cost%total?1:0),cards:clone(cards),boxId:item.inventoryRef,protected:false,lock:null,retailPrice:Math.ceil(item.retailPrice/total),suggestedRetail:Math.ceil((item.suggestedRetail??item.cost/(1-world.rules.retailMargin))/total),spec:clone(item.spec)}));
  delete world.items[item.inventoryRef];for(const packet of packets)world.items[packet.inventoryRef]=packet;return packets;
}
export function openPacket(world,packet){
  need(packet.kind==='pack'&&!packet.lock&&!packet.protected,'ITEM_LOCKED','该卡包不能拆开。');
  const n=packet.cards.length;
  const cards=packet.cards.map((printed,i)=>({...printed,inventoryRef:serial(world,'item'),kind:'card',productId:packet.productId,ownerId:packet.ownerId,location:'collection',protected:false,lock:null,cost:Math.floor(packet.cost/n)+(i<packet.cost%n?1:0),sourcePack:packet.inventoryRef}));
  delete world.items[packet.inventoryRef];for(const card of cards)world.items[card.inventoryRef]=card;
  return cards;
}
