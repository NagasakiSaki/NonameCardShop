import policy from '../../data/strength-modes.json' with {type:'json'};
import nativeEligibility from '../../data/v7/native-eligibility.json' with {type:'json'};
import {idealRolePower,IDEAL_YIELD_FINGERPRINT} from './ideal-yield.mjs';
import {clone,need} from './common.mjs';
export const STRENGTH_MODEL_VERSION=policy.version;
export const RATED_FORMATS=['kof','doudizhu-bo3','versus2v2-bo3'];
export const MODE_LABELS={kof:'1v1 三将接力','doudizhu-bo3':'斗地主','versus2v2-bo3':'2v2'};
export const strengthFingerprint=()=>[...IDEAL_YIELD_FINGERPRINT,nativeEligibility];
const round=n=>Math.round(n*1000)/1000;
export function modePower(card,model){
 const roles=Object.fromEntries(Object.keys(policy.profiles).map(role=>[role,idealRolePower(card,role,model)]));
 const modeScores={kof:roles.kof.score,'doudizhu-bo3':round((roles.landlord.score+roles.farmer.score)/2),'versus2v2-bo3':roles['versus2v2-bo3'].score};
 const availability=Object.fromEntries(RATED_FORMATS.map(format=>[format,!nativeEligibility.formats[format]?.blocked?.[card.id]]));
 for(const format of RATED_FORMATS)if(!availability[format])modeScores[format]=0;
 const score=round(RATED_FORMATS.reduce((n,k)=>n+modeScores[k],0)/3),keys=Object.keys(roles.kof.contributions);
 const contributions=Object.fromEntries(keys.map(k=>[k,round(((availability.kof?roles.kof.contributions[k]:0)+(availability['doudizhu-bo3']?(roles.landlord.contributions[k]+roles.farmer.contributions[k])/2:0)+(availability['versus2v2-bo3']?roles['versus2v2-bo3'].contributions[k]:0))/3)]));
 contributions.unavailable=round(-model.baseline*RATED_FORMATS.filter(k=>!availability[k]).length/3);
 return {score,duel:modeScores.kof,kof:modeScores.kof,modeScores,roles,modeAvailability:availability,modelVersion:STRENGTH_MODEL_VERSION,provenance:'ideal-two-round-yield',method:'两回合理想血差/牌差收益论',aggregation:'arithmetic-mean-of-three',scenario:clone(policy.scenario),contributions,vector:roles.kof.vector,confidence:Math.min(...Object.values(roles).map(r=>r.confidence)),calibrated:Object.values(roles).every(r=>r.reviewStatus==='calibrated'),netCardEquivalent:round((score-model.baseline)/policy.scenario.pointsPerCardEquivalent),unit:'两轮总等效牌差（含体力差）',components:roles.kof.components,notes:'两个完整轮次：每轮己方造成1次1点伤害，回合外受到1次1点伤害；1血=2牌。基础事件不重复加减，技能只算增量；强中与拆装备计小额独立加分。全局分=(KOF+(地主+农民)/2+2v2)/3。',flags:[...new Set([...Object.values(roles).flatMap(r=>r.flags),'理想场景理论值，非实测胜率','多刀、觉醒、未知变量与配合链需单项复核'])]};
}
export function initialiseRating(w,defaults){
 if(defaults.scoring?.method!==STRENGTH_MODEL_VERSION||w.ratingRulesVersion===STRENGTH_MODEL_VERSION)return false;
 if(w.rules.scoring?.method&&![STRENGTH_MODEL_VERSION,'resource-three-mode-3','resource-yield-1'].includes(w.rules.scoring.method))return false;
 w.rules.scoring=clone(defaults.scoring);w.rules.ratingVersion=defaults.ratingVersion;w.rules.modeWeights=clone(defaults.modeWeights);w.ratingRulesVersion=STRENGTH_MODEL_VERSION;return true;
}
export function validateModeScoring(model,weights){
 if(model?.method!==STRENGTH_MODEL_VERSION)return;
 const s=policy.scenario;need(s.rounds===2&&s.outgoingDamageEventsPerRound===1&&s.incomingDamageEventsPerRound===1&&s.outgoingDamagePerEvent===1&&s.incomingDamagePerEvent===1&&s.hpToCards===2,'INVALID_CONFIG','收益论固定为两回合、每轮一次造成/受到一点伤害、1血2牌。');
 need(Number.isFinite(s.pointsPerCardEquivalent)&&s.pointsPerCardEquivalent>0&&s.pointsPerCardEquivalent<=20&&s.reliableHitBonus>=0&&s.reliableHitBonus<=.25&&s.equipmentBreakBonus>=0&&s.equipmentBreakBonus<=.25,'INVALID_CONFIG','评分倍率或小额加分越界。');
 need(RATED_FORMATS.every(k=>Math.abs((weights?.[k]??0)-1/3)<1e-12)&&Object.keys(weights).length===3,'INVALID_CONFIG','三模式定价使用等权平均。');
}
