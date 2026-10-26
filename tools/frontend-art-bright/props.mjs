// props.mjs — 76 个登记项全部重绘（4× 原生密度，即 384×384 单元格）。
// 元数据（world 宽高 / footY / blocks / occludes / stand / depth）与正式 props-v2 完全一致，
// 因此合并时只需替换图集与 cellSize/artScale，地图碰撞与交互范围不需要重算。

import { Bitmap, ART_SCALE, mix, lighten, darken, alpha, hash } from './canvas.mjs';
import { PAL, FOIL, LEVEL } from './palette.mjs';
import {
  contactShadow,
  wallShadow,
  face,
  inset,
  woodGrain,
  woodTop,
  glass,
  glassCover,
  metal,
  brass,
  foilPack,
  cardBox,
  singleCard,
  slab,
  carton,
  scissors,
  deckBox,
  cardStack,
  potPlant,
  roundRug,
  rectRug,
  poster,
  corkBoard,
  woodSign,
  pendantLamp,
  floorLamp,
  teaTable,
  bookStack,
  trophy,
  wallClock,
  speaker,
  priceTag,
  counterBody,
  shelfFrame,
  fillShelfRow,
  playmat,
  tableBody,
  trashBin,
  displayCase,
  rowOfCards,
  wallCardFrame,
  pegboardRow,
} from './kit.mjs';

// ------------------------------------------------------------ 元数据

const meta = (w, h, blocks = [], occludes = true, extra = {}) => ({ w, h, footY: h, blocks, occludes, ...extra });

export const PROP_META = {
  counter_retail: meta(96, 48, [[0, 24, 96, 24]]),
  counter_service: meta(96, 48, [[0, 24, 96, 24]]),
  shelf: meta(64, 56, [[0, 40, 64, 16]]),
  display_packs: meta(64, 48, [[0, 28, 64, 20]]),
  display_boxes: meta(64, 48, [[0, 28, 64, 20]]),
  trash: meta(24, 32, [[4, 12, 16, 20]]),
  table: meta(64, 48, [[0, 16, 64, 32]]),
  chair: meta(20, 24, [[4, 12, 12, 12]]),
  lamp: meta(16, 40, [], false),
  sign: meta(64, 20, [], false),
  plant: meta(24, 40, [[4, 28, 16, 12]]),
  rug: meta(96, 64, [], false),
  register: meta(24, 24, [], false),
  case_stack: meta(32, 32, [[0, 16, 32, 16]]),
  door_mat: meta(32, 24, [], false),
  kiosk: meta(80, 64, [[0, 44, 80, 20]]),
  bench: meta(64, 32, [[0, 16, 64, 16]]),
  board: meta(40, 48, [[4, 40, 32, 8]]),
  poster: meta(32, 40, [], false),
  sofa: meta(96, 40, [[0, 16, 96, 24]]),
  tea: meta(32, 32, [[0, 16, 32, 16]]),
  trophy: meta(24, 32, [[4, 24, 16, 8]]),
  clock: meta(24, 24, [], false),
  speaker: meta(24, 40, [[0, 24, 24, 16]]),
};

const F = (id, w, h, opts = {}) => {
  PROP_META[id] = meta(
    w,
    h,
    opts.blocks ?? [[0, Math.max(16, h - 22), w, Math.min(22, h - 16)]],
    opts.occludes !== false,
    {
      stand: opts.stand ?? [Math.round(w / 2), h + 8],
      depth: opts.depth ?? 'y',
      family: opts.family ?? null,
      state: opts.state ?? null,
      level: opts.level ?? undefined,
      label: opts.label ?? id,
    },
  );
};

// 四大柜台
F('pa_counter_procure', 96, 48, { blocks: [[0, 26, 96, 22]], stand: [48, 56], label: '采购/收货柜台' });
F('pa_counter_cashier', 96, 48, { blocks: [[0, 26, 96, 22]], stand: [48, 56], label: 'NPC 收银台' });
F('pa_counter_market', 80, 48, { blocks: [[0, 26, 80, 22]], stand: [40, 56], label: '单卡二级市场柜台' });
F('pa_counter_opening', 80, 48, { blocks: [[0, 26, 80, 22]], stand: [40, 56], label: '拆包工作台' });
// 货架三态
for (const s of ['empty', 'low', 'full']) {
  F(`pa_shelf_${s}`, 64, 56, { blocks: [[0, 40, 64, 16]], stand: [32, 62], family: 'shelf', state: s, label: `货架·${s}` });
}
// 陈列柜
F('pa_display_packs', 64, 48, { blocks: [[0, 28, 64, 20]], stand: [32, 54], family: 'display', state: 'packs', label: '卡包陈列柜' });
F('pa_display_boxes', 64, 48, { blocks: [[0, 28, 64, 20]], stand: [32, 54], family: 'display', state: 'boxes', label: '卡盒陈列柜' });
// 垃圾桶 / 牌桌
F('pa_trash', 24, 32, { blocks: [[4, 12, 16, 20]], stand: [12, 40], label: '共享垃圾桶' });
for (const s of ['idle', 'reserved', 'sim', 'end']) {
  F(`pa_table_${s}`, 64, 48, { blocks: [[0, 16, 64, 32]], stand: [32, 58], family: 'table', state: s, label: `牌桌·${s}` });
}
// 收藏展示柜 / 箱架 / 墙面 / 吊灯 / 圆毯 / 升级前
F('pa_cabinet_collect', 48, 64, { blocks: [[2, 48, 44, 16]], stand: [24, 70], label: '收藏展示柜' });
F('pa_box_rack', 48, 48, { blocks: [[0, 32, 48, 16]], stand: [24, 54], label: '整盒箱架' });
F('pa_wall_display', 96, 32, { blocks: [], occludes: false, depth: 'wall', stand: null, label: '墙面陈列轨' });
F('pa_lamp_hang', 32, 48, { blocks: [], occludes: false, depth: 'wall', stand: null, label: '吊灯' });
F('pa_rug_round', 96, 48, { blocks: [], occludes: false, depth: 'flat', stand: null, label: '圆毯' });
F('pa_shelf_upgrade_before', 48, 48, { blocks: [[0, 32, 48, 16]], stand: [24, 54], family: 'upgrade', state: 'before', label: '货架升级前' });
// 货架 4 级 × 3 库存
for (let lv = 0; lv <= 3; lv += 1) {
  for (const s of ['empty', 'low', 'full']) {
    F(`pa_shelf_lv${lv}_${s}`, 64, 56, {
      blocks: [[0, 40, 64, 16]],
      stand: [32, 62],
      family: 'shelf',
      state: s,
      level: lv,
      label: `货架·Lv${lv} ${LEVEL[lv].label} · ${s}`,
    });
  }
}
// 展示柜 2 态
F('pa_showcase_lv0_unbought', 48, 64, { blocks: [[2, 48, 44, 16]], stand: [24, 70], family: 'showcase', state: 'unbought', level: 0, label: '展示柜·未购预留位' });
F('pa_showcase_lv1_bought', 48, 64, { blocks: [[2, 48, 44, 16]], stand: [24, 70], family: 'showcase', state: 'bought', level: 1, label: '珍藏展示柜·已购' });
// 牌桌 3 级 × 4 态
for (let lv = 0; lv <= 2; lv += 1) {
  for (const s of ['idle', 'reserved', 'sim', 'end']) {
    F(`pa_table_lv${lv}_${s}`, 64, 48, {
      blocks: [[0, 16, 64, 32]],
      stand: [32, 58],
      family: 'table',
      state: s,
      level: lv,
      label: `牌桌·Lv${lv} · ${s}`,
    });
  }
}
// 员工柜台 2 岗位 × 3 状态
for (const role of ['cashier', 'stocker']) {
  for (const s of ['unhired', 'onduty', 'resting']) {
    F(`pa_counter_${role}_${s}`, 96, 48, {
      blocks: [[0, 26, 96, 22]],
      stand: [48, 56],
      family: role,
      state: s,
      level: s === 'unhired' ? 0 : 1,
      label: `${role === 'cashier' ? '收银台' : '补货台'} · ${s}`,
    });
  }
}

export const PROP_ORDER = Object.keys(PROP_META);

// ------------------------------------------------------------ 通用零件

/** 柜台通用骨架：返回台面可用区（放设备）。 */
function counterSkeleton(bmp, w, h, opts = {}) {
  contactShadow(bmp, w / 2, h - 2.4, w * 0.46, 3.4, 0.85);
  const bodyTop = h * 0.52;
  const topH = 8.6;
  counterBody(bmp, 0.6, bodyTop - topH, w - 1.2, h - (bodyTop - topH) - 0.4, {
    topH,
    body: opts.body ?? PAL.woodLight,
    top: opts.top ?? PAL.woodPale,
    panel: opts.panel,
    slots: opts.slots,
  });
  // 设备落座线：物体底部要压在台面的中前部，才像"站在台面上"而不是浮在后沿
  return { topY: bodyTop - topH, topH, topW: w - 2, topX: 1, seatY: bodyTop - topH * 0.42 };
}

/** 柜台正面铭牌（功能识别用，不使用常驻大标签）。 */
function counterPlaque(bmp, x, y, w, h, color, glyph) {
  bmp.roundRect(x, y, w, h, 0.6, darken(color, 0.28));
  bmp.roundRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5, 0.45, color);
  bmp.blendRect(x + 0.5, y + 0.5, w - 1, 0.4, lighten(color, 0.5), 0.6);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const ink = PAL.cream;
  if (glyph === 'in') {
    // 向下箭头 + 托盘
    bmp.rect(cx - 0.35, cy - 2.6, 0.7, 3, ink);
    bmp.polygon(
      [
        [cx - 1.5, cy + 0.2],
        [cx + 1.5, cy + 0.2],
        [cx, cy + 1.6],
      ],
      ink,
    );
    bmp.rect(cx - 2.2, cy + 2.1, 4.4, 0.7, ink);
  } else if (glyph === 'pay') {
    bmp.ellipse(cx, cy, 2.2, 2.2, ink);
    bmp.ellipse(cx, cy, 1.5, 1.5, color);
    bmp.rect(cx - 0.3, cy - 1.1, 0.6, 2.2, darken(color, 0.35));
    bmp.rect(cx - 0.9, cy - 0.3, 1.8, 0.5, darken(color, 0.35));
  } else if (glyph === 'trade') {
    for (let i = 0; i < 3; i += 1) {
      bmp.rect(cx - 2 + i * 1.6, cy - 1 + i * 0.9, 1.2, 1.2, ink);
    }
    bmp.rect(cx - 2.4, cy - 2.4, 1.2, 1.2, ink);
  } else if (glyph === 'open') {
    // 拆包：撕口
    bmp.rect(cx - 2, cy - 2, 4, 4, ink);
    bmp.rect(cx - 2, cy - 2, 4, 0.8, darken(color, 0.4));
    for (let i = 0; i < 3; i += 1) {
      bmp.polygon(
        [
          [cx - 2 + i * 1.3, cy - 2.6],
          [cx - 1.4 + i * 1.3, cy - 2.6],
          [cx - 1.7 + i * 1.3, cy - 1.8],
        ],
        ink,
      );
    }
  }
}

