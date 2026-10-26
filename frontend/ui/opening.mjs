// frontend/ui/opening.mjs — 开包：预览 → 执行 → 逐张/只看高稀有/汇总；重试复用同一 requestId。
import { el, clear, stateView, errorView, imgWithFallback, newRequestId, busyButton } from "./components.mjs";

const RARITIES = ["SSR", "SR", "R", "N"];

export async function openOpening(app) {
  const preset = app.snapshot() && app.snapshot().presetOpening;
  const state = {
    qty: preset && preset.packs ? preset.packs : 5,
    includeBoxes: false,
    skipAnimation: false,
    preview: null,
    result: null,
    mode: "all",
    requestId: null,
    unknown: false,
  };

  return app.windows.open({
    id: "opening",
    title: "开包柜台",
    subtitle: "开包结果只由 Host 返回；取消动画不会退回卡包",
    width: "window--wide",
    pauseReason: "开包",
    render: async (ctx) => {
      const body = ctx.body;
      const setupNode = el("div", { class: "section" });
      const stageNode = el("div", { class: "section" });
      body.append(setupNode, stageNode);

      function renderSetup() {
        clear(setupNode);
        setupNode.append(el("h4", { class: "section__title", text: "选择范围" }));
        setupNode.append(el("div", { class: "toolbar" }, [
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "开包数量" }),
            el("input", {
              class: "input", type: "number", min: "1", max: "30", value: String(state.qty), style: { width: "90px" },
              oninput: (event) => { state.qty = Math.max(1, Math.min(30, Number(event.target.value) || 1)); },
            }),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "包含密封整盒" }),
            el("select", {
              class: "select",
              onchange: (event) => { state.includeBoxes = event.target.value === "yes"; },
            }, [el("option", { value: "no", text: "不拆盒" }), el("option", { value: "yes", text: "先拆盒再开包" })]),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "动画" }),
            el("select", {
              class: "select",
              onchange: (event) => { state.skipAnimation = event.target.value === "skip"; },
            }, [el("option", { value: "play", text: "逐张揭示" }), el("option", { value: "skip", text: "跳过普通动画" })]),
          ]),
          el("button", {
            class: "btn btn--primary", type: "button", text: "生成预览",
            onclick: async (event) => {
              const restore = busyButton(event.currentTarget, "预览中…");
              const preview = await ctx.query("opening.preview", { quantity: state.qty, scope: "sealed", includeBoxes: state.includeBoxes });
              restore();
              if (!preview.ok) {
                clear(stageNode);
                stageNode.append(errorView(preview.error, null));
                return;
              }
              state.preview = preview.data;
              state.requestId = null;
              renderStage();
            },
          }),
        ]));
        setupNode.append(el('button',{class:'btn',text:'一键开所有包',onclick:async()=>{const r=await ctx.query('opening.preview',{includeBoxes:state.includeBoxes});if(!r.ok){stageNode.append(errorView(r.error));return;}state.preview=r.data;state.result=null;state.requestId=null;renderStage();}}));
        setupNode.append(el("p", { class: "small muted", text: "开包会把结果直接写入库存；预览只锁定范围，不扣包。整盒只拆本次所需的包，余包留在仓库。" }));
      }

      function renderStage() {
        clear(stageNode);
        if (state.unknown) {
          stageNode.append(el("div", { class: "note-card", style: { borderColor: "rgba(232,182,74,0.6)" } }, [
            el("p", { class: "note-card__title", text: "确认开包结果中…" }),
            el("p", { class: "small", text: "上一次提交没有收到确定结果。请不要重复开包，按同一操作号查询。" }),
            el("button", {
              class: "btn btn--primary", type: "button", text: "查询结果",
              onclick: async () => {
                const result = await ctx.query("operations.get", { requestId: state.requestId });
                if (!result.ok) {
                  stageNode.append(errorView(result.error, null));
                  return;
                }
                const payload = result.data.result?.data || result.data.response?.data || result.data.response || result.data;
                if (payload && payload.opening) {
                  state.result = payload.opening;
                  state.unknown = false;
                  renderStage();
                  app.refreshSnapshot();
                } else {
                  app.toast("info", "尚未完成", "Host 还没给出结果，稍后再查。");
                }
              },
            }),
          ]));
          return;
        }

        if (state.result) {
          renderResult();
          return;
        }

        if (state.preview) {
          const preview = state.preview;
          stageNode.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title", text: "开包预览" }),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "卡包" }), el("span", { class: "stat-row__value", text: preview.packs + " 包" })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "总张数" }), el("span", { class: "stat-row__value", text: preview.cards + " 张" })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "受保护排除" }), el("span", { class: "stat-row__value", text: preview.excluded + " 项" })]),
            el("p", { class: "small muted", text: "取消动画只是关闭展示，已提交的开包不会退回或重抽。" }),
            el("button", {
              class: "btn btn--primary", type: "button", text: "确认开包",
              disabled: !preview.packs,
              onclick: async (event) => {
                const restore = busyButton(event.currentTarget, "开包确认中…");
                state.requestId ||= newRequestId("open");
                const response = await ctx.submit({
                  requestId: state.requestId,
                  type: "opening.execute",
                  previewId: preview.previewId,
                  payload: {},
                });
                restore();
                if (!response.ok) {
                  if (response.error && response.error.code === "RESULT_UNKNOWN") {
                    state.unknown = true;
                    renderStage();
                    return;
                  }
                  stageNode.append(errorView(response.error, null));
                  return;
                }
                state.result = response.data.opening;
                state.preview = null;
                // 跳过普通动画时直接落到汇总，但结果本身不变
                state.mode = state.skipAnimation ? "summary" : "all";
                renderStage();
                app.refreshSnapshot();
              },
            }),
          ]));
        }
      }

      function renderResult() {
        const openingResult = state.result;
        if (!openingResult) return;
        const counts = openingResult.byRarity || {};
        stageNode.append(el("div", { class: "section" }, [
          el("h4", { class: "section__title", text: "开包结果" }),
          el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, RARITIES.map((rarity) =>
            el("span", { class: "chip rarity rarity--" + rarity, text: rarity + " × " + (counts[rarity] || 0) }),
          )),
        ]));

        const modes = el("div", { class: "tabs" }, [
          ["all", "逐张展示"], ["high", "只看 SR+"], ["summary", "直接汇总"],
        ].map(([id, label]) => el("button", {
          class: "tab", type: "button", text: label,
          "aria-selected": String(state.mode === id),
          onclick: () => { state.mode = id; renderStage(); },
        })));
        stageNode.append(modes);

        if (state.mode === "summary") {
          const groups = new Map();
          for (const card of openingResult.results || []) {
            const key = card.cardKey;
            const entry = groups.get(key) || { name: card.name, rarity: card.rarity, imageUrl: card.imageUrl, count: 0, isNew: card.isNew };
            entry.count += 1;
            groups.set(key, entry);
          }
          stageNode.append(el("table", { class: "data-table" }, [
            el("thead", {}, [el("tr", {}, [el("th", { text: "武将" }), el("th", { text: "稀有度" }), el("th", { class: "num", text: "数量" }), el("th", { text: "状态" })])]),
            el("tbody", {}, [...groups.values()].map((entry) => el("tr", {}, [
              el("td", { text: entry.name }),
              el("td", {}, [el("span", { class: "rarity rarity--" + entry.rarity, text: entry.rarity })]),
              el("td", { class: "num", text: "×" + entry.count }),
              el("td", {}, [el("span", { class: entry.isNew ? "chip chip--ok" : "chip", text: entry.isNew ? "新增" : "重复" })]),
            ]))),
          ]));
        } else {
          const filtered = state.mode === "high"
            ? (openingResult.results || []).filter((card) => card.rarity === "SR" || card.rarity === "SSR")
            : openingResult.results || [];
          if (!filtered.length) {
            stageNode.append(stateView({ kind: "empty", title: "这一批没有 SR 及以上", body: "切换到“逐张展示”看全部结果。" }));
          }
          stageNode.append(el("div", { class: "reveal-grid" }, filtered.map((card) => el("div", { class: "reveal-card" + (card.isNew ? " reveal-card--new" : ""), 'data-card-key':card.cardKey }, [
            imgWithFallback(card.imageUrl, card.name, ""),
            el("span", { class: "small", text: card.name }),
            el("span", { class: "rarity rarity--" + card.rarity, text: card.rarity }),
            el("span", { class: "chip", text: card.isNew ? "新增" : "重复" }),
          ]))));
        }

        stageNode.append(el("div", { class: "toolbar" }, [
          el("button", {
            class: "btn", type: "button", text: "留一，其余上架",
            onclick: async (event) => {
              const restore = busyButton(event.currentTarget, "预览中…");
              const preview = await ctx.query("inventory.surplusPreview", { keep: 1 });
              restore();
              if (!preview.ok) {
                stageNode.append(errorView(preview.error, null));
                return;
              }
              const data = preview.data;
              const box = el("div", { class: "note-card" }, [
                el("p", { class: "note-card__title", text: "上架预览 · 新增 " + data.newListings + " 张，预计费用 " + app.formatMoney(data.estimatedFee) }),
                el("p", { class: "small muted", text: "保留每卡 " + data.keep + " 张；锁定 " + data.lockedExcluded + " 张排除。" }),
                el("button", {
                  class: "btn btn--primary", type: "button", text: "确认上架",
                  onclick: async (event2) => {
                    const restore2 = busyButton(event2.currentTarget, "提交中…");
                    const response = await ctx.submit({ requestId: newRequestId("surplus"), type: "market.listSurplus", previewId: data.previewId, payload: {} });
                    restore2();
                    if (!response.ok) {
                      stageNode.append(errorView(response.error, null));
                      return;
                    }
                    app.toast("ok", "已进入市场", "新增 " + response.data.created + " 条挂单");
                  },
                }),
              ]);
              stageNode.append(box);
            },
          }),
          el("button", {
            class: "btn btn--ghost", type: "button", text: "再开一批",
            onclick: () => { state.result = null; state.preview = null; state.unknown = false; renderStage(); },
          }),
        ]));
      }

      ctx.setFooter([
        el("button", { class: "btn", type: "button", text: "背包", onclick: () => app.openPanel("inventory", {}) }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);

      renderSetup();
      renderStage();
    },
  });
}
