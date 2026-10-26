/**
 * Roster counts per format
 */
export const FORMAT_RESERVE_COUNTS = {
  kof: 3,
  'doudizhu-bo3': 5,
  'versus2v2-bo3': 8
};

/**
 * Builds a deterministic challenge loan roster strictly from the target product's card pool.
 * Does NOT create physical inventory items, does NOT circulate in market, does NOT allow ordinary NPCs.
 */
export function buildChallengeLoanRoster({ stage, formatId = 'kof', catalog, seed = 12345 }) {
  if (!stage || !stage.productId) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Stage with valid productId must be provided.', retryable: false }
    };
  }

  if (!catalog || !Array.isArray(catalog.cards)) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Catalog cards must be provided.', retryable: false }
    };
  }

  if(!Object.hasOwn(FORMAT_RESERVE_COUNTS,formatId))return {ok:false,error:{code:'INVALID_INPUT',message:'请选择三将接力、斗地主换边或双人对决。'}};
  const requestedFormat = formatId;
  const targetProductId = stage.productId;

  // Filter cards strictly belonging to the target product/pack
  const themeCards = catalog.cards.filter(c => c.pack === targetProductId);

  // Group by unique generalId / id
  const generalsMap = new Map();
  for (const card of themeCards) {
    const generalId = card.generalId || card.id;
    if (generalId && !generalsMap.has(generalId)) {
      generalsMap.set(generalId, card);
    }
  }

  const uniqueGenerals = Array.from(generalsMap.values());
  const requestedReserve = FORMAT_RESERVE_COUNTS[requestedFormat];

  let actualFormat = requestedFormat;
  let fallbackReason = null;

  // A small theme cannot silently turn the selected format into another game.
  if (uniqueGenerals.length < requestedReserve) {
      return {
        ok: false,
        error: {
          code: 'INSUFFICIENT_ROSTER',
          message: `主题 ${targetProductId} 仅有 ${uniqueGenerals.length} 名兼容武将，所选赛制需要 ${requestedReserve} 名，请更换赛制。`,
          retryable: false
        }
      };
  }

  const neededCount = FORMAT_RESERVE_COUNTS[actualFormat];

  // Deterministic shuffle using seed
  let currentSeed = (Number(seed) || 12345) >>> 0;
  const nextRand = () => {
    currentSeed = (Math.imul(currentSeed, 1664525) + 1013904223) >>> 0;
    return currentSeed / 4294967296;
  };

  const pool = [...uniqueGenerals];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(nextRand() * (i + 1));
    [pool[i], pool[j]] = [pool[j], pool[i]];
  }

  const selectedGenerals = pool.slice(0, neededCount);
  const ownerActorId = `specialist:${stage.challengerId.replace('challenger-', '')}`;

  const loanCards = selectedGenerals.map(g => {
    const genId = g.generalId || g.id;
    return {
      loanId: `loan-${stage.stageId}-${genId}-${seed}`,
      loanRef: `loan:${stage.stageId}:${genId}`,
      generalId: genId,
      generalName: g.name || genId,
      productId: targetProductId,
      purpose: 'stage-challenge',
      ownerActorId,
      restricted: true,
      circulation: false,
      isPhysicalItem: false
    };
  });

  return {
    ok: true,
    data: {
      stageId: stage.stageId,
      productId: targetProductId,
      requestedFormat,
      actualFormat,
      fallbackReason,
      reserveCount: loanCards.length,
      loanCards,
      seed
    }
  };
}

/**
 * Strict loan boundary validator:
 * - Ordinary NPCs cannot use loan cards.
 * - Loan cards cannot enter player inventory, retail shelves, or market circulation.
 */
export function validateLoanBoundary(loanRef, context = {}) {
  if (!loanRef || typeof loanRef !== 'string') {
    return { valid: false, error: 'INVALID_LOAN_REF' };
  }

  if (!loanRef.startsWith('loan:')) {
    return { valid: false, error: 'NOT_A_LOAN_CARD' };
  }

  // Ordinary NPCs are strictly forbidden from holding/using challenge loans
  if (context.isOrdinaryNpc) {
    return {
      valid: false,
      error: 'LOAN_NOT_PERMITTED_FOR_ORDINARY_NPC',
      message: '普通NPC必须使用真实拥有的流通卡牌，不能借用挑战卡。'
    };
  }

  // Loan cards cannot be converted to physical items or circulated
  if (context.targetLocation === 'retail' || context.targetLocation === 'inventory' || context.circulationIntent) {
    return {
      valid: false,
      error: 'LOAN_CIRCULATION_FORBIDDEN',
      message: '挑战专用借用武将不可流入市场、上架销售或存入玩家个人库存。'
    };
  }

  return { valid: true };
}
