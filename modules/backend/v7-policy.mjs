import {buildEconomyPolicy,calculateBoxPrice} from '../economy-v7/pricing.mjs';
import {need,clone} from './common.mjs';
import {createProgressionState} from '../progression/state.mjs';
import {deriveAllyEffects} from '../progression/allies.mjs';
import {determineBuyerClass,budgetForVisit,generateInitialWallet,dailyBudgetSupplement} from '../economy-v7/budget.mjs';
import longTermPolicy from '../../data/long-term-policy.json' with {type:'json'};
import {managementEffects} from './management.mjs';
export const V7_RETIRED=['diy','old','key','collab','sixiang','onlyOL','xianding','newjiang','offline','standard'];
export const isV7=w=>w?.rules?.operationsV7===true;
export const unlockedProducts=w=>w?.progression?.version===1&&!w.progression.disabled?w.progression.unlockedProductIds:['yijiang'];
export const allyEffects=w=>w?.progression?.version===1?deriveAllyEffects(w.progression):{attractionRate:0,checkoutReductionRate:0,wholesaleDiscountRate:0};
export function initialiseV7(w,defaults,{fresh=false}={}){
  if(defaults?.operationsV7!==true&&!isV7(w))return false;
  const changed=w.operationsVersion!==1;
  w.rules.operationsV7=true;
  if(changed){
    w.rules.distribution??={};w.rules.distribution.excludedPacks??=[];
    w.rules.distribution.excludedPacks=[...new Set([...w.rules.distribution.excludedPacks,...V7_RETIRED])];
    w.rules.strengthPricing=defaults?.strengthPricing?.version==='strength-tiers-4'?clone(defaults.strengthPricing):{version:'strength-tiers-4',boxDiscount:.95,tiers:[{id:'entry',label:'基础档',maxScore:53,packWholesale:150,packRetail:210},{id:'standard',label:'进阶档',maxScore:57,packWholesale:255,packRetail:360},{id:'expert',label:'旗舰档',maxScore:10000,packWholesale:360,packRetail:510}]};
    w.rules.starterGift={enabled:true,unit:'box',quantity:1,productId:'yijiang'};
    w.operationsVersion=1;
  }
  if(!w.progression)w.progression=createProgressionState({epoch:w.worldId,firstDueDay:fresh?longTermPolicy.challenge.firstDay:w.clock.day+1,intervalDays:longTermPolicy.challenge.intervalDays});
  if(w.progression.version===1&&!w.progression.disabled&&w.progression.cadenceVersion!==longTermPolicy.version){
    const p=w.progression,first=longTermPolicy.challenge.firstDay,interval=longTermPolicy.challenge.intervalDays,lastCleared=Math.max(0,...p.stages.map(s=>s.clearedAtDay||0));
    p.firstDueDay=first;p.intervalDays=interval;p.cadenceVersion=longTermPolicy.version;
    for(const [index,stage]of p.stages.entries())if(stage.status!=='cleared'&&!(stage.stageId===p.activeStageId&&p.currentVisit?.status==='onsite'))stage.dueDay=Math.max(first+index*interval,lastCleared?lastCleared+interval:0,p.deferrals[stage.stageId]?.deferredToDay||0);
  }
  for(const i of Object.values(w.items))if(['box','pack'].includes(i.kind)&&i.location==='retail'&&V7_RETIRED.includes(i.productId))i.location='stock';
  return changed;
}
export function assertSupply(w,productId){
  if(!isV7(w))return;
  need(!V7_RETIRED.includes(productId),'PRODUCT_RETIRED','该主题已停产，已有卡牌和密封藏品仍保留。');
  need(unlockedProducts(w).includes(productId),'PRODUCT_LOCKED','请先击败对应的来访高手，解锁该主题供货。');
}
export function customerClass(npc){return npc.wallet?.buyerClass||npc.buyerClass||(npc.scavenger?'poor':determineBuyerClass(npc.actorId));}
export function customerBudget(w,npc){
  if(!isV7(w))return Math.max(0,npc.wallet.available-(npc.wallet.reserved||0));
  const value=budgetForVisit({buyerClass:customerClass(npc),wallet:npc.wallet,visitSeed:npc.visit?.visitId||`${npc.actorId}:${w.clock.day}`});
  return Math.max(0,Math.min(value.availableWallet,(npc.visit?.budgetAmount??value.visitBudget)-(npc.visit?.budgetSpent||0)));
}
export function initialiseVisitBudget(w,npc){if(isV7(w)&&npc.visit){const value=budgetForVisit({buyerClass:customerClass(npc),wallet:npc.wallet,visitSeed:npc.visit.visitId});npc.visit.budgetAmount=Math.min(value.availableWallet,Math.round(value.visitBudget*managementEffects(w).visitBudgetMultiplier));npc.visit.budgetSpent=0;}}
export function initialCustomerWallet(w,actorId){return generateInitialWallet(actorId);}
export function replenishCustomer(w,npc){
  if(!isV7(w)||npc.specialist||npc.allyId)return null;
  npc.wallet.buyerClass=customerClass(npc);return dailyBudgetSupplement(npc,w.clock.day).data;
}
export function validateV7(w){
  for(const m of w.matches||[])if(m.series){
    const s=m.series;need(Number.isSafeInteger(s.seriesVersion)&&s.seriesVersion>0,'INVALID_SAVE','系列赛版本不合法。');
    if(s.seriesVersion!==1)continue;
    need(s.worldId===w.worldId&&(s.branchId===w.branchId||m.status==='finished'&&(w.branchLineage||[]).includes(s.branchId))&&s.matchId===m.matchId&&['kof','doudizhu-bo3','versus2v2-bo3'].includes(s.formatId)&&['selecting','confirmed','mounting','live','interrupted','finished','cancelled'].includes(s.phase),'INVALID_SAVE','系列赛身份或阶段不合法。');
    need(s.score&&['mine','enemy','draws'].every(k=>Number.isSafeInteger(s.score[k])&&s.score[k]>=0)&&Array.isArray(s.rounds)&&s.rounds.length<=500&&Number.isSafeInteger(s.revision)&&s.revision>=1&&s.round&&Array.isArray(s.round.seatSkeleton)&&s.round.seatSkeleton.length>=2&&s.round.seatSkeleton.length<=4,'INVALID_SAVE','系列赛比分或席位不完整。');
    need(s.reserve?.sides&&['mine','enemy'].every(side=>Array.isArray(s.reserve.sides[side]?.entries)&&s.reserve.sides[side].entries.length>=1&&s.reserve.sides[side].entries.length<=8&&s.reserve.sides[side].entries.every(e=>typeof e.generalId==='string'&&typeof e.reserveRef==='string')),'INVALID_SAVE','备战池不完整。');
  }
  const p=w.progression;if(!p)return;
  need(p&&Number.isSafeInteger(p.version)&&p.version>0&&JSON.stringify(p).length<2*1024*1024,'INVALID_SAVE','挑战进度不合法。');
  if(p.version!==1)return;
  need(Array.isArray(p.stages)&&p.stages.length<=64&&Array.isArray(p.allies)&&p.allies.length<=64&&Array.isArray(p.unlockedProductIds)&&p.unlockedProductIds.every(s=>typeof s==='string')&&p.receipts&&Number.isSafeInteger(p.revision),'INVALID_SAVE','挑战或伙伴记录不完整。');
  need(p.stages.every(s=>typeof s.stageId==='string'&&Number.isSafeInteger(s.dueDay)&&s.dueDay>=1)&&new Set(p.unlockedProductIds).size===p.unlockedProductIds.length,'INVALID_SAVE','挑战日期或解锁记录不正确。');
  need(Array.isArray(p.stageQueue)&&p.stageQueue.every(id=>p.stages.some(s=>s.stageId===id))&&p.dailyVisitStatus&&typeof p.dailyVisitStatus.proactiveOfferGiven==='boolean'&&p.challenges&&p.deferrals&&Number.isSafeInteger(p.maxAllySlots)&&p.maxAllySlots>=0&&p.maxAllySlots<=3,'INVALID_SAVE','挑战排期不完整。');
  need(p.allies.every(a=>typeof a.allyId==='string'&&typeof a.personId==='string'&&typeof a.onDuty==='boolean'&&Number.isFinite(a.rate)&&a.rate>=0&&a.rate<=1&&['attraction','checkout','wholesale'].includes(a.defaultDuty)&&(!a.assignedDuty||['attraction','checkout','wholesale'].includes(a.assignedDuty)))&&new Set(p.allies.map(a=>a.allyId)).size===p.allies.length&&p.allies.filter(a=>a.onDuty).length<=p.maxAllySlots,'INVALID_SAVE','经营伙伴或值班记录不合法。');
}

export function economyPolicy(rules){
  const p=rules.strengthPricing;
  if(p?.version!=='strength-tiers-4')return buildEconomyPolicy();
  return buildEconomyPolicy({boxDiscount:p.boxDiscount,pricing:{version:p.version,thresholds:{entryMaxScoreExclusive:p.tiers[0].maxScore,standardMaxScoreExclusive:p.tiers[1].maxScore},tiers:p.tiers.map(t=>({id:t.id,label:t.label,packWholesale:t.packWholesale,packRetail:t.packRetail,boxWholesale:calculateBoxPrice(t.packWholesale,p.boxDiscount),boxRetail:calculateBoxPrice(t.packRetail,p.boxDiscount)}))}});
}
