// PLAY-A A2 facility painter. Warm pixel-shop props drawn at ART_SCALE=2 (2 canvas px per world
// px), matching tools/frontend-art/props-v2.mjs conventions: meta in world px, placement origin
// = art top-left, footY = h, blocks relative to origin. Zero third-party deps; deterministic.
// Candidate assets only — nothing here writes to the project's official assets or maps.
import {Img, mix, hash2} from './pixkit.mjs';

export const ART_SCALE = 2;

// Palette aligned with props-v2's P ramp so mixed scenes stay coherent, plus PLAY-A accents.
const C = {
  ink: '#303345', wood: '#806651', woodLight: '#967963', woodDark: '#5d5148', pine: '#a8895f',
  edge: '#c3a27a', cream: '#f3e8cd', gold: '#e5bd72', goldDark: '#a8823e', teal: '#568883',
  green: '#4e8a6a', greenSoft: '#8fbf9a', blue: '#5c7490', rose: '#b87880', purple: '#807293',
  glass: '#91c4c6', glassLight: '#c2e2e0', paper: '#f5efdd', dark: '#433d3f', slate: '#465364',
  mint: '#9ed4c2', foil: ['#c56876', '#c3a264', '#749fa8', '#8e85ad'],
};

function kit(canvas) {
  return {
    r: (x, y, w, h, color) => canvas.rect(Math.round(x * 2), Math.round(y * 2), Math.round(w * 2), Math.round(h * 2), color),
    e: (x, y, rx, ry, color) => canvas.ellipse(Math.round(x * 2), Math.round(y * 2), Math.round(rx * 2), Math.round(ry * 2), color),
    d: (x, y, color) => canvas.px(Math.round(x * 2), Math.round(y * 2), color),
  };
}

// Ink-bordered furniture panel: top light, right/bottom shade (same recipe as props-v2).
function panel(k, x, y, w, h, c) {
  k.r(x, y, w, h, C.ink);
  k.r(x + 1, y + 1, w - 2, h - 2, c);
  k.r(x + 2, y + 1, w - 4, 0.5, mix(c, '#fff5d8', 0.35));
  k.r(x + w - 2, y + 2, 1, h - 3, mix(c, C.ink, 0.25));
}

function wood(k, x, y, w, h, c = C.wood) {
  panel(k, x, y, w, h, c);
  for (let yy = y + 3; yy < y + h - 2; yy += 4) {
    k.r(x + 2, yy, w - 4, 0.5, mix(c, C.ink, 0.12));
    for (let xx = x + 4; xx < x + w - 4; xx += 13) k.r(xx, yy + 1, 6, 0.5, mix(c, C.edge, 0.18));
  }
}

// Sealed foil booster pack: gold seal, cream name band, star dot.
function packItem(k, x, y, c, w = 6, h = 10) {
  panel(k, x, y, w, h, c);
  k.r(x + 1, y + 1, w - 2, 1, C.gold);
  k.r(x + 1, y + h - 2, w - 2, 0.5, C.cream);
  k.r(x + w / 2 - 1, y + 3, 2, 3, C.cream);
  k.d(x + w / 2, y + 4, C.gold);
}

// Sealed trade box: lid line, vertical tape, cream label.
function boxItem(k, x, y, c, w = 14, h = 10) {
  panel(k, x, y, w, h, c);
  k.r(x + 1, y + 1, w - 2, 2, mix(c, C.ink, 0.3));
  k.r(x + 1, y + 3, w - 2, 0.5, mix(c, '#fff5d8', 0.4));
  k.r(x + w / 2 - 0.5, y + 1, 1, h - 2, mix(c, '#fff5d8', 0.5));
  k.r(x + 2, y + h - 4, 4, 2.5, C.cream);
  k.d(x + 3, y + h - 3.5, C.gold);
}

// Single trading card, face up: white frame, art window, name line.
function cardItem(k, x, y, c) {
  k.r(x, y, 5, 7, '#f7f4ec');
  k.r(x + 1, y + 1, 3, 3, c);
  k.r(x + 1, y + 5, 3, 0.5, mix(c, C.ink, 0.4));
}

