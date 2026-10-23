// frontend/ui/card-detail.mjs — 卡牌详情：印刷稀有度与当前全局分级并列、技能延迟加载源码、持仓与准入原因。
import { el, clear, stateView, errorView, imgWithFallback, busyButton, newRequestId } from "./components.mjs";

const REVIEW_LABEL = {
  calibrated: "已校准",
  estimated: "初估（样本不足）",
  "needs-review": "待复核",
};

export async function openCardDetail(app, options = {}) {
  const cardKey = options.cardKey;

  return app.windows.open({
    id: "card-detail:" + cardKey,
    title: "卡牌详情",
    subtitle: "印刷稀有度与当前分级分开显示，不互相覆盖",
    pauseReason: "查看卡牌详情",
    render: async (ctx) => {
      const body = ctx.body;
      body.append(stateView({ kind: "loading", title: "正在读取卡牌…" }));
      const result = await ctx.query("catalog.detail", { cardKey });
      clear(body);
      if (!result.ok) {
        body.append(errorView(result.error, () => ctx.refresh()));
        return;
      }
      const card = result.data;

      const head = el("div", { class: "grid-2" }, [
        el("div", { style: { display: "grid", gap: "8px", justifyItems: "start" } }, [
          imgWithFallback(card.imageUrl, card.name, "card-tile__img"),
          el("p", { class: "small muted", text: "卡图为原武将图，只读引用；与场景像素角色是两种表现。" }),
        ]),
        el("div", { class: "section" }, [
          el("h3", { class: "window__title", text: card.name }),
          el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, [
            el("span", { class: "chip", text: card.faction || "—" }),
            el("span", { class: "chip", text: card.pack || "—" }),
            el("span", { class: "chip", text: "技能版本 " + card.skillVersion }),
            el("span", { class: "chip rarity rarity--" + card.printedRarity, text: "印刷 " + card.printedRarity }),
            el("span", { class: "chip rarity rarity--" + card.currentRarity, text: "当前 " + card.currentRarity }),
          ]),
          el("div", { class: "stat-row" }, [
            el("span", { class: "stat-row__label", text: "全局综合分" }),
            el("span", { class: "stat-row__value", text: (card.globalScore == null ? "—" : card.globalScore) + " · " + (REVIEW_LABEL[card.reviewStatus] || card.reviewStatus) }),
          ]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "评分版本" }), el("span", { class: "stat-row__value mono", text: card.ratingVersion })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "参考价（后端）" }), el("span", { class: "stat-row__value", text: app.formatMoney(card.referencePrice ? card.referencePrice.amount : 0) })]),
          el("p", { class: "small muted", text: "分数不是胜率；" + (card.stats && !card.stats.sampleSufficient ? "实战样本不足，仅作参考。" : "样本已记录。") }),
        ]),
      ]);
      body.append(head);

      // 技能
      const skillSection = el("div", { class: "section" }, [el("h4", { class: "section__title", text: "技能" })]);
      const sourceToggle = el("button", { class: "btn btn--sm", type: "button", text: "查看技能源码" });
      const sourceBox = el("pre", {
        class: "small",
        style: { display: "none", whiteSpace: "pre-wrap", background: "rgba(0,0,0,0.32)", padding: "10px", borderRadius: "6px", border: "1px solid rgba(255,255,255,0.1)" },
      });
      sourceToggle.addEventListener("click", async () => {
        if (sourceBox.style.display !== "none") {
          sourceBox.style.display = "none";
          sourceToggle.textContent = "查看技能源码";
          return;
        }
        const restore = busyButton(sourceToggle, "读取中…");
        const withCode = await ctx.query("catalog.detail", { cardKey, includeCode: true });
        restore();
        sourceBuffer = withCode;
        if (!withCode.ok) {
          sourceBox.textContent = "源码读取失败：" + withCode.error.message;
        } else {
          const codes = (withCode.data.skills || []).filter((skill) => skill.code);
          sourceBox.textContent = codes.length
            ? codes.map((skill) => "// " + skill.name + "\n" + skill.code).join("\n\n")
            : "演示模式未提供技能源码；正式 Host 在 catalog.detail 里按 includeCode 返回。";
        }
        sourceBox.style.display = "block";
        sourceToggle.textContent = "收起技能源码";
      });
      let sourceBuffer = null;
      for (const skill of card.skills || []) {
        skillSection.append(el("div", { class: "note-card" }, [
          el("p", { class: "note-card__title", text: skill.name }),
          el("p", { class: "small", text: skill.description }),
        ]));
      }
      skillSection.append(sourceToggle, sourceBox);
      body.append(skillSection);

      // 持有 / 准入
      body.append(el("div", { class: "grid-2" }, [
        el("div", { class: "section" }, [
          el("h4", { class: "section__title", text: "持有情况" }),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "拥有" }), el("span", { class: "stat-row__value", text: String(card.holdings.owned) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "可交易" }), el("span", { class: "stat-row__value", text: String(card.holdings.available) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "保护中" }), el("span", { class: "stat-row__value", text: String(card.holdings.protected) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "在售" }), el("span", { class: "stat-row__value", text: String(card.holdings.listed) })]),
        ]),
        el("div", { class: "section" }, [
          el("h4", { class: "section__title", text: "市场与参赛资格" }),
          card.marketEligibility.eligible
            ? el("p", { class: "small", text: "可以进入二级市场。" })
            : el("div", { class: "small" }, card.marketEligibility.reasons.map((reason) => el("p", { class: "badge badge--warn", text: reason.code + " · " + reason.message }))),
          el("p", { class: "small muted", text: "参战准入只看当前流通与持有，不显示“单挑专用卡池”。" }),
        ]),
      ]));

      // 战绩
      const stats = card.stats || {};
      const statBlock = el("div", { class: "section" }, [
        el("h4", { class: "section__title", text: "战绩与样本" }),
        el("table", { class: "data-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", { text: "模式" }), el("th", { class: "num", text: "场次" }), el("th", { class: "num", text: "胜" }), el("th", { class: "num", text: "负" }), el("th", { class: "num", text: "平" })])]),
          el("tbody", {}, ["kof", "bo3"].map((mode) => {
            const row = stats[mode] || { sessions: 0, wins: 0, losses: 0, draws: 0 };
            return el("tr", {}, [
              el("td", { text: mode === "kof" ? "KOF" : "BO3" }),
              el("td", { class: "num", text: String(row.sessions) }),
              el("td", { class: "num", text: String(row.wins) }),
              el("td", { class: "num", text: String(row.losses) }),
              el("td", { class: "num", text: String(row.draws) }),
            ]);
          })),
        ]),
        el("p", { class: "small muted", text: stats.note || "实战样本不足" }),
      ]);
      body.append(statBlock);
      if(card.copies?.length){body.append(el('div',{class:'section'},[el('h4',{text:'实物副本'}),...card.copies.map(copy=>el('div',{class:'note-card'},[
        el('p',{class:'small',text:`${copy.printedRarity} · ${copy.printVersion} · ${copy.location}${copy.locked?' · 已占用':''}`}),
        el('button',{class:'btn btn--sm',text:copy.protected?'取消保护':'保护这张',disabled:copy.locked,onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('protect'),type:'inventory.setProtection',payload:{inventoryRef:copy.inventoryRef,protected:!copy.protected}});if(!r.ok)app.toast('error',r.error.code,r.error.message);else ctx.refresh();}}),
        el('button',{class:'btn btn--sm',text:'在二级市场出售这张',disabled:!copy.available,onclick:()=>{ctx.handle.close();app.openPanel('market',{tab:'sell',inventoryRef:copy.inventoryRef});}}),
        el('button',{class:'btn btn--sm',text:'到垃圾桶处理',onclick:()=>{app.goToInteraction('store.trash');}})
      ]))]));}

      ctx.setFooter([
        el("button", {
          class: "btn", type: "button", text: "去二级市场",
          onclick: () => app.goToInteraction('store.secondaryMarket'),
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
