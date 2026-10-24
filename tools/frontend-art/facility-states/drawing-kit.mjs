// deliverables/playability-v3/FAST-03/src/drawing-kit.mjs
// 统一像素绘制原语与道具部件。全函数保持纯函数/无外部状态。
import { mix } from '../pixkit.mjs';
import { C } from './palette.mjs';

export function createKit(canvas) {
  return {
    r: (x, y, w, h, color) => canvas.rect(Math.round(x * 2), Math.round(y * 2), Math.round(w * 2), Math.round(h * 2), color),
    e: (x, y, rx, ry, color) => canvas.ellipse(Math.round(x * 2), Math.round(y * 2), Math.round(rx * 2), Math.round(ry * 2), color),
    d: (x, y, color) => canvas.px(Math.round(x * 2), Math.round(y * 2), color),
  };
}

export function contactShadow(k, w, h, rx = null, ry = 3) {
  const rX = rx !== null ? rx : Math.max(1, w / 2 - 1);
  k.e(w / 2, h - 2, rX, ry, [35, 30, 40, 50]);
}

export function panel(k, x, y, w, h, c) {
  k.r(x, y, w, h, C.ink);
  k.r(x + 1, y + 1, w - 2, h - 2, c);
  k.r(x + 2, y + 1, w - 4, 0.5, mix(c, '#fff5d8', 0.35));
  k.r(x + w - 2, y + 2, 1, h - 3, mix(c, C.ink, 0.25));
}

export function wood(k, x, y, w, h, c = C.wood) {
  panel(k, x, y, w, h, c);
  for (let yy = y + 3; yy < y + h - 2; yy += 4) {
    k.r(x + 2, yy, w - 4, 0.5, mix(c, C.ink, 0.12));
    for (let xx = x + 4; xx < x + w - 4; xx += 13) {
      k.r(xx, yy + 1, 6, 0.5, mix(c, C.edge, 0.18));
    }
  }
}

export function packItem(k, x, y, c, w = 6, h = 10) {
  panel(k, x, y, w, h, c);
  k.r(x + 1, y + 1, w - 2, 1, C.gold);
  k.r(x + 1, y + h - 2, w - 2, 0.5, C.cream);
  k.r(x + w / 2 - 1, y + 3, 2, 3, C.cream);
  k.d(x + w / 2, y + 4, C.gold);
}

export function boxItem(k, x, y, c, w = 14, h = 10) {
  panel(k, x, y, w, h, c);
  k.r(x + 1, y + 1, w - 2, 2, mix(c, C.ink, 0.3));
  k.r(x + 1, y + 3, w - 2, 0.5, mix(c, '#fff5d8', 0.4));
  k.r(x + w / 2 - 0.5, y + 1, 1, h - 2, mix(c, '#fff5d8', 0.5));
  k.r(x + 2, y + h - 4, 4, 2.5, C.cream);
  k.d(x + 3, y + h - 3.5, C.gold);
}

export function cardItem(k, x, y, c, w = 5, h = 7) {
  k.r(x, y, w, h, C.white);
  k.r(x + 1, y + 1, w - 2, h - 4, c);
  k.r(x + 1, y + h - 2, w - 2, 0.5, mix(c, C.ink, 0.4));
}

// 统一等级角标/铭牌：在设施指定位置画出等级 I、II、III 徽记或金属环
export function drawTierMarker(k, x, y, level, primaryColor = C.gold) {
  if (level <= 0) return;
  const w = 10, h = 5;
  k.r(x, y, w, h, C.ink);
  k.r(x + 0.5, y + 0.5, w - 1, h - 1, primaryColor);
  const cx = x + w / 2, cy = y + h / 2;
  if (level === 1) {
    // [I]
    k.r(cx - 0.5, cy - 1.5, 1, 3, C.ink);
  } else if (level === 2) {
    // [II]
    k.r(cx - 2, cy - 1.5, 1, 3, C.ink);
    k.r(cx + 1, cy - 1.5, 1, 3, C.ink);
  } else if (level >= 3) {
    // [III]
    k.r(cx - 3, cy - 1.5, 1, 3, C.ink);
    k.r(cx - 0.5, cy - 1.5, 1, 3, C.ink);
    k.r(cx + 2, cy - 1.5, 1, 3, C.ink);
  }
}