/** 收银机。 */
function cashRegister(bmp, x, y, w, h, opts = {}) {
  // 底座
  bmp.roundRect(x, y + h * 0.55, w, h * 0.45, 0.4, PAL.metalMid);
  bmp.blendRect(x, y + h * 0.55, w, 0.4, PAL.metalLight, 0.8);
  // 机身
  bmp.roundRect(x + w * 0.06, y + h * 0.18, w * 0.88, h * 0.42, 0.5, opts.body ?? PAL.clothSlate);
  bmp.blendRect(x + w * 0.06, y + h * 0.18, w * 0.88, 0.4, lighten(opts.body ?? PAL.clothSlate, 0.4), 0.7);
  // 屏幕
  const sx = x + w * 0.14;
  const sy = y + h * 0.24;
  const sw = w * 0.5;
  const sh = h * 0.26;
  bmp.rect(sx, sy, sw, sh, PAL.clothSlateDeep);
  bmp.rect(sx + 0.3, sy + 0.3, sw - 0.6, sh - 0.6, opts.screen ?? PAL.mintLight);
  bmp.blendRect(sx + 0.6, sy + 0.6, sw * 0.5, 0.4, PAL.cream, 0.9);
  bmp.blendRect(sx + 0.6, sy + 1.3, sw * 0.3, 0.35, PAL.mintDeep, 0.7);
  // 按键区
  for (let i = 0; i < 6; i += 1) {
    bmp.rect(sx + 0.2 + (i % 3) * (sw / 3.4), sy + sh + 0.5 + Math.floor(i / 3) * 0.8, sw / 4.4, 0.5, PAL.cream);
  }
  // 钱箱
  bmp.rect(x + w * 0.1, y + h * 0.72, w * 0.8, h * 0.2, darken(opts.body ?? PAL.clothSlate, 0.25));
  bmp.blendRect(x + w * 0.1, y + h * 0.72, w * 0.8, 0.3, PAL.metalLight, 0.6);
  return bmp;
}

/** 找零盘 + 硬币。 */
function coinTray(bmp, x, y, w, h) {
  bmp.roundRect(x, y, w, h, 0.5, PAL.metalMid);
  bmp.roundRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6, 0.4, darken(PAL.metalMid, 0.18));
  for (let i = 0; i < 4; i += 1) {
    bmp.ellipse(x + 0.9 + i * (w - 1.8) / 4, y + h / 2, 0.5, 0.4, i % 2 ? PAL.gold : PAL.goldLight);
  }
  return bmp;
}

/** 服务铃。 */
function serviceBell(bmp, cx, baseY) {
  bmp.ellipse(cx, baseY, 2.1, 0.7, PAL.woodDeep);
  bmp.ellipse(cx, baseY - 0.4, 1.8, 0.6, PAL.goldDeep);
  bmp.ellipse(cx, baseY - 1.2, 1.5, 1.2, PAL.gold);
  bmp.ellipse(cx - 0.4, baseY - 1.6, 0.7, 0.5, PAL.goldLight);
  bmp.rect(cx - 0.15, baseY - 2.7, 0.3, 0.5, PAL.goldDeep);
  return bmp;
}

/** 员工状态灯：三色。 */
function statusLamp(bmp, x, y, state) {
  const color = state === 'onduty' ? PAL.okGreen : state === 'resting' ? PAL.warnAmber : PAL.metalMid;
  bmp.roundRect(x, y, 3.2, 1.8, 0.5, PAL.metalDeep);
  bmp.ellipse(x + 1.6, y + 0.9, 0.9, 0.7, color);
  bmp.ellipse(x + 1.4, y + 0.6, 0.4, 0.3, lighten(color, 0.6));
  return bmp;
}

/** 小亚克力标牌。 */
function acrylicSign(bmp, x, y, w, h, color, lines = 2) {
  bmp.roundRect(x, y, w, h, 0.3, alpha(PAL.cream, 0.9));
  bmp.roundRect(x + 0.25, y + 0.25, w - 0.5, h - 0.5, 0.25, alpha(color, 0.85));
  for (let i = 0; i < lines; i += 1) {
    bmp.blendRect(x + w * 0.16, y + h * (0.3 + i * 0.34), w * 0.68, 0.35, PAL.ink, 0.5);
  }
  return bmp;
}

// ------------------------------------------------------------ 四大柜台

function counterRetail(bmp, w, h) {
  const { topY, topH, seatY } = counterSkeleton(bmp, w, h, { body: PAL.wood, top: PAL.woodPale, panel: mix(PAL.wood, PAL.cream, 0.22) });
  counterPlaque(bmp, 5, topY + topH + 3.6, 20, 9, PAL.mint, 'trade');
  // 台面：阶梯陈列架 + 立式卡包 + 价签（全部落在 seatY 上）
  const riseX = 11;
  const riseW = 48;
  const riseH = 5.2;
  face(bmp, riseX, seatY - riseH, riseW, riseH + 1, PAL.woodPale, { top: 0.34, bottom: 0.3 });
  woodGrain(bmp, riseX, seatY - riseH, riseW, riseH, PAL.woodPale, { seed: 111, density: 0.4 });
  bmp.blendRect(riseX, seatY - riseH, riseW, 0.4, PAL.woodHighlight, 0.9);
  bmp.blendRect(riseX, seatY - 0.35, riseW, 0.35, PAL.woodDeep, 0.6);
  pegboardRow(bmp, riseX + 1.4, seatY - riseH - 9.4, riseW - 2.8, 9.2, 6);
  // 前景散包
  for (let i = 0; i < 3; i += 1) {
    foilPack(bmp, 12 + i * 4.8, seatY - 0.8, 3.8, 6, ['rose', 'mint', 'sky'][i]);
  }
  // 价签
  priceTag(bmp, 63, seatY - 5.6, 6, 5.4);
  priceTag(bmp, 71, seatY - 4.8, 5, 4.6, { color: PAL.clothButter });
  // 侧边小立牌
  bmp.rect(82, seatY - 8.4, 0.5, 8.4, PAL.woodMid);
  acrylicSign(bmp, 79.4, seatY - 12.6, 8.4, 4.8, PAL.mintLight, 1);
  // 收银侧袋架
  bmp.rect(89, seatY - 5, 5.4, 5, PAL.paperShade);
  bmp.blendRect(89.4, seatY - 4.6, 4.6, 1.4, PAL.cream, 0.85);
  bmp.blendRect(89.4, seatY - 2.6, 4.6, 1.4, PAL.cream, 0.75);
  bmp.blendRect(89, seatY - 5, 5.4, 0.4, PAL.paperLine, 0.8);
}

function counterService(bmp, w, h) {
  const { topY, topH, seatY } = counterSkeleton(bmp, w, h, { body: PAL.wood, top: PAL.woodPale, panel: mix(PAL.wood, PAL.clothButter, 0.26) });
  counterPlaque(bmp, 5, topY + topH + 3.6, 20, 9, PAL.goldDeep, 'pay');
  cashRegister(bmp, 9, seatY - 11.8, 21, 11.8);
  serviceBell(bmp, 38, seatY - 0.2);
  coinTray(bmp, 43, seatY - 2.4, 11, 2.8);
  // 小票
  bmp.rect(57, seatY - 3.8, 3.6, 3.8, PAL.cream);
  bmp.blendRect(57, seatY - 3.8, 3.6, 0.4, PAL.foilSheen, 0.8);
  for (let i = 0; i < 3; i += 1) bmp.blendRect(57.4, seatY - 3 + i * 0.8, 2.8, 0.25, PAL.inkLight, 0.55);
  // 购物袋
  bmp.rect(64, seatY - 7.6, 8.4, 7.6, PAL.paper);
  bmp.blendRect(64, seatY - 7.6, 8.4, 1.3, PAL.paperShade, 0.9);
  bmp.rect(65.6, seatY - 8.4, 0.7, 1, PAL.paperShade);
  bmp.rect(70.1, seatY - 8.4, 0.7, 1, PAL.paperShade);
  bmp.blendRect(65.6, seatY - 5.2, 5, 0.6, PAL.vermilion, 0.8);
  bmp.blendRect(65.6, seatY - 4, 3.4, 0.45, PAL.inkLight, 0.5);
  // 刷卡机
  bmp.roundRect(75, seatY - 3.6, 7, 3.6, 0.4, PAL.clothSlate);
  bmp.rect(75.6, seatY - 3.1, 5.8, 1.5, PAL.mintLight);
  bmp.blendRect(75.6, seatY - 3.1, 4, 0.45, PAL.cream, 0.95);
  bmp.blendRect(75, seatY - 0.4, 7, 0.4, PAL.clothSlateDeep, 0.8);
  // 花瓶
  bmp.rect(86, seatY - 5.2, 3.2, 5.2, PAL.clothSky);
  bmp.rect(86, seatY - 5.2, 3.2, 0.6, PAL.clothSkyDeep);
  bmp.ellipse(87.6, seatY - 6.6, 1.9, 1.7, PAL.leafDeep);
  bmp.ellipse(87.4, seatY - 7.2, 1.3, 1.1, PAL.leaf);
}

