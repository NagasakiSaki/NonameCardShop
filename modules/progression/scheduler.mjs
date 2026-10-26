import { reduceProgression } from './state.mjs';

/**
 * Plans the configurable challenger visit scheduling (default: the day after the previous victory).
 * Follows the frozen rules:
 * - No losses: 2, 3, 4, 5, ... 16. A postponed fight delays every later challenger.
 * - Only 1 active stage at any time. Later stages wait in stageQueue.
 * - Same day never spawns multiple specialists.
 * - Clearing a stage today does NOT dispatch the next specialist on the same day (earliest next day).
 * - Visits have persistent visitId and clear navigation / approach / departure intents.
 */
export function planChallengerVisit(state, currentDay, context = {}) {
  if (!state || state.disabled) {
    return {
      ok: false,
      error: {
        code: 'FEATURE_UNAVAILABLE',
        message: 'Progression scheduler is unavailable.',
        retryable: false
      }
    };
  }

  // Handle day roll in dailyVisitStatus
  if (state.dailyVisitStatus.day !== currentDay) {
    state.dailyVisitStatus.day = currentDay;
    state.dailyVisitStatus.proactiveOfferGiven = false;
  }

  // If any stage was cleared today, no new specialist arrives today (earliest next day!)
  const clearedToday = state.stages.find(s => s.clearedAtDay === currentDay);
  if (clearedToday) {
    return {
      ok: true,
      data: {
        shouldVisit: false,
        reason: 'STAGE_CLEARED_TODAY_EARLIEST_NEXT_DAY',
        clearedStageId: clearedToday.stageId
      },
      effects: []
    };
  }

  // Maintain stageQueue: any uncleared stage whose dueDay <= currentDay
  for (const s of state.stages) {
    if (s.status !== 'cleared' && s.dueDay <= currentDay) {
      if (s.stageId !== state.activeStageId && !state.stageQueue.includes(s.stageId)) {
        state.stageQueue.push(s.stageId);
        s.status = 'queued';
      }
    }
  }

  // If no stage is currently active, activate the earliest queued stage
  if (!state.activeStageId && state.stageQueue.length > 0) {
    const nextStageId = state.stageQueue.shift();
    const nextStage = state.stages.find(s => s.stageId === nextStageId);
    if (nextStage) {
      nextStage.status = 'active';
      state.activeStageId = nextStageId;
    }
  }

  if (!state.activeStageId) {
    // No stage is due or ready
    return {
      ok: true,
      data: { shouldVisit: false, reason: 'NO_STAGE_DUE' },
      effects: []
    };
  }

  const activeStage = state.stages.find(s => s.stageId === state.activeStageId);
  if (!activeStage) {
    return {
      ok: false,
      error: { code: 'INVALID_STATE', message: 'Active stage not found in registry.', retryable: false }
    };
  }

  // If active stage was cleared today, no new specialist arrives today!
  if (activeStage.clearedAtDay === currentDay) {
    return {
      ok: true,
      data: { shouldVisit: false, reason: 'STAGE_CLEARED_TODAY_EARLIEST_NEXT_DAY' },
      effects: []
    };
  }

  // Check if store is open
  const isStoreOpen = context.storeOpen !== false && context.phase !== 'closed';
  if (!isStoreOpen) {
    return {
      ok: true,
      data: { shouldVisit: false, reason: 'STORE_CLOSED' },
      effects: []
    };
  }

  // Check if today is before active stage due day
  if (currentDay < activeStage.dueDay) {
    return {
      ok: true,
      data: { shouldVisit: false, reason: 'NOT_YET_DUE', dueDay: activeStage.dueDay },
      effects: []
    };
  }

  const deferredTo=state.deferrals[activeStage.stageId]?.deferredToDay||0;
  if(currentDay<deferredTo)return {ok:true,data:{shouldVisit:false,reason:'DEFERRED_TO_FUTURE_DAY',dueDay:deferredTo},effects:[]};

  // Check if proactive offer was already given today
  if (state.dailyVisitStatus.proactiveOfferGiven && state.dailyVisitStatus.lastVisitDay === currentDay) {
    return {
      ok: true,
      data: { shouldVisit: false, reason: 'OFFER_ALREADY_GIVEN_TODAY' },
      effects: []
    };
  }

  // If specialist is already onsite
  if (state.currentVisit && state.currentVisit.day === currentDay && state.currentVisit.status === 'onsite') {
    return {
      ok: true,
      data: {
        shouldVisit: true,
        alreadyOnsite: true,
        visitId: state.currentVisit.visitId,
        actorId: state.currentVisit.actorId
      },
      effects: []
    };
  }

  // Generate visit intent
  const visitId = `visit-${activeStage.stageId}-day${currentDay}`;
  const actorId = `specialist:${activeStage.challengerId.replace('challenger-', '')}`;

  const visitData = {
    shouldVisit: true,
    alreadyOnsite: false,
    visitId,
    stageId: activeStage.stageId,
    actorId,
    personId: activeStage.personId,
    appearanceId: activeStage.appearanceId,
    displayName: activeStage.displayName,
    nameColor: activeStage.nameColor,
    roleLabel: activeStage.roleLabel,
    approachPoint: 'store.counter',
    greeting: activeStage.dialogueGreeting,
    targetProduct: activeStage.productId,
    day: currentDay
  };

  // Reduce progression state with visit scheduled
  reduceProgression(state, {
    type: 'VISIT_SCHEDULED',
    visitId,
    stageId: activeStage.stageId,
    actorId,
    day: currentDay
  }, context);

  return {
    ok: true,
    data: visitData,
    effects: [
      {
        type: 'challengerVisitScheduled',
        visitId,
        stageId: activeStage.stageId,
        actorId,
        personId: activeStage.personId,
        appearanceId: activeStage.appearanceId,
        displayName: activeStage.displayName,
        nameColor: activeStage.nameColor,
        roleLabel: activeStage.roleLabel,
        day: currentDay
      }
    ]
  };
}

/**
 * Plans challenger departure to prevent doormen crowding.
 */
export function planChallengerDeparture(state, reason = 'visit_ended', context = {}) {
  if (!state || !state.currentVisit || state.currentVisit.status !== 'onsite') {
    return {
      ok: true,
      data: { departed: false, reason: 'NO_ACTIVE_VISIT' },
      effects: []
    };
  }

  const visit = state.currentVisit;
  visit.status = 'departed';

  return {
    ok: true,
    data: {
      departed: true,
      visitId: visit.visitId,
      actorId: visit.actorId,
      reason
    },
    effects: [
      {
        type: 'challengerDeparted',
        visitId: visit.visitId,
        actorId: visit.actorId,
        reason
      }
    ]
  };
}
