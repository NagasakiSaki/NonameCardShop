import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startDevelopmentServer,watchedFile} from '../dev/runtime.mjs';
import {startShopServer} from '../server.mjs';
for(const f of ['frontend/app-shell.mjs','frontend/styles/tokens.css','assets/frontend/maps/store.json','modules/backend/views.mjs','integration/frontend-host.mjs','contracts/card-shop-host.d.ts'])assert.ok(watchedFile(f),f);
for(const f of ['.git/config','.local/export.json','vendor/noname/noname.js','node_modules/phaser.js','test-results/report.json'])assert.equal(watchedFile(f),false,f);
const dev=await startDevelopmentServer({port:0,enginePort:0,watch:false}),prod=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(prod.origin);await page.waitForFunction(()=>window.__cardShopReady===true);assert.equal(await page.locator('#developmentTools').count(),0);await page.evaluate(()=>localStorage.setItem('production-marker','keep'));
  await page.goto(dev.origin);await page.waitForFunction(()=>window.__cardShopReady===true&&!!document.querySelector('#developmentTools'));
  assert.equal(await page.evaluate(()=>localStorage.getItem('production-marker')),null);
  await page.evaluate(async()=>{window.devMarker='kept';const r=await __cardShopApp.host.command({requestId:'dev-test-pause',type:'clock.setManualPause',payload:{paused:true}});if(!r.ok)throw Error(JSON.stringify(r));});
  dev.notify(['frontend/styles/tokens.css']);await page.waitForFunction(()=>[...document.querySelectorAll('link')].some(l=>l.href?.includes('devRevision=')));assert.equal(await page.evaluate(()=>devMarker),'kept');
  await page.getByRole('button',{name:'背包 B',exact:true}).click();await page.waitForSelector('[role="dialog"]');dev.notify(['modules/backend/views.mjs']);await page.waitForTimeout(1000);assert.equal(await page.evaluate(()=>devMarker),'kept');
  await page.keyboard.press('Escape');await page.waitForFunction(()=>window.__cardShopReady===true&&window.devMarker===undefined,null,{timeout:15000});assert.equal(await page.evaluate(()=>__cardShopApp.snapshot().clock.manualPaused),true);
  await page.goto(prod.origin);await page.waitForFunction(()=>window.__cardShopReady===true);assert.equal(await page.evaluate(()=>localStorage.getItem('production-marker')),'keep');assert.deepEqual(errors,[]);
  console.log('PASS frontend development: nested module/asset watching, origin-isolated saves, CSS refresh without reload, deferred source reload and retained world state.');
}finally{await browser?.close();await dev.close();await prod.close();}
