import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/frontend-v3';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin);await page.waitForFunction(()=>window.__cardShopReady===true);
  await page.evaluate(()=>__cardShopApp.openPanel('settings'));
  await page.locator('[data-skin="collector"]').waitFor();assert.equal(await page.locator('[data-skin]').count(),7);
  const state=()=>page.evaluate(()=>{const e=__cardShopApp.getWorldScene().actorView.sprites.get('actor:owner');return {texture:e.sprite.texture.key,frame:Number(e.sprite.frame.name),label:e.label.text,width:e.sprite.frame.width,height:e.sprite.frame.height};});
  for(const id of ['collector','rookie','competitor','passerby','regular','bigspender','owner','collector']){
    await page.locator('[data-skin="'+id+'"]').click();await page.waitForFunction(id=>document.querySelector('[data-skin="'+id+'"]').getAttribute('aria-pressed')==='true',id);
    await page.waitForFunction(id=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner').texture.key==='char-'+id,id);
    const s=await state();assert.equal(s.width,96);assert.equal(s.height,128);assert.match(s.label,/店长\n店主/);
  }
  const minute=await page.evaluate(()=>__cardShopApp.snapshot().clock.minute);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__cardShopApp.snapshot().clock.minute),minute);
  await page.screenshot({path:output+'/skin-settings.png'});await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(250);await page.keyboard.up('ArrowLeft');await page.waitForTimeout(150);let s=await state();assert.ok(s.frame>=3&&s.frame<=5,'left uses the profile row');
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');await page.waitForTimeout(150);s=await state();assert.ok(s.frame>=6&&s.frame<=8,'right uses the independent profile row');
  await page.screenshot({path:output+'/side-profile.png'});await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);await page.waitForFunction(()=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner')?.texture.key==='char-collector');assert.deepEqual(errors,[]);
  await page.evaluate(()=>__cardShopApp.host.disconnect());console.log('PASS frontend skins: seven live textures, native 96x128 frames, owner identity preserved, setting pause, left/right profile rows and IndexedDB reload.');
}finally{await browser?.close();await server.close();}
