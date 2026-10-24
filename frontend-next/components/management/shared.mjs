// deliverables/playability-v1/PLAY-C/src/shared.mjs
// PLAY-C 组件共享工具：DOM 构造、格式化、三态（0/null/error）、pc- 前缀样式注入。
// 只服务本包组件，不属于正式工程；不读写 localStorage/IndexedDB，不发业务请求。

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "dataset") Object.assign(node.dataset, value);
    else if (key === "style") Object.assign(node.style, value);
    else if (key.startsWith("on") && typeof value === "function") node.addEventListener(key.slice(2).toLowerCase(), value);
    else node.setAttribute(key, value === true ? "" : String(value));
  }
  for (const child of [].concat(children)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
  return node;
}

export function fmtInt(n) {
  return Number(n).toLocaleString("zh-CN");
}

/** 带符号金额：+380 / −640（显示用统一负号）。 */
export function fmtSigned(n) {
  const sign = n > 0 ? "+" : n < 0 ? "−" : "";
  return sign + fmtInt(Math.abs(n));
}

export function fmtMinute(minute) {
  const m = Math.max(0, Math.min(1439, Math.floor(minute)));
  return String(Math.floor(m / 60)).padStart(2, "0") + ":" + String(m % 60).padStart(2, "0");
}

/** 三态展示：null/undefined → “—”；0 → “0”（确认为零，不是未知）。 */
export function numOrDash(n, formatter = fmtInt) {
  return n == null ? "—" : formatter(n);
}

const STYLE_IDS = new Set();
/** 幂等注入包内样式；所有选择器必须带 pc- 前缀，不写 body/* 通配。 */
export function injectStyles(id, css) {
  if (STYLE_IDS.has(id)) return;
  const style = el("style", { id: "pc-style-" + id, text: css });
  document.head.append(style);
  STYLE_IDS.add(id);
}

export const PHASE_LABEL = { preparing: "开店准备", open: "营业中", closing: "结账中", closed: "已打烊" };

/** 现有 activity/label → 状态短词（≤6 字）。新意图字段就绪前用 activity 兜底。 */
export const ACTIVITY_WORDS = {
  shopping: "选购中",
  walking: "走动",
  opening: "拆包中",
  sorting: "挑牌中",
  discarding: "去弃牌",
  scavenging: "翻回收桶",
  leaving: "离店",
  idle: "停留",
};
export const ACTIVITY_TONE = {
  shopping: "good", walking: "muted", opening: "violet", sorting: "teal",
  discarding: "muted", scavenging: "teal", leaving: "muted", idle: "muted",
};

/** 流失原因五分类 + 技术诊断：颜色全项目统一，不合并成“满意度”。 */
export const REASON_META = {
  stockout: { label: "缺货", tone: "bad", color: "var(--pc-red)" },
  insufficientFunds: { label: "余额不足", tone: "violet", color: "var(--pc-violet)" },
  price: { label: "价格不合适", tone: "warn", color: "var(--pc-amber)" },
  queueTimeout: { label: "排队过久", tone: "info", color: "var(--pc-blue)" },
  noTable: { label: "无空桌", tone: "teal", color: "var(--pc-teal)" },
  pathError: { label: "路径异常（技术诊断，不罚声望）", tone: "muted", color: "var(--pc-muted)" },
  normal: { label: "正常离店", tone: "muted", color: "var(--pc-muted)" },
};

const AVATAR_TONES = ["#6f8f62", "#a8864e", "#8a6fa8", "#5f8a80", "#96605a", "#94804e", "#4f7d95", "#7d6f9b"];
export function avatar(name) {
  let hash = 0;
  for (const ch of String(name || "?")) hash = (hash * 31 + ch.codePointAt(0)) >>> 0;
  const bg = AVATAR_TONES[hash % AVATAR_TONES.length];
  return el("span", { class: "pc-avatar", style: { background: bg }, text: String(name || "?").slice(0, 1) });
}

export function chip(tone, text, title) {
  return el("span", { class: "pc-chip pc-chip--" + (tone || "muted"), title: title || "", text });
}

export function kpi({ label, value, note, tone = "" }) {
  return el("div", { class: "pc-kpi" }, [
    el("span", { class: "pc-kpi__label", text: label }),
    el("span", { class: "pc-kpi__value" + (tone ? " pc-kpi__value--" + tone : ""), text: value }),
    note ? el("span", { class: "pc-kpi__note", text: note }) : null,
  ]);
}

export function card({ title, tail, kind = "", children = [] }) {
  return el("section", { class: "pc-card" + (kind ? " pc-card--" + kind : "") }, [
    el("div", { class: "pc-card__title" }, [
      el("h3", { text: title }),
      tail ? el("span", { class: "pc-card__tail", text: tail }) : null,
    ]),
    ...[].concat(children),
  ]);
}

export function note(text) {
  return el("p", { class: "pc-note", text });
}

/** 样例/待后端标注（金色虚线小标）。 */
export function sampleTag(text = "样例") {
  return el("span", { class: "pc-tag-sample", text });
}

export function btn({ label, intent, onClick, primary = false, disabled = false, title = "" }) {
  return el("button", {
    class: "pc-btn" + (primary ? " pc-btn--primary" : ""),
    type: "button",
    disabled,
    "data-intent": intent || "",
    title: title || label,
    onclick: disabled ? null : onClick,
    text: label,
  });
}

/** 未知/未提供占位块：不编造数字。 */
export function pendingBlock(text = "暂无数据（字段待提供，显示“—”，不编造 0）") {
  return el("div", { class: "pc-pending", text });
}

/** 动作结果条：成功 / 失败（可重试） / 结果未知 三种显示；重试结果就地刷新。 */
export function actionResult(result) {
  if (!result) return null;
  const holder = el("div");
  const paint = (res) => {
    clear(holder);
    if (res.ok === false) {
      const err = res.error || {};
      holder.className = "pc-result-holder";
      holder.append(el("div", { class: "pc-result pc-result--error" }, [
        el("span", { text: "操作失败：" + (err.code || "HOST_ERROR") + " · " + (err.message || "请稍后再试") }),
        err.retryable && typeof res.retry === "function"
          ? btn({
              label: "重试", intent: "retry",
              onClick: () => { paint(res.retry()); },
            })
          : null,
      ]));
    } else if (res.status === "unknown") {
      holder.append(el("div", { class: "pc-result pc-result--unknown", text: res.message || "操作结果尚未确定，请查询原操作后再继续。" }));
    } else {
      holder.append(el("div", { class: "pc-result pc-result--ok", text: res.message || "操作已完成。" }));
    }
  };
  paint(result);
  return holder;
}

export function table({ head, rows }) {
  const t = el("table", { class: "pc-table" }, [
    el("thead", {}, [el("tr", {}, head.map((h) => el("th", { class: typeof h === "object" ? h.class : "", text: typeof h === "object" ? h.text : h })))]),
    el("tbody", {}, rows),
  ]);
  // 窄屏时表格保持完整列宽、容器内横向滚动，不挤压主内容。
  return el("div", { class: "pc-table-scroll" }, [t]);
}

/** 组件根容器：容器查询支撑 406 窄屏回退。 */
export function rootWrap(root, cls = "") {
  const wrap = el("div", { class: "pc-root " + cls });
  root.append(wrap);
  return wrap;
}
