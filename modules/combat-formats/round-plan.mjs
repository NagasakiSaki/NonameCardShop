/**
 * RoundPlan construction.
 *
 * A plan is a pure, deterministic description of one round: it is what group D
 * mounts into the native engine. It carries the three separate identities
 * (formatId / engineMode / nativeVariant) plus the pinned profile and the
 * reserve digest, so a result can never be attributed to a different lineup.
 *
 * Plans are re-derivable: identical series state always produces a deep-equal
 * plan, which is how duplicate mount requests are detected downstream.
 */
import {ok, err, clone, isPlainObject, isNonEmptyString} from './errors.mjs';
import {getFormat} from './registry.mjs';

export const PLAN_VERSION = 1;

/**
 * Ally takeover (V7 supplement 06): default is `optional-ally`, i.e. the AI keeps
 * driving the ally unless the player explicitly takes over for one round.
 * `ai-only` disables the option for that series. An unknown/absent value must
 * still behave like the default, so older consumers keep working.
 */
export const DEFAULT_CONTROL_POLICY = 'optional-ally';
export const CONTROL_POLICIES = Object.freeze(['optional-ally', 'ai-only']);

export function normaliseControlPolicy(value) {
  if (value === undefined || value === null) return DEFAULT_CONTROL_POLICY;
  return CONTROL_POLICIES.includes(value) ? value : null;
}

const PLAN_PHASES = Object.freeze(['confirmed', 'mounting', 'live', 'round-settled', 'interrupted']);

function roundSeed(series, round) {
  const index = (round?.index ?? 1) >>> 0;
  const attempt = (round?.attempt ?? 1) >>> 0;
  return ((series.seed ^ Math.imul(index, 2654435761) ^ Math.imul(attempt, 40503)) >>> 0);
}

/**
 * Legacy two-seat profiles keep their 4-card opening and first-draw penalty.
 * New native modes must open exactly as the native mode does; the legacy
 * first-round reduction must never be forced onto them.
 */
export function handPolicyFor(format, {replacement = false} = {}) {
  if (replacement && format.handPolicy.replacement) {
    return {
      policy: 'replacement',
      initialHand: format.handPolicy.replacement.drawn,
      firstDrawPenalty: 0,
      replacement: {...format.handPolicy.replacement},
      inheritHand: false,
      inheritEquipment: false,
      inheritJudgement: false
    };
  }
  return {
    policy: format.legacy ? 'legacy-two-seat' : 'native-initial',
    initialHand: format.handPolicy.initialHand,
    firstDrawPenalty: format.handPolicy.firstDrawPenalty,
    replacement: null,
    inheritHand: false,
    inheritEquipment: false,
    inheritJudgement: false
  };
}

function seatDto(seat) {
  const dto = {
    seatId: seat.seatId,
    teamId: seat.teamId,
    role: seat.role,
    controller: seat.controller,
    generalId: seat.generalId
  };
  if (seat.kind === 'loan' || seat.loanRef) dto.loanRef = seat.loanRef;
  else dto.sourceRef = seat.sourceRef;
  return dto;
}

/**
 * buildRoundPlan(series) → RoundPlan
 * Required fields per shared contract: version, worldId, branchId, matchId,
 * gameId, roundId, formatId, engineMode, nativeVariant, profileId, seed,
 * reserveDigest, playerTeamId, controlledSeatId, seats.
 */
export function buildRoundPlan(series) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (!PLAN_PHASES.includes(series.phase)) {
    return err('INVALID_STATE', '小局选将尚未确认，不能生成对局计划。', {details: {phase: series.phase}});
  }
  const round = series.round;
  if (!isPlainObject(round) || !Array.isArray(round.seats) || round.seats.length === 0) {
    return err('INVALID_STATE', '当前小局没有完整席位。');
  }
  const format = getFormat(series.formatId);
  if (!format) return err('INVALID_INPUT', `未知赛制：${series.formatId}`);
  if (round.seats.length !== format.seats) {
    return err('INVALID_STATE', `座位数与赛制不符：需要 ${format.seats} 座，当前 ${round.seats.length} 座。`, {
      details: {seats: round.seats.length, required: format.seats}
    });
  }
  const humans = round.seats.filter(seat => seat.controller === 'human');
  if (humans.length !== 1) {
    return err('INVALID_STATE', '每局必须且只能有一个真人控制席位。', {details: {humans: humans.length}});
  }
  const seats = round.seats.map(seatDto);
  for (const seat of seats) {
    if (!isNonEmptyString(seat.generalId)) {
      return err('INVALID_STATE', `席位 ${seat.seatId} 缺少武将。`);
    }
    if (!seat.sourceRef && !seat.loanRef) {
      return err('INVALID_STATE', `席位 ${seat.seatId} 缺少卡牌或借用引用。`);
    }
  }

  const mountable = Boolean(series.profileId) && (format.legacy || series.variantPinned !== false);
  const plan = {
    version: PLAN_VERSION,
    worldId: series.worldId,
    branchId: series.branchId,
    matchId: series.matchId,
    gameId: round.gameId,
    roundId: round.roundId,
    seriesId: series.seriesId,
    formatId: series.formatId,
    engineMode: series.engineMode,
    nativeVariant: series.nativeVariant ?? null,
    profileId: series.profileId ?? null,
    formatVersion: series.formatVersion,
    seed: roundSeed(series, round),
    reserveDigest: series.reserveDigest,
    playerTeamId: series.playerTeamId,
    controlledSeatId: humans[0].seatId,
    // Optional ally takeover: the primary seat above is always the opening main
    // general. `controller` stays the initial declaration and is never rewritten
    // by a temporary takeover, so the pool / main identity / camp stay stable.
    controlPolicy: series.controlPolicy || DEFAULT_CONTROL_POLICY,
    seats,
    seatCount: seats.length,
    roundIndex: round.index,
    attempt: round.attempt,
    roles: {...round.roles},
    scoreBefore: {...series.score},
    handPolicy: handPolicyFor(format),
    inheritAcrossRounds: false,
    reserveLocks: {lockId: series.lock.lockId, scope: 'whole-series'},
    mountable,
    warnings: mountable
      ? []
      : [{code: 'NATIVE_VARIANT_UNPINNED', message: '原生子规则/profile 未锁定，计划可生成但不可挂载。'}]
  };
  return ok({plan});
}

