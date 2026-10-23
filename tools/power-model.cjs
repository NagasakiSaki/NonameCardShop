/* CE = card-equivalent, measured above a blank 4-HP general, per personal turn.
   Semantic estimates are a review queue, never measured win rates. */
const DIMS=['cards','damage','guard','heal','control','quality','cost','hpLoss','burst','carry'];
const number=t=>({'一':1,'二':2,'两':2,'三':3,'四':4,'五':5,'六':6,'七':7,'八':8,'九':9}[t]||Number(t)||1);
const clamp=(n,a,b)=>Math.max(a,Math.min(b,n));
function estimateSkill(skill,record,settings){
  const text=(skill.description||'').replace(/<[^>]*>/g,''),code=record?.code||'',v=Object.fromEntries(DIMS.map(k=>[k,0])),evidence=[],flags=[];
  if(/主公技/.test(text)||/zhuSkill\s*:\s*true/.test(code))return {id:skill.id,vector:v,frequency:0,confidence:.8,evidence:['中立单挑无主公收益'],flags:[]};
  if(/两名其他|两名男性|两名[^。]*其他/.test(text)){flags.push('可能依赖第三人');}
  const complex=/[XYZＸＹＺ]|技能|使命|觉醒|标记|转换技|交换|所有|任意|选择一项/.test(text);
  let f=/当你受到|受到.*伤害后/.test(text)?settings.assumptions.damageEvents:/造成.*伤害后/.test(text)?settings.assumptions.damageDealtEvents:/当你使用|当你.*牌后/.test(text)?settings.assumptions.cardEvents:1;
  if(/若|如果|当.*时|可以判定|拼点/.test(text))f*=settings.assumptions.conditional;
  if(/限定技/.test(text))f=1/settings.assumptions.turnsPerGeneral;
  if(/觉醒技|使命技/.test(text)){f*=.35;flags.push('觉醒/使命需人工复核');}
  if(/每轮/.test(text))f=Math.min(f,1);
  if(/每名角色|所有其他角色/.test(text))flags.push('仅按一个对手计入，不使用多人倍率');
  const patterns=[['cards',/(?:你|然后|可以|额外|多)?摸([一二两三四五六七八九\d])张/g,1],['cards',/获得(?:其|该角色|一名其他角色|伤害来源|目标角色)(?:的)?([一二两三四五\d])张(?:手牌|牌)/g,2],['damage',/造成([一二两三四五\d])点(?:火焰|雷电)?伤害/g,1],['guard',/(?:防止|减少)(?:此|此次)?(?:伤害|受到的伤害)/g,.6],['heal',/回复([一二两三四五\d])点体力/g,1],['cost',/你(?:可以|须|先)?弃置([一二两三四五\d])张(?:手牌|牌)/g,1],['hpLoss',/你(?:可以|须|先)?失去([一二两三四五\d])点体力/g,1]];
  for(const [dim,re,mul] of patterns){for(const m of text.matchAll(re)){v[dim]+=number(m[1])*mul;evidence.push(`${dim}:「${m[0]}」`);}}
  if(/(?:你)?少摸([一二两三四\d])张/.test(text)){v.cost+=number(RegExp.$1);evidence.push('扣除少摸牌成本');}
  if(/弃置(?:其|该角色|一名其他角色|目标角色)(?:区域内|区域里|的)?(?:一|1)张/.test(text)){v.cards+=1;evidence.push('对手弃一张 = +1 净牌差');}
  if(/伤害(?:值)?\+1/.test(text)){v.damage+=.45;evidence.push('伤害增幅按命中机会折算');}
  if(/跳过.*(?:出牌|摸牌)阶段|乐不思蜀|不能使用或打出/.test(text)){v.control+=.65;evidence.push('限制行动机会');}
  if(/不能成为|无法成为|不能.*目标/.test(text))v.guard+=.35;
  if(/当[做作]|视为|转化/.test(text)){v.quality+=.45;evidence.push('转化只计牌质，不视为免费摸牌');}
  if(/观看|置于牌堆顶|展示/.test(text))v.quality+=.18;
  if(/无次数限制|没有数量限制|次数上限\+/.test(text)){v.damage+=.25;v.burst+=.35;}
  if(/不可被响应|不可被闪避|不能响应/.test(text)){v.damage+=.35;}
  if(/额外的回合|额外进行.*回合/.test(text)){v.control+=1.2;v.burst+=1;flags.push('额外回合估算，待实战校准');}
  if(/翻面/.test(text)){v.cost+=.7;evidence.push('翻面按损失行动计成本，语义需复核');}
  if(/失去.*体力上限|减.*体力上限/.test(text))v.hpLoss+=.25;
  if(/其他角色.*(?:摸|回复)|令.*角色.*(?:摸|回复)/.test(text)){flags.push('收益接收者可能非自己');for(const k of ['cards','heal'])v[k]*=.45;}
  if(/改为/.test(text)){flags.push('替代原有效果，须核对机会成本');v.cost+=v.cards>0?1:0;}
  if(/受到.*伤害后/.test(text))evidence.push('卖血收益按被动受伤频率；额外主动卖血成本另扣');
  if(!record)flags.push('缺少代码记录');
  if(!text)flags.push('无技能描述');
  if(complex)flags.push('复杂语义未完整求解');
  const confidence=!text.length ? .15 : complex ? .35 : .55;
  // Conservative bounds per skill. Unknown skill acquisition is NOT rewarded by skill count.
  for(const k of ['cards','damage','guard','heal','control','quality','cost','hpLoss'])v[k]=clamp(v[k]*f,0,settings.assumptions.perSkillCap);
  const recognized=evidence.length>0;
  if(!recognized)flags.push('无可量化模式，暂按零收益，进入复核队列');
  return {id:skill.id,vector:v,frequency:+f.toFixed(3),confidence:recognized?confidence:.2,evidence,flags};
}
function scoreVector(v,hp,model,kof=false){const w=model.weights;const ce=v.cards+w.damage*v.damage+w.guard*v.guard+w.heal*v.heal+w.control*v.control+w.quality*v.quality-v.cost-w.hpLoss*v.hpLoss;return Math.max(0,model.baseline+model.pointsPerCE*ce+model.hpPoint*(Math.min(model.assumptions.hpCap,hp)-4)+w.burst*v.burst+(kof?w.carry*v.carry:0));}
function assess(card,records,model){
  const components=card.skills.map(s=>estimateSkill(s,records[s.key],model)),override=model.overrides[card.id];
  let v=Object.fromEntries(DIMS.map(k=>[k,components.reduce((n,s)=>n+s.vector[k]*(s.confidence<.5?model.assumptions.uncertainDiscount:1),0)]));
  for(const k of DIMS)v[k]=clamp(v[k],0,model.assumptions.perGeneralCap);
  if(override)v={...Object.fromEntries(DIMS.map(k=>[k,0])),...override.vector};
  const duel=scoreVector(v,Number(card.hp)||4,model),kof=scoreVector(v,Number(card.hp)||4,model,true);
  const confidence=override?.confidence||Math.min(.55,components.reduce((n,s)=>n+s.confidence,0)/Math.max(1,components.length));
  return {version:1,score:+((duel+kof)/2).toFixed(3),duel:+duel.toFixed(2),kof:+kof.toFixed(2),confidence:+confidence.toFixed(2),method:override?'规则校准估算':'语义初估·待复核',vector:Object.fromEntries(DIMS.map(k=>[k,+v[k].toFixed(3)])),notes:override?.notes||'技能文本及代码存在性辅助估算；未测胜率，不等于精确强度。',components,flags:[...(override?[]:[...new Set(components.flatMap(s=>s.flags))]),...(card.hp>model.assumptions.hpCap?['特殊高体力：四回合模型体力收益封顶，需独立模式复核']:[])]};
}
module.exports={DIMS,assess,scoreVector};
