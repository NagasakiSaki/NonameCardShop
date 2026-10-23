// tools/frontend-art/props.mjs — 16×16 瓦片集与家具/道具精灵（全部逐像素生成，可组合、可编辑）。
import { Img, PALETTE as P, mix, tileNoise, hash2 } from "./pixkit.mjs";

const T = 16;
const INK = P.ink;
const DEEP = (c, t = 0.34) => mix(c, INK, t);
const LIT = (c, t = 0.22) => mix(c, P.white, t);

/** 瓦片顺序必须与 assets/frontend/manifest.json 的 tileset.tiles 一致。 */
export const TILES = [
  "floor_wood_a", "floor_wood_b", "floor_tile", "floor_carpet",
  "wall_top", "wall_base", "wall_window", "wall_door",
  "wall_shadow", "floor_rug_edge", "floor_stone", "floor_stone_b",
  "wall_door_side", "corner_nw", "corner_ne", "corner_sw", "corner_se",
];

function woodPlanks(seed, base = P.wood) {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    const row = (y / 4) | 0;
    const rowTone = mix(base, P.woodLight, row % 2 ? 0.12 : 0);
    for (let x = 0; x < T; x += 1) {
      let c = rowTone;
      const n = tileNoise(x, y, seed + row, T);
      if (n > 0.78) c = mix(c, P.woodLight, 0.18);
      if (n < 0.16) c = mix(c, P.woodDark, 0.16);
      if (y % 4 === 3) c = DEEP(base, 0.3);                  // 板缝
      const seamX = (row % 2 ? 5 : 11);
      if (x === seamX) c = DEEP(base, 0.26);                 // 错缝
      if (y % 4 === 0) c = LIT(c, 0.1);
      img.px(x, y, c);
    }
  }
  return img;
}

function tileFloor() {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      const dark = ((x >> 3) + (y >> 3)) % 2 === 0;
      let c = dark ? mix(P.clothCream, P.wallShade, 0.35) : P.wallShade;
      if (x % 8 === 0 || y % 8 === 0) c = DEEP(c, 0.18);
      c = mix(c, P.white, tileNoise(x, y, 31) * 0.08);
      img.px(x, y, c);
    }
  }
  return img;
}

function carpetTile(seed = 3) {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      let c = P.carpet;
      const n = tileNoise(x, y, seed);
      if (n > 0.86) c = mix(P.carpet, P.carpetLight, 0.45);
      if (n < 0.1) c = DEEP(P.carpet, 0.22);
      if ((x + y) % 8 === 0) c = mix(P.carpet, P.carpetTrim, 0.16);
      img.px(x, y, c);
    }
  }
  return img;
}

function wallTop() {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      let c = P.wall;
      if (x % 4 === 0) c = mix(P.wall, P.wallShade, 0.55);   // 壁纸条纹
      if (y < 2) c = LIT(P.wall, 0.15);
      if (y === T - 1) c = DEEP(P.wallShade, 0.3);
      if (y >= 12) c = mix(P.wall, P.wallShade, 0.3);
      c = mix(c, P.white, tileNoise(x, y, 51) * 0.06);
      img.px(x, y, c);
    }
  }
  return img;
}

function wallBase() {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      let c = y < 3 ? P.wallShade : P.wainscot;
      if (y < 3) c = mix(P.wallShade, P.wall, 0.4);
      if (y === 3) c = DEEP(P.wainscot, 0.35);
      if (y > 3 && x % 8 === 0) c = P.wainscotShade;
      if (y === T - 1) c = DEEP(P.wainscotShade, 0.45);
      if (y > 3 && y < 5) c = LIT(P.wainscot, 0.12);
      img.px(x, y, c);
    }
  }
  return img;
}

function wallWindow() {
  const img = wallTop();
  // 窗：上半是玻璃，下半是墙裙
  for (let y = 1; y < 9; y += 1) {
    for (let x = 2; x < 14; x += 1) {
      if (y === 1 || y === 8) { img.px(x, y, P.woodDark); continue; }
      if (x === 2 || x === 13) { img.px(x, y, P.woodDark); continue; }
      if (x === 7 || x === 8) { img.px(x, y, P.woodDark); continue; }
      const sky = mix(P.glass, P.white, 0.25 + tileNoise(x, y, 71) * 0.2);
      img.px(x, y, sky);
    }
  }
  img.hline(1, 14, 9, P.woodDark);
  img.px(3, 3, P.white);
  img.px(4, 2, mix(P.white, P.glass, 0.5));
  return img;
}

