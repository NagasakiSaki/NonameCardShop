import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/operations-v7';fs.mkdirSync(out,{recursive:true});
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json');
const r=await createRuntime({source,rules,repository:memoryRepository()}),fixture=r.inspect().world,catalog=buildCatalog(source,rules);
fixture.clock.manualPaused=true;fixture.longTerm.loan.intro.status='acknowledged';fixture.dialogueOffer=null;for(const n of fixture.npcs.filter(n=>n.debtCollector)){n.presence='offsite';n.trip=null;}
fixture.npcs.push({actorId:'fixture-rival',name:'陈远',appearanceId:'competitor',presence:'onsite',roomId:'store',x:240,y:248,wallet:{available:50000},direction:'down',moving:false,activity:'idle'});
const generals=['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo'];
for(const [i,id]of generals.entries())for(const ownerId of ['player','fixture-rival']){const c=catalog.byId.get(id),ref=`ui-${ownerId}-${i}`;fixture.items[ref]={inventoryRef:ref,ownerId,kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,productId:c.pack,location:'collection',cost:0,lock:null,protected:false};fixture.circulation[c.cardKey]={firstDay:1,source:'fixture'};}
const archive={format:'noname-shop-world-save',version:2,worldId:fixture.worldId,branchId:fixture.branchId,day:1,minute:480,slot:'start',world:fixture};
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.on('console',m=>{if(m.type()==='error'||m.type()==='warning')console.log('BROWSER',m.text().slice(0,1000));});page.setDefaultTimeout(20000);
  const q=(name,p={})=>page.evaluate(async({name,p})=>{const r=await __cardShopApp.query(name,p);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,p});
  const c=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({requestId:'v7-browser-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const until=async(fn,ms=75000)=>{const end=Date.now()+ms;while(!await fn()){if(Date.now()>end)throw Error('V7 store browser condition timed out');await page.waitForTimeout(100);}};
  const room=()=>page.locator('.v7-room'),close=()=>page.evaluate(()=>__cardShopApp.windows.closeAll());
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
  await c('saves.import',{content:JSON.stringify(archive)});await page.waitForTimeout(250);await c('business.open');
  await page.evaluate(()=>__cardShopApp.openPanel('combat',{opponentId:'fixture-rival'}));await room().locator('[data-format-id]').first().waitFor();
  assert.equal(await room().locator('[data-format-id]').count(),3);await page.screenshot({path:out+'/table-formats.png'});await close();
  // Walk through the real world route to the service desk while the world runs.
  await c('clock.setManualPause',{paused:false});await page.evaluate(()=>__cardShopApp.goToInteraction('battleRoom.service','combat',{opponentId:'fixture-rival'}));
  await room().locator('[data-format-id]').first().waitFor({timeout:45000});
  for(const formatId of ['kof','versus2v2-bo3','doudizhu-bo3']){
    if(!await room().count())await page.evaluate(()=>__cardShopApp.openPanel('combat',{opponentId:'fixture-rival'}));
    await room().locator(`[data-format-id="${formatId}"]`).click();await room().getByRole('button',{name:'创建房间并选将',exact:true}).click();
    const count={kof:3,'doudizhu-bo3':5,'versus2v2-bo3':8}[formatId],winsRequired=formatId==='kof'?1:2;
    await room().locator('[data-combat-room]').waitFor();
    const frozenPool=await q('combat.rooms');assert.equal(frozenPool.active.pools.enemy.length,count);
    await room().getByRole('button',{name:'查看对方备战池',exact:true}).click();
    const poolWindow=page.getByRole('dialog',{name:'房间备战池',exact:true});await poolWindow.locator('[data-room-pools] .v7-roster-card').first().waitFor();assert.equal(await poolWindow.locator('[data-room-pools] .v7-roster-card').count(),count);
    assert(await poolWindow.getByText(`固定名单 · ${count} 名武将`,{exact:true}).count());
    await poolWindow.getByRole('button',{name:'卡面与技能',exact:true}).first().click();const detail=page.getByRole('dialog',{name:'卡牌详情',exact:true});await detail.getByText('三模式等权平均',{exact:true}).waitFor();for(const label of ['1v1 三将接力 评分','斗地主 评分','2v2 评分'])assert(await detail.getByText(label,{exact:true}).count());await detail.getByRole('button',{name:'关闭 (Esc)',exact:true}).click();
    await page.screenshot({path:out+'/'+formatId+'-opponent-pool.png',animations:'disabled'});await poolWindow.getByRole('button',{name:'关闭 (Esc)',exact:true}).click();
    if(formatId==='versus2v2-bo3'){
      await page.setViewportSize({width:640,height:800});await room().getByRole('button',{name:'查看对方备战池',exact:true}).click();await poolWindow.locator('[data-room-pools] .v7-roster-card').first().waitFor();assert.equal(await poolWindow.locator('.v7-roster-card').count(),8);assert.equal(await poolWindow.getByRole('button',{name:'下一页',exact:true}).count(),0);await poolWindow.getByRole('button',{name:'关闭 (Esc)',exact:true}).click();await page.setViewportSize({width:1440,height:900});
    }
    for(let i=0;i<count;i++){const card=room().locator(`[data-roster-key="ui-player-${i}"]`);if(!await card.count())await room().getByRole('button',{name:'下一页',exact:true}).click();await card.click();}
    assert.equal(await room().locator('.v7-roster-card__art').first().evaluate(i=>i.complete&&i.naturalWidth>0),true);
    await page.screenshot({path:out+'/'+formatId+'-reserve.png'});
    await room().getByRole('button',{name:'确认整场备战',exact:true}).click();
    await page.waitForTimeout(200);const error=await room().locator('.v7-message').textContent();assert.equal(error,'',error);await room().getByRole('button',{name:'确认本局选将',exact:true}).waitFor();
    const records=[];
    for(let round=0;round<winsRequired;round++){
      const series=await q('combat.series'),picks=series.round.seatSkeleton.filter(s=>s.teamId==='mine').length;
      if(formatId!=='kof')for(let i=0;i<picks;i++)await room().locator(`[data-roster-key="ui-player-${i}"]`).click();
      await room().getByRole('button',{name:'确认本局选将',exact:true}).click();await room().getByRole('button',{name:'开始本局',exact:true}).click();
      await until(async()=>(await q('combat.series'))?.phase==='live');
      const frame=page.frames().find(f=>f.url().startsWith(server.engineOrigin+'/'));if(!frame)console.log('MISSING FRAME',formatId,round,page.frames().map(f=>f.url()),await room().locator('.v7-message').textContent(),JSON.stringify(await q('combat.series')));assert(frame);
      const state=await frame.evaluate(async()=>{const {game,lib,_status}=await import('/noname.js');return {mode:lib.config.mode,variant:_status.mode,seats:game.shopNative?game.shopNative.snapshot():game.shopDuel.teams.map(t=>({side:t.side,index:t.index}))};});
      if(formatId!=='kof')assert.equal(state.mode,formatId==='doudizhu-bo3'?'doudizhu':'versus');assert.equal(state.seats.length,formatId==='kof'?2:formatId==='doudizhu-bo3'?3:4);
      const minute=(await q('shop.snapshot')).clock.minute;await page.waitForTimeout(150);assert.equal((await q('shop.snapshot')).clock.minute,minute);
      if(formatId==='versus2v2-bo3'&&round===0){
        await room().getByRole('button',{name:'接管队友',exact:true}).click();
        await until(async()=>['controlPending','controlChanged'].includes((await q('combat.series')).control?.type));
        await frame.evaluate(async()=>{const {game,lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.duration=10;if(!_status.auto)ui.click.auto('forced');game.resume();});
        await until(async()=>(await q('combat.series')).control?.control?.activeSeatId==='mine-ally',25000);
        assert.equal(await frame.evaluate(async()=>(await import('/noname.js')).game.me._shopSeatId),'mine-ally');
        await room().getByRole('button',{name:'交还 AI',exact:true}).click();
        await frame.evaluate(async()=>{const {game,ui,_status}=await import('/noname.js');if(!_status.auto)ui.click.auto('forced');game.resume();});
        await until(async()=>(await q('combat.series')).control?.control?.activeSeatId==='mine-main',25000);
        console.log('PASS actual Host takeover and release via UI buttons');
      }
      // Controlled engine-death fixture: tests real Host/C/D settlement, not difficulty or balance.
      if(formatId==='kof'){
        for(let death=0;death<3;death++){
          await frame.evaluate(async()=>{const {game,lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.duration=10;const event=game.createEvent('storeKofDeathFixture',false);event.forceDie=true;event.setContent(async()=>{await game.shopDuel.teams[1].player.die();});if(!_status.auto)ui.click.auto('forced');game.resume();});
          if(death<2)await until(()=>frame.evaluate(async index=>{const {game}=await import('/noname.js');return game.shopDuel.teams[1].index>index;},death),25000);
        }
      }else await frame.evaluate(async()=>{const {game,lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.duration=10;const event=game.createEvent('v7StoreIntegrationDeathFixture',false);event.forceDie=true;event.setContent(async()=>{for(const b of game.shopNative.bindings.filter(b=>b.seat.teamId!=='mine'))if(b.player.isAlive())await b.player.die();});if(!_status.auto)ui.click.auto('forced');game.resume();});
      try{await until(async()=>['selecting','finished'].includes((await q('combat.series',{matchId:series.matchId}))?.phase),30000);}catch(e){console.log('SETTLEMENT TIMEOUT',formatId,round,JSON.stringify(await q('combat.series')),await room().locator('.v7-message').textContent(),await frame.evaluate(async()=>{const {game,_status}=await import('/noname.js');return {over:_status.over,paused:_status.paused,paused2:_status.paused2,auto:_status.auto,event:_status.event?.name,players:game.players.map(p=>[p.name,p.hp]),dead:game.dead.map(p=>p.name)};}).catch(e=>e.message));throw e;}
      records.push(await q('combat.series',{matchId:series.matchId}));
    }
    assert.equal(records.at(-1).score.mine,winsRequired);assert.equal(records.at(-1).phase,'finished');await until(async()=>await page.locator('.v7-battle iframe').count()===0);
    fs.writeFileSync(out+'/'+formatId+'-store-series.json',JSON.stringify({evidenceType:'real-store-host-controlled-engine-death-fixture',records},null,2));
    await room().getByRole('button',{name:'返回牌桌',exact:true}).click();
    console.log('PASS real store UI → reserve → round → engine → complete win',formatId);
  }
  await close();
  // A stage visit uses the actual navigation and the bottom overlay; no fake frontend offer.
  const daily=structuredClone(archive);daily.world.clock.day=3;daily.day=3;daily.world.clock.manualPaused=false;
  await c('saves.import',{content:JSON.stringify(daily)});await page.waitForTimeout(200);await c('business.open');
  await page.locator('[data-v7-dialogue]').waitFor({state:'visible',timeout:30000});assert.equal(await page.locator('.v7-dialogue__name').textContent(),'高松灯');
  const clock=(await q('shop.snapshot')).clock.minute;await page.waitForTimeout(400);assert.equal((await q('shop.snapshot')).clock.minute,clock);
  assert(await page.locator('.v7-dialogue__portrait-img').evaluate(i=>i.complete&&i.naturalWidth>0));
  await page.screenshot({path:out+'/challenger-dialogue.png'});
  await page.keyboard.press('Escape');await page.locator('[data-v7-dialogue]').waitFor({state:'hidden'});
  assert.equal((await q('progression.status')).currentStage.dueDay,4);
  await page.setViewportSize({width:390,height:720});await page.evaluate(()=>__cardShopApp.openPanel('allies'));await page.getByRole('dialog',{name:'高手伙伴与挑战',exact:true}).waitFor();await page.screenshot({path:out+'/allies-mobile.png'});
  assert.deepEqual(errors,[]);console.log('PASS physical challenger, portrait, pause lease, Esc postponement, mobile page; no page errors');
}finally{await browser?.close();await server.close();}
