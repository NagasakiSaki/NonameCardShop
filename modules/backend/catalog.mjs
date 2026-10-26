import {modePower,STRENGTH_MODEL_VERSION,strengthFingerprint,validateModeScoring,RATED_FORMATS} from './strength-modes.mjs';
import {RARITIES,clamp,need,page} from './common.mjs';
import {DEFAULT_CUSTOMER_BEHAVIOR} from './trash.mjs';
import {productEnabled,validateDistribution} from './distribution.mjs';
import {validateStrengthPricing} from './supply-pricing.mjs';
import {validateStarterGift} from './starter-gift.mjs';
import {resourcePower,RESOURCE_MODEL_VERSION,RESOURCE_CALIBRATIONS} from './resource-power.mjs';

export function validateRules(r){
  validateStarterGift(r||{});
  validateStrengthPricing(r||{});
  if(r.roomWaitMinutes!==undefined)need(Number.isSafeInteger(r.roomWaitMinutes)&&r.roomWaitMinutes>=30&&r.roomWaitMinutes<=600,'INVALID_CONFIG','房间等待期限应为30～600游戏分钟。');
  if(r.npcSimulation!==undefined)need(typeof r.npcSimulation==='boolean','INVALID_CONFIG','NPC 模拟开关不正确。');
  if(r.npcSimulationSeconds!==undefined)need(Number.isFinite(r.npcSimulationSeconds)&&r.npcSimulationSeconds>=1&&r.npcSimulationSeconds<=300,'INVALID_CONFIG','NPC 模拟时长须在 1～300 秒。');
  if(r.tasks!==undefined)need(Number.isFinite(r.tasks.rewardMultiplier)&&r.tasks.rewardMultiplier>0&&r.tasks.rewardMultiplier<=10,'INVALID_CONFIG','任务奖励倍率须在 0～10 之间。');
  validateDistribution(r||{});
  need(r?.version===1,'INVALID_CONFIG','不支持的后端规则版本。');
  need(['R','SR','SSR'].every(k=>Number.isFinite(r.thresholds?.[k])),'INVALID_CONFIG','分数界线必须是有限数值。');
  need(r.thresholds?.R<r.thresholds?.SR&&r.thresholds.SR<r.thresholds.SSR,'INVALID_CONFIG','全局稀有度界线必须递增。');
  need(r.scoring&&['baseline','hpPoint','hpCap'].every(k=>Number.isFinite(r.scoring[k]))&&['cards','damage','guard','heal','control','quality','cost','hpLoss','burst','carry'].every(k=>Number.isFinite(r.scoring.weights?.[k])),'INVALID_CONFIG','全局评分权重不完整。');
  need(!r.scoring.method||[RESOURCE_MODEL_VERSION,STRENGTH_MODEL_VERSION].includes(r.scoring.method),'INVALID_CONFIG','不支持的资源收益评分版本。');
  need(r.cardsPerPack===5&&r.packsPerBox===24,'INVALID_CONFIG','当前配盒器采用 24 包 × 5 张。');
  for(const key of ['referenceValues','rarityWeights'])for(const rarity of RARITIES)need(Number.isFinite(r[key]?.[rarity])&&r[key][rarity]>0,'INVALID_CONFIG',`${key}.${rarity} 必须大于零。`);
  for(const key of ['marketFee','rake','retailMargin','maxWalletStakeFraction','priceDailyLimit'])need(Number.isFinite(r[key])&&r[key]>=0&&r[key]<1,'INVALID_CONFIG',`${key} 比例不合法。`);
  for(const key of ['startingCash','deliveryMinutes','operatingCost','npcIntervalMinutes','roundTo','maxArchives','maxDays','maxNpcs','npcInitialWallet','npcDailyIncome','supplierCreditLimit','baseStake','maxStake','tableFee'])need(Number.isSafeInteger(r[key])&&r[key]>=0,'INVALID_CONFIG',`${key} 必须是非负整数。`);
  need(r.roundTo>0&&r.npcIntervalMinutes>0&&r.maxNpcs>0&&r.maxArchives>0&&r.maxDays>0&&Number.isFinite(r.openingReturn)&&r.openingReturn>0&&r.openingReturn<=1.2&&Number.isFinite(r.minutesPerSecond)&&r.minutesPerSecond>0,'INVALID_CONFIG','时间、客流和取整参数必须大于零，回报系数不超过 1.2。');
  if(r.scoring.method===STRENGTH_MODEL_VERSION)validateModeScoring(r.scoring,r.modeWeights);else need(r.modeWeights?.bo3>=0&&r.modeWeights?.kof>=0&&Math.abs(r.modeWeights.bo3+r.modeWeights.kof-1)<1e-8,'INVALID_CONFIG','模式权重合计必须为 1。');
  need(r.wageringEnabled===false,'FEATURE_UNAVAILABLE','当前仅开放无赌注比赛；完整引擎恢复完成前不能启用下注。');
  if(r.npcAutoBattles!==undefined)need(typeof r.npcAutoBattles==='boolean','INVALID_CONFIG','NPC 自动对战开关不正确。');
  for(const key of ['npcSinglePriceCeiling','npcSealedPriceCeiling'])if(r[key]!==undefined)need(Number.isFinite(r[key])&&r[key]>=1&&r[key]<=3,'INVALID_CONFIG',`${key} 必须在 1～3 之间。`);
  for(const key of ['npcMatchIntervalMinutes','npcMatchCooldownMinutes','npcRoundLimit'])if(r[key]!==undefined)need(Number.isSafeInteger(r[key])&&r[key]>=10&&r[key]<=1440,'INVALID_CONFIG',`${key} 超出支持范围。`);
  if(r.customerBehavior!==undefined){
    need(r.customerBehavior&&typeof r.customerBehavior==='object'&&!Array.isArray(r.customerBehavior),'INVALID_CONFIG','顾客行为参数必须是对象。');
    const c={...DEFAULT_CUSTOMER_BEHAVIOR,...r.customerBehavior};
    need(Array.isArray(c.names)&&c.names.length>0&&c.names.length<=100&&c.names.every(n=>typeof n==='string'&&n.trim().length>0&&n.length<=32&&!/[\r\n\t]/.test(n)),'INVALID_CONFIG','顾客姓名池须包含 1～100 个不超过 32 字符的姓名。');
    for(const key of ['openingSeconds','sortingSeconds','searchSeconds'])need(Number.isFinite(c[key])&&c[key]>=.25&&c[key]<=60,'INVALID_CONFIG',`${key} 必须在 0.25～60 秒之间。`);
    for(const key of ['lingerSeconds','maxVisitSeconds','pathStallSeconds'])need(Number.isFinite(c[key])&&c[key]>=1&&c[key]<=600,'INVALID_CONFIG',`${key} 必须在 1～600 秒之间。`);
    for(const key of ['keepCopies','minimumKeptCards','pickupLimit'])need(Number.isSafeInteger(c[key])&&c[key]>=1&&c[key]<=120,'INVALID_CONFIG',`${key} 必须在 1～120 之间。`);
    for(const key of ['poorWallet','poorInitialWallet','pickupCooldownMinutes'])need(Number.isSafeInteger(c[key])&&c[key]>=0&&c[key]<=1000000,'INVALID_CONFIG',`${key} 必须是支持范围内的非负整数。`);
    need(c.pickupCooldownMinutes>0&&Number.isFinite(c.scavengerChance)&&c.scavengerChance>=0&&c.scavengerChance<=1,'INVALID_CONFIG','拾荒比例必须在 0～1 之间，冷却时间必须大于零。');
    if(r.customerBehavior.discardChance!==undefined)need(r.customerBehavior.discardChance&&typeof r.customerBehavior.discardChance==='object'&&!Array.isArray(r.customerBehavior.discardChance),'INVALID_CONFIG','弃牌概率必须是稀有度对象。');
    for(const v of Object.values({...DEFAULT_CUSTOMER_BEHAVIOR.discardChance,...r.customerBehavior.discardChance}))need(Number.isFinite(v)&&v>=0&&v<=1,'INVALID_CONFIG','各稀有度弃牌概率必须在 0～1 之间。');
  }
  return r;
}
export function buildCatalog(source,rules){
  validateRules(rules);
  const model=rules.scoring,text=JSON.stringify([model,rules.thresholds,rules.modeWeights,...(model.method===STRENGTH_MODEL_VERSION?strengthFingerprint():model.method?[RESOURCE_CALIBRATIONS]:[])]);let hash=2166136261;
  for(const ch of text)hash=Math.imul(hash^ch.charCodeAt(0),16777619)>>>0;
  const ratingVersion=`${rules.ratingVersion}-${hash.toString(16)}`;
  const cards=source.cards.map(card=>{
    const assessed=model.method===STRENGTH_MODEL_VERSION?modePower(card,model):model.method?resourcePower(card,model):null,vector=card.power?.vector||{};
    const base=model.baseline+model.hpPoint*(Math.min(model.hpCap,Number(card.hp)||4)-4)+Object.entries(model.weights).filter(([key])=>key!=='carry').reduce((n,[key,weight])=>n+(Number(vector[key])||0)*weight,0);
    const bo3=assessed?.duel??Math.max(0,base),kof=assessed?.kof??Math.max(0,base+(Number(vector.carry)||0)*model.weights.carry);
    const score=assessed?.modeScores?Math.round(RATED_FORMATS.reduce((sum,m)=>sum+assessed.modeScores[m],0)/RATED_FORMATS.length*1000)/1000:Math.round((bo3*rules.modeWeights.bo3+kof*rules.modeWeights.kof)*1000)/1000;
    const rarity=score>=rules.thresholds.SSR?'SSR':score>=rules.thresholds.SR?'SR':score>=rules.thresholds.R?'R':'N';
    return {...card,power:{...card.power,...assessed,score,duel:bo3,kof},cardKey:`noname-1.11.6:${card.id}`,generalId:card.id,skillVersion:'noname-1.11.6',currentRarity:rarity,globalScore:score,ratingVersion,
      imageUrl:`/img/${encodeURIComponent(card.img)}`,reviewStatus:(assessed?assessed.calibrated:card.power?.method==='规则校准估算')?'calibrated':'estimated',
      issuanceValue:Math.max(1,Math.round(rules.referenceValues[rarity]*clamp(score/65,.8,1.35)))};
  });
  const activeCards=cards.filter(c=>productEnabled(rules,c.pack));
  return {cards,activeCards,packs:source.packs.filter(p=>productEnabled(rules,p.id)),byKey:new Map(cards.map(c=>[c.cardKey,c])),byId:new Map(cards.map(c=>[c.id,c])),pools:Object.fromEntries(RARITIES.map(r=>[r,activeCards.filter(c=>c.currentRarity===r).map(c=>c.cardKey)]))};
}
export function cardSummary(c){return {cardKey:c.cardKey,generalId:c.generalId,skillVersion:c.skillVersion,name:c.name,imageUrl:c.imageUrl,currentRarity:c.currentRarity,globalScore:c.globalScore,modeScores:c.power?.modeScores,modeAvailability:c.power?.modeAvailability,ratingVersion:c.ratingVersion,reviewStatus:c.reviewStatus,themeId:c.pack,group:c.group,hp:c.hp};}
export function catalogList(catalog,p={}){
  let rows=(p.includeRetired?catalog.cards:catalog.activeCards||catalog.cards).filter(c=>(!p.search||`${c.name} ${c.generalId}`.toLowerCase().includes(String(p.search).toLowerCase()))&&(!p.rarity||c.currentRarity===p.rarity)&&(!p.themeId||c.pack===p.themeId));
  rows.sort(p.sort==='score'?(a,b)=>b.globalScore-a.globalScore:(a,b)=>a.name.localeCompare(b.name,'zh'));
  return {...page(rows.map(cardSummary),p),ratingVersion:catalog.cards[0]?.ratingVersion};
}
