// tiles.mjs — 地面/墙面基础格，64×64 原生像素对应 16×16 世界（导航）像素。
// 与正式版 32×32 相比，同一逻辑格拥有 4 倍线性密度：可以画出板缝倒角、木纹走向、
// 灰浆阴影、墙面壁纸纹理与窗台厚度，而不是把旧图放大。

import { Bitmap, ART_SCALE, mix, lighten, darken, alpha, hash } from './canvas.mjs';
import { PAL } from './palette.mjs';

const CELL = 16; // 世界像素
const NATIVE = CELL * ART_SCALE; // 64

export const TILE_ORDER = [
  'floor_wood_a',
  'floor_wood_b',
  'floor_tile',
  'floor_carpet',
  'wall_top',
  'wall_base',
  'wall_window',
  'wall_door',
  'wall_shadow',
  'floor_rug_edge',
  'floor_stone',
  'floor_stone_b',
  'wall_door_side',
  'corner_nw',
  'corner_ne',
  'corner_sw',
  'corner_se',
];

function blank() {
  return new Bitmap(NATIVE, NATIVE);
}

/**
 * 木地板：竖向长板（每格 2 条 8 世界像素宽的板）。
 * 关键：不做横向板缝 —— 否则 16px 一格的贴图会在地面上留下规则网格。
 * 板与板之间只有竖向细缝，木纹也沿竖向走，读起来是"长条木地板"。
 */
function woodFloor(variant) {
  const t = blank();
  const plankW = 8;
  const base = PAL.floorOakLight;
  const mid = PAL.floorOak;
  const plankCount = CELL / plankW;
  for (let c = 0; c < plankCount; c += 1) {
    const x0 = c * plankW;
    // 板面：左右受光，中间平
    for (let x = 0; x < plankW; x += 1) {
      const k = Math.abs(x - plankW / 2) / (plankW / 2);
      t.rect(x0 + x, 0, 1, CELL, mix(base, mid, k * 0.5));
    }
    // 板缝：左暗右亮，一条 1 原生像素的立体缝
    t.blendRect(x0, 0, 0.25, CELL, PAL.floorOakSeam, 0.42);
    t.blendRect(x0 + 0.25, 0, 0.25, CELL, PAL.floorOakSheen, 0.22);
    // 木纹：竖向长线
    const seed = (variant === 'b' ? 41 : 13) + c * 5;
    for (let g = 0; g < 3; g += 1) {
      const gx = x0 + 1 + g * 2.1 + hash(g, c, seed) * 1.2;
      const gy = hash(g, c + 3, seed) * CELL;
      const gl = 5 + hash(g, c + 5, seed) * 9;
      const col = hash(g, c + 7, seed) > 0.5 ? mix(mid, PAL.floorOakDark, 0.55) : mix(mid, PAL.floorOakSheen, 0.6);
      // 分两段，跨越格边界时补齐，保证竖向连续
      const first = Math.min(gl, CELL - gy);
      t.blendRect(gx, gy, 0.25, first, col, 0.22);
      if (gl > first) t.blendRect(gx, 0, 0.25, gl - first, col, 0.22);
    }
    // 偶发"对接缝"：只在 variant b 的某一条板上出现，打破完全重复
    if (variant === 'b' && c === 1) {
      t.blendRect(x0 + 0.25, 6.5, plankW - 0.5, 0.25, PAL.floorOakSeam, 0.3);
      t.blendRect(x0 + 0.25, 6.75, plankW - 0.5, 0.25, PAL.floorOakSheen, 0.14);
    }
  }
  return t;
}

