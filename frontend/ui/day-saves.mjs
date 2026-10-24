// frontend/ui/day-saves.mjs — 按天存档：列表、保存、读取（含确认）、导出；不接触原始存档结构。
import { el, clear, stateView, errorView, newRequestId, busyButton } from "./components.mjs";

export async function openDaySaves(app) {
  const state={tab:'days'};
  return app.windows.open({
    id: "day-saves",
    title: "按天存档",
    subtitle: "按天回到 08:00 开店前；即时备份单独管理",
    pauseReason: "查看存档",
    render: async (ctx) => {
      const body = ctx.body;
      body.append(stateView({ kind: "loading", title: "正在读取日档…" }));
      const result = await ctx.query(state.tab==='days'?"saves.days":"saves.list");
      clear(body);
      if (!result.ok) {
        body.append(errorView(result.error, () => ctx.refresh()));
        return;
      }
      const rows = result.data.items;
      body.append(el('div',{class:'toolbar'},[
        el('button',{class:'btn'+(state.tab==='days'?' btn--primary':''),text:'按天回退',onclick:()=>{state.tab='days';ctx.refresh();}}),
        el('button',{class:'btn'+(state.tab==='backups'?' btn--primary':''),text:'即时备份',onclick:()=>{state.tab='backups';ctx.refresh();}}),
        window.__cardShopReturnToMenu?el('button',{class:'btn',text:'返回主菜单 / 管理卡店存档',onclick:()=>window.__cardShopReturnToMenu()}):null
      ]));
      body.append(el('p',{class:'small muted',text:state.tab==='days'?'选择日期后恢复该天 08:00 的资金、库存、行情和顾客状态，当天已经发生的经营会回退。':'即时备份恢复保存时刻；这里同时保留日初、打烊与读档前备份，不等同于按天回退。'}));
      body.append(el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, (result.data.branches || []).map((branch) =>
        el("span", { class: "chip", text: "分支 " + branch }),
      )));

      const table = el("table", { class: "data-table" }, [
        el("thead", {}, [el("tr", {}, [
          el("th", { text: "日期" }), el("th", { text: state.tab==='days'?"记录":"分支" }), el("th", { text: "时间" }), el("th", { text: "来源" }), el("th", { text: "状态" }), el("th", { text: "" }),
        ])]),
        el("tbody", {}, rows.map((row) => el("tr", {}, [
          el("td", { text: "第 " + row.day + " 天" }),
          el("td", { text: state.tab==='days'?'当天开始':row.branch }),
          el("td", { class: "mono", text: Math.floor(row.minute / 60) + ":" + String(Math.floor(row.minute % 60)).padStart(2, "0") }),
          el("td", { text: row.source === 'day-start'?'日初自动':row.source === "auto" ? "自动" : "手动" }),
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
                  el("p", { class: "note-card__title", text: state.tab==='days'?`回到第 ${row.day} 天 08:00 开店前？`:"读取第 " + row.day + " 天（" + row.branch + "）？" }),
                  el("p", { class: "small muted", text: state.tab==='days'?'恢复到当天 08:00 开店前，当天已经发生的经营会回退；读取前先备份当前进度。':row.recoveryNote || "读取前会备份当前世界，再建立新分支。中断牌局只能从当前小局开头继续。" }),
                  el("div", { style: { display: "flex", gap: "8px" } }, [
                    el("button", {
                      class: "btn btn--primary", type: "button", text: "确认读取",
                      onclick: async (event2) => {
                        const restore = busyButton(event2.currentTarget, "读取中…");
                        const response = await ctx.submit({ requestId: newRequestId("saveload"), type: state.tab==='days'?"saves.loadDay":"saves.load", payload: { archiveId: row.archiveId||row.id||row.saveId, saveId: row.saveId } });
                        restore();
                        if (!response.ok) {
                          body.append(errorView(response.error, null));
                          return;
                        }
                        app.toast("ok", "已读档", "第 " + row.day + " 天，已建立新分支");
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
      if(!rows.length)body.append(el('p',{class:'small muted',text:state.tab==='days'?'这份进度暂没有可用的日初档。旧的即时备份不会被伪造成日初状态；开始下一天后会自动生成。':'还没有备份。'}));

      const fileInput=el('input',{type:'file',accept:'.json,application/json',hidden:true});body.append(fileInput);
      fileInput.addEventListener('change',async()=>{
        const file=fileInput.files?.[0];if(!file)return;
        if(file.size>=10000000){app.toast('error','文件过大','存档应小于 10 MB');return;}
        try{const content=await file.text();JSON.parse(content);
          const box=el('div',{class:'note-card'},[el('p',{text:`导入 ${file.name}？当前世界将先备份。`}),el('button',{class:'btn btn--primary',text:'确认导入',onclick:async event=>{
            const restore=busyButton(event.currentTarget,'导入中…');try{const r=await ctx.submit({requestId:newRequestId('import'),type:'saves.import',payload:{content}});if(!r.ok){body.append(errorView(r.error));return;}app.toast('ok','已导入','已建立新分支');await app.refreshSnapshot();ctx.refresh();}finally{restore();}
          }}),el('button',{class:'btn',text:'取消',onclick:()=>box.remove()})]);body.append(box);
        }catch(e){app.toast('error','存档读取失败',e.message);}
      });
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
            app.toast("ok", "已保存", response.data.archiveId||response.data.save?.saveId||'');
            state.tab='backups';
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
            if(typeof response.data.content!=='string'){app.toast('error','导出不可用','Host 未提供存档文件内容');return;}
            const url=URL.createObjectURL(new Blob([response.data.content],{type:response.data.mimeType})),a=el('a',{href:url,download:response.data.fileName});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
          },
        }),
        el("button", {
          class: "btn btn--ghost", type: "button", text: "导入",
          onclick: async () => {
            fileInput.value='';fileInput.click();
          },
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
