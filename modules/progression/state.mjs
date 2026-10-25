import { DEFAULT_STAGES } from './default-stages.mjs';

export const CURRENT_PROGRESSION_VERSION = 1;
export const POLICY_VERSION = 'v7-stage-policy-1';
export const DEFAULT_ALLY_SLOTS = 3;

/**
 * Creates a pristine progression state.
 */
export function createProgressionState(options = {}) {
  const epoch = options.epoch ?? 1;
  const firstDueDay = options.firstDueDay ?? 3;
  const intervalDays = options.intervalDays ?? 3;
  const unlockedProductIds = options.unlockedProductIds ? [...options.unlockedProductIds] : ['yijiang'];

  // Deep clone default stages and set their initial dueDays based on schedule
  const stages = DEFAULT_STAGES.map((s, idx) => ({
    ...s,
    dueDay: firstDueDay + idx * intervalDays,
    status: 'locked',
    clearedAtDay: null
  }));

  return {
    version: CURRENT_PROGRESSION_VERSION,
    policyVersion: POLICY_VERSION,
    epoch,
    revision: 0,
    firstDueDay,
    intervalDays,
    maxActiveStages: 1,
    maxAllySlots: DEFAULT_ALLY_SLOTS,
    activeStageId: null,
    stages,
    stageQueue: [],
    unlockedProductIds,
    allies: [],
    receipts: {},
    currentVisit: null,
    currentInvite: null,
    activeChallenge: null,
    challenges: {},
    deferrals: {},
    dailyVisitStatus: {
      day: 0,
      proactiveOfferGiven: false,
      lastVisitDay: 0
    },
    disabled: false,
    disabledReason: null
  };
}

/**
 * Initializes progression for a world, taking into account new games and legacy saves.
 */
export function initialiseProgression(world, config = {}) {
  if (!world) {
    throw new Error('World must be provided to initialiseProgression.');
  }

  // If progression state already exists
  if (world.progression) {
    if (world.progression.version > CURRENT_PROGRESSION_VERSION) {
      // Future unknown version: retain verbatim and safely disable progression system
      return world.progression;
    }
    return world.progression;
  }

  // Check if this is an existing world (legacy save migration)
  const currentDay = world.clock?.day || world.day || 1;
  const isLegacyWorld = currentDay > 1;

  let firstDueDay = 3;
  if (isLegacyWorld) {
    // Legacy save: first stage is scheduled for currentDay + 1, subsequent every 3 days
    firstDueDay = currentDay + 1;
  }

  const state = createProgressionState({
    epoch: world.epoch || world.worldId || 1,
    firstDueDay,
    intervalDays: 3,
    unlockedProductIds: world.unlockedProductIds || ['yijiang']
  });

  world.progression = state;
  return state;
}

/**
 * Clones progression state for day-start causal checkpointing.
 */
export function checkpointDayStart(state) {
  return structuredClone(state);
}

/**
 * Rolls back progression state to a day-start checkpoint.
 */
export function rollbackToDayStart(currentState, checkpoint) {
  if (!checkpoint || checkpoint.version !== CURRENT_PROGRESSION_VERSION) {
    return {
      ok: false,
      error: {
        code: 'RECOVERY_REQUIRED',
        message: 'Invalid or incompatible checkpoint for day-start rollback.',
        retryable: false
      }
    };
  }

  // Replace properties in currentState from checkpoint
  const cloned = structuredClone(checkpoint);
  cloned.revision = (currentState.revision || 0) + 1;
  Object.assign(currentState, cloned);

  return {
    ok: true,
    data: { rolledBack: true, revision: currentState.revision },
    effects: [{ type: 'progressionRolledBack', toDay: checkpoint.dailyVisitStatus.day }]
  };
}

/**
 * Pure progression state reducer.
 */
