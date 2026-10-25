/**
 * Reserve (备战池) eligibility.
 *
 * Counts come from the frozen table:
 *   bo3 1 / kof 3 / doudizhu-bo3 5 / versus2v2-bo3 8  per side.
 *
 * A reserve entry is a *reference to a real resource*, never a free-floating
 * general id:
 *   - player side: a physical card copy (`sourceRef` = inventoryRef)
 *   - normal NPC side: a physical card copy that also flows in the market
 *   - challenge side (高手): only a legal `challenge-loan` (`loanRef`), which is
 *     not a world item and never circulates.
 *
 * Duplicate copies of the same entity cannot fill headcount, and two different
 * sides may field the same general.
 */
import {ok, err, isPlainObject, isNonEmptyString} from './errors.mjs';
import {digestOf} from './digest.mjs';
import {FORMAT_VERSION, getFormat} from './registry.mjs';

export function reserveRequirement(formatId) {
  const definition = getFormat(formatId);
  if (!definition) return null;
  return {
    formatId: definition.formatId,
    reservePerSide: definition.reservePerSide,
    activePerSide: [...definition.activePerSide],
    seats: definition.seats,
    winsRequired: definition.winsRequired,
    humanSeats: definition.humanSeats
  };
}

const CARD_KEYS = ['sourceRef', 'inventoryRef', 'ref', 'reserveRef'];
const LOAN_KEYS = ['loanRef', 'ref', 'reserveRef'];

function readRef(entry, keys) {
  for (const key of keys) {
    if (isNonEmptyString(entry?.[key])) return {ref: entry[key], key};
  }
  return null;
}

function defaultOwner(side, eligibility) {
  if (side === 'mine') {
    return eligibility?.owners?.mine || {kind: 'player', actorId: 'player'};
  }
  return (
    eligibility?.owners?.enemy || {
      kind: eligibility?.enemyKind || 'npc',
      actorId: eligibility?.enemyActorId || 'npc'
    }
  );
}

/**
 * Validate one side's reserve against a trusted, read-only world snapshot.
 * The snapshot is data, not a callback, so this stays a pure function.
 */
