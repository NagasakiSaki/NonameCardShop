// build.mjs — Rebuild the reviewed bright card-shop assets from editable drawing sources.
// Writes assets/frontend-bright-anime only; install.mjs validates and changes visual mappings separately.
//
// Usage: npm run art:bright

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Bitmap, ART_SCALE, mix } from './canvas.mjs';
import { encodePng, decodePng } from './png.mjs';
import { PAL, FOIL_ORDER } from './palette.mjs';
import { TILE_ORDER, buildTileset, drawTile } from './tiles.mjs';
import { PROP_ORDER, PROP_META, paintProp } from './props.mjs';
import { buildGlow, buildBlobShadow, buildSunShaft } from './fx.mjs';
import { buildPack, buildBox } from './products.mjs';
import { adaptCharacterSheet, listLpcCharacters } from './characters.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const PROJECT = path.resolve(HERE, '../..');
const OUT = path.join(PROJECT, 'assets/frontend-bright-anime');

export const PROP_CELL = 384; // 96 world px × ART_SCALE 4
export const PROP_COLUMNS = 8;

function ensure(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function writePng(rel, bmp) {
  const file = path.join(OUT, rel);
  ensure(path.dirname(file));
  fs.writeFileSync(file, encodePng(bmp.w, bmp.h, bmp.data));
  const stat = fs.statSync(file);
  return { path: rel, url: '/assets/frontend-bright-anime/' + rel.split(path.sep).join('/'), width: bmp.w, height: bmp.h, bytes: stat.size };
}

/** 把道具位图放进统一 384 单元格（原点左上，与正式协议一致）。 */
function intoCell(bmp) {
  const cell = new Bitmap(PROP_CELL, PROP_CELL);
  cell.blit(bmp, 0, 0);
  return cell;
}

// ------------------------------------------------------------ 主构建

function build() {
  ensure(OUT);
  const written = [];
  const t0 = Date.now();

  // ---- 地砖 ----
  const tiles = buildTileset(8);
  written.push(writePng(path.join('tiles', 'tileset.png'), tiles.sheet));

  // ---- 道具图集 ----
  const rows = Math.ceil(PROP_ORDER.length / PROP_COLUMNS);
  const sheet = new Bitmap(PROP_CELL * PROP_COLUMNS, PROP_CELL * rows);
  const propStats = [];
  for (const [index, name] of PROP_ORDER.entries()) {
    const bmp = paintProp(name);
    const cellX = (index % PROP_COLUMNS) * PROP_CELL;
    const cellY = Math.floor(index / PROP_COLUMNS) * PROP_CELL;
    sheet.blit(bmp, cellX / ART_SCALE, cellY / ART_SCALE);
    const bounds = bmp.bounds();
    propStats.push({
      name,
      meta: PROP_META[name],
      native: { w: bmp.w, h: bmp.h },
      usedNative: bounds,
      opaque: bmp.opaquePixels(),
      colors: bmp.colorCount(),
    });
    // 单品导出，供预览/对照/状态矩阵使用
    written.push(writePng(path.join('props', 'individual', name + '.png'), bmp));
  }
  written.push(writePng(path.join('props', 'props.png'), sheet));

  // ---- 灯光 / 投影 ----
  written.push(writePng(path.join('fx', 'glow.png'), buildGlow(256)));
  written.push(writePng(path.join('fx', 'shadow.png'), buildBlobShadow(128)));
  written.push(writePng(path.join('fx', 'sun-shaft.png'), buildSunShaft(256, 512)));

  // ---- 大尺寸包装主图（进货/货架每页一组）----
  const productList = [];
  for (const theme of FOIL_ORDER) {
    const pack = writePng(path.join('products', `pack-${theme}.png`), buildPack(theme));
    const box = writePng(path.join('products', `box-${theme}.png`), buildBox(theme));
    written.push(pack, box);
    productList.push({ theme, pack: pack.url, box: box.url, packSize: [pack.width, pack.height], boxSize: [box.width, box.height] });
  }

  // ---- 特殊人物模型风格适配（LPC 64×64，只读正式图集）----
  // Stable product IDs select art only; prices, contents and unlocks remain Host data.
  const productSource = JSON.parse(fs.readFileSync(path.join(PROJECT, 'assets/frontend-next/products/manifest.json'), 'utf8'));
  const themeById = {yijiang:'mint',refresh:'sky',shenhua:'lilac',standard:'butter',extra:'rose',sp:'coral',sp2:'sky',newjiang:'mint',mobile:'coral',tw:'slate',huicui:'lilac',sb:'rose',shiji:'butter',clan:'mint',bingshi:'slate',yingbian:'sky',offline:'butter',jsrg:'rose',sxrm:'lilac'};
  const products = Object.fromEntries(Object.entries(productSource.products).map(([id,item])=>{
    const theme=themeById[id]||'mint';return [id,{...item,artThemeId:theme,pack:`/assets/frontend-bright-anime/products/pack-${theme}.png`,box:`/assets/frontend-bright-anime/products/box-${theme}.png`}];
  }));
  fs.writeFileSync(path.join(OUT,'products/manifest.json'),JSON.stringify({artVersion:'bright-anime-1',products},null,2)+'\n');

  const officialManifest = JSON.parse(fs.readFileSync(path.join(PROJECT, 'assets/frontend/manifest.json'), 'utf8'));
  const lpcIds = listLpcCharacters(officialManifest);
  const characterList = [];
  for (const id of lpcIds) {
    const entry = officialManifest.characters[id];
    try {
      const graded = adaptCharacterSheet(PROJECT, entry.sourceSheet || entry.sheet, {
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
      });
      const written2 = writePng(path.join('characters', id + '.png'), graded);
      written.push(written2);
      characterList.push({
        id,
        displayName: entry.displayName,
        role: entry.role,
        band: entry.band ?? null,
        source: entry.sheet,
        sheet: written2.url,
        frameWidth: entry.frameWidth,
        frameHeight: entry.frameHeight,
        columns: entry.columns,
        displayScale: entry.displayScale,
        anchorPx: entry.anchorPx,
        directions: entry.directions,
        idleColumn: entry.idleColumn,
        walkColumns: entry.walkColumns,
        frameRate: entry.frameRate ?? 9,
        regrade: '对比1.24/饱和1.08 + 暗部暖棕/亮部奶油 + 左上方向光 + 右下压暗 + 1px暖褐外描边 + 脚下内阴影',
      });
    } catch (error) {
      console.warn('人物适配失败 ' + id + ': ' + error.message);
    }
  }
  fs.writeFileSync(
    path.join(OUT, 'manifest.characters.json'),
    JSON.stringify(
      {
        note: '特殊人物模型（LPC 64×64）在新画风下的适配结果。帧尺寸/锚点/动画列与正式 manifest 完全一致，合并只需替换 sheet URL。',
        count: characterList.length,
        characters: characterList,
      },
      null,
      2,
    ),
  );
  // 人物模型清单
  const charCsv = [
    ['原ID', '显示名', '角色', '乐队', '旧路径', '新路径', '帧宽', '帧高', '列数', '显示缩放', '锚点', '适配方式', '完成状态'].join(','),
    ...characterList.map((c) =>
      [
        c.id,
        c.displayName,
        c.role,
        c.band ?? '',
        c.source,
        c.sheet,
        c.frameWidth,
        c.frameHeight,
        c.columns,
        c.displayScale,
        (c.anchorPx || []).join('×'),
        c.regrade,
        'candidate-complete',
      ].join(','),
    ),
  ].join('\n');
  fs.writeFileSync(path.join(OUT, 'ASSET-INVENTORY-CHARACTERS.csv'), charCsv + '\n');
  console.log(`  人物模型适配 ${characterList.length} 个（LPC 64×64）`);

  // ---- 旧图裁片（只读正式素材，用于同尺寸对照）----
  let legacy = null;
  const legacyPath = path.join(PROJECT, 'assets/frontend/props/props.png');
  if (fs.existsSync(legacyPath)) {
    try {
      legacy = decodePng(fs.readFileSync(legacyPath));
    } catch (error) {
      console.warn('旧图集解码失败，跳过对照：' + error.message);
    }
  }

  // ---- manifest 片段 ----
  const manifestFragment = {
    note: '候选素材清单片段。合并方式：把 assets/frontend-bright-anime/** 复制到 assets/frontend-bright-anime/，再把下面的 props/tileset 覆盖到 assets/frontend/manifest.json 的对应字段。',
    artVersion: 'bright-anime-1',
    tileSize: 16,
    tileset: {
      image: '/assets/frontend-bright-anime/tiles/tileset.png',
      tileSize: 16,
      frameSize: 64,
      columns: 8,
      rows: Math.ceil(TILE_ORDER.length / 8),
      tiles: TILE_ORDER,
    },
    props: {
      image: '/assets/frontend-bright-anime/props/props.png',
      cellSize: PROP_CELL,
      artScale: 4,
      columns: PROP_COLUMNS,
      rows,
      list: PROP_ORDER.map((name, index) => {
        const m = PROP_META[name];
        return {
          prop: name,
          cell: index,
          x: (index % PROP_COLUMNS) * PROP_CELL,
          y: Math.floor(index / PROP_COLUMNS) * PROP_CELL,
          w: m.w * ART_SCALE,
          h: m.h * ART_SCALE,
          footY: m.footY,
          occludes: m.occludes,
          // 以下为候选附加字段，正式 manifest 可忽略；主模型按需保留
          worldW: m.w,
          worldH: m.h,
          blocks: m.blocks,
          stand: m.stand ?? null,
          depth: m.depth ?? 'y',
          family: m.family ?? null,
          state: m.state ?? null,
          level: m.level ?? null,
          label: m.label ?? null,
        };
      }),
    },
    products: productList,
    characters: characterList.map((c) => ({ id: c.id, displayName: c.displayName, sheet: c.sheet })),
    palette: PAL,
    fx: {
      lampGlow: '/assets/frontend-bright-anime/fx/glow.png',
      shadow: '/assets/frontend-bright-anime/fx/shadow.png',
      sunShaft: '/assets/frontend-bright-anime/fx/sun-shaft.png',
    },
  };
  const fragFile = path.join(OUT, 'manifest.props.json');
  fs.writeFileSync(fragFile, JSON.stringify(manifestFragment, null, 2));

  // ---- ASSET-INVENTORY.csv ----
  const csv = [];
  csv.push(
    [
      '原ID',
      '功能/状态',
      '旧路径',
      '新路径',
      '原生宽',
      '原生高',
      '逻辑宽',
      '逻辑高',
      '锚点footY',
      '图集页',
      '帧索引',
      '重绘方式',
      '来源/授权',
      '预览位置',
      '完成状态',
      '不透明像素',
      '色数',
      '有效内容区(原生px)',
    ].join(','),
  );
  PROP_ORDER.forEach((name, index) => {
    const m = PROP_META[name];
    const st = propStats[index];
    csv.push(
      [
        name,
        m.label ?? name,
        '/assets/frontend/props/props.png#cell' + index + ' (192×192, artScale2)',
        '/assets/frontend-bright-anime/props/props.png#cell' + index + ' (384×384, artScale4)',
        st.native.w,
        st.native.h,
        m.w,
        m.h,
        m.footY,
        'props.png',
        index,
        '程序化重绘（4× 原生密度，分层结构：台面/立面/踢脚/玻璃/陈列）',
        '本项目自绘脚本 tools/frontend-art-bright/props.mjs，无第三方素材',
        'preview/#sheet',
        'candidate-complete',
        st.opaque,
        st.colors,
        `${st.usedNative.w}×${st.usedNative.h}`,
      ].join(','),
    );
  });
  fs.writeFileSync(path.join(OUT, 'ASSET-INVENTORY.csv'), csv.join('\n') + '\n');
  // 同步一份到交付根目录，方便主模型直接读
  fs.writeFileSync(
    path.join(OUT, 'ASSET-INVENTORY.csv'),
    csv.join('\n') + '\n',
  );

  // ---- 统计 ----
  const totalBytes = written.reduce((s, x) => s + x.bytes, 0);
  const atlasBytes = written.find((w) => w.path.endsWith(path.join('props', 'props.png'))).bytes;
  const stats = {
    artScale: ART_SCALE,
    propCell: PROP_CELL,
    propCount: PROP_ORDER.length,
    atlas: { width: sheet.w, height: sheet.h, bytes: atlasBytes, decodedMB: +((sheet.w * sheet.h * 4) / 1048576).toFixed(1) },
    tileset: { width: tiles.sheet.w, height: tiles.sheet.h, bytes: written[0].bytes },
    totalBytes,
    totalMB: +(totalBytes / 1048576).toFixed(2),
    elapsedMs: Date.now() - t0,
    legacyLoaded: Boolean(legacy),
    perProp: propStats.map((s) => ({ name: s.name, native: `${s.native.w}×${s.native.h}`, opaque: s.opaque, colors: s.colors })),
  };
  fs.writeFileSync(path.join(OUT, 'build-stats.json'), JSON.stringify(stats, null, 2));

  return { written, stats, manifestFragment };
}

const result = build();
console.log('明亮二次元卡店素材已生成 →', OUT);
console.log(
  `  道具图集 ${result.stats.atlas.width}×${result.stats.atlas.height}，${result.stats.propCount} 项，${(result.stats.atlas.bytes / 1024).toFixed(0)}KB（解码约 ${result.stats.atlas.decodedMB}MB）`,
);
console.log(`  地砖图集 ${result.stats.tileset.width}×${result.stats.tileset.height}，${(result.stats.tileset.bytes / 1024).toFixed(0)}KB`);
console.log(`  文件 ${result.written.length} 个，合计 ${result.stats.totalMB}MB，用时 ${result.stats.elapsedMs}ms`);
