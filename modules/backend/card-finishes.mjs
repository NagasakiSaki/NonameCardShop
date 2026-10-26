// Physical treatment is separate from combat grade. No premium finishes are issued yet.
export const FINISH_CONTRACT_VERSION=1;
export const STANDARD_FINISH='standard';
export function printingMeta(item){return {finishId:item.finishId??STANDARD_FINISH,artVariantId:item.artVariantId??'base',editionId:item.editionId??item.printVersion??'legacy',...(item.serialNumber?{serialNumber:item.serialNumber}:{})};}
export function physicalGroupKey(item,{mergePrints=false}={}){
  const p=printingMeta(item);
  return JSON.stringify([item.cardKey,mergePrints?null:item.printVersion,mergePrints?null:item.printedRarity,p.finishId,p.artVariantId,mergePrints?item.editionId??null:p.editionId,p.serialNumber??null]);
}
// Future exchange orders must use an asset identity, never a mutable strength grade.
export function exchangeAssetKey(item){return JSON.stringify([item.cardKey,item.printedRarity,...Object.values(printingMeta(item))]);}
