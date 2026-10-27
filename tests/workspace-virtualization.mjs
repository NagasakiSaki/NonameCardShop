// tests/workspace-virtualization.mjs — 交易工作区分批渲染的行为回归（OPT-13 第一项）。
//
// 验收点：分批只影响“什么时候画多少行”，不影响玩家能力——
//   连续滚动、全部行可达、跨筛选选择、实物定价绑定、焦点、滚动位置、卡面详情、关闭清理。
// 另外覆盖：快速滚动（连续大跨度跳转）、缩放（CSS 视口变窄）后的可达性。
import assert from 'node:assert/strict';
import {visibleGridCard} from './fixtures/visible-grid-card.mjs';
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
  let reached=false;
  for(let attempt=0;attempt<160&&!reached;attempt+=1){
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
  assert.ok(reached,'快速滚动后应能到达最后一条逻辑数据');
  assert.ok(await renderedRows()<120,'到达末行后仍保持有界 DOM，不累计整表');

  // 3) 跨批次选择：点中最后一行，详情面板必须跟着它
  const lastTile=page.locator('[data-card-grid] [data-card][data-row-index="999"]');
  await lastTile.click();
  assert.equal(await lastTile.getAttribute('aria-pressed'),'true');
  const lastKey=await lastTile.getAttribute('data-card-key');
  await page.waitForFunction(key=>document.querySelector('.pbc-detail')?.getAttribute('data-card-key')===key,lastKey);

  // 4) 滚动位置在选中后保持
  const scroller=page.locator('.facility-window:visible .window__body');
  const visible=await visibleGridCard(page),beforeScroll=await scroller.evaluate(n=>n.scrollTop);
  // 必须点“当前可见”的行：Playwright 会先把目标滚进视野，点远处的行会改变滚动位置。
  await visible.click();
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

  // 6) 普通滚轮跨批边界：每次追加不超过一批，不能在一次回调里补齐全表
  // 重新加载页面拿到全新的组件状态（窗口复用会保留已渲染行数，这是刻意的）。
  await page.reload();
  await page.waitForFunction(()=>window.__cardShopReady===true);
  await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
  await tiles.first().waitFor();
  const freshBatch=await renderedRows();
  assert.ok(freshBatch>0&&freshBatch<120,'新列表只渲染可见范围和缓冲');
  await tiles.first().hover();
  const wheelSteps=[];
  for(let i=0;i<5;i+=1){
    const before=await page.locator('[data-card-grid]').getAttribute('data-start-index');
    await page.mouse.wheel(0,2600);
    await page.waitForTimeout(140);
    const after=await page.locator('[data-card-grid]').getAttribute('data-start-index');
    wheelSteps.push(Number(after)-Number(before));
    assert.ok(await renderedRows()<120,'普通滚轮后 DOM 仍有界');
  }
  assert.ok(wheelSteps.some(delta=>delta>0),'普通滚轮应推进逻辑范围，不能只重复同一批卡');
  const afterWheel=await renderedRows();
  assert.ok(afterWheel<1000,`普通滚轮不应把整表一次补完，实际 ${afterWheel}`);

  // 7) 排队回调失效：滚动回调还在队列里时立刻筛选，旧网格不能再被追加，也不能污染共享状态
  const stale=await page.evaluate(async()=>{
    const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');
    const oldGrid=document.querySelector('[data-card-grid]');
    const oldRows=Number(oldGrid.getAttribute('data-rendered-rows'));
    // 先制造一次滚动（同步派发 scroll 让监听器排队 rAF），紧接着在同一个任务里改筛选
    scroller.scrollTop=scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll'));
    const input=document.querySelector('input[aria-label="搜索单卡"]');
    input.value='曹';input.dispatchEvent(new Event('input',{bubbles:true}));
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await new Promise(r=>setTimeout(r,120));
    const newGrid=document.querySelector('[data-card-grid]');
    return {
      oldRows,
      oldConnected:oldGrid.isConnected,
      oldRowsAfter:Number(oldGrid.getAttribute('data-rendered-rows')),
      newRows:Number(newGrid.getAttribute('data-rendered-rows')),
      newTotal:Number(newGrid.getAttribute('data-total-rows')),
      sameGrid:oldGrid===newGrid,
    };
  });
  assert.equal(stale.oldConnected,false,'筛选后旧网格应已脱离文档');
  assert.equal(stale.sameGrid,false,'筛选后应换成新网格');
  assert.equal(stale.oldRowsAfter,stale.oldRows,`旧网格不能再被追加：${stale.oldRows} → ${stale.oldRowsAfter}`);
  assert.ok(stale.newRows<=120,`新网格只应渲染自己的首批，实际 ${stale.newRows}`);
  assert.ok(stale.newTotal>0&&stale.newTotal<1000,`筛选后的逻辑行数应小于全部，实际 ${stale.newTotal}`);
  // 旧回调若写入共享的 chunkRows，清空筛选后新网格会被“恢复”成整表；这里必须回到首批。
  await page.evaluate(()=>{const box=document.querySelector('.facility-window:not([hidden]) .window__body');if(box)box.scrollTop=0;});
  await page.evaluate(()=>{
    const input=document.querySelector('input[aria-label="搜索单卡"]');
    input.value='';input.dispatchEvent(new Event('input',{bubbles:true}));
  });
  await page.waitForFunction(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0)===1000);
  await page.waitForTimeout(150);
  const afterClear=await renderedRows();
  assert.ok(afterClear<1000,`清空筛选后不应被旧回调污染成整表，实际 ${afterClear}`);
  assert.ok(afterClear<120,'清空筛选仍有界，不受旧回调污染');

  // 8) 排队回调失效（切页签）：同样的保护对页签切换生效
  const staleTab=await page.evaluate(async()=>{
    const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');
    const oldGrid=document.querySelector('[data-card-grid]');
    const oldRows=Number(oldGrid.getAttribute('data-rendered-rows'));
    scroller.scrollTop=scroller.scrollHeight;
    scroller.dispatchEvent(new Event('scroll'));
    const tab=[...document.querySelectorAll('.pbc-toolbar button')].find(node=>(node.textContent||'').trim()==='市场买入');
    tab.click();
    await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    await new Promise(r=>setTimeout(r,120));
    const newGrid=document.querySelector('[data-card-grid]');
    return {oldRows,oldRowsAfter:Number(oldGrid.getAttribute('data-rendered-rows')),oldConnected:oldGrid.isConnected,newRows:newGrid?Number(newGrid.getAttribute('data-rendered-rows')):0};
  });
  assert.equal(staleTab.oldConnected,false,'切页签后旧网格应已脱离文档');
  assert.equal(staleTab.oldRowsAfter,staleTab.oldRows,`切页签后旧网格不能再被追加：${staleTab.oldRows} → ${staleTab.oldRowsAfter}`);
  await page.evaluate(()=>{
    const tab=[...document.querySelectorAll('.pbc-toolbar button')].find(node=>(node.textContent||'').trim()==='收藏');
    if(tab)tab.click();
  });
  await tiles.first().waitFor();
  // 切页签不会清空搜索词，后面的缩放测试要的是完整列表。
  await search.fill('');
  await page.waitForFunction(()=>Number(document.querySelector('[data-card-grid]')?.getAttribute('data-total-rows')||0)===1000);

  // 9) 缩放：视口变窄（等效放大）后仍能滚到末行，首行仍可点
  const beforeWidth=await tiles.first().evaluate(n=>Math.round(n.getBoundingClientRect().width));
  await page.setViewportSize({width:1024,height:720});
  await page.waitForTimeout(250);
  const afterWidth=await tiles.first().evaluate(n=>Math.round(n.getBoundingClientRect().width));
  assert.notEqual(beforeWidth,afterWidth,'视口变窄后列宽应变化');
  await page.evaluate(async()=>{
    const deadline=performance.now()+20000;
    while(performance.now()<deadline){
      // 改视口可能重建窗口，每轮重新取滚动体，避免对着已脱离的节点设置 scrollTop。
      const box=document.querySelector('.facility-window:not([hidden]) .window__body');
      if(!box){await new Promise(r=>requestAnimationFrame(r));continue;}
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
  const actualFirst=page.locator('[data-card-grid] [data-row-index="0"]');await actualFirst.waitFor();await actualFirst.click();
  assert.equal(await actualFirst.getAttribute('aria-pressed'),'true','缩放后逻辑首行仍可点');
  // 真正换列：四列 -> 两列，且部分卡片变高，不能依赖固定行高。
  await page.setViewportSize({width:600,height:800});
  const listToggle=page.getByRole('button',{name:'卡牌列表',exact:true});if(await listToggle.isVisible())await listToggle.click();
  await page.waitForFunction(()=>{const grid=document.querySelector('[data-card-grid] .pbc-card-grid');return grid&&getComputedStyle(grid).gridTemplateColumns.split(' ').length===2;});
  await page.evaluate(()=>{const style=document.createElement('style');style.id='variable-height-probe';style.textContent='.pbc-card-tile[data-row-index^="1"]{min-height:430px!important}.pbc-card-tile[data-row-index^="1"] .pbc-card-tile__name{white-space:normal!important}';document.head.append(style);});
  await page.waitForFunction(()=>{const tile=document.querySelector('[data-row-index="1"]');return tile&&tile.getBoundingClientRect().height>=430;});
  for(const fraction of [0,.3,.8,1,0]){
    const status=await page.evaluate(async fraction=>{const box=document.querySelector('.facility-window:not([hidden]) .window__body');box.scrollTop=(box.scrollHeight-box.clientHeight)*fraction;for(let i=0;i<5;i++)await new Promise(r=>requestAnimationFrame(r));const rows=[...document.querySelectorAll('[data-card-grid] [data-card]')],bounds=box.getBoundingClientRect();return {count:rows.length,visible:rows.some(t=>{const r=t.getBoundingClientRect();return r.bottom>bounds.top&&r.top<bounds.bottom;}),positive:rows.every(t=>t.getBoundingClientRect().height>0)};},fraction);
    assert.ok(status.count<120&&status.positive&&status.visible,'变行高/换列时 DOM 有界且可见范围不能空白');
  }
  await page.evaluate(()=>document.getElementById('variable-height-probe').remove());
  await page.setViewportSize({width:1440,height:900});
  await page.waitForTimeout(200);

  // 整窗异步重建：保留选中卡和中间位置，布局缓存只能包含可克隆数据。
  await scroller.evaluate(n=>n.scrollTop=20000);await page.waitForTimeout(150);
  const candidate=await page.evaluate(()=>{const b=document.querySelector('.facility-window:not([hidden]) .window__body'),bounds=b.getBoundingClientRect(),nodes=[...document.querySelectorAll('[data-card-grid] [data-card]')];return {chosen:nodes.find(n=>{const r=n.getBoundingClientRect();return r.top>bounds.top+4&&r.bottom<bounds.bottom-4;})?.dataset.rowIndex,top:b.scrollTop,rect:[bounds.top,bounds.bottom],rows:nodes.slice(0,8).map(n=>({index:n.dataset.rowIndex,top:n.getBoundingClientRect().top,bottom:n.getBoundingClientRect().bottom}))};});
  const chosen=candidate.chosen;assert.ok(chosen,JSON.stringify(candidate));
  await page.locator('[data-card-grid] [data-row-index="'+chosen+'"]').click();
  const offset=await scroller.evaluate(n=>n.scrollTop),selectedKey=await page.locator('[data-card-grid] [aria-pressed="true"]').getAttribute('data-card-key');
  await page.evaluate(()=>__cardShopApp.windows.stack.find(w=>w.id==='trade-workspace').handle.refresh());
  await page.waitForFunction(key=>document.querySelector('[data-card-grid] [aria-pressed="true"]')?.dataset.cardKey===key,selectedKey);
  assert.ok(Math.abs(await scroller.evaluate(n=>n.scrollTop)-offset)<3,'整窗刷新后保留原滚动位置');

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
  console.log(`PASS 工作区虚拟网格：首屏 ${firstBatch} 行 · 1000 逻辑行可达、DOM有界 · 选择/焦点/变高/4转2列/整窗重建/失效回调/关闭清理保持`);
}finally{await browser?.close();await server.close();}
