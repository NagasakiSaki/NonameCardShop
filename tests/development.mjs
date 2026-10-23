import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {root} from '../dev/process.mjs';
import {startDevelopmentServer,watchedFile} from '../dev/runtime.mjs';
import {startShopServer} from '../server.mjs';
for(const file of ['app.js','shop-business.js','modules/balance.js','data/tasks.json','styles.css','assets/shop/owner.png'])assert.ok(watchedFile(file),file);
for(const file of ['.git/config','.local/save.json','vendor/noname/noname.js','desktop/dist/a.exe','test-results/a.json'])assert.ok(!watchedFile(file),file);
let runtime=await startDevelopmentServer({port:0,enginePort:0}),production=await startShopServer({port:0,enginePort:0}),browser;
try{
  browser=await chromium.launch();const context=await browser.newContext(),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  await page.goto(production.origin);await page.evaluate(()=>localStorage.setItem('production-marker','keep'));assert.equal(await page.locator('#developmentTools').count(),0);
  await page.goto(runtime.origin);await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&ShopGame.scene?.owner&&document.querySelector('#developmentFixture')?.options.length===3);
  assert.equal(await page.evaluate(()=>localStorage.getItem('production-marker')),null);
  await page.locator('#developmentTools summary').click();
  for(const [id,cash,day,card] of [['stocked',10000,1,3],['tournament',20000,7,2],['empty',1200,1,undefined]]){
    await page.locator('#developmentFixture').selectOption(id);await page.getByRole('button',{name:'载入测试存档',exact:true}).click();
    await page.waitForFunction(c=>typeof DATA!=='undefined'&&DATA&&state.shop.cash===c,cash);
    assert.equal(await page.evaluate(()=>state.business.day),day);assert.equal(await page.evaluate(()=>state.collection.caocao),card);
    if(id==='tournament')assert.equal(await page.evaluate(()=>ShopModules.value('upgrades.level',state,0,{id:'table'})),1);
    await page.locator('#developmentTools summary').click();
  }
  await page.evaluate(()=>{state.shop.cash=7654;state.business.paused=true;store.save(state);window.devMarker='unchanged';});
  // The real file watcher handles a CSS timestamp change without editing source contents.
  const css=fs.readdirSync(root).find(file=>file.endsWith('.css')),cssPath=path.join(root,css),stat=fs.statSync(cssPath);
  try{fs.utimesSync(cssPath,new Date(),new Date());await page.waitForFunction(()=>[...document.querySelectorAll('link[rel=stylesheet]')].some(link=>link.href.includes('devRevision=')));}
  finally{fs.utimesSync(cssPath,stat.atime,stat.mtime);}
  assert.equal(await page.evaluate(()=>window.devMarker),'unchanged');
  await page.locator('#managementBtn').click();await page.locator('[data-manage-tab=editor]').click();
  runtime.notify(['app.js']);await page.waitForFunction(()=>document.querySelector('#developmentStatus').textContent.includes('等待安全刷新'));
  await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.devMarker),'unchanged');
  await page.locator('#managementClose').click();await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&window.devMarker===undefined);assert.equal(await page.evaluate(()=>state.shop.cash),7654);
  // Active combat also defers script reload; the production engine is covered separately.
  await page.evaluate(()=>{window.devMarker='combat';document.querySelector('#battleScreen').hidden=false;});runtime.notify(['modules/combat.js']);
  await page.waitForFunction(()=>document.querySelector('#developmentStatus').textContent.includes('等待安全刷新'));await page.waitForTimeout(800);assert.equal(await page.evaluate(()=>window.devMarker),'combat');
  await page.evaluate(()=>document.querySelector('#battleScreen').hidden=true);await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&window.devMarker===undefined);
  const origin=runtime.origin,port=Number(new URL(origin).port),enginePort=Number(new URL(runtime.engineOrigin).port);
  await page.evaluate(()=>window.devMarker='restart');await runtime.close();runtime=await startDevelopmentServer({port,enginePort});
  await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&window.devMarker===undefined,null,{timeout:20000});assert.equal(await page.evaluate(()=>state.shop.cash),7654);
  await page.goto(production.origin);assert.equal(await page.evaluate(()=>localStorage.getItem('production-marker')),'keep');assert.deepEqual(errors,[]);
  console.log('PASS development: isolated saves, all fixtures, real CSS watcher, deferred editor/combat reload, backend reconnect, progress retention and clean production HTML.');
}finally{await browser?.close();await runtime.close();await production.close();}