function wallDoor() {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      let c = y < 2 ? P.woodDark : P.wood;
      if (x % 2 === 0) c = mix(c, P.woodLight, 0.1);
      if (x === 5 || x === 6) c = P.glass;
      if (x === 3 || x === 8) c = P.woodDark;
      img.px(x, y, c);
    }
  }
  img.hline(0, 15, 0, DEEP(P.woodDark, 0.4));
  img.px(11, 8, P.gold);
  img.px(11, 9, P.goldShade);
  return img;
}

function wallShadow() {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    const a = 0.5 - y * 0.06;
    for (let x = 0; x < T; x += 1) img.blend(x, y, INK, Math.max(0, a));
  }
  return img;
}

function stoneTile(seed) {
  const img = new Img(T, T);
  for (let y = 0; y < T; y += 1) {
    for (let x = 0; x < T; x += 1) {
      let c = mix(P.metal, P.woodDark, 0.5);
      if ((x % 8 === 0) || (y % 8 === 0)) c = DEEP(c, 0.18);
      c = mix(c, tileNoise(x, y, seed) > 0.8 ? P.metal : c, 0.12);
      img.px(x, y, c);
    }
  }
  return img;
}

/** 墙角：在墙裙上给出朝向地面的内阴影与受光边，让两张地图的四个角不是硬拼。 */
function cornerTile({ right = false, left = false, top = false, bottom = false }) {
  const img = wallBase();
  const inner = DEEP(P.wainscotShade, 0.45);
  const light = LIT(P.wainscot, 0.22);
  const edge = (x, y, horizontal) => {
    img.px(x, y, inner);
    if (horizontal) img.px(x, y + (top ? 1 : -1), light);
    else img.px(x + (left ? 1 : -1), y, light);
  };
  if (right) for (let y = 0; y < T; y += 1) { img.px(T - 1, y, inner); img.px(T - 2, y, DEEP(P.wainscot, 0.2)); }
  if (left) for (let y = 0; y < T; y += 1) { img.px(0, y, inner); img.px(1, y, DEEP(P.wainscot, 0.2)); }
  if (top) for (let x = 0; x < T; x += 1) { img.px(x, 0, inner); img.px(x, 1, DEEP(P.wainscotShade, 0.25)); }
  if (bottom) for (let x = 0; x < T; x += 1) { img.px(x, T - 1, inner); img.px(x, T - 2, DEEP(P.wainscot, 0.25)); }
  // 角上补一段压光，避免内阴影在拐角断开
  if (right && bottom) { img.px(T - 2, T - 2, light); img.px(T - 3, T - 3, DEEP(P.wainscot, 0.15)); }
  if (left && bottom) { img.px(1, T - 2, light); img.px(2, T - 3, DEEP(P.wainscot, 0.15)); }
  return img;
}

export function buildTileset() {
  const cols = 8;
  const rows = Math.ceil(TILES.length / cols);
  const img = new Img(cols * T, rows * T);
  const painters = {
    floor_wood_a: () => woodPlanks(11, P.wood),
    floor_wood_b: () => woodPlanks(23, mix(P.wood, P.woodLight, 0.16)),
    floor_tile: tileFloor,
    floor_carpet: () => carpetTile(3),
    wall_top: wallTop,
    wall_base: wallBase,
    wall_window: wallWindow,
    wall_door: wallDoor,
    wall_shadow: wallShadow,
    floor_rug_edge: () => {
      const t = carpetTile(9);
      for (let x = 0; x < T; x += 1) t.hline(x, x, 0, P.carpetTrim);
      return t;
    },
    floor_stone: () => stoneTile(5),
    floor_stone_b: () => stoneTile(17),
    corner_nw: () => cornerTile({ right: true, bottom: true }),
    corner_ne: () => cornerTile({ left: true, bottom: true }),
    corner_sw: () => cornerTile({ right: true, top: true }),
    corner_se: () => cornerTile({ left: true, top: true }),
    wall_door_side: () => {
      const img = wallBase();
      // 侧墙上的门：竖向分板 + 门把
      img.rect(2, 0, 12, 16, P.wood);
      img.rect(2, 0, 12, 1, P.woodLight);
      img.vline(6, 1, 13, P.woodDark);
      img.vline(9, 1, 13, DEEP(P.wood, 0.2));
      img.px(11, 8, P.gold);
      img.px(11, 9, P.goldShade);
      img.hline(2, 13, 15, P.woodDeep);
      return img;
    },
  };
  TILES.forEach((name, index) => {
    const tile = painters[name]();
    img.blit(tile, (index % cols) * T, Math.floor(index / cols) * T);
  });
  return img;
}

