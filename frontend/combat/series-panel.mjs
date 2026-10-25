import { el } from "../world/dom-helpers.mjs";
// V7-E combat/series-panel.mjs — 系列赛面板：比分/换边/下一局/观战/中断（纯视图推导 + DOM 渲染）。
// 规则（任务书 §7 / 01-冻结玩法 §6）：
// - BO3 比分、换边说明、下一局入口；玩家主将阵亡而 AI 同伴存活 → 显示“观战中”，不判负；
// - 中断（RECOVERY_REQUIRED）提供 重开当前小局（无赌注）/ 放弃系列赛，已结算小局不重算；
// - 平局不加胜负、按同席位重赛；连续 3 次平局允许双方取消且无挑战奖励；
// - 只消费 host.battle 挂载接口，不调用假引擎；本面板不生产 verified 字段。

export const PHASE_LABELS = {
  selecting: "选将中",
  confirmed: "已确认本局人选",
  mounting: "正在载入牌局",
  live: "对局进行中",
  "round-settled": "本局已结算",
  interrupted: "技术中断",
  finished: "系列赛结束",
  cancelled: "已取消",
};

/**
 * 由 seriesView + 战场状态推导横幅。
 * nativeStatus 由 battle 挂载侧提供的受限状态 {myMainAlive, allyAlive, canControl}，不可用时为 null。
 */
export function seriesBanner(seriesView, nativeStatus = null) {
  const score = seriesView?.score || { mine: 0, enemy: 0 };
  const mine = score.mine ?? 0;
  const enemy = score.enemy ?? 0;
  const winsRequired = seriesView?.winsRequired || 2;
  const phase = seriesView?.phase;
  const banner = {
    phaseLabel: PHASE_LABELS[phase] || phase || "—",
    scoreLabel: `${mine} : ${enemy}`,
    scoreLead: mine > enemy ? "我方领先" : mine < enemy ? "对方领先" : "比分相同",
    spectating: false,
    interruptNote: null,
    drawNote: null,
    canNextRound: false,
    nextLabel: null,
  };
  if (nativeStatus && nativeStatus.myMainAlive === false && nativeStatus.allyAlive) {
    banner.spectating = true;
  }
  if (phase === "interrupted") {
    const detail = seriesView?.interrupt?.message ? seriesView.interrupt.message + " " : "";
    banner.interruptNote = detail + "可以重开当前小局（无赌注）或放弃系列赛；已结算的小局不重算。";
  }
  if ((seriesView?.consecutiveDraws || 0) >= 2 && phase !== "finished") {
    banner.drawNote = `已连续平局 ${seriesView.consecutiveDraws} 局；连续 3 次平局后双方可取消系列赛（无挑战奖励）。`;
  }
  if (phase === "selecting") banner.nextLabel = "进行本局选将";
  if (phase === "confirmed") banner.nextLabel = "开始本局";
  if (phase === "round-settled" && mine < winsRequired && enemy < winsRequired) {
    banner.canNextRound = true;
    banner.nextLabel = "进入下一局";
  }
  return banner;
}

/**
 * 推导队友接管控制状态（06-队友接管补充）：
 * - 默认 AI 操控队友，不自动切换；
 * - 玩家可主动接管己方存活队友，再交还 AI；
 * - 主将阵亡后提示可接管，不能直接显示整队败北；
 * - 无同伴或目标阵亡时禁用并给出说明。
 */
