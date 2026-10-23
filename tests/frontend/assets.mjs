// tests/frontend/assets.mjs — 素材与地图自检：图集尺寸整除、帧索引、透明底、清单路径、导航可达与出口配对。
import fs from "node:fs";
import path from "node:path";
import { decodePng } from "../../tools/frontend-art/png.mjs";

const ROOT = process.cwd();
const ASSETS = path.join(ROOT, "assets/frontend");
const manifest = JSON.parse(fs.readFileSync(path.join(ASSETS, "manifest.json"), "utf8"));

const results = [];
const info = [];
function check(name, fn) {
  try {
    fn();
    results.push({ name, ok: true });
  } catch (error) {
    results.push({ name, ok: false, error });
  }
}
const fileOf = (url) => path.join(ROOT, url.replace(/^\//, ""));

function readImage(url) {
  const buffer = fs.readFileSync(fileOf(url));
  const image = decodePng(buffer);
  return { ...image, bytes: buffer.length, url };
}

function alphaStats(image) {
  let opaque = 0;
  let transparent = 0;
  for (let i = 3; i < image.rgba.length; i += 4) {
    if (image.rgba[i] === 0) transparent += 1;
    else opaque += 1;
  }
  return { opaque, transparent };
}

function colorsOf(image) {
  const set = new Set();
  for (let i = 0; i < image.rgba.length; i += 4) {
    if (image.rgba[i + 3] === 0) continue;
    set.add(image.rgba[i] + "," + image.rgba[i + 1] + "," + image.rgba[i + 2]);
  }
  return set.size;
}

// ---- 清单结构 ----
check("清单字段完整（schemaVersion/artVersion/tileSize/characters/maps）", () => {
  for (const key of ["schemaVersion", "artVersion", "tileSize", "characters", "tileset", "props", "maps", "fx"]) {
    if (!(key in manifest)) throw new Error("清单缺字段 " + key);
  }
  if (manifest.tileSize !== 16) throw new Error("基础瓦片必须是 16×16");
});

check("至少 25 套新角色，且都带有四向/待机/立绘声明", () => {
  const ids = Object.keys(manifest.characters);
  if (ids.length < 7) throw new Error("角色数量 " + ids.length + " < 7");
  for (const id of ids) {
    const entry = manifest.characters[id];
    for (const key of ["sheet", "portrait", "frameWidth", "frameHeight", "anchorPx", "directions", "idleColumn", "walkColumns"]) {
      if (!(key in entry)) throw new Error(id + " 缺字段 " + key);
    }
    const modern=entry.columns===8;
    if(modern?(entry.frameWidth!==64||entry.frameHeight!==64):(entry.frameWidth!==96||entry.frameHeight!==128))throw new Error(id+' 帧尺寸与格式不一致');
    if (entry.anchorPx[0]!==entry.frameWidth/2||entry.anchorPx[1]>=entry.frameHeight) throw new Error(id+' 落脚点越界');
    const dirs = entry.directions;
    if(new Set(Object.values(dirs)).size!==4||Object.values(dirs).some(r=>r<0||r>3))throw new Error(id+' 朝向声明无效');
    if(entry.idleColumn<0||entry.idleColumn>=(entry.columns||3)||entry.walkColumns.some(col=>col<0||col>=(entry.columns||3)))throw new Error(id+' 动画帧越界');
  }
  if(ids.filter(id=>id.startsWith('bd-')).length!==25)throw new Error('五团角色应为 25 人');
});

check("角色图片尺寸符合清单，且均为透明背景", () => {
  for (const [id, entry] of Object.entries(manifest.characters)) {
    const sheet = readImage(entry.sheet);
    const sheetOk = sheet.width === entry.frameWidth*(entry.columns||3) && sheet.height === entry.frameHeight*4;
    if (!sheetOk) throw new Error(id + " 图集尺寸 " + sheet.width + "x" + sheet.height);
    const sheetAlpha = alphaStats(sheet);
    if (sheetAlpha.transparent < 500) throw new Error(id + " 图集不是透明底");
    if (sheetAlpha.opaque < 2000) throw new Error(id + " 图集内容过少");
    const portrait = readImage(entry.portrait);
    const portraitSize=entry.portraitSize||(entry.columns===8?[96,96]:[256,256]);
    if (portrait.width !== portraitSize[0] || portrait.height !== portraitSize[1]) throw new Error(id + " 立绘尺寸与格式不符");
    if(entry.avatar){const avatar=readImage(entry.avatar);if(avatar.width!==96||avatar.height!==96)throw new Error(id+' 列表头像应为 96×96');}
    const portraitAlpha = alphaStats(portrait);
    if (portraitAlpha.transparent < 800) throw new Error(id + " 立绘不是透明底");
    info.push({ 角色: id, 图集颜色数: colorsOf(sheet), 立绘颜色数: colorsOf(portrait), 图集字节: sheet.bytes, 立绘字节: portrait.bytes });
  }
});

check("新图集包含 32 帧，旧图集包含 12 帧，索引不越界", () => {
  for (const entry of Object.values(manifest.characters)) {
    const total=(entry.columns||3)*4;
    for(const row of Object.values(entry.directions))for(const col of entry.walkColumns)if(row*(entry.columns||3)+col>=total)throw new Error('帧索引越界');
  }
});

// ---- 瓦片与道具 ----
check("瓦片集尺寸能被 16 整除，清单列数与图片一致", () => {
  const tileset = readImage(manifest.tileset.image);
  const frameSize=manifest.tileset.frameSize||manifest.tileSize;
  if (tileset.width % frameSize !== 0 || tileset.height % frameSize !== 0) throw new Error("瓦片集尺寸不整除");
  if (tileset.width / frameSize !== manifest.tileset.columns) throw new Error("清单列数与图片不符");
  if (manifest.tileset.tiles.length > manifest.tileset.columns * manifest.tileset.rows) throw new Error("瓦片数量超出图集");
  info.push({ 瓦片集: tileset.width + "x" + tileset.height, 瓦片数: manifest.tileset.tiles.length, 字节: tileset.bytes });
});

check("道具图集单元整除，每个道具的裁切矩形不越界", () => {
  const sheet = readImage(manifest.props.image);
  if (sheet.width % manifest.props.cellSize !== 0 || sheet.height % manifest.props.cellSize !== 0) throw new Error("道具图集尺寸不整除");
  for (const prop of manifest.props.list) {
    if (prop.x + prop.w > sheet.width || prop.y + prop.h > sheet.height) throw new Error(prop.prop + " 裁切越界");
    if (prop.w > manifest.props.cellSize || prop.h > manifest.props.cellSize) throw new Error(prop.prop + " 超出单元尺寸");
  }
  info.push({ 道具图集: sheet.width + "x" + sheet.height, 道具数: manifest.props.list.length, 字节: sheet.bytes });
});

// ---- 地图与导航 ----
const mapCache = new Map();
function loadMap(id) {
  if (!mapCache.has(id)) {
    const map = JSON.parse(fs.readFileSync(fileOf(manifest.maps[id]), "utf8"));
    mapCache.set(id, map);
  }
  return mapCache.get(id);
}

check("两张地图的图层长度、索引范围与 navVersion 一致", () => {
  for (const id of Object.keys(manifest.maps)) {
    const map = loadMap(id);
    const total = map.width * map.height;
    for (const layer of map.layers) {
      if (layer.data.length !== total) throw new Error(id + " 图层 " + layer.name + " 长度不符");
      for (const index of layer.data) {
        if (index === -1) continue;
        if (index < 0 || index >= manifest.tileset.tiles.length) throw new Error(id + " 图层索引越界: " + index);
      }
    }
    if (map.walkable.length !== total) throw new Error(id + " 可通行表长度不符");
    if (map.navVersion !== manifest.navVersion) throw new Error(id + " navVersion 与清单不一致");
  }
});

const at = (map, tx, ty) => map.walkable[ty * map.width + tx] === 1;
function reachable(map, start) {
  const seen = new Set([start.y * map.width + start.x]);
  const queue = [start];
  while (queue.length) {
    const { x, y } = queue.shift();
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= map.width || ny >= map.height) continue;
      const key = ny * map.width + nx;
      if (seen.has(key) || !at(map, nx, ny)) continue;
      seen.add(key);
      queue.push({ x: nx, y: ny });
    }
  }
  return seen;
}