// ---------------------------------------------------------------- 家具与道具（48×48 单元）

export const PROPS = [
  "counter_retail", "counter_service", "shelf", "display_packs",
  "display_boxes", "trash", "table", "chair",
  "lamp", "sign", "plant", "rug",
  "register", "case_stack", "door_mat", "kiosk",
  "bench", "board",
];

/** 每个道具的单元尺寸与落地基线（供前端按 y 排序与碰撞）。 */
export const PROP_META = {
  counter_retail: { w: 48, h: 32, footY: 32, blocks: [[0, 20, 48, 12]], occludes: true },
  counter_service: { w: 48, h: 32, footY: 32, blocks: [[0, 20, 48, 12]], occludes: true },
  shelf: { w: 32, h: 40, footY: 40, blocks: [[0, 30, 32, 10]], occludes: true },
  display_packs: { w: 16, h: 24, footY: 24, blocks: [[1, 16, 14, 8]], occludes: true },
  display_boxes: { w: 16, h: 24, footY: 24, blocks: [[1, 16, 14, 8]], occludes: true },
  trash: { w: 16, h: 20, footY: 20, blocks: [[3, 12, 10, 8]], occludes: false },
  table: { w: 40, h: 32, footY: 32, blocks: [[0, 6, 40, 26]], occludes: true },
  chair: { w: 16, h: 20, footY: 20, blocks: [[3, 12, 10, 8]], occludes: false },
  lamp: { w: 16, h: 32, footY: 32, blocks: [[6, 28, 4, 4]], occludes: false },
  sign: { w: 32, h: 16, footY: 16, blocks: [], occludes: false },
  plant: { w: 16, h: 24, footY: 24, blocks: [[3, 18, 10, 6]], occludes: true },
  rug: { w: 48, h: 24, footY: 24, blocks: [], occludes: false },
  register: { w: 16, h: 16, footY: 16, blocks: [], occludes: false },
  case_stack: { w: 16, h: 24, footY: 24, blocks: [[1, 16, 14, 8]], occludes: true },
  door_mat: { w: 16, h: 16, footY: 16, blocks: [], occludes: false },
  kiosk: { w: 48, h: 32, footY: 32, blocks: [[0, 20, 48, 12]], occludes: true },
  bench: { w: 40, h: 20, footY: 20, blocks: [[0, 12, 40, 8]], occludes: false },
  board: { w: 24, h: 32, footY: 32, blocks: [[2, 26, 20, 6]], occludes: true },
};

function packFace(img, x, y, w, h, color) {
  img.rect(x, y, w, h, color);
  img.rect(x, y, w, 1, LIT(color, 0.35));
  img.rect(x, y + h - 1, w, 1, DEEP(color, 0.4));
  img.px(x + 1, y + 2, P.clothCream);
  img.px(x + 1, y + 3, P.clothCream);
  img.px(x + 2, y + 2, P.clothCream);
}

function woodTop(img, x, y, w, h, base) {
  img.rect(x, y, w, h, base);
  img.rect(x, y, w, 2, LIT(base, 0.22));
  img.hline(x, x + w - 1, y + h - 1, DEEP(base, 0.35));
  for (let xx = x + 3; xx < x + w; xx += 7) img.vline(xx, y + 2, y + h - 2, DEEP(base, 0.16));
}

