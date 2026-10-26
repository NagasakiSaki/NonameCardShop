import { reduceProgression } from './state.mjs';

/**
 * Unified invitation state machine for specialists and NPCs.
 */
export function offerInvite(state, input, context = {}) {
  if (!state || state.disabled) {
    return {
      ok: false,
      error: { code: 'FEATURE_UNAVAILABLE', message: 'Progression system is disabled.', retryable: false }
    };
  }

  const { actorId, kind = 'stage-challenge', source = 'proactive' } = input;

  // Validation: actor must be onsite
  if (context.actorOnsite === false) {
    return {
      ok: false,
      error: { code: 'NOT_ONSITE', message: '目标当前不在店内。', retryable: true }
    };
  }

  // Validation: actor must be reachable / close
  if (context.actorReachable === false) {
    return {
      ok: false,
      error: { code: 'TOO_FAR', message: '距离太远或路径受阻，无法发起对话。', retryable: true }
    };
  }

  // Validation: actor must not be busy
  if (context.actorBusy === true) {
    return {
      ok: false,
      error: { code: 'ACTOR_BUSY', message: '对方正在进行其他对局或对话。', retryable: true }
    };
  }

  const currentDay = context.day || state.dailyVisitStatus.day || 1;

  // Proactive offers by specialists: check daily quota
  if (source === 'proactive') {
    if (state.dailyVisitStatus.proactiveOfferGiven && (state.dailyVisitStatus.lastVisitDay === currentDay || state.dailyVisitStatus.day === currentDay)) {
      return {
        ok: false,
        error: { code: 'INVITE_STALE', message: '该高手今日已发出过主动挑战邀请。', retryable: false }
      };
    }
  }

  // If there is already an active offered invite for this actor, return it idempotently
  if (state.currentInvite && state.currentInvite.status === 'offered' && state.currentInvite.actorId === actorId) {
    return {
      ok: true,
      data: {
        invite: { ...state.currentInvite },
        dialogueOffer: buildDialogueOffer(state.currentInvite, context)
      },
      effects: []
    };
  }

  // Active stage check
  const activeStage = state.stages.find(s => s.stageId === state.activeStageId);
  if (!activeStage) {
    return {
      ok: false,
      error: { code: 'FEATURE_UNAVAILABLE', message: '当前没有待挑战的高手阶段。', retryable: false }
    };
  }

  const deferredTo=state.deferrals[activeStage.stageId]?.deferredToDay||0;
  if(currentDay<Math.max(activeStage.dueDay,deferredTo))return {ok:false,error:{code:'CHALLENGE_DEFERRED',message:`已约好第 ${Math.max(activeStage.dueDay,deferredTo)} 天再战。`,retryable:false}};

  // Create unique IDs
  const seedPart = Math.floor((context.seed || 12345) % 1000000);
  const inviteId = `invite-${activeStage.stageId}-d${currentDay}-${seedPart}`;
  const challengeId = `challenge-${activeStage.stageId}-d${currentDay}-${seedPart}`;

  const proof = context.proof || {
    worldId: context.worldId || 'world',
    branchId: context.branchId || 'main',
    resourceRevision: state.revision
  };

  const invite = {
    inviteId,
    challengeId,
    stageId: activeStage.stageId,
    actorId,
    personId: activeStage.personId,
    appearanceId: activeStage.appearanceId,
    displayName: activeStage.displayName,
    source,
    kind,
    productId: activeStage.productId,
    formatId: activeStage.defaultFormatId || 'kof',
    fee: 0,
    status: 'offered',
    day: currentDay,
    proof,
    options: [
      { optionId: 'accept', label: '现在来一局' },
      { optionId: 'tomorrow', label: '改天再战' }
    ]
  };

  // State mutation via reducer
  reduceProgression(state, {
    type: 'INVITE_OFFERED',
    invite
  }, context);

  const dialogueOffer = buildDialogueOffer(invite, context);

  return {
    ok: true,
    data: {
      invite,
      dialogueOffer
    },
    effects: [
      {
        type: 'challengeInviteOffered',
        inviteId,
        actorId,
        stageId: activeStage.stageId,
        day: currentDay
      }
    ]
  };
}

