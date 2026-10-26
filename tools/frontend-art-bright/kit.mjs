// kit.mjs — 家具/道具的领域绘制原语。
// 所有函数都吃「世界坐标」，内部由 canvas.mjs 换算到 4× 原生栅格。
// 光向约定：主光来自左上，因此顶面最亮、正面居中、右侧与下沿最暗。

import { ART_SCALE, Bitmap, mix, lighten, darken, alpha, hash, rgba } from './canvas.mjs';
import { PAL, FOIL, LEVEL } from './palette.mjs';

export { ART_SCALE, Bitmap, mix, lighten, darken, alpha, hash };

// ---------------------------------------------------------------- 投影

/**
 * 家具接触阴影：径向 alpha 衰减 + 贴近底边的压实带。
 * 4× 原生密度下用平滑衰减，不用抖动，避免下采样后出现可见棋盘纹理。
 */
export function contactShadow(bmp, cx, cy, rx, ry, strength = 0.9) {
  bmp.softEllipse(cx, cy + ry * 0.18, rx, ry, alpha('#6a4526', 1), 0.42 * strength, 1.7);
  bmp.softEllipse(cx, cy - ry * 0.1, rx * 0.8, ry * 0.6, alpha('#5a381c', 1), 0.34 * strength, 2.2);
}

/** 靠墙物体的窄投影（墙面装饰、海报、吊灯用）。 */
export function wallShadow(bmp, x, y, w, h) {
  for (let i = 0; i < 8; i += 1) {
    const k = i / 8;
    bmp.blendRect(x + w * 0.06, y + h * 0.55 + k * h * 0.06, w * 0.88, h * 0.06, alpha('#8a6440', 1), 0.14 * (1 - k));
  }
}

// ---------------------------------------------------------------- 面

/**
 * 立体面：先铺色，再压暗下沿、提亮上沿。
 * 明暗交界处补一条 4×4 Bayer 抖动带 —— 这是像素经营游戏最关键的"手工感"：
 * 硬边纯色块会读成矢量插画，抖动带才会读成像素画。
 */
export function face(bmp, x, y, w, h, color, opts = {}) {
  const topK = opts.top ?? 0.32;
  const bottomK = opts.bottom ?? 0.36;
  const radius = opts.radius ?? 0;
  if (radius > 0) bmp.roundRect(x, y, w, h, radius, color);
  else bmp.rect(x, y, w, h, color);

  const dither = Math.min(1.1, Math.max(0.5, h * 0.14));

  // 顶部受光带（硬边）+ 下缘抖动过渡
  const bandH = Math.min(h * 0.24, opts.bandH ?? 0.8);
  if (bandH > 0) {
    const lit = lighten(color, 0.5);
    bmp.blendRect(x, y, w, bandH, lit, topK);
    bmp.ditherMask(x, y + bandH, w, dither, alpha(lit, topK * 0.62), 0.55);
    bmp.ditherMask(x, y + bandH + dither, w, dither * 0.7, alpha(lit, topK * 0.34), 0.3);
  }
  // 底部背光带（硬边）+ 上缘抖动过渡
  const lowH = Math.min(h * 0.34, opts.lowH ?? 1.2);
  if (lowH > 0) {
    const dark = darken(color, 0.5);
    bmp.ditherMask(x, y + h - lowH - dither, w, dither, alpha(dark, bottomK * 0.6), 0.55);
    bmp.ditherMask(x, y + h - lowH - dither * 1.7, w, dither * 0.7, alpha(dark, bottomK * 0.32), 0.3);
    bmp.blendRect(x, y + h - lowH, w, lowH, dark, bottomK);
    bmp.blendRect(x, y + h - 0.25, w, 0.25, darken(color, 0.72), 0.9);
  }
  // 右侧略暗，制造体积（同样带抖动过渡）
  if (opts.side !== false) {
    const sw = Math.min(1, w * 0.07);
    bmp.ditherMask(x + w - sw - sw * 0.8, y, sw * 0.8, h, alpha(darken(color, 0.45), 1), 0.4);
    bmp.blendRect(x + w - sw, y, sw, h, darken(color, 0.45), 0.42);
  }
  return bmp;
}

/**
 * 表面颗粒：稀疏的 1 原生像素亮/暗点，用来打散大面积平色。
 * 只在已有像素上画，不会越出家具轮廓。
 */
export function speckle(bmp, x, y, w, h, color, density = 0.12, seed = 1) {
  const x0 = bmp.sx(x);
  const y0 = bmp.sx(y);
  const x1 = bmp.sx(x + w);
  const y1 = bmp.sx(y + h);
  const c = rgba(color);
  for (let yy = y0; yy < y1; yy += 1) {
    for (let xx = x0; xx < x1; xx += 1) {
      if (bmp.alphaAtRaw(xx, yy) < 200) continue;
      if (hash(xx, yy, seed) > density) continue;
      bmp.blendRaw(xx, yy, c, c[3] / 255);
    }
  }
  return bmp;
}

/** 硬边高光条（1 原生像素级），cel 风格的主要提亮手段。 */
export function highlight(bmp, x, y, w, h = 0.25, color = PAL.woodHighlight, k = 0.85) {
  bmp.blendRect(x, y, w, h, color, k);
  return bmp;
}

/** 硬边暗线，用来分隔同色部件。 */
export function edgeLine(bmp, x, y, w, h, color = PAL.inkLine, k = 0.55) {
  bmp.blendRect(x, y, w, h, color, k);
  return bmp;
}

/** 内凹槽：上沿暗、下沿亮，用于柜门、抽屉、面板。 */
export function inset(bmp, x, y, w, h, color, opts = {}) {
  bmp.rect(x, y, w, h, color);
  // 凹槽的暗上沿与亮下沿（cel）
  bmp.blendRect(x, y, w, 0.3, darken(color, 0.55), 0.85);
  bmp.blendRect(x, y + h - 0.3, w, 0.3, lighten(color, 0.55), 0.7);
  bmp.blendRect(x, y, 0.3, h, darken(color, 0.4), 0.7);
  bmp.blendRect(x + w - 0.3, y, 0.3, h, lighten(color, 0.3), 0.5);
  if (opts.handle !== false) {
    const hx = x + w - (opts.handleInset ?? 2);
    bmp.roundRect(hx, y + h / 2 - 0.9, 0.9, 1.8, 0.3, PAL.metalMid);
    bmp.rect(hx, y + h / 2 - 0.9, 0.35, 1.8, PAL.metalLight);
    bmp.rect(hx, y + h / 2 + 0.7, 0.9, 0.2, PAL.metalDeep);
  }
  return bmp;
}

/** 木纹：沿长边走向的细线 + 偶发节疤，密度按面积自适应。 */
export function woodGrain(bmp, x, y, w, h, color, opts = {}) {
  const horizontal = (opts.axis ?? (w >= h ? 'x' : 'y')) === 'x';
  const density = opts.density ?? 0.55;
  const len = horizontal ? w : h;
  const span = horizontal ? h : w;
  const step = opts.step ?? 1.4;
  let line = 0;
  for (let d = 0.5; d < span - 0.25; d += step) {
    line += 1;
    if (hash(line, Math.round(d * 10), opts.seed ?? 3) > density) continue;
    const offset = hash(line, 7, (opts.seed ?? 3) + 1) * (len * 0.3);
    const runLen = len * (0.3 + hash(line, 11, (opts.seed ?? 3) + 2) * 0.6);
    const dark = hash(line, 13, 5) > 0.5;
    const c = dark ? mix(color, PAL.woodDeep, 0.55) : mix(color, PAL.woodHighlight, 0.6);
    const k = dark ? 0.62 : 0.42;
    const run = Math.min(runLen, horizontal ? x + w - (x + offset) : y + h - (y + offset));
    if (horizontal) {
      bmp.blendRect(x + offset, y + d, run, 0.25, c, k);
      // 抖动碎线：木纹两侧的浅色颗粒，打破平直感
      bmp.ditherMask(x + offset, y + d + 0.25, run, 0.5, alpha(c, k * 0.5), 0.4);
    } else {
      bmp.blendRect(x + d, y + offset, 0.25, run, c, k);
      bmp.ditherMask(x + d + 0.25, y + offset, 0.5, run, alpha(c, k * 0.5), 0.4);
    }
    // 跨边界补一段，保证纹理连贯
    if (offset + runLen > len) {
      if (horizontal) bmp.blendRect(x, y + d, offset + runLen - len, 0.25, c, k);
      else bmp.blendRect(x + d, y, 0.25, offset + runLen - len, c, k);
    }
  }
  // 节疤
  const knots = opts.knots ?? 1;
  for (let i = 0; i < knots; i += 1) {
    const kx = x + 2 + hash(i, 31, (opts.seed ?? 3) + 6) * (w - 4);
    const ky = y + 2 + hash(i, 37, (opts.seed ?? 3) + 7) * (h - 4);
    bmp.blendEllipse(kx, ky, 0.7, 0.45, mix(color, PAL.woodDeep, 0.6), 0.75);
    bmp.blendEllipse(kx, ky, 0.35, 0.22, mix(color, PAL.woodDeep, 0.8), 0.8);
  }
  return bmp;
}

