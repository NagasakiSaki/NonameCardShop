/**
 * V7 Customer Budget and Purchase Acceptance Module
 *
 * Implements tiered customer budgets, single visit budgets, and price ceilings:
 * - 4 Buyer Classes:
 *   - Regular (普通客): Initial 900~1800, single sealed budget 450~900, weight 70%
 *   - Enthusiast (爱好客): Initial 1800~4500, single sealed budget 900~1800, weight 20%
 *   - Box Buyer (整盒客): Initial 12000~18000, single sealed budget allows 1 box, weight 5%
 *   - Poor / Scavenger (贫穷客): Initial 200~400, single sealed budget 50~200, weight 5%
 * - Stable buyer class derived from actorId hash (independent of character appearance)
 * - Available budget respects table reservation escrow: (wallet.available - wallet.reserved - reserved)
 * - Single visit budget limits consumption per visit
 * - Price acceptance ceiling relative to V7 suggested retail (210/360/510/box), avoiding comparisons to legacy 100/200/300
 * - Daily supplement only occurs at true day-start settlement with audited ledger entry
 */

import defaultPolicy from '../../data/v7/economy-policy.json' with { type: 'json' };

/**
 * Deterministic integer hash for actorId.
 */
export function hashString(str) {
  let hash = 2166136261;
  for (let i = 0; i < str.length; i++) {
    hash = Math.imul(hash ^ str.charCodeAt(i), 16777619) >>> 0;
  }
  hash = Math.imul(hash ^ (hash >>> 16), 0x85ebca6b) >>> 0;
  hash = Math.imul(hash ^ (hash >>> 13), 0xc2b2ae35) >>> 0;
  return (hash ^ (hash >>> 16)) >>> 0;
}

/**
 * Stably determines buyer class from actorId.
 * Independent of character appearance or current wallet.
 */
export function determineBuyerClass(actorId, policy = defaultPolicy) {
  const hash = hashString(String(actorId));
  const normalized = (hash % 10000) / 10000;

  const weights = policy.buyerClasses?.weights || defaultPolicy.buyerClasses.weights;
  const total = weights.regular + weights.enthusiast + weights.boxBuyer + weights.poor;

  const pRegular = weights.regular / total;
  const pEnthusiast = pRegular + weights.enthusiast / total;
  const pBoxBuyer = pEnthusiast + weights.boxBuyer / total;

  if (normalized < pRegular) return 'regular';
  if (normalized < pEnthusiast) return 'enthusiast';
  if (normalized < pBoxBuyer) return 'boxBuyer';
  return 'poor';
}

/**
 * Generates initial wallet for a new customer based on buyer class.
 */
export function generateInitialWallet(actorId, policy = defaultPolicy) {
  const buyerClass = determineBuyerClass(actorId, policy);
  const classDef = policy.buyerClasses.classes[buyerClass];
  const [min, max] = classDef.initialWalletRange;

  const hash = hashString(`${actorId}:initial-wallet`);
  const ratio = (hash % 1000) / 1000;
  const initial = Math.round(min + ratio * (max - min));

  return {
    available: initial,
    reserved: 0,
    debt: 0,
    buyerClass,
    scavenger: !!classDef.scavenger
  };
}

/**
 * Calculates budget for a customer visit.
 *
 * Signature matches shared contract:
 * budgetForVisit({ buyerClass, wallet, reserved, visitSeed, policy })
 */