function validateSide({side, entries, format, eligibility, seriesLockId, warnings}) {
  const owner = defaultOwner(side, eligibility);
  const inventory = eligibility?.inventory || {};
  const loans = eligibility?.loans || {};
  const circulation = eligibility?.circulation || {};
  const blocks = eligibility?.compatibilityBlocks || {};
  const heldLocks = eligibility?.heldLocks || {};
  const challengeSide = owner.kind === 'challenge';

  if (!Array.isArray(entries)) {
    return err('INVALID_INPUT', `${side} 方备战池必须是数组。`, {details: {side}});
  }
  if (entries.length !== format.reservePerSide) {
    return err(
      'INSUFFICIENT_ROSTER',
      `${format.label} 每方需要 ${format.reservePerSide} 名不同武将，当前 ${entries.length} 名。`,
      {details: {side, required: format.reservePerSide, provided: entries.length, kind: 'count'}}
    );
  }

  const resolved = [];
  const seenRefs = new Set();

  for (const [index, entry] of entries.entries()) {
    if (!isPlainObject(entry)) {
      return err('INVALID_INPUT', `备战池第 ${index + 1} 项格式不正确。`, {details: {side, index}});
    }
    const cardRef = readRef(entry, CARD_KEYS);
    const loanRef = readRef(entry, LOAN_KEYS);

    if (challengeSide) {
      // 挑战对方仅限 B 的合法 loan，不能用任何实体牌冒充。
      const loanId = loanRef?.ref;
      if (!loanId) {
        return err('NOT_ELIGIBLE', '挑战对手只能使用合法的 challenge-loan 阵容。', {
          details: {side, index, kind: 'loan-required'}
        });
      }
      const loan = loans[loanId];
      if (!isPlainObject(loan)) {
        return err('NOT_ELIGIBLE', '借用的武将不存在或已释放。', {details: {side, index, loanRef: loanId, kind: 'invalid-loan'}});
      }
      if (!isNonEmptyString(loan.generalId)) {
        return err('NOT_ELIGIBLE', '借用记录缺少武将标识。', {details: {side, index, loanRef: loanId, kind: 'invalid-loan'}});
      }
      if (inventory[loanId]) {
        return err('NOT_ELIGIBLE', '借用记录不是世界物品，不能当作实体卡使用。', {
          details: {side, index, loanRef: loanId, kind: 'loan-as-item'}
        });
      }
      if (loan.circulation === true) {
        return err('NOT_ELIGIBLE', '借用武将不得进入市场流通。', {details: {side, index, loanRef: loanId, kind: 'loan-circulation'}});
      }
      const purpose = loan.purpose;
      const allowed = eligibility?.loanAllowedPurposes || ['stage-challenge', 'recruited-ally-practice'];
      if (purpose && !allowed.includes(purpose)) {
        return err('NOT_ELIGIBLE', `借用用途 ${purpose} 不允许用于本场系列赛。`, {
          details: {side, index, loanRef: loanId, kind: 'loan-purpose', purpose}
        });
      }
      if (isNonEmptyString(loan.ownerActorId) && loan.ownerActorId !== owner.actorId) {
        return err('NOT_ELIGIBLE', '借用武将不属于当前对手。', {
          details: {side, index, loanRef: loanId, kind: 'loan-owner'}
        });
      }
      if (seenRefs.has(loanId)) {
        return err('INSUFFICIENT_ROSTER', '同一个借用武将不能重复占位。', {
          details: {side, index, loanRef: loanId, kind: 'duplicate-copy'}
        });
      }
      seenRefs.add(loanId);
      if (blocks[loan.generalId]) {
        return err('NOT_ELIGIBLE', blocks[loan.generalId], {
          details: {side, index, generalId: loan.generalId, kind: 'incompatible'}
        });
      }
      resolved.push({reserveRef: loanId, kind: 'loan', loanRef: loanId, generalId: loan.generalId});
      continue;
    }

    if (!cardRef?.ref) {
      return err('INVALID_INPUT', '备战项缺少实体卡引用。', {details: {side, index}});
    }
    const ref = cardRef.ref;
    const record = inventory[ref];
    if (!isPlainObject(record)) {
      return err('NOT_ELIGIBLE', '这张牌不在当前持有快照中。', {
        details: {side, index, ref, kind: 'not-owned'}
      });
    }
    if (isNonEmptyString(record.ownerId) && record.ownerId !== owner.actorId) {
      return err('NOT_ELIGIBLE', '这张牌属于其他人，不能用于本场系列赛。', {
        details: {side, index, ref, kind: 'foreign-card', ownerId: record.ownerId}
      });
    }
    if (record.location !== 'collection') {
      return err('NOT_ELIGIBLE', '参赛副本必须在收藏中，请先捡回垃圾桶或仓库里的卡。', {
        details: {side, index, ref, kind: 'location', location: record.location}
      });
    }
    if (record.protected === true) {
      return err('ROSTER_LOCKED', '这张牌已被保护，不能参赛。', {details: {side, index, ref, kind: 'protected'}});
    }
    const lock = record.lock || heldLocks[ref] || null;
    if (lock && lock !== seriesLockId) {
      return err('ROSTER_LOCKED', '这张牌已被其他比赛或交易占用。', {
        details: {side, index, ref, kind: 'locked', lock}
      });
    }
    if (owner.kind === 'npc') {
      const cardKey = record.cardKey || ref;
      if (!circulation[cardKey]) {
        return err('NOT_ELIGIBLE', '普通顾客只能使用已流入市场的卡。', {
          details: {side, index, ref, cardKey, kind: 'not-in-circulation'}
        });
      }
    }
    const generalId = record.generalId;
    if (!isNonEmptyString(generalId)) {
      return err('NOT_ELIGIBLE', '这张牌缺少武将标识，不能参赛。', {
        details: {side, index, ref, kind: 'missing-general'}
      });
    }
    if (blocks[generalId]) {
      return err('NOT_ELIGIBLE', blocks[generalId], {details: {side, index, generalId, kind: 'incompatible'}});
    }
    if (seenRefs.has(ref)) {
      return err('INSUFFICIENT_ROSTER', '同一个实体副本不能重复占位。', {
        details: {side, index, ref, kind: 'duplicate-copy'}
      });
    }
    seenRefs.add(ref);
    resolved.push({reserveRef: ref, kind: 'card', sourceRef: ref, generalId, cardKey: record.cardKey ?? null});
  }

  const generals = resolved.map(item => item.generalId);
  const distinct = new Set(generals);
  if (distinct.size !== generals.length) {
    const duplicate = generals.find((generalId, index) => generals.indexOf(generalId) !== index);
    return err('INSUFFICIENT_ROSTER', `同一方不能重复上阵同一武将：${duplicate}。`, {
      details: {side, generalId: duplicate, kind: 'duplicate-general'}
    });
  }

  if (resolved.length !== format.reservePerSide) {
    return err('INSUFFICIENT_ROSTER', '备战池人数不足。', {
      details: {side, required: format.reservePerSide, provided: resolved.length, kind: 'count'}
    });
  }

  return ok({owner, entries: resolved, generalIds: generals});
}

