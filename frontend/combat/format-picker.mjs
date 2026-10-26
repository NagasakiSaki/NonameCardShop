import { el } from "../world/dom-helpers.mjs";
// V7-E combat/format-picker.mjs — 四种开桌模式选项（纯选项构建 + DOM 渲染）。
// 规则（任务书 §5 / 01-冻结玩法 §6）：
// - 显示备战人数、每局上场、AI 同伴数、系列赛规则与可用原因；
// - 可用性来自 combat.formats DTO（能力探测由 D/主模型负责），UI 不猜能力、不因新模式失败禁用旧模式；
// - 保留开台费调整与等待时自由移动（窗口可关、移动不锁）。

const FORMAT_LABELS = {
  "kof": "1v1 三将接力",
  "doudizhu-bo3": "斗地主换边 BO3",
  "versus2v2-bo3": "2v2 BO3",
};

const SERIES_NOTES = {
  "kof": "双方各备战 3 将，阵亡换将，新将摸 4 张不继承。",
  "doudizhu-bo3": "地主 1 人对农民 2 人；每个有胜负的小局后换地主阵营；先 2 胜。",
  "versus2v2-bo3": "每方 2 人共 4 座；不混入 KOF 换将；先 2 胜。",
};

/** 我方 AI 同伴数：地主=0（对面 2 农均 AI），农民=1，2v2=1，单挑=0。角色由 DTO 的 rolePolicy 决定，不猜座位序号。 */
export function aiTeammatesFor(descriptor) {
  if (!descriptor) return 0;
  if (descriptor.formatId === "doudizhu-bo3") return "first-landlord-alternates";
  if (descriptor.formatId === "versus2v2-bo3") return 1;
  return 0;
}

export function formatOptions(formatsResult) {
  const formats = formatsResult?.formats || [];
  return formats.map((format) => ({
    formatId: format.formatId,
    label: format.label || FORMAT_LABELS[format.formatId] || format.formatId,
    reservePerSide: format.reservePerSide ?? (format.reserveCount ?? 0),
    activePerSide: format.activePerSide || [1, 1],
    seats: format.seats,
    winsRequired: format.winsRequired || 2,
    aiTeammates: aiTeammatesFor(format),
    seriesNote: SERIES_NOTES[format.formatId] || "",
    legacy: Boolean(format.legacy),
    available: format.available !== false,
    reason: format.reason || null,
    mountable: format.mountable !== false,
    nativeVariant: format.nativeVariant || null,
    profileId: format.profileId || null,
  }));
}

export function renderFormatPicker({ mount, options, selectedId, onSelect }) {
  mount.replaceChildren();
  const grid = el("div", { class: "v7-format-grid", dataset: { v7FormatPicker: "true" } });
  for (const option of options) {
    const card = el("button", {
      class: "v7-format-card" + (option.formatId === selectedId ? " is-selected" : "") + (option.available ? "" : " is-off"),
      type: "button",
      disabled: !option.available,
      dataset: { formatId: option.formatId },
      title: option.reason || option.label,
      onclick: () => option.available && onSelect(option.formatId),
    }, [
      el("span", { class: "v7-format-card__label", text: option.label }),
      el("span", { class: "v7-format-card__meta", text: `备战 ${option.reservePerSide} · 每局上场 ${option.activePerSide.join("/")} · 共 ${option.seats} 座` }),
      el("span", { class: "v7-format-card__meta", text: option.aiTeammates === "first-landlord-alternates" ? "AI 同伴：视地主归属（农民方 1 名）" : `AI 同伴 ${option.aiTeammates} 名` }),
      option.seriesNote ? el("span", { class: "v7-format-card__note", text: option.seriesNote }) : null,
      option.available
        ? el("span", { class: "chip chip--ok", text: option.legacy ? "可用 · 沿用原规则" : "可用" })
        : el("span", { class: "badge badge--warn v7-format-card__reason", text: "暂不可用：" + (option.reason || "能力未就绪") }),
    ]);
    grid.append(card);
  }
  mount.append(grid);
  const unavailable = options.filter((option) => !option.available);
  if (unavailable.length) {
    mount.append(el("p", { class: "small muted", text: "不可用模式显示原因；修复引擎能力后即可开放，三将接力仍可使用。" }));
  }
}