// Front plaque with a white glyph — the per-counter "name tag" channel.
// glyphs: 'in' 收货入库(down arrow into tray) | 'pay' 收银(coin) | 'trade' 二级市场(diamond)
function plaque(k, x, y, w, h, c, glyph) {
  panel(k, x, y, w, h, c);
  k.r(x + 1, y + 1, w - 2, 0.5, mix(c, '#ffffff', 0.4));
  const cx = x + w / 2, cy = y + h / 2;
  if (glyph === 'in') { k.r(cx - 0.5, cy - 3, 1, 4, '#f7f4ec'); k.r(cx - 2, cy - 1, 4, 1, '#f7f4ec'); k.r(cx - 1, cy, 2, 1, '#f7f4ec'); k.r(cx - 3, cy + 2, 6, 1, '#f7f4ec'); }
  else if (glyph === 'pay') { k.e(cx, cy, 2.5, 2.5, '#f7f4ec'); k.e(cx, cy, 1.5, 1.5, c); k.r(cx - 0.5, cy - 1.5, 1, 3, mix(c, C.ink, 0.2)); }
  else if (glyph === 'trade') { k.r(cx, cy - 3, 2, 2, '#f7f4ec'); k.r(cx - 1, cy - 1, 2, 2, '#f7f4ec'); k.r(cx - 2, cy + 1, 2, 2, '#f7f4ec'); k.r(cx - 3, cy + 3, 2, 1, '#f7f4ec'); }
}

// Contact shadow under solid furniture (soft edge so props don't float).
function contactShadow(k, w, h) { k.e(w / 2, h - 2, w / 2 - 1, 3, [35, 30, 40, 45]); }

// Standard counter chassis shared by the three tall counters (front y26..46).
function counterChassis(k, w, frontColor) {
  wood(k, 0, 16, w, 30);
  k.r(2, 18, w - 4, 3, C.edge);
  k.r(2, 40, w - 4, 3, C.woodDark);
  const slot = Math.floor((w - 10) / 31);
  for (let i = 0; i <= slot; i++) {
    const x = 5 + i * 31;
    panel(k, x, 24, Math.min(25, w - 10 - i * 31), 15, frontColor);
    k.r(x + 10, 26, 6, 1, C.gold);
  }
}