function painterCounter(accent) {
  return () => {
    const img = new Img(48, 48);
    // 台面（3/4 视角）
    woodTop(img, 2, 12, 44, 8, P.wood);
    img.hline(2, 45, 12, P.woodLight);
    // 前立面
    img.rect(3, 20, 42, 11, P.woodDark);
    img.rect(3, 20, 42, 1, P.woodDeep);
    img.rect(3, 26, 42, 1, DEEP(P.woodDark, 0.25));
    img.rect(6, 21, 10, 5, mix(accent, P.clothCream, 0.4));
    img.hline(6, 15, 21, LIT(accent, 0.3));
    img.hline(7, 14, 23, DEEP(accent, 0.2));
    img.rect(20, 21, 16, 5, P.wood);
    img.hline(20, 35, 21, P.woodLight);
    // 玻璃挡板与灯
    img.rect(4, 6, 40, 2, P.glass);
    img.hline(4, 43, 6, mix(P.glass, P.white, 0.5));
    img.vline(4, 6, 12, P.woodDeep);
    img.vline(43, 6, 12, P.woodDeep);
    img.px(24, 10, P.gold);
    img.px(23, 10, P.goldShade);
    img.px(24, 10, P.warmLamp);
    img.outline(INK);
    return img;
  };
}

function painterShelf() {
  const img = new Img(32, 48);
  img.rect(2, 4, 28, 38, P.woodDark);
  img.rect(3, 5, 26, 36, P.wood);
  for (let shelf = 0; shelf < 3; shelf += 1) {
    const y = 9 + shelf * 11;
    img.rect(3, y + 7, 26, 2, P.woodDark);
    img.hline(3, 28, y + 7, LIT(P.wood, 0.2));
    // 一排卡包/卡盒
    const colors = [P.clothRed, P.clothBlue, P.clothGreen, P.clothPurple, P.clothMustard, P.clothTeal];
    for (let i = 0; i < 5; i += 1) {
      const w = 4 + (i % 2);
      packFace(img, 4 + i * 5, y, w, 7, colors[(i + shelf) % colors.length]);
    }
  }
  img.rect(2, 4, 28, 2, LIT(P.wood, 0.3));
  img.hline(2, 29, 42, DEEP(P.woodDark, 0.3));
  img.outline(INK);
  return img;
}

function painterDisplay(kind) {
  return () => {
    const img = new Img(16, 24);
    img.rect(2, 6, 12, 14, P.woodDark);
    img.rect(3, 7, 10, 12, P.wood);
    if (kind === "boxes") {
      img.rect(3, 8, 5, 6, P.clothBlue);
      img.rect(8, 8, 5, 6, P.clothRed);
      img.rect(3, 15, 5, 4, P.clothGreen);
      img.rect(8, 15, 5, 4, P.clothPurple);
      img.hline(3, 12, 9, P.clothCream);
    } else {
      packFace(img, 3, 8, 4, 7, P.clothMustard);
      packFace(img, 8, 8, 4, 7, P.clothTeal);
      packFace(img, 5, 15, 4, 4, P.clothRed);
    }
    img.rect(1, 4, 14, 3, P.woodLight);
    img.hline(1, 14, 4, LIT(P.woodLight, 0.3));
    img.outline(INK);
    return img;
  };
}

function painterTrash() {
  const img = new Img(16, 20);
  img.rect(3, 6, 10, 12, P.metalShade);
  img.rect(4, 7, 8, 11, P.metal);
  img.vline(5, 8, 17, LIT(P.metal, 0.4));
  img.vline(10, 8, 17, P.metalShade);
  img.rect(2, 4, 12, 3, P.metalShade);
  img.hline(2, 13, 4, LIT(P.metal, 0.5));
  img.rect(6, 2, 4, 2, P.metalShade);
  img.outline(INK);
  return img;
}

function painterTable() {
  const img = new Img(40, 48);
  // 牌桌：桌面毛毡 + 木边
  img.rect(1, 8, 38, 16, P.woodDark);
  img.rect(3, 10, 34, 12, P.clothGreen);
  img.rect(3, 10, 34, 12, mix(P.clothGreen, P.ink, 0.1));
  img.hline(3, 36, 10, LIT(P.clothGreen, 0.25));
  img.rect(14, 12, 12, 8, mix(P.clothGreen, P.clothCream, 0.18));
  img.hline(14, 25, 12, mix(P.clothGreen, P.clothCream, 0.4));
  // 两副牌
  img.rect(8, 13, 4, 5, P.clothCream);
  img.hline(8, 11, 13, P.white);
  img.rect(28, 13, 4, 5, P.clothCream);
  img.hline(28, 31, 13, P.white);
  // 桌腿
  img.rect(6, 24, 4, 10, P.woodDeep);
  img.rect(30, 24, 4, 10, P.woodDeep);
  img.rect(4, 26, 8, 2, P.woodDark);
  img.rect(28, 26, 8, 2, P.woodDark);
  img.hline(1, 38, 8, LIT(P.woodDark, 0.25));
  img.outline(INK);
  return img;
}

