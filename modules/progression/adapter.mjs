import {
  queryProgressionStatus,
  queryChallengesStatus,
  queryAlliesList
} from './state.mjs';
import { planChallengerVisit, planChallengerDeparture } from './scheduler.mjs';
import { offerInvite, replyInvite, queryDialogueOffer } from './invites.mjs';
import { settleChallenge } from './settlement.mjs';
import { deriveAllyEffects, assignAllyDuty, mergeManagementEffects, freezeOrderWholesaleDiscount } from './allies.mjs';
import { buildChallengeLoanRoster, validateLoanBoundary } from './roster.mjs';

/**
 * Host query router
 */
export function handleHostQuery(state, queryName, payload = {}, context = {}) {
  switch (queryName) {
    case 'progression.status':
      return { ok: true, data: queryProgressionStatus(state) };

    case 'challenges.status':
      return { ok: true, data: queryChallengesStatus(state) };

    case 'allies.list':
      return { ok: true, data: queryAlliesList(state) };

    case 'dialogue.offer':
      return { ok: true, data: queryDialogueOffer(state, context) };

    case 'actors.actions': {
      const { actorId } = payload;
      if (!actorId) {
        return { ok: false, error: { code: 'INVALID_INPUT', message: 'actorId is required.' } };
      }

      const activeStage = state.stages?.find(s => s.stageId === state.activeStageId);
      const specialistActorId = activeStage ? `specialist:${activeStage.challengerId.replace('challenger-', '')}` : null;
      const isSpecialist = actorId === specialistActorId;

      const actions = ['talk'];
      let canChallenge = true;
      let reason = null;

      if (context.actorBusy) {
        canChallenge = false;
        reason = 'ACTOR_BUSY';
      } else if (context.actorOnsite === false) {
        canChallenge = false;
        reason = 'NOT_ONSITE';
      } else if (context.actorReachable === false) {
        canChallenge = false;
        reason = 'TOO_FAR';
      }

      if (canChallenge) {
        actions.push('challenge');
      }

      return {
        ok: true,
        data: {
          actorId,
          role: isSpecialist ? 'specialist' : 'npc',
          actions,
          canChallenge,
          reason,
          specialistStage: isSpecialist ? activeStage : null
        }
      };
    }

    default:
      return {
        ok: false,
        error: { code: 'INVALID_QUERY', message: `Unknown host query: ${queryName}` }
      };
  }
}

/**
 * Host command router
 */
export function handleHostCommand(state, commandName, payload = {}, context = {}) {
  switch (commandName) {
    case 'actors.interact': {
      const { actorId, interaction = 'talk', proof } = payload;
      if (interaction === 'challenge') {
        return offerInvite(state, {
          actorId,
          source: 'player-requested',
          kind: 'stage-challenge'
        }, { ...context, proof });
      }
      return {
        ok: true,
        data: { interacted: true, actorId, interaction },
        effects: []
      };
    }

    case 'challenges.respond': {
      const { inviteId, response = 'tomorrow', proof } = payload;
      return replyInvite(state, { inviteId, response, proof }, context);
    }

    case 'dialogue.respond': {
      const { offerId, optionId, proof } = payload;
      const invite = state.currentInvite;
      if (!invite || `offer-${invite.inviteId}` !== offerId) {
        return {
          ok: false,
          error: { code: 'INVITE_STALE', message: '对话要约已失效。' }
        };
      }
      const response = optionId === 'accept' ? 'accept' : 'tomorrow';
      return replyInvite(state, { inviteId: invite.inviteId, response, proof }, context);
    }

    case 'allies.assign': {
      const { allyId, dutyId = null } = payload;
      return assignAllyDuty(state, { allyId, dutyId }, context);
    }

    default:
      return {
        ok: false,
        error: { code: 'INVALID_COMMAND', message: `Unknown host command: ${commandName}` }
      };
  }
}

export {
  planChallengerVisit,
  planChallengerDeparture,
  offerInvite,
  replyInvite,
  settleChallenge,
  deriveAllyEffects,
  assignAllyDuty,
  mergeManagementEffects,
  freezeOrderWholesaleDiscount,
  buildChallengeLoanRoster,
  validateLoanBoundary
};
