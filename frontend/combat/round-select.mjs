import { el } from "../world/dom-helpers.mjs";
// V7-E combat/round-select.mjs — 第二层：逐局选将（纯推导/校验 + 步骤渲染）。
// 规则（任务书 §6 / 02-共享接口）：
// - 每局从整场固定备战池中选 1 或 2 人；标出主将(你)/同伴(AI)、地主/农民阵营与剩余位置；
// - 角色来自 DTO（series.roles / seatSkeleton），绝不通过座位序号猜测；
// - 只选自己控制阵营；本轮确认后冻结（ROSTER_LOCKED）。

const ROLE_LABELS = { landlord: "地主", farmer: "农民", teammate: "同伴", duelist: "单将" };

export function roleLabel(role) {
  return ROLE_LABELS[role] || role || "";
}

/**
 * 由 seriesView 推导本局我方选将要求。
 * - 我方 human 席位 → 必选 1（主将·你）
 * - 斗地主且我方是农民 → 另有 1 个 AI 同伴席位需要指派（共选 2）
 * - 2v2 → 我方 1 human + 1 AI 同伴（共选 2）
 * 返回 {picks, humanSeat, allySeat|null, myRole, enemyRole, seats}
 */
export function roundSelectionRequirement(seriesView) {
  if (!seriesView?.round?.seatSkeleton) return null;
  const seats = seriesView.round.seatSkeleton;
  const mySeats = seats.filter((seat) => seat.teamId === seriesView.playerTeamId);
  const enemySeats = seats.filter((seat) => seat.teamId !== seriesView.playerTeamId);
  const humanSeat = mySeats.find((seat) => seat.controller === "human") || null;
  const allySeat = mySeats.find((seat) => seat.controller !== "human") || null;
  const picks = 1 + (allySeat ? 1 : 0);
  return {
    picks,
    humanSeat,
    allySeat,
    myRole: seriesView.roles[seriesView.playerTeamId] || mySeats[0]?.role,
    enemyRole: seriesView.roles[seriesView.playerTeamId === "mine" ? "enemy" : "mine"] || enemySeats[0]?.role,
    seats,
  };
}

export function seatDisplay(seat, { isPlayerTeam }) {
  const controllerLabel = seat.controller === "human" ? "主将（你）" : "AI";
  const teamLabel = isPlayerTeam ? "我方" : "敌方";
  return `${teamLabel} · ${roleLabel(seat.role)} · ${controllerLabel}`;
}

/** 校验逐局选择：来自整场备战池、数量正确、不重复、只占我方席位。 */
export function validateRoundSelection({ requirement, reserveKeys, selection }) {
  const pool = new Set(reserveKeys);
  if (selection.length !== requirement.picks) {
    return { ok: false, error: { code: "INSUFFICIENT_ROSTER", message: `本局需要选 ${requirement.picks} 人，当前 ${selection.length} 人`, retryable: true } };
  }
  if (new Set(selection).size !== selection.length) {
    return { ok: false, error: { code: "DUPLICATE_ROSTER", message: "本局选择有重复武将", retryable: false } };
  }
  for (const key of selection) {
    if (!pool.has(key)) return { ok: false, error: { code: "NOT_IN_RESERVE", message: "所选武将不在整场备战池", retryable: false } };
  }
  return { ok: true };
}

/**
 * combat.selectRound 命令意图。selection 按席位分配：第 1 个给 human 席，第 2 个给 AI 同伴席。
 */
export function buildSelectRoundIntent({ seriesView, selection, proof, requestId }) {
  const requirement = roundSelectionRequirement(seriesView);
  if (!requirement) return { type: "combat.selectRound", payload: { matchId: seriesView.matchId, roundId: seriesView.round.roundId, selections: [] }, requestId };
  const assignments = [];
  if (requirement.humanSeat && selection[0]) assignments.push({ seatId: requirement.humanSeat.seatId, inventoryRef: selection[0] });
  if (requirement.allySeat && selection[1]) assignments.push({ seatId: requirement.allySeat.seatId, inventoryRef: selection[1] });
  return { type: "combat.selectRound", payload: { matchId: seriesView.matchId, roundId: seriesView.round.roundId, selections: assignments, proof }, requestId };
}