/** 浅原木台面：木纹 + 板缝 + 边缘高光 + 前唇阴影。 */
export function woodTop(bmp, x, y, w, h, color = PAL.woodLight, opts = {}) {
  face(bmp, x, y, w, h, color, { top: 0.32, bottom: 0.24, bandH: 0.55, lowH: 0.7 });
  woodGrain(bmp, x, y, w, h, color, { seed: opts.seed ?? 5, density: opts.density ?? 0.6, step: 1.6 });
  // 板缝：每 12 world px 一条，带亮边
  const plank = opts.plank ?? 12;
  for (let px = x + plank; px < x + w - 1; px += plank) {
    bmp.blendRect(px, y + 0.2, 0.25, h - 0.4, PAL.woodDeep, 0.5);
    bmp.blendRect(px + 0.25, y + 0.2, 0.25, h - 0.4, PAL.woodHighlight, 0.32);
  }
  // 台面前沿硬高光
  bmp.blendRect(x, y, w, 0.25, PAL.woodHighlight, 0.85);
  // 台面颗粒：让大面积浅色不显得"塑料"
  speckle(bmp, x, y + 0.4, w, h - 0.8, alpha(PAL.woodDeep, 0.34), 0.028, 91);
  speckle(bmp, x, y + 0.4, w, h - 0.8, alpha(PAL.woodHighlight, 0.45), 0.018, 92);
  return bmp;
}

/** 玻璃：底色 + 斜向高光带 + 上沿亮线，高光不遮挡内部物件（透明度低）。 */
export function glass(bmp, x, y, w, h, opts = {}) {
  bmp.blendRect(x, y, w, h, alpha(PAL.glassMid, 0.42));
  // 斜向高光两条
  const band = opts.band ?? 0.28;
  for (let i = 0; i < 2; i += 1) {
    const ox = x + w * (0.16 + i * 0.42);
    bmp.blendPolygon(
      [
        [ox, y],
        [ox + w * band, y],
        [ox + w * band - h * 0.45, y + h],
        [ox - h * 0.45, y + h],
      ],
      alpha(PAL.glassSheen, 0.3),
      0.55,
    );
  }
  bmp.blendRect(x, y, w, 0.25, alpha(PAL.glassSheen, 0.75), 0.9);
  bmp.blendRect(x, y + h - 0.25, w, 0.25, alpha(PAL.glassDeep, 0.6), 0.7);
  return bmp;
}

/** 金属件（铰链、支架、边框）。 */
export function metal(bmp, x, y, w, h, opts = {}) {
  const c = opts.color ?? PAL.metal;
  bmp.rect(x, y, w, h, c);
  bmp.blendRect(x, y, w, 0.25, PAL.metalLight, 0.9);
  bmp.blendRect(x, y + h - 0.25, w, 0.25, PAL.metalDeep, 0.8);
  if (opts.shine) bmp.blendRect(x + 0.5, y + 0.5, w * 0.3, h - 1, PAL.metalLight, 0.35);
  return bmp;
}

/** 黄铜/鎏金小件。 */
export function brass(bmp, x, y, w, h, opts = {}) {
  bmp.rect(x, y, w, h, PAL.goldDeep);
  bmp.blendRect(x, y, w, Math.max(0.25, h * 0.3), PAL.goldLight, 0.85);
  bmp.blendRect(x, y + h - 0.25, w, 0.25, darken(PAL.goldDeep, 0.35), 0.8);
  if (opts.dot) bmp.px(x + w / 2, y + h / 2, PAL.goldLight);
  return bmp;
}

// ---------------------------------------------------------------- 商品

/**
 * 密封补充包：竖立薄包装。
 * 结构（自上而下）：压封齿边 → 主题色箔面 → 插画窗 → 品牌条 → 星标 → 压封齿边。
 * 插画窗用主题深色 + 亮色剪影，不再用奶油白，避免整排货架读成"白色书脊"。
 */
export function foilPack(bmp, x, y, w, h, themeName = 'rose', opts = {}) {
  const t = FOIL[themeName] ?? FOIL.rose;
  const r = Math.max(0.3, Math.min(w, h) * 0.08);
  const crimpH = Math.max(0.5, h * 0.06);
  // 主体
  bmp.roundRect(x, y, w, h, r, t.base);
  // 左受光 / 右背光（硬边）
  bmp.blendRect(x, y, Math.max(0.4, w * 0.24), h, lighten(t.base, 0.42), 0.6);
  bmp.blendRect(x + w - Math.max(0.4, w * 0.26), y, Math.max(0.4, w * 0.26), h, darken(t.mid, 0.2), 0.55);
  // 上下压封边
  bmp.rect(x + 0.15, y + 0.15, w - 0.3, crimpH, t.deep);
  bmp.rect(x + 0.15, y + h - crimpH - 0.15, w - 0.3, crimpH, t.deep);
  bmp.blendRect(x + 0.15, y + 0.15, w - 0.3, 0.25, darken(t.deep, 0.4), 0.8);
  // 封口齿（细密竖纹）
  const teeth = Math.max(3, Math.round(w / 0.9));
  for (let i = 0; i < teeth; i += 1) {
    const tx = x + 0.4 + (i * (w - 0.8)) / teeth;
    bmp.blendRect(tx, y + 0.4, 0.25, crimpH - 0.5, darken(t.deep, 0.3), 0.7);
    bmp.blendRect(tx, y + h - crimpH + 0.15, 0.25, crimpH - 0.5, lighten(t.deep, 0.3), 0.5);
  }
  // 插画窗
  const ax = x + w * 0.12;
  const ay = y + crimpH + h * 0.09;
  const aw = w * 0.76;
  const ah = h * 0.38;
  bmp.rect(ax, ay, aw, ah, PAL.cream);
  bmp.rect(ax + 0.25, ay + 0.25, aw - 0.5, ah - 0.5, darken(t.deep, 0.18));
  // 插画：上亮下暗 + 中央角色剪影
  bmp.blendRect(ax + 0.4, ay + 0.4, aw - 0.8, ah * 0.42, lighten(t.base, 0.3), 0.9);
  bmp.blendRect(ax + 0.4, ay + ah * 0.44, aw - 0.8, ah * 0.5, darken(t.deep, 0.35), 0.8);
  const fcx = ax + aw / 2;
  bmp.ellipse(fcx, ay + ah * 0.34, aw * 0.19, ah * 0.2, PAL.cream);
  bmp.ellipse(fcx, ay + ah * 0.3, aw * 0.13, ah * 0.14, darken(t.deep, 0.5));
  bmp.polygon(
    [
      [fcx - aw * 0.28, ay + ah * 0.92],
      [fcx + aw * 0.28, ay + ah * 0.92],
      [fcx + aw * 0.16, ay + ah * 0.52],
      [fcx - aw * 0.16, ay + ah * 0.52],
    ],
    PAL.cream,
  );
  // 品牌条
  const by = ay + ah + h * 0.05;
  const bh = Math.max(0.7, h * 0.07);
  bmp.rect(x + w * 0.08, by, w * 0.84, bh, t.band);
  bmp.blendRect(x + w * 0.14, by + bh * 0.28, w * 0.42, bh * 0.32, darken(t.deep, 0.15), 0.8);
  // 星标 + 稀有度角点
  const sy = by + bh + h * 0.045;
  bmp.rect(x + w * 0.42, sy, w * 0.16, w * 0.16, PAL.gold);
  bmp.blendRect(x + w * 0.42, sy, w * 0.08, w * 0.08, PAL.goldLight, 0.95);
  // 外轮廓（细硬边，保证在浅底货架上仍有边界）
  bmp.blendRect(x, y, w, 0.25, darken(t.deep, 0.35), 0.6);
  bmp.blendRect(x, y, 0.25, h, darken(t.deep, 0.35), 0.55);
  bmp.blendRect(x + w - 0.25, y, 0.25, h, darken(t.deep, 0.5), 0.65);
  bmp.blendRect(x, y + h - 0.25, w, 0.25, darken(t.deep, 0.55), 0.7);
  return bmp;
}

/**
 * 密封整盒：横卧大盒。
 * 结构：盒顶盖（受光）→ 正面印刷面 → 侧立面 → 封条 → 画窗 + 文字条。
 */
