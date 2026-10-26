// frontend/ui/inventory.mjs — 背包与收藏：搜索、筛选、分页、详情、留一上架（预览后确认）。
import { el, clear, stateView, errorView, imgWithFallback, debounce, newRequestId, busyButton, rowsOf } from "./components.mjs";

const RARITIES = ["N", "R", "SR", "SSR"];
const FILTERS = [
  { id: "all", label: "全部持有" },
  { id: "duplicate", label: "重复卡" },
  { id: "protected", label: "已保护" },
  { id: "listed", label: "在售" },
];

export async function openInventory(app) {
  const state = {
    search: "",
    rarity: "",
    filter: "all",
    sort: "score-desc",
    cursor: null,
    rows: [],
    total: 0,
    loading: false,
    error: null,
    done: false,
  };

  return app.windows.open({
    id: "inventory",
    title: "背包与收藏",
    subtitle: "留一上架会先给出预览，确认后才真正挂单",
    width: "window--wide",
    pauseReason: "查看背包",
    render: async (ctx) => {
      const body = ctx.body;
      const listNode = el("div", { class: "grid-auto" });
      const statusNode = el("p", { class: "small muted" });

      const searchInput = el("input", {
        class: "input", type: "search", placeholder: "搜索武将名", value: state.search,
        oninput: debounce((event) => {
          state.search = event.target.value.trim();
          reload();
        }, 260),
      });
      const raritySelect = el("select", {
        class: "select",
        onchange: (event) => { state.rarity = event.target.value; reload(); },
      }, [el("option", { value: "", text: "全部稀有度" }), ...RARITIES.map((rarity) => el("option", { value: rarity, text: rarity }))]);
      const filterSelect = el("select", {
        class: "select",
        onchange: (event) => { state.filter = event.target.value; reload(); },
      }, FILTERS.map((filter) => el("option", { value: filter.id, text: filter.label })));
      const sortSelect = el("select", {
        class: "select",
        onchange: (event) => { state.sort = event.target.value; reload(); },
      }, [
        el("option", { value: "score-desc", text: "按评分从高到低" }),
        el("option", { value: "score-asc", text: "按评分从低到高" }),
        el("option", { value: "name", text: "按名称" }),
        el("option", { value: "owned-desc", text: "按持有数量" }),
      ]);

      body.append(el("div", { class: "toolbar" }, [searchInput, raritySelect, filterSelect, sortSelect]));
      body.append(statusNode);
      body.append(listNode);

      async function loadMore() {
        if (state.loading || state.done) return;
        state.loading = true;
        state.error = null;
        renderList();
        const result = await ctx.query("inventory.list", {
          grouped: true,
          search: state.search || undefined,
          rarity: state.rarity || undefined,
          filter: state.filter,
          sort: state.sort,
          cursor: state.cursor || undefined,
          limit: 24,
        });
        state.loading = false;
        if (!result.ok) {
          state.error = result.error;
          renderList();
          return;
        }
        const page = rowsOf(result.data);
        state.rows = state.rows.concat(page);
        state.total = typeof result.data.total === "number" ? result.data.total : state.rows.length;
        state.cursor = result.data.nextCursor ?? null;
        state.done = !result.data.nextCursor;
        renderList();
      }

      async function reload() {
        state.rows = [];
        state.cursor = null;
        state.done = false;
        await loadMore();
      }

      function renderList() {
        clear(listNode);
        listNode.append();
        clear(statusNode);
        if (state.error) {
          listNode.append(errorView(state.error, () => loadMore()));
          return;
        }
        statusNode.textContent = state.rows.length
          ? "已加载 " + state.rows.length + " / " + state.total + " 条库存记录"
          : state.loading ? "" : "";
        if (!state.rows.length && state.loading) {
          listNode.append(stateView({ kind: "loading", title: "正在读取库存…" }));
          return;
        }
        if (!state.rows.length) {
          listNode.append(stateView({
            kind: "empty",
            title: state.search || state.rarity || state.filter !== "all" ? "没有符合条件的卡" : "背包还是空的",
            body: state.search || state.rarity || state.filter !== "all" ? "换一个筛选条件试试。" : "去进货柜台开包，或到二级市场收购。",
          }));
          return;
        }
        for (const row of state.rows) {
          const chips = [];
          if (row.protected > 0) chips.push(el("span", { class: "chip chip--protect", text: "保护 " + row.protected }));
          if (row.listed > 0) chips.push(el("span", { class: "chip chip--list", text: "在售 " + row.listed }));
          if (row.locked > 0) chips.push(el("span", { class: "chip chip--lock", text: "锁定 " + row.locked }));
          if (row.owned > 1) chips.push(el("span", { class: "chip", text: "×" + row.owned }));
          const tile = el("button", {
            class: "card-tile", type: "button", 'data-card-key':row.cardKey,
            onclick: () => app.openPanel("cardDetail", { cardKey: row.cardKey }),
          }, [
            imgWithFallback(row.imageUrl, row.name, "card-tile__img"),
            el("div", { class: "card-tile__body" }, [
              el("span", { class: "card-tile__name", text: row.name }),
              el("span", { class: "card-tile__meta" }, [
                el("span", { class: "rarity rarity--" + row.printedRarity, text: row.printedRarity }),
                el("span", { class: "mono", text: "总分 " + (row.globalScore == null ? "—" : row.globalScore) }),
                el("span", { class: "muted", text: "可用 " + row.available + "/" + row.owned }),
              ]),
              el("span", { class: "card-tile__meta" }, chips),
            ]),
          ]);
          listNode.append(tile);
        }
        if (!state.done) {
          listNode.append(el("button", { class: "btn", type: "button", text: "加载更多", onclick: () => loadMore() }));
        }
      }

      async function startSurplusPreview(button) {
        const restore = busyButton(button, "生成预览…");
        const preview = await ctx.query("inventory.surplusPreview", { keep: 1, filter: state.filter });
        restore();
        if (!preview.ok) {
          ctx.body.append(errorView(preview.error, () => startSurplusPreview(button)));
          return;
        }
        const data = preview.data;
        const box = el("div", { class: "note-card" }, [
          el("p", { class: "note-card__title" }, ["留一上架预览", el("span", { class: "muted", text: "尚未提交" })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "保留每张卡" }), el("span", { class: "stat-row__value", text: data.keep + " 张" })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "本次新增挂单" }), el("span", { class: "stat-row__value", text: data.newListings + " 张" })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "已在售" }), el("span", { class: "stat-row__value", text: data.alreadyListed + " 张" })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "锁定排除" }), el("span", { class: "stat-row__value", text: data.lockedExcluded + " 张" })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "预计上架费" }), el("span", { class: "stat-row__value", text: app.formatMoney(data.estimatedFee) })]),
          el("p", { class: "small muted", text: "挂单不等于成交，也不计入可用资金。" }),
          el("div", { style: { display: "flex", gap: "8px" } }, [
            el("button", {
              class: "btn btn--primary", type: "button", text: "确认上架",
              disabled: !ctx.canSubmit(),
              onclick: async (event) => {
                const restore = busyButton(event.currentTarget, "提交中…");
                const result = await ctx.submit({ requestId: newRequestId("surplus"), type: "market.listSurplus", previewId: data.previewId, payload: {} });
                restore();
                if (!result.ok) {
                  ctx.body.append(errorView(result.error, null));
                  return;
                }
                app.toast("ok", "已进入市场", "新增 " + result.data.created + " 条挂单，尚未成交");
                reload();
                app.refreshSnapshot();
              },
            }),
            el("button", {
              class: "btn btn--ghost", type: "button", text: "取消",
              onclick: () => box.remove(),
            }),
          ]),
        ]);
        ctx.body.append(box);
      }

      ctx.setFooter([
        el("button", {
          class: "btn", type: "button", text: "留一，其余上架",
          onclick: (event) => startSurplusPreview(event.currentTarget),
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);

      await loadMore();
    },
  });
}