/**
 * 逐局选将步骤渲染。只重绘本步骤；确认后 shell 发 selectRound 并刷新到系列赛面板。
 * reserveItems: 整场锁定池的条目（key=inventoryRef, name, rarity…）
 */
export function renderRoundStep({ mount, seriesView, reserveItems, selection, onIntentSubmit }) {
  const requirement = roundSelectionRequirement(seriesView);
  if (!requirement) {
    mount.replaceChildren(el("p", { class: "small", text: "系列赛状态缺少席位骨架，等待 Host 刷新。" }));
    return;
  }
  const section = el("div", { class: "v7-round-select", dataset: { v7RoundStep: "true" } });
  section.append(el("h4", { class: "section__title", text: `第二步 · 第 ${seriesView.round.index} 局选将（从整场备战池中选 ${requirement.picks} 人）` }));

  const seatRow = el("div", { class: "v7-seats" });
  for (const seat of requirement.seats) {
    const mine = seat.teamId === seriesView.playerTeamId;
    seatRow.append(el("div", { class: "v7-seat" + (mine ? " is-mine" : "") + (seat.controller === "human" ? " is-human" : "") }, [
      el("span", { class: "v7-seat__id", text: seat.seatId }),
      el("span", { class: "v7-seat__role", text: roleLabel(seat.role) }),
      el("span", { class: "v7-seat__ctrl", text: seat.controller === "human" ? "主将（你）" : "AI" }),
      el("span", { class: "v7-seat__pick small muted", text: mine ? "本局选择" : "对方/自动" }),
    ]));
  }
  section.append(seatRow);
  if (seriesView.formatId === "doudizhu-bo3") {
    section.append(el("p", { class: "small muted", text: `本局我方${roleLabel(requirement.myRole)}；每个有胜负的小局后地主阵营对调，平局按同席位重赛。` }));
  }

  const selectedNames = () => selection.map((key) => reserveItems.find((item) => item.key === key)?.name || key).join(" / ") || "（未选）";
  const statusRow = el("p", { class: "small", dataset: { v7RoundSelection: "true" }, text: "已选：" + selectedNames() });
  const poolRow = el("div", { class: "v7-round-pool" });
  for (const item of reserveItems) {
    const index = selection.indexOf(item.key);
    poolRow.append(el("button", {
      class: "btn btn--sm" + (index >= 0 ? " btn--primary" : ""),
      type: "button",
      text: (index >= 0 ? "✓ " : "") + item.name,
      dataset: { roundPick: item.key },
      onclick: () => {
        if (index >= 0) selection.splice(index, 1);
        else {
          if (selection.length >= requirement.picks) selection.shift(); // 覆盖最早的选择，整窗不重弹
          selection.push(item.key);
        }
        statusRow.textContent = "已选：" + selectedNames();
        for (const button of poolRow.querySelectorAll("[data-round-pick]")) {
          const key = button.dataset.roundPick;
          const at = selection.indexOf(key);
          button.classList.toggle("btn--primary", at >= 0);
          button.textContent = (at >= 0 ? "✓ " : "") + (reserveItems.find((i) => i.key === key)?.name || key);
        }
        confirmBtn.disabled = selection.length !== requirement.picks;
      },
    }));
  }
  const errorBox = el("p", { class: "small", style: { color: "#f0a08a" }, hidden: true });
  const confirmBtn = el("button", {
    class: "btn btn--primary", type: "button",
    text: `确认本局人选（${selection.length}/${requirement.picks}）`,
    disabled: selection.length !== requirement.picks,
    onclick: () => {
      const check = validateRoundSelection({ requirement, reserveKeys: reserveItems.map((item) => item.key), selection });
      if (!check.ok) { errorBox.textContent = check.error.message; errorBox.hidden = false; return; }
      errorBox.hidden = true;
      onIntentSubmit(buildSelectRoundIntent({ seriesView, selection, proof: null, requestId: null }));
    },
  });
  section.append(el("p", { class: "small muted", text: "选人顺序：第 1 个为主将（你），第 2 个为 AI 同伴；点已选可取消。" }), poolRow, statusRow, errorBox, el("div", { class: "toolbar" }, [confirmBtn]));
  mount.replaceChildren(section);
}