export function cardBox(bmp, x, y, w, h, themeName = 'sky', opts = {}) {
  const t = FOIL[themeName] ?? FOIL.sky;
  const lidH = h * (opts.lidH ?? 0.3);
  // 盒体
  bmp.rect(x, y, w, h, t.mid);
  // 顶盖
  bmp.rect(x, y, w, lidH, t.base);
  bmp.blendRect(x, y, w, Math.max(0.4, lidH * 0.34), lighten(t.base, 0.45), 0.9);
  bmp.blendRect(x, y + lidH - 0.3, w, 0.3, darken(t.deep, 0.25), 0.7);
  // 右侧立面
  bmp.blendRect(x + w - Math.max(0.5, w * 0.1), y, Math.max(0.5, w * 0.1), h, darken(t.mid, 0.3), 0.6);
  // 正面
  const fy = y + lidH;
  const fh = h - lidH;
  bmp.rect(x + w * 0.03, fy, w * 0.9, fh - h * 0.07, t.deep);
  bmp.blendRect(x + w * 0.03, fy, w * 0.9, Math.max(0.4, fh * 0.2), lighten(t.deep, 0.32), 0.6);
  // 正面画窗
  const ax = x + w * 0.1;
  const ay = fy + fh * 0.2;
  const aw = w * 0.4;
  const ah = fh * 0.46;
  bmp.rect(ax, ay, aw, ah, PAL.cream);
  bmp.rect(ax + 0.25, ay + 0.25, aw - 0.5, ah - 0.5, darken(t.base, 0.1));
  bmp.blendRect(ax + 0.4, ay + 0.4, aw - 0.8, ah * 0.45, lighten(t.base, 0.35), 0.9);
  bmp.ellipse(ax + aw / 2, ay + ah * 0.42, aw * 0.16, ah * 0.24, darken(t.deep, 0.4));
  bmp.ellipse(ax + aw / 2, ay + ah * 0.3, aw * 0.1, ah * 0.14, PAL.cream);
  // 正面文字条
  bmp.blendRect(x + w * 0.55, fy + fh * 0.24, w * 0.32, Math.max(0.5, fh * 0.1), PAL.cream, 0.92);
  bmp.blendRect(x + w * 0.55, fy + fh * 0.42, w * 0.26, Math.max(0.4, fh * 0.07), PAL.cream, 0.78);
  bmp.blendRect(x + w * 0.55, fy + fh * 0.56, w * 0.3, Math.max(0.35, fh * 0.06), PAL.cream, 0.62);
  // 封条
  bmp.blendRect(x + w * 0.455, y, w * 0.07, h, alpha(PAL.cream, 0.9), 0.95);
  bmp.blendRect(x + w * 0.455, y, 0.25, h, alpha(PAL.goldLight, 0.8), 0.9);
  // 外框硬边
  bmp.blendRect(x, y, w, 0.25, darken(t.deep, 0.4), 0.65);
  bmp.blendRect(x, y, 0.25, h, darken(t.deep, 0.4), 0.6);
  bmp.blendRect(x + w - 0.25, y, 0.25, h, darken(t.deep, 0.55), 0.7);
  bmp.blendRect(x, y + h - 0.25, w, 0.25, darken(t.deep, 0.6), 0.75);
  return bmp;
}

/** 单张卡牌（正面朝上）：白框 + 画窗 + 名牌条 + 角标。 */
export function singleCard(bmp, x, y, w, h, color = PAL.clothRose, opts = {}) {
  bmp.roundRect(x, y, w, h, 0.25, PAL.cream);
  bmp.rect(x + 0.25, y + 0.25, w - 0.5, h - 0.5, PAL.foil);
  // 画窗
  const ax = x + w * 0.1;
  const ay = y + h * 0.08;
  const aw = w * 0.8;
  const ah = h * 0.52;
  bmp.rect(ax, ay, aw, ah, darken(color, 0.18));
  bmp.rect(ax + 0.2, ay + 0.2, aw - 0.4, ah * 0.45, lighten(color, 0.32));
  bmp.rect(ax + aw * 0.3, ay + ah * 0.42, aw * 0.4, ah * 0.5, lighten(color, 0.15));
  // 名牌
  bmp.rect(x + w * 0.1, y + h * 0.64, w * 0.8, h * 0.12, PAL.paperShade);
  bmp.blendRect(x + w * 0.14, y + h * 0.68, w * 0.4, 0.25, PAL.inkLight, 0.6);
  // 技能条
  bmp.rect(x + w * 0.1, y + h * 0.79, w * 0.8, h * 0.14, mix(PAL.cream, PAL.paperShade, 0.5));
  bmp.blendRect(x + w * 0.14, y + h * 0.83, w * 0.6, 0.2, PAL.inkLight, 0.45);
  // 稀有度角标
  if (opts.rarity) {
    bmp.rect(x + w * 0.78, y + h * 0.05, w * 0.16, w * 0.16, opts.rarity);
  }
  return bmp;
}

/** 立式卡砖/亚克力卡夹。 */
export function slab(bmp, x, y, w, h, color) {
  bmp.roundRect(x, y, w, h, 0.4, PAL.glassMid);
  bmp.roundRect(x + 0.3, y + 0.3, w - 0.6, h - 0.6, 0.3, PAL.glassSheen);
  bmp.roundRect(x + 0.7, y + 0.7, w - 1.4, h - 1.4, 0.25, color);
  bmp.blendRect(x + 0.5, y + 0.5, w * 0.3, h - 1, PAL.glassSheen, 0.5);
  return bmp;
}

/** 纸箱（进货到货用）。 */
export function carton(bmp, x, y, w, h, opts = {}) {
  const base = opts.color ?? '#e6c49a';
  const lidH = h * 0.26;
  bmp.rect(x, y + lidH, w, h - lidH, base);
  bmp.rect(x, y, w, lidH, lighten(base, 0.18));
  // 顶盖折痕
  bmp.blendRect(x + w * 0.47, y, w * 0.06, lidH, darken(base, 0.3), 0.55);
  // 正面胶带
  bmp.blendRect(x + w * 0.44, y + lidH, w * 0.12, h - lidH, alpha(PAL.cream, 0.75), 0.8);
  // 标签
  bmp.rect(x + w * 0.12, y + h * 0.48, w * 0.4, h * 0.26, PAL.paper);
  bmp.blendRect(x + w * 0.16, y + h * 0.54, w * 0.28, 0.25, PAL.inkLight, 0.5);
  bmp.blendRect(x + w * 0.16, y + h * 0.62, w * 0.2, 0.25, PAL.inkLight, 0.4);
  // 边缘
  bmp.blendRect(x, y + h - 0.25, w, 0.25, darken(base, 0.4), 0.6);
  bmp.blendRect(x + w - 0.25, y, 0.25, h, darken(base, 0.28), 0.5);
  if (opts.open) {
    // 开箱折耳
    bmp.polygon(
      [
        [x + w * 0.05, y],
        [x + w * 0.28, y - h * 0.22],
        [x + w * 0.42, y - h * 0.1],
        [x + w * 0.2, y + lidH * 0.4],
      ],
      lighten(base, 0.3),
    );
  }
  return bmp;
}

/** 剪刀（拆包台工具）。 */
export function scissors(bmp, x, y, s = 1) {
  bmp.line(x, y, x + 3.2 * s, y + 1.6 * s, PAL.metalMid, 0.3);
  bmp.line(x, y + 1.6 * s, x + 3.2 * s, y, PAL.metalMid, 0.3);
  bmp.ellipse(x - 0.5 * s, y - 0.2 * s, 0.7 * s, 0.6 * s, PAL.clothSlate);
  bmp.ellipse(x - 0.5 * s, y + 1.8 * s, 0.7 * s, 0.6 * s, PAL.clothSlate);
  bmp.blendRect(x + 3.1 * s, y + 0.6 * s, 0.35 * s, 0.4 * s, PAL.metalLight, 0.9);
  return bmp;
}

/** 牌组盒（牌桌上）。 */
export function deckBox(bmp, x, y, w, h, color = PAL.clothSky) {
  bmp.roundRect(x, y, w, h, 0.3, color);
  bmp.blendRect(x, y, w, h * 0.28, lighten(color, 0.4), 0.7);
  bmp.blendRect(x + w * 0.15, y + h * 0.42, w * 0.7, h * 0.18, PAL.cream, 0.85);
  bmp.blendRect(x, y + h - 0.25, w, 0.25, darken(color, 0.45), 0.6);
  return bmp;
}

/** 小堆卡组（侧面朝上）。 */
export function cardStack(bmp, x, y, w, h, n = 4, color = PAL.cream) {
  for (let i = 0; i < n; i += 1) {
    bmp.rect(x + i * 0.12, y - i * 0.18, w, h, i % 2 ? color : darken(color, 0.06));
    bmp.blendRect(x + i * 0.12, y - i * 0.18, w, 0.2, lighten(color, 0.5), 0.6);
  }
  return bmp;
}

// ---------------------------------------------------------------- 装饰

