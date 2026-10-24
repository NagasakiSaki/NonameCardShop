// deliverables/playability-v3/FAST-03/src/table.mjs
// 牌桌等级 0～2 与状态（空闲/预留/模拟/结束）纯绘制实现。
// 尺寸固定 64×48 world px（128×96 canvas px，ART_SCALE=2）。
// 原点 (0,0)，footY=48，blocks=[[0, 16, 64, 32]]，严格保持既有碰撞。
import { mix } from '../pixkit.mjs';
import { C } from './palette.mjs';
import { createKit, panel, wood, cardItem, contactShadow, drawTierMarker } from './drawing-kit.mjs';

export const TABLE_META = {
  w: 64,
  h: 48,
  footY: 48,
  blocks: [[0, 16, 64, 32]],
  stand: [32, 58],
  occludes: true,
  family: 'table',
};

// 1. 牌桌桌架与等级桌布（随等级 0～2 演进）
function paintTableChassis(k, level) {
  contactShadow(k, 64, 48, 0.95, 3);

  if (level === 0) {
    // Level 0: 标准原木牌桌 + 经典森林绿绒布
    k.r(5, 31, 5, 15, C.wood);
    k.r(54, 31, 5, 15, C.wood);
    wood(k, 0, 6, 64, 28, C.wood);

    panel(k, 3, 8, 58, 22, mix(C.matGreen, C.ink, 0.25));
    k.r(5, 10, 54, 18, C.matGreen);
    // 中场分割线
    k.r(31.5, 11, 1, 16, '#b9c4a1');
    k.r(4, 9, 56, 0.5, mix(C.matGreen, '#ffffff', 0.3));

    // 基础木制桌号牌
    panel(k, 45, 9, 9, 5, '#3e465c');
    k.r(46, 10, 7, 1, C.gold);

  } else if (level === 1) {
    // Level 1: 竞技深海蓝牌桌（暗栗木架 + 青铜包角 + 深海蓝桌布 + 双对战区银线）
    k.r(5, 31, 5, 15, C.woodChestnut);
    k.r(54, 31, 5, 15, C.woodChestnut);
    wood(k, 0, 6, 64, 28, C.woodChestnut);

    // 四角青铜包角防撞片
    k.r(0, 6, 4, 3, C.bronze);
    k.r(60, 6, 4, 3, C.bronze);
    k.r(0, 31, 4, 3, C.bronze);
    k.r(60, 31, 4, 3, C.bronze);

    panel(k, 3, 8, 58, 22, mix(C.matBlue, C.ink, 0.3));
    k.r(5, 10, 54, 18, C.matBlue);
    // 银灰色对战分割区与出牌框线
    k.r(31.5, 11, 1, 16, C.silver);
    k.r(8, 12, 18, 14, mix(C.matBlue, C.silver, 0.15));
    k.r(38, 12, 18, 14, mix(C.matBlue, C.silver, 0.15));

    // 青铜等级服务牌 [I] + 水杯垫
    panel(k, 43, 8.5, 12, 6, C.bronzeDark);
    k.r(44, 9.5, 10, 4, C.bronze);
    drawTierMarker(k, 44, 9, 1, C.bronze);
    k.e(10, 11, 2, 1.5, '#7b919e');

  } else if (level >= 2) {
    // Level 2: VIP 典藏酒红牌桌（深红木架 + 鎏金角花 + 典藏酒红天鹅绒 + 金箔边饰）
    k.r(5, 31, 5, 15, C.woodMahogany);
    k.r(54, 31, 5, 15, C.woodMahogany);
    wood(k, 0, 6, 64, 28, C.woodMahogany);

    // 金质雕花包边与前裙金线
    k.r(0, 6, 5, 4, C.goldDark);
    k.d(1, 7, C.goldLight);
    k.r(59, 6, 5, 4, C.goldDark);
    k.d(62, 7, C.goldLight);
    k.r(2, 33, 60, 1, C.goldDark);

    panel(k, 3, 8, 58, 22, mix(C.matCrimson, C.ink, 0.35));
    k.r(5, 10, 54, 18, C.matCrimson);
    // 金箔中场线与 VIP 双战区花纹
    k.r(31.5, 11, 1, 16, C.gold);
    k.r(7, 12, 20, 14, mix(C.matCrimson, C.gold, 0.18));
    k.r(37, 12, 20, 14, mix(C.matCrimson, C.gold, 0.18));
    k.d(8, 13, C.goldLight);
    k.d(55, 13, C.goldLight);

    // 抬高的金质 VIP 服务立牌与计分骰子盒
    panel(k, 42, 8, 14, 7, C.goldDark);
    k.r(43, 9, 12, 5, C.goldLight);
    k.r(44, 10, 10, 3, C.ink);
    drawTierMarker(k, 44, 9.5, 2, C.gold);
    // 贵宾茶饮托盘
    panel(k, 8, 9, 6, 4, C.woodDark);
    k.e(11, 11, 1.5, 1.5, '#e5d9c2');
  }
}

