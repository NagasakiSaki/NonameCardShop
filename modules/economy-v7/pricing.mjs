/**
 * V7 Economy Pricing Policy Module
 *
 * Implements frozen V7 pricing:
 * - Precise 3-tier retail prices: 210 / 360 / 510
 * - Default wholesale prices: 150 / 255 / 360 (margins ~28.6%, 29.2%, 29.4%)
 * - 24-pack box wholesale & retail: packPrice * 24 * 0.95 rounded up to 5
 *   - Entry: wholesale 3420, retail 4790
 *   - Standard: wholesale 5815, retail 8210
 *   - Expert: wholesale 8210, retail 11630
 * - Explicit price policy preventing reverse margin calculation drift (215/365/515)
 * - Ally wholesale discount support (capped at 15%)
 * - Player manual pricing support
 */

import defaultPolicy from '../../data/v7/economy-policy.json' with { type: 'json' };

export const CONTRACT_VERSION = 'card-shop-v7-candidate/1';
export const POLICY_VERSION = 'v7-economy-1';

export function buildEconomyPolicy(customConfig = {}) {
  const merged = {
    version: customConfig.version || defaultPolicy.version,
    contract: CONTRACT_VERSION,
    retailPriceMeaning: defaultPolicy.retailPriceMeaning,
    roundTo: customConfig.roundTo || defaultPolicy.roundTo || 5,
    packsPerBox: customConfig.packsPerBox || defaultPolicy.packsPerBox || 24,
    cardsPerPack: customConfig.cardsPerPack || defaultPolicy.cardsPerPack || 5,
    boxDiscount: customConfig.boxDiscount ?? defaultPolicy.boxDiscount ?? 0.95,
    boxRoundUpTo: customConfig.boxRoundUpTo || defaultPolicy.boxRoundUpTo || 5,
    pricing: {
      version: customConfig.pricing?.version || defaultPolicy.pricing.version,
      thresholds: {
        entryMaxScoreExclusive: customConfig.pricing?.thresholds?.entryMaxScoreExclusive ?? defaultPolicy.pricing.thresholds.entryMaxScoreExclusive,
        standardMaxScoreExclusive: customConfig.pricing?.thresholds?.standardMaxScoreExclusive ?? defaultPolicy.pricing.thresholds.standardMaxScoreExclusive
      },
      tiers: (customConfig.pricing?.tiers || defaultPolicy.pricing.tiers).map(t => ({ ...t }))
    },
    retiredProductIds: {
      newRetired: [...(customConfig.retiredProductIds?.newRetired || defaultPolicy.retiredProductIds.newRetired)],
      legacyRetired: [...(customConfig.retiredProductIds?.legacyRetired || defaultPolicy.retiredProductIds.legacyRetired)],
      allRetired: [...(customConfig.retiredProductIds?.allRetired || defaultPolicy.retiredProductIds.allRetired)]
    },
    initialUnlockedProductIds: [...(customConfig.initialUnlockedProductIds || defaultPolicy.initialUnlockedProductIds)],
    starterGift: { ...(customConfig.starterGift || defaultPolicy.starterGift) },
    collation: {
      version: customConfig.collation?.version || defaultPolicy.collation.version,
      cardsPerPack: customConfig.collation?.cardsPerPack || defaultPolicy.collation.cardsPerPack,
      packsPerBox: customConfig.collation?.packsPerBox || defaultPolicy.collation.packsPerBox,
      cardsPerBox: customConfig.collation?.cardsPerBox || defaultPolicy.collation.cardsPerBox,
      minRarityPerPack: customConfig.collation?.minRarityPerPack || defaultPolicy.collation.minRarityPerPack,
      starterBoxNoSsr: { ...defaultPolicy.collation.starterBoxNoSsr, ...(customConfig.collation?.starterBoxNoSsr || {}) },
      standardBox: { ...defaultPolicy.collation.standardBox, ...(customConfig.collation?.standardBox || {}) },
      fallbackPoolPolicy: customConfig.collation?.fallbackPoolPolicy || defaultPolicy.collation.fallbackPoolPolicy,
      leakPrevention: customConfig.collation?.leakPrevention ?? defaultPolicy.collation.leakPrevention
    },
    buyerClasses: {
      weights: { ...(customConfig.buyerClasses?.weights || defaultPolicy.buyerClasses.weights) },
      classes: Object.fromEntries(
        Object.entries(defaultPolicy.buyerClasses.classes).map(([k, v]) => [
          k,
          { ...v, ...(customConfig.buyerClasses?.classes?.[k] || {}) }
        ])
      )
    },
    allyCaps: { ...(customConfig.allyCaps || defaultPolicy.allyCaps) }
  };

  validateEconomyPolicy(merged);
  return Object.freeze(merged);
}

export function validateEconomyPolicy(policy) {
  if (!policy || typeof policy !== 'object') {
    throw new Error('INVALID_POLICY: Policy must be an object.');
  }
  if (!policy.pricing?.tiers || !Array.isArray(policy.pricing.tiers) || policy.pricing.tiers.length !== 3) {
    throw new Error('INVALID_POLICY: V7 pricing requires exactly 3 tiers (entry, standard, expert).');
  }

  const ids=policy.pricing.tiers.map(t=>t.id);
  if(new Set(ids).size!==3||!['entry','standard','expert'].every(id=>ids.includes(id)))throw Error('INVALID_POLICY: missing pricing tier.');
  for(const tier of policy.pricing.tiers){
    if(!['packWholesale','packRetail','boxWholesale','boxRetail'].every(k=>Number.isSafeInteger(tier[k])&&tier[k]>0)||tier.packRetail<tier.packWholesale||tier.boxRetail<tier.boxWholesale)throw Error('INVALID_POLICY: invalid price or negative margin.');
    if(tier.boxWholesale!==calculateBoxPrice(tier.packWholesale,policy.boxDiscount,policy.boxRoundUpTo,policy.packsPerBox)||tier.boxRetail!==calculateBoxPrice(tier.packRetail,policy.boxDiscount,policy.boxRoundUpTo,policy.packsPerBox))throw Error('INVALID_POLICY: box and pack policy disagree.');
  }

  // Ensure yijiang is NOT in retired packs
  if (policy.retiredProductIds.allRetired.includes('yijiang')) {
    throw new Error('INVALID_POLICY: yijiang cannot be in retiredProductIds.');
  }

  // Ensure the 3 new retired packs are included
  for (const p of ['newjiang', 'offline', 'standard']) {
    if (!policy.retiredProductIds.allRetired.includes(p)) {
      throw new Error(`INVALID_POLICY: ${p} must be in retiredProductIds.`);
    }
  }
}