function painterChair() {
  const img = new Img(16, 20);
  img.rect(3, 2, 10, 8, P.woodDark);
  img.rect(4, 3, 8, 6, P.wood);
  img.rect(2, 9, 12, 3, P.woodDark);
  img.hline(2, 13, 9, LIT(P.woodDark, 0.3));
  img.rect(4, 12, 2, 6, P.woodDeep);
  img.rect(10, 12, 2, 6, P.woodDeep);
  img.outline(INK);
  return img;
}

function painterLamp() {
  const img = new Img(16, 32);
  img.rect(7, 12, 2, 16, P.metalShade);
  img.rect(6, 28, 4, 3, P.metalShade);
  img.hline(5, 10, 28, P.metal);
  img.ellipse(7.5, 8, 5, 4, P.warmLamp);
  img.ellipse(7.5, 8, 5, 4, mix(P.warmLamp, P.white, 0.2));
  img.rect(3, 11, 10, 1, P.goldShade);
  img.px(6, 6, P.white);
  img.outline(INK);
  return img;
}

function painterSign() {
  const img = new Img(32, 16);
  img.rect(2, 2, 28, 11, P.woodDark);
  img.rect(3, 3, 26, 9, mix(P.clothCream, P.gold, 0.15));
  img.hline(3, 28, 3, P.white);
  // 店徽：卡包剪影
  img.rect(12, 5, 8, 6, P.clothRed);
  img.hline(12, 19, 5, P.clothRedLight);
  img.rect(14, 7, 4, 2, P.clothCream);
  img.px(6, 7, P.goldShade);
  img.px(25, 7, P.goldShade);
  img.outline(INK);
  return img;
}

function painterPlant() {
  const img = new Img(16, 24);
  img.rect(5, 16, 6, 6, P.woodDark);
  img.rect(6, 17, 4, 5, P.wood);
  for (let i = 0; i < 5; i += 1) {
    const cx = 3 + i * 2.5;
    img.ellipse(cx, 8 - (i % 2) * 2, 3, 5, i % 2 ? P.leaf : P.leafLight);
  }
  img.ellipse(8, 10, 4, 6, P.leaf);
  img.px(6, 6, P.leafLight);
  img.outline(INK);
  return img;
}

function painterRug() {
  const img = new Img(48, 24);
  img.rect(0, 0, 48, 24, P.carpet);
  img.rect(2, 2, 44, 20, mix(P.carpet, P.carpetLight, 0.3));
  img.rect(4, 4, 40, 16, P.carpet);
  for (let x = 6; x < 42; x += 6) {
    img.rect(x, 8, 3, 8, P.carpetTrim);
    img.rect(x + 1, 9, 1, 6, P.goldShade);
  }
  img.rect(0, 0, 48, 1, P.carpetTrim);
  img.rect(0, 23, 48, 1, P.carpetTrim);
  return img;
}

function painterRegister() {
  const img = new Img(16, 16);
  img.rect(2, 5, 12, 9, P.metalShade);
  img.rect(3, 6, 10, 7, P.metal);
  img.rect(4, 2, 8, 4, P.clothCream);
  img.hline(4, 11, 2, P.white);
  img.rect(5, 3, 6, 2, mix(P.clothCream, P.ink, 0.35));
  img.px(12, 8, P.gold);
  img.outline(INK);
  return img;
}

function painterCaseStack() {
  const img = new Img(16, 24);
  img.rect(2, 4, 12, 8, P.woodDeep);
  img.rect(2, 4, 12, 1, P.gold);
  img.rect(2, 12, 12, 8, P.inkSoft);
  img.rect(2, 12, 12, 1, P.gold);
  img.rect(3, 14, 10, 4, P.ink);
  img.outline(INK);
  return img;
}