const PAINT = {
  // 采购/收货柜台：绿铭牌(入库箭头) + 顶部纸箱×2 + 剪贴板 + 胶带 —— "货从这进"。
  pa_counter_procure(k) {
    contactShadow(k, 96, 48);
    counterChassis(k, 96, C.woodLight);
    plaque(k, 8, 26, 18, 10, C.green, 'in');
    // open parcel with flaps + sealed box + clipboard + tape roll on the back top (y0..16)
    boxItem(k, 30, 4, '#a87850', 18, 12);
    k.r(30, 4, 18, 2, mix('#a87850', C.ink, 0.35));
    k.r(32, 1, 5, 3, mix('#a87850', '#fff5d8', 0.25)); k.r(41, 1, 5, 3, mix('#a87850', '#fff5d8', 0.25));
    boxItem(k, 52, 7, '#8a5a3a', 13, 9);
    panel(k, 69, 5, 16, 11, '#d9c9a6');
    k.r(71, 7, 12, 7, C.paper); k.r(73, 8, 8, 0.5, C.blue); k.r(73, 10, 6, 0.5, C.blue); k.r(74, 4, 6, 2, C.slate);
    k.r(76, 13, 7, 0.5, C.rose);
    k.e(24, 18, 4, 2.5, '#c9b8a0'); k.e(24, 17.5, 2.5, 1.5, '#e2d6bf');
  },

  // NPC 收银台：金铭牌(钱币) + 收银机 + 服务铃 + 硬币碟 —— "顾客在这付钱"。
  pa_counter_cashier(k) {
    contactShadow(k, 96, 48);
    counterChassis(k, 96, C.rose);
    plaque(k, 8, 26, 18, 10, C.gold, 'pay');
    panel(k, 30, 2, 22, 14, C.slate);
    k.r(32, 4, 18, 6, C.mint); k.r(34, 5, 10, 3, '#c8ead9'); k.r(32, 11, 18, 3, mix(C.slate, C.ink, 0.3));
    k.r(34, 12, 3, 1, C.gold); k.r(39, 12, 3, 1, C.gold); k.r(44, 12, 3, 1, C.gold);
    for (let i = 0; i < 6; i++) k.r(33 + (i % 3) * 6, 8 + Math.floor(i / 3) * 1.5, 4, 1, mix(C.slate, '#ffffff', 0.25));
    k.e(60, 10, 4, 3, C.gold); k.e(60, 9, 3, 2, '#ffe5a3'); k.d(60, 6, C.goldDark);
    k.r(56, 12, 8, 1, C.woodDark);
    k.e(74, 12, 4, 2, C.gold); k.e(74, 11.5, 3, 1.2, '#ffe5a3');
    cardItem(k, 86, 9, C.rose);
  },

  // 单卡二级市场柜台：紫铭牌(菱形) + 玻璃展示罩内 3 张散卡 + 价签 —— "单卡在这交易"。
  pa_counter_market(k) {
    contactShadow(k, 80, 48);
    counterChassis(k, 80, C.woodLight);
    plaque(k, 8, 26, 18, 10, C.purple, 'trade');
    panel(k, 26, 0, 48, 16, '#6d8389');
    for (let i = 0; i < 3; i++) {
      cardItem(k, 31 + i * 13, 4, [C.rose, C.blue, C.gold][i]);
      k.r(30 + i * 13, 12, 7, 2, C.cream); k.d(32 + i * 13, 13, '#c2503c');
    }
    k.r(27, 1, 46, 1, mix('#6d8389', '#ffffff', 0.45));
    k.r(27, 1, 1, 14, mix('#6d8389', '#ffffff', 0.3));
    k.r(70, 2, 6, 8, C.glassLight); k.r(70, 2, 1, 8, mix(C.glassLight, '#ffffff', 0.5));
  },

  // 拆包工作台：更平的工作台 + 切割垫 + 未拆/已拆卡包 + 剪刀 + 留牌盘/弃牌口。
  pa_counter_opening(k) {
    contactShadow(k, 80, 48);
    wood(k, 0, 18, 80, 26);
    k.r(2, 18, 76, 3, C.edge); k.r(2, 40, 76, 3, C.woodDark);
    k.r(4, 30, 72, 0.5, mix(C.wood, C.ink, 0.2));
    panel(k, 6, 20, 34, 14, C.teal);
    for (let x = 10; x < 38; x += 4) k.r(x, 21, 0.5, 12, mix(C.teal, C.ink, 0.25));
    for (let y = 24; y < 33; y += 4) k.r(7, y, 32, 0.5, mix(C.teal, C.ink, 0.25));
    k.r(6, 20, 2, 2, C.cream); k.r(38, 32, 2, 2, C.cream);
    packItem(k, 12, 22, '#c56876', 6, 10);
    // opened pack: torn top zigzag + folded foil + white inner
    panel(k, 24, 22, 7, 10, '#749fa8');
    k.r(24, 22, 7, 1, '#749fa8'); k.d(24, 21, '#749fa8'); k.d(26, 21, '#749fa8'); k.d(26, 20, '#749fa8'); k.d(28, 21, '#749fa8');
    k.r(25, 23, 2, 3, mix('#749fa8', '#ffffff', 0.5)); k.r(29, 23, 1.5, 5, mix('#749fa8', C.ink, 0.3));
    cardItem(k, 25, 26, C.gold);
    // scissors
    k.r(44, 24, 4, 0.5, '#b8bec9'); k.r(46, 22, 0.5, 4, '#b8bec9');
    k.e(43, 26, 1.5, 1.5, C.slate); k.e(46, 27, 1.5, 1.5, C.slate); k.d(47, 23, C.ink);
    // keep tray with 2 cards / discard slot
    panel(k, 54, 21, 20, 7, C.cream);
    cardItem(k, 56, 22, C.rose); cardItem(k, 62, 22, C.blue);
    k.r(57, 26, 6, 0.5, C.woodDark);
    panel(k, 54, 30, 20, 5, '#3a4440');
    k.r(56, 31, 16, 2, '#12181a'); k.r(56, 31, 16, 0.5, '#5a6a66');
  },

  // 货架三态：同一柜体，只变陈列量 —— 空架/低库存/充足。
  pa_shelf_empty(k) { shelfFrame(k); },
  pa_shelf_low(k) {
    shelfFrame(k);
    packItem(k, 8, 5, C.foil[0], 6, 11); packItem(k, 16, 5, C.foil[2], 6, 11);
    boxItem(k, 26, 20, '#83859b', 14, 10); packItem(k, 44, 20, C.foil[3], 6, 11);
    k.r(10, 36, 6, 0.5, mix(C.dark, C.ink, 0.3)); k.r(40, 36, 8, 0.5, mix(C.dark, C.ink, 0.3));
  },
  pa_shelf_full(k) {
    shelfFrame(k);
    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 15;
      for (let col = 0; col < 7; col++) {
        const c = C.foil[(row + col) % 4];
        if (row === 1 && col % 2 === 0) boxItem(k, 6 + col * 7.5, y + 1, '#83859b', 7, 10);
        else packItem(k, 6 + col * 7.5, y, c, 6, 11);
      }
    }
  },

  // 陈列矮柜两型：密封卡包(立式成排) vs 密封整盒(横卧大盒) —— 剪影与内容不同。
  pa_display_packs(k) {
    contactShadow(k, 64, 48);
    displayChassis(k, C.teal);
    for (let r = 0; r < 2; r++) for (let i = 0; i < 6; i++) packItem(k, 5 + i * 9, 3 + r * 11, C.foil[(i + r) % 4], 7, 10);
  },
  pa_display_boxes(k) {
    contactShadow(k, 64, 48);
    displayChassis(k, C.purple);
    boxItem(k, 5, 3, '#7e6986', 17, 11); boxItem(k, 24, 3, '#5e4a66', 17, 11); boxItem(k, 43, 3, '#8e85ad', 16, 11);
    boxItem(k, 8, 15, '#a45e76', 22, 11); boxItem(k, 33, 15, '#b99a68', 22, 11);
  },

  // 共享垃圾桶：卡宽投入口 + 回收箭头 —— 弃牌去所有意识。
  pa_trash(k) {
    contactShadow(k, 24, 32);
    panel(k, 3, 8, 18, 22, '#6e9a8e');
    k.r(0, 5, 24, 4, '#b1ccbb'); k.r(1, 9, 22, 1, mix('#b1ccbb', C.ink, 0.3));
    k.r(7, 6, 10, 2, '#1c2a28');
    k.r(8, 14, 8, 1.5, C.greenSoft); k.r(10, 12, 4, 2, C.greenSoft); k.r(8, 17, 8, 1.5, C.greenSoft);
    k.r(10, 19, 4, 1.5, C.greenSoft);
    k.r(5, 28, 14, 2, C.ink);
  },

  // 牌桌四态：同一桌体，桌面内容讲状态（fixture 驱动的候选演示）。
  pa_table_idle(k) {
    tableChassis(k);
    panel(k, 44, 10, 9, 6, '#3e465c'); k.r(45, 11, 7, 1, C.gold);
  },
  pa_table_reserved(k) {
    tableChassis(k);
    panel(k, 44, 10, 9, 6, '#3e465c'); k.r(45, 11, 7, 1, C.gold);
    k.r(26, 2, 12, 8, C.ink); k.r(27, 3, 10, 6, C.cream); k.d(32, 5, '#c2503c'); k.d(31, 6, '#c2503c'); k.d(33, 6, '#c2503c');
    k.r(31, 10, 2, 3, C.woodDark);
    k.r(12, 12, 8, 1, '#b37e80');
  },
  pa_table_sim(k) {
    tableChassis(k);
    for (let i = 0; i < 3; i++) { k.r(9 + i * 7, 11, 5, 7, '#f7f4ec'); k.r(10 + i * 7, 12, 3, 4, [C.rose, C.blue, C.green][i]); }
    for (let i = 0; i < 3; i++) k.r(38 + i * 7, 11, 5, 7, mix(C.dark, C.ink, 0.2));
    k.e(31, 16, 2.5, 2.5, C.gold); k.e(31, 16, 1.5, 1.5, '#ffe5a3');
    k.d(4, 9, '#ffe5a3'); k.d(59, 9, '#ffe5a3'); k.d(4, 27, '#ffe5a3'); k.d(59, 27, '#ffe5a3');
  },
  pa_table_end(k) {
    tableChassis(k);
    for (let i = 0; i < 3; i++) k.r(26 - i, 12 + i * 0.5, 6, 7, mix(C.dark, C.ink, 0.2));
    k.r(26, 12, 6, 7, '#f7f4ec'); k.r(27, 13, 4, 4, C.purple);
    k.r(10, 12, 8, 6, C.paper); k.r(11, 14, 6, 0.5, '#8b8b98'); k.r(11, 15.5, 5, 0.5, '#8b8b98'); k.r(11, 17, 4, 0.5, '#8b8b98');
    k.e(46, 16, 3, 1.5, C.gold); k.e(46, 14.5, 3, 1.5, '#ffe5a3');
  },

  // 收藏展示柜：金框玻璃双格 + 暖灯带 —— "店里最好的牌在这"。
  pa_cabinet_collect(k) {
    contactShadow(k, 48, 64);
    panel(k, 0, 4, 48, 58, C.goldDark);
    k.r(0, 0, 48, 5, mix(C.goldDark, '#ffe5a3', 0.3)); k.r(-0, 2, 48, 1, '#ffe5a3');
    panel(k, 4, 10, 40, 24, '#3a3230');
    k.r(5, 11, 38, 22, mix('#f3e0b0', '#ffe9bd', 0.2));
    for (let i = 0; i < 3; i++) cardItem(k, 9 + i * 12, 15, [C.rose, C.blue, C.gold][i]);
    k.r(6, 12, 36, 1, mix('#ffe9bd', '#ffffff', 0.5));
    panel(k, 4, 36, 40, 22, '#3a3230');
    k.r(5, 37, 38, 20, mix('#f3e0b0', '#ffe9bd', 0.2));
    for (let i = 0; i < 3; i++) cardItem(k, 9 + i * 12, 41, [C.green, C.purple, C.rose][i]);
    k.r(4, 33, 40, 3, C.woodDark);
    k.r(6, 12, 8, 0.5, mix(C.glassLight, '#ffffff', 0.4)); k.r(7, 13, 6, 0.5, mix(C.glassLight, '#ffffff', 0.25));
    k.r(2, 60, 44, 4, C.woodDark);
  },

  // 箱架：整盒备货层架。
  pa_box_rack(k) {
    contactShadow(k, 48, 48);
    k.r(0, 0, 3, 44, C.slate); k.r(45, 0, 3, 44, C.slate);
    k.r(0, 14, 48, 2.5, C.edge); k.r(0, 30, 48, 2.5, C.edge);
    boxItem(k, 5, 4, '#7e6986', 17, 10); boxItem(k, 24, 4, '#5e8b9c', 17, 10);
    boxItem(k, 5, 20, '#a45e76', 17, 10); boxItem(k, 24, 20, '#b99a68', 17, 10);
    k.r(0, 43, 48, 3, C.woodDark);
  },

  // 墙面陈列轨：5 个卡框 + 金色灯珠（挂在墙上，无碰撞）。
  pa_wall_display(k) {
    k.r(0, 0, 96, 3, C.woodDark); k.r(0, 0, 96, 0.5, mix(C.woodDark, '#fff5d8', 0.3));
    for (let i = 0; i < 5; i++) {
      const x = 5 + i * 18;
      k.d(x + 6, 3, C.gold);
      panel(k, x, 4, 13, 20, '#2c3038');
      k.r(x + 2, 6, 9, 12, [C.rose, C.blue, C.gold, C.green, C.purple][i]);
      k.r(x + 3, 7, 3, 4, mix([C.rose, C.blue, C.gold, C.green, C.purple][i], '#ffffff', 0.35));
      k.r(x + 2, 19, 9, 0.5, C.cream);
      k.r(x + 4, 25, 5, 0.5, C.goldDark);
    }
    for (let i = 0; i < 5; i++) for (let t = 0; t < 5; t++) k.r(9 + i * 18 - t * 0.8, 8 + t * 3, 1.6 + t * 1.6, 0.5, mix('#ffe5a3', [0, 0, 0, 80], t * 0.14));
  },

  // 吊灯：电线 + 暖罩 + 柔光（32×48，原点贴墙顶）。
  pa_lamp_hang(k) {
    k.r(15, 0, 2, 20, C.ink);
    for (let i = 0; i < 8; i++) k.r(15 - i * 1.2, 20 + i * 1.4, 2 + i * 2.4, 1.4, i % 2 ? C.gold : mix(C.gold, '#ffe5a3', 0.4));
    k.r(11, 31, 10, 2, C.goldDark);
    k.e(16, 35, 6, 2, mix('#ffd27a', [0, 0, 0, 40], 0.2));
    k.r(14, 33, 4, 3, '#fff1c3');
  },

  // 圆毯：平面层，走 -800 深度。
  pa_rug_round(k) {
    k.e(48, 24, 46, 22, '#7d666c');
    k.e(48, 24, 42, 18.5, '#b5a28b');
    k.e(48, 24, 34, 14.5, '#668a87');
    for (let a = 0; a < 12; a++) {
      const t = a / 12 * Math.PI * 2;
      k.d(48 + Math.cos(t) * 38, 24 + Math.sin(t) * 16, '#8caaa0');
    }
    k.e(48, 24, 12, 5, mix('#668a87', '#8caaa0', 0.4));
  },

  // 升级前：简易松木架（窄、无背板、陈列稀疏）—— 与 pa_shelf_full 组成前后对照。
  pa_shelf_upgrade_before(k) {
    contactShadow(k, 48, 48);
    k.r(0, 0, 3, 44, C.pine); k.r(45, 0, 3, 44, C.pine);
    k.r(0, 16, 48, 2.5, C.pine); k.r(0, 32, 48, 2.5, C.pine);
    packItem(k, 8, 6, C.foil[0], 6, 10); packItem(k, 16, 6, C.foil[1], 6, 10);
    packItem(k, 10, 22, C.foil[2], 6, 10);
    boxItem(k, 24, 22, '#83859b', 13, 9);
    k.r(0, 43, 48, 3, C.woodDark);
  },
};

