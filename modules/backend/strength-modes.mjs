import policy from '../../data/strength-modes.json' with {type:'json'};
import nativeEligibility from '../../data/v7/native-eligibility.json' with {type:'json'};
import {resourcePower,RESOURCE_CALIBRATIONS} from './resource-power.mjs';
import {clamp,clone,need} from './common.mjs';

export const STRENGTH_MODEL_VERSION=policy.version;
export const RATED_FORMATS=['kof','doudizhu-bo3','versus2v2-bo3'];
export const MODE_LABELS={kof:'1v1 三将接力','doudizhu-bo3':'斗地主','versus2v2-bo3':'2v2'};
export const strengthFingerprint=()=>[policy,RESOURCE_CALIBRATIONS,nativeEligibility];
const round=n=>Math.round(n*1000)/1000;
const zero=()=>({cards:0,damage:0,guard:0,heal:0,control:0,quality:0,cost:0,hpLoss:0,burst:0,carry:0});
const textOf=c=>(c.skills||[]).map(s=>s.description||'').join('\n');

// Only explicit exposure-sensitive components are scaled; optional single-target skills remain single-target.
function contextualVector(card,base,role){
  const p=policy.profiles[role],anchor=policy.anchors[card.id],override=anchor?.roles[role];
  if(override)return {vector:{...zero(),...base.vector,...override,carry:0,burst:0},curated:true,notes:[anchor.notes],confidence:Math.min(.7,Math.max(base.confidence,.6))};
  const v={...zero(),...base.vector,carry:0,burst:0},components=card.power?.components||[],notes=[];
  const fraction=(test,dimension)=>{
    const total=components.reduce((sum,c)=>sum+Math.abs(c.vector?.[dimension]||0),0);
    if(!total)return 0;
    return Math.min(1,components.filter(c=>test((card.skills||[]).find(s=>s.id===c.id)?.description||'')).reduce((sum,c)=>sum+Math.abs(c.vector?.[dimension]||0),0)/total);
  };
  const damageTrigger=t=>/受到.{0,12}伤害/.test(t)&&!/每轮限一次/.test(t);
  const allTargets=t=>/所有其他角色|所有角色|任意名角色|至少两名|至多[三四五六七八]名/.test(t)&&!/每轮限一次/.test(t);
  const otherTurns=t=>/其他角色.{0,20}(回合|阶段)|一名角色的.{0,8}阶段|每个回合/.test(t)&&!/每轮限一次/.test(t);
  const once=t=>/限定技|游戏开始时|进入游戏时|首次/.test(t);
  const growth=t=>/觉醒技|蓄力|逐渐|永久|每轮.{0,12}增加/.test(t);
  for(const d of ['cards','damage','guard','heal','control','quality','cost','hpLoss']){
    let factor=1;
    factor+=fraction(damageTrigger,d)*(p.incoming-1);
    // Effective opposing targets, not all bodies: beneficial and hostile effects cannot both be counted as gains.
    factor+=fraction(allTargets,d)*Math.min(1,p.enemies-1)*.5;
    factor+=fraction(otherTurns,d)*Math.min(1,(p.enemies-1+p.allies)*.35);
    factor+=fraction(once,d)*(policy.baseHorizon/p.horizon-1);
    factor-=fraction(growth,d)*(1-p.growth);
    v[d]=round(v[d]*clamp(factor,.5,2));
  }
  const text=textOf(card);
  if(p.allies&&/交给|分配|令.{0,12}角色.{0,12}(摸|回复)/.test(text))notes.push('含团队收益；未校准的部分不凭技能文字额外赠送牌差，等待单项复核');
  if(/每轮限一次/.test(text))notes.push('每轮限次不按场上人数直接倍增');
  if(role==='kof')notes.push('较短接力窗口；不继承手牌/装备，不计旧 carry 分');
  return {vector:v,curated:base.calibrated,notes,confidence:Math.min(base.confidence,p.allies ? .35 : .55)};
}
function assessRole(card,model,base,role){
  const p=policy.profiles[role],ctx=contextualVector(card,base,role);
  const contributions=Object.fromEntries(Object.entries(model.weights).filter(([d])=>d!=='burst'&&d!=='carry').map(([d,weight])=>[d,round(ctx.vector[d]*weight)]));
  // Native landlord HP/skills belong to the role's blank baseline, never a free bonus to every general.
  contributions.hp=round(model.hpPoint*(policy.baseHorizon/p.horizon)*(Math.min(model.hpCap,Number(card.hp)||4)-4));
  const net=Object.values(contributions).reduce((a,b)=>a+b,0);
  return {score:round(clamp(model.baseline+net,0,policy.scoreCap)),netCardEquivalent:round(net/(Math.abs(model.weights.cards)||10)),vector:ctx.vector,contributions,confidence:ctx.confidence,reviewStatus:ctx.curated?'calibrated':'estimated',notes:ctx.notes};
}
export function modePower(card,model){
  const base=resourcePower(card,model),roles=Object.fromEntries(Object.keys(policy.profiles).map(role=>[role,assessRole(card,model,base,role)]));
  const modeScores={kof:roles.kof.score,'doudizhu-bo3':round((roles.landlord.score+roles.farmer.score)/2),'versus2v2-bo3':roles['versus2v2-bo3'].score};
  const availability=Object.fromEntries(RATED_FORMATS.map(format=>[format,!nativeEligibility.formats[format]?.blocked?.[card.id]]));
  for(const format of RATED_FORMATS)if(!availability[format])modeScores[format]=0;
  const score=round(RATED_FORMATS.reduce((sum,format)=>sum+modeScores[format],0)/RATED_FORMATS.length);
  const modeParts={kof:roles.kof.contributions,'versus2v2-bo3':roles['versus2v2-bo3'].contributions,'doudizhu-bo3':Object.fromEntries(Object.keys(roles.landlord.contributions).map(d=>[d,(roles.landlord.contributions[d]+roles.farmer.contributions[d])/2]))};
  const contributions=Object.fromEntries(Object.keys(roles.kof.contributions).map(d=>[d,round(RATED_FORMATS.reduce((sum,m)=>sum+(availability[m]?modeParts[m][d]:0),0)/RATED_FORMATS.length)]));contributions.unavailable=round(-model.baseline*RATED_FORMATS.filter(m=>!availability[m]).length/RATED_FORMATS.length);
  return {...base,contributions,score,duel:modeScores.kof,kof:modeScores.kof,modeScores,roles,modeAvailability:availability,modelVersion:STRENGTH_MODEL_VERSION,provenance:'three-mode-rules-estimate',method:'三模式资源收益估算',aggregation:'arithmetic-mean-of-three',confidence:Math.min(...Object.values(roles).map(r=>r.confidence)),
    calibrated:base.calibrated||!!policy.anchors[card.id],netCardEquivalent:round((score-model.baseline)/(Math.abs(model.weights.cards)||10)),
    notes:'全局分=(KOF+斗地主+2v2)/3；斗地主=(地主+农民)/2。模式禁用记0，不进入该模式选将。'+(policy.anchors[card.id]?.notes||'未校准技能保留保守初估；范围、触发和行动窗口见各模式明细。'),
    flags:[...new Set([...(base.flags||[]),'三模式理论估算，非官方排名或实测胜率','团队配合与条件概率仍需实战校准'])]};
}
export function initialiseRating(w,defaults){
  if(defaults.scoring?.method!==STRENGTH_MODEL_VERSION||w.ratingRulesVersion===STRENGTH_MODEL_VERSION)return false;
  if(w.rules.scoring?.method&&![STRENGTH_MODEL_VERSION,'resource-yield-1'].includes(w.rules.scoring.method))return false;
  w.rules.scoring=clone(defaults.scoring);w.rules.ratingVersion=defaults.ratingVersion;w.rules.modeWeights=clone(defaults.modeWeights);w.ratingRulesVersion=STRENGTH_MODEL_VERSION;return true;
}
export function validateModeScoring(model,weights){
  if(model?.method!==STRENGTH_MODEL_VERSION)return;
  need(policy.aggregation==='arithmetic-mean-of-three'&&Number.isFinite(policy.scoreCap)&&policy.scoreCap>=50&&policy.scoreCap<=500,'INVALID_CONFIG','三模式评分策略格式不正确。');
  for(const role of ['kof','landlord','farmer','versus2v2-bo3']){const p=policy.profiles[role];need(p&&p.enemies>=1&&p.enemies<=2&&p.allies>=0&&p.allies<=1&&p.horizon>=1&&p.horizon<=12&&p.incoming>=.5&&p.incoming<=2&&p.growth>=0&&p.growth<=1,'INVALID_CONFIG','评分场景参数越界：'+role);}
  for(const a of Object.values(policy.anchors))for(const [role,v]of Object.entries(a.roles))need(policy.profiles[role]&&Object.entries(v).every(([k,n])=>Object.hasOwn(zero(),k)&&Number.isFinite(n)&&n>=0&&n<=10),'INVALID_CONFIG','评分校准向量不合法。');
  need(RATED_FORMATS.every(format=>Math.abs((weights?.[format]??0)-1/RATED_FORMATS.length)<1e-12)&&Object.keys(weights).length===RATED_FORMATS.length,'INVALID_CONFIG','三模式定价必须使用各占三分之一的平均分。');
}
