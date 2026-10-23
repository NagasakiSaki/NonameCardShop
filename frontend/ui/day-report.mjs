// frontend/ui/day-report.mjs — 日报：商品销售、服务收入、参赛净盈亏、费用、托管资金分开列示。
import { el, clear, stateView, errorView, newRequestId, busyButton } from "./components.mjs";

export async function openDayReport(app) {
  return app.windows.open({
    id: "day-report",
    title: "当日日报",
    subtitle: "未售卡估值不计收入；赌注本金不计营业所得",
    pauseReason: "查看日报",
    render: async (ctx) => {
      const body = ctx.body;
      body.append(stateView({ kind: "loading", title: "正在结算今日账目…" }));
      const result = await ctx.query("ledger.daily", {});
      clear(body);
      if (!result.ok) {
        body.append(errorView(result.error, () => ctx.refresh()));
        return;
      }
      const ledger = result.data;
      const revenue = ledger.revenue.sealedSales + ledger.revenue.serviceIncome;
      const cost = ledger.cost.procurement + ledger.cost.wages + ledger.cost.rent + ledger.cost.tableFees;
      const combatNet = ledger.combat.stakeOut - ledger.combat.stakeIn;

      body.append(el("div", { class: "grid-2" }, [
        el("div", { class: "section" }, [
          el("h4", { class: "section__title", text: "收入" }),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "密封商品销售" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.revenue.sealedSales) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "服务收入" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.revenue.serviceIncome) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "小计" }), el("span", { class: "stat-row__value", text: app.formatMoney(revenue) })]),
        ]),
        el("div", { class: "section" }, [
          el("h4", { class: "section__title", text: "费用" }),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "采购" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.cost.procurement) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "工资" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.cost.wages) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "租金" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.cost.rent) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "桌费" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.cost.tableFees) })]),
          el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "小计" }), el("span", { class: "stat-row__value", text: app.formatMoney(cost) })]),
        ]),
      ]));

      body.append(el("div", { class: "section" }, [
        el("h4", { class: "section__title", text: "对局与托管" }),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "参赛净盈亏" }), el("span", { class: "stat-row__value", text: app.formatMoney(combatNet) })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "抽水" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.combat.rake) })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "托管资金（不计收入）" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.escrow.held) })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "未售卡估值（不计收入）" }), el("span", { class: "stat-row__value", text: app.formatMoney(ledger.unsoldValuation) })]),
        el("p", { class: "small muted", text: ledger.note }),
      ]));

      const confirmBox = el("div");
      body.append(confirmBox);

      ctx.setFooter([
        el("button", {
          class: "btn btn--primary", type: "button", text: "开始下一天",
          onclick: () => {
            clear(confirmBox);
            confirmBox.append(el("div", { class: "note-card" }, [
              el("p", { class: "note-card__title", text: "确认开始下一天？" }),
              el("p", { class: "small muted", text: "垃圾桶会被清空；未售卡与托管资金按规则结转。此操作由 Host 结算。" }),
              el("div", { style: { display: "flex", gap: "8px" } }, [
                el("button", {
                  class: "btn btn--primary", type: "button", text: "确认",
                  onclick: async (event) => {
                    const restore = busyButton(event.currentTarget, "结算中…");
                    const response = await ctx.submit({ requestId: newRequestId("nextday"), type: "business.nextDay", payload: {} });
                    restore();
                    if (!response.ok) {
                      confirmBox.append(errorView(response.error, null));
                      return;
                    }
                    app.toast("ok", "进入第 " + response.data.day + " 天", "垃圾桶已清空");
                    app.refreshSnapshot();
                    ctx.handle.close();
                  },
                }),
                el("button", { class: "btn btn--ghost", type: "button", text: "取消", onclick: () => clear(confirmBox) }),
              ]),
            ]));
          },
        }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
