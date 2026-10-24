// deliverables/playability-v3/FAST-03/src/registry.mjs
// FAST-03 设施等级与状态素材全量注册表（共 32 种样式）。
// 严格遵循 ART_SCALE=2（1 world px = 2 canvas px），原点、碰撞与站位固定不变。
import { Img } from '../pixkit.mjs';
import { paintShelf, SHELF_META } from './shelf.mjs';
import { paintShowcase, SHOWCASE_META } from './showcase.mjs';
import { paintTable, TABLE_META } from './table.mjs';
import { paintCashierCounter, paintStockerCounter, STAFF_COUNTER_META } from './staff.mjs';

export const ART_SCALE = 2;

// 构造 32 项设施状态条目
export const FACILITY_STATES = [];

// 1. 货架 (shelf): 等级 0～3 × 库存 (empty, low, full) = 12 项
const SHELF_LEVELS = [
  { level: 0, name: '基础货架', desc: '经典原木商用货架' },
  { level: 1, name: '加宽货架·青铜', desc: '深栗木加固架，青铜角件与双价签' },
  { level: 2, name: '精工货架·红木', desc: '红木展示架，铝合金层沿与蓝宝石标牌' },
  { level: 3, name: '奢华展架·鎏金', desc: '黑檀鎏金大师展架，丝绒背板与皇冠徽标' },
];

const SHELF_STOCKS = [
  { stock: 'empty', name: '空架', desc: '陈列结构与价签整洁显露' },
  { stock: 'low', name: '低库存', desc: '顶部少量卡包与单盒陈列' },
  { stock: 'full', name: '充足', desc: '三层紧凑饱满的卡包与密封盒' },
];

for (const l of SHELF_LEVELS) {
  for (const s of SHELF_STOCKS) {
    const key = `shelf_lv${l.level}_${s.stock}`;
    FACILITY_STATES.push({
      key,
      family: 'shelf',
      level: l.level,
      state: s.stock,
      w: SHELF_META.w,
      h: SHELF_META.h,
      canvasW: SHELF_META.w * ART_SCALE,
      canvasH: SHELF_META.h * ART_SCALE,
      footY: SHELF_META.footY,
      blocks: SHELF_META.blocks,
      stand: SHELF_META.stand,
      occludes: SHELF_META.occludes,
      depth: 'y',
      label: `货架·Lv${l.level} (${l.name}) · ${s.name}`,
      description: `${l.desc}；${s.desc}`,
      officialTargetKey: `pa_shelf_lv${l.level}_${s.stock}`,
      paint: (canvas) => paintShelf(canvas, { level: l.level, stock: s.stock }),
    });
  }
}

// 2. 珍藏展示柜 (showcase): 等级 0 (未购预留) 与 等级 1 (已购展柜) = 2 项
FACILITY_STATES.push({
  key: 'showcase_lv0_unbought',
  family: 'showcase',
  level: 0,
  state: 'unbought',
  w: SHOWCASE_META.w,
  h: SHOWCASE_META.h,
  canvasW: SHOWCASE_META.w * ART_SCALE,
  canvasH: SHOWCASE_META.h * ART_SCALE,
  footY: SHOWCASE_META.footY,
  blocks: SHOWCASE_META.blocks,
  stand: SHOWCASE_META.stand,
  occludes: SHOWCASE_META.occludes,
  depth: 'y',
  label: '展示柜·未购预留位 (Lv0)',
  description: '木质预留展位基台与深红丝绒防尘垫，带有“VIP 展位 · 待扩建”黄铜铭牌，明确等待升级',
  officialTargetKey: 'pa_showcase_lv0_unbought',
  paint: (canvas) => paintShowcase(canvas, { level: 0 }),
});

FACILITY_STATES.push({
  key: 'showcase_lv1_bought',
  family: 'showcase',
  level: 1,
  state: 'bought',
  w: SHOWCASE_META.w,
  h: SHOWCASE_META.h,
  canvasW: SHOWCASE_META.w * ART_SCALE,
  canvasH: SHOWCASE_META.h * ART_SCALE,
  footY: SHOWCASE_META.footY,
  blocks: SHOWCASE_META.blocks,
  stand: SHOWCASE_META.stand,
  occludes: SHOWCASE_META.occludes,
  depth: 'y',
  label: '珍藏展示柜·已购展出 (Lv1)',
  description: '完整双层金框玻璃展柜，内嵌柔和暖光射灯与 6 张保护壳珍稀单卡，吸引高预算新客',
  officialTargetKey: 'pa_showcase_lv1_bought',
  paint: (canvas) => paintShowcase(canvas, { level: 1 }),
});

