// frontend/ui/hud.mjs — 顶部 HUD：营业日/时间/暂停原因/资金/入口按钮。全部读 Host 提供的快照。
import { el, clear, formatMoney, formatClock, formatPhase, formatShort } from "./components.mjs";

const SPEED_LABEL = { 0.5: "0.5×", 1: "1×", 2: "2×", 3: "3×", 4: "4×" };

export function createHud({ mount, currency, onAction, getSnapshot }) {
  const clockNode = document.getElementById("hud-clock");
  const walletNode = document.getElementById("hud-wallet");
  const actionsNode = document.getElementById("hud-actions");
  const ledgerNode=el('section',{class:'live-ledger','aria-label':'实时收支流水'});
  document.getElementById('stage-overlay').append(ledgerNode);
  const ticker=el('div',{class:'live-ledger-ticker',role:'status',hidden:true});document.getElementById('app').append(ticker);
  let lastEntryId=null,tickerTimer,ledgerBranch;

  const actions = [
    { id: "business", label: "开门营业" },
    { id: "pause", label: "暂停时钟" },
    { id: "speed", label: "速度 1×" },
    { id: "inventory", label: "背包 B" },
    { id: "tasks", label: "任务" },
    { id: "guide", label: "引导 / 熟客" },
    { id: "customers", label: "顾客 / 牌桌" },
    { id: "report", label: "日报" },
    { id: "finance", label: "收支流水" },
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
    const business=actionsNode.querySelector('[data-action="business"]');
    business.textContent=clock.phase==='preparing'?'开门营业':clock.phase==='closed'?'开始下一天':'打烊结算';
    actionsNode.querySelector('[data-action="pause"]').textContent=clock.manualPaused?'继续时钟':'暂停时钟';
    actionsNode.querySelector('[data-action="speed"]').textContent='速度 '+clock.speed+'×';
    clear(clockNode);
    const clockParts = [
      el("span", { class: "hud__day", text: "第 " + clock.day + " 天" }),
      el("span", { class: "hud__time", text: formatClock(clock).split(" ").at(-1) }),
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
    walletNode.append(el('span',{class:'hud__phase',text:'今日营业 '+formatShort((snapshot.daily.goods||0)+(snapshot.daily.service||0),currency)+' · 奖励 '+formatShort(snapshot.daily.taskRewards||0,currency)}));
    const entries=snapshot.cashJournal||[];
    const branch=snapshot.worldId+':'+snapshot.branchId;if(ledgerBranch!==branch){ledgerBranch=branch;lastEntryId=null;ticker.hidden=true;}
    if(lastEntryId&&entries[0]?.entryId!==lastEntryId){
      ticker.replaceChildren(...entries.slice(0,Math.max(1,entries.findIndex(e=>e.entryId===lastEntryId))).slice(0,3).map(e=>el('div',{text:e.label+' · 现金 '+(e.amount>=0?'+':'')+e.amount+' 币'+(e.debtDelta?' · 欠款'+(e.debtDelta>0?'+':'')+e.debtDelta:'')})));
      ticker.hidden=false;clearTimeout(tickerTimer);tickerTimer=setTimeout(()=>{ticker.hidden=true;},7000);
    }
    lastEntryId=entries[0]?.entryId||'empty';
    ledgerNode.replaceChildren(el('strong',{text:'实时收支流水'}),...entries.slice(0,4).map(e=>el('div',{class:'live-ledger__row '+(e.amount<0?'is-expense':'is-income')},[
      el('span',{text:`第${e.day}天 ${Math.floor(e.minute/60).toString().padStart(2,'0')}:${Math.floor(e.minute%60).toString().padStart(2,'0')} · ${e.label}`}),
      el('b',{text:(e.amount>0?'+':'')+e.amount.toLocaleString('zh-CN')+' 币'+(e.debtDelta?' · 欠款'+(e.debtDelta>0?'+':'')+e.debtDelta:'')})
    ])),...(!entries.length?[el('p',{class:'muted',text:'进货、销售、桌费与任务奖励将实时显示。'})]:[]));

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

  return { render, refresh: () => render(getSnapshot()),destroy(){clearTimeout(tickerTimer);ledgerNode.remove();ticker.remove();} };
}
