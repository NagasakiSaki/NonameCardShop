// index.mjs — feedback 模块候选入口：把 cue/字幕/偏好组合成一个可挂接的宿主对象。
// 接入点候选（对应 patches/0004-wiring 提案，未应用）：
//   app-shell: host.subscribe(evt => feedback.onHostEvent(evt))；window-manager 开/关回调 → feedback.onWindow(open/close)。
//   模块本身无业务副作用：不写 Host、不改时钟、不触发命令。
import { createCueRegistry, CUE_REGISTRY } from "./cue-registry.mjs";
import { createFeedbackPrefs, FEEDBACK_DEFAULTS } from "./feedback-prefs.mjs";
import { createSubtitleBar } from "./subtitles.mjs";

// HostEvent type → cue ID 候选映射（05/03 的事件名以 Host 实际发为准；未匹配事件静默跳过）。
const EVENT_CUES = [
  { match: (evt) => evt.type === "notification" && /售出|成交/.test(String(evt.data?.message || evt.data?.text || "")), cue: "cue_business_sale_sealed" },
  { match: (evt) => evt.type === "notification" && /到货|送达/.test(String(evt.data?.message || evt.data?.text || "")), cue: "cue_business_purchase_arrived" },
  { match: (evt) => evt.type === "snapshotUpdated" && evt.data?.clock?.phase === "open", cue: "cue_business_day_open" },
  { match: (evt) => evt.type === "snapshotUpdated" && evt.data?.clock?.phase === "closed", cue: "cue_business_day_close" },
];

export function createFeedback({ mount = null, storage = null, audioExists = null } = {}) {
  const prefs = createFeedbackPrefs({ storage });
  const cues = createCueRegistry({
    masterVolume: prefs.get().masterVolume,
    muted: prefs.get().muted,
    exists: audioExists,
  });
  const subtitles = createSubtitleBar({ mount, prefs });

  prefs; // 保留引用；onChange 由宿主按需传入重建
  let lastPhase = null;
  let destroyed = false;

  function onHostEvent(evt) {
    if (destroyed) return;
    if (!evt || typeof evt !== "object") return;
    if (evt.type === "snapshotUpdated" && evt.data?.clock) {
      const phase = evt.data.clock.phase;
      if (lastPhase && phase !== lastPhase) {
        if (phase === "open") cues.play("cue_business_day_open");
        if (phase === "closed") cues.play("cue_business_day_close");
      }
      lastPhase = phase;
      return;
    }
    if (evt.type === "notification") {
      const text = String(evt.data?.message || evt.data?.text || "");
      const hit = EVENT_CUES.find((rule) => rule.match(evt));
      if (hit) cues.play(hit.cue);
      // 通知同时进字幕（静音/嘈杂环境仍可理解，U01 非颜色通道）
      if (text) subtitles.show({ speaker: evt.data?.speaker || "通知", text });
    }
  }

  function onWindow({ opening = false, title = "" } = {}) {
    if (destroyed) return;
    cues.play(opening ? "cue_ui_window_open" : "cue_ui_window_close");
    if (opening && title) subtitles.show({ speaker: "窗口", text: title, durationMs: 1800 });
  }

  function applyPrefs(patch) {
    const next = prefs.set(patch);
    cues.setMasterVolume(next.masterVolume);
    cues.setMuted(next.muted);
    if (next.reducedMotion) subtitles.hide();
    return next;
  }

  function destroy() { destroyed = true; subtitles.destroy(); }

  return {
    prefs, cues, subtitles,
    onHostEvent, onWindow, applyPrefs, destroy,
    EVENT_CUES, CUE_REGISTRY, FEEDBACK_DEFAULTS,
  };
}
