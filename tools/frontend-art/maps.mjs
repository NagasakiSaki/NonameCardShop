// tools/frontend-art/maps.mjs — 两张地图的布局、碰撞与导航（与美术同源：改图即改导航）。
import { Img } from "./pixkit.mjs";
import { TILES, PROPS, PROP_META, buildTileset, buildProps } from "./props.mjs";

export const TILE = 16;
export const MAP_W = 30;
export const MAP_H = 20;
export const NAV_VERSION = "nav-2026-10-23a";

const tileIndex = (name) => {
  const index = TILES.indexOf(name);
  if (index < 0) throw new Error("瓦片未登记: " + name);
  return index;
};

/** 用代码拼网格，避免手写 30 列字符串数错。 */
function makeGrid({ windows = [], sideDoor = {}, bottomDoor = null }) {
  const rows = [];
  const top = Array(MAP_W).fill("W");
  for (const x of windows) top[x] = "o";
  rows.push(top.join(""));
  rows.push(Array(MAP_W).fill("B").join(""));
  for (let y = 2; y <= 18; y += 1) {
    const row = Array(MAP_W).fill(".");
    row[0] = "w";
    row[MAP_W - 1] = "w";
    if (sideDoor.y === y) row[MAP_W - 1] = "D";
    rows.push(row.join(""));
  }
  const bottom = Array(MAP_W).fill("w");
  if (bottomDoor !== null) bottom[bottomDoor] = "D";
  rows.push(bottom.join(""));
  return rows;
}

const WALLC = { W: "wall_top", o: "wall_window", B: "wall_base", w: "wall_base", D: "wall_door_side" };

function tileLayers(grid, accent) {
  const floorLayer = [];
  const wallLayer = [];
  const walk = [];
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const ch = grid[y][x];
      const isWall = ch in WALLC;
      let floorTile = (x + y) % 2 === 0 ? "floor_wood_a" : "floor_wood_b";
      const override = accent ? accent(x, y) : null;
      if (override) floorTile = override;
      floorLayer.push(tileIndex(floorTile));
      let wallTile = isWall ? WALLC[ch] : null;
      // 四个墙角用专用瓦片，避免整片墙裙硬拼
      if (ch === "B" || ch === "w") {
        if (y === 1 && x === 0) wallTile = "corner_nw";
        else if (y === 1 && x === MAP_W - 1) wallTile = "corner_ne";
        else if (y === MAP_H - 2 && x === 0) wallTile = "corner_sw";
        else if (y === MAP_H - 2 && x === MAP_W - 1) wallTile = "corner_se";
      }
      wallLayer.push(wallTile ? tileIndex(wallTile) : -1);
      walk.push(isWall ? 0 : 1);
    }
  }
  return { floorLayer, wallLayer, walk };
}

const storeAccent = (x, y) => {
  if (x >= 17 && x <= 19 && y >= 12 && y <= 15) return "floor_tile";
  return null;
};

const battleAccent = (x, y) => {
  if (x >= 1 && x <= 4 && y >= 7 && y <= 11) return "floor_stone";
  return null;
};

const STORE_PROPS = [
  { prop: "rug", tx: 12, ty: 9 },
  { prop: "shelf", tx: 3, ty: 3 },
  { prop: "shelf", tx: 3, ty: 6 },
  { prop: "shelf", tx: 3, ty: 9 },
  { prop: "display_packs", tx: 6, ty: 4 },
  { prop: "display_boxes", tx: 6, ty: 8 },
  { prop: "case_stack", tx: 8, ty: 12 },
  { prop: "counter_retail", tx: 4, ty: 14 },
  { prop: "register", tx: 5, ty: 13 },
  { prop: "counter_service", tx: 17, ty: 13 },
  { prop: "register", tx: 18, ty: 12 },
  { prop: "kiosk", tx: 22, ty: 4 },
  { prop: "sign", tx: 22, ty: 2 },
  { prop: "trash", tx: 27, ty: 17 },
  { prop: "door_mat", tx: 14, ty: 17 },
  { prop: "plant", tx: 1, ty: 3 },
  { prop: "plant", tx: 27, ty: 3 },
  { prop: "lamp", tx: 10, ty: 1 },
  { prop: "lamp", tx: 20, ty: 1 },
  { prop: "lamp", tx: 25, ty: 11 },
  { prop: "lamp", tx: 2, ty: 16 },
  { prop: "bench", tx: 10, ty: 17 },
  { prop: "board", tx: 21, ty: 16 },
];

