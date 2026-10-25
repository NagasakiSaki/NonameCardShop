// feedback-prefs.mjs — 反馈偏好（音量/静音/字幕/文字速度/减少动画）的读写与校验。
// 候选合同（CV6-15 提案）：预览环境沿用既有前缀 `noname-card-shop-frontend-preview:prefs` 之外的
// 独立键 `noname-card-shop:prefs`（正式键），结构向后兼容；非法值一律回落默认，不抛错。
export const FEEDBACK_DEFAULTS = Object.freeze({
  masterVolume: 0.8,      // 0..1，独立于业务速度；静音仍可理解信息（U01）
  muted: false,
  subtitles: true,        // 字幕条开关
  textSpeed: "normal",    // slow | normal | fast（字幕逐显速度）
  reducedMotion: false,   // 减少动画：关过渡/镜头缓动改跳切
});

const KEY = "noname-card-shop:prefs";
const SPEEDS = ["slow", "normal", "fast"];
export const TEXT_SPEED_MS = { slow: 55, normal: 28, fast: 12 }; // 每字显示间隔

function clampPrefs(raw) {
  const out = { ...FEEDBACK_DEFAULTS };
  if (!raw || typeof raw !== "object") return out;
  if (Number.isFinite(raw.masterVolume)) out.masterVolume = Math.min(1, Math.max(0, raw.masterVolume));
  if (typeof raw.muted === "boolean") out.muted = raw.muted;
  if (typeof raw.subtitles === "boolean") out.subtitles = raw.subtitles;
  if (SPEEDS.includes(raw.textSpeed)) out.textSpeed = raw.textSpeed;
  if (typeof raw.reducedMotion === "boolean") out.reducedMotion = raw.reducedMotion;
  return out;
}

export function createFeedbackPrefs({ storage = null, onChange = null } = {}) {
  let store = storage;
  try { store ||= globalThis.localStorage || null; } catch { store = null; }
  let prefs = FEEDBACK_DEFAULTS;
  try { prefs = clampPrefs(store ? JSON.parse(store.getItem(KEY) || "{}") : null); } catch { prefs = { ...FEEDBACK_DEFAULTS }; }

  return {
    get: () => ({ ...prefs }),
    textSpeedMs: () => TEXT_SPEED_MS[prefs.textSpeed] ?? TEXT_SPEED_MS.normal,
    set(patch) {
      prefs = clampPrefs({ ...prefs, ...patch });
      try { store?.setItem(KEY, JSON.stringify(prefs)); } catch { /* 隐私模式等：偏好仅本会话生效 */ }
      onChange?.(this.get());
      return this.get();
    },
    reset() { return this.set({ ...FEEDBACK_DEFAULTS }); },
  };
}