export function takeoverControlInfo(seriesView, nativeStatus) {
  const allySeat = seriesView?.round?.seatSkeleton?.find((seat) => seat.teamId === seriesView.playerTeamId && seat.controller !== "human");
  const hasAlly = Boolean(allySeat) || Boolean(nativeStatus?.hasAlly);
  const isMainAlive = nativeStatus ? nativeStatus.myMainAlive !== false : true;
  const isAllyAlive = nativeStatus ? nativeStatus.allyAlive !== false : true;
  const control = nativeStatus?.control || { controller: "ai", pendingAction: null, activeSeatId: null };
  const controllingAlly = control.controller === "human";
  const pending = Boolean(control.pendingAction || control.pendingSeatId);

  let statusText = "当前操控：主将（你） · 队友由 AI 操控";
  if (controllingAlly) {
    statusText = "当前操控：队友（已接管）" + (isMainAlive ? " · 主将由 AI 托管" : " · 主将已阵亡");
  } else if (!isMainAlive) {
    statusText = "主将已阵亡 · 队友由 AI 操控（观战中，可接管）";
  }
  if (pending) {
    statusText += "（待切换：下回合生效）";
  }

  const canTakeover = hasAlly && isAllyAlive && !controllingAlly && !pending;
  let takeoverReason = "主动接管己方存活队友（下回合生效）";
  if (!hasAlly) takeoverReason = "当前赛制无队友席位";
  else if (!isAllyAlive) takeoverReason = "队友已阵亡，无法接管";
  else if (controllingAlly) takeoverReason = "已在操控队友";
  else if (pending) takeoverReason = "切换请求处理中";

  const canRelease = hasAlly && controllingAlly && !pending;
  let releaseReason = "交还 AI 托管，恢复原主将视角（下回合生效）";
  if (!hasAlly) releaseReason = "当前赛制无队友席位";
  else if (!controllingAlly) releaseReason = "当前已由 AI 操控";
  else if (pending) releaseReason = "切换请求处理中";

  return {
    hasAlly,
    allySeat,
    isMainAlive,
    isAllyAlive,
    controllingAlly,
    pending,
    statusText,
    canTakeover,
    takeoverReason,
    canRelease,
    releaseReason,
  };
}

/** 换边说明（斗地主）：由 DTO 的 roleState/roles 变化推导文字，不猜座位。 */
export function sideSwapNote(seriesView) {
  if (!seriesView || seriesView.formatId !== "doudizhu-bo3") return null;
  const role = seriesView.roles?.[seriesView.playerTeamId];
  return role === "landlord" ? "本局我方阵营：地主（1 人）" : "本局我方阵营：农民（2 人）";
}

/**
 * 系列赛主面板。
 * onIntentSubmit 接收 {type:'combat.start'|'combat.continue'|'combat.surrender'|'combat.restartRound'|'combat.abandon'|'combat.cancel'} 意图。
 * battleMount: {container, mount(matchId)} 由 shell 提供（真实接线 = host.battle.mount）。
 */