const BATTLE_PROPS = [
  { prop: "rug", tx: 12, ty: 8 },
  { prop: "table", tx: 6, ty: 5 },
  { prop: "chair", tx: 8, ty: 4 },
  { prop: "chair", tx: 8, ty: 8 },
  { prop: "chair", tx: 5, ty: 6 },
  { prop: "table", tx: 17, ty: 11 },
  { prop: "chair", tx: 19, ty: 10 },
  { prop: "chair", tx: 19, ty: 14 },
  { prop: "chair", tx: 16, ty: 12 },
  { prop: "kiosk", tx: 22, ty: 3 },
  { prop: "sign", tx: 22, ty: 1 },
  { prop: "register", tx: 23, ty: 2 },
  { prop: "lamp", tx: 8, ty: 1 },
  { prop: "lamp", tx: 24, ty: 1 },
  { prop: "lamp", tx: 14, ty: 9 },
  { prop: "plant", tx: 1, ty: 3 },
  { prop: "plant", tx: 27, ty: 17 },
  { prop: "door_mat", tx: 1, ty: 8 },
  { prop: "bench", tx: 7, ty: 10 },
  { prop: "bench", tx: 14, ty: 15 },
  { prop: "board", tx: 26, ty: 4 },
];

function instantiateProps(list) {
  return list.map((entry, index) => {
    const meta = PROP_META[entry.prop];
    if (!meta) throw new Error("未知道具: " + entry.prop);
    return {
      id: entry.prop + "." + String(index + 1).padStart(2, "0"),
      prop: entry.prop,
      x: entry.tx * TILE,
      y: entry.ty * TILE,
      w: meta.w,
      h: meta.h,
      footY: meta.footY,
      occludes: meta.occludes,
      blocks: meta.blocks.map((b) => [...b]),
    };
  });
}

function applyPropBlocking(walk, props) {
  for (const p of props) {
    for (const [bx, by, bw, bh] of p.blocks) {
      const x0 = Math.floor((p.x + bx) / TILE);
      const x1 = Math.floor((p.x + bx + bw - 1) / TILE);
      const y0 = Math.floor((p.y + by) / TILE);
      const y1 = Math.floor((p.y + by + bh - 1) / TILE);
      for (let y = y0; y <= y1; y += 1) {
        for (let x = x0; x <= x1; x += 1) {
          if (y < 0 || y >= MAP_H || x < 0 || x >= MAP_W) continue;
          walk[y * MAP_W + x] = 0;
        }
      }
    }
  }
}

const walkableAt = (walk, tx, ty) => (tx < 0 || ty < 0 || tx >= MAP_W || ty >= MAP_H ? false : walk[ty * MAP_W + tx] === 1);

