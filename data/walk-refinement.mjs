// ART-02 reference redesign overrides (batch-1 four), derived from the user-provided official
// full-body art: C:\Users\lenovo\Desktop\OurNotes_BanG_Dream剧情\全部角色基础全身立绘\PNG透明格式
// (same art indexed by the user's 00_全角色官方外貌形象与视觉设定数据库.md). Colors below were
// sampled from the transparent PNGs (exact-pixel histograms per zone, see work/ref-preview.mjs).
// Applied by data/band-appearances.mjs, preserving the registered portrait costume and
// assigning walkCostume separately. Browser and CLI share the refined walk dispatcher.
export const OVERRIDES={
  // Pokémon-style baseline (coloured inner outline) applies to all four this round.
  // See README '宝可梦基准微调' for the style rules and their source.
  // 高松灯: ash-mauve bob (#a090a8 light / #786888 shadow), rose-pink eyes; blue-white varsity
  // jacket (white body #f8f8f8, blue sleeves/shoulders #6890b8, gold trim), grey-olive pleated
  // skirt (#888880), bare legs, white shoes with rose-pink accents (#e8b8b8).
  'bd-tomori':{
    hair:['#b1a2b5','#877c93','#5a5166'],
    cloth:['#f2f2ec','#c9c6c4','#8e8a90'],
    sleevePalette:['#7ba2c8','#5c81a6','#3a5674'],
    costume:'ref-college',
    walkLegwear:'bare',
    shoePalette:['#f6efe6','#e8bcbc','#b8848e'],
  },
  // 要乐奈: silver-white bob (+cat-ear ahoge, too small for 64px), heterochromia kept
  // (viewer-left amber, viewer-right ice blue); bright-blue off-shoulder dress (#7090b8) with
  // white neckline trim, black choker, dark-red guitar strap (#501008), long blue skirt, fishnet
  // legs, white shoes.
  'bd-rana':{
    cloth:['#78a0c6','#587fa8','#33506f'],
    costume:'ref-bluedress',
    walkLegwear:'net',
    shoePalette:['#f4f2ea','#d8d5c8','#9aa0a4'],
    refChoker:'#14141c',
  },
  // 丰川祥子: dusty pale-silver-blue long low twin tails (#a8c0d0, black velvet ribbons kept),
  // gold eyes kept; deep-red bodice (#701010) with black lace and silver clasp, red puff shoulder
  // caps, black layered skirt with cream frill hem (#d0c8b8), black shoes.
  'bd-sakiko':{
    hair:['#b6c9d5','#89a3b4','#516c7d'],
    cloth:['#96262e','#6e151d','#400a10'],
    costume:'ref-gothic',
    shoePalette:['#3a3a40','#26262c','#141418'],
  },
  // 矢仓蓬咲: dusty grey-purple asymmetric bob (#9088a0 — noticeably darker than the old palette),
  // sage-green eyes kept; navy-slate pinstripe jacket (#506878) with harness, black choker with
  // silver chain, fishnet legs, cream boots (#e8d8b8).
  'bd-yomogi':{
    hair:['#a29ab2','#7d7690','#4e4860'],
    cloth:['#5f7284','#465664','#2a3440'],
    walkLegwear:'net',
    shoePalette:['#f2ead2','#cfc4a4','#95896c'],
    refChoker:'#14141c',
    refChain:'#b9c0c8',
  },
};