export function budgetForVisit({
  buyerClass = 'regular',
  wallet = { available: 1200, reserved: 0 },
  reserved = 0,
  visitSeed = 1,
  policy = defaultPolicy
}) {
  const classDef = policy.buyerClasses?.classes?.[buyerClass] || policy.buyerClasses.classes.regular;
  const [minBudget, maxBudget] = classDef.singleVisitBudgetRange;

  // Derive pseudo-random ratio from visitSeed
  const hash = hashString(`visit:${visitSeed}:${buyerClass}`);
  const ratio = (hash % 1000) / 1000;
  const visitBudget = Math.round(minBudget + ratio * (maxBudget - minBudget));

  // Deduct both wallet.reserved (e.g. table fees, auction holds) and visit-specific reserved funds
  const totalReserved = (wallet.reserved || 0) + reserved;
  const availableWallet = Math.max(0, (wallet.available || 0) - totalReserved);

  // Effective budget is capped by both visit budget and unreserved wallet
  const effectiveBudget = Math.min(availableWallet, visitBudget);

  return {
    buyerClass,
    classLabel: classDef.label,
    availableWallet,
    visitBudget,
    effectiveBudget,
    allowsBox: !!classDef.allowsBox,
    targetTier: classDef.targetTier,
    scavenger: !!classDef.scavenger,
    sealedPriceCeiling: classDef.sealedPriceCeiling,
    singlePriceCeiling: classDef.singlePriceCeiling
  };
}

/**
 * Evaluates whether an item retail price is acceptable to the customer.
 * Compares against V7 suggested retail price, not legacy 100/200/300.
 */
export function evaluateAcceptablePrice({
  itemPrice,
  suggestedRetail,
  buyerClass = 'regular',
  isSealed = true,
  policy = defaultPolicy
}) {
  if (typeof itemPrice !== 'number' || itemPrice <= 0) return false;
  if (typeof suggestedRetail !== 'number' || suggestedRetail <= 0) return false;

  const classDef = policy.buyerClasses?.classes?.[buyerClass] || policy.buyerClasses.classes.regular;
  const ceilingMultiplier = isSealed
    ? (classDef.sealedPriceCeiling ?? 1.4)
    : (classDef.singlePriceCeiling ?? 1.4);

  const maxAcceptable = Math.round(suggestedRetail * ceilingMultiplier);
  return itemPrice <= maxAcceptable;
}

/**
 * Daily income and wallet replenishment.
 *
 * Executed ONLY at day-start settlement.
 * Strictly audited, capped, and never triggered on queries or ticks.
 */
export function dailyBudgetSupplement(npc, day, policy = defaultPolicy) {
  if(npc.wallet?.lastSupplementDay>=day)return {ok:true,data:{actorId:npc.actorId,day,supplementedAmount:0,alreadySupplemented:true}};
  const buyerClass = npc.wallet?.buyerClass || npc.buyerClass || determineBuyerClass(npc.actorId, policy);
  const classDef = policy.buyerClasses?.classes?.[buyerClass] || policy.buyerClasses.classes.regular;
  const [minIncome, maxIncome] = classDef.dailyIncomeRange;

  const hash = hashString(`${npc.actorId}:day:${day}`);
  const ratio = (hash % 1000) / 1000;
  const rawIncome = Math.round(minIncome + ratio * (maxIncome - minIncome));

  // Cap daily supplement to avoid infinite runaway inflation
  const maxSupplement = classDef.dailyMaxSupplement ?? 1000;
  const supplementedAmount = Math.min(rawIncome, maxSupplement);

  const previousAvailable = npc.wallet?.available ?? npc.available ?? 0;
  const newAvailable = previousAvailable + supplementedAmount;

  if (!npc.wallet) {
    npc.wallet = { available: newAvailable, reserved: 0, debt: 0 };
  } else {
    npc.wallet.available = newAvailable;
  }

  npc.wallet.buyerClass = buyerClass;
  npc.wallet.scavenger = !!classDef.scavenger;
  npc.wallet.lastSupplementDay = day;

  // Sync top-level for convenience if present
  if (npc.available !== undefined) {
    npc.available = newAvailable;
  }

  const auditRecord = {
    eventType: 'customerDailySupplemented',
    actorId: npc.actorId,
    day,
    buyerClass,
    previousAvailable,
    supplementedAmount,
    newAvailable,
    dailyMaxSupplement: maxSupplement,
    source: 'daily-income'
  };

  return {
    ok: true,
    data: {
      actorId: npc.actorId,
      day,
      previousAvailable,
      supplementedAmount,
      newAvailable,
      auditRecord
    }
  };
}