/** 石砖地面：4×4 世界像素小砖 + 灰浆缝 + 局部磨损。 */
function stoneFloor(variant) {
  const t = blank();
  const base = variant === 'b' ? PAL.floorStoneMid : PAL.floorStone;
  const light = variant === 'b' ? PAL.floorStone : PAL.floorStoneLight;
  const size = 8;
  const n = CELL / size;
  for (let ry = 0; ry < n; ry += 1) {
    for (let rx = 0; rx < n; rx += 1) {
      const ox = rx * size;
      const oy = ry * size;
      const shade = hash(rx, ry, variant === 'b' ? 19 : 5);
      const c = mix(light, base, 0.35 + shade * 0.45);
      t.rect(ox + 0.25, oy + 0.25, size - 0.5, size - 0.5, c);
      t.blendRect(ox + 0.25, oy + 0.25, size - 0.5, 0.25, lighten(c, 0.35), 0.5);
      t.blendRect(ox + 0.25, oy + size - 0.5, size - 0.5, 0.25, darken(c, 0.26), 0.45);
      t.blendRect(ox + size - 0.5, oy + 0.25, 0.25, size - 0.5, darken(c, 0.2), 0.38);
      // 砖面细微斑驳
      for (let s = 0; s < 3; s += 1) {
        const sx = ox + 0.6 + hash(rx + s, ry, 23) * (size - 1.4);
        const sy = oy + 0.6 + hash(rx, ry + s, 29) * (size - 1.4);
        t.blendRect(sx, sy, 0.5, 0.25, darken(c, 0.18), 0.3);
      }
    }
  }
  // 灰浆：只留很轻的网格
  t.blendRect(0, 0, CELL, 0.25, PAL.floorStoneSeam, 0.3);
  t.blendRect(0, 0, 0.25, CELL, PAL.floorStoneSeam, 0.3);
  return t;
}

/** 薄荷地毯：编织纹 + 柔和绒面。 */
function carpetFloor() {
  const t = blank();
  t.rect(0, 0, CELL, CELL, PAL.floorMint);
  // 编织横纹
  for (let y = 0; y < CELL; y += 0.75) {
    const k = hash(Math.round(y * 8), 3, 7);
    t.blendRect(0, y, CELL, 0.25, k > 0.5 ? lighten(PAL.floorMint, 0.28) : darken(PAL.floorMintMid, 0.12), 0.3);
  }
  // 编织竖纹（稀疏，形成方格感）
  for (let x = 0; x < CELL; x += 1.5) {
    t.blendRect(x, 0, 0.25, CELL, alpha(PAL.floorMintSeam, 0.35), 0.5);
  }
  // 绒面噪点
  for (let i = 0; i < 90; i += 1) {
    const x = hash(i, 1, 31) * CELL;
    const y = hash(i, 2, 37) * CELL;
    t.blendRect(x, y, 0.25, 0.25, hash(i, 3, 41) > 0.5 ? PAL.floorMintLight : PAL.floorMintMid, 0.35);
  }
  // 上沿受光
  t.blendRect(0, 0, CELL, 0.5, PAL.floorMintLight, 0.3);
  return t;
}

/** 地毯包边：内侧薄荷，外侧奶油滚边。 */
function rugEdgeFloor() {
  const t = carpetFloor();
  t.rect(0, 0, CELL, 1.2, PAL.cream);
  t.rect(0, 0, 1.2, CELL, PAL.cream);
  t.blendRect(0, 1.2, CELL, 0.3, PAL.floorMintSeam, 0.6);
  t.blendRect(1.2, 0, 0.3, CELL, PAL.floorMintSeam, 0.6);
  return t;
}

