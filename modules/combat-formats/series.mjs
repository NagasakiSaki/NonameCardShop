/**
 * Series state machine.
 *
 *   reserve pool → per-round selection → confirm → ready to mount → real start
 *   → round settlement → next round → whole-series settlement
 *
 * Everything here is a pure function over an explicit series DTO. No RNG is
 * consumed except the seeded first landlord draw (which is persisted), no world
 * object is touched, and every failure is a returned error envelope.
 */
import {ok, err, clone, isPlainObject, isNonEmptyString} from './errors.mjs';
import {seededRandom,digestOf} from './digest.mjs';
import {FORMAT_VERSION, getFormat, listFormatIds, assertFormatAvailable} from './registry.mjs';
import {validateReserve, reserveRefs} from './eligibility.mjs';
import {buildRoundPlan, normaliseControlPolicy, DEFAULT_CONTROL_POLICY} from './round-plan.mjs';
import {planRosterLocks, createLockState, lockSummary} from './locks.mjs';
import {planLifecycle, recoveryPolicy, SERIES_MINUTES} from './lifecycle.mjs';

export const SERIES_VERSION = 1;

/**
 * Round settlement is applied atomically inside `reduceSeries` (no intermediate
 * "round-settled" phase), so the reachable phases are exactly these seven.
 */
export const SERIES_PHASES = Object.freeze([
  'selecting',
  'confirmed',
  'mounting',
  'live',
  'interrupted',
  'finished',
  'cancelled'
]);

const CHALLENGE_KINDS = Object.freeze(['stage-challenge', 'ally-practice', 'npc-wager', 'friendly', 'background-npc']);
const FREE_KINDS = Object.freeze(['stage-challenge', 'ally-practice']);

const other = side => (side === 'mine' ? 'enemy' : 'mine');

export function roleMapFor(format, landlordSide) {
  if (format.formatId === 'doudizhu-bo3') {
    return {
      mine: landlordSide === 'mine' ? 'landlord' : 'farmer',
      enemy: landlordSide === 'enemy' ? 'landlord' : 'farmer'
    };
  }
  if (format.formatId === 'versus2v2-bo3') return {mine: 'teammate', enemy: 'teammate'};
  return {mine: 'duelist', enemy: 'duelist'};
}

function humanSeatIdFor(format, playerTeamId, roles) {
  if (format.formatId === 'doudizhu-bo3') {
    return roles[playerTeamId] === 'landlord' ? `${playerTeamId}-landlord` : `${playerTeamId}-farmer-1`;
  }
  return `${playerTeamId}-main`;
}

/** Seats are derived from roles, never guessed from a seat index. */
export function buildSeatSkeleton(format, roles, playerTeamId) {
  const seats = [];
  for (const side of ['mine', 'enemy']) {
    const role = roles[side];
    if (format.formatId === 'doudizhu-bo3' && role === 'landlord') {
      seats.push({seatId: `${side}-landlord`, teamId: side, role: 'landlord'});
    } else if (format.formatId === 'doudizhu-bo3') {
      seats.push({seatId: `${side}-farmer-1`, teamId: side, role: 'farmer'});
      seats.push({seatId: `${side}-farmer-2`, teamId: side, role: 'farmer'});
    } else if (format.formatId === 'versus2v2-bo3') {
      seats.push({seatId: `${side}-main`, teamId: side, role: 'teammate'});
      seats.push({seatId: `${side}-ally`, teamId: side, role: 'teammate'});
    } else {
      seats.push({seatId: `${side}-main`, teamId: side, role: 'duelist'});
    }
  }
  const humanSeatId = humanSeatIdFor(format, playerTeamId, roles);
  return seats.map(seat => ({...seat, controller: seat.seatId === humanSeatId ? 'human' : 'ai'}));
}

function createRound({matchId, index, attempt = 1, roles, format, playerTeamId, prefill = null}) {
  const seatSkeleton = buildSeatSkeleton(format, roles, playerTeamId);
  return {
    index,
    roundId: `${matchId}:r${index}`,
    attempt,
    gameId: `${matchId}:r${index}:g${attempt}`,
    roles: {...roles},
    seatSkeleton,
    seats: null,
    selections: null,
    confirmed: false,
    confirmedAtRevision: null,
    prefill,
    drawsBefore: 0
  };
}

function nextRound(series, index, attempt, roles) {
  const format = getFormat(series.formatId);
  return createRound({
    matchId: series.matchId,
    index,
    attempt,
    roles,
    format,
    playerTeamId: series.playerTeamId
  });
}

function feeStateFor(input, kind) {
  if (kind === 'background-npc') {
    return {
      policy: 'background-continuous',
      tableFee: 0,
      chargeTo: 'none',
      acceptedQuote: null,
      charged: true,
      acknowledged: true
    };
  }
  if (FREE_KINDS.includes(kind)) {
    return {
      policy: 'waived',
      tableFee: 0,
      chargeTo: 'none',
      acceptedQuote: null,
      charged: true,
      acknowledged: false
    };
  }
  const amount = input.fee?.tableFee;
  return {
    policy: 'accepted-quote',
    tableFee: amount,
    chargeTo: 'enemy',
    acceptedQuote: amount,
    charged: false,
    acknowledged: false
  };
}

