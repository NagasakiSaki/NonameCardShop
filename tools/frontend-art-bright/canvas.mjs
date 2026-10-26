// canvas.mjs — 明亮二次元卡店的绘制核。
// 与正式 tools/frontend-art/pixkit.mjs 平行存在，不覆盖正式素材管线。
//
// 坐标约定：所有绘制 API 接受「世界像素」浮点坐标（1 world px = 16 逻辑网格 px 的地图单位）。
// 内部按 ART_SCALE 换算成原生像素栅格，因此 0.25 world px 即 1 原生 px，
// 足以表达柜面厚度、玻璃高光、木纹走向等旧版 192 单元格表达不了的结构。

export const ART_SCALE = 4;

const HEX_CACHE = new Map();

export function rgba(value) {
  if (Array.isArray(value)) return value;
  let c = HEX_CACHE.get(value);
  if (c) return c;
  const m = /^#?([0-9a-f]{6})([0-9a-f]{2})?$/i.exec(value);
  if (!m) throw new Error('不支持的颜色: ' + value);
  const n = parseInt(m[1], 16);
  c = [(n >> 16) & 255, (n >> 8) & 255, n & 255, m[2] ? parseInt(m[2], 16) : 255];
  HEX_CACHE.set(value, c);
  return c;
}

export function mix(a, b, t) {
  const ca = rgba(a);
  const cb = rgba(b);
  return [
    Math.round(ca[0] + (cb[0] - ca[0]) * t),
    Math.round(ca[1] + (cb[1] - ca[1]) * t),
    Math.round(ca[2] + (cb[2] - ca[2]) * t),
    Math.round(ca[3] + (cb[3] - ca[3]) * t),
  ];
}

export const lighten = (c, t) => mix(c, [255, 255, 255, rgba(c)[3]], t);
export const darken = (c, t) => mix(c, [0, 0, 0, rgba(c)[3]], t);
export const alpha = (c, a) => {
  const x = rgba(c);
  return [x[0], x[1], x[2], Math.round(a * 255)];
};

/** 确定性哈希 → [0,1)。用于颗粒、木纹抖动，保证同参数必然复现。 */
export function hash(x, y, seed = 1) {
  let h = (x | 0) * 374761393 + (y | 0) * 668265263 + (seed | 0) * 1442695040;
  h = (h ^ (h >>> 13)) * 1274126177;
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}

/** 2×2 有序抖动阈值，用于柔和的接触阴影与光晕（避免大块半透明糊成一片）。 */
const BAYER2 = [
  [0.125, 0.625],
  [0.875, 0.375],
];
const BAYER4 = [
  [0, 8, 2, 10],
  [12, 4, 14, 6],
  [3, 11, 1, 9],
  [15, 7, 13, 5],
];

export class Bitmap {
  /**
   * unit：1 世界像素对应多少原生像素。默认 ART_SCALE（场景素材）；
   * 大尺寸包装主图这类"本来就是原生像素"的图传 unit:1，避免坐标被再乘 4。
   */
  constructor(w, h, opts = {}) {
    this.w = w;
    this.h = h;
    this.unit = opts.unit ?? ART_SCALE;
    this.data = new Uint8ClampedArray(w * h * 4);
  }

  static from(img) {
    const out = new Bitmap(img.w, img.h, { unit: img.unit });
    out.data.set(img.data);
    return out;
  }

  clone() {
    return Bitmap.from(this);
  }

  inside(x, y) {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }

  /** 坐标 → 原生像素（四舍五入）。 */
  sx(v) {
    return Math.round(v * this.unit);
  }