/** 盆栽：陶盆 + 叶片簇。leafy 越大越茂盛。 */
export function potPlant(bmp, cx, baseY, scale = 1, opts = {}) {
  const potW = 13 * scale;
  const potH = 10 * scale;
  const px = cx - potW / 2;
  const py = baseY - potH;
  // 叶片
  const clusters = opts.clusters ?? 5;
  for (let i = 0; i < clusters; i += 1) {
    const t = i / Math.max(1, clusters - 1);
    const lx = cx + (t - 0.5) * potW * 1.5;
    const ly = py - 5 * scale - Math.sin(t * Math.PI) * 7 * scale;
    const rr = (4.2 - Math.abs(t - 0.5) * 2.6) * scale;
    bmp.ellipse(lx, ly, rr, rr * 0.82, PAL.leafDeep);
    bmp.ellipse(lx - rr * 0.2, ly - rr * 0.22, rr * 0.74, rr * 0.6, PAL.leaf);
    bmp.ellipse(lx - rr * 0.34, ly - rr * 0.38, rr * 0.38, rr * 0.28, PAL.leafLight);
  }
  // 叶柄
  bmp.blendRect(cx - 0.25, py - 6 * scale, 0.5, 6 * scale, PAL.leafDeep, 0.8);
  // 陶盆
  bmp.polygon(
    [
      [px, py],
      [px + potW, py],
      [px + potW - 1.6 * scale, baseY],
      [px + 1.6 * scale, baseY],
    ],
    opts.pot ?? '#e9c3a4',
  );
  bmp.rect(px, py, potW, 2 * scale, opts.rim ?? '#f4d8bc');
  bmp.blendRect(px, py, potW, 0.4 * scale, PAL.cream, 0.6);
  bmp.blendRect(px + potW - 1.2 * scale, py, 1.2 * scale, potH, darken(opts.pot ?? '#e9c3a4', 0.22), 0.7);
  bmp.blendRect(px + 1 * scale, py + 3 * scale, potW - 3 * scale, 0.3 * scale, darken(opts.pot ?? '#e9c3a4', 0.18), 0.5);
  return bmp;
}

/** 圆形地毯：同心环 + 放射纹 + 边缘绒毛。 */
export function roundRug(bmp, cx, cy, rx, ry, opts = {}) {
  const rings = [
    [1.0, opts.outer ?? PAL.clothMintDeep],
    [0.93, opts.mid ?? PAL.clothMint],
    [0.8, opts.inner ?? PAL.clothMintDeep],
    [0.62, opts.center ?? PAL.clothMint],
  ];
  for (const [k, c] of rings) bmp.ellipse(cx, cy, rx * k, ry * k, c);
  // 放射纹
  for (let a = 0; a < 28; a += 1) {
    const t = (a / 28) * Math.PI * 2;
    const x1 = cx + Math.cos(t) * rx * 0.84;
    const y1 = cy + Math.sin(t) * ry * 0.84;
    const x2 = cx + Math.cos(t) * rx * 0.95;
    const y2 = cy + Math.sin(t) * ry * 0.95;
    bmp.line(x1, y1, x2, y2, lighten(opts.mid ?? PAL.clothMint, 0.3), 0.25);
  }
  // 内圈花纹
  for (let a = 0; a < 12; a += 1) {
    const t = (a / 12) * Math.PI * 2 + 0.2;
    bmp.ellipse(cx + Math.cos(t) * rx * 0.71, cy + Math.sin(t) * ry * 0.71, rx * 0.035, ry * 0.05, lighten(opts.center ?? PAL.clothMint, 0.4));
  }
  bmp.ellipse(cx, cy, rx * 0.2, ry * 0.2, lighten(opts.center ?? PAL.clothMint, 0.22));
  // 上沿受光
  bmp.blendEllipse(cx - rx * 0.1, cy - ry * 0.34, rx * 0.7, ry * 0.4, alpha(PAL.cream, 0.2), 0.6);
  return bmp;
}

/** 方形/长方形地毯：边框 + 内芯 + 角花。 */
export function rectRug(bmp, x, y, w, h, opts = {}) {
  const outer = opts.outer ?? PAL.clothRoseDeep;
  const inner = opts.inner ?? PAL.clothRose;
  bmp.roundRect(x, y, w, h, 0.8, outer);
  bmp.roundRect(x + 1, y + 1, w - 2, h - 2, 0.6, inner);
  bmp.roundRect(x + 2.2, y + 2.2, w - 4.4, h - 4.4, 0.4, mix(inner, PAL.cream, 0.28));
  // 编织纹
  for (let yy = y + 3; yy < y + h - 2.5; yy += 1.6) {
    for (let xx = x + 3; xx < x + w - 2.5; xx += 1.6) {
      if (hash(Math.round(xx * 4), Math.round(yy * 4), 11) > 0.55) continue;
      bmp.blendRect(xx, yy, 0.5, 0.25, darken(inner, 0.2), 0.3);
    }
  }
  bmp.blendRect(x, y, w, 0.5, lighten(outer, 0.4), 0.6);
  bmp.blendRect(x, y + h - 0.5, w, 0.5, darken(outer, 0.35), 0.5);
  return bmp;
}

/** 挂画/海报：木框 + 印刷面 + 画面剪影 + 标题条。 */
export function poster(bmp, x, y, w, h, opts = {}) {
  face(bmp, x, y, w, h, opts.frame ?? PAL.woodLight, { top: 0.3, bottom: 0.22, bandH: 0.4 });
  woodGrain(bmp, x, y, w, h, opts.frame ?? PAL.woodLight, { seed: 17, density: 0.25 });
  const p = opts.pad ?? 1.4;
  bmp.rect(x + p, y + p, w - p * 2, h - p * 2, PAL.cream);
  const ax = x + p + 0.6;
  const ay = y + p + 0.6;
  const aw = w - (p + 0.6) * 2;
  const ah = (h - (p + 0.6) * 2) * 0.66;
  bmp.rect(ax, ay, aw, ah, opts.bg ?? PAL.clothLilac);
  bmp.blendRect(ax, ay, aw, ah * 0.4, lighten(opts.bg ?? PAL.clothLilac, 0.35), 0.7);
  // 画面剪影（人物感色块）
  bmp.ellipse(ax + aw * 0.5, ay + ah * 0.42, aw * 0.18, ah * 0.24, opts.figure ?? PAL.vermilion);
  bmp.blendEllipse(ax + aw * 0.5, ay + ah * 0.3, aw * 0.13, ah * 0.15, PAL.cream, 0.55);
  bmp.blendRect(ax + aw * 0.3, ay + ah * 0.62, aw * 0.4, ah * 0.34, darken(opts.figure ?? PAL.vermilion, 0.2), 0.55);
  // 标题条
  const ty = ay + ah + 0.8;
  bmp.blendRect(ax + aw * 0.12, ty, aw * 0.76, 0.6, PAL.inkLight, 0.55);
  bmp.blendRect(ax + aw * 0.2, ty + 1.2, aw * 0.6, 0.45, PAL.inkLight, 0.4);
  bmp.blendRect(ax + aw * 0.28, ty + 2.3, aw * 0.44, 0.4, PAL.goldDeep, 0.6);
  // 玻璃反光
  bmp.blendPolygon(
    [
      [ax + aw * 0.6, ay],
      [ax + aw * 0.78, ay],
      [ax + aw * 0.5, ay + ah],
      [ax + aw * 0.32, ay + ah],
    ],
    alpha(PAL.glassSheen, 0.18),
    0.6,
  );
  return bmp;
}

/** 软木公告板：木框 + 软木面 + 便签。 */
export function corkBoard(bmp, x, y, w, h, opts = {}) {
  face(bmp, x, y, w, h, PAL.woodMid, { top: 0.32, bottom: 0.24 });
  woodGrain(bmp, x, y, w, h, PAL.woodMid, { seed: 23 });
  const p = 1.6;
  bmp.rect(x + p, y + p, w - p * 2, h - p * 2, opts.cork ?? '#e0b78a');
  for (let yy = y + p + 0.5; yy < y + h - p - 0.5; yy += 0.9) {
    for (let xx = x + p + 0.5; xx < x + w - p - 0.5; xx += 0.9) {
      if (hash(Math.round(xx * 8), Math.round(yy * 8), 31) > 0.4) continue;
      bmp.blendRect(xx, yy, 0.25, 0.25, darken(opts.cork ?? '#e0b78a', 0.3), 0.45);
    }
  }
  // 便签
  const notes = opts.notes ?? [
    { x: 0.16, y: 0.16, w: 0.3, h: 0.34, c: PAL.clothButter },
    { x: 0.56, y: 0.22, w: 0.28, h: 0.3, c: PAL.clothMint },
    { x: 0.24, y: 0.58, w: 0.34, h: 0.28, c: PAL.clothRose },
  ];
  for (const n of notes) {
    const nx = x + w * n.x;
    const ny = y + h * n.y;
    const nw = w * n.w;
    const nh = h * n.h;
    bmp.rect(nx, ny, nw, nh, n.c);
    bmp.blendRect(nx, ny, nw, nh * 0.2, lighten(n.c, 0.4), 0.6);
    bmp.px(nx + nw / 2, ny + 0.5, PAL.vermilionDeep);
    for (let l = 0; l < 3; l += 1) {
      bmp.blendRect(nx + nw * 0.14, ny + nh * (0.42 + l * 0.18), nw * 0.68, 0.25, PAL.inkLight, 0.4);
    }
  }
  return bmp;
}

