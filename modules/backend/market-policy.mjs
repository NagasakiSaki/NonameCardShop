import policy from '../../data/long-term-policy.json' with {type:'json'};
export const MARKET_RARITIES=Object.freeze([...policy.market.allowedRarities]);
export function marketEligible(catalog,item){return MARKET_RARITIES.includes(item?.printedRarity||catalog.byKey.get(item?.cardKey)?.currentRarity);}
export function reconcileMarket(w,catalog){
 for(const listing of w.listings)if(listing.status==='active'&&!marketEligible(catalog,w.items[listing.inventoryRef]||listing)){
  const item=w.items[listing.inventoryRef];if(item?.lock===listing.listingId){item.lock=null;item.location='collection';}
  listing.status='cancelled';listing.cancelReason='market-rarity-policy';
 }
}