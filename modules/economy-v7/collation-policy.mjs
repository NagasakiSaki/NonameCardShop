/**
 * V7 Collation Policy Module
 *
 * Implements box recipe and card collation rules:
 * - 24 packs * 5 cards = 120 cards per box
 * - Minimum 1 R guaranteed in every single pack (advanced slot)
 * - Strict fallback pool isolation: fallback pools only draw from unlockedProductIds!
 * - Entry / Starter Box when SSR pool is absent:
 *   - Fixed box counts: 60N / 42R / 18SR / 0SSR
 *   - Guaranteed advanced slot: 6R / 18SR / 0SSR (24 cards total)
 *   - Remainder base slot: 60N / 36R / 0SR / 0SSR (96 cards total)
 *   - Retains 1 R+ guarantee per pack and exact box counts
 *   - Does NOT fake SR as SSR or secretly pull SSR from locked themes
 * - Standard Box when SSR pool is present:
 *   - Fixed box counts: 60N / 42R / 15SR / 3SSR
 * - Once manufactured, box contents are frozen; old boxes are never re-rolled upon new unlocks.
 */

import defaultPolicy from '../../data/v7/economy-policy.json' with { type: 'json' };

export const RARITIES = Object.freeze(['N', 'R', 'SR', 'SSR']);

/**
 * Plans collation for a product theme given the currently unlocked themes.
 *
 * Signature matches shared contract:
 * planCollation({ productId, unlockedProductIds, catalog, policy })
 */
export function planCollation({
  productId,
  unlockedProductIds = ['yijiang'],
  catalog,
  policy = defaultPolicy
}) {
  if (!productId || typeof productId !== 'string') {
    return {
      ok: false,
      error: { code: 'INVALID_PRODUCT_ID', message: '必须指定有效的产品ID。', retryable: false }
    };
  }

  if (!catalog || !Array.isArray(catalog.cards)) {
    return {
      ok: false,
      error: { code: 'INVALID_CATALOG', message: '必须提供有效的卡牌目录。', retryable: false }
    };
  }

  // 1. Local theme cards
  const themeCards = catalog.cards.filter(c => c.pack === productId);
  const localPools = Object.fromEntries(
    RARITIES.map(r => [r, themeCards.filter(c => c.currentRarity === r).map(c => c.cardKey)])
  );
  const poolSummary = Object.fromEntries(RARITIES.map(r => [r, localPools[r].length]));

  // 2. Fallback pools: STRICTLY from unlockedProductIds only!
  const safeUnlocked = Array.isArray(unlockedProductIds) && unlockedProductIds.length > 0
    ? unlockedProductIds
    : ['yijiang'];

  const unlockedCards = catalog.cards.filter(c => safeUnlocked.includes(c.pack));
  const fallbackPools = Object.fromEntries(
    RARITIES.map(r => [r, unlockedCards.filter(c => c.currentRarity === r).map(c => c.cardKey)])
  );

  // 3. Determine if SSR is available
  const hasThemeSsr = localPools.SSR.length > 0;
  const hasUnlockedSsr = fallbackPools.SSR.length > 0;
  const hasSsr = hasThemeSsr || hasUnlockedSsr;

  // 4. Select collation recipe
  let boxCounts;
  let guaranteed;
  let remainder;
  let isStarterNoSsr;
  let guarantees;

  if (!hasSsr) {
    // Starter Box with No SSR (yijiang entry rule)
    boxCounts = { N: 60, R: 42, SR: 18, SSR: 0 };
    guaranteed = { N: 0, R: 6, SR: 18, SSR: 0 };
    remainder = { N: 60, R: 36, SR: 0, SSR: 0 };
    isStarterNoSsr = true;
    guarantees = [
      '每包 4 张 N/R 基础槽 + 1 张 R/SR 进阶槽（入门无SSR特供版）',
      '整盒固定 60N / 42R / 18SR / 0SSR；散包无累计大保底'
    ];
  } else {
    // Standard Box with SSR
    boxCounts = { N: 60, R: 42, SR: 15, SSR: 3 };
    guaranteed = { N: 0, R: 6, SR: 15, SSR: 3 };
    remainder = { N: 60, R: 36, SR: 0, SSR: 0 };
    isStarterNoSsr = false;
    guarantees = [
      '每包 4 张 N/R 基础槽 + 1 张 R/SR/SSR 进阶槽',
      '整盒固定 60N / 42R / 15SR / 3SSR；散包无累计大保底'
    ];
  }

  // 5. Construct final pools & note substitutions
  const pools = {};
  const substitutions = [];

  for (const r of RARITIES) {
    if (localPools[r].length > 0) {
      pools[r] = [...localPools[r]];
    } else if (boxCounts[r] > 0) {
      // Need cards for this rarity, pull from unlocked fallback pool
      pools[r] = [...fallbackPools[r]];
      substitutions.push(r);
    } else {
      // Not needed (e.g. SSR in starter box)
      pools[r] = [];
    }
  }

  const substitutionSummary = substitutions.length > 0
    ? `${substitutions.join('/')} 缺档，使用已解锁主题同档补位。`
    : null;

  // 6. Pack slot probability distributions
  // 4 remainder slots + 1 guaranteed slot
  const remainderSlotWeights = Object.fromEntries(RARITIES.map(r => [r, remainder[r] / 96]));
  const guaranteedSlotWeights = Object.fromEntries(RARITIES.map(r => [r, guaranteed[r] / 24]));
  const packSlots = [
    remainderSlotWeights,
    remainderSlotWeights,
    remainderSlotWeights,
    remainderSlotWeights,
    guaranteedSlotWeights
  ];

  // Conservation check
  const totalCards = boxCounts.N + boxCounts.R + boxCounts.SR + boxCounts.SSR;
  if (totalCards !== 120) {
    throw new Error(`COLLATION_ERROR: Total box cards must be 120, got ${totalCards}`);
  }

  const productVersion = `${productId}-v7-${isStarterNoSsr ? 'starter' : 'standard'}-u${[...safeUnlocked].sort().join('_')}`;

  return {
    ok: true,
    data: {
      productId,
      productVersion,
      collationVersion: policy.collation.version,
      cardsPerPack: 5,
      packsPerBox: 24,
      cardsPerBox: 120,
      isStarterNoSsr,
      poolSummary,
      boxCounts,
      guaranteed,
      remainder,
      pools,
      substitutions,
      substitutionSummary,
      guarantees,
      packSlots,
      unlockedProductIdsUsed: [...safeUnlocked]
    }
  };
}