/**
 * createSeries(input)
 *
 * input: {
 *   worldId, branchId, matchId, seriesId?, seed, formatId, challengeKind?,
 *   challengeId?, stageId?, inviteId?, playerTeamId?, enemyActorId?,
 *   rosters:{mine:[...], enemy:[...]}, eligibility:{...}, capabilities?:[...],
 *   tableId?, fee?:{tableFee}
 * }
 */
export function createSeries(input = {}) {
  if (!isPlainObject(input)) return err('INVALID_INPUT', '系列赛参数缺失。');
  const format = getFormat(input.formatId);
  if (!format) {
    return err('INVALID_INPUT', `未知赛制：${String(input.formatId)}`, {
      details: {formatId: input.formatId, known: listFormatIds()}
    });
  }
  for (const field of ['worldId', 'branchId', 'matchId']) {
    if (!isNonEmptyString(input[field])) return err('INVALID_INPUT', `缺少 ${field}。`, {details: {field}});
  }
  if (!Number.isSafeInteger(input.seed)) {
    return err('INVALID_INPUT', '系列赛需要显式随机种子。', {details: {seed: input.seed}});
  }

  const kind = input.challengeKind || 'friendly';
  if (!CHALLENGE_KINDS.includes(kind)) {
    return err('INVALID_INPUT', `未知约战类型：${kind}`, {details: {challengeKind: kind, allowed: [...CHALLENGE_KINDS]}});
  }

  const available = assertFormatAvailable(format.formatId, input.capabilities ?? input.eligibility?.capabilities);
  if (!available.ok) return available;
  const availability = available.data.availability;

  if (!FREE_KINDS.includes(kind) && kind !== 'background-npc') {
    const quote = input.eligibility?.acceptedTableFee;
    const amount = input.fee?.tableFee;
    if (!Number.isSafeInteger(amount) || amount < 0) {
      return err('INVALID_INPUT', '普通约战必须带入已接受的桌费报价。', {details: {tableFee: amount}});
    }
    if (Number.isSafeInteger(quote) && quote !== amount) {
      // Never silently substitute a new price for an already accepted quote.
      return err('STALE_OPERATION', '桌费已变化，请重新确认报价。', {
        retryable: true,
        details: {acceptedQuote: quote, requested: amount}
      });
    }
  }
  if (FREE_KINDS.includes(kind) && Number(input.fee?.tableFee) > 0) {
    return err('INVALID_INPUT', '挑战与伙伴训练免桌费，不能带入收费。', {details: {tableFee: input.fee.tableFee}});
  }

  const playerTeamId = input.playerTeamId || 'mine';
  if (playerTeamId !== 'mine') {
    // The first release is local single-player: the shop owner is always `mine`.
    // Landlord/farmer side swapping is expressed by roleState, never by renaming teams.
    return err('FEATURE_UNAVAILABLE', '首版只支持玩家在 mine 阵营；换边由地主角色轮换表达。', {
      details: {playerTeamId}
    });
  }
  const enemyTeamId = other(playerTeamId);

  // Optional ally takeover is a *control* option, never an identity change.
  const controlPolicy = normaliseControlPolicy(input.controlPolicy);
  if (controlPolicy === null) {
    return err('INVALID_INPUT', `未知队友控制策略：${String(input.controlPolicy)}`, {
      details: {controlPolicy: input.controlPolicy, allowed: ['optional-ally', 'ai-only']}
    });
  }

  const reserve = validateReserve({
    formatId: format.formatId,
    rosters: input.rosters,
    eligibility: input.eligibility,
    seriesLockId: `${input.matchId}:roster`
  });
  if (!reserve.ok) return reserve;

  const enemyOwner = reserve.data.sides[enemyTeamId].owner;
  const enemyActorId = input.enemyActorId || enemyOwner?.actorId || null;
  if (!isNonEmptyString(enemyActorId)) {
    return err('INVALID_INPUT', '缺少对手 actorId。');
  }

  let landlordSide = null;
  if (format.rolePolicy === 'seeded-first-alternate-after-decisive-round') {
    const rng = seededRandom(input.seed >>> 0);
    landlordSide = rng() < 0.5 ? 'mine' : 'enemy';
  }
  const roles = roleMapFor(format, landlordSide);

  const matchId = input.matchId;
  const warnings = [...reserve.data.warnings];
  if (!availability.variantPinned && !format.legacy) {
    warnings.push({
      code: 'NATIVE_VARIANT_UNPINNED',
      message: '原生子规则尚未由 D 锁定；计划可生成但不可挂载。'
    });
  }

  const series = {
    seriesVersion: SERIES_VERSION,
    formatVersion: FORMAT_VERSION,
    seriesId: input.seriesId || `${matchId}:series`,
    worldId: input.worldId,
    branchId: input.branchId,
    matchId,
    challengeKind: kind,
    challengeId: input.challengeId ?? null,
    stageId: input.stageId ?? null,
    inviteId: input.inviteId ?? null,
    formatId: format.formatId,
    engineMode: format.engineMode,
    nativeVariant: availability.nativeVariant ?? null,
    variantPinned: availability.variantPinned,
    profileId: availability.profileId ?? input.profileId ?? null,
    playerTeamId,
    enemyTeamId,
    enemyActorId,
    controlPolicy,
    seed: input.seed >>> 0,
    reserve: reserve.data,
    reserveDigest: reserve.data.reserveDigest,
    lock: createLockState(matchId, reserveRefs(reserve.data)),
    phase: 'selecting',
    score: {mine: 0, enemy: 0, draws: 0},
    consecutiveDraws: 0,
    roleState: {landlordSide, swaps: 0},
    round: createRound({
      matchId,
      index: 1,
      roles,
      format,
      playerTeamId
    }),
    rounds: [],
    settledResultIds: [],
    settledGameIds: {},
    officialResult: null,
    officialEmitted: false,
    cancellation: null,
    cancellationOffer: null,
    pendingSurrender: null,
    interrupt: null,
    fee: feeStateFor(input, kind),
    time: {minutes: SERIES_MINUTES, applied: false, appliedAt: null, policy: 'pending-series'},
    tableId: input.tableId ?? input.eligibility?.tableId ?? null,
    revision: 1,
    createdAt: input.now ?? null,
    warnings
  };

  return ok({series, view: seriesView(series)});
}

