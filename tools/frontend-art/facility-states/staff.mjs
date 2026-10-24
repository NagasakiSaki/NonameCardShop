// deliverables/playability-v3/FAST-03/src/staff.mjs
// 收银台（cashier）与补货台（stocker）状态（未雇佣/当班/休息）纯绘制实现。
// 尺寸固定 96×48 world px（192×96 canvas px，ART_SCALE=2）。
// 原点 (0,0)，footY=48，blocks=[[0, 26, 96, 22]]，严格保持既有碰撞。
// 仅作为工作台上的状态展示，不宣称可行走员工或休息免扣工资。
import { mix } from '../pixkit.mjs';
import { C } from './palette.mjs';
import { createKit, panel, wood, boxItem, cardItem, contactShadow } from './drawing-kit.mjs';

export const STAFF_COUNTER_META = {
  w: 96,
  h: 48,
  footY: 48,
  blocks: [[0, 26, 96, 22]],
  stand: [48, 56],
  occludes: true,
};

// 基础柜台底架
function counterChassis(k, frontColor) {
  wood(k, 0, 16, 96, 30);
  k.r(2, 18, 92, 3, C.edge);
  k.r(2, 40, 92, 3, C.woodDark);
  for (let i = 0; i < 3; i++) {
    const x = 5 + i * 31;
    panel(k, x, 24, 25, 15, frontColor);
    k.r(x + 10, 26, 6, 1, C.gold);
  }
}

// 柜台正面标识牌
function counterPlaque(k, glyph, badgeColor) {
  panel(k, 8, 26, 18, 10, badgeColor);
  k.r(9, 27, 16, 0.5, mix(badgeColor, '#ffffff', 0.4));
  const cx = 8 + 9, cy = 26 + 5;
  if (glyph === 'pay') {
    // 钱币符号
    k.e(cx, cy, 2.5, 2.5, '#f7f4ec');
    k.e(cx, cy, 1.5, 1.5, badgeColor);
    k.r(cx - 0.5, cy - 1.5, 1, 3, mix(badgeColor, C.ink, 0.2));
  } else if (glyph === 'stock') {
    // 入库/补货箭头
    k.r(cx - 0.5, cy - 3, 1, 4, '#f7f4ec');
    k.r(cx - 2, cy - 1, 4, 1, '#f7f4ec');
    k.r(cx - 1, cy, 2, 1, '#f7f4ec');
    k.r(cx - 3, cy + 2, 6, 1, '#f7f4ec');
  }
}

// 工作台状态指示标牌与指示灯
function drawStatusLamp(k, x, y, state) {
  // 状态标牌底托
  panel(k, x, y, 14, 7, '#2b313d');
  if (state === 'unhired') {
    // 未雇佣：灰色熄灭指示灯 + 空缺标识
    k.e(x + 3.5, y + 3.5, 2, 2, C.unhiredGrayDark);
    k.e(x + 3.5, y + 3.5, 1, 1, C.unhiredGray);
    k.r(x + 7, y + 3, 5, 1, C.unhiredGray);
  } else if (state === 'onduty') {
    // 当班：亮绿灯 + 营业绿条
    k.e(x + 3.5, y + 3.5, 2, 2, C.dutyGreenDark);
    k.e(x + 3.5, y + 3.5, 1.5, 1.5, C.dutyGreen);
    k.d(x + 3, y + 3, '#c2ffdb');
    k.r(x + 7, y + 2.5, 5, 2, C.dutyGreen);
  } else if (state === 'resting') {
    // 休息：暖橙灯 + 轮休条
    k.e(x + 3.5, y + 3.5, 2, 2, C.restingAmberDark);
    k.e(x + 3.5, y + 3.5, 1.5, 1.5, C.restingAmber);
    k.d(x + 3, y + 3, '#ffe4b3');
    k.r(x + 7, y + 2.5, 5, 2, C.restingAmber);
  }
}

