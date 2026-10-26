// products.mjs — 大尺寸包装主图（进货/货架每页一组的大商品）。
// 目标：包与盒结构不同、主题可辨、有效高度 512～768 原生像素，
// 与场景里的小包装共用同一套主题色，但允许更细的印刷层次。

import { Bitmap, mix, lighten, darken, alpha, hash } from './canvas.mjs';
import { PAL, FOIL } from './palette.mjs';

export const PACK_SIZE = { w: 360, h: 600 };
export const BOX_SIZE = { w: 560, h: 380 };

const INK = PAL.inkLine;

/** 铝箔袋面：斜向金属渐变 + 细密压纹，避免大面积死平。 */
function foilSheen(bmp, x, y, w, h, base, seed = 1) {
  for (let i = 0; i < 26; i += 1) {
    const t = i / 26;
    const bandW = w * 0.06;
    const bx = x + w * (t * 1.3 - 0.2);
    bmp.blendPolygon(
      [
        [bx, y],
        [bx + bandW, y],
        [bx + bandW - h * 0.34, y + h],
        [bx - h * 0.34, y + h],
      ],
      i % 2 ? lighten(base, 0.5) : darken(base, 0.16),
      i % 2 ? 0.1 : 0.08,
    );
  }
  // 极细压纹
  for (let yy = y + 2; yy < y + h; yy += 3) {
    for (let xx = x + 2; xx < x + w; xx += 3) {
      if (hash(xx, yy, seed) > 0.72) continue;
      bmp.blendRect(xx, yy, 1, 1, lighten(base, 0.6), 0.06);
    }
  }
}

/**
 * 卡面插画窗：半身像（bust）。
 *
 * 这里是"像素经营游戏"和"廉价卡通"的分界线，所以刻意做了几件事：
 *  1. 正常头身比（头约占画面高度 1/5），不是 Q 版大头；
 *  2. 眼睛是带高光的杏仁形，不是两个白点；
 *  3. 头发分前后两层，刘海压在额头上，发梢落到肩上；
 *  4. 只画到胸口，肩线出画 —— 卡面插画都是这样裁的，比画全身更"贵"；
 *  5. 左侧一道轮廓光，与场景"主光左上"的约定一致。
 */