check("出生点可走、交互站位与出口可达", () => {
  for (const id of Object.keys(manifest.maps)) {
    const map = loadMap(id);
    const spawn = map.spawn.tile;
    if (!at(map, spawn.x, spawn.y)) throw new Error(id + " 出生点不可走");
    const seen = reachable(map, spawn);
    for (const interaction of map.interactions) {
      const tile = interaction.stand.tile;
      if (!at(map, tile.x, tile.y)) throw new Error(id + " 交互站位不可走: " + interaction.id);
      if (!seen.has(tile.y * map.width + tile.x)) throw new Error(id + " 交互站位不可达: " + interaction.id);
    }
    for (const exit of map.exits) {
      const tile = exit.fromTile;
      if (!at(map, tile.x, tile.y)) throw new Error(id + " 出口不可走: " + exit.id);
      if (!seen.has(tile.y * map.width + tile.x)) throw new Error(id + " 出口不可达: " + exit.id);
    }
  }
});

check("出口双向匹配，且目标地图存在", () => {
  for (const id of Object.keys(manifest.maps)) {
    const map = loadMap(id);
    for (const exit of map.exits) {
      if (!exit.target) continue;
      if (!manifest.maps[exit.target.mapId]) throw new Error(exit.id + " 指向不存在的地图");
      const target = loadMap(exit.target.mapId);
      const back = target.exits.find((candidate) => candidate.target && candidate.target.mapId === id);
      if (!back) throw new Error(exit.id + " 没有回程出口");
      if (back.id !== exit.target.point) throw new Error(exit.id + " 回程点不一致: " + exit.target.point + " ≠ " + back.id);
      const spawnTile = exit.target.spawnTile;
      if (!at(target, spawnTile.x, spawnTile.y)) throw new Error(exit.id + " 落点不可走");
    }
  }
});

