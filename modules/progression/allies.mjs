import { reduceProgression, DEFAULT_ALLY_SLOTS } from './state.mjs';

/**
 * Hard caps for combined ally operational effects as specified in 共享合同-v1.json
 */
export const ALLY_EFFECT_CAPS = {
  attractionRate: 0.30,        // Max 30% attraction boost
  checkoutReductionRate: 0.40, // Max 40% checkout time reduction
  wholesaleDiscountRate: 0.15  // Max 15% wholesale cost discount
};

export const VALID_DUTIES = ['attraction', 'checkout', 'wholesale', 'duelist'];

/**
 * Derives operational management effects from active on-duty allies.
 * Strictly respects individual rates and combined hard caps.
 * Does NOT generate fake revenue or free daily income.
 */
export function deriveAllyEffects(state, config = {}) {
  if (!state || state.disabled || !Array.isArray(state.allies)) {
    return {
      attractionRate: 0,
      checkoutReductionRate: 0,
      wholesaleDiscountRate: 0,
      activeAlliesCount: 0,
      activeDuties: { attraction: 0, checkout: 0, wholesale: 0 }
    };
  }

  const caps = {
    attractionRate: config.maxAttractionRate ?? ALLY_EFFECT_CAPS.attractionRate,
    checkoutReductionRate: config.maxCheckoutReductionRate ?? ALLY_EFFECT_CAPS.checkoutReductionRate,
    wholesaleDiscountRate: config.maxWholesaleDiscountRate ?? ALLY_EFFECT_CAPS.wholesaleDiscountRate
  };

  let sumAttraction = 0;
  let sumCheckout = 0;
  let sumWholesale = 0;

  const dutyCounts = { attraction: 0, checkout: 0, wholesale: 0 };
  const onDutyAllies = state.allies.filter(a => a.onDuty);

  for (const ally of onDutyAllies) {
    const duty = ally.assignedDuty || ally.defaultDuty;
    const rate = Number(ally.rate) || 0;

    switch (duty) {
      case 'attraction':
        sumAttraction += rate;
        dutyCounts.attraction++;
        break;
      case 'checkout':
        sumCheckout += rate;
        dutyCounts.checkout++;
        break;
      case 'wholesale':
        sumWholesale += rate;
        dutyCounts.wholesale++;
        break;
      default:
        break;
    }
  }

  return {
    attractionRate: Math.min(caps.attractionRate, Math.round(sumAttraction * 1000) / 1000),
    checkoutReductionRate: Math.min(caps.checkoutReductionRate, Math.round(sumCheckout * 1000) / 1000),
    wholesaleDiscountRate: Math.min(caps.wholesaleDiscountRate, Math.round(sumWholesale * 1000) / 1000),
    activeAlliesCount: onDutyAllies.length,
    activeDuties: dutyCounts,
    caps
  };
}

/**
 * Assigns or unassigns duty for an unlocked ally.
 */
export function assignAllyDuty(state, { allyId, dutyId = null }, context = {}) {
  if (!state || state.disabled) {
    return {
      ok: false,
      error: { code: 'FEATURE_UNAVAILABLE', message: 'Progression system is disabled.', retryable: false }
    };
  }

  if (dutyId !== null && !VALID_DUTIES.includes(dutyId)) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: `Invalid dutyId: ${dutyId}. Must be one of: ${VALID_DUTIES.join(', ')}`, retryable: false }
    };
  }

  const ally = state.allies.find(a => a.allyId === allyId);
  if (!ally) {
    return {
      ok: false,
      error: { code: 'PRODUCT_LOCKED', message: '该伙伴尚未解锁招募。', retryable: false }
    };
  }

  // Delegate mutation to reducer
  const reduceRes = reduceProgression(state, {
    type: 'ALLY_ASSIGNED',
    allyId,
    dutyId
  }, context);

  if (!reduceRes.ok) {
    return reduceRes;
  }

  const updatedAlly = reduceRes.state.allies.find(a => a.allyId === allyId);
  const effects = deriveAllyEffects(reduceRes.state);

  return {
    ok: true,
    data: {
      ally: { ...updatedAlly },
      derivedEffects: effects
    },
    effects: reduceRes.effects
  };
}

/**
 * Freezes wholesale discount on product orders at order creation time.
 */
export function freezeOrderWholesaleDiscount(order, allyEffects) {
  const discountRate = allyEffects?.wholesaleDiscountRate || 0;
  const originalCost = Number(order.cost || order.amount || 0);
  const discountAmount = Math.round(originalCost * discountRate);
  const frozenCost = Math.max(0, originalCost - discountAmount);

  return {
    ...order,
    originalCost,
    wholesaleDiscountRate: discountRate,
    discountAmount,
    frozenCost,
    cost: frozenCost,
    discountFrozen: true
  };
}

/**
 * Merges ally effects into shop management effects.
 */
export function mergeManagementEffects(baseEffects, allyEffects) {
  const baseCheckout = Number(baseEffects?.checkoutSeconds ?? 1);
  const reductionRate = allyEffects?.checkoutReductionRate || 0;
  // Ensure checkout seconds remains positive (> 0)
  const adjustedCheckout = Math.max(0.5, Math.round(baseCheckout * (1 - reductionRate) * 100) / 100);

  const baseArrivalMult = Number(baseEffects?.customerArrivalMultiplier ?? 1);
  const attractionBoost = allyEffects?.attractionRate || 0;
  const adjustedArrivalMult = Math.round((baseArrivalMult + attractionBoost) * 1000) / 1000;

  return {
    ...baseEffects,
    checkoutSeconds: adjustedCheckout,
    customerArrivalMultiplier: adjustedArrivalMult,
    wholesaleDiscountRate: allyEffects?.wholesaleDiscountRate || 0,
    activeAlliesCount: allyEffects?.activeAlliesCount || 0
  };
}