function reachable(walk, start) {
  const seen = new Set();
  const queue = [start];
  seen.add(start.y * MAP_W + start.x);
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      const key = ny * MAP_W + nx;
      if (seen.has(key) || !walkableAt(walk, nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

const px = (tx, ty) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE / 2 });
const at = (tx, ty) => ({ ...px(tx, ty), tile: { x: tx, y: ty } });

function buildMap({ mapId, label, grid, props: propList, accent, spawnTile, exits, interactions, queuePoints, tables, lights }) {
  const { floorLayer, wallLayer, walk } = tileLayers(grid, accent);
  const props = instantiateProps(propList);
  applyPropBlocking(walk, props);
  const reach = reachable(walk, spawnTile);
  const problems = [];

  for (const point of interactions) {
    if (!walkableAt(walk, point.stand.tile.x, point.stand.tile.y)) problems.push("交互站位不可走: " + point.id);
    else if (!reach.has(point.stand.tile.y * MAP_W + point.stand.tile.x)) problems.push("交互站位不可达: " + point.id);
  }
  for (const exit of exits) {
    if (!walkableAt(walk, exit.fromTile.x, exit.fromTile.y)) problems.push("出口不可走: " + exit.id);
    else if (!reach.has(exit.fromTile.y * MAP_W + exit.fromTile.x)) problems.push("出口不可达: " + exit.id);
  }
  const seatKeys = new Set();
  for (const table of tables) {
    for (const anchor of table.seatAnchors) {
      const key = anchor.tile.x + "," + anchor.tile.y;
      if (seatKeys.has(key)) problems.push("座位重叠: " + table.id + " @" + key);
      seatKeys.add(key);
      if (anchor.tile.x < 0 || anchor.tile.y < 0 || anchor.tile.x >= MAP_W || anchor.tile.y >= MAP_H) {
        problems.push("座位越界: " + table.id);
      }
    }
  }
  for (const q of queuePoints) if (!walkableAt(walk, q.tile.x, q.tile.y)) problems.push("排队点不可走: " + q.id);
  if (!walkableAt(walk, spawnTile.x, spawnTile.y)) problems.push("出生点不可走");
  else if (reach.size < 80) problems.push("可达区域过小: " + reach.size);

  return {
    ok: problems.length === 0,
    problems,
    reachableCount: reach.size,
    map: {
      mapId,
      label,
      navVersion: NAV_VERSION,
      tileSize: TILE,
      width: MAP_W,
      height: MAP_H,
      layers: [
        { name: "floor", type: "tiles", data: floorLayer },
        { name: "walls", type: "tiles", data: wallLayer },
      ],
      props,
      walkable: walk,
      spawn: { ...at(spawnTile.x, spawnTile.y), facing: "up" },
      exits,
      interactions,
      queuePoints,
      tables,
      lights,
    },
  };
}

export function buildStoreMap() {
  const grid = makeGrid({ windows: [3, 4, 12, 13, 21, 22], sideDoor: { y: 9 }, bottomDoor: 14 });
  const interactions = [
    {
      id: "store.retail", label: "密封商品零售", kind: "retail",
      anchor: px(6, 5), stand: at(7, 7), radius: 30,
      props: ["display_packs.05", "display_boxes.06", "shelf.02", "shelf.03", "shelf.04", "counter_retail.08"],
    },
    {
      id: "store.counter", label: "进货 / 开包柜台", kind: "counter",
      anchor: px(18, 14), stand: at(18, 15), radius: 28,
      props: ["counter_service.09"],
    },
    {
      id: "store.secondaryMarket", label: "二级市场单卡柜台", kind: "market",
      anchor: px(23, 4), stand: at(23, 6), radius: 30,
      props: ["kiosk.12"],
    },
    {
      id: "store.trash", label: "垃圾箱", kind: "trash",
      anchor: px(27, 17), stand: at(26, 17), radius: 24,
      props: ["trash.14"],
    },
  ];
  const exits = [
    {
      id: "store.entry", label: "店门", to: "store",
      fromTile: { x: 14, y: 17 }, rect: { x: 14 * TILE, y: 17 * TILE, w: 2 * TILE, h: TILE },
    },
    {
      id: "store.toBattleRoom", label: "去对战房", to: "battle-room",
      fromTile: { x: 28, y: 9 }, rect: { x: 28 * TILE, y: 8 * TILE, w: TILE, h: TILE * 3 },
      target: { mapId: "battle-room", point: "battleRoom.toStore", spawnTile: { x: 4, y: 9 } },
    },
  ];
  return buildMap({
    mapId: "store", label: "无名小店 · 主店", grid, props: STORE_PROPS, accent: storeAccent,
    spawnTile: { x: 14, y: 16 }, exits, interactions, queuePoints: [], tables: [],
    lights: [
      { x: px(10, 1).x, y: 30, radius: 80, warm: true },
      { x: px(20, 1).x, y: 30, radius: 80, warm: true },
      { x: px(25, 11).x, y: px(25, 11).y, radius: 68, warm: true },
      { x: px(2, 16).x, y: px(2, 16).y, radius: 60, warm: true },
    ],
  });
}

export function buildBattleRoomMap() {
  const grid = makeGrid({ windows: [4, 5, 20, 21], sideDoor: { y: 9 } });
  const seat = (tx, ty, tableId, index) => ({ x: tx * TILE + TILE / 2, y: ty * TILE + TILE - 4, tile: { x: tx, y: ty }, tableId, index });
  const tables = [
    {
      id: "table.01", label: "1 号牌桌",
      x: 6 * TILE, y: 5 * TILE, w: 40, h: 32,
      seatAnchors: [seat(9, 5, "table.01", 0), seat(9, 7, "table.01", 1)],
      observerSpots: [at(11, 6)],
    },
    {
      id: "table.02", label: "2 号牌桌",
      x: 17 * TILE, y: 11 * TILE, w: 40, h: 32,
      seatAnchors: [seat(20, 11, "table.02", 0), seat(20, 13, "table.02", 1)],
      observerSpots: [at(22, 12)],
    },
  ];
  const queuePoints = [
    { id: "queue.table.01", tile: { x: 12, y: 5 }, tableId: "table.01" },
    { id: "queue.table.02", tile: { x: 23, y: 12 }, tableId: "table.02" },
    { id: "queue.service", tile: { x: 23, y: 6 }, tableId: null },
  ];
  return buildMap({
    mapId: "battle-room", label: "无名小店 · 对战房", grid, props: BATTLE_PROPS, accent: battleAccent,
    spawnTile: { x: 4, y: 9 },
    exits: [
      {
        id: "battleRoom.toStore", label: "回主店", to: "store",
        fromTile: { x: 1, y: 9 }, rect: { x: TILE, y: 8 * TILE, w: TILE, h: TILE * 3 },
        target: { mapId: "store", point: "store.toBattleRoom", spawnTile: { x: 25, y: 9 } },
      },
    ],
    interactions: [
      {
        id: "battleRoom.service", label: "报名 / 桌位服务", kind: "service",
        anchor: px(23, 3), stand: at(23, 5), radius: 28,
        props: ["kiosk.10"],
      },
    ],
    tables, queuePoints,
    lights: [
      { x: px(8, 1).x, y: 30, radius: 84, warm: true },
      { x: px(24, 1).x, y: 30, radius: 76, warm: true },
      { x: px(14, 9).x, y: px(14, 9).y - 20, radius: 96, warm: true },
    ],
  });
}

function crop(src, x, y, w, h) {
  const out = new Img(w, h);
  for (let yy = 0; yy < h; yy += 1) {
    for (let xx = 0; xx < w; xx += 1) {
      const si = ((y + yy) * src.w + (x + xx)) * 4;
      const di = (yy * w + xx) * 4;
      out.data[di] = src.data[si];
      out.data[di + 1] = src.data[si + 1];
      out.data[di + 2] = src.data[si + 2];
      out.data[di + 3] = src.data[si + 3];
    }
  }
  return out;
}

/** 预览合成：瓦片层 + 按 y 排序的道具，仅用于人工核对，不作为运行时渲染。 */
export function composePreview(map, tileset, propSheet) {
  const img = new Img(MAP_W * TILE, MAP_H * TILE);
  for (let y = 0; y < MAP_H; y += 1) {
    for (let x = 0; x < MAP_W; x += 1) {
      const floorIndex = map.layers[0].data[y * MAP_W + x];
      img.blit(crop(tileset, (floorIndex % 8) * TILE, Math.floor(floorIndex / 8) * TILE, TILE, TILE), x * TILE, y * TILE);
      const wallIndex = map.layers[1].data[y * MAP_W + x];
      if (wallIndex >= 0) img.blit(crop(tileset, (wallIndex % 8) * TILE, Math.floor(wallIndex / 8) * TILE, TILE, TILE), x * TILE, y * TILE);
    }
  }
  const sorted = [...map.props].sort((a, b) => a.y + a.footY - (b.y + b.footY));
  for (const p of sorted) {
    const index = PROPS.indexOf(p.prop);
    img.blit(crop(propSheet, (index % 4) * 48, Math.floor(index / 4) * 48, p.w, p.h), p.x, p.y);
  }
  return img;
}

export { crop, buildTileset, buildProps };
