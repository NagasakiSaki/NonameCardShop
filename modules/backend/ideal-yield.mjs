// Two complete personal rounds, above a blank 4-HP general in the same role.
// Baseline damage/draw is shared: only skill-created DIFFERENCES are scored.
import policy from '../../data/strength-modes.json' with {type:'json'};
import anchors from '../../data/ideal-yield-anchors.json' with {type:'json'};
import {clamp} from './common.mjs';
const DIMS=['cards','damage','guard','heal','cost','hpLoss','reliable','equipment'];
const zero=()=>Object.fromEntries(DIMS.map(k=>[k,0]));
const round=n=>Math.round(n*1000)/1000;
const number=s=>({'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}[s]??Number(s));
const net=v=>v.cards-v.cost+policy.scenario.hpToCards*(v.damage+v.guard+v.heal-v.hpLoss);
const scale=(v,n)=>Object.fromEntries(DIMS.map(k=>[k,(v[k]||0)*n]));
const add=(a,b)=>{for(const k of DIMS)a[k]+=(b[k]||0);return a;};

function curated(skill,role){
 const n=policy.scenario.rounds,p=policy.profiles[role],a=anchors.skills[skill.id];
 if(a)return {vector:scale(a.perRound,n),notes:[a.notes],confidence:.85,calibrated:true};
 if(skill.id==='fankui')return {vector:{...zero(),cards:2*n,equipment:1},notes:['每次受伤偷敌人一张=己方+1、敌方−1，共2牌差；最多拆初始一件装备。'],confidence:.85,calibrated:true};
 if(skill.id==='tuxi')return {vector:{...zero(),cards:2*Math.min(2,p.enemies)*n,cost:policy.scenario.normalDrawPerTurn*n},notes:['只偷敌人，每人一次；替代正常摸两张。偷队友是内部转移，不当敌我牌差。'],confidence:.85,calibrated:true};
 if(skill.id==='rende')return {vector:{...zero(),heal:p.allies?Math.max(0,n-1):0},notes:['给队友不改变团队总牌数；第一轮满血，第二轮可回复前一轮失去的一点体力。'],confidence:.8,calibrated:true};
 if(skill.id==='fanjian')return {vector:zero(),notes:['随机猜错3/4的额外伤害值1.5牌，交给敌人一牌造成−2牌差；可选技能在本场景不发动更优。'],confidence:.8,calibrated:true};
 if(skill.id==='lijian')return {vector:{...zero(),damage:p.enemies>=2?n:0,cost:p.enemies>=2?n:0},notes:[p.enemies>=2?'理想男性目标成立，令两名敌人决斗，每轮额外伤害1并扣一张发动成本。':'不足两名敌人，借队友出杀需额外支付团队牌张，不预设正收益。'],confidence:.65,calibrated:true};
 if(skill.id==='enyuan')return {vector:{...zero(),cards:2*n},notes:['每次受伤后，对手交一张牌（2牌差）或失去一点体力（2牌等价），二选一只计一次；不预设他人额外为你回血。'],confidence:.8,calibrated:true,trigger:'incoming'};
 if(skill.id==='xuanhuo')return {vector:{...zero(),equipment:p.allies?1:0},notes:['需两名其他角色；两人局不能发动。给牌、偷牌、再转交必须一起结算，理想团队路径净牌差0，只计一次拆装备附加价值。'],confidence:.75,calibrated:true};
 if(skill.id==='old_anxu')return {vector:{...zero(),cards:(p.allies?2.75:p.enemies>=2?.75:0)*n},notes:['须两名其他角色；理想敌我手牌差转移=2，非黑桃摸牌期望3/4。只在两敌间转移时团队牌差0；单挑不发动。'],confidence:.75,calibrated:true};
 if(skill.id==='zhuiyi')return {vector:zero(),notes:['正常三血武将在两次基础伤害后仍存活，不预设死亡追忆事件。'],confidence:.75,calibrated:true};
 if(skill.id==='danshou')return {vector:{...zero(),equipment:1},notes:['胆守按递增成本逐次结算：弃1拆1净0，弃2偷1净0，弃3打1净负。理想选择不连续执行亏损分支，仅一件装备小额价值。'],confidence:.8,calibrated:true};
 if(skill.id==='oldqianxi')return {vector:zero(),notes:['潜袭防止的是自己本次输出，不是防止自己受伤；扣上限替代基础伤害，两轮内不凭空再加防伤/伤害。'],confidence:.7,calibrated:true};
 return null;
}

function estimate(skill,card,role){
 const known=curated(skill,role);if(known)return {...known,id:skill.id,trigger:known.trigger||(['jianxiong','yiji','fankui'].includes(skill.id)?'incoming':'own')};
 const t=(skill.description||'').replace(/<[^>]*>/g,''),v=zero(),notes=[],flags=[];
 const p=policy.profiles[role],s=policy.scenario,n=s.rounds;
 if(/[XYZＸＹＺ]/.test(t))return {id:skill.id,vector:v,notes:['变量条件与递增成本未完整求解，不截取其中正收益冒充免费发动。'],flags:['变量/成本需单项复核'],confidence:.15,calibrated:false};
 if(/当.{0,24}(?:回复.{0,6}体力后|死亡时|死亡后|进入濒死)/.test(t))return {id:skill.id,vector:v,notes:['场景未预设额外回血、死亡或濒死触发。'],flags:['额外事件未触发'],confidence:.3,calibrated:false};
 if(/选择(?:其中)?一项|执行一项/.test(t)){
  const marker=t.search(/[①②③④⑤⑥]|[1-6][.．、]/);
  if(marker>=0){const prefix=t.slice(0,marker).replace(/(?:选择(?:其中)?一项|执行一项)[：:]?/,''),parts=t.slice(marker).split(/[①②③④⑤⑥]|[1-6][.．、]/).filter(Boolean);if(parts.length>1){const choices=parts.map((part,i)=>estimate({id:skill.id+'#'+i,description:prefix+part},card,role));const best=choices.sort((a,b)=>net(b.vector)-net(a.vector))[0];return {...best,id:skill.id,notes:['互斥选项只取理想场景下收益最高的一项',...best.notes]};}}
  return {id:skill.id,vector:v,notes:['未解码的互斥分支不相加，等待单项校准。'],flags:['互斥选项需复核'],confidence:.15,calibrated:false};
 }
 if(/主公技/.test(t))return {id:skill.id,vector:v,notes:['不预设主公技响应或额外同势力队友。'],flags:[],confidence:.5,calibrated:false};
 if(/觉醒技|使命技|获得.{0,16}技能|视为拥有/.test(t))return {id:skill.id,vector:v,notes:['两回合内的觉醒/使命/技能获取链需要单独校准，不凭技能数量加分。'],flags:['复杂技能需复核'],confidence:.15,calibrated:false};
 const once=/限定技|游戏开始时|进入游戏时|首次/.test(t),f=once?1:n;
 const trigger=/受到.{0,12}伤害/.test(t)?'incoming':/造成.{0,12}伤害/.test(t)?'outgoing':'own';
 notes.push(`${once?'一次性窗口':trigger==='incoming'?'每轮一次受伤触发':trigger==='outgoing'?'每轮一次造成伤害触发':'每轮一个己方行动窗口'}，合计 ${f} 次`);
 if(/[XYZＸＹＺ]|选择一项|选择.{0,5}项|改为|交换|补至|至多|每名角色|每个回合/.test(t))flags.push('变量/互斥分支需复核');
 // Exact substitutions: spending one card and removing an enemy card is not +1.
 if(/当[做作].{0,2}【过河拆桥】/.test(t)){v.cards+=f;v.cost+=f;v.equipment+=1;notes.push('过河拆桥转化按一换一，净牌差0');}
 else if(/当[做作].{0,2}【顺手牵羊】/.test(t)){v.cards+=2*f;v.cost+=f;v.equipment+=1;notes.push('顺手牵羊转化扣自身一张，只净增一牌差');}
 const clauses=t.split(/[。；;]/);
 for(const part of clauses){
  const enemyTarget=/(?:该角色|其|目标角色|伤害来源|其他角色)/.test(part),ownDraw=/(?:你|然后|并|可以|可)?(?:额外|多)?摸([一二两三四五六七八九\d])张/g;
  for(const m of part.matchAll(ownDraw)){
   const preceding=part.slice(Math.max(0,m.index-10),m.index);
   if(/少$/.test(preceding))continue;
   if(enemyTarget&&!/你(?:可以|可|额外|多)?$/.test(preceding)){
    if(p.allies&&/任意|一名角色|其他角色/.test(part)&&!/所有/.test(part))v.cards+=number(m[1])*f;
    else flags.push('摸牌接收者未确定，不当作己方摸牌');
   }else v.cards+=number(m[1])*f;
  }
  for(const m of part.matchAll(/(?:你(?:可以|可|须|需|先)?|然后|并)?弃置([一二两三四五六七八九\d])张(?:手牌|牌)/g)){
   const before=part.slice(Math.max(0,m.index-8),m.index);if(/(?:令其|该角色|令.{0,4}角色)$/.test(before))v.cards+=number(m[1])*f;else v.cost+=number(m[1])*f;
  }
  for(const m of part.matchAll(/少摸([一二两三四五六七八九\d])张/g))v.cost+=number(m[1])*f;
  for(const m of part.matchAll(/获得(?:其|该角色|一名其他角色|伤害来源|目标角色)(?:的)?([一二两三四五六七八九\d])张(?:手牌|装备牌|牌)/g)){v.cards+=2*number(m[1])*f;if(!m[0].includes('手牌'))v.equipment+=1;}
  if(/获得.{0,12}造成伤害的牌/.test(part))v.cards+=f;
  for(const m of part.matchAll(/弃置(?:其|该角色|一名其他角色|目标角色|伤害来源)(?:区域内|区域里|的)?([一二两三四五六七八九\d])张/g)){v.cards+=number(m[1])*f;if(/装备|区域/.test(part))v.equipment+=1;}
  for(const m of part.matchAll(/(?:交给|交予)(?:其|该角色|一名其他角色|目标角色)([一二两三四五六七八九\d])张/g)){if(!p.allies)v.cost+=2*number(m[1])*f;else flags.push('分牌按团队内部转移，需核对接收者');}
  for(const m of part.matchAll(/造成([一二两三四五六七八九\d])点(?:火焰|雷电|冰冻)?伤害/g)){
   const before=part.slice(0,m.index);if(/当/.test(before)&&!/[，,:：]/.test(before))continue;
   if(/对你/.test(part))flags.push('额外伤害的承担者需复核');else v.damage+=number(m[1])*f;
  }
  if(/伤害(?:值)?[＋+]1|伤害(?:值)?增加1|伤害(?:值)?增加一/.test(part))v.damage+=f;
  for(const m of part.matchAll(/你(?:可以|可|须|需|先)?失去([一二两三四五六七八九\d])点体力(?!上限)/g)){const before=part.slice(0,m.index);if(!(/当/.test(before)&&!/[，,:：]/.test(before)))v.hpLoss+=number(m[1])*f;}
  for(const m of part.matchAll(/回复([一二两三四五六七八九\d])点体力/g)){
   const before=part.slice(0,m.index);if(/当/.test(before)&&!/[，,:：]/.test(before))continue;
   if(!enemyTarget||/你(?:可以|可)?回复/.test(part))v.heal+=Math.min(number(m[1])*f,trigger==='incoming'?n:Math.max(0,n-1));
   else if(p.allies)v.heal+=Math.min(number(m[1])*f,1);else flags.push('回复目标可能是敌人，不计己方回血');
  }
 }
 if(/防止.{0,10}伤害|受到.{0,10}伤害.{0,8}减少[一1]/.test(t)&&!/当你使用.{0,24}造成伤害/.test(t))v.guard+=n;
 if(/跳过.{0,8}摸牌阶段/.test(t)){if(/令.{0,12}(?:其|角色)|该角色/.test(t))v.cards+=2*f;else v.cost+=2*f;}
 if(/(?:此【杀】|此杀|此牌|【杀】).{0,10}(?:不可被响应|不可被闪避|不能被响应)|不能使用【闪】|不能响应|不可响应/.test(t))v.reliable+=Math.min(n,f);
 if(/弃置|获得|移去|置入弃牌堆/.test(t)&&/装备区|装备牌|武器|防具/.test(t)&&/对方|敌方|其|该角色|目标角色|其他角色|伤害来源/.test(t))v.equipment+=1;
 if(/判定|拼点/.test(t)){flags.push('未校准判定/拼点概率');}
 if(/翻面|额外.{0,8}回合|无次数限制|次数上限/.test(t))flags.push('行动窗口变化需单项复核，未凭空增加伤害次数');
 if(/令|选择一项|选择.{0,3}项|或/.test(t)&&net(v)<0&&!/锁定技/.test(t)){for(const k of DIMS)v[k]=0;notes.push('可选负收益动作不发动');}
 const ce=net(v);if(Math.abs(ce)>s.perSkillCardEquivalentCap){const factor=s.perSkillCardEquivalentCap/Math.abs(ce);for(const k of DIMS)v[k]*=factor;flags.push('超过单技能审计上限，需复核');}
 const hasEffect=DIMS.some(k=>v[k]);if(!hasEffect)flags.push('无确定净血牌差，未量化的机制保留待复核');
 return {id:skill.id,vector:v,notes,flags,trigger,confidence:hasEffect?(flags.length?.25:.5):.2,calibrated:false};
}

export function idealRolePower(card,role,model){
 const s=policy.scenario,components=(card.skills||[]).map(skill=>estimate(skill,card,role));
 const prevented=Math.min(s.rounds,components.reduce((n,c)=>n+(c.vector.guard||0),0));
 if(prevented)for(const c of components)if(c.trigger==='incoming'&&!c.vector.guard){c.vector=scale(c.vector,(s.rounds-prevented)/s.rounds);c.notes.push('防止的伤害不能再触发受伤收益，按剩余受伤事件计算');}
 const v=components.reduce((a,c)=>add(a,c.vector),zero());
 // A single initial equipment cannot be destroyed again in the second round.
 v.equipment=clamp(v.equipment,0,s.opponentEquipmentAtStart+s.equipmentReplenishment*s.rounds);
 v.reliable=clamp(v.reliable,0,s.rounds);v.guard=clamp(v.guard,0,s.rounds);
 v.heal=Math.min(v.heal,Math.max(0,s.rounds-v.guard+v.hpLoss+(policy.profiles[role].allies?1:0)));
 const hpDifference=(Math.min(model.hpCap,Number(card.hp)||4)-s.baselineHp)*s.hpToCards;
 const reliableBonus=Math.min(s.bonusCap,v.reliable*s.reliableHitBonus),equipmentBonus=Math.min(s.bonusCap,v.equipment*s.equipmentBreakBonus);
 const cardDifference=v.cards-v.cost,hpDifferenceFromSkills=v.damage+v.guard+v.heal-v.hpLoss;
 const cardEquivalent=cardDifference+s.hpToCards*hpDifferenceFromSkills+hpDifference+reliableBonus+equipmentBonus;
 const contributions={cards:round(v.cards*s.pointsPerCardEquivalent),cost:round(-v.cost*s.pointsPerCardEquivalent),damage:round(v.damage*s.hpToCards*s.pointsPerCardEquivalent),guard:round(v.guard*s.hpToCards*s.pointsPerCardEquivalent),heal:round(v.heal*s.hpToCards*s.pointsPerCardEquivalent),hpLoss:round(-v.hpLoss*s.hpToCards*s.pointsPerCardEquivalent),hp:round(hpDifference*s.pointsPerCardEquivalent),reliable:round(reliableBonus*s.pointsPerCardEquivalent),equipment:round(equipmentBonus*s.pointsPerCardEquivalent)};
 return {score:round(clamp(model.baseline+cardEquivalent*s.pointsPerCardEquivalent,0,policy.scoreCap)),netCardEquivalent:round(cardEquivalent),cardDifference:round(cardDifference),hpDifference:round(hpDifferenceFromSkills+hpDifference/s.hpToCards),vector:v,contributions,components,confidence:Math.min(.85,components.length?components.reduce((n,c)=>n+c.confidence,0)/components.length:.8),reviewStatus:components.every(c=>c.calibrated)?'calibrated':'estimated',notes:components.flatMap(c=>c.notes||[]),flags:[...new Set(components.flatMap(c=>c.flags||[]))]};
}
export const IDEAL_YIELD_FINGERPRINT=[policy,anchors];