function resolvePick(series, side, seat, selection) {
  const ref =
    selection.reserveRef || selection.sourceRef || selection.loanRef || selection.inventoryRef || selection.ref;
  if (!isNonEmptyString(ref)) {
    return err('INVALID_INPUT', `席位 ${seat.seatId} 缺少备战池引用。`, {details: {seatId: seat.seatId}});
  }
  const entry = series.reserve.sides[side].entries.find(item => item.reserveRef === ref);
  if(series.formatId==='kof'&&entry!==series.reserve.sides[side].entries[0])return err('NOT_ELIGIBLE','KOF 按备战确认的顺序接力，请使用首发武将。');
  if (!entry) {
    return err('NOT_ELIGIBLE', '只能从本场备战池中选择武将。', {
      details: {seatId: seat.seatId, side, ref, kind: 'not-in-reserve'}
    });
  }
  if (isNonEmptyString(selection.generalId) && selection.generalId !== entry.generalId) {
    return err('NOT_ELIGIBLE', '提交的武将与该牌实际武将不一致。', {
      details: {seatId: seat.seatId, expected: entry.generalId, provided: selection.generalId, kind: 'general-mismatch'}
    });
  }
  return ok({entry});
}

function autoPick(series, side, count) {
  const entries = [...series.reserve.sides[side].entries];
  if(series.formatId==='kof')return entries.slice(0,count);
  const salt = Math.imul(series.round.index, 2654435761) + (side === 'enemy' ? 7 : 3);
  const rng = seededRandom((series.seed ^ salt) >>> 0);
  const picked = [];
  while (picked.length < count && entries.length) {
    const index = Math.floor(rng() * entries.length);
    picked.push(entries.splice(index, 1)[0]);
  }
  return picked;
}

/**
 * selectRound(series, {roundId?, selections:[{seatId, reserveRef|sourceRef|loanRef}],
 *                      enemySelections?, expectedRevision?, confirm:true})
 *
 * One confirmation per round. Only the player's own team may be chosen by the
 * caller; the opposing AI team is auto-filled deterministically from its own
 * reserve, so the plan is complete without letting the player pick for the NPC.
 */