  raw(x, y, color) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const c = rgba(color);
    const i = (y * this.w + x) * 4;
    this.data[i] = c[0];
    this.data[i + 1] = c[1];
    this.data[i + 2] = c[2];
    this.data[i + 3] = c[3];
    return this;
  }

  px(xw, yw, color) {
    return this.raw(this.sx(xw), this.sx(yw), color);
  }

  /** 源覆盖混合（用于阴影、高光、玻璃）。 */
  blendRaw(x, y, color, k = 1) {
    x |= 0;
    y |= 0;
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return this;
    const c = rgba(color);
    const a = Math.max(0, Math.min(1, (c[3] / 255) * k));
    if (a <= 0) return this;
    const i = (y * this.w + x) * 4;
    const da = this.data[i + 3] / 255;
    const outA = a + da * (1 - a);
    if (outA <= 0) return this;
    for (let n = 0; n < 3; n += 1) {
      this.data[i + n] = (c[n] * a + this.data[i + n] * da * (1 - a)) / outA;
    }
    this.data[i + 3] = outA * 255;
    return this;
  }

  blend(xw, yw, color, k = 1) {
    return this.blendRaw(this.sx(xw), this.sx(yw), color, k);
  }

  alphaAtRaw(x, y) {
    if (x < 0 || y < 0 || x >= this.w || y >= this.h) return 0;
    return this.data[(y * this.w + x) * 4 + 3];
  }

  alphaAt(xw, yw) {
    return this.alphaAtRaw(this.sx(xw), this.sx(yw));
  }

  // ---------- 基础图元（世界坐标）----------

  rect(x, y, w, h, color) {
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    const x1 = this.sx(x + w);
    const y1 = this.sx(y + h);
    const c = rgba(color);
    for (let yy = Math.min(y0, y1); yy < Math.max(y0, y1); yy += 1) {
      for (let xx = Math.min(x0, x1); xx < Math.max(x0, x1); xx += 1) this.raw(xx, yy, c);
    }
    return this;
  }

  blendRect(x, y, w, h, color, k = 1) {
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    const x1 = this.sx(x + w);
    const y1 = this.sx(y + h);
    for (let yy = Math.min(y0, y1); yy < Math.max(y0, y1); yy += 1) {
      for (let xx = Math.min(x0, x1); xx < Math.max(x0, x1); xx += 1) this.blendRaw(xx, yy, color, k);
    }
    return this;
  }

  /** 圆角矩形；r 以世界像素计。 */
  roundRect(x, y, w, h, r, color) {
    const c = rgba(color);
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    const x1 = this.sx(x + w);
    const y1 = this.sx(y + h);
    const rr = Math.max(0, this.sx(r));
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        if (rr > 0) {
          const cx = xx < x0 + rr ? x0 + rr : xx >= x1 - rr ? x1 - rr - 1 : xx;
          const cy = yy < y0 + rr ? y0 + rr : yy >= y1 - rr ? y1 - rr - 1 : yy;
          if (cx !== xx || cy !== yy) {
            const dx = xx - cx;
            const dy = yy - cy;
            if (dx * dx + dy * dy > rr * rr) continue;
          }
        }
        this.raw(xx, yy, c);
      }
    }
    return this;
  }

  ellipse(cx, cy, rx, ry, color) {
    const c = rgba(color);
    const CX = this.sx(cx);
    const CY = this.sx(cy);
    const RX = Math.max(1, this.sx(rx));
    const RY = Math.max(1, this.sx(ry));
    for (let yy = CY - RY; yy <= CY + RY; yy += 1) {
      for (let xx = CX - RX; xx <= CX + RX; xx += 1) {
        const dx = (xx - CX) / RX;
        const dy = (yy - CY) / RY;
        if (dx * dx + dy * dy <= 1.0) this.raw(xx, yy, c);
      }
    }
    return this;
  }

  blendEllipse(cx, cy, rx, ry, color, k = 1) {
    const CX = this.sx(cx);
    const CY = this.sx(cy);
    const RX = Math.max(1, this.sx(rx));
    const RY = Math.max(1, this.sx(ry));
    for (let yy = CY - RY; yy <= CY + RY; yy += 1) {
      for (let xx = CX - RX; xx <= CX + RX; xx += 1) {
        const dx = (xx - CX) / RX;
        const dy = (yy - CY) / RY;
        if (dx * dx + dy * dy <= 1.0) this.blendRaw(xx, yy, color, k);
      }
    }
    return this;
  }

  /** 半椭圆（家具底面投影用）：只画下半部分，视觉上贴地。 */
  ellipseBottom(cx, cy, rx, ry, color, k = 1) {
    const CX = this.sx(cx);
    const CY = this.sx(cy);
    const RX = Math.max(1, this.sx(rx));
    const RY = Math.max(1, this.sx(ry));
    for (let yy = CY; yy <= CY + RY; yy += 1) {
      for (let xx = CX - RX; xx <= CX + RX; xx += 1) {
        const dx = (xx - CX) / RX;
        const dy = (yy - CY) / RY;
        if (dx * dx + dy * dy <= 1.0) this.blendRaw(xx, yy, color, k);
      }
    }
    return this;
  }

  /** 扫描线填充多边形。pts = [[x,y], ...] 世界坐标。 */
  polygon(pts, color) {
    const P = pts.map(([x, y]) => [this.sx(x), this.sx(y)]);
    const c = rgba(color);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of P) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += 1) {
      const xs = [];
      for (let i = 0; i < P.length; i += 1) {
        const [x1, y1] = P[i];
        const [x2, y2] = P[(i + 1) % P.length];
        if (y1 === y2) continue;
        if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x += 1) this.raw(x, y, c);
      }
    }
    return this;
  }

  blendPolygon(pts, color, k = 1) {
    const P = pts.map(([x, y]) => [this.sx(x), this.sx(y)]);
    let minY = Infinity;
    let maxY = -Infinity;
    for (const [, y] of P) {
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
    for (let y = Math.floor(minY); y <= Math.ceil(maxY); y += 1) {
      const xs = [];
      for (let i = 0; i < P.length; i += 1) {
        const [x1, y1] = P[i];
        const [x2, y2] = P[(i + 1) % P.length];
        if (y1 === y2) continue;
        if ((y >= y1 && y < y2) || (y >= y2 && y < y1)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
      xs.sort((a, b) => a - b);
      for (let i = 0; i + 1 < xs.length; i += 2) {
        for (let x = Math.round(xs[i]); x < Math.round(xs[i + 1]); x += 1) this.blendRaw(x, y, color, k);
      }
    }
    return this;
  }

  /** 世界坐标直线；thickness 以世界像素计。 */
  line(x1, y1, x2, y2, color, thickness = 0.25) {
    const X1 = this.sx(x1);
    const Y1 = this.sx(y1);
    const X2 = this.sx(x2);
    const Y2 = this.sx(y2);
    const t = Math.max(1, Math.round(thickness * this.unit));
    const dx = Math.abs(X2 - X1);
    const dy = Math.abs(Y2 - Y1);
    const sx = X1 < X2 ? 1 : -1;
    const sy = Y1 < Y2 ? 1 : -1;
    let err = dx - dy;
    let x = X1;
    let y = Y1;
    const c = rgba(color);
    for (let guard = 0; guard < 100000; guard += 1) {
      const half = Math.floor(t / 2);
      for (let oy = -half; oy <= half; oy += 1) {
        for (let ox = -half; ox <= half; ox += 1) this.raw(x + ox, y + oy, c);
      }
      if (x === X2 && y === Y2) break;
      const e2 = 2 * err;
      if (e2 > -dy) {
        err -= dy;
        x += sx;
      }
      if (e2 < dx) {
        err += dx;
        y += sy;
      }
    }
    return this;
  }

  /** 竖向渐变填充矩形（世界坐标）。 */
  vGradient(x, y, w, h, top, bottom) {
    const y0 = this.sx(y);
    const y1 = this.sx(y + h);
    for (let yy = y0; yy < y1; yy += 1) {
      const t = (yy - y0) / Math.max(1, y1 - y0 - 1);
      this.rect(x, yy / this.unit, w, 1 / this.unit, mix(top, bottom, t));
    }
    return this;
  }

  /** 横向渐变填充矩形。 */
  hGradient(x, y, w, h, left, right) {
    const x0 = this.sx(x);
    const x1 = this.sx(x + w);
    for (let xx = x0; xx < x1; xx += 1) {
      const t = (xx - x0) / Math.max(1, x1 - x0 - 1);
      this.rect(xx / this.unit, y, 1 / this.unit, h, mix(left, right, t));
    }
    return this;
  }

  /** 在已有不透明像素上做竖向渐变（保留 alpha 形状）。 */
  shadeMaskV(y, h, top, bottom) {
    const y0 = this.sx(y);
    const y1 = this.sx(y + h);
    for (let yy = y0; yy < y1; yy += 1) {
      const t = (yy - y0) / Math.max(1, y1 - y0 - 1);
      const c = mix(top, bottom, t);
      for (let xx = 0; xx < this.w; xx += 1) {
        if (this.alphaAtRaw(xx, yy) > 0) this.blendRaw(xx, yy, c, 0.5);
      }
    }
    return this;
  }

  /** 4×4 Bayer 有序抖动半透明填充：像素画里最稳的柔和过渡。 */
  ditherRect(x, y, w, h, color, density = 0.5) {
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    const x1 = this.sx(x + w);
    const y1 = this.sx(y + h);
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        const t = BAYER4[((yy % 4) + 4) % 4][((xx % 4) + 4) % 4] / 16;
        if (t < density) this.blendRaw(xx, yy, color, 1);
      }
    }
    return this;
  }

  /** 抖动椭圆（接触阴影/光晕），带软边。 */
  ditherEllipse(cx, cy, rx, ry, color, density = 0.6, softness = 0.35) {
    const CX = this.sx(cx);
    const CY = this.sx(cy);
    const RX = Math.max(1, this.sx(rx));
    const RY = Math.max(1, this.sx(ry));
    for (let yy = CY - RY; yy <= CY + RY; yy += 1) {
      for (let xx = CX - RX; xx <= CX + RX; xx += 1) {
        const dx = (xx - CX) / RX;
        const dy = (yy - CY) / RY;
        const d = dx * dx + dy * dy;
        if (d > 1) continue;
        const fall = 1 - Math.sqrt(d);
        const k = fall < softness ? fall / softness : 1;
        const t = BAYER4[((yy % 4) + 4) % 4][((xx % 4) + 4) % 4] / 16;
        if (t < density * k) this.blendRaw(xx, yy, color, 1);
      }
    }
    return this;
  }

  /**
   * 平滑软边椭圆。4× 原生密度下不再需要有序抖动，
   * 直接做径向 alpha 衰减：下采样后没有可见的棋盘纹理，阴影更干净。
   */
  softEllipse(cx, cy, rx, ry, color, strength = 1, power = 1.9) {
    const CX = this.sx(cx);
    const CY = this.sy0(cy);
    const RX = Math.max(1, this.sx(rx));
    const RY = Math.max(1, this.sx(ry));
    const c = rgba(color);
    for (let yy = CY - RY; yy <= CY + RY; yy += 1) {
      for (let xx = CX - RX; xx <= CX + RX; xx += 1) {
        const dx = (xx - CX) / RX;
        const dy = (yy - CY) / RY;
        const d = Math.sqrt(dx * dx + dy * dy);
        if (d >= 1) continue;
        const a = Math.pow(1 - d, power) * strength * (c[3] / 255);
        this.blendRaw(xx, yy, [c[0], c[1], c[2], 255], a);
      }
    }
    return this;
  }

  sy0(v) {
    return this.sx(v);
  }

  /** 只覆盖已有不透明像素的抖动（给物体内部加高光/污渍而不越界）。 */
  ditherMask(x, y, w, h, color, density = 0.3) {
    const x0 = this.sx(x);
    const y0 = this.sx(y);
    const x1 = this.sx(x + w);
    const y1 = this.sx(y + h);
    for (let yy = y0; yy < y1; yy += 1) {
      for (let xx = x0; xx < x1; xx += 1) {
        if (this.alphaAtRaw(xx, yy) === 0) continue;
        const t = BAYER4[((yy % 4) + 4) % 4][((xx % 4) + 4) % 4] / 16;
        if (t < density) this.blendRaw(xx, yy, color, 1);
      }
    }
    return this;
  }

  /**
   * 给不透明剪影加描边；不覆盖已有像素。
   * solidThreshold：只有 alpha 达到该值的像素才算"实体"，
   * 这样软阴影不会被当成实体再套一圈轮廓，只会在实体边缘留下一条接触线。
   */
  outline(color, thickness = 0.25, { diagonals = true, solidThreshold = 128 } = {}) {
    const steps = Math.max(1, Math.round(thickness * this.unit));
    for (let pass = 0; pass < steps; pass += 1) {
      const targets = [];
      for (let y = 0; y < this.h; y += 1) {
        for (let x = 0; x < this.w; x += 1) {
          if (this.alphaAtRaw(x, y) >= solidThreshold) continue;
          let near = false;
          for (let dy = -1; dy <= 1 && !near; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              if (!diagonals && dx !== 0 && dy !== 0) continue;
              if (this.alphaAtRaw(x + dx, y + dy) >= solidThreshold) {
                near = true;
                break;
              }
            }
          }
          if (near) targets.push([x, y]);
        }
      }
      for (const [x, y] of targets) this.raw(x, y, color);
    }
    return this;
  }

  /** 在剪影内侧加一圈暗边（内描边），让物体边缘更"立"起来。 */
  innerShade(color, thickness = 0.25, k = 0.5) {
    const steps = Math.max(1, Math.round(thickness * this.unit));
    for (let pass = 0; pass < steps; pass += 1) {
      const targets = [];
      for (let y = 0; y < this.h; y += 1) {
        for (let x = 0; x < this.w; x += 1) {
          if (this.alphaAtRaw(x, y) === 0) continue;
          let edge = false;
          for (let dy = -1; dy <= 1 && !edge; dy += 1) {
            for (let dx = -1; dx <= 1; dx += 1) {
              if (dx === 0 && dy === 0) continue;
              if (this.alphaAtRaw(x + dx, y + dy) === 0) {
                edge = true;
                break;
              }
            }
          }
          if (edge) targets.push([x, y]);
        }
      }
      for (const [x, y] of targets) this.blendRaw(x, y, color, k);
    }
    return this;
  }

  blit(src, dxw = 0, dyw = 0, { flipX = false, alphaK = 1 } = {}) {
    const dx = this.sx(dxw);
    const dy = this.sx(dyw);
    for (let y = 0; y < src.h; y += 1) {
      for (let x = 0; x < src.w; x += 1) {
        const sxx = flipX ? src.w - 1 - x : x;
        const i = (y * src.w + sxx) * 4;
        if (src.data[i + 3] === 0) continue;
        const c = [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]];
        if (alphaK >= 1) this.raw(dx + x, dy + y, c);
        else this.blendRaw(dx + x, dy + y, c, alphaK);
      }
    }
    return this;
  }

  /** 只在不透明像素上叠加另一张图（用于给家具加光斑而不越界）。 */
  blitMasked(src, dxw = 0, dyw = 0, alphaK = 1) {
    const dx = this.sx(dxw);
    const dy = this.sx(dyw);
    for (let y = 0; y < src.h; y += 1) {
      for (let x = 0; x < src.w; x += 1) {
        const i = (y * src.w + x) * 4;
        if (src.data[i + 3] === 0) continue;
        const tx = dx + x;
        const ty = dy + y;
        if (this.alphaAtRaw(tx, ty) === 0) continue;
        this.blendRaw(tx, ty, [src.data[i], src.data[i + 1], src.data[i + 2], src.data[i + 3]], alphaK);
      }
    }
    return this;
  }

  /** 整体调色映射（夜色/黄昏变体用）。 */
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

  /** 最近邻整数放大，只用于导出对照图。 */
  scale(factor) {
    if (!Number.isInteger(factor) || factor < 1) throw new Error('放大倍数必须是正整数');
    const out = new Bitmap(this.w * factor, this.h * factor);
    for (let y = 0; y < out.h; y += 1) {
      for (let x = 0; x < out.w; x += 1) {
        const si = (((y / factor) | 0) * this.w + ((x / factor) | 0)) * 4;
        const di = (y * out.w + x) * 4;
        out.data[di] = this.data[si];
        out.data[di + 1] = this.data[si + 1];
        out.data[di + 2] = this.data[si + 2];
        out.data[di + 3] = this.data[si + 3];
      }
    }
    return out;
  }

  /** 按目标尺寸裁剪/贴合（用于把不同尺寸道具塞进统一单元格）。 */
  cropTo(w, h, ox = 0, oy = 0) {
    const out = new Bitmap(w, h);
    for (let y = 0; y < h; y += 1) {
      for (let x = 0; x < w; x += 1) {
        const sx = x + ox;
        const sy = y + oy;
        if (sx < 0 || sy < 0 || sx >= this.w || sy >= this.h) continue;
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

  bounds() {
    let x0 = this.w;
    let y0 = this.h;
    let x1 = -1;
    let y1 = -1;
    for (let y = 0; y < this.h; y += 1) {
      for (let x = 0; x < this.w; x += 1) {
        if (this.data[(y * this.w + x) * 4 + 3] === 0) continue;
        if (x < x0) x0 = x;
        if (y < y0) y0 = y;
        if (x > x1) x1 = x;
        if (y > y1) y1 = y;
      }
    }
    return x1 < 0 ? { x: 0, y: 0, w: 0, h: 0 } : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
  }

  opaquePixels() {
    let n = 0;
    for (let i = 3; i < this.data.length; i += 4) if (this.data[i] !== 0) n += 1;
    return n;
  }

  colorCount() {
    const set = new Set();
    for (let i = 0; i < this.data.length; i += 4) {
      if (this.data[i + 3] === 0) continue;
      set.add(`${this.data[i]},${this.data[i + 1]},${this.data[i + 2]}`);
    }
    return set.size;
  }
}

export function compose(width, height, placements, bg = null) {
  const sheet = new Bitmap(width, height);
  if (bg) sheet.rect(0, 0, width, height, bg);
  for (const p of placements) sheet.blit(p.img, p.x, p.y);
  return sheet;
}