export function reduceProgression(state, event, context = {}) {
  if (state.disabled) {
    return {
      ok: false,
      error: {
        code: 'FEATURE_UNAVAILABLE',
        message: `Progression system is disabled: ${state.disabledReason || 'UNKNOWN'}`,
        retryable: false
      }
    };
  }

  const newState = structuredClone(state);
  newState.revision = (newState.revision || 0) + 1;
  const effects = [];

  switch (event.type) {
    case 'DAY_STARTED': {
      const day = event.day ?? context.day;
      newState.dailyVisitStatus = {
        day,
        proactiveOfferGiven: false,
        lastVisitDay: newState.dailyVisitStatus?.lastVisitDay || 0
      };
      effects.push({ type: 'dayStartedProcessed', day });
      break;
    }

    case 'STAGE_ACTIVATED': {
      const { stageId } = event;
      const stage = newState.stages.find(s => s.stageId === stageId);
      if (!stage) {
        return {
          ok: false,
          error: { code: 'INVALID_INPUT', message: `Stage ${stageId} not found.`, retryable: false }
        };
      }
      stage.status = 'active';
      newState.activeStageId = stageId;
      newState.stageQueue = newState.stageQueue.filter(id => id !== stageId);
      effects.push({ type: 'stageActivated', stageId });
      break;
    }

    case 'VISIT_SCHEDULED': {
      newState.currentVisit = {
        visitId: event.visitId,
        stageId: event.stageId,
        actorId: event.actorId,
        day: event.day,
        status: 'onsite'
      };
      newState.dailyVisitStatus.lastVisitDay = event.day;
      effects.push({ type: 'challengerVisitScheduled', visitId: event.visitId, stageId: event.stageId });
      break;
    }

    case 'INVITE_OFFERED': {
      newState.currentInvite = { ...event.invite };
      if (event.invite.source === 'proactive') {
        newState.dailyVisitStatus.proactiveOfferGiven = true;
        newState.dailyVisitStatus.lastVisitDay = event.invite.day;
        newState.dailyVisitStatus.day = event.invite.day;
      }
      effects.push({ type: 'challengeInviteOffered', inviteId: event.invite.inviteId });
      break;
    }

    case 'INVITE_DEFERRED': {
      const { stageId, returnDay } = event;
      const stage = newState.stages.find(s => s.stageId === stageId);
      if (stage) {
        stage.dueDay = returnDay;
      }
      newState.deferrals[stageId] = {
        deferredToDay: returnDay,
        deferralCount: ((newState.deferrals[stageId]?.deferralCount) || 0) + 1
      };
      newState.currentInvite = null;
      if (newState.currentVisit) {
        newState.currentVisit.status = 'departed';
      }
      effects.push({ type: 'challengeDeferred', stageId, returnDay });
      break;
    }

    case 'INVITE_ACCEPTED': {
      if (newState.currentInvite) {
        newState.currentInvite.status = 'accepted';
      }
      newState.activeChallenge = { ...event.challenge };
      newState.challenges[event.challenge.challengeId] = { ...event.challenge };
      effects.push({ type: 'challengeAccepted', challengeId: event.challenge.challengeId });
      break;
    }

    case 'CHALLENGE_CLEARED': {
      const { stageId, challengeId, productId, allyId, receiptKey, receipt } = event;
      const stage = newState.stages.find(s => s.stageId === stageId);
      if (stage) {
        stage.status = 'cleared';
        stage.clearedAtDay = event.day || context.day;
      }
      if (!newState.unlockedProductIds.includes(productId)) {
        newState.unlockedProductIds.push(productId);
      }
      if (receiptKey && receipt) {
        newState.receipts[receiptKey] = { ...receipt };
      }
      // Add ally if not already present
      if (allyId && !newState.allies.some(a => a.allyId === allyId)) {
        newState.allies.push({
          allyId: stage.challengerId,
          personId: stage.personId,
          appearanceId: stage.appearanceId,
          name: stage.displayName,
          defaultDuty: stage.defaultAllyDuty,
          assignedDuty: null,
          onDuty: false,
          recruitedAtDay: event.day || context.day,
          rate: stage.allyRate
        });
      }
      newState.activeChallenge = null;
      newState.currentInvite = null;
      newState.activeStageId = null;
      if (newState.currentVisit) {
        newState.currentVisit.status = 'completed';
      }
      effects.push(
        { type: 'challengeCleared', stageId, challengeId },
        { type: 'productUnlocked', productId },
        { type: 'allyRecruited', allyId },
        { type: 'receiptWritten', receiptKey }
      );
      break;
    }

    case 'CHALLENGE_FAILED': {
      const { challengeId, canRetry } = event;
      if (newState.activeChallenge && newState.activeChallenge.challengeId === challengeId) {
        newState.activeChallenge.status = 'failed';
        newState.activeChallenge.canRetry = canRetry;
      }
      effects.push({ type: 'challengeFailed', challengeId, canRetry });
      break;
    }

    case 'ALLY_ASSIGNED': {
      const { allyId, dutyId } = event;
      const ally = newState.allies.find(a => a.allyId === allyId);
      if (!ally) {
        return {
          ok: false,
          error: { code: 'PRODUCT_LOCKED', message: '该伙伴尚未解锁招募。', retryable: false }
        };
      }
      if (dutyId === null) {
        ally.onDuty = false;
        ally.assignedDuty = null;
      } else {
        const currentOnDuty = newState.allies.filter(a => a.onDuty && a.allyId !== allyId).length;
        if (currentOnDuty >= newState.maxAllySlots) {
          return {
            ok: false,
            error: { code: 'CAP_REACHED', message: `最多只能同时安排 ${newState.maxAllySlots} 位店铺伙伴值班。`, retryable: false }
          };
        }
        ally.onDuty = true;
        ally.assignedDuty = dutyId;
      }
      effects.push({ type: 'allyDutyChanged', allyId, dutyId });
      break;
    }

    default:
      return {
        ok: false,
        error: { code: 'INVALID_INPUT', message: `Unknown progression event type: ${event.type}`, retryable: false }
      };
  }

  Object.assign(state, newState);
  return { ok: true, state, effects };
}