function counterProcure(bmp, w, h) {
  const { topY, topH, seatY } = counterSkeleton(bmp, w, h, { body: PAL.woodMid, top: PAL.woodPale, panel: mix(PAL.woodMid, PAL.cream, 0.22) });
  counterPlaque(bmp, 5, topY + topH + 3.6, 20, 9, PAL.okGreen, 'in');
  // 开箱纸箱（左）
  carton(bmp, 7, seatY - 11.8, 23, 11.8, { open: true });
  // 堆叠未拆箱（右）
  carton(bmp, 61, seatY - 8.8, 19, 8.8, { color: '#d9b184' });
  carton(bmp, 63, seatY - 15, 16, 6.4, { color: '#e6c49a' });
  // 目录册 + 夹板
  bmp.roundRect(32, seatY - 6.6, 15.4, 6.6, 0.4, PAL.paperShade);
  bmp.rect(32.6, seatY - 6, 14.2, 5.4, PAL.cream);
  bmp.blendRect(33.4, seatY - 5.4, 8, 0.45, PAL.skyDeep, 0.85);
  bmp.blendRect(33.4, seatY - 4.6, 11, 0.35, PAL.inkLight, 0.55);
  bmp.blendRect(33.4, seatY - 3.8, 9, 0.35, PAL.inkLight, 0.5);
  bmp.blendRect(33.4, seatY - 3, 10.5, 0.35, PAL.inkLight, 0.45);
  bmp.blendRect(33.4, seatY - 2.2, 7, 0.35, PAL.inkLight, 0.4);
  bmp.rect(32, seatY - 6.6, 15.4, 0.55, PAL.metalDeep);
  bmp.rect(38.8, seatY - 7.6, 1.5, 1.2, PAL.metalMid);
  bmp.blendRect(32, seatY - 6.6, 15.4, 0.25, PAL.metalLight, 0.9);
  // 胶带卷
  bmp.ellipse(52.4, seatY - 1.8, 2.6, 2.6, PAL.paperShade);
  bmp.ellipse(52.4, seatY - 1.8, 1.3, 1.3, PAL.woodPale);
  bmp.blendEllipse(51.8, seatY - 2.4, 1, 0.8, PAL.foilSheen, 0.6);
  // 库存清单
  bmp.rect(52, topY + topH + 3, 10, 7.2, PAL.cream);
  bmp.blendRect(52, topY + topH + 3, 10, 0.4, PAL.foilSheen, 0.8);
  for (let i = 0; i < 4; i += 1) bmp.blendRect(53, topY + topH + 4.2 + i * 1.4, 8 - i * 0.8, 0.4, PAL.inkLight, 0.5);
  // 扫描枪
  bmp.roundRect(45.4, seatY - 2.8, 3.2, 2.8, 0.4, PAL.clothSlate);
  bmp.rect(46.6, seatY - 5.8, 1.7, 3.2, PAL.clothSlateDeep);
  bmp.rect(47, seatY - 5.8, 0.9, 1.1, PAL.vermilionLight);
}

function counterCashierNpc(bmp, w, h) {
  const { topY, topH, seatY } = counterSkeleton(bmp, w, h, { body: PAL.wood, top: PAL.woodPale, panel: mix(PAL.wood, PAL.clothRose, 0.2) });
  counterPlaque(bmp, 5, topY + topH + 3.6, 20, 9, PAL.vermilion, 'pay');
  cashRegister(bmp, 8, seatY - 12.6, 24, 12.6, { body: PAL.clothSlate, screen: PAL.mintLight });
  coinTray(bmp, 35, seatY - 2.8, 13, 3.2);
  bmp.rect(35, seatY - 0.4, 13, 1.8, PAL.metalMid);
  bmp.blendRect(35, seatY - 0.4, 13, 0.5, PAL.metalLight, 0.85);
  bmp.blendRect(35, seatY + 1.1, 13, 0.3, PAL.metalDeep, 0.8);
  bmp.roundRect(51, seatY - 5.6, 10, 5.6, 0.5, PAL.clothSlateDeep);
  bmp.rect(52, seatY - 5, 8, 1.6, PAL.cream);
  bmp.blendRect(52.4, seatY - 4.6, 6, 0.4, PAL.inkLight, 0.7);
  bmp.blendRect(52.4, seatY - 3.8, 4, 0.35, PAL.inkLight, 0.6);
  bmp.rect(53, seatY - 6.4, 6, 0.8, PAL.cream);
  bmp.blendRect(51, seatY - 0.4, 10, 0.4, PAL.metalDeep, 0.7);
  bmp.rect(65.6, seatY - 6.8, 0.5, 6.8, PAL.woodMid);
  acrylicSign(bmp, 63, seatY - 11.8, 10.4, 5.2, PAL.clothButter, 2);
  bmp.rect(76, seatY - 8, 8.6, 8, PAL.paper);
  bmp.blendRect(76, seatY - 8, 8.6, 1.4, PAL.paperShade, 0.9);
  bmp.blendRect(77, seatY - 5.2, 5.6, 0.6, PAL.vermilion, 0.85);
  bmp.blendRect(77, seatY - 4, 3.8, 0.45, PAL.inkLight, 0.55);
  serviceBell(bmp, 89, seatY - 0.2);
}

function counterMarket(bmp, w, h) {
  const { topY, topH } = counterSkeleton(bmp, w, h, { body: PAL.woodMid, top: PAL.woodPale, panel: mix(PAL.woodMid, PAL.clothLilac, 0.3), slots: 3 });
  counterPlaque(bmp, 4, topY + topH + 3.6, 18, 9, PAL.lilacDeep, 'trade');
  // 玻璃展示罩：木框 + 斜放单卡 + 价签。玻璃只做薄层，不遮住卡面。
  const gx = 4;
  const gy = 1.6;
  const gw = 46;
  const gh = 13.4;
  // 罩底木框
  face(bmp, gx - 0.6, gy + gh - 1.4, gw + 1.2, 2, PAL.woodPale, { top: 0.34, bottom: 0.3 });
  bmp.blendRect(gx - 0.6, gy + gh - 1.4, gw + 1.2, 0.4, PAL.woodHighlight, 0.9);
  // 内衬（丝绒）
  bmp.rect(gx + 0.6, gy + 1.2, gw - 1.2, gh - 2.8, PAL.velvetDeep);
  bmp.blendRect(gx + 0.6, gy + 1.2, gw - 1.2, (gh - 2.8) * 0.35, lighten(PAL.velvet, 0.2), 0.8);
  // 四张斜靠的单卡
  const colors = [PAL.clothRose, PAL.clothSky, PAL.clothButter, PAL.clothLilac];
  const cardW = 7.4;
  const cardH = 9.6;
  for (let i = 0; i < 4; i += 1) {
    const cx = gx + 2.4 + i * 10.6;
    const baseY = gy + gh - 1.6;
    // 卡背阴影
    bmp.polygon(
      [
        [cx + 0.7, baseY],
        [cx + 1.3, baseY - cardH],
        [cx + 1.3 + cardW, baseY - cardH],
        [cx + cardW + 0.7, baseY],
      ],
      alpha(PAL.inkSoft, 0.35),
    );
    // 卡面（白框）
    bmp.polygon(
      [
        [cx, baseY],
        [cx + 0.7, baseY - cardH],
        [cx + 0.7 + cardW, baseY - cardH],
        [cx + cardW, baseY],
      ],
      PAL.cream,
    );
    // 插画窗
    bmp.polygon(
      [
        [cx + 0.7, baseY - 0.8],
        [cx + 1.25, baseY - cardH + 0.7],
        [cx + 1.25 + cardW - 1.1, baseY - cardH + 0.7],
        [cx + cardW - 0.7, baseY - 0.8],
      ],
      colors[i],
    );
    // 插画内角色剪影
    bmp.polygon(
      [
        [cx + 1.5, baseY - 1.2],
        [cx + 1.85, baseY - cardH + 2.2],
        [cx + 1.85 + cardW - 2.7, baseY - cardH + 2.2],
        [cx + cardW - 1.5, baseY - 1.2],
      ],
      lighten(colors[i], 0.35),
    );
    // 卡面高光
    bmp.polygon(
      [
        [cx + 1.1, baseY - 0.6],
        [cx + 1.5, baseY - cardH + 1.2],
        [cx + 2.4, baseY - cardH + 1.2],
        [cx + 2.2, baseY - 0.6],
      ],
      alpha(PAL.cream, 1),
      0.5,
    );
    // 价签
    bmp.rect(cx + 1.2, baseY + 0.1, 4.6, 1.2, PAL.cream);
    bmp.blendRect(cx + 1.5, baseY + 0.45, 3, 0.4, PAL.vermilionDeep, 0.9);
  }
  // 玻璃罩
  glassCover(bmp, gx, gy, gw, gh - 1.2);
  // 玻璃罩上沿木条
  bmp.rect(gx - 0.6, gy - 0.2, gw + 1.2, 1.6, PAL.woodLight);
  bmp.blendRect(gx - 0.6, gy - 0.2, gw + 1.2, 0.4, PAL.woodHighlight, 0.9);
  bmp.blendRect(gx - 0.6, gy + 1.1, gw + 1.2, 0.3, PAL.woodDeep, 0.6);

  // 放大镜
  bmp.line(54, topY - 0.6, 58.4, topY - 4.2, PAL.metalDeep, 0.45);
  bmp.ellipse(59.2, topY - 5, 1.8, 1.8, PAL.metalMid);
  bmp.ellipse(59.2, topY - 5, 1.2, 1.2, PAL.glassSheen);
  // 卡册（翻开的活页夹）
  bmp.roundRect(62, topY - 4.6, 13, 4.6, 0.4, PAL.clothSkyDeep);
  bmp.roundRect(62.4, topY - 4.2, 5.8, 3.8, 0.3, PAL.clothSky);
  bmp.roundRect(68.6, topY - 4.2, 5.8, 3.8, 0.3, PAL.clothSky);
  bmp.blendRect(65.4, topY - 4.2, 3.4, 3.8, alpha(PAL.cream, 1), 0.85);
  for (let i = 0; i < 3; i += 1) {
    bmp.blendRect(63.2, topY - 3.2 + i * 0.9, 4, 0.25, PAL.inkLight, 0.4);
    bmp.blendRect(69.4, topY - 3.2 + i * 0.9, 4, 0.25, PAL.inkLight, 0.4);
  }
  // 立式卡砖
  slab(bmp, 76.4, topY - 9.6, 4.6, 9.6, PAL.clothButter);
  bmp.rect(75.9, topY - 0.5, 5.6, 0.9, PAL.woodMid);
  bmp.blendRect(75.9, topY - 0.5, 5.6, 0.3, PAL.woodHighlight, 0.8);
}

