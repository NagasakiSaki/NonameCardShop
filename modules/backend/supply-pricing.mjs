import {economyPolicy} from './v7-policy.mjs';
import {need} from './common.mjs';
import {quoteThemePricing} from '../economy-v7/pricing.mjs';
// Missing fields in archived rules mean the historical economy. New worlds read v2 from JSON.
export const DEFAULT_STRENGTH_PRICING={version:'strength-tiers-1',boxDiscount:0.95,tiers:[
  {id:'entry',label:'入门档',maxScore:51,packWholesale:260},
  {id:'standard',label:'标准档',maxScore:53,packWholesale:280},
  {id:'advanced',label:'进阶档',maxScore:55,packWholesale:290},
  {id:'expert',label:'精英档',maxScore:60,packWholesale:330},
  {id:'legend',label:'顶级档',maxScore:10000,packWholesale:420}
]};
export function strengthPricing(rules){return rules.strengthPricing||DEFAULT_STRENGTH_PRICING;}
export function validateStrengthPricing(rules){
 const p=strengthPricing(rules);if(p.version==='strength-tiers-4'){need(p.tiers?.length===3&&p.tiers.every((t,i)=>t.id===['entry','standard','expert'][i]&&Number.isSafeInteger(t.packRetail)&&t.packRetail>=t.packWholesale),'INVALID_CONFIG','V7 需要基础、进阶、旗舰三个档位及明确的售价。');}
 need(['strength-tiers-1','strength-tiers-2','strength-tiers-3','strength-tiers-4'].includes(p.version)&&p.boxDiscount>0&&p.boxDiscount<=1&&Array.isArray(p.tiers)&&p.tiers.length>0,'INVALID_CONFIG','强度价格档配置不正确。');
 p.tiers.forEach((t,i)=>need(typeof t.id==='string'&&typeof t.label==='string'&&Number.isFinite(t.maxScore)&&Number.isSafeInteger(t.packWholesale)&&t.packWholesale>0&&(!i||t.maxScore>p.tiers[i-1].maxScore&&t.packWholesale>=p.tiers[i-1].packWholesale),'INVALID_CONFIG','强度档分数必须递增，价格不得倒挂。'));
}
export function priceByStrength(cards,rules){
 if(rules.operationsV7){const q=quoteThemePricing(cards,economyPolicy(rules));return {averageStrength:q.averageStrength,priceTier:{id:q.tierId,label:q.tierLabel,version:q.pricingVersion},prices:q.prices};}
 const averageStrength=cards.reduce((n,c)=>n+c.globalScore,0)/Math.max(1,cards.length),p=strengthPricing(rules),tier=p.tiers.find(t=>averageStrength<t.maxScore)||p.tiers.at(-1);
 const round=n=>Math.ceil(n/rules.roundTo)*rules.roundTo,packWholesale=round(tier.packWholesale),boxWholesale=round(packWholesale*rules.packsPerBox*p.boxDiscount);
 return {averageStrength:Math.round(averageStrength*100)/100,priceTier:{id:tier.id,label:tier.label,version:p.version},prices:{pack:{wholesale:packWholesale,retail:round(packWholesale/(1-rules.retailMargin))},box:{wholesale:boxWholesale,retail:round(boxWholesale/(1-rules.retailMargin))}}};
}