/**
 * Read-only status query: does not mutate state or RNG.
 */
export function queryProgressionStatus(state) {
  if (!state) return null;
  const currentStage = state.stages.find(s => s.stageId === state.activeStageId) || null;
  const nextStage = state.stages.find(s => s.status === 'locked' || s.status === 'queued') || null;
  return {
    version: state.version,
    epoch: state.epoch,
    revision: state.revision,
    activeStageId: state.activeStageId,
    currentStage,
    unlockedProductIds: [...state.unlockedProductIds],
    stageQueue: [...state.stageQueue],
    nextDueDay: nextStage ? nextStage.dueDay : null,
    totalStages: state.stages.length,
    clearedStagesCount: state.stages.filter(s => s.status === 'cleared').length,
    activeAlliesCount: state.allies.filter(a => a.onDuty).length,
    totalAlliesCount: state.allies.length,
    receiptsCount: Object.keys(state.receipts).length,
    disabled: state.disabled,
    disabledReason: state.disabledReason
  };
}

/**
 * Read-only challenges status query: idempotent.
 */
export function queryChallengesStatus(state) {
  if (!state || state.disabled) return null;
  return {
    currentInvite: state.currentInvite ? { ...state.currentInvite } : null,
    activeChallenge: state.activeChallenge ? { ...state.activeChallenge } : null,
    activeStageId: state.activeStageId,
    deferrals: { ...state.deferrals },
    dailyVisitStatus: { ...state.dailyVisitStatus }
  };
}

/**
 * Read-only allies list query: idempotent.
 */
export function queryAlliesList(state) {
  if (!state || state.disabled) return { slots: { max: 3, used: 0 }, allies: [] };
  const onDutyCount = state.allies.filter(a => a.onDuty).length;
  return {
    slots: {
      max: state.maxAllySlots || DEFAULT_ALLY_SLOTS,
      used: onDutyCount
    },
    allies: state.allies.map(a => ({ ...a }))
  };
}
