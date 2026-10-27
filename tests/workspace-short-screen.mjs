// tests/workspace-short-screen.mjs — 短屏下的确认可达与搜索焦点（OPT-11）。
//
// 已有覆盖：pack-roster-browser 覆盖跨包多选/模式排序/右键详情/窄屏确认；
// trade-workspace-scroll 覆盖千行可达/排序/无分页/搜索焦点/选中后滚动保持。
// 本测试补的是**短屏高度**（560/480/420）下的正式入口行为：确认按钮在窗口内可滚动到达、
// 能真的提交成功，且搜索焦点与滚动位置不被重渲染打断。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';

const json=p=>JSON.parse(fs.readFileSync(p,'utf8'));
const source=json('data/cards.json'),rules=json('data/backend-rules.json');
const runtime=await createRuntime({source,rules,repository:memoryRepository()});
const fixture=runtime.inspect().world,catalog=buildCatalog(source,rules);
fixture.clock.manualPaused=true;
fixture.longTerm.loan.intro.status='acknowledged';
fixture.dialogueOffer=null;
// 站在二级市场柜台，省掉走路；12 张卡足够跨包与滚动。
fixture.player.roomId='store';fixture.player.x=376;fixture.player.y=104;fixture.player.moving=false;
for(const n of fixture.npcs.filter(n=>n.debtCollector)){n.presence='offsite';n.trip=null;}
const generals=['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo','lvmeng','xiahoudun','guojia','xunyu'];
for(const [i,id]of generals.entries()){
  const c=catalog.byId.get(id),ref=`ui-player-${i}`;
  // 二级市场只收 SR/SSR 印刷卡，夹具统一给 SR，才能验证真实上架。
  fixture.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:c.cardKey,printedRarity:'SR',productId:c.pack,location:'collection',cost:0,lock:null,protected:false};
}
const archive={format:'noname-shop-world-save',version:2,worldId:fixture.worldId,branchId:fixture.branchId,day:1,minute:480,slot:'start',world:fixture};

const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1280,height:560}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(20000);
  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true);
  await page.evaluate(async content=>{
    const r=await __cardShopApp.command({requestId:'short-import',type:'saves.import',payload:{content}});
    if(!r.ok)throw Error(JSON.stringify(r));
  },JSON.stringify(archive));
  await page.waitForTimeout(300);
  await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
  const tiles=page.locator('[data-collection-root] [data-card-grid] [data-card]');
  await tiles.first().waitFor();
  const confirm=page.getByRole('button',{name:'确认单卡上架',exact:true});
  const price=page.getByRole('spinbutton',{name:'单卡上架售价',exact:true});

  let listed=0;
  for(const [width,height] of [[1280,560],[1024,600],[1280,480],[900,420]]){
    await page.setViewportSize({width,height});
    await page.waitForTimeout(200);
    await tiles.nth(listed).click();
    await price.waitFor();
    // 窗口体必须能滚动，且把确认按钮滚进窗口体后它完整可见（不是被面板或视口裁掉）。
    const reach=await page.evaluate(()=>{
      const body=document.querySelector('.window__body');
      if(!body)return {ok:false,reason:'缺少 window__body'};
      const overflow=getComputedStyle(body).overflowY;
      const button=[...body.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认单卡上架');
      if(!button)return {ok:false,reason:'窗口体内没有确认按钮'};
      const bodyBox=body.getBoundingClientRect(),buttonBox=button.getBoundingClientRect();
      // 直接按几何关系滚动，避免 smooth 滚动导致读数不稳。
      body.scrollTop+=buttonBox.top-bodyBox.top-20;
      return {ok:true,overflow,scrollable:body.scrollHeight>body.clientHeight};
    });
    assert.equal(reach.ok,true,`${width}x${height}：${reach.reason||''}`);
    assert.match(reach.overflow,/auto|scroll/,`${width}x${height}：窗口体必须可滚动，实际 ${reach.overflow}`);
    assert.equal(reach.scrollable,true,`${width}x${height}：窗口体内容超出时应有滚动范围`);
    // 每次轮询都重新校正滚动位置：smooth 滚动或布局回流会让一次设定不够。
    // 断言不放宽——仍然是“确认按钮完整落在窗口体内且窗口体在视口内”。
    await page.waitForFunction(()=>{
      const body=document.querySelector('.window__body');
      const button=[...body.querySelectorAll('button')].find(b=>(b.textContent||'').trim()==='确认单卡上架');
      if(!button)return false;
      let bodyBox=body.getBoundingClientRect(),buttonBox=button.getBoundingClientRect();
      const inside=()=>bodyBox.top>=0&&bodyBox.bottom<=innerHeight+1&&buttonBox.top>=bodyBox.top-1&&buttonBox.bottom<=bodyBox.bottom+1;
      if(!inside()){body.scrollTop+=buttonBox.top-bodyBox.top-20;bodyBox=body.getBoundingClientRect();buttonBox=button.getBoundingClientRect();}
      return inside();
    },null,{timeout:15000});

    // 真的提交一次，证明短屏下确认不是“看得见点不动”。
    await price.fill(String(30+listed));
    await page.waitForTimeout(200);
    await confirm.click();
    await page.waitForFunction(async amount=>((await __cardShopApp.query('market.list',{tab:'mine'})).data.items||[]).some(i=>i.unitAmount===amount),30+listed);
    listed+=1;
    await page.evaluate(()=>__cardShopApp.windows.closeAll());
    await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
    await tiles.first().waitFor();
  }
  assert.equal(listed,4,'四个短屏尺寸都应完成一次真实上架');

  // 搜索焦点：过滤重渲染后输入框仍持有焦点，清空后恢复全部行。
  const search=page.getByRole('searchbox',{name:'搜索单卡',exact:true});
  await search.fill('曹');
  await page.waitForTimeout(200);
  assert.equal(await search.evaluate(node=>node===document.activeElement),true,'搜索过滤后焦点必须留在输入框');
  assert.ok(await tiles.count()>0&&await tiles.count()<12);
  await search.fill('');
  await page.waitForTimeout(200);
  assert.equal(await tiles.count(),12,'清空搜索后应恢复全部卡牌');

  // 选中一张后滚动位置保持（不跳回顶部）。
  const scrolled=await page.evaluate(()=>{
    const body=document.querySelector('.window__body');
    body.scrollTop=Math.min(200,body.scrollHeight-body.clientHeight);
    return body.scrollTop;
  });
  await tiles.first().click();
  await page.waitForTimeout(250);
  const afterSelect=await page.evaluate(()=>document.querySelector('.window__body').scrollTop);
  assert.ok(Math.abs(afterSelect-scrolled)<=2,`选中卡面后滚动位置应保持：${scrolled} → ${afterSelect}`);

  assert.deepEqual(errors,[],`页面不应有异常：${errors.join(' | ')}`);
  console.log('PASS 短屏工作区：1280x560 / 1024x600 / 1280x480 / 900x420 下确认按钮可滚动到达并真实提交，搜索焦点与选中后滚动位置保持');
}finally{await browser?.close();await server.close();}
