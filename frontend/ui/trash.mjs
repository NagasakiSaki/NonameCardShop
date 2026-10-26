// frontend/ui/trash.mjs — 垃圾桶：清空前可单张或全部捡回，并明确“开始下一天会清空”。
import { el, clear, stateView, errorView, imgWithFallback, newRequestId, busyButton } from "./components.mjs";

export async function openTrash(app) {
  return app.windows.open({
    id: "trash",
    title: "垃圾桶",
    subtitle: "共享垃圾桶 · 次日清空 · 店长和部分低预算顾客都能拾取",
    pauseReason: "翻垃圾桶",
    render: async (ctx) => {
      const body = ctx.body;
      const list = el("div", { class: "grid-auto" });
      const note = el("p", { class: "small muted", text: "顾客会把拆包后不要的卡丢在这里。捡走的实物卡会登记流通，可上架或用于对战。自己丢弃的卡也可能被顾客捡走；打开窗口时营业时间暂停。" });
      body.append(note, list);
      const discardResult=await ctx.query('inventory.list',{kind:'card',location:'collection',limit:200});
      if(discardResult.ok){const cards=discardResult.data.items.filter(i=>i.available);if(cards.length){const select=el('select',{class:'select'},cards.map(c=>el('option',{value:c.inventoryRef,text:`${c.name} ${c.printedRarity} · ${c.inventoryRef.slice(-8)}`})));body.prepend(el('div',{class:'note-card'},[el('p',{text:'选择要丢弃的一张实物卡（本日可捡回）：'}),select,el('button',{class:'btn',text:'丢弃所选卡',onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('discard'),type:'inventory.discard',payload:{inventoryRef:select.value}});if(!r.ok)body.append(errorView(r.error));else ctx.refresh();}})]));}}

      async function load(cursor) {
        if(!cursor){clear(list);list.append(stateView({ kind: "loading", title: "正在查看桶里…" }));}
        const result = await ctx.query("inventory.list", { location: "trash", limit: 60, ...(cursor?{cursor}:{}) });
        if(!cursor)clear(list);
        if (!result.ok) {
          list.append(errorView(result.error, () => load(cursor)));
          return;
        }
        if (!result.data.items.length) {
          list.append(stateView({ kind: "empty", title: "桶里是空的", body: "顾客在店内拆包、挑选后，会走到这里丢弃不想要的卡。剩余卡片留到次日清空。" }));
          return;
        }
        for (const row of result.data.items) {
          list.append(el("div", { class: "card-tile",'data-card-key':row.cardKey }, [
            imgWithFallback(row.imageUrl, row.name, "card-tile__img"),
            el("div", { class: "card-tile__body" }, [
              el("span", { class: "card-tile__name", text: row.name }),
              el("span", { class: "small muted", text: row.discardedByName ? `${row.discardedByName} 丢弃${row.discardedDay ? ` · 第 ${row.discardedDay} 天` : ''}` : '店内丢弃的卡牌' }),
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
                  await ctx.refresh();
                },
              }),
            ]),
          ]));
        }
        if(result.data.nextCursor){const more=el('button',{class:'btn',text:`继续查看（桶内共 ${result.data.total} 张）`,onclick:async()=>{more.remove();await load(result.data.nextCursor);}});list.append(more);}
      }

      ctx.setFooter([
        el("button", {
          class: "btn btn--primary", type: "button", text: "全部捡回",
          onclick: async (event) => {
            const restore = busyButton(event.currentTarget, "捡回中…");
            const response = await ctx.submit({ requestId: newRequestId("recover-all"), type: "inventory.recover", payload: {all:true} });
            restore();
            if (!response.ok) {
              body.append(errorView(response.error, null));
              return;
            }
            app.toast(response.data.recovered ? "ok" : "info", "捡回结果", response.data.note || "");
            await ctx.refresh();
            app.refreshSnapshot();
          },
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);

      await load();
    },
  });
}
