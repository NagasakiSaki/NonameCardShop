// frontend/ui/components.mjs — 共享 UI 原子：DOM 构造、金额与时间格式化、三态、确认框、提示条。

export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;
    if (key === "class") node.className = value;
    else if (key === "text") node.textContent = value;
    else if (key === "html") node.innerHTML = value;
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

export function formatMoney(amount, currency) {
  const minor = currency && currency.minorUnit ? currency.minorUnit : 1;
  const value = Number(amount || 0) / minor;
  const rounded = Math.abs(value) >= 1000 ? Math.round(value) : Math.round(value * 100) / 100;
  return rounded.toLocaleString("zh-CN") + " " + (currency && currency.label ? currency.label : "金币");
}

export function formatShort(amount, currency) {
  const minor = currency && currency.minorUnit ? currency.minorUnit : 1;
  const value = Number(amount || 0) / minor;
  if (Math.abs(value) >= 10000) return (value / 10000).toFixed(1) + " 万";
  return Math.round(value).toLocaleString("zh-CN");
}

export function formatClock(clock) {
  if (!clock) return "—";
  const minute = Math.max(0, Math.min(1439, Math.floor(clock.minute)));
  const h = String(Math.floor(minute / 60)).padStart(2, "0");
  const m = String(minute % 60).padStart(2, "0");
  return "第 " + clock.day + " 天 " + h + ":" + m;
}

const PHASE_LABEL = { preparing: "开店准备", open: "营业中", closing: "结账中", closed: "已闭店" };
export function formatPhase(phase) {
  return PHASE_LABEL[phase] || phase || "—";
}

export function stateView({ kind = "empty", title, body, action }) {
  const node = el("div", { class: "state" + (kind === "error" ? " state--error" : kind === "loading" ? " state--loading" : "") });
  if (kind === "loading") node.append(el("span", { class: "spinner" }));
  if (title) node.append(el("p", { class: "state__title", text: title }));
  if (body) node.append(el("p", { class: "small", text: body }));
  if (action) node.append(action);
  return node;
}

export function statRow(label, value, hint) {
  return el("div", { class: "stat-row" }, [
    el("span", { class: "stat-row__label" }, [label, hint ? el("span", { class: "muted small", text: "  " + hint }) : null]),
    el("span", { class: "stat-row__value" }, [value]),
  ]);
}

export function rarityChip(rarity, printed) {
  return el("span", { class: "chip rarity rarity--" + rarity, text: rarity + (printed ? "（印刷）" : "") });
}

export function imgWithFallback(src, alt, className) {
  const img = el("img", { class: className || "", alt: alt || "", loading: "lazy" });
  const placeholder = () =>
    img.replaceWith(el("div", { class: (className || "") + " card-tile__img small", style: { display: "grid", placeItems: "center", color: "#7a7488" }, text: "缺图" }));
  img.addEventListener("error", placeholder, { once: true });
  img.src = src || "";
  if (!src) placeholder();
  return img;
}

/** 列表类查询结果归一化：兼容 { items } / 裸数组 / { rows }。 */
export function rowsOf(data) {
  if (!data) return [];
  if (Array.isArray(data)) return data;
  if (Array.isArray(data.items)) return data.items;
  if (Array.isArray(data.rows)) return data.rows;
  return [];
}

export function nextCursorOf(data) {
  if (!data || Array.isArray(data)) return null;
  return data.nextCursor ?? null;
}

/** 任务的进度字段在不同实现里叫 goal 或 target。 */
export function taskGoal(task) {
  const goal = Number(task.goal ?? task.target ?? 1);
  return Number.isFinite(goal) && goal > 0 ? goal : 1;
}

export function taskDone(task) {
  if (typeof task.completed === "boolean") return task.completed;
  return Number(task.progress || 0) >= taskGoal(task);
}

export function debounce(fn, delay = 220) {
  let timer = null;
  return (...args) => {
    clearTimeout(timer);
    timer = setTimeout(() => fn(...args), delay);
  };
}

let requestCounter = 0;
export function newRequestId(prefix = "req") {
  requestCounter += 1;
  return prefix + ":" + Date.now().toString(36) + ":" + requestCounter;
}

export function toast(kind, title, body, ttl = 4200) {
  const container = document.getElementById("toasts");
  if (!container) return;
  const node = el("div", { class: "toast toast--" + kind }, [
    el("p", { class: "toast__title", text: title }),
    body ? el("p", { class: "toast__body", text: body }) : null,
  ]);
  container.append(node);
  setTimeout(() => node.remove(), ttl);
}

/** 统一错误展示：玩家可读的 message + 是否可重试。 */
export function errorView(error, onRetry) {
  const code = error && error.code ? error.code : "HOST_ERROR";
  const message = error && error.message ? error.message : "操作失败，请稍后再试";
  return stateView({
    kind: "error",
    title: code,
    body: message + (error && error.retryable ? "（可重试）" : ""),
    action: onRetry ? el("button", { class: "btn btn--sm", type: "button", onclick: onRetry, text: "重试" }) : null,
  });
}

export function busyButton(button, label = "处理中…") {
  const original = button.textContent;
  button.disabled = true;
  button.textContent = label;
  return () => {
    button.disabled = false;
    button.textContent = original;
  };
}