function shelfFrame(k) {
  wood(k, 0, 0, 64, 54, '#87735c');
  k.r(4, 4, 56, 45, C.dark);
  for (let row = 0; row < 3; row++) {
    const y = 5 + row * 15;
    k.r(3, y + 12, 58, 3, C.edge);
    k.r(7, y + 13, 8, 1, C.cream);
  }
  k.r(2, 52, 5, 3, C.ink); k.r(57, 52, 5, 3, C.ink);
}

function displayChassis(k, backColor) {
  wood(k, 0, 24, 64, 22);
  panel(k, 2, 0, 60, 27, backColor);
  k.r(3, 25, 58, 3, C.gold);
  panel(k, 5, 33, 24, 7, C.cream);
  k.r(8, 35, 16, 0.5, C.wood); k.r(8, 37, 9, 0.5, C.wood);
}

function tableChassis(k, matColor = '#567b73') {
  k.r(5, 31, 5, 15, C.wood); k.r(54, 31, 5, 15, C.wood);
  wood(k, 0, 6, 64, 28);
  panel(k, 3, 8, 58, 22, mix(matColor, C.ink, 0.25));
  k.r(5, 10, 54, 18, matColor);
  k.r(31, 11, 0.5, 16, '#b9c4a1');
  k.r(4, 9, 56, 0.5, mix(matColor, '#ffffff', 0.3));
}

