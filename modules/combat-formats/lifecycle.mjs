/**
 * Fee and time lifecycle intents for one series.
 *
 * Frozen rules:
 *  - a normal NPC opponent keeps paying the *already accepted* table quote;
 *    the amount is never silently recomputed
 *  - challenge matches are free for both sides and must not create fake income
 *  - the player's whole series advances the shop clock exactly once by 30 min,
 *    never once per round
 *  - a background NPC series never stops the clock and never jumps it either
 *  - a pre-start cancellation costs no time and no fee
 */
import {ok, err, clone, isPlainObject} from './errors.mjs';

export const SERIES_MINUTES = 30;

function isBackground(series) {
  return series.challengeKind === 'background-npc';
}

export function planFee(series) {
  const fee = series.fee;
  const base = {
    policy: fee.policy,
    tableFee: fee.tableFee,
    chargeTo: fee.chargeTo,
    acceptedQuote: fee.acceptedQuote ?? null,
    charged: Boolean(fee.charged),
    acknowledged: Boolean(fee.acknowledged),
    challengeFree: fee.policy === 'waived'
  };
  if (isBackground(series)) {
    return {...base, policy: 'background-continuous', tableFee: 0, intents: []};
  }
  if (fee.acknowledged) return {...base, intents: []};
  if (fee.policy === 'waived') {
    return {
      ...base,
      intents: [
        {
          type: 'waiveTableFee',
          matchId: series.matchId,
          reason: 'challenge-free-table',
          amount: 0,
          idempotencyKey: `${series.matchId}|fee|waive`
        }
      ]
    };
  }
  if (series.phase === 'selecting') {
    // Fee is accepted atomically with the first confirmed selection.
    return {...base, pending: true, intents: []};
  }
  if (!['confirmed', 'mounting', 'live', 'round-settled', 'interrupted'].includes(series.phase)) {
    // A cancelled or otherwise closed series never charges a table fee it did not register.
    return {...base, pending: false, intents: []};
  }
  return {
    ...base,
    intents: [
      {
        type: 'chargeTableFee',
        matchId: series.matchId,
        amount: fee.tableFee,
        payer: series.enemyActorId,
        acceptedQuote: fee.acceptedQuote,
        frozen: true,
        idempotencyKey: `${series.matchId}|fee|charge`
      }
    ]
  };
}

export function planTime(series) {
  const roundsPlayed = Array.isArray(series.rounds) ? series.rounds.length : 0;
  const base = {
    minutes: SERIES_MINUTES,
    applied: Boolean(series.time?.applied),
    roundsPlayed,
    idempotencyKey: `${series.matchId}|time|${SERIES_MINUTES}`
  };
  if (isBackground(series)) {
    return {...base, policy: 'background-continuous', minutes: 0, intents: []};
  }
  if (series.time?.applied) return {...base, policy: 'applied', minutes: 0, intents: []};
  if (!['finished', 'cancelled'].includes(series.phase)) {
    return {...base, policy: 'pending-series', minutes: 0, intents: []};
  }
  if (roundsPlayed === 0) {
    // Cancelled before any round started: nothing was played, nothing is charged.
    return {...base, policy: 'none', minutes: 0, intents: []};
  }
  return {
    ...base,
    policy: 'series-once',
    intents: [
      {
        type: 'advanceMatchTime',
        matchId: series.matchId,
        minutes: SERIES_MINUTES,
        once: true,
        idempotencyKey: `${series.matchId}|time|${SERIES_MINUTES}`
      }
    ]
  };
}

/** `combat.series` / integration entry: everything the host needs to settle a series. */
export function planLifecycle(series) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  const fee = planFee(series);
  const time = planTime(series);
  const effects = [...fee.intents, ...time.intents];
  return ok({fee: stripIntents(fee), time: stripIntents(time), intents: effects}, effects);
}

function stripIntents(plan) {
  const {intents, ...rest} = plan;
  return rest;
}

export function acknowledgeFee(series, report = {}) {
  const next = clone(series);
  next.fee.charged = true;
  next.fee.acknowledged = true;
  next.fee.chargedAt = report.chargedAt || null;
  next.fee.chargeReceiptId = report.receiptId || null;
  return ok({series: next});
}

export function acknowledgeTime(series, report = {}) {
  const next = clone(series);
  next.time.applied = true;
  next.time.appliedAt = report.appliedAt || null;
  return ok({series: next});
}

/**
 * Restart policy after a technical interruption. This build cannot promise an
 * exact native-state restore, so it must say so instead of pretending.
 */
export function recoveryPolicy(series) {
  return {
    recoverySupported: false,
    restartCurrentRound: true,
    abandonSeries: true,
    settledRoundsPreserved: true,
    stakeOnCurrentRound: 0,
    message: '无法精确恢复原生对局状态；可重开当前无赌注小局，或放弃系列赛。已结算小局不重算。',
    reason: series.interrupt?.reason || null
  };
}