/** 墙面：奶油灰泥 + 竖纹壁纸 + 顶部吊顶投影 + 底部挂镜线。 */
function wallTop() {
  const t = blank();
  t.rect(0, 0, CELL, CELL, PAL.wallCream);
  // 壁纸竖纹（周期 4，保证水平无缝）
  for (let x = 0; x < CELL; x += 4) {
    t.blendRect(x + 1.5, 0, 0.4, CELL, PAL.wallPaperLine, 0.85);
    t.blendRect(x + 1.9, 0, 0.3, CELL, PAL.cream, 0.7);
  }
  // 极淡的花点（每 8 一格，形成规则小图案）
  for (let i = 0; i < 4; i += 1) {
    const x = 2 + i * 4;
    const y = 6 + (i % 2) * 4;
    t.blendRect(x, y, 0.6, 0.6, PAL.wallCreamDeep, 0.55);
    t.blendRect(x + 0.2, y + 0.2, 0.25, 0.25, PAL.wallPaperLine, 0.6);
  }
  // 顶部吊顶阴影：上暗下亮，暗示墙面向上收进天花板
  for (let y = 0; y < 7; y += 0.5) {
    t.blendRect(0, y, CELL, 0.5, PAL.wallShadow, 0.55 - y / 13);
  }
  // 挂镜线（墙面上部的装饰横线）
  t.blendRect(0, CELL - 2.6, CELL, 0.5, PAL.wainscotShade, 0.55);
  t.blendRect(0, CELL - 2.1, CELL, 0.35, PAL.wallCreamDeep, 0.7);
  // 墙面整体受光：左侧略亮
  t.hGradient(0, 0, CELL, CELL, alpha(PAL.cream, 0.22), alpha(PAL.wallCreamDeep, 0.14));
  return t;
}

/**
 * 护墙板：奶油色护墙板 + 竖向分格缝。
 * 不做横向压条 —— 贴图按 16px 竖直重复，横向线条会在高墙上变成一排排腰线。
 * 木色只留给家具与局部木牌，整面墙保持明亮。
 */
function wallBase() {
  const t = blank();
  t.rect(0, 0, CELL, CELL, PAL.wallCreamShade);
  // 竖向分格：每 8 世界像素一块护墙板
  const panel = 8;
  for (let x = 0; x < CELL; x += panel) {
    const c = mix(PAL.wallCreamShade, PAL.wallCream, hash(x, 1, 3) * 0.6);
    t.rect(x + 0.3, 0, panel - 0.6, CELL, c);
    // 分格缝：左暗右亮，1 原生像素
    t.blendRect(x, 0, 0.25, CELL, PAL.wainscotShade, 0.34);
    t.blendRect(x + 0.25, 0, 0.25, CELL, PAL.cream, 0.5);
    // 板面极轻的竖向纹理
    for (let g = 0; g < 2; g += 1) {
      const gx = x + 1.6 + g * 3.2 + hash(x, g, 17) * 0.8;
      t.blendRect(gx, 0, 0.25, CELL, PAL.wallPaperLine, 0.28);
    }
  }
  // 顶部一条极浅的木色压线（只在护墙板顶端出现一次，作为与上部墙面的分界）
  t.blendRect(0, 0, CELL, 0.4, PAL.wainscotLight, 0.55);
  t.blendRect(0, 0.4, CELL, 0.25, PAL.wainscotShade, 0.3);
  // 整体受光：左侧略亮
  t.hGradient(0, 0, CELL, CELL, alpha(PAL.cream, 0.2), alpha(PAL.wallCreamDeep, 0.1));
  return t;
}

