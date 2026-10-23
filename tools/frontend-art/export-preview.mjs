// tools/frontend-art/export-preview.mjs — 导出人工目检用的美术对照图（不是运行时素材）。
import fs from "node:fs";
import path from "node:path";
import { Img } from "./pixkit.mjs";
import { CHARACTERS, drawActorSheet, drawPortrait, FRAME_W, FRAME_H } from "./characters.mjs";
import { buildTileset, buildProps } from "./props.mjs";
import { buildStoreMap, buildBattleRoomMap, composePreview, MAP_W, MAP_H, TILE } from "./maps.mjs";
import { encodePng } from "./png.mjs";

const OUT = path.join("docs", "frontend-handoff", "screenshots");
fs.mkdirSync(OUT, { recursive: true });

function checker(w, h, size = 8) {
  const img = new Img(w, h);
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      const on = ((x / size) | 0) % 2 === ((y / size) | 0) % 2;
      img.px(x, y, on ? "#c9c9ce" : "#e6e6ea");
    }
  }
  return img;
}

function write(name, img) {
  const file = path.join(OUT, name);
  fs.writeFileSync(file, encodePng(img.w, img.h, img.data));
  console.log("导出", file, img.w + "x" + img.h);
}

// 全部角色四向行走图集（2×）
const scale = 2;
const sheetW = FRAME_W * 3 * scale;
const sheetH = FRAME_H * 4 * scale;
const all = checker(sheetW * CHARACTERS.length, sheetH);
CHARACTERS.forEach((spec, index) => all.blit(drawActorSheet(spec).scale(scale), index * sheetW, 0));
write("art-characters.png", all);

// 店长 12 帧（4×，带落脚基线）
const ownerBig = checker(FRAME_W * 3 * 4 + 40, FRAME_H * 4 * 4 + 40, 16);
ownerBig.blit(drawActorSheet(CHARACTERS[0]).scale(4), 20, 20);
for (let row = 0; row < 4; row += 1) {
  ownerBig.hline(20, 20 + FRAME_W * 3 * 4 - 1, 20 + row * FRAME_H * 4 + 30 * 4, "#d0326e");
}
write("art-animation-owner.png", ownerBig);

// 立绘（2×）
const portraitSheet = checker(96 * 2 * CHARACTERS.length, 96 * 2);
CHARACTERS.forEach((spec, index) => portraitSheet.blit(drawPortrait(spec).scale(2), index * 192, 0));
write("art-portraits.png", portraitSheet);

// 瓦片集与道具图集
write("art-tileset.png", buildTileset().scale(4));
write("art-props.png", buildProps().scale(2));

// 两张地图的静态合成（人工核对布局用）
const tileset = buildTileset();
const propSheet = buildProps();
const both = new Img(MAP_W * TILE, MAP_H * TILE * 2 + 8);
both.blit(composePreview(buildStoreMap().map, tileset, propSheet), 0, 0);
both.blit(composePreview(buildBattleRoomMap().map, tileset, propSheet), 0, MAP_H * TILE + 8);
write("art-maps.png", both.scale(2));