export function selectRound(series, input = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.phase !== 'selecting') {
    return err('INVALID_STATE', '当前不在逐局选将阶段。', {details: {phase: series.phase}});
  }
  if (input.expectedRevision != null && input.expectedRevision !== series.revision) {
    return err('STALE_OPERATION', '系列赛状态已变化，请重新读取。', {retryable: true});
  }
  if (input.roundId && input.roundId !== series.round.roundId) {
    return err('STALE_OPERATION', '小局已变化，请重新读取。', {retryable: true});
  }
  if (input.confirm === false) {
    return err('INVALID_INPUT', '选将必须一次确认，不支持分步提交。');
  }

  const next = clone(series);
  const round = next.round;
  const skeleton = round.seatSkeleton;
  const playerTeam = next.playerTeamId;
  const enemyTeam = next.enemyTeamId;

  const provided = Array.isArray(input.selections) ? input.selections : [];
  const bySeat = new Map();
  for (const selection of provided) {
    if (!isPlainObject(selection) || !isNonEmptyString(selection.seatId)) {
      return err('INVALID_INPUT', '选将项格式不正确。');
    }
    if (bySeat.has(selection.seatId)) {
      return err('INVALID_INPUT', '同一席位重复提交。', {details: {seatId: selection.seatId}});
    }
    const seat = skeleton.find(item => item.seatId === selection.seatId);
    if (!seat) {
      return err('INVALID_INPUT', `本局没有席位 ${selection.seatId}。`, {details: {seatId: selection.seatId}});
    }
    if (seat.teamId !== playerTeam) {
      return err('NOT_ELIGIBLE', '只能选择自己控制的阵营。', {
        details: {seatId: selection.seatId, teamId: seat.teamId, kind: 'foreign-team'}
      });
    }
    bySeat.set(selection.seatId, selection);
  }

  const ownSeats = skeleton.filter(seat => seat.teamId === playerTeam);
  for (const seat of ownSeats) {
    if (!bySeat.has(seat.seatId)) {
      return err('INVALID_INPUT', `席位 ${seat.seatId} 尚未选择武将。`, {details: {seatId: seat.seatId}});
    }
  }

  const chosen = new Map();
  const teamGenerals = new Map([[playerTeam, new Set()], [enemyTeam, new Set()]]);

  for (const seat of ownSeats) {
    const resolved = resolvePick(next, playerTeam, seat, bySeat.get(seat.seatId));
    if (!resolved.ok) return resolved;
    const {entry} = resolved.data;
    if (teamGenerals.get(playerTeam).has(entry.generalId)) {
      return err('NOT_ELIGIBLE', `同一阵营同一小局不能重复上阵 ${entry.generalId}。`, {
        details: {seatId: seat.seatId, generalId: entry.generalId, kind: 'duplicate-general'}
      });
    }
    teamGenerals.get(playerTeam).add(entry.generalId);
    chosen.set(seat.seatId, entry);
  }

  const enemySeats = skeleton.filter(seat => seat.teamId === enemyTeam);
  const providedEnemy = Array.isArray(input.enemySelections) ? input.enemySelections : [];
  if (providedEnemy.length) {
    if (providedEnemy.length !== enemySeats.length) {
      return err('INVALID_INPUT', '对方席位提交不完整。', {details: {required: enemySeats.length}});
    }
    for (const selection of providedEnemy) {
      if (!isPlainObject(selection) || !isNonEmptyString(selection.seatId)) {
        return err('INVALID_INPUT', '对方选将项格式不正确。');
      }
      const seat = enemySeats.find(item => item.seatId === selection.seatId);
      if (!seat) return err('INVALID_INPUT', `对方没有席位 ${selection.seatId}。`);
      if (chosen.has(seat.seatId)) return err('INVALID_INPUT', '对方席位重复提交。');
      const resolved = resolvePick(next, enemyTeam, seat, selection);
      if (!resolved.ok) return resolved;
      const {entry} = resolved.data;
      if (teamGenerals.get(enemyTeam).has(entry.generalId)) {
        return err('NOT_ELIGIBLE', '对方阵营不能重复上阵同一武将。', {
          details: {seatId: seat.seatId, generalId: entry.generalId, kind: 'duplicate-general'}
        });
      }
      teamGenerals.get(enemyTeam).add(entry.generalId);
      chosen.set(seat.seatId, entry);
    }
  } else {
    const picks = autoPick(next, enemyTeam, enemySeats.length);
    if (picks.length !== enemySeats.length) {
      return err('INSUFFICIENT_ROSTER', '对方备战池不足以填满席位。');
    }
    enemySeats.forEach((seat, index) => {
      const entry = picks[index];
      teamGenerals.get(enemyTeam).add(entry.generalId);
      chosen.set(seat.seatId, entry);
    });
  }

  const seats = skeleton.map(seat => {
    const entry = chosen.get(seat.seatId);
    const dto = {
      seatId: seat.seatId,
      teamId: seat.teamId,
      role: seat.role,
      controller: seat.controller,
      generalId: entry.generalId,
      kind: entry.kind
    };
    if (entry.kind === 'loan') dto.loanRef = entry.loanRef;
    else dto.sourceRef = entry.sourceRef;
    return dto;
  });

  next.round = {
    ...round,
    seats,
    selections: {
      mine: seats.filter(seat => seat.teamId === playerTeam).map(seat => ({
        seatId: seat.seatId,
        reserveRef: seat.sourceRef || seat.loanRef
      })),
      enemy: seats.filter(seat => seat.teamId === enemyTeam).map(seat => ({
        seatId: seat.seatId,
        reserveRef: seat.sourceRef || seat.loanRef
      }))
    },
    confirmed: true,
    confirmedAtRevision: next.revision + 1,
    prefill: null
  };
  next.phase = 'confirmed';
  next.revision += 1;

  const lock = planRosterLocks(next);
  const lifecycle = planLifecycle(next);
  const firstConfirmation = next.rounds.length === 0 && next.round.index === 1 && next.round.attempt === 1;
  const effects = [
    ...(lock.ok ? lock.effects : []),
    ...(lifecycle.ok ? lifecycle.effects : []),
    ...(firstConfirmation
      ? [
          {
            type: 'registerSeries',
            event: 'seriesRegistered',
            matchId: next.matchId,
            seriesId: next.seriesId,
            formatId: next.formatId,
            tableId: next.tableId,
            reserveDigest: next.reserveDigest,
            idempotencyKey: `${next.matchId}|register`
          }
        ]
      : []),
    {
      type: 'confirmRoundSelection',
      event: 'roundSelectionConfirmed',
      matchId: next.matchId,
      roundId: next.round.roundId,
      gameId: next.round.gameId,
      seats: seats.map(seat => ({seatId: seat.seatId, generalId: seat.generalId})),
      idempotencyKey: `${next.round.gameId}|selection`
    }
  ];
  return ok({series: next, view: seriesView(next)}, effects);
}

/**
 * "Ready to mount" step: the confirmed round is handed to the native bridge.
 * The plan is embedded in the intent so the mount request cannot drift from the
 * confirmed selection.
 */
export function beginMount(series) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.phase !== 'confirmed') {
    return err('INVALID_STATE', '只有已确认选将的小局才能准备挂载。', {details: {phase: series.phase}});
  }
  const next = clone(series);
  next.phase = 'mounting';
  next.revision += 1;
  const built = buildRoundPlan(next);
  if (!built.ok) return built;
  const plan = built.data.plan;
  return ok({series: next, plan, view: seriesView(next)}, [
    {
      type: 'mountRound',
      matchId: next.matchId,
      roundId: plan.roundId,
      gameId: plan.gameId,
      plan,
      mountable: plan.mountable,
      idempotencyKey: `${plan.gameId}|mount`
    }
  ]);
}

