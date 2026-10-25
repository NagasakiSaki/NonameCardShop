/**
 * V7-C public surface — `src/modules/combat-formats/`.
 *
 * Contract functions (shared draft `card-shop-v7-candidate/1`):
 *   listFormats(capabilities)
 *   validateReserve(formatId, rosters, eligibility)
 *   createSeries(input)
 *   selectRound(series, input)
 *   buildRoundPlan(series)
 *   reduceSeries(series, verifiedRoundResult)
 *   planRosterLocks(series)
 *   normaliseLegacyMatch(old)
 *
 * All of them are synchronous and pure: explicit DTO in, new DTO plus intent
 * effects out. Nothing here talks to the host, the engine or the UI.
 */
export {
  FORMAT_VERSION,
  DEFAULT_FORMAT_ID,
  FORMAT_DEFINITIONS,
  getFormat,
  listFormatIds,
  listFormats,
  assertFormatAvailable,
  resolveAvailability,
  fromLegacyMode,
  modeCompat,
  LEGACY_MODE_TO_FORMAT
} from './registry.mjs';

export {
  reserveRequirement,
  validateReserve,
  reserveRefs
} from './eligibility.mjs';

export {
  SERIES_VERSION,
  SERIES_PHASES,
  createSeries,
  selectRound,
  beginMount,
  reduceSeries,
  markRoundStarted,
  cancelSeries,
  surrenderSeries,
  interruptSeries,
  restartRound,
  abandonSeries,
  seriesView,
  buildSeatSkeleton,
  roleMapFor
} from './series.mjs';

export {
  PLAN_VERSION,
  DEFAULT_CONTROL_POLICY,
  CONTROL_POLICIES,
  normaliseControlPolicy,
  buildRoundPlan,
  planMountCheck,
  planKofReplacement,
  allyControlSeats,
  handPolicyFor
} from './round-plan.mjs';

export {
  ACTIVE_PHASES,
  TERMINAL_PHASES,
  lockIdFor,
  createLockState,
  planRosterLocks,
  planResume,
  acknowledgeLocks,
  lockSummary
} from './locks.mjs';

export {
  SERIES_MINUTES,
  planLifecycle,
  planFee,
  planTime,
  acknowledgeFee,
  acknowledgeTime,
  recoveryPolicy
} from './lifecycle.mjs';

export {
  normaliseLegacyMatch,
  normaliseLegacyMatches,
  assertMutable
} from './legacy.mjs';

export {CONTRACT_ERROR_CODES, EXTENSION_ERROR_CODES, ok, err} from './errors.mjs';
export {sha256Hex, canonicalJson, digestOf, seededRandom} from './digest.mjs';

import {listFormats, assertFormatAvailable, getFormat, modeCompat} from './registry.mjs';
import {validateReserve, reserveRequirement} from './eligibility.mjs';
import {
  createSeries,
  selectRound,
  beginMount,
  reduceSeries,
  cancelSeries,
  surrenderSeries,
  interruptSeries,
  restartRound,
  abandonSeries,
  markRoundStarted,
  seriesView
} from './series.mjs';
import {buildRoundPlan, planMountCheck, planKofReplacement, allyControlSeats} from './round-plan.mjs';
import {planRosterLocks, planResume, acknowledgeLocks} from './locks.mjs';
import {planLifecycle, acknowledgeFee, acknowledgeTime} from './lifecycle.mjs';
import {normaliseLegacyMatch, normaliseLegacyMatches} from './legacy.mjs';

/** Single adapter object so the main model can wire one import. */
export const combatFormats = Object.freeze({
  listFormats,
  assertFormatAvailable,
  getFormat,
  modeCompat,
  reserveRequirement,
  validateReserve,
  createSeries,
  selectRound,
  beginMount,
  buildRoundPlan,
  planMountCheck,
  planKofReplacement,
  allyControlSeats,
  markRoundStarted,
  reduceSeries,
  planRosterLocks,
  planResume,
  acknowledgeLocks,
  planLifecycle,
  acknowledgeFee,
  acknowledgeTime,
  cancelSeries,
  surrenderSeries,
  interruptSeries,
  restartRound,
  abandonSeries,
  seriesView,
  normaliseLegacyMatch,
  normaliseLegacyMatches
});