function counterOpening(bmp, w, h) {
  // 拆包台更矮更平，便于俯视操作
  contactShadow(bmp, w / 2, h - 2.4, w * 0.46, 3.4, 0.95);
  const bodyTop = h * 0.46;
  counterBody(bmp, 0.6, bodyTop, w - 1.2, h - bodyTop - 0.4, {
    topH: 9.4,
    body: PAL.wood,
    top: PAL.woodPale,
    panel: mix(PAL.wood, PAL.clothSky, 0.22),
    slots: 3,
  });
  const seatY = bodyTop + 5.6;
  counterPlaque(bmp, 4, bodyTop + 12, 18, 9, PAL.skyDeep, 'open');
  // 切割垫
  const mx = 3.4;
  const my = seatY - 11.6;
  const mw = 41;
  const mh = 12.6;
  bmp.roundRect(mx, my, mw, mh, 0.5, PAL.mintDeep);
  bmp.roundRect(mx + 0.5, my + 0.5, mw - 1, mh - 1, 0.4, PAL.mint);
  bmp.blendRect(mx + 0.5, my + 0.5, mw - 1, 0.5, lighten(PAL.mint, 0.4), 0.7);
  for (let x = mx + 2; x < mx + mw - 1; x += 3) bmp.blendRect(x, my + 1, 0.25, mh - 2, PAL.mintDeep, 0.55);
  for (let y = my + 2; y < my + mh - 1; y += 3) bmp.blendRect(mx + 1, y, mw - 2, 0.25, PAL.mintDeep, 0.55);
  foilPack(bmp, 5.6, my + 1.8, 4.4, 8.8, 'rose');
  foilPack(bmp, 11.8, my + 2.4, 4.4, 8.2, 'sky');
  bmp.polygon(
    [
      [11.8, my + 2.4],
      [12.7, my + 0.7],
      [13.7, my + 2],
      [14.8, my + 0.5],
      [16.2, my + 2.4],
    ],
    PAL.clothSkyDeep,
  );
  bmp.blendRect(12.2, my + 2.9, 3.4, 3.2, PAL.cream, 0.9);
  singleCard(bmp, 17.2, my + 3.2, 4.8, 6.8, PAL.clothButter);
  singleCard(bmp, 22.4, my + 3.6, 4.8, 6.8, PAL.clothRose);
  scissors(bmp, 28.6, my + 3.6, 1.3);
  bmp.roundRect(33.4, my + 1.4, 9.4, 9.2, 0.5, PAL.paperShade);
  bmp.roundRect(33.8, my + 1.8, 8.6, 8.4, 0.4, PAL.cream);
  singleCard(bmp, 34.4, my + 2.4, 3.6, 5, PAL.clothMint);
  singleCard(bmp, 38.2, my + 3, 3.6, 5, PAL.clothLilac);
  bmp.roundRect(33.4, my + 11.2, 9.4, 2.2, 0.4, PAL.inkSoft);
  bmp.blendRect(34, my + 11.4, 8.2, 0.9, PAL.ink, 0.95);
  cardBox(bmp, 47.4, seatY - 8.2, 15.6, 8.2, 'lilac');
  cardBox(bmp, 63.8, seatY - 8.2, 12.4, 8.2, 'mint');
  bmp.roundRect(45.6, seatY - 0.6, 31, 3.4, 0.4, PAL.cream);
  bmp.blendRect(47, seatY + 0.6, 12, 0.4, PAL.inkLight, 0.45);
}

// ------------------------------------------------------------ 员工柜台状态

function staffCounter(bmp, w, h, role, state) {
  const isCashier = role === 'cashier';
  const accent = isCashier ? PAL.vermilion : PAL.okGreen;
  const { topY, topH, seatY } = counterSkeleton(bmp, w, h, {
    body: state === 'unhired' ? mix(PAL.wood, PAL.metal, 0.24) : PAL.wood,
    top: PAL.woodPale,
    panel: state === 'unhired' ? mix(PAL.wood, PAL.metal, 0.34) : mix(PAL.wood, accent, 0.16),
  });
  counterPlaque(bmp, 5, topY + topH + 3.6, 20, 9, state === 'unhired' ? PAL.metalDeep : accent, isCashier ? 'pay' : 'in');
  statusLamp(bmp, 27.6, topY + topH + 5.6, state);

  if (state === 'unhired') {
    // 设备覆布 + 招募木牌
    bmp.polygon(
      [
        [8, seatY - 12.4],
        [8 + 27, seatY - 12.4],
        [8 + 29, seatY - 0.2],
        [8 - 2, seatY - 0.2],
      ],
      PAL.paperShade,
    );
    bmp.blendPolygon(
      [
        [8, seatY - 12.4],
        [8 + 27, seatY - 12.4],
        [8 + 13.5, seatY - 5],
      ],
      lighten(PAL.paperShade, 0.35),
      0.75,
    );
    for (let i = 0; i < 4; i += 1) {
      bmp.blendRect(9.4 + i * 6, seatY - 9.8 + (i % 2) * 0.8, 5.6, 0.35, PAL.wallCreamDeep, 0.6);
    }
    bmp.blendRect(8 - 2, seatY - 0.6, 31, 0.5, PAL.paperLine, 0.8);
    // 招募木牌
    bmp.rect(44, seatY - 14.6, 0.6, 14.6, PAL.woodMid);
    woodSign(bmp, 37.6, seatY - 20.6, 14.4, 7.2, { color: PAL.woodPale, lines: 2 });
    // 空托盘
    bmp.roundRect(60, seatY - 2.4, 12, 2.4, 0.4, PAL.metalMid);
    bmp.blendRect(60.4, seatY - 2, 11.2, 0.6, PAL.metalLight, 0.85);
    bmp.blendRect(60, seatY - 0.4, 12, 0.4, PAL.metalDeep, 0.7);
  } else if (state === 'onduty') {
    if (isCashier) {
      cashRegister(bmp, 8, seatY - 12.6, 24, 12.6, { screen: PAL.mintLight });
      coinTray(bmp, 35, seatY - 2.8, 12, 3.2);
      serviceBell(bmp, 51, seatY - 0.2);
      bmp.rect(57, seatY - 7.8, 8.4, 7.8, PAL.paper);
      bmp.blendRect(57, seatY - 7.8, 8.4, 1.3, PAL.paperShade, 0.9);
      bmp.blendRect(58, seatY - 5, 5.4, 0.6, PAL.vermilion, 0.8);
      bmp.blendRect(58, seatY - 3.8, 3.6, 0.45, PAL.inkLight, 0.5);
      // 待办便签
      bmp.rect(69, seatY - 5.6, 9.4, 5.6, PAL.clothButter);
      bmp.blendRect(69, seatY - 5.6, 9.4, 0.6, PAL.clothButterDeep, 0.9);
      for (let i = 0; i < 3; i += 1) bmp.blendRect(70, seatY - 4.6 + i * 1.3, 7.4 - i, 0.35, PAL.inkLight, 0.55);
      bmp.rect(76.8, seatY - 6.4, 1.3, 1.3, PAL.vermilionDeep);
      potPlant(bmp, 86, seatY - 0.2, 0.42);
    } else {
      carton(bmp, 7, seatY - 11.8, 22, 11.8, { open: true });
      carton(bmp, 31, seatY - 9, 16, 9, { color: '#d9b184' });
      bmp.roundRect(49, seatY - 6.2, 14.4, 6.2, 0.4, PAL.paperShade);
      bmp.rect(49.6, seatY - 5.6, 13.2, 5, PAL.cream);
      for (let i = 0; i < 4; i += 1) bmp.blendRect(50.6, seatY - 5 + i * 1.15, 10.4 - i * 0.7, 0.35, PAL.inkLight, 0.55);
      bmp.ellipse(68.4, seatY - 2, 2.8, 2.8, PAL.paperShade);
      bmp.ellipse(68.4, seatY - 2, 1.3, 1.3, PAL.woodPale);
      bmp.roundRect(73.4, seatY - 3.6, 7.2, 3.6, 0.5, PAL.clothSlate);
      bmp.rect(74.6, seatY - 4.8, 1.5, 1.5, PAL.clothSlateDeep);
      for (let i = 0; i < 3; i += 1) foilPack(bmp, 82 + i * 4.2, seatY - 7.6, 3.6, 7.6, ['mint', 'sky', 'butter'][i]);
    }
  } else {
    // resting：覆一半布 + 轮休牌 + 茶杯
    bmp.polygon(
      [
        [8, seatY - 8.4],
        [8 + 30, seatY - 8.4],
        [8 + 31, seatY - 0.2],
        [8 - 1, seatY - 0.2],
      ],
      PAL.paperShade,
    );
    bmp.blendPolygon(
      [
        [8, seatY - 8.4],
        [8 + 30, seatY - 8.4],
        [8 + 15, seatY - 3.6],
      ],
      lighten(PAL.paperShade, 0.32),
      0.75,
    );
    bmp.blendRect(8 - 1, seatY - 0.6, 32, 0.5, PAL.paperLine, 0.8);
    bmp.rect(45, seatY - 12.6, 0.6, 12.6, PAL.woodMid);
    acrylicSign(bmp, 38.6, seatY - 17.8, 13.4, 5.8, PAL.clothButter, 2);
    // 茶杯
    bmp.ellipse(63, seatY - 0.6, 3.4, 1.3, PAL.cream);
    bmp.ellipse(63, seatY - 1.5, 2.8, 1.9, PAL.cream);
    bmp.ellipse(63, seatY - 2.1, 2.1, 1.2, PAL.clothRose);
    bmp.ellipse(66.2, seatY - 1.7, 0.9, 1, PAL.cream);
    for (let i = 0; i < 3; i += 1) {
      bmp.blendRect(62.2 + i * 0.9, seatY - 4.6 - i * 0.5, 0.35, 1.5, PAL.cream, 0.6);
    }
    // 小坐垫
    bmp.roundRect(73, seatY - 2.6, 14.4, 2.6, 0.8, PAL.clothLilac);
    bmp.blendRect(73, seatY - 2.6, 14.4, 0.8, lighten(PAL.clothLilac, 0.45), 0.8);
    bmp.blendRect(73, seatY - 0.5, 14.4, 0.3, PAL.clothLilacDeep, 0.7);
  }
}

// ------------------------------------------------------------ 货架

function shelfProp(bmp, w, h, level, stock, opts = {}) {
  contactShadow(bmp, w / 2, h - 1.6, w * 0.46, 3, 0.8);
  const rows = opts.rows ?? 3;
  const shelves = shelfFrame(bmp, 1, 1.2, w - 2, h - 3.2, { level, rows });
  const density = stock === 'empty' ? 0 : stock === 'low' ? 0.28 : 0.92;
  shelves.forEach((box, i) => {
    fillShelfRow(bmp, box, density, i * 3 + level, { mix: true, unit: 3.2 });
    // 层板价签
    bmp.rect(box.x + 0.6, box.y + box.h - 0.6, 3.6, 1, PAL.cream);
    bmp.blendRect(box.x + 0.9, box.y + box.h - 0.35, 3, 0.35, PAL.vermilion, 0.75);
    if (stock !== 'empty' && i === 0) {
      // 小立牌
      bmp.rect(box.x + box.w - 7.4, box.y + box.h - 5, 0.4, 5, PAL.woodMid);
      acrylicSign(bmp, box.x + box.w - 9.6, box.y + box.h - 9.4, 8, 4.6, LEVEL[level].trim, 1);
    }
  });
  if (stock === 'empty') {
    // 空架仍要有"待补货"信息，而不是纯空箱
    for (const box of shelves) {
      bmp.blendRect(box.x + 1, box.y + box.h - 1.1, box.w - 2, 0.3, alpha(PAL.woodDeep, 0.35), 0.6);
    }
    bmp.rect(w / 2 - 3.4, h - 8.4, 0.4, 5.4, PAL.woodMid);
    acrylicSign(bmp, w / 2 - 6.4, h - 12.4, 10, 4.4, PAL.clothButter, 1);
  }
}

