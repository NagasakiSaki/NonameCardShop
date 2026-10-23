// frontend/ui/day-saves.mjs — 按天存档：列表、保存、读取（含确认）、导出；不接触原始存档结构。
import { el, clear, stateView, errorView, newRequestId, busyButton } from "./components.mjs";

export async function openDaySaves(app) {
  return app.windows.open({
    id: "day-saves",
    title: "按天存档",
    subtitle: "读档前需要确认；旧档重置由主模型执行，前端不碰浏览器存储",
    pauseReason: "查看存档",
    render: async (ctx) => {
      const body = ctx.body;
      body.append(stateView({ kind: "loading", title: "正在读取日档…" }));
      const result = await ctx.query("saves.list");
      clear(body);
      if (!result.ok) {
        body.append(errorView(result.error, () => ctx.refresh()));
        return;
      }
      const rows = result.data.items;
      body.append(el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, (result.data.branches || []).map((branch) =>
        el("span", { class: "chip", text: "分支 " + branch }),
      )));

      const table = el("table", { class: "data-table" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", { text: "日期" }), el("th", { text: "分支" }), el("th", { text: "时间" }), el("th", { text: "来源" }), el("th", { text: "状态" }), el("th", { text: "" }),
        ])]),
        el("tbody", {}, rows.map((row) => el("tr", {}, [
          el("td", { text: "第 " + row.day + " 天" }),
          el("td", { text: row.branch }),
          el("td", { class: "mono", text: Math.floor(row.minute / 60) + ":" + String(row.minute % 60).padStart(2, "0") }),
          el("td", { text: row.source === "auto" ? "自动" : "手动" }),
          el("td", {}, [el("span", { class: row.status === "readable" ? "chip chip--ok" : "chip chip--lock", text: row.status === "readable" ? "可读" : "不可读" })]),
          el("td", {}, [
            el("button", {
              class: "btn btn--sm", type: "button", text: "读取",
              disabled: row.status !== "readable",
              onclick: (event) => {
                const cell = event.currentTarget.closest("tr");
                const old = body.querySelector(".confirm-load");
                if (old) old.remove();
                const box = el("div", { class: "note-card confirm-load" }, [
                  el("p", { class: "note-card__title", text: "读取第 " + row.day + " 天（" + row.branch + "）？" }),
                  el("p", { class: "small muted", text: "当前未保存的进度会丢失。读取由 Host 恢复，前端不还原原始存档 JSON。" }),
                  el("div", { style: { display: "flex", gap: "8px" } }, [
                    el("button", {
                      class: "btn btn--primary", type: "button", text: "确认读取",
                      onclick: async (event2) => {
                        const restore = busyButton(event2.currentTarget, "读取中…");
                        const response = await ctx.submit({ requestId: newRequestId("saveload"), type: "saves.load", payload: { saveId: row.saveId } });
                        restore();
                        if (!response.ok) {
                          body.append(errorView(response.error, null));
                          return;
                        }
                        app.toast("ok", "已读档", "第 " + response.data.save.day + " 天 " + row.branch);
                        app.refreshSnapshot();
                        ctx.refresh();
                      },
                    }),
                    el("button", { class: "btn btn--ghost", type: "button", text: "取消", onclick: () => box.remove() }),
                  ]),
                ]);
                cell.append(box);
              },
            }),
          ]),
        ]))),
      ]);
      body.append(table);
      body.append(el("p", { class: "small muted", text: "格式校验未通过的档只展示、不加载；世界重置后会发布 worldReset，前端清理视图缓存。" }));

      ctx.setFooter([
        el("button", {
          class: "btn btn--primary", type: "button", text: "保存当前进度",
          onclick: async (event) => {
            const restore = busyButton(event.currentTarget, "保存中…");
            const response = await ctx.submit({ requestId: newRequestId("save"), type: "saves.create", payload: {} });
            restore();
            if (!response.ok) {
              app.toast("error", response.error.code, response.error.message);
              return;
            }
            app.toast("ok", "已保存", response.data.save.saveId);
            ctx.refresh();
          },
        }),
        el("button", {
          class: "btn", type: "button", text: "导出",
          onclick: async () => {
            const response = await ctx.submit({ requestId: newRequestId("export"), type: "saves.export", payload: {} });
            if (!response.ok) {
              app.toast("error", response.error.code, response.error.message);
              return;
            }
            app.toast("ok", "已导出", response.data.blobName + "（" + response.data.bytes + " B）");
          },
        }),
        el("button", {
          class: "btn btn--ghost", type: "button", text: "导入",
          onclick: async () => {
            const response = await ctx.submit({ requestId: newRequestId("import"), type: "saves.import", payload: { file: "placeholder" } });
            if (!response.ok) app.toast("error", response.error.code, response.error.message);
          },
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
