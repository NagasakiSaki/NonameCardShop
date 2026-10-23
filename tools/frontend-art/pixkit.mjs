// tools/frontend-art/pixkit.mjs — 手写像素绘图核：RGBA 画布、受限调色板、确定性噪声。
// 所有素材都由这里的逐像素操作生成，不依赖任何绘图库；同参数必然复现。

export const PALETTE = {
  ink: "#20182a",
  inkSoft: "#3a2d47",

  skinLight: "#f7d3ab",
  skin: "#e5ac7c",
  skinShade: "#c07d4d",
  blush: "#e58f7e",

  hairBrown: "#8a5230",
  hairBrownLight: "#b37a4a",
  hairBlack: "#2d2637",
  hairBlackLight: "#4a4159",
  hairBlonde: "#e9c67a",
  hairBlondeLight: "#f6dfa8",
  hairRed: "#b05138",
  hairRedLight: "#d4735a",
  hairSilver: "#cbd0dc",
  hairSilverLight: "#e8ecf4",

  clothRed: "#c2503c",
  clothRedLight: "#e07a62",
  clothBlue: "#3d5c96",
  clothBlueLight: "#5b80c2",
  clothGreen: "#4a7654",
  clothGreenLight: "#6c9c70",
  clothMustard: "#c19a48",
  clothMustardLight: "#dbb96a",
  clothPurple: "#6a4988",
  clothPurpleLight: "#8d68ac",
  clothCream: "#e8dfc8",
  clothCreamLight: "#f6f0e0",
  clothGray: "#8b8b98",
  clothGrayLight: "#adb0bd",
  clothTeal: "#3d7a78",
  clothTealLight: "#5a9c96",

  apron: "#e6dfcd",
  apronShade: "#c8bda4",
  strap: "#7a5236",

  wood: "#9a6f4a",
  woodLight: "#b98a5f",
  woodDark: "#74502f",
  woodDeep: "#573a24",

  wall: "#e4d7ba",
  wallShade: "#c3b294",
  wainscot: "#8a6242",
  wainscotShade: "#6b4a30",

  carpet: "#7c3f4a",
  carpetLight: "#9a5058",
  carpetTrim: "#e0c98c",

  metal: "#b8bec9",
  metalShade: "#7d8494",
  gold: "#e8b64a",
  goldShade: "#b3862a",

  white: "#f7f4ec",
  glass: "#9fd2da",
  glassShade: "#6fa9b6",

  leaf: "#4f8757",
  leafLight: "#74ab6d",

  night: "#1d2340",
  warmLamp: "#ffd27a",
};

const HEX = new Map();
export function parseColor(value) {
  if (Array.isArray(value)) return value;
  let c = HEX.get(value);
  if (c) return c;
  const m = /^#?([0-9a-f]{6})$/i.exec(value);
  if (!m) throw new Error("颜色格式不支持: " + value);
  const n = parseInt(m[1], 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, 255];
  HEX.set(value, c);
  return c;
}

export function mix(a, b, t) {
  const ca = parseColor(a);
  const cb = parseColor(b);
  return [
    Math.round(ca[0] + (cb[0] - ca[0]) * t),
    Math.round(ca[1] + (cb[1] - ca[1]) * t),
    Math.round(ca[2] + (cb[2] - ca[2]) * t),
    Math.round(ca[3] + (cb[3] - ca[3]) * t),
  ];
}

export function shade(color, amount) {
  const c = parseColor(color);
  if (amount >= 0) return mix(c, [255, 255, 255, c[3]], amount);
  return mix(c, [0, 0, 0, c[3]], -amount);
}

export function withAlpha(color, alpha) {
  const c = parseColor(color);
  return [c[0], c[1], c[2], Math.round(c[3] * alpha)];
}

/** 稳定哈希 → [0,1)，用于颗粒与抖动，不引入随机状态。 */
export function hash2(x, y, seed = 1) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 2147483647;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 周期噪声：周期 16 的整数格噪声，保证 16×16 瓦片左右上下无缝。 */
export function tileNoise(x, y, seed = 7, period = 16) {
  return hash2(((x % period) + period) % period, ((y % period) + period) % period, seed);
}

export class Img {
  constructor(width, height) {
    this.w = width;
    this.h = height;
    this.data = new Uint8ClampedArray(width * height * 4);
  }

  clone() {
    const copy = new Img(this.w, this.h);
    copy.data.set(this.data);
    return copy;
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** 直接覆盖（含 alpha），像素画的硬边都靠它。 */
  px(x, y, color) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return this;
    const c = parseColor(color);
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
    return this;
  }

