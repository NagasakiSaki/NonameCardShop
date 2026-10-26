import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';
import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {startShopServer} from '../server.mjs';
const server=await startShopServer({port:0,enginePort:0}),browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.origin+'/experiments/character-portraits/index.html');await page.waitForFunction(()=>window.portraitPreviewReady===true);
 assert.equal(await page.locator('.tile').count(),25);
 const registry=JSON.parse(fs.readFileSync('data/character-portraits.json'));
 for(const id of Object.keys(registry.characters)){
  await page.locator('#character').selectOption(id);await page.evaluate(()=>Promise.all([...document.images].map(i=>i.decode().catch(()=>null))));
  assert.equal(await page.locator('#portrait').evaluate(i=>i.naturalWidth),128);assert.equal(await page.locator('#avatar').evaluate(i=>i.naturalWidth),96);
 }
 await page.locator('#character').selectOption('bd-tomori');await page.locator('#old').check();await page.screenshot({path:'.local/new-portrait-source/formal-preview.png',fullPage:true});
 await page.setViewportSize({width:406,height:1000});for(const zoom of ['1','2','4']){await page.locator('#zoom').selectOption(zoom);assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,'preview must not overflow at '+zoom+'x');}
 await page.locator('#zoom').selectOption('1');await page.screenshot({path:'.local/new-portrait-source/formal-preview-406.png',fullPage:true});
 await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);await page.evaluate(()=>__cardShopApp.openPanel('settings'));
 const path=registry.characters['bd-tomori'].avatar.url;
 await page.waitForFunction(p=>[...document.images].some(im=>im.src.endsWith(p)&&im.naturalWidth===96),path);
 await page.screenshot({path:'.local/new-portrait-source/game-settings.png',fullPage:true});
 assert.deepEqual(errors,[]);console.log('PASS portrait preview: 25 actual formal portraits/avatars, old/new comparison, 406px at 1/2/4x, settings use the new registry, no page errors.');
}finally{await browser.close();await server.close();}
