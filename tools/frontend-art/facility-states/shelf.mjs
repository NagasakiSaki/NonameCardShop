// deliverables/playability-v3/FAST-03/src/shelf.mjs
// 货架等级 0～3 与库存状态（空/低/充足）纯绘制实现。
// 尺寸固定 64×56 world px（128×112 canvas px，ART_SCALE=2）。
// 原点 (0,0)，footY=56，blocks=[[0, 40, 64, 16]]，严格保持既有碰撞。
import { mix } from '../pixkit.mjs';
import { C } from './palette.mjs';
import { createKit, panel, wood, packItem, boxItem, cardItem, contactShadow, drawTierMarker } from './drawing-kit.mjs';

export const SHELF_META = {
  w: 64,
  h: 56,
  footY: 56,
  blocks: [[0, 40, 64, 16]],
  stand: [32, 62],
  occludes: true,
  family: 'shelf',
};

// 1. 柜体骨架（随等级 0～3 演进，尺寸和碰撞恒定）
function paintShelfChassis(k, level) {
  contactShadow(k, 64, 56, 0.9, 3);

  if (level === 0) {
    // Level 0: 基础原木货架
    wood(k, 0, 0, 64, 54, '#87735c');
    k.r(4, 4, 56, 45, C.dark);
    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 15;
      k.r(3, y + 12, 58, 3, C.edge);
      k.r(7, y + 13, 8, 1, C.cream);
    }
    // 底座支脚
    k.r(2, 52, 5, 3, C.ink);
    k.r(57, 52, 5, 3, C.ink);

  } else if (level === 1) {
    // Level 1: 加宽青铜加固架（深暖栗木 + 青铜角件 + 双价签条）
    wood(k, 0, 0, 64, 54, C.woodChestnut);
    k.r(4, 4, 56, 45, '#3b3537');
    // 青铜侧柱加固
    k.r(1, 4, 2, 46, C.bronzeDark);
    k.r(61, 4, 2, 46, C.bronzeDark);
    k.d(2, 5, C.bronze);
    k.d(61, 5, C.bronze);
    k.d(2, 48, C.bronze);
    k.d(61, 48, C.bronze);

    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 15;
      k.r(3, y + 12, 58, 3, C.bronze);
      k.r(3, y + 12, 58, 0.5, mix(C.bronze, '#ffffff', 0.3));
      k.r(6, y + 13, 10, 1, C.cream);
      k.r(48, y + 13, 10, 1, C.cream);
    }
    // 顶部青铜铭牌 [I]
    drawTierMarker(k, 27, 1, 1, C.bronze);
    k.r(2, 52, 6, 3, C.woodDark);
    k.r(56, 52, 6, 3, C.woodDark);

  } else if (level === 2) {
    // Level 2: 红木精工展示架（暗红木 + 银灰立柱 + 分隔槽 + 蓝宝石标牌）
    wood(k, 0, 0, 64, 54, C.woodMahogany);
    k.r(4, 4, 56, 45, '#302c34');
    // 中部分隔立轨
    k.r(31.5, 4, 1, 44, mix(C.woodMahogany, C.ink, 0.3));
    // 银色立柱
    k.r(1, 3, 3, 48, C.silverDark);
    k.r(2, 4, 1, 46, C.silverLight);
    k.r(60, 3, 3, 48, C.silverDark);
    k.r(61, 4, 1, 46, C.silverLight);

    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 15;
      // 银色层架前沿
      k.r(3, y + 12, 58, 3, C.silver);
      k.r(3, y + 12, 58, 0.5, C.silverLight);
      // 模块化价签格
      k.r(6, y + 13, 12, 1, C.paper);
      k.r(22, y + 13, 8, 1, C.paper);
      k.r(36, y + 13, 12, 1, C.paper);
      k.r(52, y + 13, 8, 1, C.paper);
    }
    // 顶部银质铭牌 [II] 带微型蓝宝石
    drawTierMarker(k, 27, 1, 2, C.silver);
    k.d(25, 2.5, C.blue);
    k.d(38, 2.5, C.blue);
    k.r(2, 52, 6, 3, C.ink);
    k.r(56, 52, 6, 3, C.ink);

  } else if (level >= 3) {
    // Level 3: 黑檀鎏金大师展架（乌木 + 金顶冠线 + 靛蓝丝绒背板 + 暖光导轨 + 金皇冠铭牌）
    wood(k, 0, 0, 64, 54, C.woodEbony);
    // 顶部鎏金冠檐
    k.r(0, 0, 64, 4, C.goldDark);
    k.r(0, 1, 64, 1.5, C.goldLight);
    k.d(0, 0, C.gold);
    k.d(63, 0, C.gold);
    // 奢华靛蓝丝绒背板
    k.r(4, 4, 56, 45, '#262438');

    // 左右鎏金浮雕柱
    k.r(1, 4, 3, 47, C.goldDark);
    k.r(2, 4, 1, 46, C.gold);
    k.r(60, 4, 3, 47, C.goldDark);
    k.r(61, 4, 1, 46, C.gold);

    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 15;
      // 层板下方微弱暖色洗墙光带
      k.r(4, y + 1, 56, 1, [255, 240, 200, 45]);
      // 鎏金护沿
      k.r(3, y + 12, 58, 3, C.gold);
      k.r(3, y + 12, 58, 0.5, C.goldLight);
      // 豪华金标价签
      k.r(6, y + 13, 14, 1, C.cream);
      k.r(34, y + 13, 14, 1, C.cream);
      k.d(22, y + 13.5, C.goldDark);
      k.d(50, y + 13.5, C.goldDark);
    }
    // 顶部皇冠徽记 [III]
    drawTierMarker(k, 27, 0.5, 3, C.goldLight);
    k.d(32, 0, '#c2503c'); // 红宝石顶心
    // 鎏金包边底足
    k.r(2, 52, 6, 3, C.goldDark);
    k.r(2, 52, 6, 1, C.gold);
    k.r(56, 52, 6, 3, C.goldDark);
    k.r(56, 52, 6, 1, C.gold);
  }
}

