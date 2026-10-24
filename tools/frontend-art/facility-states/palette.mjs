// deliverables/playability-v3/FAST-03/src/palette.mjs
// 统一调色板：与 tools/frontend-art/facilities.mjs 及 props-v2.mjs 调色保持严格一致，
// 补充设施等级阶梯与员工状态指示色。

export const C = {
  // 结构墨线与基色
  ink: '#303345',
  inkSoft: '#46495d',
  dark: '#433d3f',
  slate: '#465364',

  // 木料阶梯（用于等级 0～3 柜体演进）
  pine: '#a8895f',        // 松木（轻质/原木）
  wood: '#806651',        // 标准暖胡桃木（Lv0 基准）
  woodLight: '#967963',   // 亮胡桃木
  woodDark: '#5d5148',    // 阴影胡桃木
  woodChestnut: '#735742',// 栗木（Lv1 强化架）
  woodMahogany: '#593e32',// 红木（Lv2 高级架）
  woodEbony: '#3e2e2a',   // 黑檀/深乌木（Lv3 奢华架）
  edge: '#c3a27a',        // 木边倒角高光

  // 金银金属阶梯（用于等级与尊贵装饰）
  gold: '#e5bd72',
  goldDark: '#a8823e',
  goldLight: '#ffe5a3',
  silver: '#c2cad4',
  silverDark: '#8a97a6',
  silverLight: '#eef2f7',
  bronze: '#ba8555',
  bronzeDark: '#8c5f35',

  // 桌面绒布（等级 0～2 牌桌演进）
  matGreen: '#567b73',      // Lv0: 标准清新森林绿
  matGreenDark: '#3e5e57',
  matBlue: '#3d6175',       // Lv1: 竞技深海蓝
  matBlueDark: '#294352',
  matCrimson: '#663345',    // Lv2: VIP 典藏酒红
  matCrimsonDark: '#47212e',

  // 包装与单卡专用色
  cream: '#f3e8cd',
  paper: '#f5efdd',
  white: '#f7f4ec',
  glass: '#91c4c6',
  glassLight: '#c2e2e0',
  teal: '#568883',
  green: '#4e8a6a',
  greenSoft: '#8fbf9a',
  blue: '#5c7490',
  rose: '#b87880',
  purple: '#807293',
  mint: '#9ed4c2',

  // 闪卡镭射色盘
  foil: ['#c56876', '#c3a264', '#749fa8', '#8e85ad'],

  // 员工状态指示色（仅工作台标识，非真实小人行为）
  dutyGreen: '#4fb87c',     // 当班：亮绿灯/绿标牌
  dutyGreenDark: '#2d6d48',
  restingAmber: '#e8a043',  // 休息：暖橙/琥珀标牌
  restingAmberDark: '#8a5c21',
  unhiredGray: '#6e7487',   // 空缺/未雇佣：暗灰蓝
  unhiredGrayDark: '#444857',
};