export function renderSeriesPanel({ mount, seriesView, nativeStatus, battleBox, onIntentSubmit, onBackToSelect, requestIdOf }) {
  if (!seriesView) return;
  const banner = seriesBanner(seriesView, nativeStatus);
  const panel = el("div", { class: "v7-series", dataset: { v7SeriesPanel: "true" } });
  const head = el("div", { class: "v7-series__head" }, [
    el("strong", { class: "v7-series__score", text: `比分 ${banner.scoreLabel}`, dataset: { v7Score: "true" } }),
    el("span", { class: "chip", text: banner.phaseLabel }),
    el("span", { class: "small muted", text: `先 ${seriesView.winsRequired || 2} 胜 · ${banner.scoreLead}` }),
  ]);
  panel.append(head);
  if (banner.spectating) {
    panel.append(el("p", { class: "note-card", style: { borderColor: "rgba(140,190,255,0.6)" }, dataset: { v7Spectate: "true" }, text: "观战中：你的主将已阵亡，但 AI 同伴仍在作战——团队尚未落败。你可以点击下方【接管队友】亲自操控，或继续观战等待同伴打完本局。" }));
  }
  const swap = sideSwapNote(seriesView);
  if (swap) panel.append(el("p", { class: "small muted", text: swap }));
  if (banner.drawNote) panel.append(el("p", { class: "small", style: { color: "#f0c58a" }, text: banner.drawNote }));

  const takeover = takeoverControlInfo(seriesView, nativeStatus);
  if (takeover.hasAlly && (seriesView.phase === "live" || nativeStatus)) {
    const takeoverBar = el("div", { class: "v7-takeover-bar", dataset: { v7Takeover: "true" } }, [
      el("div", { class: "v7-takeover__status small", text: takeover.statusText }),
      el("div", { class: "toolbar" }, [
        el("button", {
          class: "btn btn--sm" + (takeover.canTakeover ? " btn--protect" : ""),
          type: "button",
          text: "接管队友",
          disabled: !takeover.canTakeover,
          title: takeover.takeoverReason,
          dataset: { action: "takeover" },
          onclick: () => onIntentSubmit({
            type: "battle.control",
            payload: { matchId: seriesView.matchId, action: "takeover", seatId: takeover.allySeat?.seatId },
            requestId: requestIdOf("takeover"),
          }),
        }),
        el("button", {
          class: "btn btn--sm",
          type: "button",
          text: "交还AI",
          disabled: !takeover.canRelease,
          title: takeover.releaseReason,
          dataset: { action: "release" },
          onclick: () => onIntentSubmit({
            type: "battle.control",
            payload: { matchId: seriesView.matchId, action: "release", seatId: takeover.allySeat?.seatId },
            requestId: requestIdOf("release-ai"),
          }),
        }),
      ]),
    ]);
    panel.append(takeoverBar);
  }

  if (seriesView.phase === "selecting") {
    if (onBackToSelect) panel.append(el("button", { class: "btn btn--primary", type: "button", text: "进行本局选将", onclick: () => onBackToSelect() }));
  } else if (seriesView.phase === "confirmed") {
    panel.append(el("button", { class: "btn btn--primary", type: "button", text: "开始本局", onclick: () => onIntentSubmit({ type: "combat.start", payload: { matchId: seriesView.matchId }, requestId: requestIdOf("series-start") }) }));
  } else if (seriesView.phase === "round-settled") {
    const result = seriesView.officialResult;
    panel.append(el("p", { class: "note-card", text: result ? `第 ${seriesView.round?.index ?? "—"} 局结束：${result.winningTeamId === "draw" ? "平局（同席位重赛）" : result.winningTeamId === seriesView.playerTeamId ? "我方拿下" : "对方拿下"}。` : "本局已结算。" }));
    if (banner.canNextRound) panel.append(el("button", { class: "btn btn--primary", type: "button", text: "进入下一局", onclick: () => onIntentSubmit({ type: "combat.continue", payload: { matchId: seriesView.matchId }, requestId: requestIdOf("series-continue") }) }));
  }

  if (seriesView.phase === "interrupted" || banner.interruptNote) {
    const interruptBox = el("div", { class: "note-card", style: { borderColor: "rgba(240,160,138,0.7)" }, dataset: { v7Interrupt: "true" } }, [
      el("p", { class: "note-card__title", text: "技术中断" }),
      el("p", { class: "small", text: banner.interruptNote || "对局被技术中断。" }),
      el("div", { class: "toolbar" }, [
        el("button", { class: "btn", type: "button", text: "重开当前小局（重新发牌，无赌注）", onclick: () => onIntentSubmit({ type: "combat.restartRound", payload: { matchId: seriesView.matchId }, requestId: requestIdOf("series-restart") }) }),
        el("button", { class: "btn btn--danger", type: "button", text: "放弃系列赛", onclick: () => onIntentSubmit({ type: "combat.abandon", payload: { matchId: seriesView.matchId }, requestId: requestIdOf("series-abandon") }) }),
      ]),
    ]);
    panel.append(interruptBox);
  }

  if (battleBox) panel.append(battleBox);

  if (!["finished", "cancelled"].includes(seriesView.phase)) {
    panel.append(el("div", { class: "toolbar" }, [
      el("button", { class: "btn btn--sm", type: "button", text: "本局认输", onclick: () => onIntentSubmit({ type: "combat.surrender", payload: { matchId: seriesView.matchId, scope: "round" }, requestId: requestIdOf("surrender-round") }) }),
      el("button", { class: "btn btn--sm btn--danger", type: "button", text: "整场认输", onclick: () => onIntentSubmit({ type: "combat.surrender", payload: { matchId: seriesView.matchId, scope: "series" }, requestId: requestIdOf("surrender-series") }) }),
      (seriesView.consecutiveDraws || 0) >= 3 ? el("button", { class: "btn btn--sm", type: "button", text: "双方取消（连续平局）", onclick: () => onIntentSubmit({ type: "combat.cancel", payload: { matchId: seriesView.matchId }, requestId: requestIdOf("series-cancel") }) }) : null,
    ]));
    panel.append(el("p", { class: "small muted", text: seriesView.fee?.policy === "waived" ? "挑战赛免双方桌费，不产生营业收入。" : `桌费按已接受报价结算：${seriesView.fee?.tableFee ?? "—"}` }));
  }
  if (seriesView.phase === "finished" && seriesView.officialResult) {
    const win = seriesView.officialResult.winningTeamId === seriesView.playerTeamId;
    panel.append(el("p", { class: "note-card", dataset: { v7SeriesResult: "true" }, text: win ? "系列赛获胜。挑战奖励由 Host 核验后发放，本界面不自行宣布解锁。" : "系列赛落败。可改天再战或总结阵容再来。" }));
  }
  mount.replaceChildren(panel);
}