check("语义 ID 完整，桌位与座位不重叠且在界内", () => {
  const required = ["store.entry", "store.retail", "store.counter", "store.secondaryMarket", "store.trash", "store.toBattleRoom", "battleRoom.toStore", "battleRoom.service"];
  const ids = new Set();
  for (const id of Object.keys(manifest.maps)) {
    const map = loadMap(id);
    for (const interaction of map.interactions) ids.add(interaction.id);
    for (const exit of map.exits) ids.add(exit.id);
  }
  for (const id of required) if (!ids.has(id)) throw new Error("缺少语义 ID " + id);
  const battle = loadMap("battle-room");
  const tableIds = new Set();
  const seatKeys = new Set();
  for (const table of battle.tables) {
    tableIds.add(table.id);
    for (const anchor of table.seatAnchors) {
      const key = anchor.tile.x + "," + anchor.tile.y;
      if (seatKeys.has(key)) throw new Error("座位重叠 " + key);
      seatKeys.add(key);
      if (anchor.tile.x < 0 || anchor.tile.y < 0 || anchor.tile.x >= battle.width || anchor.tile.y >= battle.height) throw new Error("座位越界");
    }
  }
  for (const id of ["table.01", "table.02"]) if (!tableIds.has(id)) throw new Error("缺少桌位 " + id);
});

check("道具引用都在清单里，位置在界内", () => {
  for (const id of Object.keys(manifest.maps)) {
    const map = loadMap(id);
    const known = new Set(manifest.props.list.map((prop) => prop.prop));
    for (const prop of map.props) {
      if (!known.has(prop.prop)) throw new Error(id + " 引用了未登记道具 " + prop.prop);
      if (prop.x < 0 || prop.y < 0) throw new Error(id + " 道具坐标为负");
      if (prop.x > map.width * map.tileSize || prop.y > map.height * map.tileSize) throw new Error(id + " 道具越界");
      for (const [bx, by, bw, bh] of prop.blocks) {
        if (bx < 0 || by < 0 || bx + bw > prop.w || by + bh > prop.h) throw new Error(prop.id + " 碰撞矩形超出精灵");
      }
    }
  }
});

check("清单里所有路径都能落到真实文件", () => {
  const urls = [];
  for (const entry of Object.values(manifest.characters)) urls.push(entry.sheet, entry.portrait);
  urls.push(manifest.tileset.image, manifest.props.image, manifest.fx.lampGlow, manifest.fx.shadow);
  urls.push(...Object.values(manifest.maps));
  for (const url of urls) {
    if (!fs.existsSync(fileOf(url))) throw new Error("路径不存在: " + url);
  }
});

// ---- 报告 ----
let totalBytes = 0;
for (const dir of ["characters", "portraits", "tiles", "props", "maps", "fx"]) {
  for (const name of fs.readdirSync(path.join(ASSETS, dir))) {
    totalBytes += fs.statSync(path.join(ASSETS, dir, name)).size;
  }
}

const failed = results.filter((row) => !row.ok);
for (const row of results) {
  console.log((row.ok ? "  ok   " : "  FAIL ") + row.name + (row.ok ? "" : "\n       " + (row.error && row.error.message)));
}
console.log("");
console.log("素材总量: " + (totalBytes / 1024).toFixed(1) + " KB（不含清单）");
console.log("美术 v4：新角色 64×64 四向八帧，兼容旧角色格式；导航、瓦片与设施规格保持。");
if (info.length) console.table ? console.table(info) : console.log(info);
console.log((results.length - failed.length) + "/" + results.length + " 项通过");
if (failed.length) process.exitCode = 1;
