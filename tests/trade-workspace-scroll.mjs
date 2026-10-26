import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/trade-workspace-pagination';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.setDefaultTimeout(15000);page.on('pageerror',error=>errors.push(error.message));
  const query=(name,input={})=>page.evaluate(async({name,input})=>{const r=await __cardShopApp.query(name,input);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,input});
  const command=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({type,payload,requestId:'pagination-'+crypto.randomUUID()});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const close=()=>page.evaluate(()=>__cardShopApp.windows.closeAll());
  const tiles=page.locator('[data-collection-root] [data-card-grid] [data-card]');

  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);
  const cards=[];let cursor=0;
  while(cards.length<1000){const p=await query('catalog.list',{limit:200,cursor});cards.push(...p.items);if(!p.nextCursor)break;cursor=Number(p.nextCursor);}
  assert.equal(cards.length,1000);
  const product=(await query('products.list',{limit:1})).items[0],archive=JSON.parse((await command('saves.export')).content);
  for(let i=0;i<cards.length;i++){
    const c=cards[i],ref='pagination:card:'+i;
    archive.world.items[ref]={inventoryRef:ref,kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:product.productVersion,source:'synthetic',productId:product.productId,ownerId:'player',location:'collection',protected:false,lock:null,cost:0};
  }
  await command('saves.import',{content:JSON.stringify(archive)});await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);
  await page.evaluate(()=>__cardShopApp.goToInteraction('store.secondaryMarket','market',{tab:'collection'}));
  await tiles.first().waitFor();await page.waitForFunction(()=>__cardShopApp.isNearInteraction('store.secondaryMarket'));

  assert.equal(await tiles.count(),1000);assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);
  const keys=await tiles.evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.dataset.card)[0]));assert.equal(new Set(keys).size,1000);
  const firstKey=keys[0];assert.equal(cards.find(c=>c.cardKey===firstKey).globalScore,Math.max(...cards.map(c=>c.globalScore)));
  const body=page.locator('.facility-window:visible .window__body');await body.evaluate(n=>n.scrollTop=1000);
  const visibleIndex=await tiles.evaluateAll(nodes=>nodes.findIndex(n=>{const r=n.getBoundingClientRect();return r.top>150&&r.bottom<650;}));assert.ok(visibleIndex>=0);
  const before=await body.evaluate(n=>n.scrollTop);await tiles.nth(visibleIndex).click();assert.ok(Math.abs(await body.evaluate(n=>n.scrollTop)-before)<3,'selecting a visible card keeps the scroll offset');
  const search=page.getByRole('searchbox',{name:'搜索单卡',exact:true});await search.fill('不存在的卡牌测试词');assert.equal(await tiles.count(),0);assert.equal(await search.evaluate(n=>n===document.activeElement),true);await search.fill('');assert.equal(await tiles.count(),1000);
  await page.getByRole('combobox',{name:'全部印刷稀有度',exact:true}).selectOption('SR');assert.ok(await tiles.count()>0);
  const selected=JSON.parse(await tiles.first().getAttribute('data-card'))[0];await tiles.first().click();await page.getByRole('spinbutton',{name:'单卡上架售价',exact:true}).fill('37');
  await page.getByRole('button',{name:'确认单卡上架',exact:true}).click();await page.waitForFunction(async()=>((await __cardShopApp.query('market.list',{tab:'mine'})).data.items||[]).some(i=>i.unitAmount===37));
  assert.ok((await query('market.list',{tab:'mine'})).items.some(i=>i.cardKey===selected&&i.unitAmount===37));
  assert.equal(await page.locator('[data-purchase-root]').count(),0);assert.equal(await page.locator('[data-unbox-root]').count(),0);assert.deepEqual(errors,[]);
  await page.screenshot({path:out+'/scrolling-collection.png'});await close();
  console.log('PASS current scrolling collection: all 1000 rows reachable, score order, no pagination, preserved selection scroll, complete search/filter and real SR listing');
}finally{await browser?.close();await server.close();}