// Facility registry: sizes/blocks in world px, origin = art top-left, matching props-v2 meta
// semantics so the main model can repack these into the official props sheet as-is.
const F = (id, w, h, opts = {}) => ({
  id, w, h, footY: h, occludes: opts.occludes !== false,
  blocks: opts.blocks ?? [[0, Math.max(16, h - 22), w, Math.min(22, h - 16)]],
  stand: opts.stand ?? [Math.round(w / 2), h + 8],
  depth: opts.depth ?? 'y',
  family: opts.family ?? null, state: opts.state ?? null,
  label: opts.label ?? id,
});
export const FACILITIES = [
  F('pa_counter_procure', 96, 48, { blocks: [[0, 26, 96, 22]], stand: [48, 56], label: '采购/收货柜台' }),
  F('pa_counter_cashier', 96, 48, { blocks: [[0, 26, 96, 22]], stand: [48, 56], label: 'NPC 收银台' }),
  F('pa_counter_market', 80, 48, { blocks: [[0, 26, 80, 22]], stand: [40, 56], label: '单卡二级市场柜台' }),
  F('pa_counter_opening', 80, 48, { blocks: [[0, 26, 80, 22]], stand: [40, 56], label: '拆包工作台' }),
  F('pa_shelf_empty', 64, 56, { blocks: [[0, 40, 64, 16]], stand: [32, 62], family: 'shelf', state: 'empty', label: '货架·空' }),
  F('pa_shelf_low', 64, 56, { blocks: [[0, 40, 64, 16]], stand: [32, 62], family: 'shelf', state: 'low', label: '货架·低库存' }),
  F('pa_shelf_full', 64, 56, { blocks: [[0, 40, 64, 16]], stand: [32, 62], family: 'shelf', state: 'full', label: '货架·充足' }),
  F('pa_display_packs', 64, 48, { blocks: [[0, 28, 64, 20]], stand: [32, 54], family: 'display', state: 'packs', label: '卡包陈列柜' }),
  F('pa_display_boxes', 64, 48, { blocks: [[0, 28, 64, 20]], stand: [32, 54], family: 'display', state: 'boxes', label: '卡盒陈列柜' }),
  F('pa_trash', 24, 32, { blocks: [[4, 12, 16, 20]], stand: [12, 40], label: '共享垃圾桶' }),
  F('pa_table_idle', 64, 48, { blocks: [[0, 16, 64, 32]], stand: [32, 58], family: 'table', state: 'idle', label: '牌桌·空闲' }),
  F('pa_table_reserved', 64, 48, { blocks: [[0, 16, 64, 32]], stand: [32, 58], family: 'table', state: 'reserved', label: '牌桌·预留' }),
  F('pa_table_sim', 64, 48, { blocks: [[0, 16, 64, 32]], stand: [32, 58], family: 'table', state: 'sim', label: '牌桌·模拟中' }),
  F('pa_table_end', 64, 48, { blocks: [[0, 16, 64, 32]], stand: [32, 58], family: 'table', state: 'end', label: '牌桌·结束短反馈' }),
  F('pa_cabinet_collect', 48, 64, { blocks: [[2, 48, 44, 16]], stand: [24, 70], label: '收藏展示柜' }),
  F('pa_box_rack', 48, 48, { blocks: [[0, 32, 48, 16]], stand: [24, 54], label: '整盒箱架' }),
  F('pa_wall_display', 96, 32, { blocks: [], occludes: false, depth: 'wall', stand: null, label: '墙面陈列轨' }),
  F('pa_lamp_hang', 32, 48, { blocks: [], occludes: false, depth: 'wall', stand: null, label: '吊灯' }),
  F('pa_rug_round', 96, 48, { blocks: [], occludes: false, depth: 'flat', stand: null, label: '圆毯' }),
  F('pa_shelf_upgrade_before', 48, 48, { blocks: [[0, 32, 48, 16]], stand: [24, 54], family: 'upgrade', state: 'before', label: '货架升级前' }),
];

export function paintFacility(id) {
  const meta = FACILITIES.find(f => f.id === id);
  if (!meta) throw new Error('未知设施: ' + id);
  const canvas = new Img(meta.w * ART_SCALE, meta.h * ART_SCALE);
  const k = kit(canvas);
  PAINT[id](k, meta);
  return canvas;
}
