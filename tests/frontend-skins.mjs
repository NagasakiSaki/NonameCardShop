import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {PLAYER_SKINS} from '../modules/backend/appearances.mjs';
const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/band-only-skins';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
 browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
 await page.evaluate(()=>__cardShopApp.openPanel('settings'));await page.locator('[data-skin="bd-anon"]').waitFor();assert.equal(await page.locator('[data-skin]').count(),25);
 assert.equal(await page.locator('[data-skin="owner"],[data-skin="collector"]').count(),0);
 for(const {appearanceId:id}of PLAYER_SKINS){
  await page.locator('[data-skin="'+id+'"]').click();await page.waitForFunction(id=>document.querySelector('[data-skin="'+id+'"]').getAttribute('aria-pressed')==='true',id);
  await page.waitForFunction(id=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner').texture.key==='char-'+id,id);
  const state=await page.evaluate(()=>{const s=__cardShopApp.getWorldScene().actorView.getSprite('actor:owner');return [s.frame.width,s.frame.height,s.originX,s.originY,s.scaleX];});assert.deepEqual(state,[64,64,.5,61/64,1]);
 }
 const minute=await page.evaluate(()=>__cardShopApp.snapshot().clock.minute);await page.waitForTimeout(150);assert.equal(await page.evaluate(()=>__cardShopApp.snapshot().clock.minute),minute);
 await page.screenshot({path:out+'/25-skins.png',animations:'disabled'});await page.evaluate(()=>__cardShopApp.windows.closeAll());
 for(const [key,min,max]of [['ArrowLeft',8,15],['ArrowRight',24,31]]){await page.keyboard.down(key);await page.waitForTimeout(180);await page.keyboard.up(key);await page.waitForTimeout(80);const frame=await page.evaluate(()=>Number(__cardShopApp.getWorldScene().actorView.getSprite('actor:owner').frame.name));assert(frame>=min&&frame<=max);}
 await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);const last=PLAYER_SKINS.at(-1).appearanceId;await page.waitForFunction(id=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner')?.texture.key==='char-'+id,last);
 assert.deepEqual(errors,[]);console.log('PASS only 25 BanG Dream skins; selection, owner identity, profile animation, original anchors, pause and persisted reload');
}finally{await browser?.close();await server.close();}