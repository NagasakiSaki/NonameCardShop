// Stable preference, independent of appearance, wallet and query frequency.
// Future strategy configuration can replace this selector without changing settlement.
export const DEFAULT_CUSTOMER_DEMAND=Object.freeze({sealedShare:.6});
export function preferredPurchaseChannel(npc,{sealedShare=DEFAULT_CUSTOMER_DEMAND.sealedShare}={}){
  if(['sealed','single'].includes(npc.purchaseChannel))return npc.purchaseChannel;
  if(npc.regularId==='collector'||npc.scavenger)return 'single';
  let hash=2166136261;
  for(const char of String(npc.actorId))hash=Math.imul(hash^char.charCodeAt(0),16777619)>>>0;
  hash=Math.imul(hash^(hash>>>16),0x85ebca6b);
  hash=Math.imul(hash^(hash>>>13),0xc2b2ae35);
  return ((hash^(hash>>>16))>>>0)/4294967296<sealedShare?'sealed':'single';
}
