// frontend/ui/supplier.mjs — 进货 / 签收 / 零售货架。概率、配比、金额全部来自 Host。
import { el, clear, stateView, errorView, newRequestId, busyButton, rowsOf } from "./components.mjs";

const RARITIES = ["N", "R", "SR", "SSR"];

function poolLine(summary) {
  return RARITIES.map((rarity) => el("span", { class: "chip rarity rarity--" + rarity, text: rarity + " " + (summary[rarity] ?? 0) })).filter(Boolean);
}

function percent(value) {
  if (value == null) return "—";
  return (value * 100).toFixed(2) + "%";
}

export async function openSupplier(app, options = {}) {
  const state = { tab: ['order','orders','retail'].includes(options.tab)?options.tab:'order', selected: null };

  return app.windows.open({
    id: "supplier",
    title: "进货与签收",
    subtitle: "报价冻结后才下单；新价格发布不会改已接受的订单",
    width: "window--wide",
    pauseReason: "进货柜台",
    render: async (ctx) => {
      const body = ctx.body;
      ctx.titleNode.textContent = state.tab === "retail" ? "零售货架" : "进货与签收";

      const tabsNode = el("div", { class: "tabs" }, [
        ["order", "订货"], ["orders", "待签收"], ["retail", "零售货架"],
      ].map(([id, label]) => el("button", {
        class: "tab", type: "button", text: label,
        "aria-selected": String(state.tab === id),
        onclick: () => { const station=id==='retail'?'store.retail':'store.counter';if(!app.isNearInteraction(station)){ctx.handle.close();app.goToInteraction(station,'supplier',{tab:id});return;}state.tab = id; ctx.refresh(); },
      })));
      body.append(tabsNode);

      const content = el("div", { class: "section" });
      body.append(content);

      if (state.tab === "order") await renderOrder(content);
      else if (state.tab === "orders") await renderOrders(content);
      else await renderRetail(content);

      async function renderOrder(node) {
        node.append(stateView({ kind: "loading", title: "正在读取供货版本…" }));
        const result = await ctx.query("products.list", {});
        clear(node);
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        const items = rowsOf(result.data);
        if (!items.length) {
          node.append(stateView({ kind: "empty", title: "当前没有可订商品", body: "请等待新的供货版本发布。" }));
          return;
        }
        for (const product of items) {
          if(product.availability!=='available'){node.append(stateView({kind:'empty',title:product.themeName,body:product.unavailableReason}));continue;}
          const row = el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [
              product.themeName + " · " + product.productVersion,
              el("span", { class: product.availability === "available" ? "badge badge--ok" : "badge badge--warn", text: product.availability === "available" ? "可供货" : "停供" }),
            ]),
            el("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" } }, [
              el("span", { class: "chip", text: "评分版本 " + product.ratingVersion }),
              el("span", { class: "chip", text: "价格版本 " + product.priceVersion }),
              el("span", { class: "chip", text: "整盒 " + product.packsPerBox + " × " + product.cardsPerPack + " 张" }),
            ]),
            el("p", { class: "small muted", text: "主题卡池分布（卡种占比，不是抽到该档的概率）：" }),
            el("div", { style: { display: "flex", gap: "4px", flexWrap: "wrap" } }, poolLine(product.poolSummary)),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "整盒固定张数 N/R/SR/SSR" }), el("span", { class: "stat-row__value mono", text: RARITIES.map((r) => product.boxCounts[r]).join(" / ") })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "每包平均张数" }), el("span", { class: "stat-row__value mono", text: RARITIES.map((r) => product.packExpectedCounts[r]).join(" / ") })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "每包至少 1 张 SSR 的概率" }), el("span", { class: "stat-row__value mono", text: percent(product.packAtLeastOneProbabilities.SSR) })]),
            el("p", { class: "small muted", text: "保底：" + product.guarantees.join("；") }),
            product.substitutionSummary ? el("p", { class: "small", style: { color: "#f0c58a" }, text: "缺档说明：" + product.substitutionSummary }) : null,
            product.previousVersion ? el("p", { class: "small muted", text: "本版 " + product.productVersion + " 对照上一版 " + product.previousVersion + "，生效时间：第 " + (product.effectiveAt ? product.effectiveAt.day : "—") + " 天 " + (product.effectiveAt ? String(Math.floor(product.effectiveAt.minute / 60)).padStart(2, "0") + ":" + String(product.effectiveAt.minute % 60).padStart(2, "0") : "—") }) : null,
            product.changeReason ? el("p", { class: "small", style: { color: "#f0c58a" }, text: "变化原因：" + product.changeReason }) : null,
            product.changes && product.changes.length ? el("table", { class: "data-table" }, [
              el("thead", {}, [el("tr", {}, [el("th", { text: "定额项" }), el("th", { class: "num", text: "上一版" }), el("th", { class: "num", text: "本版" })])]),
              el("tbody", {}, product.changes.map((change) => el("tr", {}, [
                el("td", { text: change.label }),
                el("td", { class: "num", text: String(change.from) }),
                el("td", { class: "num", text: String(change.to) + (change.to > change.from ? " ↑" : change.to < change.from ? " ↓" : "") }),
              ]))),
            ]) : null,
            el("div", { class: "toolbar" }, [
              el("label", { class: "field" }, [
                el("span", { class: "field__label", text: "数量" }),
                el("input", { class: "input", type: "number", min: "1", max: "20", value: "2", style: { width: "90px" }, "data-role": "qty" }),
              ]),
              el("label", { class: "field" }, [
                el("span", { class: "field__label", text: "单位" }),
                el("select", { class: "select", "data-role": "unit" }, [
                  el("option", { value: "pack", text: "散包（" + app.formatMoney(product.unitAmounts.pack) + "）" }),
                  el("option", { value: "box", text: "整盒（" + app.formatMoney(product.unitAmounts.box) + "）" }),
                ]),
              ]),
              el("button", {
                class: "btn btn--primary", type: "button", text: "获取报价",
                onclick: async (event) => {
                  const card = event.currentTarget.closest(".note-card");
                  const qty = Number(card.querySelector('[data-role="qty"]').value) || 1;
                  const unit = card.querySelector('[data-role="unit"]').value;
                  const restore = busyButton(event.currentTarget, "询价中…");
                  const quote = await ctx.query("products.quote", { productId: product.productId, quantity: qty, unit });
                  restore();
                  if (!quote.ok) {
                    node.append(errorView(quote.error, null));
                    return;
                  }
                  const old = card.querySelector(".quote-box");
                  if (old) old.remove();
                  const q = quote.data;
                  const creditToggle=el('input',{type:'checkbox',disabled:!(q.supplierCreditAvailable>0)});
                  const box = el("div", { class: "note-card quote-box", style: { borderColor: "rgba(232,182,74,0.5)" } }, [
                    el("p", { class: "note-card__title", text: "报价 · " + (q.expired ? "已过期" : "有效") }),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "单价" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.unitAmount) })]),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "小计" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.subtotal) })]),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "手续费" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.feeAmount) })]),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "应付合计" }), el("span", { class: "stat-row__value", text: app.formatMoney(q.totalDebit) })]),
                    el("p", { class: "small muted", text: q.explanation.join(" · ") }),
                    q.supplierCreditAvailable!==undefined?el('label',{class:'small'},[creditToggle,` 允许使用供应商信用（剩余 ${app.formatMoney(q.supplierCreditAvailable)}）`]):null,
                    q.creditExplanation?el('p',{class:'small muted',text:q.creditExplanation}):null,
                    q.validUntil ? el("p", { class: "small muted", text: "有效期至第 " + q.validUntil.day + " 天 " + Math.floor(q.validUntil.minute / 60) + ":" + String(q.validUntil.minute % 60).padStart(2, "0") }) : null,
                    el("button", {
                      class: "btn btn--primary", type: "button", text: q.expired ? "报价已过期，重新获取" : "确认下单并冻结价格",
                      disabled: q.expired,
                      onclick: async (event2) => {
                        const restore2 = busyButton(event2.currentTarget, "下单中…");
                        const order = await ctx.submit({
                          requestId: newRequestId("order"),
                          type: "supplier.placeOrder",
                          quoteId: q.quoteId,
                          payload: { productId: product.productId, quantity: q.quantity, unit: q.unit, credit: creditToggle.checked },
                        });
                        restore2();
                        if (!order.ok) {
                          node.append(errorView(order.error, null));
                          return;
                        }
                        app.toast("ok", "已下单", "订单 " + (order.data.orderId||order.data.order?.orderId) + " 冻结价格，待签收");
                        state.tab = "orders";
                        ctx.refresh();
                        app.refreshSnapshot();
                      },
                    }),
                  ]);
                  card.append(box);
                },
              }),
            ]),
          ]);
          node.append(row);
        }

        const allVersions = result.data.allVersions || [];
        if (allVersions.length > items.length) {
          node.append(el("div", { class: "section" }, [
            el("h4", { class: "section__title", text: "供货版本历史" }),
            el("p", { class: "small muted", text: "旧订单按接受时的版本与价格结算，不随新版本重算。" }),
            el("table", { class: "data-table" }, [
              el("thead", {}, [el("tr", {}, [el("th", { text: "主题" }), el("th", { text: "版本" }), el("th", { text: "价格版本" }), el("th", { text: "整盒定额" })])]),
              el("tbody", {}, allVersions.map((item) => el("tr", {}, [
                el("td", { text: item.themeName }),
                el("td", { text: item.productVersion }),
                el("td", { class: "mono", text: item.priceVersion }),
                el("td", { class: "mono", text: RARITIES.map((r) => item.boxCounts[r]).join("/") }),
              ]))),
            ]),
          ]));
        }
      }

      async function renderOrders(node) {
        node.append(stateView({ kind: "loading", title: "正在读取订单…" }));
        const result = await ctx.query("supplier.orders", {});
        clear(node);
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        const orderRows = rowsOf(result.data);
        if(orderRows.some(o=>o.status==='arrived'))node.append(el('button',{class:'btn btn--primary',text:'一键签收全部到货',onclick:async event=>{const restore=busyButton(event.currentTarget,'签收中…');const r=await ctx.submit({requestId:newRequestId('receive-all'),type:'supplier.receiveAll',payload:{}});restore();if(!r.ok)node.append(errorView(r.error));else {app.toast('ok','已签收',`${r.data.orders} 笔订单已入库`);ctx.refresh();}}}));
        if (!orderRows.length) {
          node.append(stateView({ kind: "empty", title: "没有待签收的订单", body: "订货后会出现在这里；未签收的商品不能当库存开。" }));
          return;
        }
        for (const order of orderRows) {
          node.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [order.orderId, el("span", { class: "badge", text: order.status === "received" ? "已签收" : "待签收" })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "商品" }), el("span", { class: "stat-row__value", text: order.themeName + " " + order.productVersion })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "数量" }), el("span", { class: "stat-row__value", text: order.quantity + " " + (order.unit === "box" ? "盒" : "包") })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "金额（冻结）" }), el("span", { class: "stat-row__value", text: app.formatMoney(order.total) })]),
            el("p", { class: "small muted", text: order.note }),
            el("button", {
              class: "btn btn--primary", type: "button", text: order.status === "received" ? "已签收" : "签收",
              disabled: order.status !== "arrived",
              onclick: async (event) => {
                const restore = busyButton(event.currentTarget, "签收中…");
                const response = await ctx.submit({ requestId: newRequestId("receive"), type: "supplier.receive", payload: { orderId: order.orderId } });
                restore();
                if (!response.ok) {
                  node.append(errorView(response.error, null));
                  return;
                }
                app.toast("ok", "已签收", "仓库新增 " + response.data.stock.packs + " 包密封商品");
                ctx.refresh();
              },
            }),
          ]));
        }
      }

      async function renderRetail(node) {
        node.append(stateView({ kind: "loading", title: "正在读取货架…" }));
        const result = await ctx.query("retail.list");
        clear(node);
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        node.append(el("p", { class: "small", text: result.data.note }));
        for (const shelf of result.data.shelves) {
          node.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [shelf.label, el("span", { class: "chip", text: shelf.kind === "sealed-box" ? "密封整盒" : "密封散包" })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "在架 / 容量" }), el("span", { class: "stat-row__value", text: shelf.stock + " / " + shelf.capacity })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "当前标价" }), el("span", { class: "stat-row__value", text: app.formatMoney(shelf.unitAmount) })]),
            el("div", { class: "toolbar" }, [
              el("label", { class: "field" }, [
                el("span", { class: "field__label", text: "标价" }),
                el("input", { class: "input", type: "number", min: "1", value: String(shelf.unitAmount), style: { width: "110px" }, "data-role": "price" }),
              ]),
              el("button", {
                class: "btn btn--sm", type: "button", text: "改价",
                onclick: async (event) => {
                  const input = event.currentTarget.closest(".note-card").querySelector('[data-role="price"]');
                  const restore = busyButton(event.currentTarget, "提交中…");
                  const response = await ctx.submit({ requestId: newRequestId("price"), type: "retail.setPrice", payload: { inventoryRef: shelf.inventoryRefs?.[0], amount: Number(input.value) } });
                  restore();
                  if (!response.ok) {
                    app.toast("error", response.error.code, response.error.message);
                    return;
                  }
                  app.toast("ok", "已改价", app.formatMoney(response.data.unitAmount));
                  ctx.refresh();
                },
              }),
              el("button", {
                class: "btn btn--sm", type: "button", text: "下架 1",
                onclick: async () => {
                  const response = await ctx.submit({ requestId: newRequestId("withdraw"), type: "retail.withdraw", payload: { inventoryRef: shelf.inventoryRefs?.[0] } });
                  if (!response.ok) app.toast("error", response.error.code, response.error.message);
                  else {app.toast("ok", "已下架", "撤下 " + response.data.withdrawn + " 件");ctx.refresh();}
                },
              }),
              el("button", {
                class:'btn btn--sm',text:'上架 1',disabled:!shelf.stockRefs?.length,
                onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('shelf'),type:'retail.list',payload:{inventoryRef:shelf.stockRefs[0]}});if(!r.ok)app.toast('error',r.error.code,r.error.message);else ctx.refresh();}
              }),
              el("span",{class:'small muted',text:'仓库 '+(shelf.warehouse??0)+' 件'}),
              el('button',{class:'btn btn--sm',text:'一键补满货架',disabled:!shelf.stockRefs?.length,onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('shelf-all'),type:'retail.listAll',payload:{inventoryRefs:shelf.stockRefs}});if(!r.ok)app.toast('error',r.error.code,r.error.message);else {app.toast('ok','补货完成',r.data.note);ctx.refresh();}}}),
              el("button", {
                class: "btn btn--sm", type: "button", text: "去开包",
                onclick: () => {ctx.handle.close();app.goToInteraction('store.counter','opening');},
              }),
            ]),
          ]));
        }
        node.append(el("p", { class: "small muted", text: "单卡不进正店货架；需要卖单卡请到二级市场柜台。" }));
      }

      ctx.setFooter([
        el("button", { class: "btn", type: "button", text: "开包柜台", onclick: () => {ctx.handle.close();if(app.isNearInteraction('store.counter'))app.openPanel('opening');else app.goToInteraction('store.counter','opening');} }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