function upgradeBefore(bmp, w, h) {
  // 升级前：简易松木开放架，无背板、层板少、陈列稀疏 —— 与正式货架形成前后对照
  contactShadow(bmp, w / 2, h - 1.6, w * 0.44, 3, 0.7);
  const postW = 2.6;
  for (const px of [1, w - 1 - postW]) {
    face(bmp, px, 2, postW, h - 3.6, PAL.woodPale, { top: 0.3, bottom: 0.24 });
    woodGrain(bmp, px, 2, postW, h - 3.6, PAL.woodPale, { axis: 'y', seed: 131 });
  }
  // 只有两层板
  for (const sy of [h * 0.42, h * 0.72]) {
    face(bmp, 1, sy, w - 2, 1.6, PAL.woodPale, { top: 0.3, bottom: 0.2 });
    bmp.blendRect(1, sy + 1.3, w - 2, 0.3, PAL.woodDeep, 0.5);
  }
  // 稀疏陈列
  foilPack(bmp, 4, h * 0.42 - 7.4, 3.6, 7.4, 'rose');
  foilPack(bmp, 9, h * 0.42 - 7.4, 3.6, 7.4, 'sky');
  cardBox(bmp, 15, h * 0.42 - 6, 10, 6, 'slate');
  foilPack(bmp, 5, h * 0.72 - 7.4, 3.6, 7.4, 'mint');
  // 松木横撑
  bmp.rect(1, h - 2.4, w - 2, 1.4, PAL.woodMid);
  bmp.blendRect(1, h - 2.4, w - 2, 0.4, PAL.woodHighlight, 0.7);
  // 简易价签
  bmp.rect(w / 2 - 3, h - 9.4, 6, 2.6, PAL.cream);
  bmp.blendRect(w / 2 - 2.4, h - 8.6, 4.8, 0.4, PAL.inkLight, 0.5);
}

// ------------------------------------------------------------ 陈列柜

function displayPacks(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.8, w * 0.46, 3, 0.8);
  // 矮柜
  face(bmp, 1, h * 0.6, w - 2, h * 0.4 - 0.6, PAL.woodLight, { top: 0.3, bottom: 0.26 });
  woodGrain(bmp, 1, h * 0.6, w - 2, h * 0.4 - 0.6, PAL.woodLight, { seed: 141 });
  bmp.rect(1, h - 3, w - 2, 2.4, darken(PAL.woodLight, 0.3));
  woodTop(bmp, 0.4, h * 0.6 - 2, w - 0.8, 2.4, PAL.woodPale, { seed: 143 });
  // 背板 + 立式卡包
  const bx = 2;
  const by = 1;
  const bw = w - 4;
  const bh = h * 0.6 - 4;
  face(bmp, bx, by, bw, bh, PAL.clothMint, { top: 0.2, bottom: 0.24 });
  bmp.blendRect(bx + 1, by + 1, bw - 2, bh - 2, alpha(PAL.cream, 0.2), 0.6);
  pegboardRow(bmp, bx + 1.4, by + 1.4, bw - 2.8, bh - 2.4, 7);
  // 前沿价签条
  bmp.rect(2, h * 0.6 - 3.2, w - 4, 1.6, PAL.gold);
  bmp.blendRect(2, h * 0.6 - 3.2, w - 4, 0.4, PAL.goldLight, 0.9);
  bmp.blendRect(4, h * 0.6 - 2.6, 8, 0.6, PAL.cream, 0.8);
  // 侧立牌
  bmp.rect(w - 8, h * 0.6 - 6, 0.4, 3.2, PAL.woodMid);
  acrylicSign(bmp, w - 11, h * 0.6 - 10, 7, 4, PAL.clothMint, 1);
}

function displayBoxes(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.8, w * 0.46, 3, 0.8);
  face(bmp, 1, h * 0.6, w - 2, h * 0.4 - 0.6, PAL.woodLight, { top: 0.3, bottom: 0.26 });
  woodGrain(bmp, 1, h * 0.6, w - 2, h * 0.4 - 0.6, PAL.woodLight, { seed: 151 });
  bmp.rect(1, h - 3, w - 2, 2.4, darken(PAL.woodLight, 0.3));
  woodTop(bmp, 0.4, h * 0.6 - 2, w - 0.8, 2.4, PAL.woodPale, { seed: 153 });
  // 背板
  const bx = 2;
  const by = 1;
  const bw = w - 4;
  const bh = h * 0.6 - 4;
  face(bmp, bx, by, bw, bh, PAL.clothLilac, { top: 0.2, bottom: 0.24 });
  bmp.blendRect(bx + 1, by + 1, bw - 2, bh - 2, alpha(PAL.cream, 0.2), 0.6);
  // 三层横卧卡盒
  const themes = ['lilac', 'sky', 'butter', 'rose', 'mint'];
  for (let r = 0; r < 2; r += 1) {
    const rowY = by + 2 + r * (bh - 4) / 2;
    const rowH = (bh - 4) / 2 - 1;
    for (let i = 0; i < 3; i += 1) {
      cardBox(bmp, bx + 2 + i * (bw - 4) / 3, rowY, (bw - 4) / 3 - 1.2, rowH, themes[(r * 3 + i) % 5]);
    }
    // 层板
    bmp.rect(bx + 1, rowY + rowH, bw - 2, 0.8, PAL.woodPale);
    bmp.blendRect(bx + 1, rowY + rowH, bw - 2, 0.3, PAL.woodHighlight, 0.7);
  }
  // 前沿
  bmp.rect(2, h * 0.6 - 3.2, w - 4, 1.6, PAL.gold);
  bmp.blendRect(2, h * 0.6 - 3.2, w - 4, 0.4, PAL.goldLight, 0.9);
  bmp.blendRect(4, h * 0.6 - 2.6, 10, 0.6, PAL.cream, 0.8);
  // 价格牌
  bmp.rect(w - 9, h * 0.6 - 5.6, 0.4, 2.8, PAL.woodMid);
  acrylicSign(bmp, w - 12.4, h * 0.6 - 9.4, 7.6, 4, PAL.clothLilac, 1);
}

// ------------------------------------------------------------ 牌桌

function tableProp(bmp, w, h, level, state) {
  contactShadow(bmp, w / 2, h - 1.8, w * 0.42, 3, 0.8);
  const lvl = LEVEL[Math.min(3, level)];
  const matColor = level === 0 ? PAL.clothMint : level === 1 ? PAL.clothSky : PAL.clothRose;
  const top = tableBody(bmp, 1, 1, w - 2, h - 2.4, {
    wood: level === 0 ? PAL.woodLight : level === 1 ? PAL.woodMid : PAL.woodDark,
    topColor: level === 0 ? PAL.woodPale : level === 1 ? PAL.woodLight : mix(PAL.woodLight, PAL.clothRose, 0.16),
    topH: (h - 2.4) * 0.46,
  });
  // 牌垫
  const px = top.topX + 3.4;
  const py = top.topY + 2;
  const pw = top.topW - 6.8;
  const ph = top.topH - 4;
  playmat(bmp, px, py, pw, ph, matColor);
  // 等级装饰
  if (level === 1) {
    for (const [cx, cy] of [
      [px + 0.6, py + 0.6],
      [px + pw - 0.6, py + ph - 0.6],
    ]) {
      bmp.rect(cx - 0.5, cy - 0.5, 1, 1, PAL.metalMid);
    }
    bmp.blendRect(px, py + ph / 2 - 0.15, pw, 0.3, PAL.metalLight, 0.5);
  }
  if (level === 2) {
    bmp.blendRect(px, py, pw, 0.5, PAL.gold, 0.9);
    bmp.blendRect(px, py + ph - 0.5, pw, 0.5, PAL.gold, 0.9);
    bmp.blendRect(px, py, 0.5, ph, PAL.gold, 0.9);
    bmp.blendRect(px + pw - 0.5, py, 0.5, ph, PAL.gold, 0.9);
    for (const [cx, cy] of [
      [px + 1.6, py + 1.6],
      [px + pw - 1.6, py + 1.6],
      [px + 1.6, py + ph - 1.6],
      [px + pw - 1.6, py + ph - 1.6],
    ]) {
      bmp.ellipse(cx, cy, 1, 1, PAL.goldLight);
      bmp.ellipse(cx, cy, 0.5, 0.5, PAL.goldDeep);
    }
  }
  // 桌号牌
  bmp.rect(px + pw - 6.4, py - 2.6, 5.4, 2.6, PAL.woodMid);
  bmp.rect(px + pw - 6, py - 2.2, 4.6, 1.8, PAL.cream);
  bmp.blendRect(px + pw - 5.2, py - 1.7, 3, 0.5, PAL.inkSoft, 0.7);
  // 牌组盒
  deckBox(bmp, px + 1.4, py + ph - 4.4, 4.4, 3.6, level === 2 ? PAL.clothRose : PAL.clothSky);
  deckBox(bmp, px + pw - 6.2, py + ph - 4, 4.4, 3.2, level === 1 ? PAL.clothMint : PAL.clothButter);

  if (state === 'reserved') {
    // 中央预约三角立牌 + 凭证
    bmp.polygon(
      [
        [px + pw / 2 - 4.4, py + ph - 1.2],
        [px + pw / 2 + 4.4, py + ph - 1.2],
        [px + pw / 2, py + ph - 7.6],
      ],
      PAL.cream,
    );
    bmp.polygon(
      [
        [px + pw / 2 - 3.4, py + ph - 1.8],
        [px + pw / 2 + 3.4, py + ph - 1.8],
        [px + pw / 2, py + ph - 6.4],
      ],
      PAL.paper,
    );
    bmp.blendRect(px + pw / 2 - 1.8, py + ph - 5, 3.6, 0.5, PAL.vermilion, 0.85);
    bmp.blendRect(px + pw / 2 - 1.4, py + ph - 3.8, 2.8, 0.4, PAL.inkLight, 0.55);
    // 预留小卡
    singleCard(bmp, px + 3, py + 2.4, 4.4, 6.4, PAL.clothButter);
  } else if (state === 'sim') {
    // 双方出牌 + 生命骰
    for (let i = 0; i < 3; i += 1) {
      singleCard(bmp, px + 3 + i * 5.2, py + 3.2, 4.2, 6, [PAL.clothRose, PAL.clothSky, PAL.clothMint][i]);
      // 背面朝上的对手牌
      bmp.roundRect(px + 3 + i * 5.2, py + ph - 9.4, 4.2, 6, 0.3, PAL.clothSlate);
      bmp.roundRect(px + 3.4 + i * 5.2, py + ph - 9, 3.4, 5.2, 0.25, PAL.clothSlateDeep);
      bmp.ellipse(px + 5.1 + i * 5.2, py + ph - 6.4, 1, 1, PAL.cream);
    }
    // 指示物
    bmp.ellipse(px + pw / 2, py + ph / 2, 1.6, 1.6, PAL.gold);
    bmp.ellipse(px + pw / 2, py + ph / 2 - 0.2, 1, 1, PAL.goldLight);
    // 生命骰
    bmp.rect(px + pw - 8, py + 2.4, 3.4, 3.4, PAL.cream);
    bmp.blendRect(px + pw - 7.4, py + 3.2, 2.2, 1.8, PAL.vermilion, 0.85);
    // 灯光反射点
    bmp.blendEllipse(px + pw * 0.3, py + ph * 0.3, 3, 1.6, alpha(PAL.lampCore, 0.3), 0.5);
  } else if (state === 'end') {
    // 收拢牌堆 + 结算条 + 金币
    cardStack(bmp, px + pw / 2 - 3, py + ph / 2 + 2, 5, 6, 5, PAL.cream);
    bmp.rect(px + 2.4, py + 2.4, pw - 4.8, 3.6, PAL.cream);
    for (let i = 0; i < 3; i += 1) bmp.blendRect(px + 3.6, py + 3.4 + i * 0.9, pw - 8 - i * 2, 0.35, PAL.inkLight, 0.5);
    for (let i = 0; i < 3; i += 1) {
      bmp.ellipse(px + pw - 5 - i * 1.6, py + ph - 3.4, 1.2, 0.8, PAL.gold);
      bmp.ellipse(px + pw - 5 - i * 1.6, py + ph - 3.6, 0.7, 0.45, PAL.goldLight);
    }
  } else {
    // idle：桌布整洁 + 牌盒就位 + 小水杯
    bmp.ellipse(px + pw * 0.62, py + 3, 1.4, 1.1, PAL.glassSheen);
    bmp.ellipse(px + pw * 0.62, py + 3.4, 1.1, 0.6, PAL.glass);
  }
}

