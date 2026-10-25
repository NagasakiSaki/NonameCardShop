/**
 * Legacy match adaptation.
 *
 * Existing bo3/kof records were written by the shipped `matches.mjs` and carry
 * 1 or 3 generals, `wins/losses/bout/first/progress`, an occupied table, item
 * locks, a service fee and an optional time session. They must not be forced
 * through the new 5/8-general schema and must keep every occupied resource.
 *
 * An unknown future format is paused explicitly; basic business keeps working
 * and nothing is released behind the player's back.
 */
import {ok, err, isPlainObject, isNonEmptyString} from './errors.mjs';
import {digestOf} from './digest.mjs';
import {FORMAT_VERSION, getFormat, fromLegacyMode} from './registry.mjs';

const STATUS_PHASE = Object.freeze({
  prepared: 'confirmed',
  running: 'live',
  awaitingNext: 'selecting',
  interrupted: 'interrupted',
  finished: 'finished'
});

function teamEntries(team, warnings, side) {
  if (!Array.isArray(team)) {
    warnings.push({code: 'LEGACY_ROSTER_MISSING', side});
    return [];
  }
  return team.map((item, index) => {
    const ref = item?.sourceRef || item?.inventoryRef || item?.reserveRef || null;
    const generalId = item?.generalId || item?.cardKey || null;
    if (!item?.generalId && item?.cardKey) {
      warnings.push({code: 'GENERAL_FROM_CARDKEY', side, index, cardKey: item.cardKey});
    }
    return {
      reserveRef: ref,
      kind: item?.loanRef ? 'loan' : 'card',
      ...(item?.loanRef ? {loanRef: item.loanRef} : {sourceRef: ref}),
      generalId,
      cardKey: item?.cardKey ?? null
    };
  });
}

function countDraws(results) {
  return (results || []).filter(row => row?.result === 'draw').length;
}

function legacyReserve(format, old, warnings) {
  const mine = teamEntries(old.mine, warnings, 'mine');
  const enemy = teamEntries(old.enemy, warnings, 'enemy');
  const required = format.reservePerSide;
  if (mine.length !== required || enemy.length !== required) {
    // Legacy data is preserved as-is; never padded, never rejected.
    warnings.push({
      code: 'LEGACY_RESERVE_SIZE_DIFFERS',
      expected: required,
      mine: mine.length,
      enemy: enemy.length,
      note: '旧比赛按原阵容保留，不用新 schema 强制失败。'
    });
  }
  return {
    reservePerSide: required,
    sides: {
      mine: {entries: mine, generalIds: mine.map(item => item.generalId)},
      enemy: {entries: enemy, generalIds: enemy.map(item => item.generalId)}
    },
    reserveDigest: digestOf({
      legacy: true,
      formatId: format.formatId,
      mine: mine.map(item => item.reserveRef || item.generalId),
      enemy: enemy.map(item => item.reserveRef || item.generalId)
    })
  };
}

function legacyRounds(old) {
  return (old.results || []).map((row, index) => ({
    roundId: `${old.matchId}:legacy-r${index + 1}`,
    gameId: row?.gameId ?? old.gameId ?? null,
    resultId: row?.resultId ?? `${old.matchId}:legacy-result-${index + 1}`,
    index: index + 1,
    attempt: 1,
    winner: row?.result === 'win' ? 'mine' : row?.result === 'loss' ? 'enemy' : 'draw',
    cause: 'legacy',
    legacy: true
  }));
}

/**
 * normaliseLegacyMatch(old) → Result<{kind, formatId, series, preserved, warnings}>
 * `series` is a read-only view. `acceptsNewTrustedResults` stays false so the
 * main model keeps driving old matches through the existing engine bridge until
 * it explicitly opts into the new series runtime.
 */
