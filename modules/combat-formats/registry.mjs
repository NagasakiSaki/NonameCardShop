/**
 * Three-format registry.
 *
 * formatId      经营赛制 (business-facing format, persisted in series state)
 * engineMode    noname 原生模式 (doudizhu / versus / existing two-seat profile)
 * nativeVariant 本地子规则 (must be pinned by group D's probe, never guessed here)
 * profileId     引擎能力 profile (comes from D's capability report)
 *
 * The shipped KOF engine remains available: they are already shipped in the current build, so
 * a missing probe must not disable them. New formats are unavailable until D
 * reports a supported capability with a pinned profile.
 */
import {ok, err, isPlainObject, isNonEmptyString} from './errors.mjs';

export const FORMAT_VERSION = 1;
export const DEFAULT_FORMAT_ID = 'kof';

/**
 * `availability`:
 *  - 'legacy-live'      shipped today; stays available even without a probe
 *  - 'capability-required' new native mode; unavailable unless D reports support
 *
 * `handPolicy` deliberately differs per format. Legacy two-seat profiles keep
 * 4-card opening hands and the first-draw penalty; the new native modes must use
 * the native opening and must never inherit the legacy first-round reduction.
 * Only KOF keeps the fresh-four replacement draw.
 */
export const FORMAT_DEFINITIONS = Object.freeze([
  Object.freeze({
    formatId: 'kof',
    label: '1v1 三将接力',
    engineMode: 'existing-two-seat-profile',
    nativeVariant: null,
    legacy: true,
    availability: 'legacy-live',
    reservePerSide: 3,
    activePerSide: Object.freeze([1, 1]),
    seats: 2,
    // Legacy KOF is one decisive game: the current engine finishes the match on
    // the first result, so winsRequired stays 1 and must not be "upgraded" to BO3.
    winsRequired: 1,
    humanSeats: 1,
    rolePlan: Object.freeze({duelist: 1}),
    drawPolicy: 'finish-draw',
    rolePolicy: 'fixed',
    replacementHand: 'fresh-four',
    handPolicy: Object.freeze({
      initialHand: 4,
      firstDrawPenalty: 1,
      replacement: Object.freeze({policy: 'fresh-four', drawn: 4, inheritHand: false, inheritEquipment: false})
    }),
    inheritAcrossRounds: false
  }),
  Object.freeze({
    formatId: 'doudizhu-bo3',
    label: '斗地主换边 BO3',
    engineMode: 'doudizhu',
    nativeVariant: null,
    legacy: false,
    availability: 'capability-required',
    reservePerSide: 5,
    activePerSide: Object.freeze([1, 2]),
    seats: 3,
    winsRequired: 2,
    humanSeats: 1,
    rolePlan: Object.freeze({landlord: 1, farmer: 2}),
    drawPolicy: 'replay',
    rolePolicy: 'seeded-first-alternate-after-decisive-round',
    replacementHand: null,
    handPolicy: Object.freeze({initialHand: 'native', firstDrawPenalty: 0, replacement: null}),
    inheritAcrossRounds: false
  }),
  Object.freeze({
    formatId: 'versus2v2-bo3',
    label: '2v2 BO3',
    engineMode: 'versus',
    nativeVariant: null,
    legacy: false,
    availability: 'capability-required',
    reservePerSide: 8,
    activePerSide: Object.freeze([2, 2]),
    seats: 4,
    winsRequired: 2,
    humanSeats: 1,
    rolePlan: Object.freeze({teammate: 2}),
    drawPolicy: 'replay',
    rolePolicy: 'fixed',
    replacementHand: null,
    handPolicy: Object.freeze({initialHand: 'native', firstDrawPenalty: 0, replacement: null}),
    inheritAcrossRounds: false
  })
]);

const BY_ID = new Map(FORMAT_DEFINITIONS.map(definition => [definition.formatId, definition]));

export function getFormat(formatId) {
  return BY_ID.get(formatId) || null;
}

export function listFormatIds() {
  return FORMAT_DEFINITIONS.map(definition => definition.formatId);
}

/** Legacy `mode` strings used by the shipped backend/queue match records. */
export const LEGACY_MODE_TO_FORMAT = Object.freeze({kof: 'kof'});

export function fromLegacyMode(mode) {
  return LEGACY_MODE_TO_FORMAT[mode] || null;
}

/** `combat.eligible({mode})` compatibility mapping — never silently widens the mode set. */
export function modeCompat(formatId) {
  const definition = getFormat(formatId);
  if (!definition) return null;
  return {
    formatId: definition.formatId,
    mode: definition.legacy ? definition.formatId : null,
    reservePerSide: definition.reservePerSide,
    activePerSide: [...definition.activePerSide],
    seats: definition.seats,
    winsRequired: definition.winsRequired
  };
}

/** Accept an array of capability rows, or a `{formatId: row}` map, or nothing. */
export function indexCapabilities(capabilities) {
  const index = new Map();
  if (!capabilities) return index;
  const rows = Array.isArray(capabilities)
    ? capabilities
    : isPlainObject(capabilities)
      ? Object.entries(capabilities).map(([formatId, row]) => ({formatId, ...(isPlainObject(row) ? row : {})}))
      : [];
  for (const row of rows) {
    if (!isPlainObject(row) || !isNonEmptyString(row.formatId)) continue;
    index.set(row.formatId, row);
  }
  return index;
}

/**
 * Resolve availability for one format.
 * Legacy formats fall back to `legacy-live`; a failing probe only marks them
 * `degraded` (visible warning), never removes the ability to play.
 */
