// tools/frontend-art/build.mjs — 生成 assets/frontend 全部素材与清单。可重复执行，同参数同输出。
import fs from "node:fs";
import path from "node:path";
import { encodePng } from "./png.mjs";
import { PALETTE, Img } from "./pixkit.mjs";
import { CHARACTERS, drawActorSheet, drawPortrait, FRAME_W, FRAME_H, ANCHOR, DIRECTIONS, WALK_COLUMNS, DISPLAY_SCALE } from "./characters-v3.mjs";
import { TILES, PROPS, PROP_META, buildTileset, buildProps, buildGlow, buildBlobShadow, ART_SCALE, PROP_CELL } from "./props-v2.mjs";
import { buildStoreMap, buildBattleRoomMap, MAP_W, MAP_H, TILE, NAV_VERSION } from "./maps-v2.mjs";

const OUT = "assets/frontend";
const ART_VERSION = "pixel-shop-3-profile-skins";
const dirs = ["characters", "portraits", "tiles", "props", "maps", "fx", "fonts"];

function ensureDirs() {
  for (const dir of dirs) fs.mkdirSync(path.join(OUT, dir), { recursive: true });
}

function writePng(relPath, img) {
  const file = path.join(OUT, relPath);
  fs.writeFileSync(file, encodePng(img.w, img.h, img.data));
  return { path: "/" + OUT + "/" + relPath.split(path.sep).join("/"), width: img.w, height: img.h, bytes: fs.statSync(file).size };
}

export function buildAll() {
  ensureDirs();
  const written = [];
  const charset = {};

  for (const spec of CHARACTERS) {
    const sheet = writePng(path.join("characters", spec.id + ".png"), drawActorSheet(spec));
    const portrait = writePng(path.join("portraits", spec.id + ".png"), drawPortrait(spec));
    written.push(sheet, portrait);
    charset[spec.id] = {
      sheet: sheet.path,
      portrait: portrait.path,
      frameWidth: FRAME_W,
      frameHeight: FRAME_H,
      displayScale: DISPLAY_SCALE,
      anchorPx: ANCHOR,
      directions: { down: 0, left: 1, right: 2, up: 3 },
      idleColumn: 1,
      walkColumns: WALK_COLUMNS,
      displayName: spec.name,
      role: spec.role,
      traits: spec.traits,
      appearanceReference: spec.reference || null,
      skinTone: spec.skinTone,
    };
  }

  const tileset = writePng(path.join("tiles", "tileset.png"), buildTileset());
  const propSheet = writePng(path.join("props", "props.png"), buildProps());
  const glow = writePng(path.join("fx", "glow.png"), buildGlow(96));
  const shadow = writePng(path.join("fx", "shadow.png"), buildBlobShadow());
  written.push(tileset, propSheet, glow, shadow);

  const store = buildStoreMap();
  const battle = buildBattleRoomMap();
  if (!store.ok) throw new Error("store 地图校验失败: " + store.problems.join("; "));
  if (!battle.ok) throw new Error("battle-room 地图校验失败: " + battle.problems.join("; "));
  fs.writeFileSync(path.join(OUT, "maps", "store.json"), JSON.stringify(store.map, null, 1));
  fs.writeFileSync(path.join(OUT, "maps", "battle-room.json"), JSON.stringify(battle.map, null, 1));

  const manifest = {
    schemaVersion: 1,
    artVersion: ART_VERSION,
    generatedBy: "tools/frontend-art/build.mjs",
    tileSize: TILE,
    mapSize: { width: MAP_W, height: MAP_H, tileSize: TILE, pixelWidth: MAP_W * TILE, pixelHeight: MAP_H * TILE },
    navVersion: NAV_VERSION,
    palette: PALETTE,
    characters: charset,
    characterOrder: CHARACTERS.map((c) => c.id),
    tileset: {
      image: tileset.path,
      tileSize: TILE,
      frameSize: TILE * ART_SCALE,
      columns: 8,
      rows: Math.ceil(TILES.length / 8),
      tiles: TILES,
    },
    props: {
      image: propSheet.path,
      cellSize: PROP_CELL,
      artScale: ART_SCALE,
      columns: 4,
      rows: Math.ceil(PROPS.length / 4),
      list: PROPS.map((name, index) => ({
        prop: name,
        cell: index,
        x: (index % 4) * PROP_CELL,
        y: Math.floor(index / 4) * PROP_CELL,
        w: PROP_META[name].w * ART_SCALE,
        h: PROP_META[name].h * ART_SCALE,
        footY: PROP_META[name].footY,
        occludes: PROP_META[name].occludes,
      })),
    },
    fx: {
      lampGlow: glow.path,
      shadow: shadow.path,
    },
    maps: {
      store: "/" + OUT + "/maps/store.json",
      "battle-room": "/" + OUT + "/maps/battle-room.json",
    },
    ui: {
      fontStack: "\"Noto Sans SC\", \"Microsoft YaHei\", \"PingFang SC\", \"Hiragino Sans GB\", sans-serif",
      pixelDisplay: { sampling: "nearest", integerScaleOnly: false, allowedScales: [1, 1.5, 2, 2.5, 3] },
    },
  };
  fs.writeFileSync(path.join(OUT, "manifest.json"), JSON.stringify(manifest, null, 2));

  const total = written.reduce((sum, item) => sum + item.bytes, 0);
  return { written, totalBytes: total, manifest, maps: { store: store.map, battle: battle.map } };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const result = buildAll();
  console.log("素材已生成 →", OUT);
  for (const item of result.written) console.log("  ", item.path, item.width + "x" + item.height, item.bytes + "B");
  console.log("  地图: store / battle-room 已写入");
  console.log("  图片总量:", result.totalBytes + "B");
}