  /** 叠加混合，用于阴影/光晕/抗锯齿边缘。 */
  blend(x, y, color, alpha = 1) {
    x |= 0; y |= 0;
    if (!this.inside(x, y)) return this;
    const c = parseColor(color);
    const a = Math.max(0, Math.min(1, (c[3] / 255) * alpha));
    if (a <= 0) return this;
    const i = (y * this.w + x) * 4;
    const src = [c[0], c[1], c[2]];
    const da = this.data[i + 3] / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return this;
    for (let k = 0; k < 3; k += 1) {
      this.data[i + k] = (src[k] * a + this.data[i + k] * da * (1 - a)) / outA;
    }
    this.data[i + 3] = outA * 255;
    return this;
  }

  alphaAt(x, y) {
    if (!this.inside(x, y)) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  rect(x, y, w, h, color) {
    for (let yy = y; yy < y + h; yy += 1) for (let xx = x; xx < x + w; xx += 1) this.px(xx, yy, color);
    return this;
  }

  hline(x0, x1, y, color) {
    for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x += 1) this.px(x, y, color);
    return this;
  }

  vline(x, y0, y1, color) {
    for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y += 1) this.px(x, y, color);
    return this;
  }

  ellipse(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        const dx = (x - cx) / (rx || 0.001);
        const dy = (y - cy) / (ry || 0.001);
        if (dx * dx + dy * dy <= 1.02) this.px(x, y, color);
      }
    }
    return this;
  }

  /** 只有落在已有不透明像素上的椭圆填充（用于头发/衣物覆盖，不吃掉轮廓）。 */
  ellipseOnMask(cx, cy, rx, ry, color) {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y += 1) {
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x += 1) {
        if (this.alphaAt(x, y) === 0) continue;
        const dx = (x - cx) / (rx || 0.001);
        const dy = (y - cy) / (ry || 0.001);
        if (dx * dx + dy * dy <= 1.02) this.px(x, y, color);
      }
    }
    return this;
  }

  /** 给不透明剪影加一圈描边；不覆盖已有像素。 */
  outline(color, { diagonals = false } = {}) {
    const targets = [];
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (this.alphaAt(x, y) !== 0) continue;
        let near = false;
        for (let dy = -1; dy <= 1 && !near; dy += 1) {
          for (let dx = -1; dx <= 1; dx += 1) {
            if (dx === 0 && dy === 0) continue;
            if (!diagonals && dx !== 0 && dy !== 0) continue;
            if (this.alphaAt(x + dx, y + dy) !== 0) { near = true; break; }
          }
        }
        if (near) targets.push([x, y]);
      }
    }
    for (const [x, y] of targets) this.px(x, y, color);
    return this;
  }

  /** 把不透明像素整体换成调色映射结果（用于夜色版本）。 */
  mapColors(fn) {
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      const out = fn([this.data[i], this.data[i + 1], this.data[i + 2], this.data[i + 3]]);
      this.data[i] = out[0];
      this.data[i + 1] = out[1];
      this.data[i + 2] = out[2];
      this.data[i + 3] = out[3];
    }
    return this;
  }

  blit(src, dx, dy, { flipX = false } = {}) {
    for (let y = 0; y < src.h; y += 1) {
      for (let x = 0; x < src.w; x += 1) {
        const sx = flipX ? src.w - 1 - x : x;
        const i = (y * src.w + sx) * 4;
        if (src.data[i + 3] === 0) continue;
        this.px(dx + x, dy + y, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]]);
      }
    }
    return this;
  }

  colors() {
    const set = new Set();
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      set.add("#" + [this.data[i], this.data[i + 1], this.data[i + 2]].map((v) => v.toString(16).padStart(2, "0")).join(""));
    }
    return [...set].sort();
  }

  /** 最近邻放大，只允许整数倍。 */
  scale(factor) {
    if (!Number.isInteger(factor) || factor < 1) throw new Error("放大倍数必须是正整数");
    const out = new Img(this.w * factor, this.h * factor);
    for (let y = 0; y < out.h; y += 1) {
      for (let x = 0; x < out.w; x += 1) {
        const sx = (x / factor) | 0;
        const sy = (y / factor) | 0;
        const si = (sy * this.w + sx) * 4;
        const di = (y * out.w + x) * 4;
        out.data[di] = this.data[si];
        out.data[di + 1] = this.data[si + 1];
        out.data[di + 2] = this.data[si + 2];
        out.data[di + 3] = this.data[si + 3];
      }
    }
    return out;
  }
}

/** 把若干 Img 拼进一张图集。 */
export function compose(width, height, placements) {
  const sheet = new Img(width, height);
  for (const p of placements) sheet.blit(p.img, p.x, p.y);
  return sheet;
}

export function sheetFromGrid(frames, cols, frameW, frameH) {
  const rows = Math.ceil(frames.length / cols);
  const sheet = new Img(cols * frameW, rows * frameH);
  frames.forEach((frame, index) => {
    sheet.blit(frame, (index % cols) * frameW, Math.floor(index / cols) * frameH);
  });
  return sheet;
}