/**
 * validateReserve(formatId, rosters, eligibility)
 * or validateReserve({formatId, rosters, eligibility, seriesLockId})
 */
export function validateReserve(formatIdOrInput, rosters, eligibility) {
  const input = isPlainObject(formatIdOrInput) && !Array.isArray(formatIdOrInput) && formatIdOrInput.formatId !== undefined
    ? formatIdOrInput
    : {formatId: formatIdOrInput, rosters, eligibility};
  const {formatId, seriesLockId} = input;
  const eligibilityInput = input.eligibility || {};
  const format = getFormat(formatId);
  if (!format) {
    return err('INVALID_INPUT', `未知赛制：${String(formatId)}`, {details: {formatId}});
  }
  if (!isPlainObject(input.rosters)) {
    return err('INVALID_INPUT', '缺少双方备战池。', {details: {formatId}});
  }

  const warnings = [];
  const mine = validateSide({
    side: 'mine',
    entries: input.rosters.mine,
    format,
    eligibility: eligibilityInput,
    seriesLockId,
    warnings
  });
  if (!mine.ok) return mine;
  const enemy = validateSide({
    side: 'enemy',
    entries: input.rosters.enemy,
    format,
    eligibility: eligibilityInput,
    seriesLockId,
    warnings
  });
  if (!enemy.ok) return enemy;

  const mineRefs = new Set(mine.data.entries.map(item => item.reserveRef));
  const sharedRef = enemy.data.entries.map(item => item.reserveRef).find(ref => mineRefs.has(ref));
  if (sharedRef) {
    return err('INSUFFICIENT_ROSTER', '同一张实体卡不能同时出现在双方备战池。', {
      details: {ref: sharedRef, kind: 'duplicate-copy-across-sides'}
    });
  }

  // 同将不同阵营可以相遇；这里只做记录，不当作错误。
  const crossSide = mine.data.generalIds.filter(generalId => enemy.data.generalIds.includes(generalId));
  if (crossSide.length) warnings.push({code: 'CROSS_SIDE_SAME_GENERAL', generalIds: crossSide});

  const sides = {
    mine: {owner: mine.data.owner, entries: mine.data.entries, generalIds: mine.data.generalIds},
    enemy: {owner: enemy.data.owner, entries: enemy.data.entries, generalIds: enemy.data.generalIds}
  };

  const reserveDigest = digestOf({
    formatId: format.formatId,
    reservePerSide: format.reservePerSide,
    sides: {
      mine: [...sides.mine.entries].sort(compareEntry),
      enemy: [...sides.enemy.entries].sort(compareEntry)
    }
  });

  return ok({
    formatId: format.formatId,
    formatVersion: FORMAT_VERSION,
    reservePerSide: format.reservePerSide,
    activePerSide: [...format.activePerSide],
    seats: format.seats,
    sides,
    reserveDigest,
    warnings
  });
}

function compareEntry(a, b) {
  if (a.generalId !== b.generalId) return a.generalId < b.generalId ? -1 : 1;
  return a.reserveRef < b.reserveRef ? -1 : a.reserveRef > b.reserveRef ? 1 : 0;
}

/** Every reserve ref that a series must lock. */
export function reserveRefs(reserve) {
  return [...reserve.sides.mine.entries, ...reserve.sides.enemy.entries]
    .filter(entry => entry.kind === 'card')
    .map(entry => entry.sourceRef);
}
