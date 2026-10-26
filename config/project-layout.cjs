// Runtime distribution boundary. Keep development tools and candidates outside it.
module.exports = Object.freeze({
  directories: ['frontend','frontend-next','assets/frontend','assets/frontend-next','assets/shop','data','modules','integration','contracts','content','config','vendor'],
  rootFiles: ['*.html','*.js','*.mjs','*.css','package.json','package-lock.json','LICENSE','NONAME-LICENSE','THIRD_PARTY_NOTICES.md','README.md'],
  exclusions: ['!data/balance-build.log','!vendor/noname/Home/**/*'],
});
