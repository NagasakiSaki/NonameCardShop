// palette.mjs — 明亮二次元卡店专用色板。
// 与正式工程 assets/frontend/manifest.json 的 palette 并列存在，不覆盖正式色板。
// 设计约束：奶油白/浅原木为基底，朱红/浅金/薄荷/淡蓝作强调；避免深棕与黑紫占据大面积。

export const PAL = {
  // —— 轮廓与墨色：暖褐黑，不用纯黑，避免"暗色古董铺"观感 ——
  ink: '#453226',
  inkSoft: '#5d4634',
  inkLight: '#7d6450',
  inkLine: '#4a3728',

  // —— 地面：浅橡木 / 浅灰石 / 分区薄荷 ——
  floorOakLight: '#e9cd9c',
  floorOak: '#dcb884',
  floorOakMid: '#cda66e',
  floorOakDark: '#b68b52',
  floorOakSeam: '#9c7242',
  floorOakSheen: '#fff1d8',
  floorStoneLight: '#dccfb6',
  floorStone: '#cdbfa3',
  floorStoneMid: '#bcac8f',
  floorStoneSeam: '#a5957a',
  floorMintLight: '#ddf2e5',
  floorMint: '#c3e4d1',
  floorMintMid: '#a8d2bb',
  floorMintSeam: '#8bbc9f',
  floorTatami: '#e9dfae',
  floorTatamiSeam: '#c9bc84',

  // —— 墙面 ——
  wallCream: '#fdf6e8',
  wallCreamShade: '#f4e6cd',
  wallCreamDeep: '#e6d2b0',
  wallPaper: '#fcf2df',
  wallPaperLine: '#eeddc0',
  wainscot: '#d8b184',
  wainscotLight: '#eac99d',
  wainscotShade: '#bb8d5d',
  wainscotSeam: '#986b41',
  skirting: '#c49f6c',
  wallShadow: '#d3bc98',

  // —— 木材（浅原木为主，中间调加深以保证结构可读）——
  woodPale: '#f2dcb4',
  woodLight: '#e3bd86',
  wood: '#d0a367',
  woodMid: '#b9884e',
  woodDark: '#96683a',
  woodDeep: '#744c29',
  woodGrain: '#a67d4e',
  woodHighlight: '#fbeed4',

  // —— 纸与布 ——
  cream: '#fffdf7',
  paper: '#fbf2e0',
  paperShade: '#efdfc2',
  paperLine: '#dfcba6',
  clothMint: '#8ecfb4',
  clothMintDeep: '#63ab8d',
  clothSky: '#9ec9e8',
  clothSkyDeep: '#71a4cd',
  clothRose: '#f0a8ae',
  clothRoseDeep: '#d47f88',
  clothLilac: '#c3aee2',
  clothLilacDeep: '#9d85c6',
  clothButter: '#f6dc98',
  clothButterDeep: '#dfb95f',
  clothSlate: '#9cadbb',
  clothSlateDeep: '#77899a',

  // —— 强调色 ——
  vermilion: '#d95e68',
  vermilionDeep: '#b0424c',
  vermilionLight: '#f08d95',
  gold: '#efc070',
  goldDeep: '#cfa043',
  goldLight: '#fbe3a8',
  mint: '#7ec3a9',
  mintDeep: '#54987e',
  mintLight: '#c0e6d7',
  sky: '#8bbde4',
  skyDeep: '#5f97c5',
  skyLight: '#cbe2f5',
  lilac: '#b39ed8',
  lilacDeep: '#8b73b6',
  leaf: '#6fae7e',
  leafDeep: '#4e8b60',
  leafLight: '#a3d3a6',

  // —— 材质 ——
  metal: '#c8d0d8',
  metalLight: '#eef2f6',
  metalMid: '#a9b3be',
  metalDeep: '#7f8a97',
  glass: '#cfeaf0',
  glassMid: '#a8d6e0',
  glassDeep: '#7cb9c8',
  glassSheen: '#f4fdff',
  foil: '#f7f2e6',
  foilSheen: '#ffffff',
  velvet: '#e2aaad',
  velvetDeep: '#c6858a',

  // —— 状态色（只用于边框/角标/短标签，不铺面）——
  okGreen: '#5da57f',
  okGreenDeep: '#3f8161',
  warnAmber: '#dda245',
  warnAmberDeep: '#b67f28',
  stopRose: '#d05f64',
  stopRoseDeep: '#a4444a',
  infoSky: '#5f9ac6',
  vipPurple: '#8f72bd',
  vipPurpleDeep: '#6f5599',

  // —— 经营游戏式的暖光对比：琥珀亮部 / 深棕阴影 ——
  amber: '#e9a447',
  amberDeep: '#c8812f',
  amberLight: '#ffd68a',
  lanternRed: '#d2563f',
  lanternRedDeep: '#a63c2b',
  deepShadow: '#4a2f1c',
  deepShadowSoft: '#6b4630',

  // —— 光照 ——
  sunWarm: '#ffe6b0',
  sunCool: '#dfeeff',
  lampWarm: '#ffd88a',
  lampCore: '#fff4d2',
  duskOrange: '#ffb877',
  nightBlue: '#6f8fc4',
  nightDeep: '#3a4a72',
};

