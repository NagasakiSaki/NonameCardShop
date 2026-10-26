// fx.mjs — 灯光与投影贴图。夜间不再靠整屏压黑，而是靠光晕与暖光点亮柜台。
import { Bitmap, mix, alpha } from './canvas.mjs';
import { PAL } from './palette.mjs';

/** 柔和径向光晕：中心暖白、外缘完全透明，中心不糊成一团白斑。 */
export function buildGlow(size = 256) {
  const bmp = new Bitmap(size, size);
  const c = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - c) / c;
      const dy = (y - c) / c;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      // 三段衰减：近心亮、中段缓、外缘快速消失
      const fall = Math.pow(1 - d, 2.2);
      const k = fall * 0.82;
      const col = mix(PAL.lampCore, PAL.lampWarm, Math.min(1, d * 1.4));
      bmp.raw(x, y, alpha(col, k));
    }
  }
  return bmp;
}

/** 柔和椭圆投影。 */
export function buildBlobShadow(size = 128) {
  const bmp = new Bitmap(size, size);
  const cx = size / 2;
  const cy = size / 2;
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const dx = (x - cx) / cx;
      const dy = (y - cy) / cy;
      const d = Math.sqrt(dx * dx + dy * dy);
      if (d >= 1) continue;
      const fall = Math.pow(1 - d, 2.6);
      bmp.raw(x, y, alpha('#4b3a31', fall * 0.42));
    }
  }
  return bmp;
}

/** 阳光光柱（窗口投射用，作为可叠加装饰层）。 */
export function buildSunShaft(w = 256, h = 512) {
  const bmp = new Bitmap(w, h);
  for (let y = 0; y < h; y += 1) {
    const k = y / h;
    for (let x = 0; x < w; x += 1) {
      const u = x / w;
      // 越往下越宽、越淡
      const spread = 0.18 + k * 0.42;
      const center = 0.5 + (u - 0.5) * 0.4;
      const edge = Math.abs(u - center) / spread;
      if (edge >= 1) continue;
      const a = Math.pow(1 - edge, 1.8) * (1 - k) * 0.5;
      bmp.raw(x, y, alpha(PAL.sunWarm, a));
    }
  }
  return bmp;
}
