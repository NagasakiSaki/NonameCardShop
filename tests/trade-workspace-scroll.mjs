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

  // 分批渲染后：DOM 里只有首批行，但“共 N 条”的逻辑行数必须仍是全部，且不能出现分页。
  const totalRows=()=>page.evaluate(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0));
  const renderedRows=()=>page.evaluate(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-rendered-rows')||0));
  assert.equal(await totalRows(),1000);
  assert.ok(await tiles.count()<1000,'首批只渲染一部分行（分批）');
  assert.equal(await renderedRows(),await tiles.count(),'data-rendered-rows 必须与实际渲染行数一致');
  assert.equal(await page.getByRole('button',{name:'下一页',exact:true}).count(),0);
  const keys=await tiles.evaluateAll(nodes=>nodes.map(n=>JSON.parse(n.dataset.card)[0]));
  assert.equal(new Set(keys).size,keys.length,'首批内不能有重复行');
  const firstKey=keys[0];assert.equal(cards.find(c=>c.cardKey===firstKey).globalScore,Math.max(...cards.map(c=>c.globalScore)));
  // 滚到底必须能看到并点中**最后一条逻辑数据**（data-row-index = total-1），不能只看 DOM 最后一行。
  // 每帧只追加一批，所以这里要“设置滚动 → 等两帧 → 再检查”，反复推进直到末行出现。
  const body=page.locator('.facility-window:visible .window__body');
  let reached=false;
  for(let attempt=0;attempt<120&&!reached;attempt+=1){
    reached=await page.evaluate(async()=>{
      const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');
      const total=Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0);
      if(!scroller||!total)return false;
      scroller.scrollTop=scroller.scrollHeight;
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      const last=document.querySelector('[data-card-grid] [data-card][data-row-index="'+(total-1)+'"]');
      if(!last)return false;
      const box=last.getBoundingClientRect(),view=scroller.getBoundingClientRect();
      return box.bottom<=view.bottom+2&&box.top>=view.top-2;
    });
    if(!reached)await page.waitForTimeout(20);
  }
  assert.ok(reached,'滚到底应能到达最后一条逻辑数据');
  // 世界刷新会重绘，断言用轮询而不是单次计数，避免在重绘间隙取样。
  await page.waitForFunction(()=>Boolean(document.querySelector('[data-card-grid] [data-card][data-row-index="999"]')),null,{timeout:15000});
  const lastTile=page.locator('[data-card-grid] [data-card][data-row-index="999"]');
  await lastTile.click();
  assert.equal(await lastTile.getAttribute('aria-pressed'),'true','最后一行必须可点中');
  await body.evaluate(n=>n.scrollTop=1000);
  const visibleIndex=await tiles.evaluateAll(nodes=>nodes.findIndex(n=>{const r=n.getBoundingClientRect();return r.top>150&&r.bottom<650;}));assert.ok(visibleIndex>=0);
  const before=await body.evaluate(n=>n.scrollTop);await tiles.nth(visibleIndex).click();assert.ok(Math.abs(await body.evaluate(n=>n.scrollTop)-before)<3,'selecting a visible card keeps the scroll offset');
  const search=page.getByRole('searchbox',{name:'搜索单卡',exact:true});await search.fill('不存在的卡牌测试词');assert.equal(await totalRows(),0);assert.equal(await search.evaluate(n=>n===document.activeElement),true);await search.fill('');assert.equal(await totalRows(),1000);
  await page.getByRole('combobox',{name:'全部印刷稀有度',exact:true}).selectOption('SR');assert.ok(await totalRows()>0);
  const selected=JSON.parse(await tiles.first().getAttribute('data-card'))[0];await tiles.first().click();await page.getByRole('spinbutton',{name:'单卡上架售价',exact:true}).fill('37');
  await page.getByRole('button',{name:'确认单卡上架',exact:true}).click();await page.waitForFunction(async()=>((await __cardShopApp.query('market.list',{tab:'mine'})).data.items||[]).some(i=>i.unitAmount===37));
  const listing=(await query('market.list',{tab:'mine'})).items.find(i=>i.unitAmount===37);
  assert.ok(listing&&listing.cardKey===selected);
  assert.ok(listing.inventoryRef.startsWith('pagination:card:'),'上架必须绑定真实实物引用，而不是按卡名猜');
  assert.equal(await page.locator('[data-purchase-root]').count(),0);assert.equal(await page.locator('[data-unbox-root]').count(),0);assert.deepEqual(errors,[]);
  await page.screenshot({path:out+'/scrolling-collection.png'});await close();
  console.log('PASS current scrolling collection: 1000 logical rows, batched DOM, last row reachable and clickable, score order, no pagination, preserved selection scroll, complete search/filter and real SR listing');
}finally{await browser?.close();await server.close();}
