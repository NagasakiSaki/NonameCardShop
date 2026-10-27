// tests/room-interruption.mjs — 正式对战房间里的真实异步引擎超时与恢复（OPT-06）。
//
// 复核指出的缺口：真实超时发生在挂载成功之后，由适配器异步回调 runtime.interrupt，
// 不会走 `await host.battle.mount()` 的 catch。本测试用真实 createBattleMount + 真实
// 计时器（把等待预算缩到 300ms）触发这条异步路径，然后回到正式房间验证：
//   分类提示、重开当前小局、放弃系列赛，以及卡锁 / 费用 / 暂停租约。
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
// 直接把店长放在报名台站位（battleRoom.service stand 376,88），省掉走路与导航依赖。
fixture.player.roomId='battle-room';fixture.player.x=376;fixture.player.y=88;fixture.player.moving=false;fixture.player.direction='down';
fixture.longTerm.loan.intro.status='acknowledged';
fixture.dialogueOffer=null;
for(const n of fixture.npcs.filter(n=>n.debtCollector)){n.presence='offsite';n.trip=null;}
fixture.npcs.push({actorId:'fixture-rival',name:'陈远',appearanceId:'competitor',presence:'onsite',roomId:'store',x:240,y:248,wallet:{available:50000},direction:'down',moving:false,activity:'idle'});
const generals=['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo'];
for(const [i,id]of generals.entries())for(const ownerId of ['player','fixture-rival']){
  const c=catalog.byId.get(id),ref=`ui-${ownerId}-${i}`;
  fixture.items[ref]={inventoryRef:ref,ownerId,kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,productId:c.pack,location:'collection',cost:0,lock:null,protected:false};
  fixture.circulation[c.cardKey]={firstDay:1,source:'fixture'};
}
const archive={format:'noname-shop-world-save',version:2,worldId:fixture.worldId,branchId:fixture.branchId,day:1,minute:480,slot:'start',world:fixture};

