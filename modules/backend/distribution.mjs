import {clone,clamp,need} from './common.mjs';
export const DEFAULT_DISTRIBUTION={version:'tcg-slots-3',excludedPacks:['diy','old','key','collab','sixiang','onlyOL','xianding'],baseCounts:{N:60,R:42,SR:15,SSR:3},bounds:{N:[54,66],SR:[14,18],SSR:[2,4]},themeScoreSpan:12};
export const distribution=r=>({...clone(DEFAULT_DISTRIBUTION),...r.distribution});
export const productEnabled=(rules,id)=>!(rules.distribution?.excludedPacks||DEFAULT_DISTRIBUTION.excludedPacks).includes(id);
export function validateDistribution(rules){
  if(rules.distribution!==undefined)need(rules.distribution&&typeof rules.distribution==='object'&&!Array.isArray(rules.distribution),'INVALID_CONFIG','配盒配置必须是对象。');
  const p=distribution(rules);need(p.version==='tcg-slots-3','INVALID_CONFIG','不支持的配盒版本。');
  need(Array.isArray(p.excludedPacks)&&p.excludedPacks.every(s=>typeof s==='string'),'INVALID_CONFIG','停产卡包列表不正确。');
  need(['N','R','SR','SSR'].every(r=>Number.isSafeInteger(p.baseCounts?.[r])&&p.baseCounts[r]>=0)&&Object.values(p.baseCounts).reduce((n,v)=>n+v,0)===120,'INVALID_CONFIG','整盒基础配额必须合计 120 张。');
  for(const r of ['N','SR','SSR'])need(Array.isArray(p.bounds?.[r])&&p.bounds[r].length===2&&p.bounds[r].every(Number.isSafeInteger)&&p.bounds[r][0]>=0&&p.bounds[r][1]>=p.bounds[r][0]&&p.baseCounts[r]>=p.bounds[r][0]&&p.baseCounts[r]<=p.bounds[r][1],'INVALID_CONFIG',`${r} 配额边界不合法。`);
  need(p.bounds.N[1]<=96&&p.bounds.SSR[0]>=1&&p.bounds.SR[1]+p.bounds.SSR[1]<=24&&Number.isFinite(p.themeScoreSpan)&&p.themeScoreSpan>0,'INVALID_CONFIG','配盒需保留每包 R+ 槽位和整盒 SSR 保底。');
  return p;
}
export function boxRecipe(catalog,rules,themeCards){
  const policy=distribution(rules),mean=cards=>cards.reduce((n,c)=>n+c.globalScore,0)/Math.max(1,cards.length);
  const influence=clamp((mean(themeCards)-mean(catalog.activeCards||catalog.cards))/policy.themeScoreSpan,-1,1);
  const bound=(r,value)=>clamp(Math.round(value),...policy.bounds[r]);
  const N=bound('N',policy.baseCounts.N-6*influence),SR=bound('SR',policy.baseCounts.SR+3*influence),SSR=bound('SSR',policy.baseCounts.SSR+influence),R=120-N-SR-SSR;
  return {boxCounts:{N,R,SR,SSR},guaranteed:{N:0,R:24-SR-SSR,SR,SSR},remainder:{N,R:96-N,SR:0,SSR:0},influence};
}
