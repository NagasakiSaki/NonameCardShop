import fs from 'node:fs';import assert from 'node:assert/strict';import {chromium} from 'playwright';import {startShopServer} from '../server.mjs';
const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/playability-integration';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0}),browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
 const query=(name,p={})=>page.evaluate(async({name,p})=>{const r=await __cardShopApp.query(name,p);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,p});
 const command=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({requestId:'integration-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
 const close=async()=>{await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.waitForFunction(()=>!__cardShopApp.snapshot().clock.pauseReasons.length);};
 const until=async predicate=>{const deadline=Date.now()+15000;while(!await predicate()){if(Date.now()>deadline)throw Error('等待实际业务状态超时。');await new Promise(r=>setTimeout(r,80));}};
 const go=async(id,panel,scope={})=>{await page.evaluate(({id,panel,scope})=>__cardShopApp.goToInteraction(id,panel,scope),{id,panel,scope});await page.locator('[data-live-trade] .pbc-header').waitFor();await page.waitForFunction(id=>__cardShopApp.isNearInteraction(id),id);};
 await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
 const dayStart=(await query('saves.days')).items[0];
 await go('store.counter','supplier');
 assert.equal(await page.locator('[data-unbox-root]:visible').count(),0,'inactive tabs must actually be hidden');
 assert.equal(await page.locator('[data-collection-root]:visible').count(),0);
 for(let i=0;i<3;i++)await page.getByRole('button',{name:'＋ 加入购物篮',exact:true}).first().click();
 await page.getByRole('button',{name:'获取整篮报价',exact:true}).click();
 await page.evaluate(()=>{const send=__cardShopApp.host.command;let lose=true;__cardShopApp.host.command=async request=>{const r=await send(request);if(lose&&request.type==='supplier.placeBasketOrder'&&r.ok){lose=false;throw Error('测试：已入账但响应丢失');}return r;};});
 await page.getByRole('button',{name:'确认整篮采购',exact:true}).click();await page.getByRole('button',{name:'查询原操作结果',exact:true}).click();
 await page.getByRole('button',{name:'一键签收全部已到货',exact:true}).waitFor();assert.equal((await query('supplier.orders')).items[0].quantity,3);
 const minute=(await query('shop.snapshot')).clock.minute;await page.waitForTimeout(250);assert.equal((await query('shop.snapshot')).clock.minute,minute,'interaction freezes delivery and world time');
 await command('clock.setSpeed',{speed:4});await close();
 await until(async()=>(await query('supplier.orders')).items[0]?.status==='arrived');
 await go('store.counter','supplier',{purchaseTab:'arrive'});await page.getByRole('button',{name:'一键签收全部已到货',exact:true}).click();
 await until(async()=>(await query('inventory.sealedSummary')).items.reduce((n,x)=>n+x.warehouse,0)===3);
 await page.screenshot({path:out+'/trade.png'});await close();
 await go('store.opening','opening');await page.getByRole('button',{name:'全部散包',exact:true}).click();await page.getByRole('button',{name:'生成开包预览',exact:true}).click();
 assert.match(await page.locator('[data-unbox-root]').innerText(),/消耗 3 包/);
 await page.getByRole('button',{name:'确认开包',exact:true}).click();
 await until(async()=>(await query('inventory.list',{kind:'card'})).total===15);
 const skip=page.getByRole('button',{name:'跳过动画',exact:true});if(await skip.count())await skip.click();
 await close();await go('store.opening','opening');assert.match(await page.locator('[data-unbox-root]').innerText(),/这批卡已实际写入收藏/,'closing preserves the settled opening results');
 await close();await go('store.secondaryMarket','market',{tab:'collection'});
 const cards=page.locator('[data-collection-root] [data-card]');await cards.first().click();
 await page.getByRole('button',{name:'确认单卡上架',exact:true}).click();await until(async()=>(await query('market.list',{tab:'mine'})).total===1);
 await page.getByRole('button',{name:'查看大图与完整技能',exact:true}).click();await page.getByRole('heading',{name:'流通与准入',exact:true}).waitFor();await page.waitForFunction(()=>document.querySelector('.pbc-detail img')?.naturalWidth>0);
 assert.ok((await query('inventory.list',{kind:'card'})).total===15,'listing does not duplicate/destroy cards');await close();
 for(const kind of ['report','guide','customers']){
   await page.evaluate(kind=>__cardShopApp.openPanel(kind),kind);await page.locator('[data-live-management] .pc-root').waitFor();
   assert.doesNotMatch(await page.locator('[data-live-management]').innerText(),/演示回调成功|字段需求见 integration|C[123] 候选组件/);
   if(kind==='report')assert.match(await page.locator('[data-live-management]').innerText(),/今日任务 · 自动领奖/);
   await page.waitForTimeout(200);await page.screenshot({path:out+'/'+kind+'.png'});await close();
 }
 // Day rewind invalidates UI refs and clears global pending operations from the old branch.
 await command('saves.loadDay',{archiveId:dayStart.archiveId});await page.waitForFunction(()=>__cardShopApp.windows.depth===0);
 await go('store.counter','supplier');assert.equal((await query('inventory.list',{kind:'card'})).total,0);assert.equal((await query('shop.snapshot')).wallet.available,1200);
 await page.setViewportSize({width:406,height:1000});await page.screenshot({path:out+'/trade-406.png'});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));await close();
 // Pure component guard: two same-theme boxes still produce a one-box fast-opening preview.
 const boxScope=await page.evaluate(async()=>{
   const {mountUnbox}=await import('/frontend-next/components/workspace/unbox.mjs');const root=document.createElement('div');document.body.append(root);let scope;
   const v={worldId:'test',branchId:'a',atStation:{opening:true},sealed:[{productId:'test',name:'测试盒',kind:'box',warehouse:2,available:2,inventoryRefs:['box-one','box-two']}]};
   const c=mountUnbox({root,view:v,assets:{},notify(){},actions:{async openingPreview(p){scope=p;return {ok:true,data:{previewId:'test-only',packs:24,cards:120,boxes:1,excluded:0}};}}});
   [...root.querySelectorAll('button')].find(b=>b.textContent==='整盒快开').click();[...root.querySelectorAll('button')].find(b=>b.textContent==='生成开包预览').click();await new Promise(r=>setTimeout(r,0));const before=root.textContent;
   c.update({...v,branchId:'b'});const cleared=!root.textContent.includes('消耗 24 包');c.dispose();root.remove();return {scope,before,cleared};
 });
 assert.deepEqual(boxScope.scope.inventoryRefs,['box-one']);assert.ok(boxScope.cleared);assert.match(boxScope.before,/消耗 24 包/);assert.deepEqual(errors,[]);
 console.log('PASS playability integration: actual map navigation, isolated tabs, real basket/receipts, pause, all-pack opening/result retention, listing/detail, three management views, day rewind, 406px layout and one-box/branch-invalidated component preview.');
}catch(error){console.error(error);process.exitCode=1;}finally{await browser.close();await server.close();}
