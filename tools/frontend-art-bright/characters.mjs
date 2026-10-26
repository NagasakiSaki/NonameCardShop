// characters.mjs — 把旧的 LPC 特殊人物模型（25 个 bd-* + 店主）适配到新画风。
//
// 约束（来自交接包）：不改名字对应外观、不重画人物身份、保留已认可的方向/摆臂/步态。
// 因此这里**不做重绘**，只做"风格再调色 + 打光统一 + 描边统一"：
//   1. 对比/饱和/暖色温重映射 —— 去掉旧图"发灰褪色"的观感；
//   2. 方向光：左上受光、右下压暗，与家具"主光左上"的约定一致
//      （旧 LPC 是平光，这是它和场景最不协调的地方）；
//   3. 统一 1 原生像素暖褐外描边，和家具共用同一条轮廓色；
//   4. 脚下内阴影，让角色踩在地面上。
//
// 输出保持原帧结构（64×64 / 8 列 / 4 行），帧尺寸、锚点、动画列全部不变。

import fs from 'node:fs';
import path from 'node:path';
import { Bitmap } from './canvas.mjs';
import { decodePng } from './png.mjs';

const INK = [0x4a, 0x37, 0x28];
const RIM = [0xff, 0xf1, 0xd8];
const AO = [0x4a, 0x2f, 0x1c];

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);

/** 不透明像素是否贴着透明像素（= 剪影边缘）。 */
function isEdge(bmp, x, y) {
  if (bmp.alphaAtRaw(x, y) === 0) return false;
  for (let dy = -1; dy <= 1; dy += 1) {
    for (let dx = -1; dx <= 1; dx += 1) {
      if (dx === 0 && dy === 0) continue;
      if (bmp.alphaAtRaw(x + dx, y + dy) === 0) return true;
    }
  }
  return false;
}

/** 某个方向上是否为透明（越界算透明）。 */
function openAt(bmp, x, y, dx, dy) {
  return bmp.alphaAtRaw(x + dx, y + dy) === 0;
}

/**
 * 对一张角色图集做风格适配。
 * @param {Uint8ClampedArray} rgba
 * @param {number} w @param {number} h
 */
export function regradeSheet(rgba, w, h, opts = {}) {
  const contrast = opts.contrast ?? 1.24;
  const saturation = opts.saturation ?? 1.08;
  const warmK = opts.warmK ?? 0.2;
  const rimK = opts.rimK ?? 0.3;
  const aoK = opts.aoK ?? 0.32;
  const outline = opts.outline !== false;
  const footShadow = opts.footShadow ?? 0.14;

  const out = new Bitmap(w, h, { unit: 1 });
  out.data.set(rgba);

  // ---- 1) 对比 / 饱和 / 暖色温 ----
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] === 0) continue;
    let r = out.data[i];
    let g = out.data[i + 1];
    let b = out.data[i + 2];

    r = clamp((r - 128) * contrast + 128, 0, 255);
    g = clamp((g - 128) * contrast + 128, 0, 255);
    b = clamp((b - 128) * contrast + 128, 0, 255);

    const l = 0.299 * r + 0.587 * g + 0.114 * b;
    r = clamp(l + (r - l) * saturation, 0, 255);
    g = clamp(l + (g - l) * saturation, 0, 255);
    b = clamp(l + (b - l) * saturation, 0, 255);

    // 暗部往暖棕、亮部往奶油（保持色相，只移动色温）
    const shadowK = clamp((150 - l) / 150, 0, 1) ** 1.3 * warmK;
    const lightK = clamp((l - 178) / 77, 0, 1) * warmK * 0.7;
    r = r * (1 - shadowK) + 0x6b * shadowK;
    g = g * (1 - shadowK) + 0x46 * shadowK;
    b = b * (1 - shadowK) + 0x30 * shadowK;
    r = r * (1 - lightK) + RIM[0] * lightK;
    g = g * (1 - lightK) + RIM[1] * lightK;
    b = b * (1 - lightK) + RIM[2] * lightK;

    out.data[i] = r;
    out.data[i + 1] = g;
    out.data[i + 2] = b;
  }

  // ---- 2) 方向光：左上轮廓提亮、右下轮廓压暗 ----
  // 先把边缘坐标收集起来，避免边改边判断。
  const edges = [];
  for (let y = 0; y < h; y += 1) {
    for (let x = 0; x < w; x += 1) {
      if (isEdge(out, x, y)) edges.push([x, y]);
    }
  }
  for (const [x, y] of edges) {
    const i = (y * w + x) * 4;
    const lit = openAt(out, x, y, -1, -1) || openAt(out, x, y, -1, 0) || openAt(out, x, y, 0, -1);
    const dark = openAt(out, x, y, 1, 1) || openAt(out, x, y, 1, 0) || openAt(out, x, y, 0, 1);
    if (lit) {
      out.data[i] = out.data[i] * (1 - rimK) + RIM[0] * rimK;
      out.data[i + 1] = out.data[i + 1] * (1 - rimK) + RIM[1] * rimK;
      out.data[i + 2] = out.data[i + 2] * (1 - rimK) + RIM[2] * rimK;
    } else if (dark) {
      out.data[i] = out.data[i] * (1 - aoK) + AO[0] * aoK;
      out.data[i + 1] = out.data[i + 1] * (1 - aoK) + AO[1] * aoK;
      out.data[i + 2] = out.data[i + 2] * (1 - aoK) + AO[2] * aoK;
    }
  }

  // ---- 3) 统一 1px 暖褐外描边（与家具同一条轮廓色）----
  if (outline) {
    const targets = [];
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        if (out.alphaAtRaw(x, y) !== 0) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            if (out.alphaAtRaw(x + dx, y + dy) !== 0) {
              near = true;
              break;
            }
          }
        }
        if (near) targets.push([x, y]);
      }
    }
    for (const [x, y] of targets) {
      const i = (y * w + x) * 4;
      out.data[i] = INK[0];
      out.data[i + 1] = INK[1];
      out.data[i + 2] = INK[2];
      out.data[i + 3] = 255;
    }
  }

  // ---- 4) 脚下内阴影 ----
  const frameW = opts.frameWidth ?? 64;
  const frameH = opts.frameHeight ?? 64;
  for (let fy = 0; fy + frameH <= h; fy += frameH) {
    for (let fx = 0; fx + frameW <= w; fx += frameW) {
      for (let row = 0; row < 3; row += 1) {
        const y = fy + frameH - 1 - row;
        const k = footShadow * (1 - row / 3);
        for (let x = fx; x < fx + frameW; x += 1) {
          const i = (y * w + x) * 4;
          if (out.data[i + 3] === 0) continue;
          out.data[i] *= 1 - k;
          out.data[i + 1] *= 1 - k;
          out.data[i + 2] *= 1 - k * 0.8;
        }
      }
    }
  }

  return out;
}

/** 读正式图集 → 适配 → 返回 Bitmap（不写任何正式文件）。 */
export function adaptCharacterSheet(projectRoot, sheetUrl, opts = {}) {
  const file = path.join(projectRoot, '.' + sheetUrl);
  const decoded = decodePng(fs.readFileSync(file));
  return regradeSheet(decoded.rgba, decoded.width, decoded.height, opts);
}

/** 找出所有 LPC 风格（64×64 帧）的角色 id。 */
export function listLpcCharacters(manifest) {
  const ids = [];
  for (const [id, entry] of Object.entries(manifest.characters)) {
    if (entry.frameWidth === 64 && entry.frameHeight === 64 && entry.columns === 8) ids.push(id);
  }
  return ids;
}
