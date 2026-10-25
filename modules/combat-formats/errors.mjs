/**
 * V7-C combat-formats — uniform result envelope.
 *
 * Contract: card-shop-v7-candidate/1
 * Every public function returns
 *   {ok:true,data,effects} | {ok:false,error:{code,message,retryable,details?}}
 * Expected failures never throw; `effects` are *intents* for the main model,
 * never committed world mutations.
 */

/** Codes fixed by the shared contract plus the three input/state codes this package needs. */
export const CONTRACT_ERROR_CODES = Object.freeze([
  'FEATURE_UNAVAILABLE',
  'NOT_ONSITE',
  'TOO_FAR',
  'ACTOR_BUSY',
  'TABLE_BUSY',
  'INVITE_STALE',
  'PRODUCT_LOCKED',
  'PRODUCT_RETIRED',
  'INSUFFICIENT_ROSTER',
  'ROSTER_LOCKED',
  'STALE_OPERATION',
  'PROFILE_MISMATCH',
  'RESULT_CONFLICT',
  'RECOVERY_REQUIRED'
]);

/** Extra codes used only where the frozen list has no precise equivalent. */
export const EXTENSION_ERROR_CODES = Object.freeze(['INVALID_INPUT', 'INVALID_STATE', 'NOT_ELIGIBLE']);

export function ok(data, effects = []) {
  return {ok: true, data, effects};
}

export function err(code, message, {retryable = false, details} = {}) {
  return {
    ok: false,
    error: {code, message, retryable, ...(details === undefined ? {} : {details})}
  };
}

export const clone = value => structuredClone(value);

export const isPlainObject = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value);

export function isNonEmptyString(value) {
  return typeof value === 'string' && value.length > 0;
}

export function isCount(value, min = 0, max = 64) {
  return Number.isSafeInteger(value) && value >= min && value <= max;
}