// 2. 牌桌状态叠层（纯参数化叠层：idle / reserved / sim / end）
function paintTableState(k, level, state) {
  if (state === 'idle') {
    // 空闲：桌布整洁，牌盒规整放置在右上角
    panel(k, 26, 15, 8, 5, C.cream);
    k.d(30, 17, C.gold);
    return;
  }

  if (state === 'reserved') {
    // 预留：桌中央立有预留立牌，附带预留条
    k.r(26, 2, 12, 8, C.ink);
    k.r(27, 3, 10, 6, C.cream);
    k.d(32, 5, '#c2503c');
    k.d(31, 6, '#c2503c');
    k.d(33, 6, '#c2503c');
    k.r(31, 10, 2, 3, C.woodDark);

    // 玩家预约筹码或预约卡片
    k.r(12, 14, 8, 2, level >= 2 ? C.gold : '#b37e80');
    return;
  }

  if (state === 'sim') {
    // 模拟对局中：桌面布满对局卡片、战况指示物与指示骰子
    // 左方出牌区：三张已部署单卡
    for (let i = 0; i < 3; i++) {
      k.r(8 + i * 7, 11, 5, 7, '#f7f4ec');
      k.r(9 + i * 7, 12, 3, 4, [C.rose, C.blue, C.green][i]);
    }
    // 右方出牌区：对手盖伏牌与备战区
    for (let i = 0; i < 3; i++) {
      k.r(38 + i * 7, 11, 5, 7, mix(C.dark, C.ink, 0.2));
    }
    //  central battle clash tokens
    k.e(31.5, 16, 2.5, 2.5, C.gold);
    k.e(31.5, 16, 1.5, 1.5, '#ffe5a3');

    // 四角血量/生命骰子
    k.d(4, 9, '#ffe5a3');
    k.d(59, 9, '#ffe5a3');
    k.d(4, 27, '#ffe5a3');
    k.d(59, 27, '#ffe5a3');
    return;
  }

  if (state === 'end') {
    // 对局结束（短反馈）：收拢的牌堆、比赛结算战报条、结算服务费金币
    for (let i = 0; i < 3; i++) {
      k.r(26 - i, 12 + i * 0.5, 6, 7, mix(C.dark, C.ink, 0.2));
    }
    k.r(26, 12, 6, 7, '#f7f4ec');
    k.r(27, 13, 4, 4, level >= 2 ? C.goldDark : C.purple);

    // 结算战报纸条与服务费结算钱币
    k.r(10, 13, 8, 6, C.paper);
    k.r(11, 14.5, 6, 0.5, '#8b8b98');
    k.r(11, 16, 5, 0.5, '#8b8b98');
    k.r(11, 17.5, 4, 0.5, '#8b8b98');

    // 开桌服务费结算代币（Lv0 基础, Lv1/Lv2 更丰厚）
    k.e(46, 16, 3, 1.5, C.gold);
    k.e(46, 14.5, 3, 1.5, '#ffe5a3');
    if (level >= 1) {
      k.e(52, 16.5, 2.5, 1.2, C.goldDark);
    }
  }
}

// 纯绘制入口：传入 level (0..2) 和 state ('idle' | 'reserved' | 'sim' | 'end')
export function paintTable(canvas, { level = 0, state = 'idle' } = {}) {
  const k = createKit(canvas);
  paintTableChassis(k, level);
  paintTableState(k, level, state);
  return canvas;
}