/** 小木牌（设施标识）。 */
export function woodSign(bmp, x, y, w, h, opts = {}) {
  face(bmp, x, y, w, h, opts.color ?? PAL.woodLight, { top: 0.34, bottom: 0.24 });
  woodGrain(bmp, x, y, w, h, opts.color ?? PAL.woodLight, { seed: 41, density: 0.3 });
  bmp.blendRect(x + 0.6, y + 0.6, w - 1.2, 0.3, PAL.cream, 0.4);
  // 文字条（真实文本由 DOM 图层渲染，这里只留版位）
  const n = opts.lines ?? 1;
  for (let i = 0; i < n; i += 1) {
    bmp.blendRect(x + w * 0.14, y + h * (0.3 + i * 0.3), w * 0.72, Math.max(0.4, h * 0.12), PAL.ink, 0.42);
  }
  bmp.blendRect(x, y + h - 0.3, w, 0.3, darken(opts.color ?? PAL.woodLight, 0.45), 0.6);
  return bmp;
}

/** 吊灯：线 + 灯罩 + 灯芯（发光由光照层叠加）。 */
export function pendantLamp(bmp, cx, topY, dropLen, shadeW, opts = {}) {
  bmp.blendRect(cx - 0.2, topY, 0.4, dropLen, PAL.inkSoft, 0.85);
  const sy = topY + dropLen;
  // 灯罩
  bmp.polygon(
    [
      [cx - shadeW / 2, sy],
      [cx + shadeW / 2, sy],
      [cx + shadeW * 0.28, sy + shadeW * 0.42],
      [cx - shadeW * 0.28, sy + shadeW * 0.42],
    ],
    opts.shade ?? PAL.gold,
  );
  bmp.polygon(
    [
      [cx - shadeW / 2, sy],
      [cx - shadeW * 0.1, sy],
      [cx - shadeW * 0.12, sy + shadeW * 0.42],
      [cx - shadeW * 0.28, sy + shadeW * 0.42],
    ],
    lighten(opts.shade ?? PAL.gold, 0.4),
  );
  bmp.blendRect(cx - shadeW * 0.28, sy + shadeW * 0.4, shadeW * 0.56, 0.4, darken(opts.shade ?? PAL.gold, 0.35), 0.8);
  // 灯芯（暖黄，不用纯白）
  bmp.ellipse(cx, sy + shadeW * 0.46, shadeW * 0.16, shadeW * 0.1, PAL.amberLight);
  bmp.ellipse(cx, sy + shadeW * 0.44, shadeW * 0.09, shadeW * 0.06, PAL.lampCore);
  return bmp;
}

/**
 * 落地纸罩灯：木脚 + 细杆 + 梯形纸罩 + 罩内暖芯。
 * 经营游戏里这类灯是"暖光源"的可见载体，灯罩本身要透光，不是一块实心色块。
 */
export function floorLamp(bmp, cx, baseY, h, opts = {}) {
  // 木底盘
  bmp.ellipse(cx, baseY - 1, 4.2, 1.5, PAL.woodMid);
  bmp.ellipse(cx, baseY - 1.6, 3.4, 1.1, PAL.woodLight);
  bmp.ellipse(cx, baseY - 2, 2.2, 0.7, PAL.woodHighlight);
  // 细杆
  bmp.rect(cx - 0.35, baseY - h + 5, 0.7, h - 7, PAL.woodDeep);
  bmp.rect(cx - 0.35, baseY - h + 5, 0.3, h - 7, PAL.metalLight);
  // 纸罩：梯形，上窄下宽，透出暖芯
  const sy = baseY - h;
  const topW = 5.2;
  const botW = 7.6;
  const shadeH = 7.2;
  bmp.polygon(
    [
      [cx - botW / 2, sy + shadeH],
      [cx + botW / 2, sy + shadeH],
      [cx + topW / 2, sy + 0.6],
      [cx - topW / 2, sy + 0.6],
    ],
    opts.shade ?? PAL.clothButter,
  );
  // 罩内暖芯（下缘略亮，但不再用近白色，避免夜景过曝）
  for (let i = 0; i < shadeH * 4; i += 1) {
    const t = i / (shadeH * 4);
    bmp.blendRect(cx - botW / 2 + 0.8, sy + shadeH - i / 4 - 0.25, botW - 1.6, 0.25, PAL.amberLight, 0.26 - t * 0.2);
  }
  // 罩骨
  for (let i = -1; i <= 1; i += 1) {
    bmp.line(cx + i * 1.9, sy + 0.8, cx + i * 2.7, sy + shadeH - 0.3, alpha(PAL.woodDeep, 0.55), 0.25);
  }
  // 上下压边
  bmp.blendRect(cx - topW / 2, sy + 0.4, topW, 0.5, PAL.woodMid, 0.9);
  bmp.blendRect(cx - botW / 2, sy + shadeH - 0.2, botW, 0.55, PAL.amberDeep, 0.85);
  // 灯芯
  bmp.ellipse(cx, sy + shadeH + 0.5, 2, 0.6, alpha(PAL.amberLight, 0.55));
  return bmp;
}

/** 小茶几。 */
export function teaTable(bmp, x, y, w, h, opts = {}) {
  const legH = h * 0.4;
  bmp.rect(x + 1, y + h - legH, 1, legH, PAL.woodDark);
  bmp.rect(x + w - 2, y + h - legH, 1, legH, PAL.woodDark);
  woodTop(bmp, x, y + h * 0.22, w, h * 0.42, opts.color ?? PAL.woodLight, { seed: 61 });
  // 茶具
  bmp.ellipse(x + w * 0.32, y + h * 0.3, 2.2, 1.4, PAL.cream);
  bmp.ellipse(x + w * 0.32, y + h * 0.28, 1.5, 0.8, PAL.clothRoseDeep);
  bmp.ellipse(x + w * 0.62, y + h * 0.32, 1.5, 1.1, PAL.clothSky);
  bmp.blendRect(x + w * 0.62, y + h * 0.24, 0.6, 1.2, PAL.clothSkyDeep, 0.9);
  return bmp;
}

/** 书/目录册堆。 */
export function bookStack(bmp, x, y, w, h, n = 3, opts = {}) {
  const colors = opts.colors ?? [PAL.clothRose, PAL.clothSky, PAL.clothButter, PAL.clothMint];
  for (let i = 0; i < n; i += 1) {
    const yy = y + h - (i + 1) * (h / n) - i * 0.1;
    bmp.rect(x + i * 0.3, yy, w - i * 0.6, h / n - 0.3, colors[i % colors.length]);
    bmp.blendRect(x + i * 0.3, yy, w - i * 0.6, (h / n) * 0.28, lighten(colors[i % colors.length], 0.4), 0.7);
    bmp.blendRect(x + i * 0.3 + w * 0.1, yy + (h / n) * 0.5, w * 0.5, 0.25, PAL.cream, 0.7);
  }
  return bmp;
}

/** 奖杯。 */
export function trophy(bmp, cx, baseY, scale = 1) {
  const s = scale;
  bmp.rect(cx - 4 * s, baseY - 3 * s, 8 * s, 3 * s, PAL.woodMid);
  bmp.rect(cx - 4 * s, baseY - 3 * s, 8 * s, 0.5 * s, PAL.woodLight);
  bmp.rect(cx - 1 * s, baseY - 8 * s, 2 * s, 5 * s, PAL.goldDeep);
  bmp.polygon(
    [
      [cx - 4 * s, baseY - 15 * s],
      [cx + 4 * s, baseY - 15 * s],
      [cx + 2.4 * s, baseY - 8 * s],
      [cx - 2.4 * s, baseY - 8 * s],
    ],
    PAL.gold,
  );
  bmp.blendRect(cx - 3.4 * s, baseY - 15 * s, 2.2 * s, 6 * s, PAL.goldLight, 0.75);
  bmp.ellipse(cx, baseY - 15 * s, 4 * s, 0.9 * s, PAL.goldLight);
  bmp.ellipse(cx - 4.6 * s, baseY - 12.5 * s, 1.2 * s, 1.8 * s, PAL.goldDeep);
  bmp.ellipse(cx + 4.6 * s, baseY - 12.5 * s, 1.2 * s, 1.8 * s, PAL.goldDeep);
  return bmp;
}

