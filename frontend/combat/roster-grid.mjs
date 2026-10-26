import { el } from "../world/dom-helpers.mjs";
// V7-E combat/roster-grid.mjs — 共享选将网格（纯选择逻辑 + DOM 渲染）。
// 规则（任务书 §6）：
// - 跨页选择不丢（selected 状态独立于分页）；收藏置顶；显示数量/占用（owned/available/locked/listed）；
// - 卡面/技能预览按需打开，不整窗重弹；
// - challenge-loan 借用将显眼标识“借用 · 不可上架/转让”，且永不出现在玩家可选池。

export const ROSTER_PAGE_SIZE = Number.MAX_SAFE_INTEGER;

export function toggleSelection(selectedKeys, key, { max = Infinity, itemsByKey = null } = {}) {
  const next = selectedKeys.filter((existing) => existing !== key);
  if (next.length !== selectedKeys.length) return { ok: true, selectedKeys: next };
  if (next.length >= max) return { ok: false, error: { code: "ROSTER_FULL", message: `最多选择 ${max} 名`, retryable: false } };
  const item = itemsByKey ? itemsByKey[key] : null;
  if (item && item.eligible === false) return { ok: false, error: { code: "NOT_ELIGIBLE", message: item.reasons?.[0]?.message || "该卡当前不可用", retryable: false } };
  next.push(key);
  return { ok: true, selectedKeys: next };
}

/** 收藏置顶（稳定）：收藏的排前面，其余按原顺序。 */
export function favoriteSort(items, favorites) {
  if (!favorites || !favorites.size) return items.slice();
  return items.slice().sort((a, b) => Number(favorites.has(b.key)) - Number(favorites.has(a.key)));
}

export function pageOf(items, page, pageSize = ROSTER_PAGE_SIZE) {
  const pages = Math.max(1, Math.ceil(items.length / pageSize));
  const safe = Math.min(Math.max(0, page), pages - 1);
  return { items: items.slice(safe * pageSize, safe * pageSize + pageSize), page: safe, pages };
}

/** 玩家可选卡必须 excluded 借用将：loan 永远只属于对方。 */
export function playableItems(items) {
  return (items || []).filter((item) => !item.loan);
}

/**
 * 渲染选将网格。
 * items: [{key,name,rarity,skillSummary,quantity:{owned,available,locked,listed},eligible,reasons[],loan,favorite}]
 * 状态变化只重绘网格与计数，不重建整个窗口（选择状态由调用方持有）。
 */
export function renderRosterGrid({ mount, items, selected, max, page = 0, favorites, onToggle, onPreview, onToggleFavorite, pageSize = ROSTER_PAGE_SIZE, caption, readOnly = false,sortByScore=false }) {
  mount.replaceChildren();
  const sorted = sortByScore?items.slice().sort((a,b)=>(b.modeScore??-Infinity)-(a.modeScore??-Infinity)||String(a.name).localeCompare(String(b.name),'zh')):favoriteSort(items, favorites);
  const { items: pageItems, page: safePage, pages } = pageOf(sorted, page, pageSize);
  const countRow = el("div", { class: "v7-roster__count" }, [
    el("strong", { text: readOnly ? `固定名单 · ${items.length} 名武将` : `已选 ${selected.length}/${max}` }),
    el("span", { class: "small muted", text: caption || "跨页选择自动保留；先选的排在前。" }),
  ]);
  const grid = el("div", { class: "v7-roster-grid", dataset: { v7RosterGrid: "true" } });
  for (const item of pageItems) {
    const isSelected = selected.includes(item.key);
    const unavailable = item.eligible === false;
    const quantity = item.quantity || {};
    const card = el("div", {
      class: "v7-roster-card" + (isSelected ? " is-selected" : "") + (unavailable ? " is-off" : "") + (item.loan ? " is-loan" : ""),
      type: "button",
      role:"button",tabindex:0,"aria-disabled":unavailable && !isSelected,
      dataset: { rosterKey: item.key, cardKey:item.cardKey },
      onclick: (event) => {
        if (event.target.closest("[data-role=fav]")) return;
        if(readOnly)onPreview?.(item);else if(!unavailable||isSelected)onToggle(item);
      },
    }, [
      item.imageUrl?el("img",{class:"v7-roster-card__art",src:item.imageUrl,alt:item.name,loading:"lazy"}):null,
      el("div", { class: "v7-roster-card__top" }, [
        el("span", { class: "v7-roster-card__name", text: item.name }),
        el("button", {
          class: "v7-roster-card__fav" + (item.favorite || (favorites && favorites.has(item.key)) ? " is-on" : ""),
          type: "button",
          "data-role": "fav",
          text: (item.favorite || (favorites && favorites.has(item.key)) ? "★" : "☆"),
          title: "收藏武将",
          onclick: (event) => { event.stopPropagation(); onToggleFavorite(item); },
        }),
      ]),
      el("div", { class: "v7-roster-card__meta" }, [
        el("span", { class: "rarity rarity--" + item.rarity, text: item.rarity }),
        item.loan ? el("span", { class: "chip chip--warn", text: "借用 · 不可上架" }) : null,
        isSelected ? el("span", { class: "chip chip--protect", text: "已选" }) : null,
      ]),
      readOnly ? null : el("div", { class: "v7-roster-card__qty small muted", text: `持有${quantity.owned ?? "—"} 可用${quantity.available ?? "—"} 锁${quantity.locked ?? 0} 在架${quantity.listed ?? 0}` }),
      Number.isFinite(item.modeScore)?el('span',{class:'small',text:'本模式 '+item.modeScore.toFixed(1)+' · 全局均分 '+Number(item.globalScore).toFixed(1)}):null,
      item.skillSummary ? el("span", { class: "v7-roster-card__skill small", text: item.skillSummary }) : null,
      unavailable && item.reasons?.length ? el("span", { class: "small", style: { color: "#f0a08a" }, text: item.reasons[0].message }) : null,
    ]);
    card.append(el("button",{class:"btn v7-roster-card__preview",text:"卡面与技能",onclick:event=>{event.stopPropagation();onPreview?.(item);}}));
    card.addEventListener("keydown",event=>{if(event.target===card&&["Enter"," "].includes(event.key)){event.preventDefault();if(readOnly)onPreview?.(item);else if(!unavailable||isSelected)onToggle(item);}});
    card.addEventListener("contextmenu", (event) => { event.preventDefault(); onPreview && onPreview(item); });
    grid.append(card);
  }
  mount.append(countRow, grid);
  if (pages > 1) {
    const pager = el("div", { class: "v7-roster__pager" }, [
      el("button", { class: "btn btn--sm", type: "button", text: "上一页", disabled: safePage === 0, onclick: () => onToggle({ __page: safePage - 1 }) }),
      el("span", { class: "small", text: `${safePage + 1}/${pages}` }),
      el("button", { class: "btn btn--sm", type: "button", text: "下一页", disabled: safePage >= pages - 1, onclick: () => onToggle({ __page: safePage + 1 }) }),
    ]);
    mount.append(pager);
  }
  mount.append(el("p", { class: "small muted", text: "右键/长按卡片查看卡面与技能预览。" }));
}
