// frontend/ui/hud.mjs — 顶部 HUD：营业日/时间/暂停原因/资金/入口按钮。全部读 Host 提供的快照。
import { el, clear, formatMoney, formatClock, formatPhase, formatShort } from "./components.mjs";

const SPEED_LABEL = { 0.5: "0.5×", 1: "1×", 2: "2×", 3: "3×", 4: "4×" };

export function createHud({ mount, currency, onAction, getSnapshot }) {
  const clockNode = document.getElementById("hud-clock");
  const walletNode = document.getElementById("hud-wallet");
  const actionsNode = document.getElementById("hud-actions");

  const actions = [
    { id: "inventory", label: "背包 B" },
    { id: "tasks", label: "任务" },
    { id: "report", label: "日报" },
    { id: "saves", label: "存档" },
    { id: "management", label: "经营" },
    { id: "help", label: "手册" },
    { id: "settings", label: "设置" },
  ];

  clear(actionsNode);
  for (const action of actions) {
    actionsNode.append(el("button", {
      class: "btn btn--sm",
      type: "button",
      "data-action": action.id,
      text: action.label,
      onclick: () => onAction(action.id),
    }));
  }

  function render(snapshot) {
    if (!snapshot) return;
    const clock = snapshot.clock;
    clear(clockNode);
    const clockParts = [
      el("span", { class: "hud__day", text: "第 " + clock.day + " 天" }),
      el("span", { class: "hud__time", text: formatClock(clock).split(" ").slice(2).join(" ") }),
      el("span", { class: "hud__phase", text: formatPhase(clock.phase) }),
      el("span", { class: "hud__phase", text: SPEED_LABEL[clock.speed] || clock.speed + "×" }),
    ];
    if (!clock.running) clockParts.push(el("span", { class: "badge badge--warn", text: "已暂停" }));
    clockNode.append(...clockParts);

    clear(walletNode);
    const walletParts = [el("span", { class: "wallet__amount", text: formatMoney(snapshot.wallet.available, currency) })];
    if (snapshot.wallet.debt > 0) walletParts.push(el("span", { class: "wallet__debt", text: "欠款 " + formatShort(snapshot.wallet.debt, currency) }));
    if (snapshot.wallet.escrowLiability > 0) walletParts.push(el("span", { class: "badge", text: "托管 " + formatShort(snapshot.wallet.escrowLiability, currency) }));
    walletNode.append(...walletParts);

    const paused = document.getElementById("paused-banner");
    if (paused) {
      const reasons = clock.pauseReasons || [];
      if (reasons.length) {
        paused.hidden = false;
        paused.textContent = "暂停 · " + reasons.map((reason) => reason.label).join(" · ");
      } else {
        paused.hidden = true;
      }
    }
  }

  return { render, refresh: () => render(getSnapshot()) };
}