/** 窗：木框 + 玻璃 + 室外天空 + 窗台厚度 + 阳光。 */
function wallWindow() {
  const t = wallBase();
  // 窗洞
  const wx = 1.4;
  const wy = 0.6;
  const ww = CELL - 2.8;
  const wh = CELL - 2.2;
  t.rect(wx, wy, ww, wh, PAL.woodMid);
  t.blendRect(wx, wy, ww, 0.4, PAL.woodHighlight, 0.8);
  // 玻璃：上冷下暖的天空
  const gx = wx + 0.8;
  const gy = wy + 0.8;
  const gw = ww - 1.6;
  const gh = wh - 1.6;
  for (let y = 0; y < gh; y += 0.5) {
    const k = y / gh;
    t.blendRect(gx, gy + y, gw, 0.5, mix(PAL.skyLight, PAL.sunWarm, k * 0.85), 0.92);
  }
  // 远处树影/屋顶剪影
  t.blendRect(gx, gy + gh * 0.62, gw, gh * 0.38, alpha(PAL.mint, 0.35), 0.7);
  t.blendPolygon(
    [
      [gx, gy + gh],
      [gx + gw * 0.32, gy + gh * 0.5],
      [gx + gw * 0.62, gy + gh * 0.78],
      [gx + gw, gy + gh * 0.46],
      [gx + gw, gy + gh],
    ],
    alpha(PAL.leaf, 0.42),
    0.7,
  );
  // 云
  t.blendEllipse(gx + gw * 0.3, gy + gh * 0.28, gw * 0.16, gh * 0.1, alpha('#ffffff', 0.8), 0.9);
  t.blendEllipse(gx + gw * 0.62, gy + gh * 0.2, gw * 0.12, gh * 0.07, alpha('#ffffff', 0.7), 0.9);
  // 窗棂
  t.rect(gx + gw / 2 - 0.25, gy, 0.5, gh, PAL.woodLight);
  t.blendRect(gx + gw / 2 - 0.25, gy, 0.25, gh, PAL.woodHighlight, 0.6);
  t.rect(gx, gy + gh * 0.48, gw, 0.5, PAL.woodLight);
  t.blendRect(gx, gy + gh * 0.48, gw, 0.25, PAL.woodHighlight, 0.6);
  // 玻璃反光
  t.blendPolygon(
    [
      [gx + gw * 0.08, gy],
      [gx + gw * 0.3, gy],
      [gx + gw * 0.05, gy + gh],
      [gx - gw * 0.1, gy + gh],
    ],
    alpha('#ffffff', 0.28),
    0.8,
  );
  // 窗台
  t.rect(wx - 0.6, wy + wh, ww + 1.2, 1.6, PAL.woodPale);
  t.blendRect(wx - 0.6, wy + wh, ww + 1.2, 0.4, PAL.woodHighlight, 0.85);
  t.blendRect(wx - 0.6, wy + wh + 1.3, ww + 1.2, 0.3, PAL.woodDeep, 0.5);
  // 窗台投影
  t.ditherRect(wx - 0.6, wy + wh + 1.6, ww + 1.2, 1.4, alpha('#8a6440', 0.3), 0.5);
  return t;
}

/** 门：木框 + 玻璃门扇 + 门把。 */
function wallDoor() {
  const t = wallBase();
  t.rect(1.2, 0.2, CELL - 2.4, CELL - 0.6, PAL.woodMid);
  t.rect(1.9, 0.9, CELL - 3.8, CELL - 1.6, PAL.woodLight);
  t.blendRect(1.9, 0.9, CELL - 3.8, 0.5, PAL.woodHighlight, 0.8);
  // 玻璃
  t.rect(2.6, 1.6, CELL - 5.2, CELL - 5.6, alpha(PAL.glass, 0.8));
  t.blendRect(2.6, 1.6, CELL - 5.2, 0.4, PAL.glassSheen, 0.9);
  t.blendPolygon(
    [
      [3, 1.6],
      [4.4, 1.6],
      [2.8, CELL - 4],
      [2.6, CELL - 4],
    ],
    alpha(PAL.glassSheen, 0.35),
    0.8,
  );
  // 门把
  t.rect(CELL - 4, CELL * 0.52, 1, 1.6, PAL.goldDeep);
  t.blendRect(CELL - 4, CELL * 0.52, 1, 0.5, PAL.goldLight, 0.9);
  return t;
}

/** 门侧柱。 */
function wallDoorSide() {
  const t = wallBase();
  t.rect(0, 0, CELL, CELL, PAL.woodMid);
  t.blendRect(0, 0, CELL, 0.5, PAL.woodHighlight, 0.8);
  t.blendRect(0, 0, 0.5, CELL, PAL.woodHighlight, 0.6);
  t.blendRect(CELL - 0.6, 0, 0.6, CELL, PAL.woodDeep, 0.55);
  for (let y = 2; y < CELL - 1; y += 3) {
    t.blendRect(1.2, y, CELL - 2.4, 0.25, darken(PAL.woodMid, 0.2), 0.3);
  }
  return t;
}

