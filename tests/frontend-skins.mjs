import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {PLAYER_SKINS} from '../modules/backend/appearances.mjs';
const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/frontend-v3';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
  await page.evaluate(()=>__cardShopApp.openPanel('settings'));
  await page.locator('[data-skin="collector"]').waitFor();assert.equal(await page.locator('[data-skin]').count(),PLAYER_SKINS.length);
  const state=()=>page.evaluate(()=>{const e=__cardShopApp.getWorldScene().actorView.sprites.get('actor:owner');return {texture:e.sprite.texture.key,frame:Number(e.sprite.frame.name),label:e.label.text,width:e.sprite.frame.width,height:e.sprite.frame.height};});
  for(const id of ['collector','rookie','competitor','passerby','regular','bigspender','owner',...PLAYER_SKINS.filter(s=>s.appearanceId.startsWith('bd-')).map(s=>s.appearanceId),'collector']){
    await page.locator('[data-skin="'+id+'"]').click();await page.waitForFunction(id=>document.querySelector('[data-skin="'+id+'"]').getAttribute('aria-pressed')==='true',id);
    await page.waitForFunction(id=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner').texture.key==='char-'+id,id);
    const s=await state(),modern=id==='owner'||id.startsWith('bd-');assert.equal(s.width,modern?64:96);assert.equal(s.height,modern?64:128);assert.match(s.label,/店长\n店主/);
  }
  const minute=await page.evaluate(()=>__cardShopApp.snapshot().clock.minute);await page.waitForTimeout(250);assert.equal(await page.evaluate(()=>__cardShopApp.snapshot().clock.minute),minute);
  await page.screenshot({path:output+'/skin-settings.png'});await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await page.keyboard.down('ArrowLeft');await page.waitForTimeout(250);await page.keyboard.up('ArrowLeft');await page.waitForTimeout(150);let s=await state();assert.ok(s.frame>=3&&s.frame<=5,'left uses the profile row');
  await page.keyboard.down('ArrowRight');await page.waitForTimeout(250);await page.keyboard.up('ArrowRight');await page.waitForTimeout(150);s=await state();assert.ok(s.frame>=6&&s.frame<=8,'right uses the independent profile row');
  await page.screenshot({path:output+'/side-profile.png'});await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);await page.waitForFunction(()=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner')?.texture.key==='char-collector');assert.deepEqual(errors,[]);
  await page.evaluate(()=>__cardShopApp.openPanel('settings'));await page.locator('[data-skin="bd-sakiko"]').click();await page.waitForFunction(()=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner')?.texture.key==='char-bd-sakiko');await page.evaluate(()=>__cardShopApp.windows.closeAll());
  for(const [key,min,max]of [['ArrowLeft',8,15],['ArrowRight',24,31]]){await page.keyboard.down(key);await page.waitForTimeout(160);await page.keyboard.up(key);await page.waitForTimeout(80);const s=await state();assert.ok(s.frame>=min&&s.frame<=max,'new eight-column profile row');const origin=await page.evaluate(()=>{const s=__cardShopApp.getWorldScene().actorView.getSprite('actor:owner');return [s.originX,s.originY,s.scaleX];});assert.deepEqual(origin,[.5,61/64,1]);}
  await page.screenshot({path:output+'/five-bands-game.png'});await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);await page.waitForFunction(()=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner')?.texture.key==='char-bd-sakiko');assert.deepEqual(errors,[]);
  await page.evaluate(()=>__cardShopApp.host.disconnect());console.log('PASS frontend skins: all 25 new skins and 7 compatible identities, mixed frame dimensions and anchors, owner identity, setting pause, independent profile rows and IndexedDB reload.');
}finally{await browser?.close();await server.close();}