// ------------------------------------------------------------ 座椅与休息

function chairProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.2, w * 0.4, 1.8, 0.7);
  // 椅腿
  bmp.rect(2.4, h * 0.55, 1.2, h * 0.42, PAL.woodMid);
  bmp.rect(w - 3.6, h * 0.55, 1.2, h * 0.42, PAL.woodMid);
  // 靠背
  face(bmp, 2, 1.4, w - 4, h * 0.44, PAL.woodLight, { top: 0.3, bottom: 0.22 });
  bmp.roundRect(3.4, 2.6, w - 6.8, h * 0.34, 1.2, PAL.clothRose);
  bmp.blendRect(3.4, 2.6, w - 6.8, 1.2, lighten(PAL.clothRose, 0.4), 0.7);
  // 坐垫
  bmp.roundRect(1.6, h * 0.48, w - 3.2, h * 0.26, 1.2, PAL.clothRose);
  bmp.blendRect(1.6, h * 0.48, w - 3.2, 1.4, lighten(PAL.clothRose, 0.45), 0.75);
  bmp.blendRect(1.6, h * 0.48 + h * 0.22, w - 3.2, 1.2, darken(PAL.clothRose, 0.25), 0.6);
  // 木框
  bmp.blendRect(1.6, h * 0.72, w - 3.2, 1, PAL.woodMid, 0.9);
}

function benchProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.4, w * 0.46, 2.4, 0.75);
  // 腿
  for (const lx of [3, w - 6]) {
    bmp.rect(lx, h * 0.5, 2.4, h * 0.46, PAL.woodMid);
    bmp.blendRect(lx, h * 0.5, 0.6, h * 0.46, PAL.woodHighlight, 0.5);
  }
  // 坐板
  woodTop(bmp, 1, h * 0.3, w - 2, h * 0.26, PAL.woodPale, { seed: 161 });
  // 靠背
  face(bmp, 1, 1.4, w - 2, h * 0.26, PAL.woodLight, { top: 0.3, bottom: 0.2 });
  for (let i = 0; i < 5; i += 1) {
    bmp.blendRect(3 + i * (w - 6) / 5, 2.4, 1, h * 0.22, PAL.woodHighlight, 0.5);
  }
  // 靠垫
  bmp.roundRect(3, 3.4, w - 6, h * 0.16, 1.2, PAL.clothMint);
  bmp.blendRect(3, 3.4, w - 6, 1, lighten(PAL.clothMint, 0.4), 0.7);
  // 坐垫
  bmp.roundRect(2.4, h * 0.32, w - 4.8, h * 0.2, 1.2, PAL.clothMint);
  bmp.blendRect(2.4, h * 0.32, w - 4.8, 1.2, lighten(PAL.clothMint, 0.45), 0.7);
}

function sofaProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.6, w * 0.46, 2.6, 0.8);
  // 底座
  face(bmp, 1, h * 0.46, w - 2, h * 0.5, PAL.clothSkyDeep, { top: 0.26, bottom: 0.24 });
  // 靠背
  face(bmp, 2, 1.6, w - 4, h * 0.44, PAL.clothSky, { top: 0.28, bottom: 0.22 });
  bmp.blendRect(2, 1.6, w - 4, h * 0.1, lighten(PAL.clothSky, 0.35), 0.7);
  // 分体靠垫
  const seats = 3;
  for (let i = 0; i < seats; i += 1) {
    const sw = (w - 6) / seats;
    const sx = 3 + i * sw;
    bmp.roundRect(sx + 0.4, 3.4, sw - 0.8, h * 0.3, 1.6, lighten(PAL.clothSky, 0.12));
    bmp.blendRect(sx + 0.4, 3.4, sw - 0.8, 1.2, lighten(PAL.clothSky, 0.45), 0.6);
    bmp.roundRect(sx + 0.4, h * 0.4, sw - 0.8, h * 0.16, 1.4, lighten(PAL.clothSky, 0.2));
    bmp.blendRect(sx + 0.4, h * 0.4, sw - 0.8, 1.2, lighten(PAL.clothSky, 0.5), 0.65);
    bmp.blendRect(sx + 0.4, h * 0.53, sw - 0.8, 1, darken(PAL.clothSky, 0.2), 0.5);
  }
  // 扶手
  for (const ax of [1, w - 5]) {
    bmp.roundRect(ax, h * 0.36, 4, h * 0.34, 1.6, PAL.clothSkyDeep);
    bmp.blendRect(ax, h * 0.36, 4, 1.2, lighten(PAL.clothSkyDeep, 0.4), 0.7);
  }
  // 抱枕
  bmp.roundRect(5, h * 0.3, 6, 5, 1.4, PAL.clothRose);
  bmp.blendRect(5, h * 0.3, 6, 1.2, lighten(PAL.clothRose, 0.4), 0.7);
  bmp.roundRect(w - 12, h * 0.32, 5.4, 4.6, 1.4, PAL.clothButter);
  // 木脚
  bmp.rect(3, h - 2, 2, 1.6, PAL.woodMid);
  bmp.rect(w - 5, h - 2, 2, 1.6, PAL.woodMid);
}

// ------------------------------------------------------------ 装饰与器物

function plantProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.2, w * 0.34, 1.8, 0.7);
  potPlant(bmp, w / 2, h - 0.6, 1, { clusters: 6 });
}

function lampProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1, w * 0.3, 1.4, 0.6);
  floorLamp(bmp, w / 2, h - 0.6, h - 1.2, { shade: PAL.clothButter });
}

function pendantProp(bmp, w, h) {
  pendantLamp(bmp, w / 2, 0, h * 0.52, w * 0.66, { shade: PAL.gold });
  // 灯罩下缘暖光
  bmp.ditherEllipse(w / 2, h * 0.66, w * 0.42, h * 0.1, alpha(PAL.lampWarm, 0.4), 0.5);
}

function signProp(bmp, w, h) {
  // 悬挂招牌：吊杆 + 木牌 + 品牌纹样
  bmp.rect(w * 0.08, 0, 0.5, 3, PAL.metalDeep);
  bmp.rect(w * 0.92, 0, 0.5, 3, PAL.metalDeep);
  face(bmp, 1, 3, w - 2, h - 5, PAL.woodPale, { top: 0.32, bottom: 0.24 });
  woodGrain(bmp, 1, 3, w - 2, h - 5, PAL.woodPale, { seed: 171 });
  // 内框
  bmp.rect(2.4, 4.4, w - 4.8, h - 8, PAL.cream);
  bmp.blendRect(2.4, 4.4, w - 4.8, 0.4, PAL.foilSheen, 0.8);
  // 品牌纹样：卡牌 + 星
  const cx = w / 2;
  for (let i = -1; i <= 1; i += 1) {
    bmp.rect(cx + i * 6 - 2, 6.4, 4, 5.4, i === 0 ? PAL.vermilion : PAL.clothSky);
    bmp.blendRect(cx + i * 6 - 1.6, 6.8, 3.2, 1.6, PAL.cream, 0.7);
  }
  bmp.rect(cx - 0.4, 5.2, 0.8, 0.8, PAL.gold);
  // 下沿阴影
  bmp.blendRect(1, h - 2.4, w - 2, 0.4, PAL.woodDeep, 0.5);
}

function rugProp(bmp, w, h) {
  // 长方形机织地毯：双层包边 + 菱形主纹 + 四角花 + 织纹，明确读作"地面铺装"
  bmp.roundRect(0.6, 0.6, w - 1.2, h - 1.2, 1.2, PAL.clothRoseDeep);
  bmp.roundRect(1.6, 1.6, w - 3.2, h - 3.2, 1, PAL.clothRose);
  bmp.roundRect(3.4, 3.4, w - 6.8, h - 6.8, 0.8, mix(PAL.clothRose, PAL.cream, 0.42));
  // 织纹
  for (let yy = 4.4; yy < h - 4; yy += 1.5) {
    bmp.blendRect(4.2, yy, w - 8.4, 0.35, PAL.clothRoseDeep, 0.22);
  }
  for (let xx = 4.4; xx < w - 4; xx += 1.5) {
    bmp.blendRect(xx, 4.2, 0.35, h - 8.4, PAL.clothRoseDeep, 0.16);
  }
  // 中央菱形
  const cx = w / 2;
  const cy = h / 2;
  const rw = w * 0.2;
  const rh = h * 0.26;
  bmp.polygon(
    [
      [cx, cy - rh],
      [cx + rw, cy],
      [cx, cy + rh],
      [cx - rw, cy],
    ],
    PAL.clothRoseDeep,
  );
  bmp.polygon(
    [
      [cx, cy - rh * 0.62],
      [cx + rw * 0.62, cy],
      [cx, cy + rh * 0.62],
      [cx - rw * 0.62, cy],
    ],
    PAL.cream,
  );
  bmp.polygon(
    [
      [cx, cy - rh * 0.3],
      [cx + rw * 0.3, cy],
      [cx, cy + rh * 0.3],
      [cx - rw * 0.3, cy],
    ],
    PAL.vermilion,
  );
  // 四角花
  for (const [sx, sy] of [
    [1, 1],
    [-1, 1],
    [1, -1],
    [-1, -1],
  ]) {
    const ox = cx + sx * w * 0.32;
    const oy = cy + sy * h * 0.3;
    bmp.ellipse(ox, oy, 2.2, 2.2, PAL.clothRoseDeep);
    bmp.ellipse(ox, oy, 1.3, 1.3, PAL.cream);
    bmp.ellipse(ox, oy, 0.6, 0.6, PAL.vermilion);
  }
  // 边缘绒毛
  for (let i = 0; i < 40; i += 1) {
    const t = i / 40;
    bmp.blendRect(0.6 + t * (w - 1.2), 0.1, 0.4, 0.5, PAL.clothRoseDeep, 0.6);
    bmp.blendRect(0.6 + t * (w - 1.2), h - 0.6, 0.4, 0.5, PAL.clothRoseDeep, 0.6);
  }
  // 上沿受光
  bmp.blendRect(1.6, 1.6, w - 3.2, 0.6, lighten(PAL.clothRose, 0.4), 0.5);
}

