// tests/dialogue-navigation.mjs — 场景对话打断“走过去开窗”后的安全恢复（OPT-07）。
//
// 真实流程：玩家点二级市场柜台 → 角色开始走 → 场景对话主动弹出（暂停世界，后端清空移动）
//           → 对话关闭后应接着走完并打开原窗口，而不是把点击悄悄吞掉。
// 这里用真实 Host + 真实剧情包触发对话，不用 mock。
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';

const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  page.setDefaultTimeout(20000);
  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true);
  await finishOpeningDialogue(page);

  const position=()=>page.evaluate(()=>{const p=__cardShopApp.getPlayer();return {x:p.x,y:p.y};});
  const TARGET='store.secondaryMarket';
  const distanceToTarget=()=>page.evaluate(id=>{
    const p=__cardShopApp.getPlayer(),map=__cardShopApp.currentMap();
    const target=map.interactions.find(item=>item.id===id).stand;
    return Math.hypot(p.x-target.x,p.y-target.y);
  },TARGET);

  const start=await position();
  const beforeDistance=await distanceToTarget();
  assert.ok(beforeDistance>150,`起点应离目标有足够距离，实际 ${beforeDistance}`);

  // 1) 点击二级市场柜台开始走（不给 panel，让 kind 自己决定打开哪个窗口）
  await page.evaluate(id=>__cardShopApp.goToInteraction(id),TARGET);
  await page.waitForTimeout(180);
  const walking=await position();
  assert.ok(Math.hypot(walking.x-start.x,walking.y-start.y)>2,'点击后应真的在移动');

  // 2) 走路途中触发一次真实场景对话
  await page.evaluate(async()=>{
    const s=__cardShopApp.snapshot();
    const r=await __cardShopApp.command({requestId:'nav-dialogue-'+crypto.randomUUID(),type:'narrative.start',payload:{worldId:s.worldId,branchId:s.branchId,campaignId:'corner_card_shop',chapterId:'chapter_00'}});
    if(!r.ok)throw Error(JSON.stringify(r.error));
  });
  const dialogue=page.getByRole('dialog',{name:'场景对话',exact:true});
  await dialogue.waitFor({timeout:15000});

  // 3) 对话期间必须停下（不能一边说话一边滑走）
  const atInterrupt=await position();
  await page.waitForTimeout(500);
  const settled=await position();
  assert.ok(Math.hypot(settled.x-atInterrupt.x,settled.y-atInterrupt.y)<2,'对话打断后必须停下');
  const midDistance=await distanceToTarget();
  assert.ok(midDistance>2,`对话应打断在中途，实际距柜台 ${midDistance}`);

  // 4) 关闭对话 → 应恢复原来的行走意图并打开柜台窗口
  await dialogue.getByRole('button',{name:'关闭对话'}).click();
  await dialogue.waitFor({state:'hidden'});
  await page.waitForFunction(()=>__cardShopApp.isNearInteraction('store.secondaryMarket'),null,{timeout:25000});
  await page.locator('.facility-window').waitFor({timeout:15000});

  const opened=await page.evaluate(()=>({depth:__cardShopApp.windows.depth,top:__cardShopApp.windows.stack.at(-1)?.id||null}));
  assert.ok(opened.depth>=1,'对话结束后应打开被中断的柜台窗口');
  assert.deepEqual(errors,[],`页面不应有异常：${errors.join(' | ')}`);
  console.log('PASS 对话打断导航：行走中被真实剧情对话打断会停下，关闭后接着走完并打开原柜台窗口');
}finally{await browser?.close();await server.close();}
