// frontend/ui/secondary-market.mjs — 二级市场：买卡 / 我的出售 / 收购报价 / 行情记录。
import { el, clear, stateView, errorView, imgWithFallback, newRequestId, busyButton, debounce, rowsOf } from "./components.mjs";

const TABS = [
  { id: "buy", label: "买卡" },
  { id: "mine", label: "我的出售" },
  { id: "bids", label: "收购报价" },
  { id: "history", label: "行情记录" },
];

export async function openMarket(app, options = {}) {
  const state = { tab: options.tab || "buy", search: "", rarity: "" };

  return app.windows.open({
    id: "market",
    title: "二级市场",
    subtitle: "挂单不等于成交；单价、手续费与净额以 Host 报价为准",
    width: "window--wide",
    pauseReason: "二级市场",
    render: async (ctx) => {
      const body = ctx.body;
      const tabs = el("div", { class: "tabs" }, TABS.map((tab) => el("button", {
        class: "tab", type: "button", text: tab.label,
        "aria-selected": String(state.tab === tab.id),
        onclick: () => { state.tab = tab.id; ctx.refresh(); },
      })));
      const content = el("div", { class: "section" });
      body.append(tabs, content);

      if (state.tab === "buy") await renderBuy(content);
      else if (state.tab === "mine") await renderMine(content);
      else if (state.tab === "bids") await renderBids(content);
      else await renderHistory(content);

      async function renderBuy(node) {
        node.append(el("div", { class: "toolbar" }, [
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "搜索" }),
            el("input", {
              class: "input", type: "search", placeholder: "武将名",
              oninput: debounce((event) => { state.search = event.target.value.trim(); ctx.refresh(); }, 260),
            }),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "稀有度" }),
            el("select", {
              class: "select",
              onchange: (event) => { state.rarity = event.target.value; ctx.refresh(); },
            }, [el("option", { value: "", text: "全部" }), ...["N", "R", "SR", "SSR"].map((r) => el("option", { value: r, text: r }))]),
          ]),
        ]));
        const loading = stateView({ kind: "loading", title: "正在读取挂单…" });
        node.append(loading);
        const result = await ctx.query("market.list", { tab: "buy", search: state.search || undefined, rarity: state.rarity || undefined });
        loading.remove();
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        const buyRows = rowsOf(result.data);
        if (!buyRows.length) {
          node.append(stateView({ kind: "empty", title: "盘口是空的", body: result.data.note || "没有真实买家时挂单会保持未成交。" }));
          return;
        }
        node.append(el("table", { class: "data-table" }, [
          el("thead", {}, [el("tr", {}, [
            el("th", { text: "卡牌" }), el("th", { text: "来源" }), el("th", { text: "需求" }),
            el("th", { class: "num", text: "单价" }), el("th", { class: "num", text: "可买" }), el("th", { text: "" }),
          ])]),
          el("tbody", {}, buyRows.map((listing) => el("tr", {}, [
            el("td", {}, [el("span", { class: "rarity rarity--" + listing.rarity, text: listing.rarity + " " }), listing.name]),
            el("td", {}, [
              el("span", { class: listing.sellerType === "shop" ? "chip chip--ok" : "chip", text: listing.sellerType === "shop" ? "自营" : "寄售" }),
              listing.sellerName ? el("span", { class: "small muted", text: " " + listing.sellerName }) : null,
            ]),
            el("td", {}, [listing.demand ? el("span", { class: "chip", text: listing.demand }) : el("span", { class: "muted small", text: "—" })]),
            el("td", { class: "num", text: app.formatMoney(listing.unitAmount) }),
            el("td", { class: "num", text: String(listing.quantity) }),
            el("td", {}, [
              el("button", {
                class: "btn btn--sm btn--ghost", type: "button", text: "价格详情",
                style: { marginRight: "4px" },
                onclick: (event) => {
                  const row = event.currentTarget.closest("tr");
                  const next = row.nextElementSibling;
                  if (next && next.classList.contains("price-detail")) {
                    next.remove();
                    return;
                  }
                  row.after(buildPriceDetail(listing));
                },
              }),
              el("button", {
                class: "btn btn--sm", type: "button", text: listing.sellerType === "shop" ? "下架" : "买入",
                onclick: async (event) => {
                  if (listing.sellerType === "shop") {
                    const restore = busyButton(event.currentTarget, "处理中…");
                    const response = await ctx.submit({ requestId: newRequestId("cancel"), type: "market.cancelListing", payload: { listingId: listing.listingId } });
                    restore();
                    if (!response.ok) app.toast("error", response.error.code, response.error.message);
                    else {
                      app.toast("ok", "已撤单", "卡牌回到可交易库存");
                      ctx.refresh();
                    }
                    return;
                  }
                  const restore = busyButton(event.currentTarget, "询价中…");
                  const quote = await ctx.query("market.quote", { listingId: listing.listingId, quantity: 1, direction: "buy" });
                  restore();
                  if (!quote.ok) {
                    node.append(errorView(quote.error, null));
                    return;
                  }
                  const q = quote.data;
                  const old = node.querySelector(".quote-box");
                  if (old) old.remove();
                  const box = el("div", { class: "note-card quote-box", style: { borderColor: "rgba(232,182,74,0.5)" } }, [
                    el("p", { class: "note-card__title", text: "买入报价 · " + listing.name }),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "单价" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.unitAmount) })]),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "手续费" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.feeAmount) })]),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "应付合计" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.totalDebit) })]),
                    el("p", { class: "small muted", text: q.explanation.join(" · ") }),
                    el("button", {
                      class: "btn btn--primary", type: "button", text: "确认买入",
                      onclick: async (event2) => {
                        const restore2 = busyButton(event2.currentTarget, "成交中…");
                        const response = await ctx.submit({ requestId: newRequestId("trade"), type: "market.acceptTrade", quoteId: q.quoteId, payload: { listingId: listing.listingId, quantity: 1 } });
                        restore2();
                        if (!response.ok) {
                          node.append(errorView(response.error, null));
                          return;
                        }
                        app.toast("ok", "已成交", response.data.note || "");
                        ctx.refresh();
                        app.refreshSnapshot();
                      },
                    }),
                  ]);
                  node.append(box);
                },
              }),
            ]),
          ]))),
        ]));
      }

      function buildPriceDetail(listing) {
        const breakdown = listing.priceBreakdown || {};
        return el("tr", { class: "price-detail" }, [
          el("td", { colspan: "6" }, [
            el("div", { class: "note-card", style: { margin: "4px 0" } }, [
              el("p", { class: "note-card__title", text: listing.name + " · 价格构成（Host 给出，不经前端重算）" }),
              el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "全局评分 / 有效样本" }), el("span", { class: "stat-row__value", text: (breakdown.globalScore == null ? "—" : breakdown.globalScore) + " / " + (breakdown.sessions || 0) + " 场" })]),
              el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "供需系数" }), el("span", { class: "stat-row__value mono", text: "×" + (breakdown.demandIndex ?? 1) })]),
              el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "版本溢价" }), el("span", { class: "stat-row__value mono", text: "×" + (breakdown.versionPremium ?? 1) })]),
              el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "近期变化" }), el("span", { class: "stat-row__value", text: (breakdown.lastChange >= 0 ? "+" : "") + (breakdown.lastChange ?? 0) + "%" })]),
              el("p", { class: "small muted", text: breakdown.note || "价格由 Host 给出，前端不按公式重算。" }),
            ]),
          ]),
        ]);
      }

      async function renderMine(node) {
        const result = await ctx.query("market.list", { tab: "mine" });
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        if (!result.data.items.length) {
          node.append(stateView({ kind: "empty", title: "还没有在售的单卡", body: "在背包里用“留一，其余上架”，或在开包汇总页上架。" }));
          return;
        }
        node.append(el("table", { class: "data-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", { text: "卡牌" }), el("th", { class: "num", text: "单价" }), el("th", { class: "num", text: "在售" }), el("th", { text: "" })])]),
          el("tbody", {}, result.data.items.map((listing) => el("tr", {}, [
            el("td", {}, [el("span", { class: "rarity rarity--" + listing.rarity, text: listing.rarity + " " }), listing.name]),
            el("td", { class: "num", text: app.formatMoney(listing.unitAmount) }),
            el("td", { class: "num", text: String(listing.quantity) }),
            el("td", {}, [
              el("button", {
                class: "btn btn--sm", type: "button", text: "撤单",
                onclick: async (event) => {
                  const restore = busyButton(event.currentTarget, "撤单中…");
                  const response = await ctx.submit({ requestId: newRequestId("cancel"), type: "market.cancelListing", payload: { listingId: listing.listingId } });
                  restore();
                  if (!response.ok) app.toast("error", response.error.code, response.error.message);
                  else { app.toast("ok", "已撤单", ""); ctx.refresh(); }
                },
              }),
            ]),
          ]))),
        ]));
        node.append(el("p", { class: "small muted", text: "挂单保持未成交时不会产生现金；行情记录里只有真实成交。" }));
      }

      async function renderBids(node) {
        const result = await ctx.query("market.list", { tab: "bids" });
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        node.append(el("p", { class: "small muted", text: "收购报价为 NPC 需求方给出；接受报价需要主模型提供对应命令（见接口缺口）。" }));
        node.append(el("table", { class: "data-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", { text: "卡牌" }), el("th", { text: "买家" }), el("th", { class: "num", text: "单价" }), el("th", { class: "num", text: "数量" })])]),
          el("tbody", {}, (result.data.items || []).map((bid) => el("tr", {}, [
            el("td", {}, [el("span", { class: "rarity rarity--" + bid.rarity, text: bid.rarity + " " }), bid.name]),
            el("td", { text: bid.buyer }),
            el("td", { class: "num", text: app.formatMoney(bid.unitAmount) }),
            el("td", { class: "num", text: String(bid.quantity) }),
          ]))),
        ]));
      }

      async function renderHistory(node) {
        const result = await ctx.query("market.list", { tab: "history" });
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        if (!result.data.items.length) {
          node.append(stateView({ kind: "empty", title: "还没有成交记录", body: "成交后这里会显示单价、数量与方向。" }));
          return;
        }
        node.append(el("table", { class: "data-table" }, [
          el("thead", {}, [el("tr", {}, [el("th", { text: "时间" }), el("th", { text: "卡牌" }), el("th", { text: "方向" }), el("th", { class: "num", text: "单价" }), el("th", { class: "num", text: "数量" })])]),
          el("tbody", {}, result.data.items.map((trade) => el("tr", {}, [
            el("td", { class: "mono", text: Math.floor(trade.at / 60) + ":" + String(trade.at % 60).padStart(2, "0") }),
            el("td", { text: trade.name }),
            el("td", { text: trade.direction === "sell" ? "卖出" : "买入" }),
            el("td", { class: "num", text: app.formatMoney(trade.unitAmount) }),
            el("td", { class: "num", text: String(trade.quantity) }),
          ]))),
        ]));
      }

      ctx.setFooter([
        el("button", { class: "btn", type: "button", text: "背包", onclick: () => app.openPanel("inventory", {}) }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