/** 挂钟。 */
export function wallClock(bmp, cx, cy, r) {
  bmp.ellipse(cx, cy, r, r, PAL.woodMid);
  bmp.ellipse(cx, cy, r - 0.9, r - 0.9, PAL.cream);
  bmp.ellipse(cx, cy, r - 1.6, r - 1.6, PAL.paper);
  for (let i = 0; i < 12; i += 1) {
    const t = (i / 12) * Math.PI * 2 - Math.PI / 2;
    const rr = r - 2.2;
    bmp.rect(cx + Math.cos(t) * rr - 0.2, cy + Math.sin(t) * rr - 0.2, 0.4, 0.4, i % 3 === 0 ? PAL.inkSoft : PAL.inkLight);
  }
  bmp.line(cx, cy, cx, cy - r * 0.55, PAL.inkSoft, 0.3);
  bmp.line(cx, cy, cx + r * 0.42, cy + r * 0.18, PAL.vermilionDeep, 0.25);
  bmp.ellipse(cx, cy, 0.5, 0.5, PAL.goldDeep);
  return bmp;
}

/** 音箱。 */
export function speaker(bmp, x, y, w, h, opts = {}) {
  face(bmp, x, y, w, h, opts.color ?? PAL.clothSlate, { top: 0.3, bottom: 0.26 });
  const cx = x + w / 2;
  const r1 = w * 0.32;
  const r2 = w * 0.24;
  for (const [cy, r] of [
    [y + h * 0.34, r1],
    [y + h * 0.72, r2],
  ]) {
    bmp.ellipse(cx, cy, r, r, darken(opts.color ?? PAL.clothSlate, 0.5));
    bmp.ellipse(cx, cy, r * 0.72, r * 0.72, mix(PAL.clothSlate, PAL.cream, 0.2));
    bmp.ellipse(cx, cy, r * 0.26, r * 0.26, PAL.clothSlateDeep);
    bmp.blendEllipse(cx - r * 0.3, cy - r * 0.3, r * 0.34, r * 0.24, PAL.cream, 0.35);
  }
  bmp.blendRect(x + w * 0.3, y + h * 0.06, w * 0.4, 0.4, PAL.goldLight, 0.6);
  return bmp;
}

/** 小立牌/价签（斜靠）。 */
export function priceTag(bmp, x, y, w, h, opts = {}) {
  bmp.polygon(
    [
      [x, y + h],
      [x + w * 0.12, y],
      [x + w * 0.88, y],
      [x + w, y + h],
    ],
    opts.color ?? PAL.cream,
  );
  bmp.blendPolygon(
    [
      [x + 0.3, y + h],
      [x + w * 0.15, y + 0.4],
      [x + w * 0.5, y + 0.4],
      [x + w * 0.5, y + h],
    ],
    PAL.foilSheen,
    0.5,
  );
  bmp.blendRect(x + w * 0.2, y + h * 0.3, w * 0.6, 0.5, PAL.vermilion, 0.85);
  bmp.blendRect(x + w * 0.28, y + h * 0.56, w * 0.44, 0.4, PAL.inkLight, 0.55);
  return bmp;
}

/** 指示箭头地贴。 */
export function floorArrow(bmp, x, y, w, h, opts = {}) {
  bmp.blendPolygon(
    [
      [x, y + h * 0.28],
      [x + w * 0.55, y + h * 0.28],
      [x + w * 0.55, y],
      [x + w, y + h * 0.5],
      [x + w * 0.55, y + h],
      [x + w * 0.55, y + h * 0.72],
      [x, y + h * 0.72],
    ],
    opts.color ?? alpha(PAL.vermilion, 0.5),
    0.9,
  );
  return bmp;
}

// ---------------------------------------------------------------- 组合件

/**
 * 柜台主体：台面 + 前立面 + 柜门 + 踢脚 + 侧立面。
 * 返回各部分矩形，便于在台面上摆设备。
 */
export function counterBody(bmp, x, y, w, h, opts = {}) {
  const topH = opts.topH ?? h * 0.3;
  const bodyColor = opts.body ?? PAL.woodLight;
  const topColor = opts.top ?? PAL.woodPale;
  // 前立面
  bmp.rect(x, y + topH, w, h - topH, bodyColor);
  woodGrain(bmp, x, y + topH, w, h - topH, bodyColor, { axis: 'x', seed: 71, density: 0.45, step: 1.8 });
  // 右侧暗面
  bmp.blendRect(x + w - Math.max(0.9, w * 0.02), y + topH, Math.max(0.9, w * 0.02), h - topH, darken(bodyColor, 0.5), 0.5);
  // 柜门/抽屉分格：明显更暗的内凹面，读得出"这是柜子"
  const slots = opts.slots ?? Math.max(2, Math.round(w / 22));
  const gap = 1.6;
  const sw = (w - gap * (slots + 1)) / slots;
  const panelColor = opts.panel ?? darken(bodyColor, 0.16);
  for (let i = 0; i < slots; i += 1) {
    const sx = x + gap + i * (sw + gap);
    const py = y + topH + 2.2;
    const ph = h - topH - 6.2;
    // 凹槽底色
    bmp.rect(sx, py, sw, ph, darken(bodyColor, 0.34));
    // 门板
    bmp.rect(sx + 0.3, py + 0.3, sw - 0.6, ph - 0.6, panelColor);
    // 门板受光/背光硬边
    bmp.blendRect(sx + 0.3, py + 0.3, sw - 0.6, 0.55, lighten(panelColor, 0.42), 0.7);
    bmp.blendRect(sx + 0.3, py + ph - 0.85, sw - 0.6, 0.55, darken(panelColor, 0.4), 0.7);
    bmp.blendRect(sx + 0.3, py + 0.3, 0.4, ph - 0.6, lighten(panelColor, 0.25), 0.5);
    // 把手
    const hx = sx + sw - 2.2;
    bmp.roundRect(hx, py + ph / 2 - 1, 1.1, 2, 0.3, PAL.metalMid);
    bmp.rect(hx, py + ph / 2 - 1, 0.4, 2, PAL.metalLight);
    bmp.rect(hx, py + ph / 2 + 0.8, 1.1, 0.25, PAL.metalDeep);
  }
  // 前立面颗粒：木面不是纯色板
  speckle(bmp, x, y + topH, w, h - topH - 2.8, alpha(PAL.woodDeep, 0.38), 0.03, 77);
  speckle(bmp, x, y + topH, w, h - topH - 2.8, alpha(PAL.woodHighlight, 0.42), 0.02, 78);
  // 踢脚（更暗，压住整体）
  bmp.rect(x, y + h - 2.8, w, 2.8, darken(bodyColor, 0.52));
  bmp.blendRect(x, y + h - 2.8, w, 0.4, darken(bodyColor, 0.2), 0.7);
  bmp.blendRect(x, y + h - 0.3, w, 0.3, darken(bodyColor, 0.7), 0.8);
  // 台面
  woodTop(bmp, x - 0.8, y, w + 1.6, topH, topColor, { seed: 73 });
  // 台面前唇（厚度）
  bmp.rect(x - 0.8, y + topH - 1.1, w + 1.6, 1.1, darken(topColor, 0.45));
  bmp.blendRect(x - 0.8, y + topH - 1.1, w + 1.6, 0.3, lighten(topColor, 0.55), 0.7);
  bmp.blendRect(x - 0.8, y + topH - 0.25, w + 1.6, 0.25, darken(topColor, 0.65), 0.7);
  return { topY: y, topH, bodyY: y + topH, bodyH: h - topH, innerX: x + 1, innerW: w - 2 };
}