/** Host confirmation that the native round really started (mount succeeded). */
export function markRoundStarted(series, report = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (!['confirmed', 'mounting'].includes(series.phase)) {
    return err('INVALID_STATE', '当前状态不能标记为已开局。', {details: {phase: series.phase}});
  }
  if (report.gameId && report.gameId !== series.round.gameId) {
    return err('STALE_OPERATION', '挂载的牌局不是当前小局。', {details: {gameId: report.gameId}});
  }
  const next = clone(series);
  next.phase = 'live';
  next.round.startedAt = report.startedAt || null;
  next.revision += 1;
  return ok({series: next, view: seriesView(next)});
}

function mapWinner(series, result) {
  const teamIds = [...new Set(series.round.seats.map(seat => seat.teamId))];
  if (result.draw === true || result.winningTeamId === null || result.winningTeamId === 'draw') {
    return ok({winner: 'draw', teamIds});
  }
  const winningTeamId = result.winningTeamId;
  if (!teamIds.includes(winningTeamId)) {
    const asSeat = series.round.seats.find(seat => seat.seatId === winningTeamId);
    return err(
      'RESULT_CONFLICT',
      asSeat
        ? '胜方必须是阵营，不能用座位或主将代替整队胜负。'
        : '结果中的胜方阵营不在本小局。',
      {details: {winningTeamId, teams: teamIds, seatId: asSeat ? asSeat.seatId : null}}
    );
  }
  return ok({winner: winningTeamId, teamIds});
}

/**
 * A team win must be backed by whole-team evidence. A dead main character with
 * a living ally is never a team loss, so seat-level ids are rejected here.
 */
function checkOutcomeEvidence(series, result, winner) {
  if (winner === 'draw') return ok({});
  const seatIds = new Set(series.round.seats.map(seat => seat.seatId));
  const teamIds = new Set(series.round.seats.map(seat => seat.teamId));
  const condition = result.winCondition || 'elimination';
  if (condition !== 'elimination') return ok({});
  const loser = [...teamIds].find(teamId => teamId !== winner);

  if (Array.isArray(result.eliminatedTeams)) {
    const badTeam = result.eliminatedTeams.find(teamId => !teamIds.has(teamId));
    if (badTeam) {
      return err('RESULT_CONFLICT', '淘汰记录必须是阵营；主将或座位死亡不能代表整队败北。', {
        details: {eliminatedTeams: result.eliminatedTeams, teams: [...teamIds], offending: badTeam}
      });
    }
    if (!result.eliminatedTeams.includes(loser)) {
      return err('RESULT_CONFLICT', '阵营胜利缺少对方整队淘汰证据。', {
        details: {winner, loser, eliminatedTeams: result.eliminatedTeams}
      });
    }
  }
  if (Array.isArray(result.aliveSeats)) {
    const badSeat = result.aliveSeats.find(seatId => !seatIds.has(seatId));
    if (badSeat) {
      return err('RESULT_CONFLICT', '存活席位不属于本小局。', {details: {aliveSeats: result.aliveSeats, offending: badSeat}});
    }
    const aliveOnLoser = result.aliveSeats.filter(seatId => {
      const seat = series.round.seats.find(item => item.seatId === seatId);
      return seat && seat.teamId === loser;
    });
    if (aliveOnLoser.length) {
      return err('RESULT_CONFLICT', '对方阵营仍有存活席位，不能判整队败北。', {
        details: {loser, aliveSeats: aliveOnLoser}
      });
    }
  }
  return ok({});
}

function officialResultFor(series, {result, cause, winVerified, cancelled = false}) {
  return {
    version: 1,
    official: true,
    producedOnce: true,
    seriesId: series.seriesId,
    matchId: series.matchId,
    worldId: series.worldId,
    branchId: series.branchId,
    formatId: series.formatId,
    engineMode: series.engineMode,
    nativeVariant: series.nativeVariant,
    profileId: series.profileId,
    formatVersion: series.formatVersion,
    challengeKind: series.challengeKind,
    challengeId: series.challengeId,
    stageId: series.stageId,
    inviteId: series.inviteId,
    playerTeamId: series.playerTeamId,
    enemyTeamId: series.enemyTeamId,
    enemyActorId: series.enemyActorId,
    result,
    score: {...series.score},
    roundsPlayed: series.rounds.length,
    complete: !cancelled,
    cancelled,
    simulated: false,
    winVerified,
    reserveDigest: series.reserveDigest,
    rosters: {
      mine: [...series.reserve.sides.mine.generalIds],
      enemy: [...series.reserve.sides.enemy.generalIds]
    },
    cause,
    settledAtRevision: series.revision
  };
}

function closeSeries(series, {result, cause, winVerified, cancelled = false}) {
  series.phase = cancelled ? 'cancelled' : 'finished';
  series.officialResult = officialResultFor(series, {result, cause, winVerified, cancelled});
  series.officialEmitted = true;
  series.closedAtRevision = series.revision;
  if (series.pendingSurrender) series.pendingSurrender = null;
}

function closingEffects(series) {
  const effects = [
    {
      type: 'settleOfficialSeries',
      event: 'officialSeriesSettled',
      matchId: series.matchId,
      seriesId: series.seriesId,
      officialResult: series.officialResult,
      idempotencyKey: `${series.matchId}|series-settled`
    }
  ];
  const lock = planRosterLocks(series);
  if (lock.ok) effects.push(...lock.effects);
  const lifecycle = planLifecycle(series);
  if (lifecycle.ok) effects.push(...lifecycle.effects);
  return effects;
}