export function resolveAvailability(definition, capabilities) {
  const index = indexCapabilities(capabilities);
  const probe = index.get(definition.formatId) || null;
  const pinnedVariant = isNonEmptyString(probe?.nativeVariant) ? probe.nativeVariant : null;

  if (definition.availability === 'legacy-live') {
    if (!probe) {
      return {
        available: true,
        availabilitySource: 'legacy-live',
        verified: false,
        degraded: false,
        profileId: null,
        capabilityHash: null,
        nativeVariant: definition.nativeVariant,
        variantPinned: definition.nativeVariant !== null,
        reason: '沿用现有两人内核；未提供能力探测，按已上线赛制处理。'
      };
    }
    if (probe.supported === false) {
      return {
        available: true,
        availabilitySource: 'legacy-live',
        verified: false,
        degraded: true,
        profileId: probe.profileId ?? null,
        capabilityHash: probe.hash ?? null,
        nativeVariant: pinnedVariant ?? definition.nativeVariant,
        variantPinned: true,
        reason: probe.reason || '能力探测报告不支持；保留现有内核回退，需人工复核。'
      };
    }
    return {
      available: true,
      availabilitySource: 'capability',
      verified: true,
      degraded: false,
      profileId: probe.profileId ?? null,
      capabilityHash: probe.hash ?? null,
      nativeVariant: pinnedVariant ?? definition.nativeVariant,
      variantPinned: true,
      reason: null
    };
  }

  if (!probe) {
    return {
      available: false,
      availabilitySource: 'unavailable',
      verified: false,
      degraded: false,
      profileId: null,
      capabilityHash: null,
      nativeVariant: null,
      variantPinned: false,
      reason: '原生模式适配尚未通过探测，暂不可用。'
    };
  }
  if (probe.supported !== true) {
    return {
      available: false,
      availabilitySource: 'unavailable',
      verified: false,
      degraded: false,
      profileId: probe.profileId ?? null,
      capabilityHash: probe.hash ?? null,
      nativeVariant: pinnedVariant,
      variantPinned: Boolean(pinnedVariant),
      reason: probe.reason || '原生模式适配尚未通过探测，暂不可用。'
    };
  }
  if (!isNonEmptyString(probe.profileId)) {
    return {
      available: false,
      availabilitySource: 'unavailable',
      verified: false,
      degraded: false,
      profileId: null,
      capabilityHash: probe.hash ?? null,
      nativeVariant: pinnedVariant,
      variantPinned: Boolean(pinnedVariant),
      code: 'PROFILE_MISMATCH',
      reason: '探测结果缺少 profileId，不能凭模式名开赛。'
    };
  }
  return {
    available: true,
    availabilitySource: 'capability',
    verified: true,
    degraded: false,
    profileId: probe.profileId,
    capabilityHash: probe.hash ?? null,
    nativeVariant: pinnedVariant,
    variantPinned: Boolean(pinnedVariant),
    reason: pinnedVariant ? null : '原生子规则尚未锁定；计划可生成但不可挂载。'
  };
}

function publicDescriptor(definition, availability) {
  return {
    formatId: definition.formatId,
    label: definition.label,
    engineMode: definition.engineMode,
    nativeVariant: availability.nativeVariant,
    variantPinned: availability.variantPinned,
    profileId: availability.profileId,
    capabilityHash: availability.capabilityHash,
    legacy: definition.legacy,
    reservePerSide: definition.reservePerSide,
    activePerSide: [...definition.activePerSide],
    seats: definition.seats,
    winsRequired: definition.winsRequired,
    humanSeats: definition.humanSeats,
    rolePlan: {...definition.rolePlan},
    drawPolicy: definition.drawPolicy,
    rolePolicy: definition.rolePolicy,
    replacementHand: definition.replacementHand,
    handPolicy: {...definition.handPolicy},
    available: availability.available,
    availabilitySource: availability.availabilitySource,
    verified: availability.verified,
    degraded: availability.degraded,
    reason: availability.reason,
    mountable: availability.available && availability.variantPinned && !definition.legacy
      ? true
      : availability.available && definition.legacy
  };
}

/** `combat.formats` query. Read-only, no RNG, no capability guessing. */
export function listFormats(capabilities) {
  const formats = FORMAT_DEFINITIONS.map(definition =>
    publicDescriptor(definition, resolveAvailability(definition, capabilities))
  );
  return ok({
    formatVersion: FORMAT_VERSION,
    defaultFormatId: DEFAULT_FORMAT_ID,
    formats,
    byId: Object.fromEntries(formats.map(format => [format.formatId, format])),
    // A new mode failing never disables a legacy one; surface that explicitly.
    legacyFormatsPlayable: formats.filter(format => format.legacy && format.available).map(format => format.formatId),
    unavailableFormats: formats.filter(format => !format.available).map(format => ({formatId: format.formatId, reason: format.reason}))
  });
}

/** Resolve one format or fail with FEATURE_UNAVAILABLE / PROFILE_MISMATCH. */
export function assertFormatAvailable(formatId, capabilities) {
  const definition = getFormat(formatId);
  if (!definition) {
    return err('INVALID_INPUT', `未知赛制：${String(formatId)}`, {details: {formatId, known: listFormatIds()}});
  }
  const availability = resolveAvailability(definition, capabilities);
  if (!availability.available) {
    return err(
      availability.code || 'FEATURE_UNAVAILABLE',
      availability.reason || '该赛制暂不可用。',
      {details: {formatId, availabilitySource: availability.availabilitySource}}
    );
  }
  return ok({format: definition, availability, descriptor: publicDescriptor(definition, availability)});
}