/** Integration guard: refuse to mount a plan the registry cannot back. */
export function planMountCheck(plan) {
  if (!isPlainObject(plan)) return err('INVALID_INPUT', '缺少对局计划。');
  if (!plan.mountable) {
    return err('FEATURE_UNAVAILABLE', '该赛制的原生子规则尚未锁定，暂不可挂载。', {
      details: {formatId: plan.formatId, profileId: plan.profileId, nativeVariant: plan.nativeVariant}
    });
  }
  return ok({plan});
}

/**
 * Read-only description of who *could* be taken over this round.
 *
 * This is a display/validation hint, not a control command: same-camp, alive,
 * pending and duplicate-request checks belong to D's mounted handle. C only
 * states the stable identity facts — the primary seat never changes, and a
 * takeover never rewrites seats, roles, the pool or the camp.
 */
export function allyControlSeats(plan) {
  if (!isPlainObject(plan) || !Array.isArray(plan.seats)) {
    return err('INVALID_INPUT', '缺少对局计划。');
  }
  const policy = normaliseControlPolicy(plan.controlPolicy) || DEFAULT_CONTROL_POLICY;
  const primarySeatId = plan.controlledSeatId || null;
  const seats = plan.seats
    .filter(seat => seat.teamId === plan.playerTeamId && seat.controller === 'ai' && seat.seatId !== primarySeatId)
    .map(seat => ({seatId: seat.seatId, role: seat.role, generalId: seat.generalId}));
  return ok({
    policy,
    enabled: policy !== 'ai-only' && seats.length > 0,
    primarySeatId,
    seats,
    resetsEachRound: true,
    note: '候选席位仅供提示；同阵营、存活、待切换与重复 requestId 由 D 的挂载句柄校验。'
  });
}

/**
 * KOF replacement: the next general comes from the reserve order, opens with a
 * fresh four-card hand and inherits nothing from the previous character.
 */
export function planKofReplacement(series, {side, index} = {}) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.formatId !== 'kof') return err('INVALID_STATE', '只有 KOF 使用换将计划。');
  if (!['mine', 'enemy'].includes(side)) return err('INVALID_INPUT', '换将阵营不正确。');
  const format = getFormat('kof');
  const entries = series.reserve?.sides?.[side]?.entries || [];
  if (!Number.isSafeInteger(index) || index < 1 || index >= format.reservePerSide) {
    return err('INVALID_INPUT', `换将顺位必须是 1..${format.reservePerSide - 1}。`, {details: {index}});
  }
  const entry = entries[index];
  if (!entry) return err('INVALID_STATE', '备战池没有该顺位的武将。');
  const base = buildRoundPlan(series);
  if (!base.ok) return base;
  const plan = clone(base.data.plan);
  const seatId = `${side}-main`;
  const seat = plan.seats.find(item => item.seatId === seatId);
  if (!seat) return err('INVALID_STATE', 'KOF 席位缺失。');
  seat.generalId = entry.generalId;
  delete seat.sourceRef;
  delete seat.loanRef;
  if (entry.kind === 'loan') seat.loanRef = entry.loanRef;
  else seat.sourceRef = entry.sourceRef;
  plan.handPolicy = handPolicyFor(format, {replacement: true});
  plan.replacement = {side, index, generalId: entry.generalId, ...format.handPolicy.replacement};
  plan.replacesSeatId = seatId;
  return ok({plan});
}
