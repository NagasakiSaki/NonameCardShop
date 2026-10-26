import {need,clone,RARITIES} from './common.mjs';
import {cardSummary} from './catalog.mjs';
// Public catalogue only: never inspect sealed packets, actual RNG or inventory contents.
export function productContents(w,catalog,{productId}={}){
  const product=w.products.find(p=>p.productId===productId);need(product,'NOT_FOUND','该主题的供货目录不存在。');
  const actual=new Map();for(const rarity of RARITIES)if(product.boxCounts[rarity]>0)for(const key of product.pools[rarity]||[]){if(!actual.has(key))actual.set(key,[]);actual.get(key).push(rarity);}
  const cards=new Map(catalog.cards.filter(c=>c.pack===productId).map(c=>[c.cardKey,c]));for(const key of actual.keys())if(catalog.byKey.has(key))cards.set(key,catalog.byKey.get(key));
  return {productId,productVersion:product.productVersion,themeName:product.name,cardsPerPack:product.cardsPerPack,packsPerBox:product.packsPerBox,boxCounts:clone(product.boxCounts),packAtLeastOneProbabilities:Object.fromEntries(RARITIES.map(r=>[r,1-product.packSlots.reduce((value,slot)=>value*(1-(slot[r]||0)),1)])),guarantees:clone(product.guarantees||[]),items:[...cards.values()].map(c=>({...cardSummary(c),inPool:actual.has(c.cardKey),printedRarities:actual.get(c.cardKey)||[],substitution:c.pack!==productId}))};
}