/** 货架柜体：侧板 + 背板 + 层板。返回每层的可用矩形。 */
export function shelfFrame(bmp, x, y, w, h, opts = {}) {
  const lvl = opts.level ?? 0;
  const accent = LEVEL[Math.min(3, lvl)];
  const postW = opts.postW ?? Math.max(2.2, w * 0.06);
  const rows = opts.rows ?? 3;
  const frameColor = opts.frame ?? PAL.woodMid;

  // 背板（内凹，比外框明显更暗，让陈列品"跳"出来）
  bmp.rect(x, y, w, h, opts.back ?? darken(PAL.woodPale, 0.28));
  bmp.blendRect(x + postW, y + 1, w - postW * 2, h - 2, darken(PAL.woodPale, 0.42), 0.85);
  bmp.blendRect(x + postW, y + 1, w - postW * 2, 1.2, darken(PAL.woodPale, 0.6), 0.7);
  speckle(bmp, x + postW, y + 1, w - postW * 2, h - 2, alpha(PAL.woodDeep, 0.3), 0.026, 55);

  // 侧板
  for (const px of [x, x + w - postW]) {
    face(bmp, px, y, postW, h, frameColor, { top: 0.34, bottom: 0.4, bandH: 0.6, lowH: 1.2 });
    woodGrain(bmp, px, y, postW, h, frameColor, { axis: 'y', seed: 83, density: 0.5, step: 1.6 });
  }
  // 顶板（带厚度与投影）
  face(bmp, x - 0.8, y - 1, w + 1.6, 2.6, opts.crown ?? PAL.woodPale, { top: 0.36, bottom: 0.3 });
  bmp.blendRect(x - 0.8, y - 1, w + 1.6, 0.4, PAL.woodHighlight, 0.9);
  bmp.blendRect(x - 0.8, y + 1.2, w + 1.6, 0.4, PAL.woodDeep, 0.6);
  bmp.blendRect(x - 0.8, y + 1.6, w + 1.6, 0.9, darken(PAL.woodPale, 0.55), 0.45);
  // 踢脚
  bmp.rect(x, y + h - 3, w, 3, darken(frameColor, 0.42));
  bmp.blendRect(x, y + h - 3, w, 0.5, darken(frameColor, 0.15), 0.7);
  bmp.blendRect(x, y + h - 0.3, w, 0.3, darken(frameColor, 0.65), 0.8);

  // 层板
  const innerTop = y + 2.6;
  const innerH = h - 3 - 2.6 - 3;
  const rowH = innerH / rows;
  const shelves = [];
  for (let r = 0; r < rows; r += 1) {
    const sy = innerTop + (r + 1) * rowH;
    // 层板厚度（亮面 + 暗侧）
    bmp.rect(x + postW - 0.5, sy - 1.4, w - postW * 2 + 1, 1.4, opts.shelfColor ?? PAL.woodPale);
    bmp.blendRect(x + postW - 0.5, sy - 1.4, w - postW * 2 + 1, 0.4, PAL.woodHighlight, 0.85);
    bmp.blendRect(x + postW - 0.5, sy - 0.35, w - postW * 2 + 1, 0.35, PAL.woodDeep, 0.6);
    // 层板下投影
    for (let i = 0; i < 4; i += 1) {
      bmp.blendRect(x + postW, sy + i * 0.35, w - postW * 2, 0.35, PAL.woodDeep, 0.28 - i * 0.06);
    }
    shelves.push({ x: x + postW + 0.6, y: innerTop + r * rowH + 0.4, w: w - postW * 2 - 1.2, h: rowH - 1.8 });
  }
  // 等级装饰
  if (lvl >= 1) {
    for (let r = 0; r < rows; r += 1) {
      const sy = innerTop + (r + 1) * rowH;
      bmp.rect(x + postW - 0.5, sy - 1.4, w - postW * 2 + 1, 0.4, accent.trim);
    }
    for (const [cx2, cy2] of [
      [x + 0.4, y + 3],
      [x + w - 1.8, y + 3],
    ]) {
      bmp.rect(cx2, cy2, 1.4, 1.4, accent.accentDeep);
      bmp.blendRect(cx2, cy2, 1.4, 0.45, accent.trim, 0.9);
    }
  }
  if (lvl >= 2) {
    bmp.rect(x + w * 0.36, y - 0.6, w * 0.28, 1.4, PAL.skyDeep);
    bmp.blendRect(x + w * 0.38, y - 0.3, w * 0.24, 0.6, PAL.skyLight, 0.9);
  }
  if (lvl >= 3) {
    bmp.blendRect(x + postW, y + 2.6, w - postW * 2, h - 8.6, alpha(PAL.velvet, 1), 0.42);
    const cw = w * 0.15;
    const cx2 = x + w / 2;
    const cy2 = y + 1.4;
    bmp.polygon(
      [
        [cx2 - cw, cy2 + cw * 0.75],
        [cx2 - cw, cy2],
        [cx2 - cw * 0.45, cy2 + cw * 0.4],
        [cx2, cy2 - cw * 0.15],
        [cx2 + cw * 0.45, cy2 + cw * 0.4],
        [cx2 + cw, cy2],
        [cx2 + cw, cy2 + cw * 0.75],
      ],
      PAL.gold,
    );
  }
  return shelves;
}

/** 把一层货架的陈列填满。density 0=空 1=满。 */
export function fillShelfRow(bmp, box, density, seed = 1, opts = {}) {
  if (density <= 0) return;
  const unit = opts.unit ?? 3.4; // 一件商品占用的世界宽度
  const count = Math.max(1, Math.floor(box.w / unit));
  const shown = Math.round(count * density);
  for (let i = 0; i < shown; i += 1) {
    const h = hash(i, seed, 17);
    const theme = opts.theme ?? ['rose', 'sky', 'mint', 'butter', 'lilac', 'slate', 'coral'][(i + seed) % 7];
    const isBox = opts.mix && h > 0.62;
    const itemH = box.h * (isBox ? 0.72 : 0.82);
    const itemW = unit * (isBox ? 0.92 : 0.72);
    const ix = box.x + i * unit + (unit - itemW) / 2;
    const iy = box.y + box.h - itemH;
    if (isBox) cardBox(bmp, ix, iy, itemW, itemH, theme);
    else foilPack(bmp, ix, iy, itemW, itemH, theme);
    // 商品底部接触阴影
    bmp.blendRect(ix, box.y + box.h - 0.3, itemW, 0.3, alpha('#7a5638', 0.35), 0.7);
  }
  // 空位标线
  if (shown < count) {
    const sx = box.x + shown * unit;
    for (let i = shown; i < count; i += 1) {
      bmp.blendRect(box.x + i * unit + unit * 0.2, box.y + box.h - 0.35, unit * 0.6, 0.25, alpha('#9a7a56', 0.3), 0.6);
    }
  }
  return bmp;
}

/** 桌面牌垫。 */
export function playmat(bmp, x, y, w, h, color, opts = {}) {
  bmp.roundRect(x, y, w, h, 1, color);
  bmp.roundRect(x + 0.8, y + 0.8, w - 1.6, h - 1.6, 0.7, lighten(color, 0.12));
  // 中线
  bmp.blendRect(x + w / 2 - 0.2, y + 1.6, 0.4, h - 3.2, lighten(color, 0.45), 0.55);
  // 战区虚线
  for (let i = 0; i < 6; i += 1) {
    bmp.blendRect(x + 1.6, y + 2 + i * (h - 4) / 6, w - 3.2, 0.2, alpha(PAL.cream, 0.4), 0.5);
  }
  // 边角徽记
  for (const [cx2, cy2] of [
    [x + 2.2, y + 2.2],
    [x + w - 2.2, y + h - 2.2],
  ]) {
    bmp.ellipse(cx2, cy2, 0.9, 0.9, lighten(color, 0.5));
    bmp.ellipse(cx2, cy2, 0.45, 0.45, color);
  }
  return bmp;
}

/** 桌子主体（牌桌/茶几通用）。 */
export function tableBody(bmp, x, y, w, h, opts = {}) {
  const topOffset = opts.topOffset ?? 2;
  const topH = opts.topH ?? (h - topOffset) * 0.44;
  const topY = y + topOffset;
  const legH = h - topH - topOffset;
  const woodColor = opts.wood ?? PAL.woodMid;
  const legW = opts.legW ?? Math.max(3.4, w * 0.06);
  // 桌腿（带受光面与背光面）
  for (const lx of [x + 2.4, x + w - 2.4 - legW]) {
    bmp.rect(lx, topY + topH - 1.4, legW, legH + 0.6, woodColor);
    bmp.blendRect(lx, topY + topH - 1.4, Math.max(0.8, legW * 0.3), legH + 0.6, lighten(woodColor, 0.42), 0.7);
    bmp.blendRect(lx + legW - Math.max(0.8, legW * 0.32), topY + topH - 1.4, Math.max(0.8, legW * 0.32), legH + 0.6, darken(woodColor, 0.48), 0.7);
    bmp.blendRect(lx, topY + topH - 1.4, legW, 0.4, darken(woodColor, 0.55), 0.7);
  }
  // 横撑
  bmp.rect(x + 2.4, topY + topH + legH * 0.62, w - 4.8, 1.2, darken(woodColor, 0.3));
  bmp.blendRect(x + 2.4, topY + topH + legH * 0.62, w - 4.8, 0.35, lighten(woodColor, 0.35), 0.6);
  // 裙板
  bmp.rect(x + 2, topY + topH - 1.6, w - 4, 1.8, darken(woodColor, 0.36));
  bmp.blendRect(x + 2, topY + topH - 1.6, w - 4, 0.45, lighten(woodColor, 0.3), 0.6);
  // 桌面
  woodTop(bmp, x, topY, w, topH, opts.topColor ?? PAL.woodPale, { seed: 97 });
  // 桌沿厚度（前唇）
  bmp.rect(x, topY + topH - 1.3, w, 1.3, darken(opts.topColor ?? PAL.woodPale, 0.48));
  bmp.blendRect(x, topY + topH - 1.3, w, 0.4, lighten(opts.topColor ?? PAL.woodPale, 0.5), 0.75);
  bmp.blendRect(x, topY + topH - 0.3, w, 0.3, darken(opts.topColor ?? PAL.woodPale, 0.68), 0.8);
  return { topX: x + 0.6, topY: topY + 0.6, topW: w - 1.2, topH: topH - 2 };
}

