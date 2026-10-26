// frontend/ui/combat-room.mjs — 对战房：桌位、配队、倍数提议、开桌费与战斗挂载区。
import { el, clear, stateView, errorView, newRequestId, busyButton } from "./components.mjs";
import {performOperation,recoverOperation} from '../../frontend-next/services/operations.mjs';
import {fitPanel} from '../../frontend-next/services/panel-shell.mjs';

const STATUS_LABEL = {
  idle: "空闲",
  waiting: "等待对手",
  reserved: "已预约",
  "in-progress": "进行中",
  settling: "待结算",
  error: "异常待恢复",
};

export async function openCombat(app, options = {}) {
  const state = { selectedTable: options.tableId || null, mode: "kof", picked: [], preview: null, mount: null, matchId: null, noStake: true,off:null,controller:null,mounting:false };

  return app.windows.open({
    id: "combat",
    title: "对战房",
    subtitle: "对局期间店内时间暂停，整场结束后经过 30 分钟",
    width: "window--wide",
    pauseReason: "对战房",
    onClose: () => {
      state.off?.();state.off=null;
      state.controller?.abort();
      if (state.mount) {
        Promise.resolve(state.mount.dispose()).catch(e=>app.toast('error','牌局视图关闭失败',e.message));
        state.mount = null;
      }
    },
    render: async (ctx) => {
      const body = ctx.body;
      if(options.battleOnly)fitPanel(ctx);
      const rooms = await ctx.query("room.snapshot", { roomId: "battle-room" });
      if (!rooms.ok) {
        body.append(errorView(rooms.error, () => ctx.refresh()));
        return;
      }
      const room = rooms.data;
      const settings=await ctx.query('room.settings');
      if(settings.ok&&!options.battleOnly){const input=el('input',{type:'number',min:settings.data.min,max:settings.data.max,value:settings.data.amount,'aria-label':'开桌费',class:'input',style:{maxWidth:'100px'}});body.append(el('div',{class:'toolbar'},[el('label',{},['开桌费 ',input]),el('button',{class:'btn btn--sm',text:'保存桌费',onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('table-fee'),type:'room.setTableFee',payload:{amount:Number(input.value)}});if(!r.ok)app.toast('error','未能保存',r.error.message);else ctx.refresh();}})]));}
      state.controller?.abort();state.controller=new AbortController();
      if(!state.off){state.off=app.host.subscribe(event=>{if(event.type!=='battleStatusChanged'||!state.matchId||event.data?.matchId!==state.matchId)return;if(event.data.status!=='running')ctx.refresh();else {const button=ctx.element.querySelector('[data-bout-surrender]');if(button)button.disabled=event.data.lastReadyGameId!==event.data.gameId;}});}
      if(state.mount){await state.mount.dispose();state.mount=null;}
      const active=(room.matches||[]).find(m=>!m.background&&m.status!=='finished');
      if(active){state.matchId=active.matchId;state.selectedTable=active.tableId;}
      if(active&&options.battleOnly){renderBattle(active);return;}
      if(!active&&options.battleOnly){const finished=room.matches.find(m=>m.matchId===state.matchId);body.append(el('h3',{text:finished?.result==='win'?'本场获胜':finished?.result==='loss'?'本场落败':finished?.result==='draw'?'本场平局':'牌局已结束'}),el('p',{text:finished?.timeSession?.applied?'店内时间已过去 30 分钟。':'可以关闭窗口回到店铺。'}));ctx.setFooter(el('button',{class:'btn',text:'返回店铺',onclick:()=>ctx.handle.close()}));return;}

      body.append(el("div", { class: "section" }, [
        el("h4", { class: "section__title", text: "桌位" }),
        el("div", { class: "grid-auto" }, room.tables.map((table) => el("div", {
          class: "note-card",
          style: { borderColor: state.selectedTable === table.tableId ? "rgba(232,182,74,0.7)" : undefined, cursor: "pointer" },
          onclick: () => { state.selectedTable = table.tableId; state.preview = null; state.picked = []; ctx.refresh(); },
        }, [
          el("p", { class: "note-card__title" }, [table.label, el("span", { class: "chip", text: STATUS_LABEL[table.status] || table.status })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "模式" }), el("span", { class: "stat-row__value", text: table.mode })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "座位" }), el("span", { class: "stat-row__value", text: table.seated + " / " + table.maxSeats })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "基础注 / 最终注" }), el("span", { class: "stat-row__value", text: app.formatMoney(table.stake.base) + " → " + app.formatMoney(table.stake.final) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "开桌费 / 抽水" }), el("span", { class: "stat-row__value", text: app.formatMoney(table.fee) + " / " + Math.round(table.rakeRate * 100) + "%" })]),
          table.note ? el("p", { class: "small muted", text: table.note }) : null,
          table.status === "error" ? el("p", { class: "small badge badge--warn", text: "异常待恢复：需要 Host 复核后重新开局，前端不会自行解锁" }) : null,
          table.status === "settling" ? el("p", { class: "small muted", text: "待结算：赛果由引擎验证后提交，不显示为已到账" }) : null,
          (room.matches||[]).find(m=>m.matchId===table.matchId&&m.background) ? el('button',{class:'btn btn--sm',text:'取消 NPC 后台桌',onclick:async event=>{event.stopPropagation();const r=await ctx.submit({requestId:newRequestId('npc-cancel'),type:'room.cancelNpcMatch',payload:{matchId:table.matchId}});if(!r.ok)app.toast('error',r.error.code,r.error.message);else ctx.refresh();}}):null,
        ]))),
        el("p", { class: "small muted", text: room.note }),
      ]));
      for(const match of (room.matches||[]).filter(m=>m.background&&m.error).slice(-3))body.append(el('p',{class:'note-card',text:'最近 NPC 对局技术中断（不计正常战绩）：'+match.error}));
      for(const match of (room.matches||[]).filter(m=>m.simulated&&m.status==='finished'&&m.result!=='cancelled').slice(-3).reverse())body.append(el('p',{class:'note-card',text:`NPC 模拟比赛已结束 · ${match.mode.toUpperCase()} · 三将接力 · 已离桌，桌费 ${app.formatMoney(match.simulation.feePaid)} 已结算`}));
      if(active){renderBattle(active);return;}
      const queued=await ctx.query('combat.queue');
      if(queued.ok&&queued.data.player){body.append(el('p',{class:'note-card',text:'已在等待对手。可以关闭这里，回店内自由行动。'}),el('button',{class:'btn',text:'返回店内',onclick:()=>ctx.handle.close()}));return;}
      if(state.matchId){const finished=(room.matches||[]).find(m=>m.matchId===state.matchId);if(finished?.status==='finished')body.append(el('p',{class:'note-card',text:`比赛已结束：${finished.result}，小局 ${finished.wins}:${finished.losses}`}));state.matchId=null;}

      if (!state.selectedTable) {
        body.append(stateView({ kind: "empty", title: "先选一张牌桌", body: "桌位状态由 Host 提供；旁观不计费。" }));
        return;
      }

      // 配队
      const eligible = await ctx.query("combat.eligible", { mode: state.mode });
      const slots = eligible.ok ? eligible.data.slots : 3;
      const eligibleItems = eligible.ok ? eligible.data.items : [];
      body.append(el("div", { class: "section" }, [
        el("h4", { class: "section__title", text: "可用阵容（" + slots + " 个位置）" }),
        el("div", { class: "toolbar" }, [
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "模式" }),
            el("select", {
              class: "select",
              value:state.mode,
              onchange: (event) => { state.mode = event.target.value; state.picked = []; state.preview = null; ctx.refresh(); },
            }, [el("option", { value: "kof", text: "KOF 三将",selected:state.mode==='kof' })]),
          ]),
          el("label", { class: "field" }, [
            el("span", { class: "field__label", text: "赌注" }),
            el("select", {
              class: "select",
              onchange: (event) => { state.noStake = event.target.value === "none"; state.preview = null; ctx.refresh(); },
            }, [el("option", { value: "none", text: "无赌注对战",selected:state.noStake }),el("option", { value: "stake", text: "按提议倍数下注",disabled:!app.connection.capabilities.wagering,selected:!state.noStake })]),
          ]),
          el("button", { class: "btn btn--sm", type: "button", text: "清空选择", onclick: () => { state.picked = []; state.preview = null; ctx.refresh(); } }),
        ]),
      ]));

      // 出阵次序：KOF 三个位置固定，顺序就是先手位 → 中坚 → 收尾
      const slotStrip = el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } });
      const modeLabel = "三将接力";
      for (let index = 0; index < slots; index += 1) {
        const ref = state.picked[index];
        const pickedCard = ref ? eligibleItems.find((item) => item.inventoryRef === ref) : null;
        slotStrip.append(el("button", {
          class: "btn btn--sm",
          type: "button",
          disabled: !pickedCard,
          title: pickedCard ? "点击移除" : "空位",
          text: (state.mode === "kof" ? ["1 号先手位", "2 号中坚", "3 号收尾"][index] : "单将位") + "：" + (pickedCard ? pickedCard.name : "空"),
          onclick: () => {
            state.picked = state.picked.filter((value) => value !== ref);
            state.preview = null;
            ctx.refresh();
          },
        }));
      }

      if (!eligible.ok) {
        body.append(errorView(eligible.error, null));
      } else {
        body.append(slotStrip);
        body.append(el("p", { class: "small muted", text: modeLabel + " 的出阵顺序按点击先后记录，先选的排在前；点上方位置可撤回。" }));
        const grid = el("div", { class: "grid-auto" });
        for (const item of eligible.data.items) {
          const picked = state.picked.includes(item.inventoryRef);
          grid.append(el("button", {
            class: "card-tile", type: "button",
            style: { borderColor: picked ? "rgba(232,182,74,0.8)" : undefined, opacity: item.eligible ? "1" : "0.5" },
            disabled: !item.eligible || (!picked && state.picked.length >= slots),
            onclick: () => {
              if (picked) state.picked = state.picked.filter((ref) => ref !== item.inventoryRef);
              else if (state.picked.length < slots) state.picked.push(item.inventoryRef);
              state.preview = null;
              ctx.refresh();
            },
          }, [
            el("div", { class: "card-tile__body" }, [
              el("span", { class: "card-tile__name", text: item.name }),
              el("span", { class: "card-tile__meta" }, [
                el("span", { class: "rarity rarity--" + item.rarity, text: item.rarity }),
                el("span", { class: picked ? "chip chip--protect" : "chip", text: picked ? "已选" : item.eligible ? "可用" : "不可用" }),
              ]),
              item.reasons && item.reasons.length ? el("span", { class: "small muted", text: item.reasons[0].message }) : null,
            ]),
          ]));
        }
        body.append(grid);

        body.append(el("div", { class: "toolbar" }, [
          el('button',{class:'btn btn--primary',text:'开始等待对手',disabled:state.picked.length!==slots,onclick:async event=>{
            const restore=busyButton(event.currentTarget,'正在报名…'),operation=app.queueOperation??={};
            try{const r=await performOperation(app,ctx,operation,{requestId:newRequestId('queue-join'),type:'combat.joinQueue',payload:{mode:state.mode,tableId:state.selectedTable,inventoryRefs:[...state.picked]}});if(r.ok)ctx.handle.close();else app.toast('error','报名尚未完成',r.error.message);}finally{restore();}
          }}),
          el("button", {
            class: "btn btn--primary", type: "button", text: "生成参赛预览",
            disabled: state.picked.length === 0,
            onclick: async (event) => {
              const restore = busyButton(event.currentTarget, "预览中…");
              const preview = await ctx.query("combat.preview", { mode: state.mode, tableId: state.selectedTable, inventoryRefs: state.picked, withStake: !state.noStake, noStake: state.noStake });
              restore();
              if (!preview.ok) {
                body.append(errorView(preview.error, null));
                return;
              }
              state.preview = preview.data;
              ctx.refresh();
            },
          }),
        ]));

        if (state.preview) {
          const preview = state.preview;
          body.append(el("div", { class: "note-card", style: { borderColor: "rgba(232,182,74,0.5)" } }, [
            el("p", { class: "note-card__title", text: "确认参赛" }),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "我方阵容（按次序）" }), el("span", { class: "stat-row__value", text: preview.lineup.map((item, index) => (state.mode === "kof" ? index + 1 + ". " : "") + item.name + "（" + item.rarity + "）").join(" / ") })]),
            preview.opponent ? el("div", { class: "stat-row" }, [
              el("span", { class: "stat-row__label", text: "对手" }),
              el("span", { class: "stat-row__value", text: preview.opponent.name + " · " + preview.opponent.record }),
            ]) : null,
            preview.opponent && preview.opponent.raritySummary ? el("div", { class: "stat-row" }, [
              el("span", { class: "stat-row__label", text: "对手稀有度" }),
              el("span", { class: "stat-row__value", text: ["N", "R", "SR", "SSR"].map((rarity) => rarity + " " + (preview.opponent.raritySummary[rarity] || 0)).join(" / ") }),
            ]) : null,
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: preview.noStake ? "赌注" : "NPC 提议倍数" }), el("span", { class: "stat-row__value", text: preview.noStake ? "无赌注" : "×" + preview.stakeProposal.multiplier })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "基础注 → 最终注" }), el("span", { class: "stat-row__value", text: app.formatMoney(preview.stakeProposal.base) + " → " + app.formatMoney(preview.stakeProposal.final) })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "店主开桌费 / 对手桌费" }), el("span", { class: "stat-row__value", text: app.formatMoney(preview.fee)+' / '+app.formatMoney(preview.opponentFee??preview.fee) })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "可用余额" }), el("span", { class: "stat-row__value", text: app.formatMoney(preview.balance) })]),
            el("p", { class: "small muted", text: "倍数理由：" + preview.stakeProposal.reason }),
            el("p", { class: "small muted", text: "规则：" + preview.rules.join("；") }),
            el("div", { style: { display: "flex", gap: "8px", flexWrap: "wrap" } }, [
            el("button", {
              class: "btn", type: "button", text: "拒绝该倍数",
              onclick: () => {
                state.preview = null;
                app.toast("info", "已拒绝提议", "倍数由 Host 给出，拒绝后可以换桌或换无赌注");
                ctx.refresh();
              },
            }),
            el("button", {
              class: "btn btn--ghost", type: "button", text: "要求降注（待接入）",
              title: "降注需要 Host 提供重新报价的命令，见接口缺口文档",
              onclick: () => app.toast("error", "尚未接入", "降注需要 Host 支持重新报价（接口缺口已登记），前端不会自行改倍数"),
            }),
            el("button", {
              class: "btn btn--primary", type: "button", text: "确认参赛（冻结阵容与托管）",
              onclick: async (event) => {
                const restore = busyButton(event.currentTarget, "登记中…");
                const response = await ctx.submit({ requestId: newRequestId("combat"), type: "combat.register", previewId: preview.previewId, payload: { mode: state.mode, tableId: state.selectedTable, stakeProposalId: preview.stakeProposal.proposalId } });
                restore();
                if (!response.ok) {
                  body.append(errorView(response.error, null));
                  return;
                }
                state.matchId = response.data.match.matchId;
                app.toast("ok", "已登记", response.data.note || "");
                ctx.refresh();
                app.refreshSnapshot();
              },
            }),
            ]),
          ]));
        }
      }

      function renderBattle(match){
      async function mountBoard(button){
        if(!state.matchId||ctx.handle.closed||state.mounting)return;
        state.mounting=true;
        const startButton=ctx.element.querySelector('[data-mount-board]');if(startButton){startButton.disabled=true;startButton.textContent='正在载入牌局…';}
        const restore=button?busyButton(button,'载入中…'):()=>{};
        try{if(state.mount)await state.mount.dispose();mountBox.replaceChildren();state.mount=await ctx.host.battle.mount({container:mountBox,matchId:state.matchId,signal:state.controller.signal});}
        catch(error){if(!ctx.handle.closed&&error.code!=='MOUNT_CANCELLED'&&error.name!=='AbortError'){app.toast('error','牌局载入失败',error.message);ctx.refresh();}}
        finally{state.mounting=false;restore();if(!ctx.handle.closed&&startButton?.isConnected){const r=await ctx.query('room.snapshot');const latest=r.ok?r.data.matches.find(m=>m.matchId===state.matchId):null;startButton.disabled=latest?.status==='running';if(startButton.disabled)startButton.textContent='牌局进行中';}}
      }
      // 战斗挂载区
      const mountBox = el("div", { class: "battle-mount", id: "battle-mount" }, [
        el("p", { text: "正在准备牌局…" }),
      ]);
      body.append(el("div", { class: "section",style:options.battleOnly?{display:'flex',flexDirection:'column',flex:'1',minHeight:'0'}:{} }, [
        el("h4", { class: "section__title", text: "牌局" }),
        mountBox,
        el("div", { style: { display: "flex", gap: "8px", marginTop: "8px", flexWrap: "wrap" } }, [
          el("button", {
            class: "btn btn--sm", type: "button", text: match?.status==='awaitingNext'?'开始下一局':match?.status==='interrupted'?'重开本局（重新发牌）':'开始对局',
            'data-mount-board':'true',
            disabled:match?.status==='running',onclick:event=>mountBoard(event.currentTarget),
          }),
          el("button", {
            class: "btn btn--sm btn--danger", type: "button", text: "本局认输",
            'data-bout-surrender':'true',
            disabled:match?.status!=='running'||match?.lastReadyGameId!==match?.gameId,
            onclick: async () => {
              const response = await ctx.submit({ requestId: newRequestId("surrender"), type: "combat.surrender", payload: { matchId: state.matchId,scope:'bout' } });
              if (!response.ok) {
                app.toast("error", response.error.code, response.error.message);
                return;
              }
              app.toast("info", "已认输", response.data.note || "返店不等于退款");
              app.refreshSnapshot();
              ctx.refresh();
            },
          }),
          el('button',{class:'btn btn--sm',text:'整场认输',onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('match-surrender'),type:'combat.surrender',payload:{matchId:state.matchId,scope:'match'}});if(!r.ok)app.toast('error',r.error.code,r.error.message);else ctx.refresh();}}),
          match&&!match.serviceRecognized&&!match.results?.length?el('button',{class:'btn btn--sm',text:'取消未开局比赛',onclick:async()=>{const r=await ctx.submit({requestId:newRequestId('match-cancel'),type:'combat.cancel',payload:{matchId:match.matchId}});if(!r.ok)app.toast('error',r.error.code,r.error.message);else ctx.refresh();}}):null,
          options.battleOnly?null:el("button", {
            class: "btn btn--sm btn--ghost", type: "button", text: "回主店",
            onclick: () => { app.navigateScene("store"); ctx.handle.close(); },
          }),
        ]),
        el("p", { class: "small muted", text: match?`三将接力 ${match.wins}:${match.losses}。关闭窗口会中断当前小局，重开时重新发牌；整场结束前店内时间保持暂停。`:'确认参赛后即可开始牌局。' }),
      ]));
      if(match?.error)body.append(el('p',{class:'note-card',text:match.error}));

      ctx.setFooter([el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() })]);
      if(options.autoStart&&match?.status==='prepared')void mountBoard();
      }
      renderBattle(null);
    },
  });
}