function heroArt(bmp, x, y, w, h, theme, seed) {
  const t = FOIL[theme] ?? FOIL.rose;
  const cx = x + w / 2;

  // —— 背景：放射线 + 地平线 ——
  bmp.rect(x, y, w, h, mix(t.mid, t.deep, 0.34));
  for (let i = 0; i < 22; i += 1) {
    const a = (i / 22) * Math.PI * 2 + seed * 0.4;
    const wide = 0.07 + (i % 3) * 0.02;
    bmp.blendPolygon(
      [
        [cx, y + h * 0.46],
        [cx + Math.cos(a) * w, y + h * 0.46 + Math.sin(a) * h],
        [cx + Math.cos(a + wide) * w, y + h * 0.46 + Math.sin(a + wide) * h],
      ],
      lighten(t.base, 0.5),
      0.09,
    );
  }
  bmp.blendEllipse(cx, y + h * 0.42, w * 0.34, h * 0.26, lighten(t.base, 0.55), 0.4);
  // 地面/桌面
  bmp.blendRect(x, y + h * 0.78, w, h * 0.22, mix(t.deep, t.mid, 0.2), 0.94);
  bmp.blendRect(x, y + h * 0.78, w, 0.6, lighten(t.base, 0.4), 0.35);

  // —— 比例 ——
  const headRx = w * 0.145;
  const headRy = w * 0.175;
  const headY = y + h * 0.33;
  const shoulderY = y + h * 0.6;
  const skin = '#f7d3ab';
  const skinShade = '#e0ab7e';
  const hairDark = '#4a3325';
  const hairMid = '#6b4a33';
  const hairLight = '#8f6647';

  // —— 后层头发（落在肩上）——
  bmp.ellipse(cx, headY + headRy * 0.15, headRx * 1.34, headRy * 1.2, hairDark);
  bmp.polygon(
    [
      [cx - headRx * 1.34, headY + headRy * 0.3],
      [cx + headRx * 1.34, headY + headRy * 0.3],
      [cx + headRx * 1.6, y + h * 0.82],
      [cx - headRx * 1.6, y + h * 0.82],
    ],
    hairDark,
  );
  // 后发受光
  bmp.blendPolygon(
    [
      [cx - headRx * 1.3, headY + headRy * 0.4],
      [cx - headRx * 0.7, headY + headRy * 0.4],
      [cx - headRx * 0.8, y + h * 0.8],
      [cx - headRx * 1.5, y + h * 0.8],
    ],
    hairMid,
    0.7,
  );

  // —— 身体：肩线出画 ——
  bmp.polygon(
    [
      [cx - w * 0.46, y + h + 2],
      [cx + w * 0.46, y + h + 2],
      [cx + w * 0.3, shoulderY + 4],
      [cx + w * 0.1, shoulderY - 6],
      [cx - w * 0.1, shoulderY - 6],
      [cx - w * 0.3, shoulderY + 4],
    ],
    mix(t.base, PAL.cream, 0.42),
  );
  // 衣服受光/背光
  bmp.blendPolygon(
    [
      [cx - w * 0.46, y + h + 2],
      [cx - w * 0.14, y + h + 2],
      [cx - w * 0.2, shoulderY + 4],
      [cx - w * 0.3, shoulderY + 4],
    ],
    lighten(mix(t.base, PAL.cream, 0.42), 0.4),
    0.55,
  );
  bmp.blendPolygon(
    [
      [cx + w * 0.2, y + h + 2],
      [cx + w * 0.46, y + h + 2],
      [cx + w * 0.3, shoulderY + 4],
      [cx + w * 0.16, shoulderY + 4],
    ],
    darken(mix(t.base, PAL.cream, 0.42), 0.28),
    0.5,
  );
  // 领口
  bmp.polygon(
    [
      [cx - w * 0.11, shoulderY - 6],
      [cx + w * 0.11, shoulderY - 6],
      [cx + w * 0.06, shoulderY + 10],
      [cx, shoulderY + 16],
      [cx - w * 0.06, shoulderY + 10],
    ],
    PAL.cream,
  );
  bmp.blendPolygon(
    [
      [cx - w * 0.11, shoulderY - 6],
      [cx - w * 0.02, shoulderY - 6],
      [cx - w * 0.02, shoulderY + 8],
      [cx - w * 0.06, shoulderY + 10],
    ],
    darken(PAL.cream, 0.14),
    0.8,
  );
  // 领结/徽章
  bmp.rect(cx - w * 0.022, shoulderY + 6, w * 0.044, w * 0.044, t.deep);
  bmp.blendRect(cx - w * 0.022, shoulderY + 6, w * 0.022, w * 0.022, PAL.goldLight, 0.85);

  // —— 脖子 ——
  bmp.rect(cx - headRx * 0.34, headY + headRy * 0.72, headRx * 0.68, headRy * 0.5, skinShade);
  bmp.blendRect(cx - headRx * 0.34, headY + headRy * 0.72, headRx * 0.34, headRy * 0.5, skin, 0.7);

  // —— 脸 ——
  bmp.ellipse(cx, headY, headRx, headRy, skin);
  // 侧脸阴影（右侧）
  bmp.blendEllipse(cx + headRx * 0.42, headY + headRy * 0.05, headRx * 0.55, headRy * 0.86, skinShade, 0.42);
  // 下巴收一点
  bmp.blendEllipse(cx, headY + headRy * 0.72, headRx * 0.72, headRy * 0.28, skin, 0.8);

  // —— 五官 ——
  const eyeY = headY + headRy * 0.1;
  const eyeDx = headRx * 0.42;
  const eyeRx = headRx * 0.2;
  const eyeRy = headRy * 0.2;
  for (const s of [-1, 1]) {
    const ex = cx + s * eyeDx;
    // 眼白
    bmp.ellipse(ex, eyeY, eyeRx, eyeRy, '#fdfbf6');
    // 瞳孔
    bmp.ellipse(ex + s * eyeRx * 0.12, eyeY + eyeRy * 0.06, eyeRx * 0.62, eyeRy * 0.8, '#3b2f3f');
    // 高光
    bmp.rect(ex - eyeRx * 0.4, eyeY - eyeRy * 0.42, eyeRx * 0.34, eyeRy * 0.34, '#ffffff');
    // 上眼睑
    bmp.blendRect(ex - eyeRx, eyeY - eyeRy * 0.92, eyeRx * 2, eyeRy * 0.34, '#3b2f3f', 0.9);
    // 睫毛
    bmp.blendRect(ex - eyeRx * 1.06, eyeY - eyeRy * 0.86, eyeRx * 0.5, eyeRy * 0.3, '#2c2230', 0.8);
    // 眉毛
    bmp.blendRect(ex - eyeRx * 0.9, eyeY - eyeRy * 1.9, eyeRx * 1.8, eyeRy * 0.22, hairDark, 0.75);
  }
  // 鼻
  bmp.blendRect(cx + headRx * 0.06, eyeY + eyeRy * 1.1, headRx * 0.1, headRy * 0.1, skinShade, 0.7);
  // 嘴
  bmp.blendRect(cx - headRx * 0.12, eyeY + eyeRy * 2.1, headRx * 0.24, headRy * 0.06, '#c0705f', 0.85);
  // 腮红
  bmp.blendEllipse(cx - headRx * 0.62, eyeY + eyeRy * 1.5, headRx * 0.2, headRy * 0.12, '#e58f7e', 0.4);
  bmp.blendEllipse(cx + headRx * 0.62, eyeY + eyeRy * 1.5, headRx * 0.2, headRy * 0.12, '#e58f7e', 0.4);

  // —— 前层头发：刘海 + 鬓发 ——
  bmp.ellipse(cx, headY - headRy * 0.58, headRx * 1.02, headRy * 0.52, hairMid);
  bmp.blendEllipse(cx - headRx * 0.2, headY - headRy * 0.72, headRx * 0.6, headRy * 0.28, hairLight, 0.55);
  // 刘海发束（锯齿下缘）
  const strands = 5;
  for (let i = 0; i < strands; i += 1) {
    const bx = cx - headRx * 0.92 + (i * headRx * 1.84) / (strands - 1);
    const bh = headRy * (0.5 + (i % 2) * 0.24);
    bmp.polygon(
      [
        [bx - headRx * 0.22, headY - headRy * 0.62],
        [bx + headRx * 0.22, headY - headRy * 0.62],
        [bx + headRx * 0.1, headY - headRy * 0.62 + bh],
        [bx - headRx * 0.1, headY - headRy * 0.62 + bh * 0.86],
      ],
      i % 2 ? hairMid : hairDark,
    );
  }
  // 鬓发
  for (const s of [-1, 1]) {
    bmp.polygon(
      [
        [cx + s * headRx * 0.92, headY - headRy * 0.5],
        [cx + s * headRx * 1.16, headY - headRy * 0.3],
        [cx + s * headRx * 1.1, headY + headRy * 0.9],
        [cx + s * headRx * 0.86, headY + headRy * 0.7],
      ],
      hairMid,
    );
    bmp.blendPolygon(
      [
        [cx + s * headRx * 0.92, headY - headRy * 0.4],
        [cx + s * headRx * 1.02, headY - headRy * 0.24],
        [cx + s * headRx * 0.98, headY + headRy * 0.7],
        [cx + s * headRx * 0.9, headY + headRy * 0.6],
      ],
      hairLight,
      0.4,
    );
  }
  // 发饰
  bmp.rect(cx + headRx * 0.7, headY - headRy * 0.86, headRx * 0.3, headRx * 0.3, PAL.gold);
  bmp.blendRect(cx + headRx * 0.7, headY - headRy * 0.86, headRx * 0.15, headRx * 0.15, PAL.goldLight, 0.9);

  // —— 左侧轮廓光 ——
  bmp.blendPolygon(
    [
      [cx - headRx * 1.02, headY - headRy * 0.5],
      [cx - headRx * 0.86, headY - headRy * 0.5],
      [cx - headRx * 0.86, headY + headRy * 0.6],
      [cx - headRx * 1.0, headY + headRy * 0.5],
    ],
    PAL.cream,
    0.45,
  );
  bmp.blendRect(cx - w * 0.34, shoulderY + 2, w * 0.05, y + h - shoulderY, PAL.cream, 0.25);
}

