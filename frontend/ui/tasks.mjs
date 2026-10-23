// frontend/ui/tasks.mjs — 任务与引导：每个任务指向地图上的具体交互点，路径由场景与 Host 可交互状态决定。
import { el, clear, stateView, errorView, newRequestId, busyButton } from "./components.mjs";

export async function openTasks(app) {
  return app.windows.open({
    id: "tasks",
    title: "今日任务",
    subtitle: "点击“前往”会走到对应柜台，再按提示交互",
    pauseReason: "查看任务",
    render: async (ctx) => {
      const body = ctx.body;
      body.append(stateView({ kind: "loading", title: "正在读取任务…" }));
      const result = await ctx.query("tasks.list");
      clear(body);
      if (!result.ok) {
        body.append(errorView(result.error, () => ctx.refresh()));
        return;
      }
      for (const task of result.data.items) {
        const done = task.progress >= task.goal;
        body.append(el("div", { class: "note-card" }, [
          el("p", { class: "note-card__title" }, [
            task.title,
            el("span", { class: done ? "badge badge--ok" : "badge", text: done ? (task.claimed ? "已领取" : "可领取") : "进行中" }),
          ]),
          el("div", { class: "progress" }, [el("div", { class: "progress__bar", style: { width: Math.min(100, Math.round(task.progress / task.goal * 100)) + "%" } })]),
          el("p", { class: "small muted", text: "进度 " + Math.min(task.progress, task.goal) + " / " + task.goal + " " + task.unit + " · 奖励 " + app.formatMoney(task.reward) }),
          el("p", { class: "small muted", text: task.hint }),
          el("div", { style: { display: "flex", gap: "6px" } }, [
            el("button", {
              class: "btn btn--sm", type: "button", text: "前往",
              onclick: () => {
                const moved = app.goToInteraction(task.target);
                if (!moved) app.toast("error", "找不到引导目标", task.target);
              },
            }),
            el("button", {
              class: "btn btn--sm btn--primary", type: "button", text: "领取奖励", disabled: !done || task.claimed,
              onclick: async (event) => {
                const restore = busyButton(event.currentTarget, "领取中…");
                const response = await ctx.submit({ requestId: newRequestId("task"), type: "tasks.claim", payload: { taskId: task.taskId } });
                restore();
                if (!response.ok) {
                  app.toast("error", response.error.code, response.error.message);
                  return;
                }
                app.toast("ok", "已领取", app.formatMoney(response.data.reward));
                ctx.refresh();
                app.refreshSnapshot();
              },
            }),
          ]),
        ]));
      }
      ctx.setFooter([el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() })]);
    },
  });
}
