// Runtime distribution boundary. Keep development tools and candidates outside it.
// assets/frontend-bright-anime 是明亮二次元正式素材目录（瓦片/道具/光效/包装/25 位角色图集），
// 与 assets/frontend、assets/frontend-next 同级；漏登记会让源码可玩但打包缺图。
// 新增运行目录必须同时登记到 desktop/prepare-build.cjs 的拷贝范围与 tests/package-closure.mjs 的清单。
module.exports = Object.freeze({
  directories: ['frontend','frontend-next','assets/frontend','assets/frontend-bright-anime','assets/frontend-next','assets/shop','data','modules','integration','contracts','content','config','vendor'],
  rootFiles: ['*.html','*.js','*.mjs','*.css','package.json','package-lock.json','LICENSE','NONAME-LICENSE','THIRD_PARTY_NOTICES.md','README.md',
    // Ship component attribution, not the experiments or original art libraries.
    'experiments/character-art/CREDITS.md','experiments/character-art/source-manifest.json',
    'experiments/character-art/sources/portraits/LICENSE.txt','experiments/character-art/sources/portraits/CODE-LICENSE.txt',
    'experiments/character-art/sources/lpc/credits.txt','experiments/character-art/sources/lpc/hair-credits.txt','experiments/character-art/sources/lpc/clothing-credits.txt',
    'experiments/character-art/sources/lpc-idle/README.md','experiments/character-art/sources/lpc-idle/sources.json'],
  exclusions: ['!data/balance-build.log','!vendor/noname/Home/**/*'],
});