// 1. 收银台纯绘制：支持 unhired / onduty / resting
export function paintCashierCounter(canvas, { state = 'unhired' } = {}) {
  const k = createKit(canvas);
  contactShadow(k, 96, 48, 0.95, 3);
  counterChassis(k, C.rose);
  counterPlaque(k, 'pay', C.gold);

  // 右侧收银工作台状态指示器
  drawStatusLamp(k, 78, 18, state);

  if (state === 'unhired') {
    // 未雇佣：收银机暗屏关闭、服务铃锁扣、置有“招募中”桌面木牌
    panel(k, 30, 3, 22, 13, '#383e4a');
    k.r(32, 5, 18, 5, '#222833'); // 暗屏
    k.r(32, 11, 18, 3, '#1c202a');

    // 盖有防护软垫
    k.r(31, 2, 20, 1.5, mix(C.wood, C.ink, 0.4));

    // 暗铜服务铃（挂有休眠签）
    k.e(60, 11, 3.5, 2.5, C.bronzeDark);
    k.r(59, 13, 2, 2, C.woodDark);

    // 桌面招聘木牌 "收银员 · 待雇佣"
    panel(k, 68, 6, 20, 9, '#5d4f43');
    k.r(70, 8, 16, 5, C.cream);
    k.r(72, 10, 12, 1, C.ink);
    k.r(77, 14, 2, 4, C.woodDark);

  } else if (state === 'onduty') {
    // 当班：亮屏薄荷绿收银机、金铃铛、找零碟与单卡验票槽
    panel(k, 30, 2, 22, 14, C.slate);
    k.r(32, 4, 18, 6, C.mint); // 亮屏
    k.r(34, 5, 10, 3, '#c8ead9');
    k.r(32, 11, 18, 3, mix(C.slate, C.ink, 0.3));
    // 按键与指示灯
    k.r(34, 12, 3, 1, C.gold);
    k.r(39, 12, 3, 1, C.gold);
    k.r(44, 12, 3, 1, C.gold);
    for (let i = 0; i < 6; i++) {
      k.r(33 + (i % 3) * 6, 8 + Math.floor(i / 3) * 1.5, 4, 1, mix(C.slate, '#ffffff', 0.25));
    }

    // 闪亮服务铃
    k.e(60, 10, 4, 3, C.gold);
    k.e(60, 9, 3, 2, '#ffe5a3');
    k.d(60, 6, C.goldDark);
    k.r(56, 12, 8, 1, C.woodDark);

    // 金币找零碟与零钱
    k.e(74, 12, 4, 2, C.gold);
    k.e(74, 11.5, 3, 1.2, '#ffe5a3');
    k.d(74, 11, C.goldDark);

    // 顾客待结账单卡
    cardItem(k, 86, 9, C.rose);

  } else if (state === 'resting') {
    // 休息：收银机显示屏处于暖橙待机休眠、折叠立牌“暂休中·轮休”、员工水杯
    panel(k, 30, 2, 22, 14, C.slate);
    k.r(32, 4, 18, 6, '#4d3a2b'); // 待机琥珀色暗屏
    k.r(35, 6, 12, 2, C.restingAmber);
    k.r(32, 11, 18, 3, mix(C.slate, C.ink, 0.3));

    // 服务铃前立有“轮休中”亚克力三角立牌
    k.r(54, 7, 14, 8, C.ink);
    k.r(55, 8, 12, 6, C.cream);
    k.r(57, 10, 8, 2, C.restingAmber);
    k.r(60, 14, 2, 3, C.woodDark);

    // 员工休息茶杯
    panel(k, 72, 8, 6, 7, '#506e75');
    k.r(73, 7, 4, 2, '#e8f4f5');
    k.e(75, 7, 1.5, 1, '#9dc5c7');
  }

  return canvas;
}

// 2. 补货工作台纯绘制：支持 unhired / onduty / resting
export function paintStockerCounter(canvas, { state = 'unhired' } = {}) {
  const k = createKit(canvas);
  contactShadow(k, 96, 48, 0.95, 3);
  counterChassis(k, C.woodLight);
  counterPlaque(k, 'stock', C.green);

  // 工作台状态指示器
  drawStatusLamp(k, 78, 18, state);

  if (state === 'unhired') {
    // 未雇佣：工作台整洁关闭、封存木箱未开启、空白挂板
    boxItem(k, 32, 6, '#735742', 16, 10);
    k.r(32, 6, 16, 1, mix('#735742', C.ink, 0.3));

    // 悬挂空白木板
    panel(k, 56, 5, 14, 11, '#5d4f43');
    k.r(58, 7, 10, 7, C.cream);
    k.r(60, 9, 6, 1, C.ink);

    // 待雇佣标识
    panel(k, 74, 7, 18, 8, '#3d383b');
    k.r(76, 9, 14, 4, C.unhiredGray);

  } else if (state === 'onduty') {
    // 当班：拆开的补货纸箱露出品相、胶带卷、清单剪贴板、巡检红笔
    // 打开的纸箱
    boxItem(k, 30, 4, '#a87850', 18, 12);
    k.r(30, 4, 18, 2, mix('#a87850', C.ink, 0.35));
    k.r(32, 1, 5, 3, mix('#a87850', '#fff5d8', 0.25));
    k.r(41, 1, 5, 3, mix('#a87850', '#fff5d8', 0.25));
    // 露出准备上架的亮色卡包
    k.r(34, 4, 5, 4, C.foil[0]);
    k.r(40, 4, 5, 4, C.foil[2]);

    // 备用密封小盒
    boxItem(k, 52, 7, '#8a5a3a', 13, 9);

    // 补货核对清单剪贴板
    panel(k, 69, 4, 16, 12, '#d9c9a6');
    k.r(71, 6, 12, 8, C.paper);
    k.r(73, 7, 8, 0.5, C.blue);
    k.r(73, 9, 8, 0.5, C.blue);
    k.r(73, 11, 5, 0.5, C.dutyGreen); // 已补货勾选
    k.r(74, 3, 6, 2, C.slate);
    // 红色勾线笔
    k.r(77, 13, 6, 0.5, C.rose);

    // 封箱胶带卷
    k.e(24, 18, 4, 2.5, '#c9b8a0');
    k.e(24, 17.5, 2.5, 1.5, '#e2d6bf');

  } else if (state === 'resting') {
    // 休息：纸箱整齐推到一侧、工具盒收纳、“轮休中·定时补货”标牌、水壶
    boxItem(k, 32, 5, '#8a5a3a', 16, 11);

    // 轮休告示木牌
    panel(k, 52, 5, 20, 10, '#4e3f36');
    k.r(54, 7, 16, 6, C.cream);
    k.r(56, 9, 12, 2, C.restingAmber);
    k.r(61, 14, 2, 4, C.woodDark);

    // 员工保温水壶
    panel(k, 22, 12, 5, 8, '#46616e');
    k.r(23, 10, 3, 2, C.silver);
    k.r(21, 14, 1, 4, C.ink);
  }

  return canvas;
}