const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(25000);
  const q=(name,p={})=>page.evaluate(async({name,p})=>{const r=await __cardShopApp.query(name,p);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,p});
  const c=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({requestId:'room-int-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const until=async(fn,ms=30000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('房间中断条件超时');await page.waitForTimeout(120);}};
  const wallet=async()=>{const s=await q('shop.snapshot');return {available:s.wallet.available,debt:s.wallet.debt,escrow:s.wallet.escrowLiability};};
  const lockedRefs=async()=>{const rows=await q('inventory.list',{kind:'card',limit:200});return rows.items.filter(row=>row.locked).map(row=>row.inventoryRef).sort();};
  const pauseState=async()=>{
    const s=await q('shop.snapshot');
    assert.ok(Array.isArray(s.clock?.pauseReasons),'快照必须提供 clock.pauseReasons，不能把读错字段当作没有暂停');
    return {running:s.clock.running,reasons:s.clock.pauseReasons.map(r=>r.code).sort()};
  };

  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true);
  await c('saves.import',{content:JSON.stringify(archive)});await page.waitForTimeout(250);
  await c('business.open');
  await page.evaluate(()=>__cardShopApp.openPanel('combat',{opponentId:'fixture-rival'}));
  const room=page.locator('.v7-room');await room.locator('[data-format-id]').first().waitFor();
  await room.locator('[data-format-id="kof"]').click();
  await room.getByRole('button',{name:'创建房间并选将',exact:true}).click();
  await room.locator('[data-roster-pack="*"]').click();
  await room.locator('[data-combat-room]').waitFor();
  // 选三名（KOF 接力顺序即备战顺序）
  for(let i=0;i<3;i+=1)await room.locator('[data-roster-key="ui-player-'+i+'"]').click();
  await room.getByRole('button',{name:'确认整场备战',exact:true}).click();
  await until(async()=>(await q('combat.series'))?.phase==='selecting');
  await room.getByRole('button',{name:'确认本局选将',exact:true}).click();
  await until(async()=>(await q('combat.series'))?.phase==='confirmed');

  const series=(await q('combat.series'));
  const matchId=series.matchId;
  const beforeWallet=await wallet();
  const beforeLocked=await lockedRefs();
  const beforePause=await pauseState();
  assert.deepEqual(beforePause.reasons,['manual','window:combat-v7'],'夹具的手动暂停与真实房间租约应当可见');
  assert.ok(beforeLocked.length>=3,`备战应锁定至少 3 张实物，实际 ${beforeLocked.length}`);

  // 真实挂载 + 真实计时器：把等待预算缩到 300ms，让异步超时必然先于引擎就绪。
  const mounted=await page.evaluate(async({matchId})=>{
    const host=document.createElement('div');host.id='room-interruption-host';document.body.append(host);
    const handle=await __cardShopApp.host.battle.mount({container:host,matchId,loadTimeoutMs:300});
    return {returnedHandle:Boolean(handle&&typeof handle.dispose==='function')};
  },{matchId});
  assert.equal(mounted.returnedHandle,true,'挂载本身应成功返回句柄（超时是异步发生的）');

  // 异步超时必须把结构化 code 落到系列赛上，而不是只有一句文字。
  await until(async()=>(await q('combat.series'))?.phase==='interrupted');
  const interrupted=await q('combat.series');
  assert.equal(interrupted.interrupt?.code,'ENGINE_TIMEOUT',`中断应带结构化 code：${JSON.stringify(interrupted.interrupt)}`);
  assert.match(interrupted.interrupt?.reason||'',/载入超时/);

  // 中断不改变钱、不清比分、不释放卡锁、不残留暂停租约。
  assert.deepEqual(await wallet(),beforeWallet,'异步中断不能改钱包');
  assert.deepEqual(await lockedRefs(),beforeLocked,'中断后实物仍应锁定在系列赛里');
  const afterPause=await pauseState();
  assert.deepEqual(afterPause.reasons,[...beforePause.reasons,'match-time'].sort(),'中断应保留整场比赛与房间暂停，但不残留引擎暂停租约');

  // 正式房间必须按分类显示，而不是只显示一行 reason。
  await page.evaluate(()=>__cardShopApp.openPanel('combat'));
  const interruptCard=room.locator('[data-v7-interrupt="ENGINE_TIMEOUT"]');
  await interruptCard.waitFor();
  assert.match(await interruptCard.innerText(),/牌局载入超时/);
  assert.match(await interruptCard.innerText(),/不会重复扣费/);
  await room.getByRole('button',{name:'重开当前小局',exact:true}).waitFor();
  await room.getByRole('button',{name:'放弃系列赛',exact:true}).waitFor();

  // 重开：回到选将、清空中断、钱与卡锁不变、比分保留。
  await room.getByRole('button',{name:'重开当前小局',exact:true}).click();
  await until(async()=>(await q('combat.series'))?.phase==='selecting');
  const restarted=await q('combat.series');
  assert.equal(restarted.interrupt,null,'重开后中断信息必须清空');
  assert.deepEqual(restarted.score,interrupted.score,'重开不能改已结算比分');
  assert.deepEqual(await wallet(),beforeWallet,'重开不能重复扣费');
  assert.deepEqual(await lockedRefs(),beforeLocked,'重开后阵容仍锁定');

  // 放弃：系列赛关闭，卡锁释放，钱不变。
  await page.evaluate(()=>__cardShopApp.openPanel('combat'));
  // 重开后在选将阶段，取消入口是「取消准备」（combat.cancel）；live/confirmed 才是「整场认输」。
  const cancelEntry=room.getByRole('button',{name:'取消准备',exact:true});
  if(await cancelEntry.count())await cancelEntry.click();else await room.getByRole('button',{name:'整场认输',exact:true}).click();
  // 取消后 combat.series 可能返回 null（没有进行中的系列赛），两种情况都算结束。
  await until(async()=>{const current=await q('combat.series');return !current||['finished','cancelled'].includes(current.phase);});
  // 取消会把对手预付的桌费从托管退回，所以 escrow 应归零；玩家可用余额与欠款不变。
  const afterCancel=await wallet();
  assert.equal(afterCancel.available,beforeWallet.available,'取消系列赛不能扣玩家钱');
  assert.equal(afterCancel.debt,beforeWallet.debt,'取消系列赛不能产生欠款');
  assert.equal(afterCancel.escrow,0,'取消后桌费托管应释放');
  assert.deepEqual(await lockedRefs(),[],'放弃后应释放全部卡锁');
  assert.deepEqual(await pauseState().then(s=>s.reasons),beforePause.reasons,'取消后只应保留原有手动暂停和房间租约');
  await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await until(async()=>JSON.stringify((await pauseState()).reasons)===JSON.stringify(['manual']));
  await c('clock.setManualPause',{paused:false});
  await until(async()=>{const s=await pauseState();return s.running&&s.reasons.length===0;});

  assert.deepEqual(errors,[],`页面不应有异常：${errors.join(' | ')}`);
  console.log('PASS 正式房间异步超时：ENGINE_TIMEOUT 落到系列赛 → 分类提示 → 重开不清比分不重复扣费 → 放弃释放卡锁，全程无残留暂停租约');
}finally{await browser?.close();await server.close();}