function doorMatProp(bmp, w, h) {
  rectRug(bmp, 0.6, 0.6, w - 1.2, h - 1.2, { outer: PAL.woodDeep, inner: '#c9a878' });
  // 编织横纹
  for (let y = 2; y < h - 2; y += 1.1) {
    bmp.blendRect(1.6, y, w - 3.2, 0.35, y % 2.2 < 1.1 ? PAL.woodLight : PAL.woodMid, 0.5);
  }
  // 中间图案
  bmp.roundRect(w * 0.24, h * 0.28, w * 0.52, h * 0.44, 0.6, PAL.cream);
  bmp.roundRect(w * 0.3, h * 0.36, w * 0.4, h * 0.28, 0.4, PAL.vermilion);
  bmp.blendRect(w * 0.36, h * 0.46, w * 0.28, 0.5, PAL.cream, 0.85);
}

function registerProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.2, w * 0.42, 1.8, 0.7);
  cashRegister(bmp, 0.6, 1, w - 1.2, h - 2, { body: PAL.clothSlate });
}

function caseStackProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.2, w * 0.42, 2, 0.75);
  // 下层两箱
  cardBox(bmp, 1, h * 0.46, w * 0.46, h * 0.5, 'lilac');
  cardBox(bmp, w * 0.5, h * 0.5, w * 0.46, h * 0.46, 'sky');
  // 上层一箱
  cardBox(bmp, w * 0.2, h * 0.08, w * 0.56, h * 0.4, 'butter');
  // 顶面高光
  bmp.blendRect(w * 0.22, h * 0.08, w * 0.52, 1, PAL.foilSheen, 0.5);
}

function kioskProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.6, w * 0.46, 3, 0.85);
  // 柜体
  face(bmp, 2, h * 0.66, w - 4, h * 0.34 - 0.6, PAL.woodLight, { top: 0.3, bottom: 0.26 });
  woodGrain(bmp, 2, h * 0.66, w - 4, h * 0.34 - 0.6, PAL.woodLight, { seed: 181 });
  bmp.rect(2, h - 3.2, w - 4, 2.6, darken(PAL.woodLight, 0.3));
  // 上部展架
  const bx = 3;
  const by = 1.4;
  const bw = w - 6;
  const bh = h * 0.66 - 6;
  face(bmp, bx, by, bw, bh, PAL.clothSky, { top: 0.24, bottom: 0.24 });
  bmp.blendRect(bx + 1, by + 1, bw - 2, bh - 2, alpha(PAL.cream, 0.24), 0.6);
  // 内部卡包与卡盒混合陈列
  for (let r = 0; r < 2; r += 1) {
    const rowY = by + 2 + r * (bh - 4) / 2;
    const rowH = (bh - 4) / 2 - 1.4;
    for (let i = 0; i < 5; i += 1) {
      const ix = bx + 2.4 + i * (bw - 4.8) / 5;
      if (r === 0 && i % 2 === 0) cardBox(bmp, ix, rowY, (bw - 4.8) / 5 - 1, rowH, ['butter', 'rose'][i % 2]);
      else foilPack(bmp, ix, rowY + 0.4, (bw - 4.8) / 5 - 1.4, rowH - 0.4, ['sky', 'mint', 'lilac', 'rose', 'butter'][i]);
    }
    bmp.rect(bx + 1.4, rowY + rowH, bw - 2.8, 0.8, PAL.woodPale);
    bmp.blendRect(bx + 1.4, rowY + rowH, bw - 2.8, 0.3, PAL.woodHighlight, 0.7);
  }
  // 柜面 + 收银屏
  woodTop(bmp, 1.4, h * 0.66 - 2, w - 2.8, 2.4, PAL.woodPale, { seed: 183 });
  bmp.roundRect(w - 22, h * 0.66 - 7.4, 16, 5.4, 0.5, PAL.clothSlate);
  bmp.rect(w - 21, h * 0.66 - 6.8, 14, 3.2, PAL.mintLight);
  bmp.blendRect(w - 20, h * 0.66 - 6.2, 8, 0.5, PAL.cream, 0.9);
  bmp.blendRect(w - 20, h * 0.66 - 5.2, 5, 0.4, PAL.mintDeep, 0.7);
  // 品牌条
  bmp.rect(4, h * 0.66 - 3.4, w - 8, 1.6, PAL.gold);
  bmp.blendRect(4, h * 0.66 - 3.4, w - 8, 0.4, PAL.goldLight, 0.9);
}

function boardProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.2, w * 0.4, 1.8, 0.7);
  // 支架
  bmp.rect(4, h - 6, 1.6, 5, PAL.woodMid);
  bmp.rect(w - 5.6, h - 6, 1.6, 5, PAL.woodMid);
  corkBoard(bmp, 1, 1, w - 2, h - 7);
}

function posterProp(bmp, w, h) {
  poster(bmp, 1, 1, w - 2, h - 2, { frame: PAL.woodLight, bg: PAL.clothLilac, figure: PAL.vermilion });
}

function trophyProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1, w * 0.32, 1.4, 0.6);
  trophy(bmp, w / 2, h - 0.8, 1.5);
}

function clockProp(bmp, w, h) {
  wallShadow(bmp, w * 0.16, h * 0.2, w * 0.68, h * 0.8);
  wallClock(bmp, w / 2, h / 2, Math.min(w, h) * 0.46);
}

function speakerProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1, w * 0.36, 1.6, 0.6);
  speaker(bmp, 1.4, 1, w - 2.8, h - 2.4, { color: PAL.clothSlate });
}

function teaProp(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.2, w * 0.44, 2, 0.7);
  teaTable(bmp, 1, 1, w - 2, h - 2.4, { color: PAL.woodPale });
}

function cabinetCollect(bmp, w, h, opts = {}) {
  contactShadow(bmp, w / 2, h - 1.6, w * 0.44, 3, 0.85);
  const bought = opts.bought !== false;
  // 柜体
  face(bmp, 1.4, 1.4, w - 2.8, h - 4, bought ? PAL.woodLight : mix(PAL.woodLight, PAL.metal, 0.3), { top: 0.3, bottom: 0.26 });
  woodGrain(bmp, 1.4, 1.4, w - 2.8, h - 4, bought ? PAL.woodLight : mix(PAL.woodLight, PAL.metal, 0.3), { seed: 191 });
  // 顶冠
  face(bmp, 0.6, 0.4, w - 1.2, 3.2, bought ? PAL.goldDeep : PAL.metalDeep, { top: 0.35, bottom: 0.2 });
  bmp.blendRect(1, 0.8, w - 2, 0.6, bought ? PAL.goldLight : PAL.metalLight, 0.85);
  // 底部
  bmp.rect(1.4, h - 4, w - 2.8, 2.6, darken(PAL.woodMid, 0.2));
  bmp.blendRect(1.4, h - 4, w - 2.8, 0.5, PAL.woodHighlight, 0.5);

  const gx = 3.2;
  const gw = w - 6.4;
  const topH = (h - 12) / 2;
  for (let row = 0; row < 2; row += 1) {
    const gy = 5.4 + row * (topH + 1.6);
    // 内腔
    bmp.rect(gx - 0.8, gy - 0.8, gw + 1.6, topH + 1.6, PAL.woodDeep);
    if (bought) {
      // 暖光内衬
      bmp.rect(gx, gy, gw, topH, mix(PAL.velvet, PAL.cream, 0.4));
      bmp.blendRect(gx, gy, gw, topH * 0.4, PAL.cream, 0.5);
      // 陈列卡
      rowOfCards(bmp, gx + 0.6, gy + 0.8, gw - 1.2, topH - 1.2, 3, [
        [PAL.clothRose, PAL.clothSky, PAL.clothButter],
        [PAL.clothMint, PAL.clothLilac, PAL.clothRose],
      ][row], { rarity: PAL.goldLight });
      glassCover(bmp, gx, gy, gw, topH);
      // 射灯
      bmp.blendEllipse(gx + gw / 2, gy + 0.6, gw * 0.3, 0.8, alpha(PAL.lampCore, 0.8), 0.9);
    } else {
      // 未购：空腔 + 防尘布 + 铭牌
      bmp.rect(gx, gy, gw, topH, mix(PAL.paperShade, PAL.woodLight, 0.4));
      bmp.blendRect(gx, gy, gw, topH * 0.35, PAL.paperShade, 0.6);
      for (let i = 0; i < 3; i += 1) {
        bmp.blendRect(gx + 1, gy + topH * (0.45 + i * 0.16), gw - 2, 0.4, PAL.woodDeep, 0.3);
      }
      bmp.rect(gx + gw * 0.18, gy + topH * 0.42, gw * 0.64, topH * 0.34, PAL.woodMid);
      bmp.blendRect(gx + gw * 0.22, gy + topH * 0.5, gw * 0.56, 0.5, PAL.goldLight, 0.8);
      bmp.blendRect(gx + gw * 0.28, gy + topH * 0.62, gw * 0.44, 0.4, PAL.cream, 0.6);
      glassCover(bmp, gx, gy, gw, topH);
    }
    // 层板分隔
    bmp.rect(gx - 1.2, gy + topH, gw + 2.4, 1.6, PAL.woodMid);
    bmp.blendRect(gx - 1.2, gy + topH, gw + 2.4, 0.5, PAL.woodHighlight, 0.7);
  }
  // 铭牌
  bmp.rect(w * 0.3, h - 6.4, w * 0.4, 2.6, bought ? PAL.gold : PAL.metalMid);
  bmp.blendRect(w * 0.34, h - 5.6, w * 0.32, 0.5, bought ? PAL.goldLight : PAL.metalLight, 0.9);
}

