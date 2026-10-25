// CV6-15 feedback 模块定向单测（node 直跑，不改正式测试入口）。
// 覆盖：偏好校验回落、cue 节流/静音/缺素材跳过、字幕文本安全（不执行 HTML）、事件→cue 映射。
import { ok, equal, match } from "./assert.mjs";
import { createCueRegistry, CUE_REGISTRY } from "../../frontend/feedback/cue-registry.mjs";
import { createFeedbackPrefs, FEEDBACK_DEFAULTS, TEXT_SPEED_MS } from "../../frontend/feedback/feedback-prefs.mjs";
import { createFeedback } from "../../frontend/feedback/index.mjs";

const results = [];
async function check(name, fn) {
  try { await fn(); results.push({ name, ok: true }); console.log("  ok  ", name); }
  catch (e) { results.push({ name, ok: false, error: String(e.message || e) }); console.log("  FAIL", name, e.message); }
}

// 内存 storage
function memoryStorage() {
  const map = new Map();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => map.set(k, String(v)), clear: () => map.clear() };
}

await check("偏好：非法值回落默认且不抛错", () => {
  const prefs = createFeedbackPrefs({ storage: memoryStorage() });
  const next = prefs.set({ masterVolume: 42, textSpeed: "ludicrous", muted: "yes" });
  equal(next.masterVolume, 1); // 越界钳到上界
  equal(next.textSpeed, FEEDBACK_DEFAULTS.textSpeed);
  equal(next.muted, FEEDBACK_DEFAULTS.muted);
  equal(prefs.textSpeedMs(), TEXT_SPEED_MS.normal);
});

await check("偏好：合法修改持久化并可读回", () => {
  const storage = memoryStorage();
  const prefs = createFeedbackPrefs({ storage });
  prefs.set({ masterVolume: 0.3, textSpeed: "fast", reducedMotion: true });
  const again = createFeedbackPrefs({ storage });
  equal(again.get().masterVolume, 0.3);
  equal(again.get().textSpeed, "fast");
  equal(again.get().reducedMotion, true);
  equal(again.textSpeedMs(), TEXT_SPEED_MS.fast);
});

await check("cue：静音时跳过且计数", async () => {
  const cues = createCueRegistry({ muted: true, exists: async () => true });
  equal(await cues.play("cue_ui_window_open"), false);
  equal(cues.counters.skippedMuted, 1);
});

await check("cue：素材缺失占位跳过（无音频≠不可用）", async () => {
  const cues = createCueRegistry({ exists: async () => false });
  equal(await cues.play("cue_business_sale_sealed"), false);
  equal(cues.counters.skippedMissing, 1);
  equal(cues.counters.failed, 0);
  ok(CUE_REGISTRY.every((c) => c.id.startsWith("cue_")));
});

await check("cue：未知 ID 与 80ms 节流", async () => {
  const cues = createCueRegistry({ exists: async () => true });
  equal(await cues.play("cue_not_registered"), false);
  // 同 ID 连发第二次被节流（第一次 play 走到 Audio 会在无 DOM 环境 throw → failed 计数，但节流先行于第二次）
  await cues.play("cue_ui_window_open");
  await cues.play("cue_ui_window_open");
  ok(cues.counters.skippedThrottled >= 1);
});

// DOM 相关用例：仅在可用环境执行（浏览器 harness；纯 node 环境自然跳过）
if (typeof document !== "undefined") {
  await check("feedback：notification 转字幕且 speaker 为纯文本", () => {
    const host = document.createElement("div");
    document.body.append(host);
    const fb = createFeedback({ mount: host, storage: memoryStorage(), audioExists: async () => false });
    fb.applyPrefs({ reducedMotion: true }); // 跳过逐字动画，文本立即可断言
    fb.onHostEvent({ type: "notification", data: { speaker: "<img src=x onerror=alert(1)>", message: "卖出散包 ×1" } });
    const bar = host.querySelector(".cv615-subtitles");
    ok(bar && !bar.hidden, "字幕条应显示");
    equal(bar.querySelector("img"), null, "不得出现注入元素");
    match(bar.textContent, /卖出散包/);
    fb.destroy();
    equal(host.querySelector(".cv615-subtitles"), null);
  });

  await check("feedback：phase 变化映射开/打烊 cue（占位跳过路径）", async () => {
    const fb = createFeedback({ mount: document.createElement("div"), storage: memoryStorage(), audioExists: async () => false });
    await fb.onHostEvent({ type: "snapshotUpdated", data: { clock: { phase: "open" } } }); // 初始化 lastPhase，不触发
    await fb.onHostEvent({ type: "snapshotUpdated", data: { clock: { phase: "closed" } } });
    ok(fb.cues.counters.skippedMissing >= 1, "缺素材走占位跳过");
    fb.destroy();
  });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
if (failed.length && typeof process !== "undefined" && typeof process.exit === "function") process.exit(1);