/**
 * Deterministic pseudo-random helper.
 */
function nextUnit(state) {
  state.seed = (Math.imul(state.seed, 1664525) + 1013904223) >>> 0;
  return state.seed / 4294967296;
}

function shuffleList(list, state) {
  const result = [...list];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(nextUnit(state) * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function pickFromList(list, state) {
  if (!list || list.length === 0) return null;
  const idx = Math.floor(nextUnit(state) * list.length);
  return list[idx];
}

/**
 * Manufactures a sealed 24-pack box deterministically.
 * Guarantees exact box counts and at least 1 R per pack.
 */
export function manufactureBoxV7(seedOrWorld, collationPlan, catalog) {
  const plan = collationPlan.data || collationPlan;
  const rngState = {
    seed: typeof seedOrWorld === 'number'
      ? seedOrWorld >>> 0
      : (seedOrWorld?.seed ?? 12345678) >>> 0
  };

  const byKey = catalog.byKey instanceof Map
    ? catalog.byKey
    : new Map(catalog.cards.map(c => [c.cardKey, c]));

  // Build guaranteed rare list (24 cards)
  const rareRarities = [];
  for (const r of RARITIES) {
    for (let i = 0; i < plan.guaranteed[r]; i++) {
      rareRarities.push(r);
    }
  }
  const shuffledRares = shuffleList(rareRarities, rngState);

  // Build remainder list (96 cards)
  const remainderRarities = [];
  for (const r of RARITIES) {
    for (let i = 0; i < plan.remainder[r]; i++) {
      remainderRarities.push(r);
    }
  }
  const shuffledRemainder = shuffleList(remainderRarities, rngState);

  // Helper to manufacture a printed card
  function printCard(rarity) {
    const pool = plan.pools[rarity];
    if (!pool || pool.length === 0) {
      throw new Error(`COLLATION_ERROR: No cards available for rarity ${rarity}`);
    }
    const cardKey = pickFromList(pool, rngState);
    const card = byKey.get(cardKey);
    const isThemeCard = card?.pack === plan.productId;

    return {
      cardKey,
      generalId: card?.id || cardKey,
      name: card?.name || cardKey,
      printedRarity: rarity,
      printVersion: plan.productVersion,
      source: isThemeCard ? 'theme' : 'unlocked-substitution',
      sourceTheme: card?.pack || plan.productId
    };
  }

  // Assemble 24 packs: 1 guaranteed rare + 4 remainder cards
  const packets = [];
  for (let i = 0; i < 24; i++) {
    const packCards = [
      printCard(shuffledRares[i]),
      printCard(shuffledRemainder[i * 4]),
      printCard(shuffledRemainder[i * 4 + 1]),
      printCard(shuffledRemainder[i * 4 + 2]),
      printCard(shuffledRemainder[i * 4 + 3])
    ];

    // Every pack must contain at least 1 card with rarity >= R (shuffledRares[i] is guaranteed R+)
    packets.push(packCards);
  }

  if (typeof seedOrWorld === 'object' && seedOrWorld !== null) {
    seedOrWorld.seed = rngState.seed;
  }

  return packets;
}

/**
 * Manufactures a single pack deterministically from slot probabilities.
 */
export function manufacturePackV7(seedOrWorld, collationPlan, catalog) {
  const plan = collationPlan.data || collationPlan;
  const rngState = {
    seed: typeof seedOrWorld === 'number'
      ? seedOrWorld >>> 0
      : (seedOrWorld?.seed ?? 12345678) >>> 0
  };

  const byKey = catalog.byKey instanceof Map
    ? catalog.byKey
    : new Map(catalog.cards.map(c => [c.cardKey, c]));

  function pickRarityFromWeights(weights) {
    let u = nextUnit(rngState);
    for (const r of RARITIES) {
      const w = weights[r] || 0;
      u -= w;
      if (u < 1e-12 && w > 0) return r;
    }
    return RARITIES.findLast(r => (weights[r] || 0) > 0) || 'N';
  }

  function printCard(rarity) {
    const pool = plan.pools[rarity];
    const cardKey = pickFromList(pool, rngState);
    const card = byKey.get(cardKey);
    return {
      cardKey,
      generalId: card?.id || cardKey,
      name: card?.name || cardKey,
      printedRarity: rarity,
      printVersion: plan.productVersion,
      source: card?.pack === plan.productId ? 'theme' : 'unlocked-substitution',
      sourceTheme: card?.pack || plan.productId
    };
  }

  const cards = plan.packSlots.map(slot => printCard(pickRarityFromWeights(slot)));

  if (typeof seedOrWorld === 'object' && seedOrWorld !== null) {
    seedOrWorld.seed = rngState.seed;
  }

  return cards;
}

/**
 * Creates a sealed physical item (pack or box) in the world.
 * Pre-manufactures and freezes the packet/card contents so they cannot be altered later.
 */
export function makeSealedV7(world, collationPlan, unit, cost, suggestedRetail, catalog, ownerId = 'player') {
  const plan = collationPlan.data || collationPlan;
  world.itemCounter = (world.itemCounter || 0) + 1;
  const inventoryRef = `item-${world.itemCounter}`;

  const item = {
    inventoryRef,
    kind: unit,
    productId: plan.productId,
    productVersion: plan.productVersion,
    ownerId,
    location: 'stock',
    cost,
    protected: false,
    lock: null,
    retailPrice: suggestedRetail,
    suggestedRetail,
    spec: {
      cardsPerPack: plan.cardsPerPack,
      packsPerBox: plan.packsPerBox,
      isStarterNoSsr: plan.isStarterNoSsr,
      boxCounts: { ...plan.boxCounts },
      guarantees: [...plan.guarantees]
    }
  };

  if (unit === 'box') {
    item.packets = manufactureBoxV7(world, plan, catalog);
  } else {
    item.cards = manufacturePackV7(world, plan, catalog);
  }

  world.items[inventoryRef] = item;
  return item;
}
