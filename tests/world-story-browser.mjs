import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';
const server=await startShopServer({port:0,enginePort:0}),out=process.env.CARD_SHOP_TEST_RESULTS||'.local/world-story';fs.mkdirSync(out,{recursive:true});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const q=(name,input={})=>page.evaluate(async({name,input})=>{const r=await __cardShopApp.query(name,input);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,input});
  const c=(type,payload={})=>page.evaluate(async({type,payload})=>{const s=__cardShopApp.snapshot();const r=await __cardShopApp.command({requestId:'world-story-'+crypto.randomUUID(),type,payload:type==='narrative.start'?{worldId:s.worldId,branchId:s.branchId,...payload}:payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const dialogue=page.getByRole('dialog',{name:'场景对话',exact:true});
  async function readText(){await dialogue.waitFor();for(let i=0;i<30;i++){const next=dialogue.getByRole('button',{name:'继续 ▸',exact:true});if(!await next.count())return;await next.click();}}
  async function advance(){await readText();await dialogue.getByRole('button',{name:'继续',exact:true}).click();}
  const until=async fn=>{const deadline=Date.now()+45000;while(!await fn()){if(Date.now()>deadline)throw Error('World story condition timed out');await page.waitForTimeout(100);}};
  const go=async(id,panel,options={})=>{await page.evaluate(({id,panel,options})=>__cardShopApp.goToInteraction(id,panel,options),{id,panel,options});await page.waitForFunction(id=>__cardShopApp.isNearInteraction(id),id);await page.locator('.facility-window').waitFor();};
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);
  const firstDay=(await q('saves.days')).items[0];await c('business.open');await dialogue.waitFor();
  assert.equal((await q('narrative.session')).chapterId,'chapter_00');
  const minute=(await q('shop.snapshot')).clock.minute;await page.waitForTimeout(250);assert.equal((await q('shop.snapshot')).clock.minute,minute);
  await advance();await readText();await dialogue.getByRole('button',{name:'先把货架上的基础卡包排整齐。',exact:true}).click();await advance();
  await until(async()=>(await q('narrative.session')).status==='completed');
  await c('narrative.start',{campaignId:'corner_card_shop',chapterId:'chapter_01'});await advance();await readText();await dialogue.getByRole('button',{name:'先介绍最容易入门的卡包。',exact:true}).click();await advance();
  await until(async()=>(await q('narrative.session')).status==='waiting');await dialogue.waitFor({state:'hidden'});
  await go('store.counter','supplier');const gift=(await q('inventory.list',{kind:'box'})).items[0];const packs=await c('boxes.unseal',{inventoryRef:gift.inventoryRef});
  await go('store.retail','supplier',{purchaseTab:'retail'});await c('retail.listAll',{inventoryRefs:packs.inventoryRefs});await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await until(async()=>(await q('narrative.session')).status==='presenting');assert.ok((await q('checkout.status')).transactions.length>0);
  while((await q('narrative.session')).nodeType==='line')await advance();assert.equal((await q('narrative.session')).proof.nodeId,'c01_priority');
  await page.setViewportSize({width:390,height:720});await readText();const bounds=await dialogue.boundingBox();assert.ok(bounds.x>=0&&bounds.x+bounds.width<=391&&bounds.y+bounds.height<=721);await page.screenshot({path:path.join(out,'world-story-390.png')});
  await dialogue.getByRole('button',{name:'先聊收藏与卡牌来历。',exact:true}).click();
  while((await q('narrative.session')).nodeType==='line')await advance();assert.equal((await q('narrative.session')).status,'completed');
  const rewindLease=await page.evaluate(()=>__cardShopApp.host.pause.acquire({ownerId:'story-rewind-check',reason:'核对日初快照'}));
  await c('saves.loadDay',{archiveId:firstDay.archiveId||firstDay.id});await finishOpeningDialogue(page);const available=await q('narrative.available');assert.equal(available.items.find(i=>i.chapterId==='chapter_00').status,'not-started');assert.equal((await q('shop.snapshot')).clock.minute,480);await page.evaluate(id=>__cardShopApp.host.pause.release(id),rewindLease.leaseId);
  assert.deepEqual(errors,[]);console.log('PASS in-world story scene trigger, paging/choice, modal clock pause, real sale wakeup, 390px layout and causal day-start rewind');
}finally{await browser?.close();await server.close();}