/** 垃圾桶：桶身 + 桶盖 + 投入口 + 露出的卡牌。 */
export function trashBin(bmp, x, y, w, h, opts = {}) {
  const bodyColor = opts.color ?? PAL.mint;
  const lidH = 3.2;
  // 桶身（上宽下窄）
  bmp.polygon(
    [
      [x + 0.8, y + lidH],
      [x + w - 0.8, y + lidH],
      [x + w - 1.8, y + h - 1.2],
      [x + 1.8, y + h - 1.2],
    ],
    bodyColor,
  );
  // 竖向棱
  for (let i = 1; i < 5; i += 1) {
    const t = i / 5;
    const bx = x + 0.8 + (w - 1.6) * t;
    const tx = x + 1.8 + (w - 3.6) * t;
    bmp.line(bx, y + lidH + 0.4, tx, y + h - 1.6, darken(bodyColor, 0.22), 0.25);
    bmp.line(bx + 0.5, y + lidH + 0.4, tx + 0.5, y + h - 1.6, lighten(bodyColor, 0.28), 0.25);
  }
  // 桶底
  bmp.rect(x + 1.6, y + h - 1.4, w - 3.2, 1.4, darken(bodyColor, 0.3));
  // 盖
  bmp.rect(x, y + lidH - 1.6, w, lidH, lighten(bodyColor, 0.22));
  bmp.blendRect(x, y + lidH - 1.6, w, 0.5, lighten(bodyColor, 0.55), 0.8);
  bmp.blendRect(x, y + lidH * 2 - 1.9, w, 0.3, darken(bodyColor, 0.4), 0.7);
  // 投入口
  const sw = w * 0.5;
  bmp.rect(x + (w - sw) / 2, y + lidH - 1.3, sw, 1, darken(bodyColor, 0.72));
  bmp.blendRect(x + (w - sw) / 2, y + lidH - 1.3, sw, 0.3, darken(bodyColor, 0.85), 0.9);
  // 露出卡牌
  if (opts.hasCards !== false) {
    const n = opts.cards ?? 3;
    for (let i = 0; i < n; i += 1) {
      const cx2 = x + w * (0.32 + i * 0.16);
      const ch = 3.6 - i * 0.3;
      bmp.rect(cx2, y + lidH - ch - 0.2, 2.2, ch, i % 2 ? PAL.cream : PAL.paper);
      bmp.blendRect(cx2 + 0.3, y + lidH - ch, 1.6, 1.2, i % 2 ? PAL.clothRose : PAL.clothSky, 0.9);
      bmp.blendRect(cx2, y + lidH - 0.4, 2.2, 0.25, PAL.paperShade, 0.8);
    }
  }
  // 回收标识
  bmp.ellipse(x + w / 2, y + h * 0.55, 2.4, 2.4, alpha(PAL.cream, 0.55));
  bmp.blendPolygon(
    [
      [x + w / 2 - 1.2, y + h * 0.5],
      [x + w / 2 + 1.2, y + h * 0.5],
      [x + w / 2, y + h * 0.42],
    ],
    alpha(PAL.mintDeep, 0.85),
    0.9,
  );
  bmp.blendRect(x + w / 2 - 0.9, y + h * 0.5, 1.8, 0.5, alpha(PAL.mintDeep, 0.85), 0.9);
  return bmp;
}

/** 展柜：柜体 + 玻璃罩 + 内部陈列。 */
export function displayCase(bmp, x, y, w, h, opts = {}) {
  const baseH = h * 0.34;
  const baseY = y + h - baseH;
  // 柜体
  face(bmp, x, baseY, w, baseH, opts.base ?? PAL.woodLight, { top: 0.3, bottom: 0.26 });
  woodGrain(bmp, x, baseY, w, baseH, opts.base ?? PAL.woodLight, { seed: 101 });
  bmp.rect(x, baseY + baseH - 2, w, 2, darken(opts.base ?? PAL.woodLight, 0.32));
  // 台面
  woodTop(bmp, x - 0.6, baseY - 1.2, w + 1.2, 2.4, opts.top ?? PAL.woodPale, { seed: 103 });
  // 玻璃罩
  const gh = baseY - 1.2 - y;
  bmp.rect(x + 1, y, w - 2, gh, alpha(PAL.glass, 0.3));
  // 内部陈列（先画物，再压玻璃，高光才不糊住商品）
  return { glassX: x + 1, glassY: y, glassW: w - 2, glassH: gh, shelfY: baseY - 1.2 };
}

/**
 * 给玻璃罩补玻璃层（在画完内部陈列后调用）。
 * 玻璃只做"薄一层"：两条窄高光带 + 上下边线，绝不压住内部陈列的辨识度。
 */
export function glassCover(bmp, x, y, w, h) {
  bmp.blendRect(x, y, w, h, alpha(PAL.glassMid, 1), 0.12);
  // 两条窄斜高光
  for (const t of [0.16, 0.62]) {
    const ox = x + w * t;
    bmp.blendPolygon(
      [
        [ox, y],
        [ox + w * 0.09, y],
        [ox + w * 0.09 - h * 0.34, y + h],
        [ox - h * 0.34, y + h],
      ],
      alpha(PAL.glassSheen, 1),
      0.34,
    );
  }
  // 上下边线（框）
  bmp.blendRect(x, y, w, 0.3, alpha(PAL.glassSheen, 1), 0.85);
  bmp.blendRect(x, y + h - 0.3, w, 0.3, alpha(PAL.glassDeep, 1), 0.6);
  bmp.blendRect(x, y, 0.3, h, alpha(PAL.glassSheen, 1), 0.6);
  bmp.blendRect(x + w - 0.3, y, 0.3, h, alpha(PAL.glassDeep, 1), 0.45);
  return bmp;
}

/** 在矩形区域内画一排立式卡（展柜/陈列用）。 */
export function rowOfCards(bmp, x, y, w, h, n, colors, opts = {}) {
  const gap = w / n;
  for (let i = 0; i < n; i += 1) {
    const cw = Math.min(gap * 0.62, h * 0.62);
    const ch = cw * 1.42;
    const cx2 = x + gap * (i + 0.5) - cw / 2;
    const cy2 = y + h - ch;
    singleCard(bmp, cx2, cy2, cw, ch, colors[i % colors.length], { rarity: opts.rarity });
    // 卡架
    bmp.blendRect(cx2 + cw * 0.1, cy2 + ch, cw * 0.8, 0.5, alpha(PAL.woodDark, 0.7), 0.8);
  }
  return bmp;
}

/** 悬挂卡框（墙面陈列）。 */
export function wallCardFrame(bmp, x, y, w, h, color) {
  bmp.rect(x, y, w, h, PAL.woodMid);
  bmp.blendRect(x, y, w, 0.4, PAL.woodHighlight, 0.6);
  bmp.rect(x + 0.5, y + 0.5, w - 1, h - 1, PAL.cream);
  bmp.rect(x + 1, y + 1, w - 2, h - 2, darken(color, 0.15));
  bmp.blendRect(x + 1, y + 1, w - 2, (h - 2) * 0.42, lighten(color, 0.32), 0.75);
  bmp.blendRect(x + w * 0.28, y + h * 0.44, w * 0.44, h * 0.34, lighten(color, 0.18), 0.7);
  bmp.blendRect(x + 1.4, y + h - 2.2, w - 2.8, 0.5, PAL.paperShade, 0.8);
  bmp.blendPolygon(
    [
      [x + 1.6, y + 1.2],
      [x + w * 0.42, y + 1.2],
      [x + w * 0.18, y + h - 1.6],
      [x + 1.6, y + h - 1.6],
    ],
    alpha(PAL.glassSheen, 0.22),
    0.6,
  );
  return bmp;
}

/** 一排货架式卡包陈列（背板 + 立式包）。 */
export function pegboardRow(bmp, x, y, w, h, count, opts = {}) {
  const gap = w / count;
  for (let i = 0; i < count; i += 1) {
    const pw = Math.min(gap * 0.68, 4.2);
    const ph = h * 0.86;
    foilPack(bmp, x + gap * (i + 0.5) - pw / 2, y + h - ph, pw, ph, ['rose', 'sky', 'mint', 'butter', 'lilac'][i % 5]);
    bmp.blendRect(x + gap * (i + 0.5) - 0.15, y + 0.4, 0.3, h * 0.2, alpha(PAL.metalDeep, 0.5), 0.6);
  }
  return bmp;
}