// 3. 牌桌 (table): 等级 0～2 × 状态 (idle, reserved, sim, end) = 12 项
const TABLE_LEVELS = [
  { level: 0, name: '标准原木桌', desc: '清新森林绿桌布，基础桌号牌' },
  { level: 1, name: '竞技联赛桌', desc: '青铜包角，深海蓝桌布与对战银线' },
  { level: 2, name: 'VIP 典藏桌', desc: '深红木鎏金角花，典藏酒红绒布与金箔战区' },
];

const TABLE_STATES = [
  { state: 'idle', name: '空闲', desc: '桌布整齐干净，收纳牌盒就位' },
  { state: 'reserved', name: '预留', desc: '中央立有预约三角立牌与预约凭证' },
  { state: 'sim', name: '模拟中', desc: '双方卡牌出击交战、指示物与生命指示骰子' },
  { state: 'end', name: '结束短反馈', desc: '收拢牌堆、结算战报条与支付的开桌服务费金币' },
];

for (const l of TABLE_LEVELS) {
  for (const s of TABLE_STATES) {
    const key = `table_lv${l.level}_${s.state}`;
    FACILITY_STATES.push({
      key,
      family: 'table',
      level: l.level,
      state: s.state,
      w: TABLE_META.w,
      h: TABLE_META.h,
      canvasW: TABLE_META.w * ART_SCALE,
      canvasH: TABLE_META.h * ART_SCALE,
      footY: TABLE_META.footY,
      blocks: TABLE_META.blocks,
      stand: TABLE_META.stand,
      occludes: TABLE_META.occludes,
      depth: 'y',
      label: `牌桌·Lv${l.level} (${l.name}) · ${s.name}`,
      description: `${l.desc}；${s.desc}`,
      officialTargetKey: `pa_table_lv${l.level}_${s.state}`,
      paint: (canvas) => paintTable(canvas, { level: l.level, state: s.state }),
    });
  }
}

// 4. 收银与补货员工柜台 (staff): cashier (3 状态) + stocker (3 状态) = 6 项
const STAFF_STATUSES = [
  { state: 'unhired', name: '未雇佣', desc: '设备关闭待机，设有“岗位空缺”招募木牌与灰色指示灯' },
  { state: 'onduty', name: '当班', desc: '亮屏运行中，营业绿灯常亮，工作用具与待办物齐备' },
  { state: 'resting', name: '休息', desc: '暖橙休眠灯常亮，立有“轮休中”亚克力标牌与个人茶杯' },
];

for (const s of STAFF_STATUSES) {
  const key = `cashier_${s.state}`;
  FACILITY_STATES.push({
    key,
    family: 'cashier',
    level: s.state === 'unhired' ? 0 : 1,
    state: s.state,
    w: STAFF_COUNTER_META.w,
    h: STAFF_COUNTER_META.h,
    canvasW: STAFF_COUNTER_META.w * ART_SCALE,
    canvasH: STAFF_COUNTER_META.h * ART_SCALE,
    footY: STAFF_COUNTER_META.footY,
    blocks: STAFF_COUNTER_META.blocks,
    stand: STAFF_COUNTER_META.stand,
    occludes: STAFF_COUNTER_META.occludes,
    depth: 'y',
    label: `收银台 · ${s.name}`,
    description: `收银机柜台展示：${s.desc}`,
    officialTargetKey: `pa_counter_cashier_${s.state}`,
    paint: (canvas) => paintCashierCounter(canvas, { state: s.state }),
  });
}

for (const s of STAFF_STATUSES) {
  const key = `stocker_${s.state}`;
  FACILITY_STATES.push({
    key,
    family: 'stocker',
    level: s.state === 'unhired' ? 0 : 1,
    state: s.state,
    w: STAFF_COUNTER_META.w,
    h: STAFF_COUNTER_META.h,
    canvasW: STAFF_COUNTER_META.w * ART_SCALE,
    canvasH: STAFF_COUNTER_META.h * ART_SCALE,
    footY: STAFF_COUNTER_META.footY,
    blocks: STAFF_COUNTER_META.blocks,
    stand: STAFF_COUNTER_META.stand,
    occludes: STAFF_COUNTER_META.occludes,
    depth: 'y',
    label: `补货台 · ${s.name}`,
    description: `库管入库工作台展示：${s.desc}`,
    officialTargetKey: `pa_counter_stocker_${s.state}`,
    paint: (canvas) => paintStockerCounter(canvas, { state: s.state }),
  });
}

// 快速按 key 渲染指定设施状态
export function renderFacilityState(key) {
  const entry = FACILITY_STATES.find((e) => e.key === key);
  if (!entry) throw new Error('未知的设施状态 key: ' + key);
  const canvas = new Img(entry.canvasW, entry.canvasH);
  entry.paint(canvas);
  return { canvas, meta: entry };
}