/**
 * reduceSeries(series, verifiedRoundResult)
 *
 * Only a trusted bridge result may settle a round. Duplicate resultIds are
 * idempotent; a second, different result for the same gameId is a conflict;
 * a result from an older branch/game is stale. The official series result is
 * produced exactly once.
 */
export function reduceSeries(series, result) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (!isPlainObject(result)) return err('INVALID_INPUT', '缺少可信小局结果。');

  for (const field of ['gameId', 'roundId', 'resultId']) {
    if (!isNonEmptyString(result[field])) {
      return err('INVALID_INPUT', `结果缺少字段 ${field}。`, {details: {field}});
    }
  }
  if (result.originVerified !== true || result.sourceVerified !== true) {
    return err('RESULT_CONFLICT', '结果未经可信桥校验，不能进入正式系列赛。', {
      details: {originVerified: result.originVerified === true, sourceVerified: result.sourceVerified === true}
    });
  }
  if (result.simulated !== false) {
    return err('RESULT_CONFLICT', '模拟结果不能作为正式赛果。', {details: {simulated: result.simulated}});
  }
  if (result.completed !== true) {
    return err('RESULT_CONFLICT', '小局尚未完成。', {details: {completed: result.completed}});
  }

  const resultSignature=digestOf(result);
  if (series.settledResultIds.includes(result.resultId)) {
    if(series.resultSignatures?.[result.resultId]!==resultSignature)return err('RESULT_CONFLICT','同一结果标识对应不同内容。');
    return ok(
      {series: clone(series), duplicate: true, officialResult: series.officialResult, view: seriesView(series)},
      []
    );
  }
  if (series.phase === 'finished' || series.phase === 'cancelled') {
    return err('INVALID_STATE', '系列赛已结束，不能继续结算小局。', {details: {phase: series.phase}});
  }
  if (series.phase === 'interrupted') {
    return err('RECOVERY_REQUIRED', '小局技术中断，请先重开当前小局或放弃系列赛。', {
      details: recoveryPolicy(series)
    });
  }
  if (series.phase !== 'live') {
    return err('INVALID_STATE', '小局尚未真正开局，不能结算。', {details: {phase: series.phase}});
  }

  const settledForGame = series.settledGameIds[result.gameId];
  if (settledForGame && settledForGame !== result.resultId) {
    return err('RESULT_CONFLICT', '同一小局出现冲突结果，已保留原结果。', {
      details: {gameId: result.gameId, settledResultId: settledForGame, incomingResultId: result.resultId}
    });
  }
  if (result.gameId !== series.round.gameId) {
    const past = series.rounds.find(round => round.gameId === result.gameId);
    return err(
      'STALE_OPERATION',
      past ? '该小局已结算，迟到结果被拒绝。' : '结果不属于当前小局。',
      {retryable: false, details: {gameId: result.gameId, expected: series.round.gameId}}
    );
  }
  if (result.roundId !== series.round.roundId) {
    return err('STALE_OPERATION', '结果的小局标识与当前小局不一致。', {
      details: {roundId: result.roundId, expected: series.round.roundId}
    });
  }
  if (result.reserveDigest !== series.reserveDigest) {
    return err('RESULT_CONFLICT', '结果阵容摘要与本场备战池不一致。', {
      details: {expected: series.reserveDigest, received: result.reserveDigest}
    });
  }
  if (result.profileId !== series.profileId) {
    return err('PROFILE_MISMATCH', '结果来自不同的原生 profile。', {
      details: {expected: series.profileId, received: result.profileId}
    });
  }
  if (isNonEmptyString(result.branchId) && result.branchId !== series.branchId) {
    return err('STALE_OPERATION', '结果来自其他分支。', {details: {branchId: result.branchId}});
  }
  if (isNonEmptyString(result.seriesId) && result.seriesId !== series.seriesId) {
    return err('STALE_OPERATION', '结果属于其他系列赛。', {details: {seriesId: result.seriesId}});
  }

  const mapped = mapWinner(series, result);
  if (!mapped.ok) return mapped;
  const {winner} = mapped.data;
  const evidence = checkOutcomeEvidence(series, result, winner);
  if (!evidence.ok) return evidence;

  const format = getFormat(series.formatId);
  const next = clone(series);
  const round = next.round;
  const cause = result.cause || 'engine';

  next.pendingSurrender = null;
  next.settledResultIds.push(result.resultId);
  next.resultSignatures??={};next.resultSignatures[result.resultId]=resultSignature;
  next.settledGameIds[round.gameId] = result.resultId;
  next.revision += 1;

  next.rounds.push({
    roundId: round.roundId,
    gameId: round.gameId,
    resultId: result.resultId,
    index: round.index,
    attempt: round.attempt,
    winner,
    cause,
    roles: {...round.roles},
    seats: round.seats.map(seat => ({
      seatId: seat.seatId,
      teamId: seat.teamId,
      role: seat.role,
      controller: seat.controller,
      generalId: seat.generalId
    })),
    settledAtRevision: next.revision
  });

  const effects = [
    {
      type: 'settleOfficialRound',
      event: 'officialRoundSettled',
      matchId: next.matchId,
      roundId: round.roundId,
      gameId: round.gameId,
      resultId: result.resultId,
      winner,
      score: {...next.score},
      idempotencyKey: `${round.gameId}|settled`
    }
  ];

  if (winner === 'draw') {
    next.score.draws += 1;
    next.consecutiveDraws += 1;
    if (format.drawPolicy === 'finish-draw') {
      // Legacy KOF ends on a draw; it must not be rewritten into a replay.
      next.revision += 1;
      closeSeries(next, {result: 'draw', cause, winVerified: false});
      effects.push(...closingEffects(next));
      return ok({series: next, view: seriesView(next), officialResult: next.officialResult}, effects);
    }
    if (next.consecutiveDraws >= 3) {
      next.cancellationOffer = {
        available: true,
        draws: next.consecutiveDraws,
        message: '连续 3 次平局，双方可取消且无挑战奖励。'
      };
    }
    next.round = nextRound(next, round.index, round.attempt + 1, round.roles);
    next.round.drawsBefore = next.consecutiveDraws;
    next.phase = 'selecting';
    effects.push({
      type: 'scheduleRoundReplay',
      event: 'roundReplayScheduled',
      matchId: next.matchId,
      roundId: next.round.roundId,
      gameId: next.round.gameId,
      reason: 'draw-same-roles',
      idempotencyKey: `${next.round.gameId}|replay`
    });
    return ok({series: next, view: seriesView(next)}, effects);
  }

  next.score[winner] += 1;
  next.consecutiveDraws = 0;
  next.cancellationOffer = null;

  if (format.rolePolicy === 'seeded-first-alternate-after-decisive-round') {
    next.roleState.landlordSide = other(next.roleState.landlordSide);
    next.roleState.swaps += 1;
  }

  if (next.score[winner] >= format.winsRequired) {
    next.revision += 1;
    closeSeries(next, {
      result: winner === next.playerTeamId ? 'win' : 'loss',
      cause,
      winVerified: true
    });
    effects.push(...closingEffects(next));
    return ok({series: next, view: seriesView(next), officialResult: next.officialResult}, effects);
  }

  const roles = roleMapFor(format, next.roleState.landlordSide);
  next.round = nextRound(next, round.index + 1, 1, roles);
  next.phase = 'selecting';
  return ok({series: next, view: seriesView(next)}, effects);
}

