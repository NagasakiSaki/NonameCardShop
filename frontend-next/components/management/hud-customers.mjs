// deliverables/playability-v1/PLAY-C/src/hud-customers.mjs
// C1 营业 HUD 与顾客反馈（候选组件，mount 约定见总分工 §5）。
// 只读 view 渲染；actions 由预览/主模型提供（Mock 回调）；不连真实 Host、不申请暂停、无计时器。

import {
  el, clear, chip, kpi, card, note, btn, avatar, table, rootWrap,
  fmtInt, fmtSigned, fmtMinute, numOrDash, injectStyles, pendingBlock, actionResult,
  PHASE_LABEL, ACTIVITY_WORDS, ACTIVITY_TONE, REASON_META,
} from "./shared.mjs";
import { BASE_CSS, C1_CSS } from "./styles.mjs";

const BUSY_THRESHOLD = 10;

function toneColor(tone) {
  return { good: "var(--pc-green)", muted: "var(--pc-muted)", violet: "var(--pc-violet)", teal: "var(--pc-teal)" }[tone] || "var(--pc-muted)";
}

function intentWord(c) {
  // 短期只显示一个最相关意图/状态；暂无明确意图，未提供时用 activity 映射兜底。
  if (c.intent) return c.intent;
  return ACTIVITY_WORDS[c.activity] || c.activity || "—";
}

function selected_label(c) {
  return "行为：" + (c.label || "—");
}

function journalRow(e) {
  const amt = el("b", { class: "amt " + (e.amount >= 0 ? "amt--in" : "amt--out"), text: fmtSigned(e.amount) });
  const debt = e.debtDelta ? el("span", { class: "pc-chip pc-chip--violet", text: "欠款 " + fmtSigned(e.debtDelta) }) : null;
  return el("div", { class: "pc-hud__entry" }, [
    el("span", { text: fmtMinute(e.minute) + " " + e.label }),
    el("span", { style: { display: "inline-flex", gap: "6px", alignItems: "center" } }, [amt, debt]),
  ]);
}