/**
 * 密封补充包主图。
 * 结构：齿状压封 → 品牌头 → 插画窗 → 名称条 → 出率/张数信息 → 星标 → 齿状压封
 */
export function buildPack(themeName, opts = {}) {
  const t = FOIL[themeName] ?? FOIL.rose;
  const { w, h } = PACK_SIZE;
  const bmp = new Bitmap(w, h, { unit: 1 });
  const crimp = 30;
  const inset = 6;

  // 袋体
  bmp.roundRect(inset, 0, w - inset * 2, h, 22, t.base);
  foilSheen(bmp, inset, crimp, w - inset * 2, h - crimp * 2, t.base, 11);
  // 左右侧壁
  bmp.blendRect(inset, 0, w * 0.16, h, lighten(t.base, 0.4), 0.5);
  bmp.blendRect(w - inset - w * 0.2, 0, w * 0.2, h, darken(t.mid, 0.24), 0.6);

  // 上下压封（带齿）
  for (const [cy, flip] of [
    [0, 1],
    [h - crimp, -1],
  ]) {
    bmp.rect(inset + 4, cy, w - inset * 2 - 8, crimp, t.deep);
    bmp.blendRect(inset + 4, cy + (flip > 0 ? 0 : crimp - 4), w - inset * 2 - 8, 4, darken(t.deep, 0.35), 0.9);
    const teeth = 26;
    for (let i = 0; i < teeth; i += 1) {
      const tx = inset + 8 + (i * (w - inset * 2 - 16)) / teeth;
      bmp.rect(tx, cy + 6, 3, crimp - 12, darken(t.deep, 0.3));
      bmp.rect(tx + 3, cy + 6, 2, crimp - 12, lighten(t.deep, 0.25));
    }
  }

  // 品牌头
  const headY = crimp + 12;
  bmp.rect(inset + 14, headY, w - inset * 2 - 28, 54, PAL.cream);
  bmp.blendRect(inset + 14, headY, w - inset * 2 - 28, 3, PAL.foilSheen, 0.9);
  // 品牌字（用色块示意，真实文本由 DOM 渲染）
  bmp.rect(inset + 26, headY + 16, 120, 9, INK);
  bmp.rect(inset + 26, headY + 32, 84, 6, mix(INK, PAL.cream, 0.45));
  bmp.rect(w - inset - 26 - 40, headY + 14, 40, 26, t.deep);
  bmp.blendRect(w - inset - 26 - 36, headY + 18, 32, 6, PAL.cream, 0.8);

  // 插画窗
  const artX = inset + 22;
  const artY = headY + 70;
  const artW = w - (inset + 22) * 2;
  const artH = 268;
  bmp.rect(artX - 4, artY - 4, artW + 8, artH + 8, PAL.cream);
  bmp.rect(artX - 2, artY - 2, artW + 4, artH + 4, t.deep);
  heroArt(bmp, artX, artY, artW, artH, themeName, 3);
  // 玻璃/箔面反光
  bmp.blendPolygon(
    [
      [artX, artY],
      [artX + artW * 0.24, artY],
      [artX + artW * 0.06, artY + artH],
      [artX, artY + artH],
    ],
    PAL.foilSheen,
    0.2,
  );

  // 名称条
  const nameY = artY + artH + 14;
  bmp.rect(inset + 18, nameY, w - (inset + 18) * 2, 44, PAL.cream);
  bmp.rect(inset + 26, nameY + 10, 150, 10, INK);
  bmp.rect(inset + 26, nameY + 26, 100, 6, mix(INK, PAL.cream, 0.5));
  bmp.rect(w - inset - 18 - 54, nameY + 9, 44, 26, PAL.gold);
  bmp.blendRect(w - inset - 18 - 50, nameY + 13, 36, 8, PAL.goldLight, 0.9);

  // 信息条：张数 / 稀有度
  const infoY = nameY + 54;
  bmp.rect(inset + 18, infoY, w - (inset + 18) * 2, 62, mix(t.deep, PAL.cream, 0.14));
  for (let i = 0; i < 3; i += 1) {
    bmp.rect(inset + 28 + i * 96, infoY + 14, 78, 7, PAL.cream);
    bmp.rect(inset + 28 + i * 96, infoY + 28, 56, 5, mix(PAL.cream, t.deep, 0.45));
    bmp.rect(inset + 28 + i * 96, infoY + 40, 66, 5, mix(PAL.cream, t.deep, 0.55));
  }

  // 星标 + 底部压封上方的稀有度条
  const starY = infoY + 74;
  bmp.rect(w / 2 - 16, starY, 32, 32, PAL.gold);
  bmp.blendRect(w / 2 - 16, starY, 16, 16, PAL.goldLight, 0.95);
  bmp.rect(w / 2 - 16, starY, 32, 3, PAL.goldDeep);
  bmp.rect(w / 2 - 22, starY + 40, 44, 6, mix(PAL.cream, t.deep, 0.3));

  // 外轮廓
  bmp.outline(INK, 1, { diagonals: true, solidThreshold: 140 });
  return bmp;
}

