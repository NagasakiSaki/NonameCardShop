// deliverables/playability-v3/FAST-03/src/showcase.mjs
// 珍藏展示柜等级 0 与 1 对照纯绘制实现。
// 尺寸固定 48×64 world px（96×128 canvas px，ART_SCALE=2）。
// 原点 (0,0)，footY=64，blocks=[[2, 48, 44, 16]]，严格保持既有碰撞。
import { mix } from '../pixkit.mjs';
import { C } from './palette.mjs';
import { createKit, panel, wood, cardItem, contactShadow } from './drawing-kit.mjs';

export const SHOWCASE_META = {
  w: 48,
  h: 64,
  footY: 64,
  blocks: [[2, 48, 44, 16]],
  stand: [24, 70],
  occludes: true,
  family: 'showcase',
};

// 纯绘制入口：传入 level (0 | 1)
export function paintShowcase(canvas, { level = 0 } = {}) {
  const k = createKit(canvas);
  contactShadow(k, 48, 64, 0.9, 3);

  if (level === 0) {
    // Level 0: 未购预留展位（整洁的预留展台基座 + 防尘深色绒布立台 + 黄铜预留标识）
    // 明确提示玩家此处为珍藏展示柜升级位，不画不存在的展示卡或空气收益
    wood(k, 2, 46, 44, 15, C.woodLight);
    k.r(4, 48, 40, 2, C.edge);
    k.r(4, 58, 40, 2, C.woodDark);

    // 展位立柱与预留背板
    panel(k, 6, 14, 36, 32, '#483f3e');
    k.r(8, 16, 32, 28, '#2d2526');

    // 预留位置的深红丝绒垫台
    panel(k, 10, 24, 28, 16, '#5a2d38');
    k.r(12, 26, 24, 12, '#3e1e26');
    k.r(12, 26, 24, 1, '#7a3e4c');

    // 黄铜预留铭牌 "VIP 展位 · 待扩建"
    panel(k, 12, 38, 24, 8, C.goldDark);
    k.r(13, 39, 22, 6, C.gold);
    k.r(15, 41, 18, 2, C.ink);
    k.d(24, 42, C.goldLight);

    // 展位两侧的立式防护立柱
    k.r(4, 18, 3, 30, C.bronzeDark);
    k.r(5, 16, 1, 32, C.bronze);
    k.d(5, 14, C.gold);
    k.r(41, 18, 3, 30, C.bronzeDark);
    k.r(42, 16, 1, 32, C.bronze);
    k.d(42, 14, C.gold);

  } else {
    // Level 1: 已购珍藏展示柜（完整华丽金框玻璃双层展示柜 + 内嵌暖光灯带）
    panel(k, 0, 4, 48, 58, C.goldDark);
    k.r(0, 0, 48, 5, mix(C.goldDark, '#ffe5a3', 0.3));
    k.r(0, 2, 48, 1, '#ffe5a3');

    // 上层展示舱（内衬深色背景与暖光漫射）
    panel(k, 4, 10, 40, 24, '#3a3230');
    k.r(5, 11, 38, 22, mix('#f3e0b0', '#ffe9bd', 0.2));
    for (let i = 0; i < 3; i++) {
      cardItem(k, 9 + i * 12, 15, [C.rose, C.blue, C.gold][i]);
      // 展示卡底座小金托
      k.r(9 + i * 12, 22, 5, 1, C.goldDark);
    }
    k.r(6, 12, 36, 1, mix('#ffe9bd', '#ffffff', 0.5));

    // 下层展示舱
    panel(k, 4, 36, 40, 22, '#3a3230');
    k.r(5, 37, 38, 20, mix('#f3e0b0', '#ffe9bd', 0.2));
    for (let i = 0; i < 3; i++) {
      cardItem(k, 9 + i * 12, 41, [C.green, C.purple, C.rose][i]);
      k.r(9 + i * 12, 48, 5, 1, C.goldDark);
    }

    // 中间隔板与玻璃斜光
    k.r(4, 33, 40, 3, C.woodDark);
    k.r(6, 12, 8, 0.5, mix(C.glassLight, '#ffffff', 0.4));
    k.r(7, 13, 6, 0.5, mix(C.glassLight, '#ffffff', 0.25));
    k.r(6, 38, 8, 0.5, mix(C.glassLight, '#ffffff', 0.4));

    // 底座与金质底脚（中部微凹弧度，露出真实地面接触阴影）
    k.r(4, 59, 40, 2, C.woodDark);
    k.r(3, 61, 6, 2, C.goldDark);
    k.r(39, 61, 6, 2, C.goldDark);
  }

  return canvas;
}
