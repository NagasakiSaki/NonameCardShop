// frontend/ui/trash.mjs — 垃圾桶：清空前可单张或全部捡回，并明确“开始下一天会清空”。
import { el, clear, stateView, errorView, imgWithFallback, newRequestId, busyButton } from "./components.mjs";

export async function openTrash(app) {
  return app.windows.open({
    id: "trash",
    title: "垃圾桶",
    subtitle: "开始下一天时清空，清空之前都能捡回",
    pauseReason: "翻垃圾桶",
    render: async (ctx) => {
      const body = ctx.body;
      const list = el("div", { class: "grid-auto" });
      const note = el("p", { class: "small muted", text: "被保护、锁定或已挂单的卡不能丢弃。" });
      body.append(note, list);

      async function load() {
        clear(list);
        list.append(stateView({ kind: "loading", title: "正在查看桶里…" }));
        const result = await ctx.query("inventory.list", { location: "trash", limit: 60 });
        clear(list);
        if (!result.ok) {
          list.append(errorView(result.error, () => load()));
          return;
        }
        if (!result.data.items.length) {
          list.append(stateView({ kind: "empty", title: "桶里是空的", body: "丢弃的卡会留到次日开店前。" }));
          return;
        }
        for (const row of result.data.items) {
          list.append(el("div", { class: "card-tile" }, [
            imgWithFallback(row.imageUrl, row.name, "card-tile__img"),
            el("div", { class: "card-tile__body" }, [
              el("span", { class: "card-tile__name", text: row.name }),
              el("span", { class: "card-tile__meta" }, [
                el("span", { class: "rarity rarity--" + row.printedRarity, text: row.printedRarity }),
                el("span", { class: "muted", text: "×" + row.owned }),
              ]),
              el("button", {
                class: "btn btn--sm", type: "button", text: "捡回这张",
                onclick: async (event) => {
                  const restore = busyButton(event.currentTarget, "捡回中…");
                  const response = await ctx.submit({ requestId: newRequestId("recover"), type: "inventory.recover", payload: { inventoryRef: row.inventoryRef } });
                  restore();
                  if (!response.ok) {
                    body.append(errorView(response.error, null));
                    return;
                  }
                  app.toast("ok", "已捡回", "回收 " + response.data.recovered + " 张");
                  await load();
                },
              }),
            ]),
          ]));
        }
      }

      ctx.setFooter([
        el("button", {
          class: "btn btn--primary", type: "button", text: "全部捡回",
          onclick: async (event) => {
            const restore = busyButton(event.currentTarget, "捡回中…");
            const response = await ctx.submit({ requestId: newRequestId("recover-all"), type: "inventory.recover", payload: {} });
            restore();
            if (!response.ok) {
              body.append(errorView(response.error, null));
              return;
            }
            app.toast(response.data.recovered ? "ok" : "info", "捡回结果", response.data.note || "");
            await load();
            app.refreshSnapshot();
          },
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);

      await load();
    },
  });
}