// 2. 库存陈列叠层（纯参数化叠层：empty / low / full）
function paintShelfStock(k, level, stock) {
  if (stock === 'empty') {
    // 空架状态：展现整洁的货架层板与空余价签，不画虚假货品
    return;
  }

  if (stock === 'low') {
    // 低库存状态：稀疏陈列（顶部 2 包，中部 1 盒 1 包，底部少量商品）
    packItem(k, 8, 5, C.foil[0], 6, 11);
    packItem(k, 16, 5, C.foil[2], 6, 11);

    boxItem(k, 24, 20, '#83859b', 14, 10);
    packItem(k, 44, 20, C.foil[3], 6, 11);

    // 底部空旷散落感
    if (level >= 2) {
      // 高级货架低库存时陈列在精品亚克力托架上
      panel(k, 12, 35, 12, 10, '#35434d');
      cardItem(k, 15, 36, C.rose, 6, 8);
    } else {
      k.r(10, 36, 6, 0.5, mix(C.dark, C.ink, 0.3));
      k.r(40, 36, 8, 0.5, mix(C.dark, C.ink, 0.3));
    }
    return;
  }

  if (stock === 'full') {
    // 充足库存：紧凑而整齐的饱满陈列
    for (let row = 0; row < 3; row++) {
      const y = 5 + row * 15;
      for (let col = 0; col < 7; col++) {
        const c = C.foil[(row + col) % 4];
        if (row === 1 && col % 2 === 0) {
          boxItem(k, 6 + col * 7.5, y + 1, '#83859b', 7, 10);
        } else {
          packItem(k, 6 + col * 7.5, y, c, 6, 11);
        }
      }
    }

    // 高等级特权：Lv2/3 补充顶部限定卡盒与高阶反光条纹
    if (level >= 2) {
      boxItem(k, 26, 21, '#a8586c', 12, 9);
    }
  }
}

// 纯绘制入口：传入 level (0..3) 和 stock ('empty' | 'low' | 'full')
export function paintShelf(canvas, { level = 0, stock = 'empty' } = {}) {
  const k = createKit(canvas);
  paintShelfChassis(k, level);
  paintShelfStock(k, level, stock);
  return canvas;
}