/** 墙根柔和阴影格（贴地过渡）。 */
function wallShadowTile() {
  const t = wallBase();
  for (let y = 0; y < 5; y += 0.5) {
    t.blendRect(0, y, CELL, 0.5, alpha('#8a6440', 0.42), 0.6 - y / 12);
  }
  return t;
}

function cornerTile(kind) {
  const t = wallBase();
  const inner = 3.2;
  if (kind === 'nw') {
    t.rect(0, 0, inner, CELL, PAL.woodPale);
    t.rect(0, 0, CELL, inner, PAL.woodPale);
    t.blendRect(inner - 0.4, 0, 0.4, CELL, PAL.woodDeep, 0.5);
    t.blendRect(0, inner - 0.4, CELL, 0.4, PAL.woodDeep, 0.5);
    t.blendRect(0, 0, inner, 0.5, PAL.woodHighlight, 0.9);
    t.blendRect(0, 0, 0.5, inner, PAL.woodHighlight, 0.9);
  } else if (kind === 'ne') {
    t.rect(CELL - inner, 0, inner, CELL, PAL.woodPale);
    t.rect(0, 0, CELL, inner, PAL.woodPale);
    t.blendRect(CELL - inner, 0, 0.4, CELL, PAL.woodDeep, 0.5);
    t.blendRect(0, inner - 0.4, CELL, 0.4, PAL.woodDeep, 0.5);
    t.blendRect(CELL - inner, 0, inner, 0.5, PAL.woodHighlight, 0.9);
  } else if (kind === 'sw') {
    t.rect(0, 0, inner, CELL, PAL.woodPale);
    t.rect(0, CELL - inner, CELL, inner, PAL.woodPale);
    t.blendRect(inner - 0.4, 0, 0.4, CELL, PAL.woodDeep, 0.5);
    t.blendRect(0, CELL - inner, CELL, 0.4, PAL.woodDeep, 0.5);
    t.blendRect(0, 0, inner, 0.5, PAL.woodHighlight, 0.9);
  } else {
    t.rect(CELL - inner, 0, inner, CELL, PAL.woodPale);
    t.rect(0, CELL - inner, CELL, inner, PAL.woodPale);
    t.blendRect(CELL - inner, 0, 0.4, CELL, PAL.woodDeep, 0.5);
    t.blendRect(0, CELL - inner, CELL, 0.4, PAL.woodDeep, 0.5);
  }
  return t;
}

export function drawTile(name) {
  switch (name) {
    case 'floor_wood_a':
      return woodFloor('a');
    case 'floor_wood_b':
      return woodFloor('b');
    case 'floor_tile':
      return stoneFloor('a');
    case 'floor_stone':
      return stoneFloor('a');
    case 'floor_stone_b':
      return stoneFloor('b');
    case 'floor_carpet':
      return carpetFloor();
    case 'floor_rug_edge':
      return rugEdgeFloor();
    case 'wall_top':
      return wallTop();
    case 'wall_base':
      return wallBase();
    case 'wall_window':
      return wallWindow();
    case 'wall_door':
      return wallDoor();
    case 'wall_door_side':
      return wallDoorSide();
    case 'wall_shadow':
      return wallShadowTile();
    case 'corner_nw':
      return cornerTile('nw');
    case 'corner_ne':
      return cornerTile('ne');
    case 'corner_sw':
      return cornerTile('sw');
    case 'corner_se':
      return cornerTile('se');
    default:
      throw new Error('未知地砖: ' + name);
  }
}

export function buildTileset(columns = 8) {
  const rows = Math.ceil(TILE_ORDER.length / columns);
  const sheet = new Bitmap(NATIVE * columns, NATIVE * rows);
  TILE_ORDER.forEach((name, i) => {
    const tile = drawTile(name);
    sheet.blit(tile, (i % columns) * CELL, Math.floor(i / columns) * CELL);
  });
  return { sheet, columns, rows, nativeSize: NATIVE, worldSize: CELL };
}