export function normaliseLegacyMatch(old) {
  if (!isPlainObject(old)) return err('INVALID_INPUT', '缺少旧比赛记录。');
  if (!isNonEmptyString(old.matchId)) return err('INVALID_INPUT', '旧比赛记录缺少 matchId。');

  const formatId = fromLegacyMode(old.mode);
  if (!formatId) {
    return ok(
      {
        kind: 'unknown',
        formatId: null,
        legacyMode: old.mode ?? null,
        paused: true,
        businessUnaffected: true,
        reason: `未知赛制 ${String(old.mode)}：暂停该比赛，基本经营继续可用。`,
        series: null,
        preserved: preserveRaw(old),
        warnings: [{code: 'UNKNOWN_FORMAT', mode: old.mode ?? null}]
      },
      [
        {
          type: 'pauseMatch',
          matchId: old.matchId,
          reason: 'UNKNOWN_FORMAT',
          releaseResources: false,
          idempotencyKey: `${old.matchId}|pause|unknown-format`
        }
      ]
    );
  }

  const format = getFormat(formatId);
  const warnings = [];
  const reserve = legacyReserve(format, old, warnings);
  const phase = STATUS_PHASE[old.status] || 'interrupted';
  if (!STATUS_PHASE[old.status]) {
    warnings.push({code: 'UNKNOWN_LEGACY_STATUS', status: old.status ?? null});
  }
  const score = {
    mine: Number.isSafeInteger(old.wins) ? old.wins : 0,
    enemy: Number.isSafeInteger(old.losses) ? old.losses : 0,
    draws: countDraws(old.results)
  };

  const series = {
    seriesVersion: 1,
    formatVersion: FORMAT_VERSION,
    legacy: true,
    readOnly: true,
    acceptsNewTrustedResults: false,
    migrationMode: 'read-only-preserve',
    selectionPolicy: 'legacy-fixed',
    seriesId: `${old.matchId}:legacy`,
    matchId: old.matchId,
    worldId: old.worldId ?? null,
    branchId: old.branchId ?? null,
    formatId: format.formatId,
    engineMode: format.engineMode,
    nativeVariant: null,
    variantPinned: false,
    profileId: old.profileId ?? null,
    playerTeamId: 'mine',
    enemyTeamId: 'enemy',
    // Legacy two-seat matches have no ally to take over.
    controlPolicy: 'ai-only',
    enemyActorId: old.enemyOwnerId || old.opponentId || null,
    reserve,
    reserveDigest: reserve.reserveDigest,
    phase,
    score,
    consecutiveDraws: 0,
    roleState: {landlordSide: null, swaps: 0},
    round: {
      roundId: `${old.matchId}:legacy-r${(old.bout ?? 1)}`,
      gameId: old.gameId ?? null,
      index: old.bout ?? 1,
      attempt: 1,
      roles: {mine: 'duelist', enemy: 'duelist'},
      seatSkeleton: [
        {seatId: 'mine-main', teamId: 'mine', role: 'duelist', controller: 'human'},
        {seatId: 'enemy-main', teamId: 'enemy', role: 'duelist', controller: 'ai'}
      ],
      seats: null,
      confirmed: true,
      confirmedAtRevision: null,
      prefill: null,
      drawsBefore: 0
    },
    rounds: legacyRounds(old),
    settledResultIds: (old.results || [])
      .map((row, index) => row?.resultId ?? `${old.matchId}:legacy-result-${index + 1}`),
    settledGameIds: {},
    officialResult:
      old.status === 'finished'
        ? {
            version: 1,
            official: true,
            producedOnce: true,
            legacy: true,
            matchId: old.matchId,
            formatId: format.formatId,
            result: old.result ?? null,
            score,
            roundsPlayed: (old.results || []).length,
            complete: old.result !== 'cancelled',
            cancelled: old.result === 'cancelled',
            simulated: Boolean(old.simulated),
            winVerified: false,
            reserveDigest: reserve.reserveDigest,
            cause: 'legacy'
          }
        : null,
    lock: {
      lockId: `${old.matchId}:legacy-roster`,
      scope: 'legacy',
      refs: [...reserve.sides.mine.entries, ...reserve.sides.enemy.entries]
        .map(entry => entry.reserveRef)
        .filter(Boolean),
      state: old.status === 'finished' ? 'released' : 'held',
      releaseReason: null
    },
    fee: {
      policy: old.stake > 0 ? 'legacy-stake' : 'accepted-quote',
      tableFee: old.serviceHeld ?? 0,
      chargeTo: 'enemy',
      acceptedQuote: old.serviceHeld ?? 0,
      charged: Boolean(old.serviceRecognized),
      stake: old.stake ?? 0
    },
    time: old.timeSession
      ? {...old.timeSession, minutes: old.timeSession.minutes ?? 30, policy: 'legacy-session'}
      : {minutes: 30, applied: true, policy: 'legacy-none'},
    tableId: old.tableId ?? null,
    revision: 1,
    warnings
  };

  return ok({
    kind: 'legacy',
    formatId,
    paused: false,
    businessUnaffected: true,
    series,
    preserved: preserveRaw(old),
    warnings
  });
}

function preserveRaw(old) {
  return {
    matchId: old.matchId,
    mode: old.mode ?? null,
    status: old.status ?? null,
    result: old.result ?? null,
    tableId: old.tableId ?? null,
    tableOccupied: Boolean(old.tableId),
    itemLocks: [...(old.mine || []), ...(old.enemy || [])]
      .map(item => item?.inventoryRef)
      .filter(Boolean),
    score: {wins: old.wins ?? 0, losses: old.losses ?? 0},
    first: old.first ?? 0,
    bout: old.bout ?? 1,
    progress: old.progress ? {...old.progress} : null,
    fee: {
      serviceHeld: old.serviceHeld ?? 0,
      serviceRecognized: Boolean(old.serviceRecognized),
      stake: old.stake ?? 0,
      serviceContributions: Array.isArray(old.serviceContributions)
        ? old.serviceContributions.map(row => ({...row}))
        : []
    },
    timeSession: old.timeSession ? {...old.timeSession} : null,
    gameId: old.gameId ?? null,
    results: Array.isArray(old.results) ? old.results.map(row => ({...row})) : [],
    background: Boolean(old.background),
    simulated: Boolean(old.simulated)
  };
}

/** Batch helper for world load. Unknown formats are paused, never dropped. */
export function normaliseLegacyMatches(matches) {
  if (!Array.isArray(matches)) return err('INVALID_INPUT', '比赛列表格式不正确。');
  const series = [];
  const unknown = [];
  const paused = [];
  const errors = [];
  for (const match of matches) {
    const result = normaliseLegacyMatch(match);
    if (!result.ok) {
      errors.push({matchId: match?.matchId ?? null, error: result.error});
      continue;
    }
    if (result.data.kind === 'legacy') series.push(result.data.series);
    else {
      unknown.push(result.data);
      paused.push({matchId: result.data.preserved.matchId, reason: result.data.reason});
    }
  }
  return ok({series, unknown, paused, errors, businessUnaffected: true});
}

/** Read-only safety gate used before any new-series command touches old data. */
export function assertMutable(series) {
  if (!isPlainObject(series)) return err('INVALID_INPUT', '缺少系列赛状态。');
  if (series.legacy || series.readOnly) {
    return err('FEATURE_UNAVAILABLE', '旧比赛以只读方式保留，请走原引擎桥或显式迁移。', {
      details: {migrationMode: series.migrationMode || 'legacy'}
    });
  }
  return ok({series});
}