function boxRack(bmp, w, h) {
  contactShadow(bmp, w / 2, h - 1.4, w * 0.44, 2.4, 0.8);
  // 立柱
  for (const px of [0.8, w - 3.2]) {
    face(bmp, px, 1, 2.4, h - 3.4, PAL.woodMid, { top: 0.3, bottom: 0.24 });
    woodGrain(bmp, px, 1, 2.4, h - 3.4, PAL.woodMid, { axis: 'y', seed: 201 });
  }
  const themes = ['lilac', 'sky', 'rose', 'butter'];
  for (let r = 0; r < 3; r += 1) {
    const rowY = 2 + r * (h - 8) / 3;
    const rowH = (h - 8) / 3 - 1.2;
    cardBox(bmp, 3.6, rowY, (w - 7.2) / 2 - 0.8, rowH, themes[(r * 2) % 4]);
    cardBox(bmp, 3.6 + (w - 7.2) / 2 + 0.4, rowY, (w - 7.2) / 2 - 0.8, rowH, themes[(r * 2 + 1) % 4]);
    bmp.rect(0.8, rowY + rowH, w - 1.6, 1, PAL.woodPale);
    bmp.blendRect(0.8, rowY + rowH, w - 1.6, 0.4, PAL.woodHighlight, 0.7);
  }
  bmp.rect(0.8, h - 2.6, w - 1.6, 1.6, PAL.woodDark);
}

function wallDisplay(bmp, w, h) {
  // 挂轨 + 五组等距卡框（框体比例贴近真实卡牌，不是细长条）
  bmp.rect(0.6, 0.8, w - 1.2, 2, PAL.woodMid);
  bmp.blendRect(0.6, 0.8, w - 1.2, 0.5, PAL.woodHighlight, 0.9);
  bmp.blendRect(0.6, 2.4, w - 1.2, 0.4, PAL.woodDeep, 0.6);
  const colors = [PAL.clothRose, PAL.clothSky, PAL.clothButter, PAL.clothMint, PAL.clothLilac];
  const n = 5;
  const slotW = w / n;
  const cw = slotW * 0.44;
  const ch = Math.min(h - 6.4, cw * 1.42);
  for (let i = 0; i < n; i += 1) {
    const cx = slotW * (i + 0.5);
    const fx = cx - cw / 2;
    const fy = 4.4;
    // 吊钩
    bmp.blendRect(cx - 0.2, 2.6, 0.4, 1.8, PAL.metalDeep, 0.95);
    // 卡框
    bmp.rect(fx - 0.5, fy - 0.5, cw + 1, ch + 1, PAL.woodDeep);
    bmp.rect(fx, fy, cw, ch, PAL.woodLight);
    bmp.blendRect(fx, fy, cw, 0.4, PAL.woodHighlight, 0.9);
    bmp.rect(fx + 0.5, fy + 0.5, cw - 1, ch - 1, PAL.cream);
    bmp.rect(fx + 0.9, fy + 0.9, cw - 1.8, (ch - 1.8) * 0.6, colors[i]);
    bmp.blendRect(fx + 0.9, fy + 0.9, cw - 1.8, (ch - 1.8) * 0.3, lighten(colors[i], 0.4), 0.85);
    bmp.ellipse(cx, fy + (ch - 1.8) * 0.34, cw * 0.16, (ch - 1.8) * 0.13, PAL.cream);
    bmp.rect(fx + 0.9, fy + 0.9 + (ch - 1.8) * 0.64, cw - 1.8, (ch - 1.8) * 0.34, PAL.paperShade);
    bmp.blendRect(fx + 1.4, fy + 1.4 + (ch - 1.8) * 0.7, cw - 3.4, 0.4, PAL.inkLight, 0.5);
    // 玻璃反光
    bmp.blendPolygon(
      [
        [fx + 0.9, fy + 0.9],
        [fx + 0.9 + cw * 0.26, fy + 0.9],
        [fx + 0.9 + cw * 0.08, fy + ch - 0.9],
        [fx + 0.9, fy + ch - 0.9],
      ],
      PAL.foilSheen,
      0.3,
    );
    // 灯珠
    bmp.blendEllipse(cx, 4.6, cw * 0.3, 0.7, PAL.lampCore, 0.85);
  }
}

function roundRugProp(bmp, w, h) {
  roundRug(bmp, w / 2, h / 2, w / 2 - 0.6, h / 2 - 0.6, {
    outer: PAL.clothMintDeep,
    mid: PAL.clothMint,
    inner: PAL.clothMintDeep,
    center: PAL.clothMint,
  });
}

// ------------------------------------------------------------ 绘制入口

const PAINT = {
  counter_retail: (b, m) => counterRetail(b, m.w, m.h),
  counter_service: (b, m) => counterService(b, m.w, m.h),
  shelf: (b, m) => shelfProp(b, m.w, m.h, 0, 'full'),
  display_packs: (b, m) => displayPacks(b, m.w, m.h),
  display_boxes: (b, m) => displayBoxes(b, m.w, m.h),
  trash: (b, m) => {
    contactShadow(b, m.w / 2, m.h - 1, m.w * 0.4, 1.8, 0.7);
    trashBin(b, 1, 1, m.w - 2, m.h - 2);
  },
  table: (b, m) => tableProp(b, m.w, m.h, 0, 'idle'),
  chair: (b, m) => chairProp(b, m.w, m.h),
  lamp: (b, m) => lampProp(b, m.w, m.h),
  sign: (b, m) => signProp(b, m.w, m.h),
  plant: (b, m) => plantProp(b, m.w, m.h),
  rug: (b, m) => rugProp(b, m.w, m.h),
  register: (b, m) => registerProp(b, m.w, m.h),
  case_stack: (b, m) => caseStackProp(b, m.w, m.h),
  door_mat: (b, m) => doorMatProp(b, m.w, m.h),
  kiosk: (b, m) => kioskProp(b, m.w, m.h),
  bench: (b, m) => benchProp(b, m.w, m.h),
  board: (b, m) => boardProp(b, m.w, m.h),
  poster: (b, m) => posterProp(b, m.w, m.h),
  sofa: (b, m) => sofaProp(b, m.w, m.h),
  tea: (b, m) => teaProp(b, m.w, m.h),
  trophy: (b, m) => trophyProp(b, m.w, m.h),
  clock: (b, m) => clockProp(b, m.w, m.h),
  speaker: (b, m) => speakerProp(b, m.w, m.h),

  pa_counter_procure: (b, m) => counterProcure(b, m.w, m.h),
  pa_counter_cashier: (b, m) => counterCashierNpc(b, m.w, m.h),
  pa_counter_market: (b, m) => counterMarket(b, m.w, m.h),
  pa_counter_opening: (b, m) => counterOpening(b, m.w, m.h),
  pa_shelf_empty: (b, m) => shelfProp(b, m.w, m.h, 0, 'empty'),
  pa_shelf_low: (b, m) => shelfProp(b, m.w, m.h, 0, 'low'),
  pa_shelf_full: (b, m) => shelfProp(b, m.w, m.h, 0, 'full'),
  pa_display_packs: (b, m) => displayPacks(b, m.w, m.h),
  pa_display_boxes: (b, m) => displayBoxes(b, m.w, m.h),
  pa_trash: (b, m) => {
    contactShadow(b, m.w / 2, m.h - 1, m.w * 0.4, 1.8, 0.7);
    trashBin(b, 1, 1, m.w - 2, m.h - 2);
  },
  pa_table_idle: (b, m) => tableProp(b, m.w, m.h, 0, 'idle'),
  pa_table_reserved: (b, m) => tableProp(b, m.w, m.h, 0, 'reserved'),
  pa_table_sim: (b, m) => tableProp(b, m.w, m.h, 0, 'sim'),
  pa_table_end: (b, m) => tableProp(b, m.w, m.h, 0, 'end'),
  pa_cabinet_collect: (b, m) => cabinetCollect(b, m.w, m.h, { bought: true }),
  pa_box_rack: (b, m) => boxRack(b, m.w, m.h),
  pa_wall_display: (b, m) => wallDisplay(b, m.w, m.h),
  pa_lamp_hang: (b, m) => pendantProp(b, m.w, m.h),
  pa_rug_round: (b, m) => roundRugProp(b, m.w, m.h),
  pa_shelf_upgrade_before: (b, m) => upgradeBefore(b, m.w, m.h),
  pa_showcase_lv0_unbought: (b, m) => cabinetCollect(b, m.w, m.h, { bought: false }),
  pa_showcase_lv1_bought: (b, m) => cabinetCollect(b, m.w, m.h, { bought: true }),
};

// 货架等级 × 库存
for (let lv = 0; lv <= 3; lv += 1) {
  for (const s of ['empty', 'low', 'full']) {
    PAINT[`pa_shelf_lv${lv}_${s}`] = (b, m) => shelfProp(b, m.w, m.h, lv, s);
  }
}
// 牌桌等级 × 状态
for (let lv = 0; lv <= 2; lv += 1) {
  for (const s of ['idle', 'reserved', 'sim', 'end']) {
    PAINT[`pa_table_lv${lv}_${s}`] = (b, m) => tableProp(b, m.w, m.h, lv, s);
  }
}
// 员工柜台
for (const role of ['cashier', 'stocker']) {
  for (const s of ['unhired', 'onduty', 'resting']) {
    PAINT[`pa_counter_${role}_${s}`] = (b, m) => staffCounter(b, m.w, m.h, role, s);
  }
}

/** 渲染单个道具为「道具自身尺寸」的位图。 */
export function paintProp(name) {
  const m = PROP_META[name];
  const painter = PAINT[name];
  if (!painter) throw new Error('未登记的道具绘制: ' + name);
  const bmp = new Bitmap(m.w * ART_SCALE, m.h * ART_SCALE);
  painter(bmp, m);
  // 统一轮廓：1 原生像素暖褐描边。4× 密度下 1px 约等于 0.25 世界像素，
  // 下采样后仍能保留清晰的 cel 边界，让家具在浅色地面上立得起来。
  // 平铺在地面的道具（地毯、门垫）不加硬描边：地面材质之间靠色差和绒毛边区分，
  // 加黑边会让地毯看起来像贴在木板上的贴纸。
  const flat = m.depth === 'flat' || name === 'rug' || name === 'door_mat';
  if (m.outline !== false && !flat) {
    bmp.outline(PAL.inkLine, 0.5, { diagonals: true, solidThreshold: 140 });
  }
  return bmp;
}
