// frontend/ui/management.mjs — 保留的经营入口：设施升级、员工与街坊、待处理订单。
import { el, clear, stateView, errorView, newRequestId, busyButton } from "./components.mjs";

export async function openManagement(app) {
  const state = { tab: "upgrades" };

  return app.windows.open({
    id: "management",
    title: "店铺经营",
    subtitle: "等级、费用与效果全部来自 Host，UI 不做累加",
    width: "window--wide",
    pauseReason: "查看经营",
    render: async (ctx) => {
      const body = ctx.body;
      body.append(el("div", { class: "tabs" }, [
        ["upgrades", "设施与升级"], ["people", "员工与街坊"], ["orders", "待办订单"],
      ].map(([id, label]) => el("button", {
        class: "tab", type: "button", text: label, "aria-selected": String(state.tab === id),
        onclick: () => { state.tab = id; ctx.refresh(); },
      }))));

      const content = el("div", { class: "section" });
      body.append(content);
      if (state.tab === "upgrades") await renderUpgrades(content);
      else if (state.tab === "people") await renderPeople(content);
      else await renderOrders(content);

      function unavailableNotice(node, data) {
        if (data && data.available === false) {
          node.append(stateView({
            kind: "empty",
            title: "该入口尚未接入正式接口",
            body: data.message || "Host 暂未开放这类数据；界面保留入口并隐藏不可执行动作。",
          }));
          return true;
        }
        return false;
      }

      async function renderUpgrades(node) {
        const result = await ctx.query("management.upgrades");
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        if (!unavailableNotice(node, result.data)) for (const upgrade of result.data.items) {
          node.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [upgrade.name, el("span", { class: "chip", text: "Lv " + upgrade.level + "/" + upgrade.maxLevel })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "效果" }), el("span", { class: "stat-row__value", text: upgrade.effect })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "下一档费用" }), el("span", { class: "stat-row__value", text: app.formatMoney(upgrade.nextCost) })]),
            upgrade.unlocked ? null : el("p", { class: "small badge badge--warn", text: "解锁条件：" + (upgrade.unlockHint || "未满足") }),
            el("button", {
              class: "btn btn--sm btn--primary", type: "button", text: "购买下一档",
              disabled: !upgrade.unlocked,
              onclick: async (event) => {
                const restore = busyButton(event.currentTarget, "采购中…");
                const response = await ctx.submit({ requestId: newRequestId("upgrade"), type: "upgrades.purchase", payload: { upgradeId: upgrade.upgradeId } });
                restore();
                if (!response.ok) {
                  app.toast("error", response.error.code, response.error.message);
                  return;
                }
                app.toast("ok", "已升级", app.formatMoney(response.data.spent));
                ctx.refresh();
                app.refreshSnapshot();
              },
            }),
          ]));
        }
      }

      async function renderPeople(node) {
        const result = await ctx.query("management.people");
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        node.append(el("h4", { class: "section__title", text: "员工" }));
        for (const staff of result.data.items) {
          node.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [staff.name, el("span", { class: "chip", text: staff.role })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "每日工资" }), el("span", { class: "stat-row__value", text: app.formatMoney(staff.wage) })]),
            el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "状态" }), el("span", { class: "stat-row__value", text: staff.hired ? "在职 · " + staff.mood : "未雇佣" })]),
            el("p", { class: "small muted", text: staff.note }),
            el("button", {
              class: "btn btn--sm", type: "button", text: staff.hired ? "安排轮班" : "雇佣",
              onclick: async () => {
                const response = await ctx.submit({ requestId: newRequestId("staff"), type: "neighbors.act", payload: { personId: staff.personId, action: staff.hired ? "schedule" : "hire" } });
                if (!response.ok) app.toast("error", response.error.code, response.error.message);
                else app.toast("ok", "已记录", response.data.note || "");
              },
            }),
          ]));
        }

        node.append(el("h4", { class: "section__title", text: "街坊" }));
        for (const neighbor of result.data.neighbors) {
          node.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [neighbor.name, el("span", { class: "chip", text: "关系 " + neighbor.relation })]),
            el("p", { class: "small", text: "“" + neighbor.dialog + "”" }),
            neighbor.pending ? el("div", { class: "note-card", style: { background: "rgba(232,182,74,0.06)" } }, [
              el("p", { class: "note-card__title" }, [
                neighbor.pending.kind === "offer" ? "街坊出售实物" : neighbor.pending.kind === "booking" ? "预约请求" : "收卡申请",
                el("span", { class: "chip", text: "第 " + neighbor.pending.day + " 天" }),
              ]),
              neighbor.pending.kind === "booking"
                ? el("p", { class: "small muted", text: "借用对战房办小型赛，报酬 " + app.formatMoney(neighbor.pending.fee) })
                : el("div", {}, [
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "想收的卡" }), el("span", { class: "stat-row__value", text: neighbor.pending.cardName + " ×" + neighbor.pending.quantity })]),
                    el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "出价" }), el("span", { class: "stat-row__value", text: app.formatMoney(neighbor.pending.offer) })]),
                    el("p", { class: "small muted", text: neighbor.pending.note || "" }),
                  ]),
              el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap", marginTop: "6px" } }, [
                el("button", {
                  class: "btn btn--sm btn--primary", type: "button", text: neighbor.pending.kind === "offer"?'支付并收下':neighbor.pending.kind === "booking" ? "接下预约" : "接下申请",disabled:neighbor.pending.status==='accepted',
                  onclick: async (event) => {
                    const restore = busyButton(event.currentTarget, "提交中…");
                    const response = await ctx.submit({ requestId: newRequestId("neighbor"), type: "neighbors.act", payload: { personId: neighbor.personId, action: neighbor.pending.kind==='offer'?'buy':'accept',orderId:neighbor.pending.orderId, pendingKind: neighbor.pending.kind } });
                    restore();
                    if (!response.ok) app.toast("error", response.error.code, response.error.message);
                    else { app.toast("ok", "已接单", response.data.note || ""); ctx.refresh(); }
                  },
                }),
                el("button", {
                  class: "btn btn--sm", type: "button", text: neighbor.pending.kind === "booking" ? "交付场地" : "交付卡牌",
                  disabled:neighbor.pending.kind==='offer'||neighbor.pending.status==='offered',
                  onclick: async (event) => {
                    const restore = busyButton(event.currentTarget, "交付中…");
                    const response = await ctx.submit({ requestId: newRequestId("neighbor"), type: "neighbors.act", payload: { personId: neighbor.personId, action: "deliver", pendingKind: neighbor.pending.kind } });
                    restore();
                    if (!response.ok) app.toast("error", response.error.code, response.error.message);
                    else { app.toast("ok", "已交付", response.data.note || ""); ctx.refresh(); app.refreshSnapshot(); }
                  },
                }),
                el("button", {
                  class: "btn btn--sm btn--ghost", type: "button", text: "拒绝",
                  onclick: async (event) => {
                    const restore = busyButton(event.currentTarget, "处理中…");
                    const response = await ctx.submit({ requestId: newRequestId("neighbor"), type: "neighbors.act", payload: { personId: neighbor.personId, action: "decline" } });
                    restore();
                    if (!response.ok) app.toast("error", response.error.code, response.error.message);
                    else { app.toast("info", "已拒绝", response.data.note || ""); ctx.refresh(); }
                  },
                }),
              ]),
            ]) : null,
          ]));
        }
      }

      async function renderOrders(node) {
        const result = await ctx.query("management.orders");
        if (!result.ok) {
          node.append(errorView(result.error, () => ctx.refresh()));
          return;
        }
        if (unavailableNotice(node, result.data)) return;
        if (!result.data.items.length) {
          node.append(stateView({ kind: "empty", title: "没有未完成的订单", body: "进货订单可在进货柜台签收。" }));
          return;
        }
        for (const order of result.data.items) {
          node.append(el("div", { class: "note-card" }, [
            el("p", { class: "note-card__title" }, [order.orderId, el("span", { class: "badge", text: order.status })]),
            el("p", { class: "small muted", text: order.themeName + " " + order.productVersion + " · " + order.quantity + (order.unit === "box" ? " 盒" : " 包") + " · " + app.formatMoney(order.total) }),
          ]));
        }
      }

      ctx.setFooter([el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() })]);
    },
  });
}