function painterMat() {
  const img = new Img(16, 16);
  img.rect(1, 4, 14, 11, mix(P.clothMustard, P.wood, 0.4));
  img.rect(2, 5, 12, 9, mix(P.clothMustard, P.wood, 0.25));
  img.hline(2, 13, 5, LIT(P.clothMustard, 0.2));
  img.outline(INK);
  return img;
}

function painterBench() {
  const img = new Img(40, 20);
  img.rect(1, 4, 38, 6, P.woodDark);
  img.rect(2, 5, 36, 4, P.wood);
  img.hline(2, 37, 5, LIT(P.wood, 0.25));
  img.rect(1, 10, 38, 3, P.woodDark);
  img.hline(1, 38, 10, LIT(P.woodDark, 0.2));
  for (const x of [5, 33]) {
    img.rect(x, 13, 3, 5, P.woodDeep);
    img.px(x, 17, DEEP(P.woodDeep, 0.3));
  }
  img.rect(3, 2, 34, 2, P.wood);
  img.hline(3, 36, 2, LIT(P.wood, 0.3));
  img.outline(INK);
  return img;
}

function painterBoard() {
  const img = new Img(24, 32);
  img.rect(2, 2, 20, 22, P.woodDark);
  img.rect(3, 3, 18, 20, mix(P.clothCream, P.wood, 0.35));
  img.hline(3, 20, 3, P.clothCreamLight);
  // 公告：一张排期表 + 一张价目条
  img.rect(5, 6, 14, 9, P.clothCream);
  img.hline(6, 17, 8, DEEP(P.clothCream, 0.25));
  img.hline(6, 15, 10, DEEP(P.clothCream, 0.25));
  img.hline(6, 16, 12, DEEP(P.clothCream, 0.25));
  img.rect(5, 18, 8, 4, mix(P.clothTeal, P.white, 0.45));
  img.rect(14, 18, 5, 4, mix(P.clothRed, P.white, 0.4));
  img.rect(9, 24, 2, 6, P.woodDeep);
  img.rect(13, 24, 2, 6, P.woodDeep);
  img.rect(7, 29, 10, 2, P.woodDark);
  img.outline(INK);
  return img;
}

export function buildProps() {
  const cell = 48;
  const cols = 4;
  const rows = Math.ceil(PROPS.length / cols);
  const img = new Img(cols * cell, rows * cell);
  const painters = {
    counter_retail: painterCounter(P.clothRed),
    counter_service: painterCounter(P.clothBlue),
    shelf: painterShelf,
    display_packs: painterDisplay("packs"),
    display_boxes: painterDisplay("boxes"),
    trash: painterTrash,
    table: painterTable,
    chair: painterChair,
    lamp: painterLamp,
    sign: painterSign,
    plant: painterPlant,
    rug: painterRug,
    register: painterRegister,
    case_stack: painterCaseStack,
    door_mat: painterMat,
    kiosk: painterCounter(P.clothPurple),
    bench: painterBench,
    board: painterBoard,
  };
  PROPS.forEach((name, index) => {
    const sprite = painters[name]();
    img.blit(sprite, (index % cols) * cell, Math.floor(index / cols) * cell);
  });
  return img;
}

/** 灯光晕（叠加用），中心亮、边缘全透明。 */
export function buildGlow(size = 96, color = P.warmLamp) {
  const img = new Img(size, size);
  const c = (size - 1) / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = Math.hypot(x - c, y - c) / c;
      const a = Math.max(0, 1 - d);
      img.px(x, y, [0, 0, 0, Math.round(255 * Math.pow(a, 2.1) * 0.85)]);
      if (a > 0.02) {
        const col = mix(color, P.white, a * 0.3);
        img.px(x, y, [col[0], col[1], col[2], Math.round(255 * Math.pow(a, 2.1) * 0.85)]);
      }
    }
  }
  return img;
}

/** 网格阴影（角色脚下椭圆）。 */
export function buildBlobShadow() {
  const img = new Img(20, 10);
  for (let y = 0; y < 10; y += 1) {
    for (let x = 0; x < 20; x += 1) {
      const dx = (x - 9.5) / 9.5;
      const dy = (y - 4.5) / 4.5;
      const d = dx * dx + dy * dy;
      if (d <= 1) img.px(x, y, [0, 0, 0, Math.round(90 * (1 - d))]);
    }
  }
  return img;
}
