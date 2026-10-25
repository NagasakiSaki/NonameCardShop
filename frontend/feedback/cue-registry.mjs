// cue-registry.mjs — 提示音候选注册表：稳定 cue ID、分类、音量策略与占位资产路径。
// 候选合同（CV6-15 提案，未经主模型冻结）：cue ID 命名 `cue_<域>_<事件>`，
// 资产占位路径 /assets/frontend/audio/<cueId>.ogg；文件缺失时 play() 静默跳过并计数，
// 不抛错、不阻塞、不重试，保证"无音频 ≠ 不可用"。
export const CUE_CATEGORIES = ["ui", "business", "world", "dialog"];

// 占位注册表：present=false 表示素材尚未入库（来源登记见 specs/feedback-candidates.json）。
export const CUE_REGISTRY = [
  { id: "cue_ui_window_open", category: "ui", volume: 0.5, present: false },
  { id: "cue_ui_window_close", category: "ui", volume: 0.5, present: false },
  { id: "cue_ui_toast_error", category: "ui", volume: 0.6, present: false },
  { id: "cue_ui_task_claim", category: "ui", volume: 0.6, present: false },
  { id: "cue_business_sale_sealed", category: "business", volume: 0.7, present: false },
  { id: "cue_business_sale_single", category: "business", volume: 0.7, present: false },
  { id: "cue_business_purchase_arrived", category: "business", volume: 0.6, present: false },
  { id: "cue_business_day_open", category: "business", volume: 0.7, present: false },
  { id: "cue_business_day_close", category: "business", volume: 0.7, present: false },
  { id: "cue_world_customer_enter", category: "world", volume: 0.4, present: false },
  { id: "cue_world_customer_leave", category: "world", volume: 0.4, present: false },
  { id: "cue_world_match_start", category: "world", volume: 0.6, present: false },
  { id: "cue_world_match_end", category: "world", volume: 0.6, present: false },
  { id: "cue_dialog_line", category: "dialog", volume: 0.5, present: false },
];

export function createCueRegistry({ masterVolume = 0.8, muted = false, audioBase = "/assets/frontend/audio", exists = null } = {}) {
  const state = { masterVolume, muted };
  const lastPlay = new Map();
  const counters = { played: 0, skippedMissing: 0, skippedMuted: 0, skippedThrottled: 0, failed: 0 };
  const byId = new Map(CUE_REGISTRY.map((cue) => [cue.id, { ...cue }]));

  function canPlay(cue) {
    if (state.muted) { counters.skippedMuted++; return null; }
    if (!cue || !byId.has(cue.id)) return null;
    // 同一 cue 80ms 节流，防连点爆音。
    const now = Date.now();
    if (now - (lastPlay.get(cue.id) || 0) < 80) { counters.skippedThrottled++; return null; }
    lastPlay.set(cue.id, now);
    return cue;
  }

  return {
    categories: CUE_CATEGORIES,
    list: () => [...byId.values()],
    setMasterVolume(value) { state.masterVolume = Math.min(1, Math.max(0, Number(value) || 0)); },
    setMuted(flag) { state.muted = !!flag; },
    isMuted: () => state.muted,
    urlFor(cueId) { return `${audioBase}/${cueId}.ogg`; },
    counters,
    // exists(cue) 由宿主注入（HEAD 请求/资源清单）；缺省视为不存在 → 占位跳过。
    async play(cueId) {
      const cue = canPlay(byId.get(cueId) || { id: cueId });
      if (!cue) return false;
      const present = exists ? await exists(cue) : cue.present;
      if (!present) { counters.skippedMissing++; return false; }
      try {
        const audio = new Audio(this.urlFor(cue.id));
        audio.volume = Math.min(1, state.masterVolume * cue.volume);
        await audio.play();
        counters.played++;
        return true;
      } catch {
        counters.failed++;
        return false;
      }
    },
  };
}
