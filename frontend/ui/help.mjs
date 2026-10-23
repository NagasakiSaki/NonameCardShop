// frontend/ui/help.mjs — 店主手册：操作、界面约定与“哪些数字不是我算的”。
import { el } from "./components.mjs";

const SECTIONS = [
  {
    title: "移动与交互",
    items: [
      "WASD / 方向键移动；触屏设备显示左下角方向键。",
      "点击地面走过去；点击柜台会先走到可站的位置再交互。",
      "靠进交互点后按 E，或点右侧手账里的导航按钮。",
      "按方向键会取消正在进行的自动寻路与待触发的交互。",
    ],
  },
  {
    title: "窗口与暂停",
    items: [
      "B 打开背包，Esc 关闭最上层窗口，嵌套窗口逐层关闭。",
      "每个窗口都会申请一把暂停令牌；关窗才释放自己那把。",
      "手动暂停不会被关窗清掉，需要再按一次才恢复。",
      "窗口打开时地图不响应移动，也不允许提交业务操作（除非已成功暂停）。",
    ],
  },
  {
    title: "经营流程",
    items: [
      "进货柜台：订货 → 获取报价 → 确认下单（冻结价格）→ 签收。",
      "开包柜台：预览范围 → 确认开包 → 逐张 / 只看 SR+ / 汇总 → 留一，其余上架。",
      "零售货架只放密封包与整盒；单卡交易在二级市场柜台。",
      "日报把商品销售、服务收入、参赛净额、费用与托管资金分开列示。",
    ],
  },
  {
    title: "哪些数字不是我算的",
    items: [
      "全局评分、四档稀有度、卡池分布、整盒定额、报价与抽水都由 Host 给出。",
      "卡种占比不等于抽到该档的概率；每包平均水平也不等于“每包至少一张”的概率。",
      "挂单不等于成交，在售不计入可用资金；赌注本金不计营业所得。",
      "评分不是胜率；样本不足时界面会直接写“实战样本不足”。",
    ],
  },
  {
    title: "演示模式",
    items: [
      "地址带 ?mode=mock 时使用前端演示数据，左上角有橙色标记。",
      "正式模式需要 /integration/frontend-host.mjs；缺失时只报错，不会偷偷切回演示数据。",
      "演示模式的交易与赛果只证明页面流程走通，不代表正式经济与引擎验收。",
    ],
  },
];

export async function openHelp(app) {
  return app.windows.open({
    id: "help",
    title: "店主手册",
    subtitle: "操作、暂停规则与数据来源",
    pauseReason: "阅读手册",
    render: async (ctx) => {
      for (const section of SECTIONS) {
        ctx.body.append(el("div", { class: "section" }, [
          el("h4", { class: "section__title", text: section.title }),
          el("ul", { class: "note-list" }, section.items.map((item) => el("li", {}, [el("span", { text: item })]))),
        ]));
      }
      ctx.setFooter([
        el("button", { class: "btn", type: "button", text: "打开任务台", onclick: () => app.openPanel("tasks", {}) }),
        el("button", { class: "btn btn--ghost", type: "button", text: "关闭", onclick: () => ctx.handle.close() }),
      ]);
    },
  });
}
