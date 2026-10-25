// Per personal turn above a blank 4-HP general. These are explicit scenario
// estimates, not measured win rates or official strength rankings.
export const RESOURCE_MODEL_VERSION='resource-yield-1';
export const RESOURCE_CALIBRATIONS={
  clan_xunshuang:{vector:{cards:3.2,control:.5,cost:.3,hpLoss:.15},notes:'两人各一个回合末补至至多5，合计有效补牌估3.2/轮；佯疾控制0.5，蹈节机会成本0.3牌、主动掉血0.15；不按多人次数放大。'},
  clan_zhonghui:{vector:{cards:3.2,cost:1,hpLoss:.25,heal:.2,quality:.3},notes:'迂志平均牌名字数按3.2，轮末弃展示牌1；未满足用牌数的风险折0.25掉血；保族限次救命摊至四轮，挟术只计净牌质。'},
  clan_xunyou:{vector:{cards:2,quality:.8,cost:.25,hpLoss:.1},notes:'百出前期记录与后续回收分开，四轮窗口平均净补2；获得额外技能的未知收益不计，蹈节扣牌/掉血机会成本。'},
  clan_xunchen:{vector:{cards:2.6,cost:.6,heal:.15,control:.15},notes:'三种类别受一名对手资源约束，三恇平均净牌差2.6；交回使用牌机会成本0.6；卑势仅按0.15回血，不把每次满三项当必然。'},
  clan_chentai:{vector:{cards:1.2,damage:.65,guard:.25,cost:.75,quality:.4},notes:'奋剑三项不会全必达，平均有效伤害0.65并扣0.75弃牌；动虚补至攻击范围按1.2净牌、0.25防伤，需独立实战复核。'},
  clan_xunyu:{vector:{cards:1.35,damage:.35,heal:.2,cost:.45,hpLoss:.1},notes:'定安给双方牌不当单方面牌差，仅计抚宁调整/蹈节的1.35净补；定安伤害和弃牌二选一折0.35伤害，不重复相加；扣给牌与掉血。'},
  clan_wangshen:{vector:{cards:2.5,damage:.2,cost:.3},notes:'岸然成长到至多4，四轮平均有效补牌2.5；不能立即用的新牌不另计牌质收益；告变按一次对手最优选择折0.2伤害。'},
  clan_chenqun:{vector:{cards:.65,quality:1.1,control:.2},notes:'明典重铸本身牌差0，只计额外基本牌净收益0.65；重铸计牌质1.1；革制双方各一张不直接当偷牌+2。'},
  clan_wangyun:{vector:{cards:1.35,quality:.6,control:.25},notes:'解悬和中流重置按四轮窗口有限有效次数估净牌差1.35；铭戒重复利用仅计有效牌质0.6，单挑额外目标不加收益。'},
  clan_xunshu:{vector:{cards:.65,quality:1.1,cost:.35,hpLoss:.1},notes:'八龙两人局只补至2，不能套多人补牌；神君按转化牌质、蹈节按回收净收益并扣成本，不按技能数加分。'},
  clan_wangling:{vector:{damage:.45,cost:.6,quality:.3},notes:'驳龙按对手最优选择：常见为交牌后出雷杀；扣实际交牌成本，不假定对手必选送钱路线；中流有效再发动只计有限牌质。'},
  clan_zhongyao:{vector:{quality:1.3,heal:.2,cost:.25,cards:.4},notes:'承启至少两牌转一牌，扣净机会成本；诫厉换牌只计牌质，不计免费摸牌；保族一局限一次摊入四轮。'},
};

export function resourcePower(card,model){
  const calibration=RESOURCE_CALIBRATIONS[card.id];
  const vector={...(calibration?.vector||card.power?.vector||{}),carry:0};
  const contributions=Object.fromEntries(Object.entries(model.weights).filter(([key])=>key!=='carry'&&key!=='burst').map(([key,weight])=>[key,(Number(vector[key])||0)*weight]));
  const hpPoints=model.hpPoint*(Math.min(model.hpCap,Number(card.hp)||4)-4);
  const score=Math.round(Math.max(0,model.baseline+hpPoints+Object.values(contributions).reduce((a,b)=>a+b,0))*1000)/1000;
  const calibrated=!!calibration||card.power?.method==='规则校准估算';
  const confidence=calibration?0.6:(card.power?.confidence??0.2);
  return {score,duel:score,kof:score,vector,method:calibrated?'收益论校准估算':'收益论初估·待复核',confidence,
    modelVersion:RESOURCE_MODEL_VERSION,calibrated,provenance:'rules-estimate',unit:'每己方回合等效牌收益',netCardEquivalent:Math.round(Object.values(contributions).reduce((a,b)=>a+b,0)/(Math.abs(model.weights.cards)||10)*1000)/1000,
    contributions:{...contributions,hp:hpPoints},
    notes:(calibration?.notes||card.power?.notes||'缺少可量化技能收益，暂按待复核。')+' 统一以1血约2牌折算；4轮摊销体力差；不额外叠加爆发或KOF手牌继承分。',
    flags:[...(card.power?.flags||[]),'理论期望估算，非实测胜率；复杂技能需要逐项复核']};
}
