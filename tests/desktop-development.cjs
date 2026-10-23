const {_electron,root,output}=require('./helpers.cjs');
const path=require('node:path'),assert=require('node:assert/strict');
(async()=>{
  const profile=path.join(output,'desktop-development-profile'),env={...process.env,CARD_SHOP_DEVELOPMENT:'1',CARD_SHOP_TEST_MODE:'1',CARD_SHOP_TEST_PROFILE:profile,CARD_SHOP_TEST_PORT:'0',CARD_SHOP_TEST_ENGINE_PORT:'0'};delete env.ELECTRON_RUN_AS_NODE;
  const app=await _electron.launch({executablePath:path.join(root,'desktop/node_modules/electron/dist/electron.exe'),args:[path.join(root,'desktop')],env,timeout:60000});
  let origin,engineOrigin;
  try{
    const page=await app.firstWindow();await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&ShopGame.scene?.owner&&document.querySelector('#developmentFixture')?.options.length===3);
    origin=new URL(page.url()).origin;engineOrigin=await page.evaluate(()=>fetch('/api/runtime').then(r=>r.json()).then(r=>r.engineOrigin));
    assert.equal(await app.evaluate(({app})=>app.getPath('userData')),profile);
    assert.equal(await app.evaluate(({Menu})=>Menu.getApplicationMenu().items.find(i=>i.label==='显示').submenu.items.some(i=>i.label==='重启桌面开发进程')),true);
    assert.equal(await page.evaluate(()=>typeof process),'undefined');
    page.on('dialog',d=>d.accept());await page.locator('#developmentTools summary').click();await page.locator('#developmentFixture').selectOption('stocked');await page.getByRole('button',{name:'载入测试存档',exact:true}).click();await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&state.shop.cash===10000);
    assert.equal(await page.evaluate(()=>state.collection.caocao),3);
  }finally{await app.close();}
  for(const url of [origin,engineOrigin])await assert.rejects(fetch(url));
  console.log('PASS desktop development: native menu, isolated profile, injected tools, fixture load, sandbox and SSE/server shutdown.');
})().catch(error=>{console.error(error);process.exitCode=1;});
