/**
 * Whole-series reserve locks.
 *
 * The complete 备战池 is locked for the entire series — not per round — so a
 * later round can never lose a card that was promised at preparation time.
 * This module only produces lock/release *intents* with stable idempotency
 * keys; the authoritative world commits them (main model), then reports back
 * through `acknowledgeLocks`.
 *
 * Waiting, deferring, importing a save and abandoning must all leave zero
 * leaked locks, so every terminal path routes through `planRosterLocks`.
 */
import {ok, err, clone, isPlainObject, isNonEmptyString} from './errors.mjs';

export const ACTIVE_PHASES = Object.freeze(['confirmed', 'mounting', 'live', 'round-settled', 'interrupted']);
export const TERMINAL_PHASES = Object.freeze(['finished', 'cancelled']);

export function lockIdFor(matchId) {
  return `${matchId}:roster`;
}

export function createLockState(matchId, refs) {
  return {
    lockId: lockIdFor(matchId),
    scope: 'whole-series',
    refs: [...refs],
    state: 'none',
    requestedAtRevision: null,
    acknowledgedAtRevision: null,
    releaseReason: null
  };
}

function releaseReasonFor(series) {
  if (series.phase === 'finished') return 'series-finished';
  if (series.cancellation?.reason) return series.cancellation.reason;
  return 'series-closed';
}

/**
 * Derive the lock intents that match the current series phase.
 * Pure: identical input → identical output, including idempotency keys.
 */
export function planRosterLocks(series) {
  if (!isPlainObject(series) || !isPlainObject(series.lock)) {
    return err('INVALID_INPUT', '系列赛缺少锁状态。');
  }
  const lock = series.lock;
  const base = {lockId: lock.lockId, scope: lock.scope, refs: [...lock.refs], state: lock.state, intents: []};

  if (TERMINAL_PHASES.includes(series.phase)) {
    if (lock.state === 'released' || lock.refs.length === 0) {
      return ok({...base, state: 'released'});
    }
    const reason = releaseReasonFor(series);
    const intent = {
      type: 'releaseRoster',
      lockId: lock.lockId,
      matchId: series.matchId,
      refs: [...lock.refs],
      reason,
      idempotencyKey: `${lock.lockId}|release|${reason}`
    };
    // 'releasing' = release intent emitted, waiting for the host receipt.
    return ok({...base, state: 'releasing', intents: [intent]}, [intent]);
  }

  if (ACTIVE_PHASES.includes(series.phase)) {
    if (lock.state === 'held' || lock.state === 'pending') {
      // Re-emit the same intent so a lost response is retried, never duplicated.
      const intent = {
        type: 'lockRoster',
        lockId: lock.lockId,
        matchId: series.matchId,
        refs: [...lock.refs],
        scope: 'whole-series',
        idempotencyKey: `${lock.lockId}|lock`
      };
      return ok({...base, intents: [intent]}, [intent]);
    }
    const intent = {
      type: 'lockRoster',
      lockId: lock.lockId,
      matchId: series.matchId,
      refs: [...lock.refs],
      scope: 'whole-series',
      idempotencyKey: `${lock.lockId}|lock`
    };
    return ok({...base, state: 'pending', intents: [intent]}, [intent]);
  }

  // 'selecting' (or a future phase): the pool is reserved but nothing is locked yet.
  return ok({...base, state: lock.state});
}

/** Host confirmation of a lock intent. The only place lock state advances. */
export function acknowledgeLocks(series, report) {
  if (!isPlainObject(report) || !isNonEmptyString(report.lockId)) {
    return err('INVALID_INPUT', '缺少锁回执。');
  }
  const next = clone(series);
  if (report.lockId !== next.lock.lockId) {
    return err('STALE_OPERATION', '锁回执与当前系列赛不匹配。', {details: {lockId: report.lockId}});
  }
  const state = report.state;
  if (!['held', 'released', 'none'].includes(state)) {
    return err('INVALID_INPUT', `未知的锁状态：${String(state)}`);
  }
  next.lock.state = state;
  next.lock.acknowledgedAtRevision = next.revision;
  if (state === 'released') {
    next.lock.releaseReason = report.reason || next.lock.releaseReason || releaseReasonFor(next);
    next.lock.releasedRefs = Array.isArray(report.refs) ? [...report.refs] : [...next.lock.refs];
  }
  if (Array.isArray(report.heldRefs)) next.lock.heldRefs = [...report.heldRefs];
  return ok({series: next});
}

/** Read-only summary used by `combat.series` and by integration assertions. */
export function lockSummary(series) {
  return {
    lockId: series.lock.lockId,
    state: series.lock.state,
    scope: series.lock.scope,
    refCount: series.lock.refs.length,
    refs: [...series.lock.refs],
    releaseReason: series.lock.releaseReason || null,
    leaks: TERMINAL_PHASES.includes(series.phase) && series.lock.state !== 'released'
  };
}

/**
 * Save load / import resume.
 *
 * A loaded branch may carry the series but not the in-memory lock. Re-derive the
 * same idempotent intent and tell the host to reconcile instead of guessing:
 * an active series that is not `held` must be re-locked before the next round.
 */
export function planResume(series) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  const plan = planRosterLocks(series);
  if (!plan.ok) return plan;
  const requiresReconcile =
    ACTIVE_PHASES.includes(series.phase) && series.lock.state !== 'held' && series.lock.refs.length > 0;
  return ok(
    {
      resumed: true,
      phase: series.phase,
      lockState: plan.data.state,
      requiresReconcile,
      intents: plan.data.intents,
      note: requiresReconcile
        ? '读档/导入后未确认锁仍在持有状态，必须先用同一 lockId 重新核对，不能静默当作已锁定。'
        : null
    },
    plan.effects
  );
}
