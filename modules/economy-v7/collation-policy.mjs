// Edition recipes and print grades are independent of combat scores and unlock order.
import defaultEditions from '../../data/print-editions.json' with {type:'json'};
export const PRINT_EDITION_VERSION=defaultEditions.version;
export const RARITIES=Object.freeze(['N','R','SR','SSR']);
export function planCollation({productId,catalog,editions=defaultEditions}){
 if(!productId||typeof productId!=='string')return {ok:false,error:{code:'INVALID_PRODUCT_ID',message:'必须指定有效的产品ID。'}};
 if(!catalog||!Array.isArray(catalog.cards))return {ok:false,error:{code:'INVALID_CATALOG',message:'必须提供有效卡牌目录。'}};
 const edition=editions.products[productId],recipe=editions.recipes[edition?.recipeId];
 if(!edition||!recipe)return {ok:false,error:{code:'PRINT_EDITION_MISSING',message:'此主题尚未登记固定发行配方。'}};
 const {boxCounts,guaranteed,remainder}=structuredClone(recipe),pools=Object.fromEntries(RARITIES.map(r=>[r,catalog.cards.filter(c=>c.pack===productId&&edition.rarities[c.generalId||c.id]===r).map(c=>c.cardKey)]));
 if(RARITIES.some(r=>[boxCounts[r],guaranteed[r],remainder[r]].some(n=>!Number.isSafeInteger(n)||n<0)||boxCounts[r]!==guaranteed[r]+remainder[r])||guaranteed.N!==0||Object.values(boxCounts).reduce((a,b)=>a+b,0)!==120||Object.values(guaranteed).reduce((a,b)=>a+b,0)!==24||Object.values(remainder).reduce((a,b)=>a+b,0)!==96)throw Error('固定发行配方数量不守恒。');
 const poolSummary=Object.fromEntries(RARITIES.map(r=>[r,pools[r].length])),isStarterNoSsr=boxCounts.SSR===0;
 const packSlots=[...Array.from({length:4},()=>Object.fromEntries(RARITIES.map(r=>[r,remainder[r]/96]))),Object.fromEntries(RARITIES.map(r=>[r,guaranteed[r]/24]))];
 return {ok:true,data:{productId,productVersion:edition.printVersion,printVersion:edition.printVersion,editionVersion:editions.version,collationVersion:editions.version,cardsPerPack:5,packsPerBox:24,cardsPerBox:120,isStarterNoSsr,poolSummary,boxCounts,guaranteed,remainder,pools,substitutions:[],substitutionSummary:null,guarantees:['散包固定槽位出率，每包至少1张R或以上；不累计大保底','整盒固定 '+RARITIES.map(r=>boxCounts[r]+r).join(' / ')+'；评分与解锁不改变本发行版配比'],packSlots,unlockedProductIdsUsed:[]}};
}

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
