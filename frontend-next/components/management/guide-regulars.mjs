// deliverables/playability-v1/PLAY-C/src/guide-regulars.mjs
// C3 前三日引导、熟客与本店故事（候选组件）。
// 只渲染 view：引导步骤/触发条件由主模型数据驱动；故事只显示真实事件填充的模板，
// 事实 / 趋势推断 / 建议三层分开；未发生的事件不生成“新闻”。

import {
  el, clear, chip, card, note, btn, rootWrap,
  fmtInt, numOrDash, injectStyles, pendingBlock, actionResult, sampleTag,
} from "./shared.mjs";
import { BASE_CSS, C3_CSS } from "./styles.mjs";

const NEED_STATUS = {
  waiting: { label: "等待回应", tone: "warn" },
  satisfied: { label: "已满足", tone: "good" },
  expired: { label: "已过期（不影响后续到访）", tone: "muted" },
  none: { label: "暂无诉求", tone: "muted" },
};

export function mount({ root, view, actions = {}, assets = {} }) {
  injectStyles("base", BASE_CSS);
  injectStyles("c3", C3_CSS);
  const wrap = rootWrap(root, "pc-c3");
  let lastResult = null;
  let lastView = view || {};

  let disposed=false,actionBusy=false;
  const act = async(name,...args)=>{if(disposed||actionBusy)return;actionBusy=true;try{const fn=actions[name];lastResult=typeof fn==='function'?(await fn(...args)||{ok:true}):{ok:false,error:{code:'UNAVAILABLE',message:'此操作暂时不可用。'}};}catch(error){lastResult={ok:false,error:{code:error.code||'ACTION_FAILED',message:error.message}};}finally{actionBusy=false;if(!disposed)render(lastView);}};
  function renderHeader(g, v) {
    if (!g || !g.enabled) {
      return el("div", { class: "pc-guide-top" }, [
        el("span", { class: "pc-guide-day", text: "前三日引导" }),
        chip("good", g && g.skipped ? "已跳过 · 所有功能照常可用" : "已完成"),
        el("span", { class: "pc-guide-goal", text: (g && g.disabledNote) || "日常目标见任务页与经营手账。" }),
      ]);
    }
    return el("div", { class: "pc-guide-top" }, [
      el("span", { class: "pc-guide-day", text: "前三日引导 · 第 " + g.day + " 天" }),
      chip("gold", "可跳过"),
      el("span", { class: "pc-guide-goal", text: "今日目标：" + (g.dayGoals || {})["day" + g.day] }),
      el("span", { style: { marginLeft: "auto" } }, [
        btn({ label: "跳过引导（功能不受影响）", intent: "guide.skip", onClick: () => act("guideSkip") }),
      ]),
    ]);
  }

  function renderSteps(g) {
    if (!g || !g.enabled) {
      return card({
        title: "引导步骤",
        children: [note("引导已结束。回顾三天目标：① 备货卖出第一件并做拆包取舍 → ② 回应熟客需求 → ③ 可选店内小活动。这些事后都成为日常经营循环的一部分。")],
      });
    }
    const steps = g.steps || [];
    const nodes = steps.map((s) => {
      const stateCls = s.state === "active" ? "pc-step--active" : s.state === "done" ? "pc-step--done" : "pc-step--upcoming";
      const mark = s.state === "done" ? "✓ " : s.state === "active" ? "▶ " : "· ";
      const dayTag = el("span", { class: "pc-chip pc-chip--muted", text: "第 " + s.day + " 天" });
      const choices = (s.state === "active" && s.choices && s.choices.length)
        ? el("div", { class: "pc-step__choices" },
            s.choices.map((c) => el("span", { class: "pc-choice" }, [
              btn({ label: c.label, intent: c.intent, primary: s.choices[0] && c.id === s.choices[0].id, onClick: () => act("guideChoice", s.id, c.id) }),
              el("small", { text: c.note || "" }),
            ]))
          )
        : null;
      return el("div", { class: "pc-step " + stateCls }, [
        el("div", { class: "pc-step__head" }, [mark + s.title, dayTag, s.state === "done" ? chip("good", "已完成") : s.state === "active" ? chip("gold", "当前") : chip("muted", "未开始")]),
        s.state === "upcoming" ? null : el("div", { class: "pc-step__body", text: s.body }),
        el("div", { class: "pc-step__trigger", text: "触发：" + (s.trigger || "条件尚未提供") }),
        choices,
      ]);
    });
    return card({
      title: "引导步骤",
      tail: "只引导必要操作；已有功能始终可达，不锁步骤",
      children: nodes.length ? nodes : pendingBlock("当前没有进行中的引导步骤。"),
    });
  }

  function renderRegulars(g) {
    const regs = (g && g.regulars) || [];
    if (!regs.length) {
      return card({
        title: "熟客",
        children: [note("第一天结束、产生回访后解锁熟客愿望；愿望由需求决定，不由角色外观或原作人设决定。")],
      });
    }
    const nodes = regs.map((r) => {
      const meta = NEED_STATUS[r.status] || NEED_STATUS.none;
      const need = r.need;
      const needBlock = need
        ? el("div", { class: "pc-reg__need" }, [
            el("b", { text: "诉求：" + need.title }),
            el("div", { class: "meta", text: "预算 " + fmtInt(need.budget) + " 游戏币 · 第 " + need.expiresDay + " 天前 · " + (need.kind === "find-card" ? "找卡转手" : need.kind === "deck-part" ? "配套牌" : need.kind) }),
          ])
        : r.satisfyNote
          ? el("div", { class: "pc-reg__need", style: { borderLeftColor: "var(--pc-green)" } }, [el("b", { text: r.satisfyNote })])
          : null;
      const story = (r.story || []).length
        ? el("div", { class: "pc-reg__story", text: "本店相关：" + r.story.map((x) => "第 " + x.day + " 天 " + x.text).join("；") })
        : null;
      return el("div", { class: "pc-reg" }, [
        el("div", { class: "pc-reg__head" }, [
          el("b", { text: r.name }),
          r.category ? el("span", { class: "pc-note" }, [r.category, ""]) : chip("muted", "顾客"),
          chip(meta.tone, meta.label),
          el("span", { class: "pc-note", style: { marginLeft: "auto" }, text: r.relationLabel || "" }),
        ]),
        el("div",{class:"pc-actions"},[btn({label:"和熟客聊聊",intent:"regular.talk",onClick:()=>act("regularTalk",r.personId)})]),
        needBlock,
        story,
        need && r.status === "waiting"
          ? el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" } }, [
              btn({ label: "去二级市场找卡", intent: "trading.open", onClick: () => act("tradingOpen") }),
              btn({ label: "查看档案", intent: "customer.detail", onClick: () => act("customerDetail", r.personId) }),
            ])
          : null,
      ]);
    });
    return card({
      title: "熟客愿望",
      tail: "少量可记住的熟客 · 不批量堆砌对话",
      children: [
        ...nodes,
        note("† 类别与消费能力不由外观决定（bd-* 皮肤不表达贫富）；愿望过期只是错过这次机会，不惩罚后续到访。"),
      ],
    });
  }

  function renderEvent(g) {
    const ev = g && g.event;
    if (!ev) {
      return card({
        title: "店内活动",
        children: [note("第三天营业开始后出现可选的小型店内活动；办不办都不影响开店与已有功能。")],
      });
    }
    const statusChip = ev.status === "ready" ? chip("good", "条件满足 · 可安排") : ev.status === "insufficient" ? chip("warn", "尚需准备") : chip("muted", ev.statusLabel||"未开始");
    const reqs = (ev.requirements || []).map((r) => el("div", { class: "pc-req " + (r.ok ? "pc-req--ok" : "pc-req--no") }, [
      el("span", { class: "mark", text: r.ok ? "✓" : "✗" }),
      el("span", {}, [el("span", { text: r.label }), el("div", { class: "d", text: r.detail || "" })]),
    ]));
    return card({
      title: "店内活动",
      tail: "可选 · 不强制参加，不要求玩家亲自下场",
      kind: ev.status === "ready" ? "accent" : "",
      children: [
        el("div", { class: "pc-card__title" }, [el("h3", { text: ev.title }), statusChip]),
        el("div", { class: "pc-step__body", text: ev.body }),
        el("div", { style: { marginTop: "8px" } }, reqs),
        ev.fallback ? el("div", { class: "pc-avoid", text: ev.fallback }) : null,
        el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap", marginTop: "8px" } }, [
          ev.status === "ready"
            ? btn({ label: "安排交流会", intent: ev.intent || "battle-room.open", primary: true, onClick: () => act("eventIntent", ev) })
            : btn({ label: "查看要求明细", intent: ev.intent || "event.detail", onClick: () => act("eventIntent", ev) }),
        ]),
      ],
    });
  }

  function renderStories(g) {
    const st = g && g.stories;
    if (!st) {
      return card({
        title: "本店故事",
        tail: "只讲真实发生过的事",
        children: [pendingBlock("本周暂无新故事——未发生可记录的事件时显示本占位，不生成“新闻”。")],
      });
    }
    const facts = (st.facts || []).map((f) => el("div", { class: "pc-story-fact" }, [
      el("div", { text: f.text }),
      el("div", { class: "pc-story-meta", text: "第 " + f.day + " 天 · 依据：" + f.evidence + "" }),
    ]));
    const trends = (st.trends || []).map((t) => el("div", { class: "pc-story-trend" }, [
      el("div", {}, [chip("info", "趋势推断"), el("span", { style: { marginLeft: "6px" }, text: t.text })]),
      el("div", { class: "pc-story-meta", text: "依据：" + t.basis }),
    ]));
    const sugs = (st.suggestions || []).map((x) => el("div", { class: "pc-story-sug" }, [
      el("div", {}, [chip("gold", "建议"), el("span", { style: { marginLeft: "6px" }, text: x.text })]),
      el("div", { class: "pc-story-meta", text: "依据：" + x.basis }),
    ]));
    return card({
      title: "本店故事",
      tail: "事实 → 趋势推断 → 建议，三层分开",
      children: [
        ...facts,
        ...(trends.length ? [el("div", { style: { height: "6px" } }), ...trends] : []),
        ...(sugs.length ? [el("div", { style: { height: "6px" } }), ...sugs] : []),
        note("故事由真实事件填充模板生成；没有事件就没有故事，不预写假新闻。"),
      ],
    });
  }

  function render(v) {
    if(disposed)return;
    const g = v.guide || {};
    clear(wrap);
    wrap.append(...[
      renderHeader(g, v),
      renderSteps(g),
      renderRegulars(g),
      renderEvent(g),
      renderStories(g),
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
