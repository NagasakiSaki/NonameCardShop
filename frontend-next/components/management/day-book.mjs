// deliverables/playability-v1/PLAY-C/src/day-book.mjs
// C2 经营手账与收店总结（候选组件）。首屏回答：发生了什么 / 哪里错失生意 / 明天可做什么。
// 三口径阶梯（毛利 / 经营利润 / 现金净变化）分开列示；挂单与未售估值不计收入；建议不自动下单。

import {
  el, clear, chip, kpi, card, note, btn, table, rootWrap,
  fmtInt, fmtSigned, numOrDash, injectStyles, pendingBlock, actionResult, sampleTag,
  REASON_META,
} from "./shared.mjs";
import { BASE_CSS, C2_CSS } from "./styles.mjs";

const STATUS_META = {
  healthy: { label: "健康", tone: "good" },
  low: { label: "偏低", tone: "warn" },
  stockout: { label: "缺货", tone: "bad" },
  risk: { label: "缺货风险", tone: "bad" },
  slow: { label: "滞销 · 观察定价", tone: "muted" },
  inTransit: { label: "在途补充中", tone: "info" },
  unknown: { label: "待提供", tone: "muted" },
};

function numCell(n) {
  return el("td", { class: "num", text: numOrDash(n) });
}

export function mount({ root, view, actions = {}, assets = {} }) {
  injectStyles("base", BASE_CSS);
  injectStyles("c2", C2_CSS);
  const wrap = rootWrap(root, "pc-c2");
  let lastResult = null;
  let confirmingNextDay = false;

  let disposed=false,actionBusy=false;
  const act = async(name,...args)=>{if(disposed||actionBusy)return;actionBusy=true;try{const fn=actions[name];lastResult=typeof fn==='function'?(await fn(...args)||{ok:true}):{ok:false,error:{code:'UNAVAILABLE',message:'此操作暂时不可用。'}};}catch(error){lastResult={ok:false,error:{code:error.code||'ACTION_FAILED',message:error.message}};}finally{actionBusy=false;if(!disposed)render(lastView);}};
  let lastView = view || {};

  function renderPhase(v) {
    const clock = v.clock || {};
    const phase = clock.phase;
    const steps = [
      { key: "preparing", label: "① 准备" },
      { key: "open", label: "② 营业" },
      { key: "closed", label: "③ 打烊 · 总结" },
    ];
    const order = ["preparing", "open", "closed"];
    const nowIdx = Math.max(0, order.indexOf(phase));
    const nodes = [];
    steps.forEach((s, i) => {
      nodes.push(el("span", {
        class: "pc-phase__step" + (i === nowIdx ? " pc-phase__step--now" : i < nowIdx ? " pc-phase__step--done" : ""),
        text: s.label + (i < nowIdx ? " ✓" : ""),
      }));
      if (i < steps.length - 1) nodes.push(el("span", { class: "pc-phase__arrow", text: "→" }));
    });
    let actionNodes = [];
    if (phase === "preparing") {
      actionNodes = [
        btn({ label: "去采购（柜台）", intent: "supplier.open", onClick: () => act("supplierOpen") }),
        btn({ label: "收货 / 上架", intent: "retail.open", onClick: () => act("retailOpen") }),
        btn({ label: "开门营业", intent: "business.open", primary: true, onClick: () => act("businessOpen") }),
      ];
    } else if (phase === "open") {
      actionNodes = [
        btn({ label: "实时流水", intent: "finance.open", onClick: () => act("financeOpen") }),
        btn({ label: "经营面板", intent: "management.open", onClick: () => act("managementOpen") }),
        btn({ label: "打烊结算", intent: "business.close", onClick: () => act("businessClose") }),
      ];
    } else {
      actionNodes = [btn({ label: "查看打烊总结", intent: "report.view", onClick: () => act("reportView") })];
    }
    return el("div", { class: "pc-phase" }, [
      ...nodes,
      el("span", { class: "pc-phase__actions" }, actionNodes),
    ]);
  }

  function renderKpi(v) {
    const s = (v.dayBook && v.dayBook.summary) || {};
    const inv = (v.dayBook && v.dayBook.inventory) || [];
    const risk = inv.filter((r) => r.status === "stockout" || r.status === "risk" || (r.stockouts || 0) > 0).length;
    return el("div", { class: "pc-grid pc-grid--5", style: { marginBottom: "12px" } }, [
      kpi({
        label: "今日经营利润",
        value: s.operatingProfit != null ? fmtSigned(s.operatingProfit) : "—",
        tone: s.operatingProfit == null ? "" : s.operatingProfit >= 0 ? "good" : "bad",
        note: "毛利 − 工资租金（不含任务奖励与采购）",
      }),
      kpi({ label: "毛利", value: s.grossProfit != null ? fmtInt(s.grossProfit) : "—", note: "营业收入 − 已售成本（不扣运营费）" }),
      kpi({
        label: "现金净变化",
        value: s.cashNetChange != null ? fmtSigned(s.cashNetChange) : "—",
        tone: "neutral",
        note: s.cashStart != null ? fmtInt(s.cashStart) + " → " + fmtInt(s.cashEnd) + "（游戏币）" : "口袋视角",
      }),
      kpi({ label: "缺货风险", value: inv.length ? risk + " 项" : "—", tone: risk > 0 ? "bad" : "good", note: inv.length ? "按商品判断，明细见库存表" : "库存数据待提供" }),
      kpi({
        label: "挂单（未实现）",
        value: s.listedUnrealized != null ? fmtInt(s.listedUnrealized) : "—",
        tone: "bad",
        note: "挂单≠收入，不入任何小计",
      }),
    ]);
  }

  function renderAdvice(v) {
    const advice = v.dayBook && v.dayBook.advice;
    if (!advice) {
      const phase = (v.clock || {}).phase;
      return card({
        title: "明早建议",
        kind: "accent",
        children: [pendingBlock(
          phase === "open" ? "营业中暂不给建议；打烊后按全天数据生成（权威算法由主模型实现）。" : "建议数据待提供（restockAdvice 待后端）；未提供前显示本占位，不编造。"
        )],
      });
    }
    return card({
      title: "明早建议",
      tail: "只给一条最优先的；算式可核验，不自动下单",
      kind: "accent",
      children: [
        el("div", { class: "pc-advice" }, [
          el("div", { class: "pc-advice__icon", text: "📦" }),
          el("div", {}, [
            el("h3", { style: { fontSize: "15px" }, text: advice.title }),
            el("div", { class: "pc-advice__why" }, [
              el("div", { text: "判断依据：" + advice.formula }),
              el("div", { text: "依据：" + advice.evidence }),
              el("div", { text: advice.estimatedCost || "" }),
            ]),
            advice.caution ? el("div", { class: "pc-avoid", text: "注意：" + advice.caution }) : null,
            el("div", { class: "pc-advice__actions" },
              (advice.actions || []).map((a) =>
                btn({ label: a.label, intent: a.intent, primary: a.intent === "supplier.basket.add", onClick: () => act("adviceAction", a) })
              ).concat([sampleTag("依据真实经营观察；下单前重新询价")])
            ),
          ]),
        ]),
      ],
    });
  }

  function renderHappened(v) {
    const db = v.dayBook || {};
    const s = db.summary || {};
    const rev = db.revenue;
    const expense = s.operatingExpenses;
    const moneyRows = [
      ["营业收入（密封 + 单卡 + 服务）", s.revenueTotal != null ? fmtInt(s.revenueTotal) : "—", rev && rev.sealedUnits ? rev.sealedUnits + " · " + (rev.serviceNote || "") : ""],
      ["− 已售商品成本", s.costOfGoods != null ? "−" + fmtInt(s.costOfGoods) : "—", ""],
      ["= 毛利（不扣运营费）", s.grossProfit != null ? fmtInt(s.grossProfit) : "—", ""],
      ["− 运营费用（工资 + 租金）", expense ? "−" + fmtInt(expense.total) : "—", expense && expense.wages != null ? "工资 " + fmtInt(expense.wages) + " · 租金 " + fmtInt(expense.rent) : expense && expense.note ? expense.note : ""],
      ["= 经营利润", s.operatingProfit != null ? fmtSigned(s.operatingProfit) : "—", "任务奖励与采购不计入"],
      ["采购现金净支出（另计授信）", s.procurementCash != null ? "−" + fmtInt(s.procurementCash) : "—", s.procurementCredit ? "另有授信 " + fmtInt(s.procurementCredit) + " 记欠款，不是现金支出" : ""],
      ["任务奖励（自动到账，另计）", s.taskRewardTotal != null ? "+" + fmtInt(s.taskRewardTotal) : "—", s.taskRewardSplit ? "现金 +" + fmtInt(s.taskRewardSplit.cash) + " · 抵欠款 " + fmtInt(s.taskRewardSplit.debtOffset) : "先抵欠款，不计营业利润" ],
      ["欠款变化", s.debtStart != null ? (s.debtEnd - s.debtStart === 0 ? "0（" + fmtInt(s.debtStart) + " → " + fmtInt(s.debtEnd) + "）" : fmtSigned(s.debtEnd - s.debtStart) + "（" + fmtInt(s.debtStart) + " → " + fmtInt(s.debtEnd) + "）") : "—", "供应商授信欠款"],
      ["未售估值 / 挂单（不计收入）", s.unsoldValuation != null ? fmtInt(s.unsoldValuation) + " / " + numOrDash(s.listedUnrealized) : "—", "库存是资产，不是今天的钱"],
    ];
    const moneyTable = table({
      head: ["口径分层（游戏币）", "金额", "备注"],
      rows: moneyRows.map(([k, val, remark]) => el("tr", {}, [
        el("td", { text: k }),
        el("td", { class: "num", text: val }),
        el("td", { class: "pc-note", text: remark || "" }),
      ])),
    });

    const visits = db.visits;
    let visitsNode;
    if (!visits) {
      visitsNode = pendingBlock("访问统计待提供（customerExits / 访问口径聚合待后端）；未提供前不显示成交率。");
    } else {
      const maxCount = Math.max(1, ...(visits.exits || []).map((x) => x.count));
      const bars = (visits.exits || []).map((x) => {
        const meta = REASON_META[x.reason] || { label: x.reason, color: "var(--pc-muted)" };
        return el("div", { class: "pc-reason-row" }, [
          el("span", { text: meta.label }),
          el("span", { class: "bar" }, [el("i", { style: { width: Math.round((x.count / maxCount) * 100) + "%", background: meta.color } })]),
          el("span", { class: "count", text: fmtInt(x.count) }),
        ]);
      });
      const stockEvents = (visits.stockoutEvents || []).map((e2) => e2.product + " " + e2.count + " 次").join("、");
      visitsNode = el("div", {}, [
        el("div", { class: "pc-grid pc-grid--3", style: { marginBottom: "8px" } }, [
          kpi({ label: "进店（人次）", value: fmtInt(visits.visits), note: visits.inStore ? "在店 " + visits.inStore + " 人，访问未结束不计未成交" : "全天口径" }),
          kpi({ label: "成交（人）", value: fmtInt(visits.sold), note: "按访问人次口径" }),
          kpi({ label: "未成交（人）", value: fmtInt(visits.unsold), note: "每次访问唯一主因；服务、拾牌与技术中断单列" }),
        ]),
        visits.exits && visits.exits.length ? el("div", {}, bars) : note(visits.inStore ? "已离店顾客均正常离开（成交后离店不算流失）。" : "今日没有未成交离店。"),
        stockEvents ? note("缺货按商品计次：" + stockEvents + "；与按人计的未成交分母不同，不能混用。") : null,
        note(visits.note || ""),
      ]);
    }

    return el("div", { class: "pc-grid pc-grid--split2" }, [
      card({ title: "钱怎么分层", tail: "三口径阶梯，不混算", children: [moneyTable, s.creditNote ? note(s.creditNote) : null] }),
      card({ title: "人怎么算", tail: "访问口径", children: [visitsNode] }),
    ]);
  }

  function renderInventory(v) {
    const inv = (v.dayBook && v.dayBook.inventory) || [];
    if (!inv.length) {
      return card({
        title: "库存健康",
        tail: "在库 / 在架 / 在途 · 强度档来自 Host",
        children: [pendingBlock("暂无商品数据；准备期先到柜台采购首批散包。")],
      });
    }
    const rows = inv.map((r) => {
      const meta = STATUS_META[r.status] || STATUS_META.unknown;
      return el("tr", { class: r.status === "stockout" || r.status === "risk" ? "pc-row--bad" : r.status === "low" || r.status === "slow" ? "pc-row--warn" : "" }, [
        el("td", { text: r.name }),
        numCell(r.warehouse),
        numCell(r.onShelf),
        numCell(r.inTransit),
        numCell(r.recentSales3d),
        numCell(r.stockouts),
        el("td", { text: r.averageStrength != null && r.priceTier ? "S" + r.averageStrength + " · " + r.priceTier : "—" }),
        numCell(r.unitAmount),
        el("td", {}, [chip(meta.tone, meta.label)]),
      ]);
    });
    return card({
      title: "库存健康",
      tail: "数量按包/盒分别计件；销量与缺货来自实际记录",
      children: [
        table({
          head: ["商品", { text: "在库", class: "num" }, { text: "在架", class: "num" }, { text: "在途", class: "num" }, { text: "今日销量", class: "num" }, { text: "缺货次数", class: "num" }, "强度 / 档位", { text: "进价", class: "num" }, "判断"],
          rows,
        }),
        note("0 = 确认为零；“—” = 未提供。强度为主题卡池平均分，档位与进价来自 Host 报价，不按包名手填价；已有库存与订单保持冻结成本。"),
      ],
    });
  }

  function renderTasks(v) {
    const t = v.tasksToday;
    if (!t || !Array.isArray(t.rows)) return null;
    const rows = t.rows.map((r) => el("tr", {}, [
      el("td", { text: r.title + (r.scope === "starter" ? "（一次性）" : "") }),
      el("td", { class: "pc-note", text: r.goalLabel || "" }),
      el("td", { class: "num", text: fmtInt(r.reward) }),
      el("td", { text: r.completed ? (r.claimed === false ? "已完成 · 待入账（异常，应自动）" : "已完成 · 已自动到账") : "进行中 " + fmtInt(r.progress) + "/" + fmtInt(r.goal) }),
    ]));
    return card({
      title: "今日任务 · 自动领奖",
      tail: "满足即在事务内自动发奖，无领取按钮",
      children: [
        table({ head: ["任务", "条件", { text: "奖励", class: "num" }, "状态"], rows }),
        note(
          (t.rewardTotalToday != null ? "今日已自动入账 " + fmtInt(t.rewardTotalToday) + "（游戏币）；" : "今日入账合计待提供；") +
          "奖励不计商品营业利润，到账先抵供应商欠款；一次性引导奖励与每日奖励分别入账、已领过不补差。"
        ),
      ],
    });
  }

  function renderUpgrades(v) {
    const ups = (v.dayBook && v.dayBook.upgrades) || [];
    if (!ups.length) return null;
    const nodes = ups.map((u) => el("div", { class: "pc-upg" + (u.planned ? " pc-upg--planned" : "") }, [
      el("div", { class: "pc-upg__head" }, [
        u.name,
        chip(u.planned ? "muted" : "good", u.planned ? "方案（未实现）" : "已实现 Lv" + u.level),
        !u.planned && u.dailyCost ? chip("warn", "日维护 " + fmtInt(u.dailyCost)) : null,
      ]),
      note("解决：" + u.solvedProblem),
      note("效果：" + u.effect),
      !u.planned
        ? el("div", { style: { marginTop: "6px" } }, [btn({ label: "查看升级（经营面板）", intent: "management.open", onClick: () => act("managementOpen") })])
        : note("按钮不提供购买——未实现的升级不能装成现在可买。"),
    ]));
    return card({ title: "升级：先说解决什么问题", tail: "只显示真实已实现效果；方案明确标注", children: nodes });
  }

  function renderNextDay(v) {
    const db = v.dayBook || {};
    const prep = db.nextDayPrep;
    const phase = (v.clock || {}).phase;
    if (phase !== "closed") {
      return card({
        title: "次日准备",
        kind: "info",
        children: [note(phase === "preparing" ? "打烊后这里会汇总：在途订单、可上架库存、缺货风险与一条建议。" : "打烊后生成次日准备清单；营业中可先看库存健康表。")],
      });
    }
    if (!prep) return null;
    const items = (prep.items || []).map((it) => el("div", { class: "pc-prep__item" }, [
      el("div", { class: "pc-prep__body" }, [
        el("b", { text: it.label }),
        el("div", { class: "d", text: it.detail }),
      ]),
      el("div", { class: "pc-prep__side" }, [
        it.intent ? btn({ label: "快捷查看", intent: it.intent, onClick: () => act("nextDayIntent", it) }) : null,
        it.standNote ? chip("muted", "站位：" + it.standNote) : null,
      ]),
    ]));
    const confirmBox = confirmingNextDay
      ? el("div", { class: "pc-confirm" }, [
          el("b", { text: "确认开始下一天？" }),
          note("垃圾桶会被清空；未售卡与托管资金按规则结转。结算由 Host 执行，本组件只发起意图。"),
          el("div", { class: "pc-confirm__btns" }, [
            btn({ label: "确认开始下一天", intent: "business.nextDay", primary: true, onClick: () => { confirmingNextDay = false; act("businessNextDay"); } }),
            btn({ label: "取消", onClick: () => { confirmingNextDay = false; render(lastView); } }),
          ]),
        ])
      : el("div", {}, [btn({ label: "开始下一天", intent: "business.nextDay", primary: true, onClick: () => { confirmingNextDay = true; render(lastView); } })]);
    return card({
      title: "次日准备",
      tail: "快捷入口只做查看与寻路；操作仍需到对应站位",
      kind: "accent",
      children: [
        el("div", { class: "pc-prep" }, items),
        note(prep.note || ""),
        confirmBox,
      ],
    });
  }

  function renderJournalDetail(v) {
    const phase = (v.clock || {}).phase;
    if (phase !== "closed" || !Array.isArray(v.journal) || !v.journal.length) return null;
    return el("details", { class: "pc-dev" }, [
      el("summary", { text: "展开：全天收支流水（" + v.journal.length + " 条，现金与欠款两列）" }),
      table({
        head: ["时间", "事项", { text: "现金增减", class: "num" }, { text: "欠款增减", class: "num" }, { text: "余额", class: "num" }, { text: "欠款余额", class: "num" }],
        rows: v.journal.map((e) => el("tr", {}, [
          el("td", { text: String(Math.floor(e.minute / 60)).padStart(2, "0") + ":" + String(e.minute % 60).padStart(2, "0") }),
          el("td", { text: e.label }),
          el("td", { class: "num", text: e.amount === 0 ? "—" : fmtSigned(e.amount) }),
          el("td", { class: "num", text: !e.debtDelta ? "—" : fmtSigned(e.debtDelta) }),
          el("td", { class: "num", text: fmtInt(e.balance) }),
          el("td", { class: "num", text: fmtInt(e.debt) }),
        ])),
      }),
    ]);
  }

  function render(v) {
    if(disposed)return;
    clear(wrap);
    const phase = (v.clock || {}).phase;
    wrap.append(...[
      el("div", { class: "pc-top" }, [
        el("h2", { style: { margin: "0 0 10px", fontSize: "18px" }, text: "经营手账 · 第 " + numOrDash((v.clock || {}).day) + " 天" + (phase === "closed" ? "（打烊总结）" : phase === "open" ? "（营业中 · 实时）" : "（准备期）") }),
      ]),
      renderPhase(v),
      renderKpi(v),
      renderAdvice(v),
      renderHappened(v),
      renderInventory(v),
      renderTasks(v),
      renderUpgrades(v),
      renderNextDay(v),
      renderJournalDetail(v),
      lastResult ? actionResult(lastResult) : null,
    ].filter(Boolean));
  }

  render(view || {});
  return {
    update(nextView) {
      lastView = nextView || lastView;
      render(lastView);
    },
    dispose() {
      disposed=true;
      clear(wrap);
      wrap.remove();
    },
  };
}
