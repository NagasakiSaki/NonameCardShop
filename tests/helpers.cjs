const path=require('node:path'),fs=require('node:fs');
const root=path.resolve(__dirname,'..');
const output=process.env.CARD_SHOP_TEST_RESULTS||path.join(root,'test-results/manual');fs.mkdirSync(output,{recursive:true});
module.exports={...require('playwright'),root,output,base:process.env.CARD_SHOP_TEST_BASE,engineOrigin:process.env.CARD_SHOP_TEST_ENGINE};