/**
 * Calculates box price from pack price with independent round up to 5.
 * Formula: Math.ceil((packPrice * 24 * boxDiscount) / roundUpTo) * roundUpTo
 */
export function calculateBoxPrice(packPrice, boxDiscount = 0.95, roundUpTo = 5, packsPerBox = 24) {
  const raw = packPrice * packsPerBox * boxDiscount;
  return Math.ceil(raw / roundUpTo) * roundUpTo;
}

/**
 * Maps an average score to one of the 3 tiers:
 * - score < 53: entry
 * - score < 57: standard
 * - score >= 57: expert
 */
export function getTierForScore(score, policy = defaultPolicy) {
  const { entryMaxScoreExclusive, standardMaxScoreExclusive } = policy.pricing.thresholds;
  if (score < entryMaxScoreExclusive) {
    return policy.pricing.tiers.find(t => t.id === 'entry');
  }
  if (score < standardMaxScoreExclusive) {
    return policy.pricing.tiers.find(t => t.id === 'standard');
  }
  return policy.pricing.tiers.find(t => t.id === 'expert');
}

/**
 * Quotes a product tier and unit, optionally applying ally wholesale discount.
 *
 * Signature matches shared contract:
 * quoteProduct({ tier, unit, policy, allyEffects })
 *
 * Returns result envelope: { ok: true, data } or { ok: false, error }
 */
export function quoteProduct({ tier, unit = 'pack', policy = defaultPolicy, allyEffects = null }) {
  if (!tier || typeof tier !== 'object') {
    return {
      ok: false,
      error: { code: 'INVALID_TIER', message: '必须提供有效的价格档位对象。', retryable: false }
    };
  }

  if (!['pack', 'box'].includes(unit)) {
    return {
      ok: false,
      error: { code: 'INVALID_UNIT', message: `未知的单位类型：${unit}，必须为 pack 或 box。`, retryable: false }
    };
  }

  const baseWholesale = unit === 'box' ? tier.boxWholesale : tier.packWholesale;
  const suggestedRetail = unit === 'box' ? tier.boxRetail : tier.packRetail;

  let effectiveWholesale = baseWholesale;
  let allyDiscountApplied = 0;

  if (allyEffects && typeof allyEffects.wholesaleDiscountRate === 'number' && allyEffects.wholesaleDiscountRate > 0) {
    const maxDiscount = policy.allyCaps?.wholesaleDiscountRate ?? 0.15;
    const rate = Math.min(maxDiscount, Math.max(0, allyEffects.wholesaleDiscountRate));
    allyDiscountApplied = rate;

    if (unit === 'pack') {
      effectiveWholesale = Math.round(baseWholesale * (1 - rate));
    } else {
      // For box wholesale with ally discount:
      // Base pack wholesale discounted, multiplied by 24 * 0.95 and rounded up to 5
      const discountedPackWholesale = tier.packWholesale * (1 - rate);
      effectiveWholesale = calculateBoxPrice(discountedPackWholesale, policy.boxDiscount, policy.boxRoundUpTo, policy.packsPerBox);
    }
  }

  const grossMargin = (suggestedRetail - effectiveWholesale) / suggestedRetail;

  return {
    ok: true,
    data: {
      tierId: tier.id,
      tierLabel: tier.label,
      unit,
      wholesale: effectiveWholesale,
      baseWholesale,
      suggestedRetail,
      grossMargin: Math.round(grossMargin * 10000) / 10000,
      allyDiscountApplied,
      pricingVersion: policy.pricing.version
    }
  };
}

/**
 * Calculates full price quote for all units (pack and box) for a specific card theme.
 */
export function quoteThemePricing(cards, policy = defaultPolicy, allyEffects = null) {
  const averageStrength = cards.length
    ? cards.reduce((sum, c) => sum + (Number.isFinite(c.globalScore)?c.globalScore:50), 0) / cards.length
    : 50;

  const tier = getTierForScore(averageStrength, policy);
  const packQuote = quoteProduct({ tier, unit: 'pack', policy, allyEffects });
  const boxQuote = quoteProduct({ tier, unit: 'box', policy, allyEffects });

  return {
    averageStrength: Math.round(averageStrength * 100) / 100,
    tierId: tier.id,
    tierLabel: tier.label,
    pricingVersion: policy.pricing.version,
    prices: {
      pack: {
        wholesale: packQuote.data.wholesale,
        baseWholesale: packQuote.data.baseWholesale,
        retail: packQuote.data.suggestedRetail,
        grossMargin: packQuote.data.grossMargin
      },
      box: {
        wholesale: boxQuote.data.wholesale,
        baseWholesale: boxQuote.data.baseWholesale,
        retail: boxQuote.data.suggestedRetail,
        grossMargin: boxQuote.data.grossMargin
      }
    },
    allyDiscountApplied: packQuote.data.allyDiscountApplied
  };
}