/** Cancel before any round started, or after the 3-draw offer. */
export function cancelSeries(series, {reason = 'player-request'} = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.phase === 'finished' || series.phase === 'cancelled') {
    return err('INVALID_STATE', '系列赛已结束。', {details: {phase: series.phase}});
  }
  const next = clone(series);
  const drawCancellation = reason === 'draw-cancellation';
  if (drawCancellation) {
    if (!next.cancellationOffer?.available) {
      return err('INVALID_STATE', '尚未满足连续平局取消条件。', {details: {draws: next.consecutiveDraws}});
    }
  } else if (next.phase === 'live' || next.phase === 'interrupted' || next.rounds.length > 0) {
    return err('INVALID_STATE', '已经开局的系列赛不能按未开局取消；请认输或放弃。', {
      details: {phase: next.phase, rounds: next.rounds.length}
    });
  }
  next.revision += 1;
  next.cancellation = {
    reason,
    atRevision: next.revision,
    draws: next.score.draws,
    refundTableFee: true,
    rewardEligible: false
  };
  closeSeries(next, {result: 'cancelled', cause: reason, winVerified: false, cancelled: true});
  return ok({series: next, view: seriesView(next), officialResult: next.officialResult}, closingEffects(next));
}

/** Player concession. A conceded series never counts as a win or an unlock. */
export function surrenderSeries(series, {scope = 'series'} = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.phase === 'finished' || series.phase === 'cancelled') {
    return err('INVALID_STATE', '系列赛已结束。', {details: {phase: series.phase}});
  }
  const next = clone(series);
  if (scope === 'round') {
    if (next.phase !== 'live') {
      return err('INVALID_STATE', '当前没有已开始的小局可以认输。', {details: {phase: next.phase}});
    }
    next.pendingSurrender = {
      scope: 'round',
      roundId: next.round.roundId,
      gameId: next.round.gameId,
      teamId: next.playerTeamId,
      atRevision: next.revision
    };
    next.revision += 1;
    return ok({series: next, view: seriesView(next)}, [
      {
        type: 'surrenderRound',
        matchId: next.matchId,
        roundId: next.round.roundId,
        gameId: next.round.gameId,
        teamId: next.playerTeamId,
        idempotencyKey: `${next.round.gameId}|surrender`
      }
    ]);
  }
  if (scope !== 'series') return err('INVALID_INPUT', `未知认输范围：${String(scope)}`);
  next.revision += 1;
  next.concession = {atRevision: next.revision, roundsPlayed: next.rounds.length};
  closeSeries(next, {result: 'loss', cause: 'player-concession', winVerified: false});
  next.officialResult.concession = true;
  return ok({series: next, view: seriesView(next), officialResult: next.officialResult}, closingEffects(next));
}

/**
 * Technical interruption. This build cannot restore native state exactly, so it
 * says so and offers only "restart this stakeless round" or "abandon".
 */