/** 包色：密封包装的主题色。足够区分主题，但不过度饱和以免整屏花。 */
export const FOIL = {
  rose: { base: '#f3a7ae', mid: '#dd818c', deep: '#b95d6b', band: '#fff6ef' },
  sky: { base: '#a3cbe9', mid: '#7fadd4', deep: '#5c8cb6', band: '#f7fbff' },
  mint: { base: '#93d0b6', mid: '#6fb498', deep: '#4e9179', band: '#f6fffb' },
  butter: { base: '#f6dc95', mid: '#e2be63', deep: '#bd9642', band: '#fffdf3' },
  lilac: { base: '#c2ade2', mid: '#a189c9', deep: '#7c66a6', band: '#fcf9ff' },
  slate: { base: '#aabbc8', mid: '#8b9fb0', deep: '#6b8093', band: '#f8fbfd' },
  coral: { base: '#f7bb9c', mid: '#e09573', deep: '#b8724f', band: '#fff8f2' },
};

export const FOIL_ORDER = ['rose', 'sky', 'mint', 'butter', 'lilac', 'slate', 'coral'];

/** 稀有度边框色：只用于描边与角标。 */
export const RARITY = {
  N: { edge: '#c8c3b6', glow: '#eae5d8' },
  R: { edge: '#7fa8cf', glow: '#c7dcee' },
  SR: { edge: '#a98ccb', glow: '#ddd0ee' },
  SSR: { edge: '#e0b25c', glow: '#f8e4b4' },
};

/** 家具等级色：货架/牌桌升级时结构变化为主，这里只作辅色。 */
export const LEVEL = [
  { accent: '#d2ab74', accentDeep: '#a57b4e', trim: '#e3c496', label: '原木' },
  { accent: '#c9a06a', accentDeep: '#9a7343', trim: '#d9b98b', label: '青铜' },
  { accent: '#c48a76', accentDeep: '#96604f', trim: '#e0b3a2', label: '红木' },
  { accent: '#b99a5e', accentDeep: '#8a6f3a', trim: '#e8cf96', label: '鎏金' },
];

export const TILE_BASE = {
  floor_wood_a: { light: PAL.floorOakLight, base: PAL.floorOak, mid: PAL.floorOakMid, seam: PAL.floorOakSeam },
  floor_wood_b: { light: PAL.floorOakLight, base: PAL.floorOakMid, mid: PAL.floorOakDark, seam: PAL.floorOakSeam },
  floor_tile: { light: PAL.floorStoneLight, base: PAL.floorStone, mid: PAL.floorStoneMid, seam: PAL.floorStoneSeam },
  floor_carpet: { light: PAL.floorMintLight, base: PAL.floorMint, mid: PAL.floorMintMid, seam: PAL.floorMintSeam },
  floor_stone: { light: PAL.floorStoneLight, base: PAL.floorStone, mid: PAL.floorStoneMid, seam: PAL.floorStoneSeam },
  floor_stone_b: { light: PAL.floorStone, base: PAL.floorStoneMid, mid: PAL.floorStoneSeam, seam: PAL.floorStoneSeam },
  floor_rug_edge: { light: PAL.floorMintLight, base: PAL.floorMint, mid: PAL.floorMintSeam, seam: PAL.floorMintSeam },
};
