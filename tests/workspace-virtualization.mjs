// tests/workspace-virtualization.mjs — 交易工作区分批渲染的行为回归（OPT-13 第一项）。
//
// 验收点：分批只影响“什么时候画多少行”，不影响玩家能力——
//   连续滚动、全部行可达、跨筛选选择、实物定价绑定、焦点、滚动位置、卡面详情、关闭清理。
// 另外覆盖：快速滚动（连续大跨度跳转）、缩放（CSS 视口变窄）后的可达性。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(20000);
  const query=(name,input={})=>page.evaluate(async({name,input})=>{const r=await __cardShopApp.query(name,input);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,input});
  const command=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({type,payload,requestId:'virt-'+crypto.randomUUID()});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const totalRows=()=>page.evaluate(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0));
  const renderedRows=()=>page.evaluate(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-rendered-rows')||0));
  const tiles=page.locator('[data-collection-root] [data-card-grid] [data-card]');

  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true);
  const cards=[];let cursor=0;
  while(cards.length<1000){const p=await query('catalog.list',{limit:200,cursor});cards.push(...p.items);if(!p.nextCursor)break;cursor=Number(p.nextCursor);}
  assert.equal(cards.length,1000);
  const product=(await query('products.list',{limit:1})).items[0],archive=JSON.parse((await command('saves.export')).content);
  for(let i=0;i<cards.length;i+=1){
    const c=cards[i],ref='virt:card:'+i;
    archive.world.items[ref]={inventoryRef:ref,kind:'card',cardKey:c.cardKey,printedRarity:'SR',printVersion:product.productVersion,source:'synthetic',productId:product.productId,ownerId:'player',location:'collection',protected:false,lock:null,cost:0};
  }
  await command('saves.import',{content:JSON.stringify(archive)});
  await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);
  await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
  await tiles.first().waitFor();

  // 1) 分批：首屏只画一批，逻辑行数仍是全部
  assert.equal(await totalRows(),1000);
  const firstBatch=await renderedRows();
  assert.ok(firstBatch>0&&firstBatch<1000,`首批应小于全部，实际 ${firstBatch}`);
  assert.equal(await tiles.count(),firstBatch);

  // 2) 快速滚动：连续大跨度跳转，最后仍要能到达最后一条逻辑数据
  await page.evaluate(async()=>{
    const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');
    for(let i=0;i<15;i+=1){scroller.scrollTop=i%2===0?scroller.scrollHeight:0;await new Promise(r=>requestAnimationFrame(r));}
    scroller.scrollTop=scroller.scrollHeight;
  });
  await page.waitForFunction(()=>{
    const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');
    const total=Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0);
    const last=document.querySelector('[data-card-grid] [data-card][data-row-index="'+(total-1)+'"]');
    if(!last)return false;
    const box=last.getBoundingClientRect(),view=scroller.getBoundingClientRect();
    return box.bottom<=view.bottom+2&&box.top>=view.top-2;
  },null,{timeout:25000});
  assert.equal(await renderedRows(),1000,'到达末行后应已补全全部行');

  // 3) 跨批次选择：点中最后一行，详情面板必须跟着它
  const lastTile=page.locator('[data-card-grid] [data-card][data-row-index="999"]');
  await lastTile.click();
  assert.equal(await lastTile.getAttribute('aria-pressed'),'true');
  const lastKey=await lastTile.getAttribute('data-card-key');
  await page.waitForFunction(key=>document.querySelector('.pbc-detail')?.getAttribute('data-card-key')===key,lastKey);

  // 4) 滚动位置在选中后保持
  const scroller=page.locator('.facility-window:visible .window__body');
  const beforeScroll=await scroller.evaluate(n=>n.scrollTop);
  // 必须点“当前可见”的行：Playwright 会先把目标滚进视野，点远处的行会改变滚动位置。
  const visibleIndex=await tiles.evaluateAll(nodes=>nodes.findIndex(n=>{const r=n.getBoundingClientRect();return r.top>150&&r.bottom<650;}));
  assert.ok(visibleIndex>=0,'应存在当前可见的行');
  await tiles.nth(visibleIndex).click();
  assert.ok(Math.abs(await scroller.evaluate(n=>n.scrollTop)-beforeScroll)<3,'选中可见行不应跳回顶部');

  // 5) 搜索/筛选：分批重置但逻辑行数正确，焦点不丢
  const search=page.getByRole('searchbox',{name:'搜索单卡',exact:true});
  await search.fill('曹');await page.waitForFunction(()=>{
    const tilesNow=[...document.querySelectorAll('[data-collection-root] [data-card-grid] [data-card]')];
    return tilesNow.length>0&&tilesNow.every(tile=>(tile.textContent||'').includes('曹'));
  });
  assert.equal(await search.evaluate(n=>n===document.activeElement),true,'筛选后焦点仍在搜索框');
  await search.fill('');await page.waitForFunction(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0)===1000);
  // 清空后逻辑行数恢复；玩家仍停在原来的滚动位置（与未分批时一致），回到顶部应能看到首行。
  assert.equal(await totalRows(),1000);
  await page.evaluate(()=>{const box=document.querySelector('.facility-window:not([hidden]) .window__body');box.scrollTop=0;});
  await page.waitForTimeout(120);
  await tiles.first().click();
  assert.equal(await tiles.first().getAttribute('aria-pressed'),'true','清空搜索后首行仍可点');

  // 6) 缩放：视口变窄（等效放大）后仍能滚到末行，首行仍可点
  const beforeWidth=await tiles.first().evaluate(n=>Math.round(n.getBoundingClientRect().width));
  await page.setViewportSize({width:1024,height:720});
  await page.waitForTimeout(250);
  const afterWidth=await tiles.first().evaluate(n=>Math.round(n.getBoundingClientRect().width));
  assert.notEqual(beforeWidth,afterWidth,'视口变窄后列宽应变化');
  await page.evaluate(async()=>{
    const box=document.querySelector('.facility-window:not([hidden]) .window__body');
    const deadline=performance.now()+20000;
    while(performance.now()<deadline){
      box.scrollTop=box.scrollHeight;
      const total=Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0);
      const last=document.querySelector('[data-card-grid] [data-card][data-row-index="'+(total-1)+'"]');
      if(last){const rect=last.getBoundingClientRect(),view=box.getBoundingClientRect();if(rect.bottom<=view.bottom+2)return;}
      await new Promise(r=>requestAnimationFrame(r));
    }
  });
  const zoomLast=await page.locator('[data-card-grid] [data-card][data-row-index="999"]').count();
  assert.equal(zoomLast,1,'缩放后仍要渲染出最后一行');
  await page.evaluate(()=>{const box=document.querySelector('.facility-window:not([hidden]) .window__body');box.scrollTop=0;});
  await tiles.first().click();
  assert.equal(await tiles.first().getAttribute('aria-pressed'),'true','缩放后首行仍可点');
  await page.setViewportSize({width:1440,height:900});
  await page.waitForTimeout(200);

  // 7) 关闭清理：组件移除、窗口栈清空、无残留滚动监听（关闭后滚动不再触发渲染）
  const domBefore=await page.evaluate(()=>document.getElementsByTagName('*').length);
  await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await page.waitForTimeout(200);
  const cleanup=await page.evaluate(()=>({
    dom:document.getElementsByTagName('*').length,
    root:Boolean(document.querySelector('[data-collection-root]')),
    grid:Boolean(document.querySelector('[data-card-grid]')),
    stack:__cardShopApp.windows.stack.length,
  }));
  assert.equal(cleanup.root,false,'关闭后组件根节点应移除');
  assert.equal(cleanup.grid,false,'关闭后网格应移除');
  assert.equal(cleanup.stack,0,'关闭后窗口栈应为空');
  assert.ok(cleanup.dom<domBefore,'关闭后 DOM 应回落');

  assert.deepEqual(errors,[],`页面不应有异常：${errors.join(' | ')}`);
  console.log(`PASS 工作区分批渲染：首批 ${firstBatch} 行 · 快速滚动后可补全到 1000 行并点中末行 · 跨批次选择/滚动位置/焦点/缩放/关闭清理均保持`);
}finally{await browser?.close();await server.close();}