/**
 * Responds to an offered challenge invitation.
 * Options: 'accept' | 'tomorrow' | 'escape' | 'close'
 */
export function replyInvite(state, input, context = {}) {
  if (!state || state.disabled) {
    return {
      ok: false,
      error: { code: 'FEATURE_UNAVAILABLE', message: 'Progression system is disabled.', retryable: false }
    };
  }

  const { inviteId, response = 'tomorrow', proof } = input;

  // Verify resource revision if provided
  if (proof && proof.resourceRevision !== undefined && proof.resourceRevision < state.revision) {
    return {
      ok: false,
      error: { code: 'STALE_OPERATION', message: '操作已过期，请重新打开对话。', retryable: true }
    };
  }

  const invite = state.currentInvite;
  if (!invite || invite.inviteId !== inviteId || invite.status !== 'offered') {
    return {
      ok: false,
      error: { code: 'INVITE_STALE', message: '挑战邀请已过期或已被处理。', retryable: false }
    };
  }

  const activeStage = state.stages.find(s => s.stageId === invite.stageId);
  const currentDay = context.day || state.dailyVisitStatus.day || invite.day || 1;

  if (response === 'accept') {
    const challenge = {
      challengeId: invite.challengeId,
      stageId: invite.stageId,
      challengerId: activeStage.challengerId,
      personId: activeStage.personId,
      actorId: invite.actorId,
      productId: invite.productId,
      formatId: invite.formatId,
      fee: 0,
      day: currentDay,
      status: 'accepted',
      acceptedAtRevision: state.revision + 1
    };

    reduceProgression(state, {
      type: 'INVITE_ACCEPTED',
      challenge
    }, context);

    return {
      ok: true,
      data: {
        status: 'accepted',
        challengeId: challenge.challengeId,
        stageId: challenge.stageId,
        formatId: challenge.formatId,
        productId: challenge.productId
      },
      effects: [
        {
          type: 'challengeAccepted',
          challengeId: challenge.challengeId,
          stageId: challenge.stageId,
          formatId: challenge.formatId,
          productId: challenge.productId
        }
      ]
    };
  }

  // Any other response ('tomorrow', 'escape', 'close', 'cancel') counts as deferral
  const returnDay = currentDay + 1;
  reduceProgression(state, {
    type: 'INVITE_DEFERRED',
    stageId: invite.stageId,
    returnDay
  }, context);

  return {
    ok: true,
    data: {
      status: 'deferred',
      stageId: invite.stageId,
      returnDay
    },
    effects: [
      {
        type: 'challengeDeferred',
        stageId: invite.stageId,
        returnDay
      },
      {
        type: 'challengerDeparted',
        visitId: state.currentVisit?.visitId,
        actorId: invite.actorId,
        reason: 'deferred_to_tomorrow'
      }
    ]
  };
}

/**
 * Builds the read-only DialogueOffer presentation structure.
 */
export function buildDialogueOffer(invite, context = {}) {
  return {
    offerId: `offer-${invite.inviteId}`,
    source: 'challenge',
    actorId: invite.actorId,
    personId: invite.personId,
    inviteId: invite.inviteId,
    appearanceId: invite.appearanceId,
    speakerName: invite.displayName,
    text: `我是${invite.displayName}。听说你这家卡牌店收集了许多武将，可否与我切磋一局？`,
    nameColor: '#C084FC',
    roleLabel: '来访高手',
    proof: invite.proof || {
      worldId: context.worldId || 'world',
      branchId: context.branchId || 'main',
      resourceRevision: 0
    },
    choices: [
      { optionId: 'accept', text: '现在来一局', available: true },
      { optionId: 'tomorrow', text: '改天再战', available: true }
    ]
  };
}

/**
 * Read-only dialogue.offer query: pure, does not mutate RNG or state.
 */
export function queryDialogueOffer(state, context = {}) {
  if (!state || state.disabled || !state.currentInvite || state.currentInvite.status !== 'offered') {
    return null;
  }
  return buildDialogueOffer(state.currentInvite, context);
}