export function interruptSeries(series, {reason = 'technical'} = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.phase === 'live') {
    const next = clone(series);
    next.phase = 'interrupted';
    next.interrupt = {
      reason,
      atRevision: next.revision,
      roundId: next.round.roundId,
      gameId: next.round.gameId,
      recovery: recoveryPolicy(next)
    };
    next.revision += 1;
    return ok({series: next, view: seriesView(next)}, [
      {
        type: 'interruptRound',
        matchId: next.matchId,
        roundId: next.round.roundId,
        gameId: next.round.gameId,
        reason,
        recoverySupported: false,
        idempotencyKey: `${next.round.gameId}|interrupt`
      }
    ]);
  }
  if (['selecting', 'confirmed', 'mounting'].includes(series.phase)) {
    return cancelSeries(series, {reason: 'pre-start'});
  }
  return err('INVALID_STATE', '当前状态不能中断。', {details: {phase: series.phase}});
}

/** Restart the current round without a stake; settled rounds are never recounted. */
export function restartRound(series, {reason = 'technical'} = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.phase !== 'interrupted') {
    return err('INVALID_STATE', '只有技术中断的系列赛可以重开当前小局。', {details: {phase: series.phase}});
  }
  const next = clone(series);
  const round = next.round;
  const prefill = Array.isArray(round.seats)
    ? round.seats
        .filter(seat => seat.teamId === next.playerTeamId)
        .map(seat => ({seatId: seat.seatId, reserveRef: seat.sourceRef || seat.loanRef}))
    : null;
  next.round = nextRound(next, round.index, round.attempt + 1, round.roles);
  next.round.prefill = prefill;
  next.interrupt = null;
  next.pendingSurrender = null;
  next.phase = 'selecting';
  next.revision += 1;
  return ok({series: next, view: seriesView(next)}, [
    {
      type: 'restartRound',
      matchId: next.matchId,
      roundId: next.round.roundId,
      gameId: next.round.gameId,
      reason,
      stake: 0,
      prefill,
      idempotencyKey: `${next.round.gameId}|restart`
    }
  ]);
}

/** Abandon an interrupted or running series; resources are released, no fake win. */
export function abandonSeries(series, {reason = 'technical'} = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (!['interrupted', 'live', 'confirmed', 'mounting'].includes(series.phase)) {
    return err('INVALID_STATE', '当前状态不能放弃系列赛。', {details: {phase: series.phase}});
  }
  const next = clone(series);
  next.revision += 1;
  next.cancellation = {
    reason: `abandoned:${reason}`,
    atRevision: next.revision,
    draws: next.score.draws,
    preservedSettledRounds: next.rounds.length,
    rewardEligible: false
  };
  closeSeries(next, {result: 'cancelled', cause: `abandoned:${reason}`, winVerified: false, cancelled: true});
  return ok({series: next, view: seriesView(next), officialResult: next.officialResult}, closingEffects(next));
}

const RESUME_POLICY = Object.freeze({
  selecting: 'choose-generals',
  confirmed: 'mount-round',
  mounting: 'mount-round',
  live: 'resume-native-or-interrupt',
  interrupted: 'restart-or-abandon',
  finished: 'none',
  cancelled: 'none'
});

/** Read-only DTO for the `combat.series` query. */
export function seriesView(series) {
  if (!isPlainObject(series)) return null;
  const format = getFormat(series.formatId);
  const round = series.round;
  const controlledSeat = round?.seats?.find(seat => seat.controller === 'human')
    || round?.seatSkeleton?.find(seat => seat.controller === 'human')
    || null;
  return {
    seriesVersion: series.seriesVersion,
    formatVersion: series.formatVersion,
    seriesId: series.seriesId,
    matchId: series.matchId,
    worldId: series.worldId,
    branchId: series.branchId,
    formatId: series.formatId,
    engineMode: series.engineMode,
    nativeVariant: series.nativeVariant,
    variantPinned: series.variantPinned,
    profileId: series.profileId,
    challengeKind: series.challengeKind,
    challengeId: series.challengeId,
    stageId: series.stageId,
    inviteId: series.inviteId,
    phase: series.phase,
    revision: series.revision,
    score: {...series.score},
    consecutiveDraws: series.consecutiveDraws,
    roles: {...series.roleState},
    reserve: {
      digest: series.reserveDigest,
      perSide: series.reserve.reservePerSide,
      generalIds: {
        mine: [...series.reserve.sides.mine.generalIds],
        enemy: [...series.reserve.sides.enemy.generalIds]
      }
    },
    round: round
      ? {
          roundId: round.roundId,
          gameId: round.gameId,
          index: round.index,
          attempt: round.attempt,
          roles: {...round.roles},
          seats: round.seats ? round.seats.map(seat => ({...seat})) : null,
          seatSkeleton: round.seatSkeleton.map(seat => ({...seat})),
          confirmed: round.confirmed,
          prefill: round.prefill || null
        }
      : null,
    controlledSeatId: controlledSeat?.seatId || null,
    controlPolicy: series.controlPolicy || DEFAULT_CONTROL_POLICY,
    seatCount: round?.seats?.length ?? round?.seatSkeleton?.length ?? 0,
    expectedSeatCount: format?.seats ?? null,
    lock: lockSummary(series),
    fee: {
      policy: series.fee.policy,
      tableFee: series.fee.tableFee,
      chargeTo: series.fee.chargeTo,
      acceptedQuote: series.fee.acceptedQuote,
      charged: Boolean(series.fee.charged)
    },
    time: {...series.time},
    cancellationOffer: series.cancellationOffer,
    cancellation: series.cancellation,
    interrupt: series.interrupt,
    pendingSurrender: series.pendingSurrender,
    officialResult: series.officialResult,
    resumePolicy: RESUME_POLICY[series.phase] || 'none',
    warnings: series.warnings
  };
}

export {planRosterLocks};
