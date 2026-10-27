// Read-only benchmark oracle captured from 73e00a14; never imported by runtime.
import {owned,free} from '../../modules/backend/trading.mjs';
export function referenceEligible(w,catalog,ownerId='player'){
  return owned(w,ownerId).filter(i=>i.kind==='card').map(i=>{
    const c=catalog.byKey.get(i.cardKey),reasons=[];
    if(ownerId!=='player'&&!w.circulation[i.cardKey])reasons.push({code:'NOT_IN_CIRCULATION',message:'NPC 只能使用已流入市场的卡种。'});
    if(!free(i))reasons.push({code:'ITEM_LOCKED',message:'副本受保护或被交易/其他比赛占用。'});
    if(i.location!=='collection')reasons.push({code:'NOT_IN_COLLECTION',message:'参赛副本必须在收藏中；请先捡回垃圾桶里的卡。'});
    const blocked=w.rules.compatibilityBlocks[c?.generalId];if(blocked)reasons.push({code:'SKILL_INCOMPATIBLE',message:blocked});
    return {inventoryRef:i.inventoryRef,cardKey:i.cardKey,generalId:c?.generalId,name:c?.name,imageUrl:c?.imageUrl,rarity:i.printedRarity||c?.issuanceRarity||c?.currentRarity,globalScore:c?.globalScore,modeScores:c?.power.modeScores,roleScores:Object.fromEntries(Object.entries(c?.power.roles||{}).map(([role,value])=>[role,value.score])),themeId:c?.pack,themeName:catalog.packNames?.[c?.pack]||c?.pack,favorite:ownerId==='player'&&(w.player.favoriteCardKeys||[]).includes(i.cardKey),eligible:!reasons.length,disabledReasons:reasons,reviewStatus:c?.reviewStatus};
  }).sort((a,b)=>Number(b.favorite)-Number(a.favorite));
}
