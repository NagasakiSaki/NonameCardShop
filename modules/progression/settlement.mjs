import { reduceProgression } from './state.mjs';
import {getFormat} from '../combat-formats/registry.mjs';

/**
 * Settles an official series result strictly from trusted C/D evidence.
 * Rejects UI-reported, simulated, unverified, mismatched, or late results.
 */
export function settleChallenge(state, verifiedSeriesResult, context = {}) {
  if (!state || state.disabled) {
    return {
      ok: false,
      error: { code: 'FEATURE_UNAVAILABLE', message: 'Progression system is disabled.', retryable: false }
    };
  }

  if (!verifiedSeriesResult) {
    return {
      ok: false,
      error: { code: 'INVALID_INPUT', message: 'Verified series result DTO must be provided.', retryable: false }
    };
  }

  // 1. Strict rejection of simulated results
  if (verifiedSeriesResult.simulated === true) {
    return {
      ok: false,
      error: {
        code: 'SIMULATED_RESULT_REJECTED',
        message: '后台模拟赛果不可用于主线高手挑战解锁。',
        retryable: false
      }
    };
  }

  // 2. Strict series completion requirement
  if (verifiedSeriesResult.completed !== true) {
    return {
      ok: false,
      error: {
        code: 'INCOMPLETE_SERIES',
        message: '系列赛尚未完整结束。',
        retryable: true
      }
    };
  }

  // 3. Strict provenance and verification fields
  if (verifiedSeriesResult.originVerified !== true || verifiedSeriesResult.sourceVerified !== true) {
    return {
      ok: false,
      error: {
        code: 'UNVERIFIED_RESULT',
        message: '赛果未经受信任引擎桥梁签名验证，拒绝结算。',
        retryable: false
      }
    };
  }

  const { challengeId, stageId, productId, winningTeamId, resultId } = verifiedSeriesResult;

  // 4. Idempotency check: receipt deduplication
  if(![challengeId,stageId,productId,resultId,verifiedSeriesResult.matchId].every(v=>typeof v==='string'&&v.length>0))return {ok:false,error:{code:'INVALID_INPUT',message:'正式结算必须包含挑战、阶段、商品、比赛与结果标识。'}};
  const receiptKey = `receipt:${stageId}:${challengeId}:${resultId}`;
  if (state.receipts[receiptKey]) {
    const stage = state.stages.find(s => s.stageId === stageId);
    return {
      ok: true,
      data: {
        idempotent: true,
        alreadySettled: true,
        stageId,
        productId: stage?.productId || productId,
        receiptKey
      },
      effects: []
    };
  }

  // 5. Verify stageId matches current active stage
  if (!state.activeStageId || state.activeStageId !== stageId) {
    return {
      ok: false,
      error: {
        code: 'RESULT_CONFLICT',
        message: `赛果阶段 ${stageId} 与当前活跃阶段 ${state.activeStageId} 不符。`,
        retryable: false
      }
    };
  }

  const activeStage = state.stages.find(s => s.stageId === stageId);
  if (!activeStage) {
    return {
      ok: false,
      error: { code: 'INVALID_STATE', message: 'Active stage not found in registry.', retryable: false }
    };
  }

  // 5. Verify productId matches active stage locked product
  if (productId !== activeStage.productId) {
    return {
      ok: false,
      error: {
        code: 'PRODUCT_MISMATCH',
        message: `赛果解锁主题 ${productId} 与阶段锁定主题 ${activeStage.productId} 不一致。`,
        retryable: false
      }
    };
  }

  // 6. Verify challengeId matches active registered challenge
  if (!state.activeChallenge || state.activeChallenge.challengeId !== challengeId || state.activeChallenge.matchId!==verifiedSeriesResult.matchId) {
    return {
      ok: false,
      error: {
        code: 'CHALLENGE_MISMATCH',
        message: '赛果 challengeId 与当前已注册挑战不一致。',
        retryable: false
      }
    };
  }



  const currentDay = context.day || state.dailyVisitStatus.day || 1;

  // 8. Outcome handling: defeat or draw
  if (winningTeamId !== 'mine') {
    reduceProgression(state, {
      type: 'CHALLENGE_FAILED',
      challengeId,
      canRetry: true
    }, context);

    return {
      ok: true,
      data: {
        cleared: false,
        isWin: false,
        canRetry: true,
        message: winningTeamId === 'draw' ? '系列赛平局，可重新开局。' : '挑战败北，可在今日再次尝试或改天再战。'
      },
      effects: [
        {
          type: 'challengeFailed',
          challengeId,
          stageId,
          canRetry: true,
          draw: winningTeamId === 'draw'
        }
      ]
    };
  }

  // 9. Winning outcome: must be complete victory (e.g. 2 wins)
  const playerWins = verifiedSeriesResult.playerWins;
  const winsRequired = verifiedSeriesResult.winsRequired;
  const format=getFormat(verifiedSeriesResult.formatId);
  if (!format||state.activeChallenge.formatId!==format.formatId||!Number.isSafeInteger(playerWins)||winsRequired!==format.winsRequired||playerWins < winsRequired) {
    return {
      ok: false,
      error: {
        code: 'INSUFFICIENT_WINS',
        message: `玩家仅获胜 ${playerWins} 局，未达到系列赛要求的 ${winsRequired} 胜。`,
        retryable: false
      }
    };
  }

  const receipt = {
    receiptKey,
    stageId,
    challengeId,
    matchId: verifiedSeriesResult.matchId,
    resultId,
    productId: activeStage.productId,
    allyId: activeStage.challengerId,
    settledAtDay: currentDay,
    timestamp: context.now ?? null
  };

  // Atomic state mutation
  const reduceRes = reduceProgression(state, {
    type: 'CHALLENGE_CLEARED',
    stageId,
    challengeId,
    productId: activeStage.productId,
    allyId: activeStage.challengerId,
    receiptKey,
    receipt,
    day: currentDay
  }, context);

  if (!reduceRes.ok) {
    return reduceRes;
  }

  return {
    ok: true,
    data: {
      cleared: true,
      isWin: true,
      stageId,
      productId: activeStage.productId,
      allyId: activeStage.challengerId,
      allyName: activeStage.displayName,
      receiptKey
    },
    effects: reduceRes.effects
  };
}

/**
 * Atomic effect execution with full rollback guarantee.
 * If any effect fails during world/host transaction commit, rolls back state completely.
 */
export function executeAtomicEffects(state, effects, commitFn) {
  const snapshot = structuredClone(state);
  const executed = [];

  try {
    for (const effect of effects) {
      commitFn(effect);
      executed.push(effect);
    }
    return { ok: true, executedCount: executed.length };
  } catch (err) {
    // Rollback state completely
    for(const key of Object.keys(state))delete state[key];
    Object.assign(state, snapshot);
    return {
      ok: false,
      error: {
        code: 'TRANSACTION_ROLLED_BACK',
        message: `事务执行失败，已全部原子回滚: ${err.message}`,
        details: { executedBeforeFailure: executed }
      }
    };
  }
}