/**
 * 密封整盒主图。
 * 结构：盒盖（受光）+ 正面印刷面（画窗/名称/张数）+ 侧面 + 封条
 */
export function buildBox(themeName, opts = {}) {
  const t = FOIL[themeName] ?? FOIL.sky;
  const { w, h } = BOX_SIZE;
  const bmp = new Bitmap(w, h, { unit: 1 });
  const lidH = h * 0.3;
  const sideW = w * 0.09;

  // 侧面（右侧）
  bmp.rect(w - sideW, 0, sideW, h, darken(t.mid, 0.3));
  bmp.blendRect(w - sideW, 0, 3, h, darken(t.deep, 0.3), 0.7);
  // 正面
  bmp.rect(0, lidH, w - sideW, h - lidH, t.deep);
  // 盒盖
  bmp.rect(0, 0, w, lidH, t.base);
  foilSheen(bmp, 0, 0, w, lidH, t.base, 7);
  bmp.blendRect(0, 0, w, 6, lighten(t.base, 0.55), 0.9);
  bmp.blendRect(0, lidH - 6, w, 6, darken(t.deep, 0.3), 0.85);

  // 正面画窗
  const artX = w * 0.07;
  const artY = lidH + 26;
  const artW = (w - sideW) * 0.46;
  const artH = h - lidH - 62;
  bmp.rect(artX - 4, artY - 4, artW + 8, artH + 8, PAL.cream);
  bmp.rect(artX - 2, artY - 2, artW + 4, artH + 4, darken(t.deep, 0.3));
  heroArt(bmp, artX, artY, artW, artH, themeName, 5);
  bmp.blendPolygon(
    [
      [artX, artY],
      [artX + artW * 0.26, artY],
      [artX + artW * 0.06, artY + artH],
      [artX, artY + artH],
    ],
    PAL.foilSheen,
    0.2,
  );

  // 右侧文字块
  const tx = artX + artW + 26;
  const tw = w - sideW - tx - 26;
  bmp.rect(tx, artY, tw, 22, PAL.cream);
  bmp.rect(tx, artY + 32, tw * 0.7, 8, mix(PAL.cream, t.deep, 0.3));
  bmp.rect(tx, artY + 50, tw * 0.86, 6, mix(PAL.cream, t.deep, 0.45));
  bmp.rect(tx, artY + 64, tw * 0.6, 6, mix(PAL.cream, t.deep, 0.55));
  // 张数徽章
  bmp.rect(tx, artY + 86, 86, 46, PAL.cream);
  bmp.rect(tx + 8, artY + 94, 44, 12, INK);
  bmp.rect(tx + 8, artY + 112, 66, 6, mix(INK, PAL.cream, 0.5));
  // 稀有度色条
  bmp.rect(tx, artY + 144, tw, 10, PAL.gold);
  bmp.rect(tx, artY + 160, tw * 0.5, 8, mix(PAL.cream, t.deep, 0.4));

  // 封条（跨过盒盖与正面）
  bmp.blendRect(w * 0.5 - 14, 0, 28, h, alpha(PAL.cream, 1), 0.92);
  bmp.blendRect(w * 0.5 - 14, 0, 5, h, PAL.goldLight, 0.9);
  bmp.blendRect(w * 0.5 + 10, 0, 4, h, darken(PAL.cream, 0.2), 0.7);

  bmp.outline(INK, 1, { diagonals: true, solidThreshold: 140 });
  return bmp;
}