export function mount({ root, view, actions = {}, assets = {} }) {
  injectStyles("base", BASE_CSS);
  injectStyles("c1", C1_CSS);
  const wrap = rootWrap(root, "pc-c1");
  let selectedId = null;
  let lastResult = null;

  let disposed=false,actionBusy=false;
  const act = async(name,...args)=>{if(disposed||actionBusy)return;actionBusy=true;try{const fn=actions[name];lastResult=typeof fn==='function'?(await fn(...args)||{ok:true}):{ok:false,error:{code:'UNAVAILABLE',message:'此操作暂时不可用。'}};}catch(error){lastResult={ok:false,error:{code:error.code||'ACTION_FAILED',message:error.message}};}finally{actionBusy=false;if(!disposed)render(lastView);}};
  let lastView = view || {};

  function renderHud(v) {
    const clock = v.clock || {};
    const wallet = v.wallet || {};
    const rev = v.revenueToday;
    const journal = Array.isArray(v.journal) ? v.journal.slice(0, 3) : [];
    const rewards = v.tasksToday && v.tasksToday.rewardTotalToday != null ? v.tasksToday.rewardTotalToday : null;

    const clockNode = el("div", { class: "pc-hud__clock" }, [
      el("span", { class: "pc-hud__day", text: "第 " + numOrDash(clock.day) + " 天 " + (clock.minute != null ? fmtMinute(clock.minute) : "--:--") }),
      el("span", { class: "pc-hud__phase", text: (PHASE_LABEL[clock.phase] || "—") + " · 速度 " + numOrDash(clock.speed, (x) => x + "×") }),
      v.occupancy
        ? el("span", { class: "pc-hud__phase", text: "在场 " + fmtInt(v.occupancy.current) + " 人" + (v.occupancy.max != null ? " / 容量 " + v.occupancy.max : " · 容量暂未提供") })
        : el("span", { class: "pc-hud__phase", text: "在场人数待提供" }),
    ]);

    const moneyNode = el("div", { class: "pc-hud__money" }, [
      el("span", { class: "pc-hud__cash" }, [
        wallet.available != null ? fmtInt(wallet.available) : "—",
        el("small", { text: " 可用现金（游戏币）" }),
      ]),
      el("span", { class: "pc-note" }, [
        wallet.debt > 0 ? "供应商欠款 " + fmtInt(wallet.debt) + "　" : "无欠款　",
        wallet.escrowLiability != null && wallet.escrowLiability > 0 ? "托管 " + fmtInt(wallet.escrowLiability) : "",
      ].join("").trim() || "—"),
    ]);

    const revNode = el("div", { class: "pc-hud__rev" }, [
      el("span", { class: "pc-note", text: "今日营业收入（不含任务奖励）" }),
      rev
        ? el("span", { class: "pc-hud__rev-num", text: fmtInt(rev.total) })
        : el("span", { class: "pc-hud__rev-num", text: "— 待提供" }),
      rev
        ? el("span", { class: "pc-note", text: "密封 " + fmtInt(rev.sealedSales) + " · 单卡 " + fmtInt(rev.secondarySales) + " · 服务 " + fmtInt(rev.serviceIncome) })
        : el("span", { class: "pc-note", text: "聚合字段待后端，不从流水估算充数" }),
      rewards != null
        ? el("span", { class: "pc-chip pc-chip--gold", text: "今日任务奖励 +" + fmtInt(rewards) + "（另计，不混入营业收入）" })
        : null,
    ]);

    const journalNode = el("div", { class: "pc-hud__journal" }, [
      el("span", { class: "pc-hud__journal-title", text: "最近收支（现金与欠款分开记）" }),
      ...journal.map(journalRow),
      journal.length ? null : el("span", { class: "pc-note", text: "暂无流水；进货、销售、桌费与奖励会实时显示。" }),
      btn({ label: "查看完整流水（60 条 · 交互窗口）", intent: "finance.open", onClick: () => act("financeOpen") }),
    ]);

    return el("div", { class: "pc-hud" }, [clockNode, moneyNode, revNode, journalNode]);
  }

  function renderPause(v) {
    const clock = v.clock || {};
    if (clock.running) {
      return el("div", { class: "pc-pause pc-pause--running" }, [
        chip("good", "世界运行中"),
        el("span", { class: "pc-note", text: "打开交互窗口时自动暂停；关闭后按剩余暂停原因恢复。" }),
      ]);
    }
    const reasons = (clock.pauseReasons || []).map((r) => r.label || String(r));
    if(!reasons.length)return el('div',{class:'pc-pause'},[chip('info',clock.phase==='closed'?'已打烊':clock.phase==='closing'?'正在收尾':'等待开门'),note(clock.phase==='closed'?'查看总结后可开始下一天。':clock.phase==='closing'?'营业时间结束，顾客离店和未完牌局继续收尾。':'准备好后开门营业，时间继续推进。')]);
    if (!reasons.length) {
      return el("div", { class: "pc-pause pc-pause--paused" }, [
        chip("info", "已暂停"),
        el("span", { class: "pc-note", text: "暂停原因待提供——不能默认写成“交互暂停”。" }),
      ]);
    }
    const interactive = reasons.filter((r) => r.includes("交互暂停"));
    const others = reasons.filter((r) => !r.includes("交互暂停"));
    const parts = [
      chip("info", "已暂停（" + reasons.length + " 项原因）"),
      el("b", { text: reasons.join("；") }),
    ];
    if (reasons.length === 1 && interactive.length === 1) {
      parts.push(el("span", { class: "pc-note", text: "这是当前唯一暂停原因：关闭该窗口后世界恢复。" }));
    } else if (interactive.length) {
      parts.push(el("span", { class: "pc-note", text: "关闭交互窗口后世界仍暂停，剩余原因：" + others.concat(interactive.length > 1 ? interactive.slice(1) : []).join("；") + "。" }));
    } else {
      parts.push(el("span", { class: "pc-note", text: "与交互窗口无关：解除这些原因前不会恢复。" }));
    }
    parts.push(el("span", { class: "pc-note", text: "暂停期间牌局、顾客耐心与模拟计时冻结。" }));
    return el("div", { class: "pc-pause pc-pause--paused" }, parts);
  }

  function renderCustomers(v) {
    const list = Array.isArray(v.customers) ? v.customers : [];
    const busy = list.length >= BUSY_THRESHOLD;
    const selected = list.find((c) => c.actorId === selectedId) || null;

    const rows = list.map((c) => {
      const tone = ACTIVITY_TONE[c.activity] || "muted";
      const isSelected = c.actorId === selectedId;
      if (busy) {
        return el("button", {
          class: "pc-cust pc-cust--busy" + (isSelected ? " pc-cust--selected" : ""),
          type: "button",
          onclick: () => { selectedId = isSelected ? null : c.actorId; render(lastView); },
        }, [
          avatar(c.name),
          el("span", { class: "pc-cust__name" }, [
            c.name,
            el("span", { class: "pc-dot", style: { background: toneColor(tone) }, title: ACTIVITY_WORDS[c.activity] || c.activity }),
          ]),
          el("span", { class: "pc-note", text: intentWord(c) }),
        ]);
      }
      return el("button", {
        class: "pc-cust" + (isSelected ? " pc-cust--selected" : ""),
        type: "button",
        title: selected_label(c),
        onclick: () => { selectedId = isSelected ? null : c.actorId; render(lastView); },
      }, [
        avatar(c.name),
        el("span", { style: { display: "flex", flexDirection: "column", gap: "2px", minWidth: 0 } }, [
          el("span", { class: "pc-cust__name" }, [
            c.name,
            c.category ? el("span", { class: "pc-note" }, [c.category, ""]) : null,
          ]),
          el("span", { class: "pc-cust__state" }, [
            el("span", { class: "pc-dot", style: { background: toneColor(tone) } }),
            intentWord(c),
          ]),
        ]),
      ]);
    });

    const detail = selected ? el("div", { class: "pc-detail" }, [
      el("div", { class: "pc-card__title" }, [
        avatar(selected.name),
        el("h3", { text: selected.name + (selected.category ? " · " + selected.category : "") }),
        null,
      ]),
      table({
        head: ["项目", "内容"],
        rows: [
          rowTd("当前行为", selected.activity + " · " + (selected.label || "—")),
          rowTd("最相关意图", selected.intent || "意图字段待后端（visit.intent）"),
          rowTd("已等待", selected.waitedSeconds != null ? selected.waitedSeconds + " 秒" + ((lastView.clock || {}).running ? "" : "（暂停冻结）") : "—"),
          rowTd("耐心", selected.patiencePct != null ? selected.patiencePct + "%" : "—"),
          rowTd("今日消费", selected.todaySpend != null ? fmtInt(selected.todaySpend) + " 游戏币" : "—"),
        ],
      }),
      el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" } }, [
        btn({ label: "查看完整档案（交互窗口 · 按规则暂停）", intent: "customer.detail", primary: true, onClick: () => act("customerDetail", selected.actorId) }),
      ]),
    ]) : null;

    return card({
      title: "店内顾客",
      tail: busy ? "繁忙模式（≥10 人）：标签简化为姓名 + 状态色点，点开看详情" : "两行标签：姓名（类别†）+ 一个最相关意图/状态",
      children: [
        rows.length ? el("div", { class: "pc-crowd" }, rows) : pendingBlock(v.clock && v.clock.phase === "preparing" ? "准备期还没有顾客；开门后按节奏到访。" : "当前没有在场顾客。"),
        detail,
        note("人物外观不决定类别、预算或购买偏好。"),
      ],
    });
  }

  function sampleMark() {
    return el("span", { class: "pc-tag-sample", text: "顾客" });
  }
  function rowTd(k, val) {
    return el("tr", {}, [el("td", { text: k }), el("td", { text: val })]);
  }

  function renderExits(v) {
    const exits = v.exits;
    if (exits === null || exits === undefined) {
      return card({
        title: "刚刚离开",
        tail: "进日报统计",
        children: [pendingBlock("离开原因统计待后端（customerExits）；未提供前不显示、不猜测，也不把所有离开说成“满意度低”。")],
      });
    }
    const items = exits.map((x) => {
      const meta = REASON_META[x.reason] || { label: x.reason, tone: "muted" };
      return el("li", {}, [
        el("b", { text: x.actorName }),
        el("span", { class: "t", text: fmtMinute(x.minute) }),
        chip(meta.tone, meta.label),
        x.productRef ? el("span", { class: "pc-note", text: "想要：" + x.productRef }) : null,
        x.feedback ? el("span", { class: "say", text: "“" + x.feedback + "”" }) : null,
      ]);
    });
    return card({
      title: "刚刚离开 · 原因分开记",
      tail: "即时气泡 + 可追溯记录，同口径进日报",
      children: items.length
        ? el("ul", { class: "pc-exits" }, items)
        : pendingBlock("开业以来还没有顾客离店。"),
    });
  }

  function feeLineForSim(sim) {
    if (!sim) return "桌费状态待提供";
    if (sim.feePaid > 0) return "桌费已结 " + fmtInt(sim.feePaid);
    if (sim.serviceDue != null && sim.serviceDue > 0) return "桌费已预留 · 双方各 " + fmtInt(sim.serviceDue) + "（入座预留，完赛结算）";
    return "预留状态待接入（不可当作已付）";
  }

  function renderTables(v) {
    const tables = Array.isArray(v.tables) ? v.tables : [];
    const signs = tables.map((t) => {
      let main = "空闲";
      let sub = t.note || "";
      let cls = "pc-tsign--idle";
      if (t.status === "reserved") { main = "已预约"; cls = "pc-tsign--waiting"; }
      else if (t.status === "waiting") { main = "等待入座"; sub = sub || "已登记未开局"; cls = "pc-tsign--waiting"; }
      else if (t.status === "in-progress") {
        cls = t.simulated ? "pc-tsign--playing" : "pc-tsign--real";
        if (t.simulated) {
          const sim = t.simulation || {};
          main = "模拟中" + (sim.elapsedSeconds != null && sim.durationSeconds != null ? " " + sim.elapsedSeconds + "s / " + sim.durationSeconds + "s" : " · 进度待提供");
          sub = feeLineForSim(sim) + (sim.frozen ? " · 暂停期间计时冻结" : "") + (t.players.length ? " · " + t.players.join(" / ") : "");
        } else if (t.match && t.match.mode === "kof") {
          const p = t.match.progress || {};
          main = "真实局 · KOF 三将接力";
          sub = "我方第 " + numOrDash(p.mine) + " 将 / 对方第 " + numOrDash(p.enemy) + " 将 · 阵亡换将继承手牌，不按小局计分" + (t.match.paused ? " · 暂停冻结中" : "");
        } else if (t.match) {
          main = "真实局 · BO3";
          const awaiting = t.match.status === "awaitingNext";
          sub = (awaiting ? "小局间等待（awaitingNext）" : "第 " + numOrDash(t.match.bout) + " 小局") +
            " · 小局比分 " + numOrDash(t.match.wins) + ":" + numOrDash(t.match.losses) + "（先胜两局）" +
            (t.players.length ? " · " + t.players.join(" / ") : "");
        } else {
          main = "进行中";
          sub = "比赛详情待提供";
        }
      }
      const last = t.lastMatch
        ? el("span", { class: "pc-tsign__sub" }, [
            "上一场：" + (t.lastMatch.simulated ? "模拟局" : "真实局") + " · " + (t.lastMatch.winner==='无胜者'?'本场无胜者':(t.lastMatch.winner||'未知')+' 胜') + " · 桌费" + (t.lastMatch.feeStatus || "已结") + " " + numOrDash(t.lastMatch.feePaid) + " · 桌位已释放"
            + (t.lastMatch.note ? "（" + t.lastMatch.note + "）" : ""),
            el("button", { class: "pc-btn", type: "button", style: { marginLeft: "8px", padding: "2px 10px", minHeight: "26px", fontSize: "12px" }, text: "查看记录", onclick: () => act("tableRecord", t.tableId) }),
          ])
        : null;
      return el("div", { class: "pc-tsign " + cls }, [
        el("div", { class: "pc-tsign__head" }, [
          el("span", { class: "pc-tsign__main", text: t.label + " · " + main }),
          t.status === "in-progress" ? chip(t.simulated ? "muted" : "gold", t.simulated ? "模拟（simulated）" : "真实") : null,
          chip("muted", (t.mode || "").toUpperCase()),
        ]),
        el("span", { class: "pc-tsign__sub", text: sub || "—" }),
        last,
      ]);
    });
    return card({
      title: "牌桌状态",
      tail: "模拟局只显示运行进度与费用；真实局才显示小局/接力",
      children: [
        signs.length ? el("div", { class: "pc-tables" }, signs) : pendingBlock("桌位数据待提供。"),
        note("模拟局不渲染回合、换将与手牌（后台没有这些阶段）；simulatedGames 单独统计，不计为真实引擎实测。桌费预留/已结以 Host 结算为准。"),
      ],
    });
  }

  function render(v) {
    if(disposed)return;
    clear(wrap);
    wrap.append(...[
      renderHud(v),
      renderPause(v),
      el("div", { class: "pc-grid pc-grid--split" }, [
        renderCustomers(v),
        renderExits(v),
      ]),
      renderTables(v),
      lastResult ? actionResult(lastResult) : null,
    ].filter(Boolean));
  }

  render(view || {});
  return {
    update(nextView) {
      lastView = nextView || lastView;
      const still = (lastView.customers || []).some((c) => c.actorId === selectedId);
      if (!still) selectedId = null;
      render(lastView);
    },
    dispose() {
      disposed=true;
      clear(wrap);
      wrap.remove();
    },
  };
}
