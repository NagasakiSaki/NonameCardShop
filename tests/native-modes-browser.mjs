import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/native-modes';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
  page.on('console',m=>{if(m.type()==='error')console.log('BROWSER',m.text().slice(0,240));});
  await page.goto(server.origin+'/experiments/native-modes/index.html');await page.waitForFunction(()=>window.nativeHarness);
  for(const scenario of ['landlord','farmer','versus','versus-alternate']){
    await page.evaluate(s=>nativeHarness.start(s),scenario);
    await page.waitForFunction(()=>nativeHarness.events.some(e=>e.type==='ready'||e.type==='error'),null,{timeout:75000});
    const event=await page.evaluate(()=>nativeHarness.events.find(e=>e.type==='ready'||e.type==='error'));
    assert.equal(event.type,'ready',JSON.stringify(event));assert.equal(event.seats.length,scenario.startsWith('versus')?4:3);
    assert.equal(event.seats.filter(s=>s.controlled).length,1);
    const frame=page.frames().find(f=>f.url().startsWith(server.engineOrigin+'/'));
    await frame.evaluate(async()=>{window.__nativeEngine=await import('/noname.js');});
    await frame.waitForFunction(()=>{const ui=__nativeEngine.ui;return Number(getComputedStyle(ui.arena).opacity)>.9&&Array.from(ui.arena.querySelectorAll('.player')).some(p=>Number(getComputedStyle(p).opacity)>.9);},null,{timeout:15000});
    const state=await frame.evaluate(async()=>{const {game,lib,_status}=await import('/noname.js');return {mode:lib.config.mode,variant:_status.mode,seats:game.shopNative.snapshot(),landlord:game.zhu?.name,landlordSkills:game.zhu?.getSkills(),phaseSwap:lib.config.mode_config.versus?.two_phaseswap};});
    if(scenario==='landlord'||scenario==='versus'){
      const ids=JSON.parse(fs.readFileSync('data/cards.json','utf8')).cards.map(c=>c.id);
      const blocked=await frame.evaluate(async ids=>{const {lib}=await import('/noname.js');return ids.map(id=>({generalId:id,reason:!lib.character[id]?'not-loaded':lib.filter.characterDisabled(id)?'native-config-disabled':null})).filter(c=>c.reason);},ids);
      fs.writeFileSync(path.join(out,scenario+'-eligibility-scan.json'),JSON.stringify({evidenceType:'engine-loaded-eligibility-scan',total:ids.length,blocked,notFullSkillRegression:true},null,2));
    }
    fs.writeFileSync(path.join(out,scenario+'-ready.json'),JSON.stringify({evidenceType:'engine-real-ready',event,state},null,2));
    await page.screenshot({path:path.join(out,scenario+'.png')});
    console.log('PASS native ready',scenario,state.mode,state.variant,event.seats.map(s=>s.generalId).join('/'));
    if(scenario==='farmer'||scenario==='versus'){
      const ally=event.seats.find(s=>s.teamId===event.seats.find(s=>s.controlled).teamId&&!s.controlled);
      async function switchControl(action,seatId){
        const id='switch-'+crypto.randomUUID();
        await page.evaluate(({id,action,seatId})=>nativeHarness.mount.control({requestId:id,action,seatId}),{id,action,seatId});
        await page.waitForFunction(id=>nativeHarness.events.some(e=>e.requestId===id),id);
        await frame.evaluate(async()=>{const {game,lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.duration=20;if(!_status.auto)ui.click.auto('forced');game.resume();});
        // 接管在下个回合边界生效：引擎在 vvfast 下通常 1~3 秒，但整组回归时机器被前序
        // 浏览器拖慢过，25 秒会偶发超时（2026-10-27 记录一次）。这里只放宽等待上限，
        // 不放宽断言：仍然必须真的收到 controlChanged 才算通过。
        await page.waitForFunction(id=>nativeHarness.events.some(e=>e.requestId===id&&e.type==='controlChanged'),id,{timeout:60000});
      }
      await switchControl('takeover',ally.seatId);assert.equal(await frame.evaluate(async()=>(await import('/noname.js')).game.me._shopSeatId),ally.seatId);
      await switchControl('release');assert.equal(await frame.evaluate(async()=>{const {game}=await import('/noname.js');return game.me._shopSeatId===game.shopNative.plan.controlledSeatId;}),true);
      // Explicit death fixture: verifies the native team keeps playing after the
      // captain dies. This is not counted as a natural full-match result.
      await frame.evaluate(async()=>{const {game,ui,_status}=await import('/noname.js');const e=game.createEvent('shopNativeDeathFixture',false);e.forceDie=true;e.setContent(async()=>{await game.me.die();game.shopNative.deathProbe={over:!!_status.over,mainDead:game.me.isDead(),alive:game.players.length};game.pause();});if(!_status.auto)ui.click.auto('forced');game.resume();});
      await frame.waitForFunction(()=>!!window.__nativeEngine.game.shopNative.deathProbe,null,{timeout:20000});
      const death=await frame.evaluate(async()=>(await import('/noname.js')).game.shopNative.deathProbe);assert(death.mainDead&&!death.over,JSON.stringify(death));
      await switchControl('takeover',ally.seatId);assert.equal(await frame.evaluate(async()=>(await import('/noname.js')).game.me._shopSeatId),ally.seatId);
      await frame.evaluate(()=>{const {game,_status,ui}=__nativeEngine;const e=game.createEvent('shopTakeoverVictoryFixture',false);e.forceDie=true;e.setContent(async()=>{for(const b of game.shopNative.bindings.filter(b=>b.seat.teamId!==game.shopNative.plan.playerTeamId))if(b.player.isAlive())await b.player.die();});if(!_status.auto)ui.click.auto('forced');game.resume();});
      await page.waitForFunction(()=>nativeHarness.events.some(e=>e.type==='result'||e.type==='error'),null,{timeout:25000});
      const won=await page.evaluate(()=>nativeHarness.events.find(e=>e.type==='result'||e.type==='error'));assert.equal(won.type,'result',JSON.stringify(won));assert.equal(won.result,'win','changing the controlled player does not change the player team');
      fs.writeFileSync(path.join(out,scenario+'-takeover.json'),JSON.stringify({evidenceType:'engine-real-controlled-death-fixture',initialCaptainDied:true,survivorTakeover:true,teamWinMappedCorrectly:true,result:won},null,2));
      console.log('PASS native optional takeover/release and survivor takeover',scenario);
    }
    await page.evaluate(()=>nativeHarness.mount.dispose());
  }
  if(!process.argv.includes('--controls-only'))for(const scenario of ['landlord','versus']){
    await page.evaluate(s=>nativeHarness.start(s),scenario);
    await page.waitForFunction(()=>nativeHarness.events.some(e=>e.type==='ready'||e.type==='error'),null,{timeout:60000});
    const frame=page.frames().find(f=>f.url().startsWith(server.engineOrigin+'/'));
    await frame.evaluate(async()=>{const {lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.duration=10;lib.config.animation=false;if(!_status.auto)ui.click.auto('forced');});
    await page.waitForFunction(()=>nativeHarness.events.some(e=>e.type==='result'||e.type==='error'),null,{timeout:180000});
    const result=await page.evaluate(()=>nativeHarness.events.find(e=>e.type==='result'||e.type==='error'));assert.equal(result.type,'result',JSON.stringify(result));assert(result.originVerified&&result.sourceVerified);
    fs.writeFileSync(path.join(out,scenario+'-natural-result.json'),JSON.stringify({evidenceType:'engine-real-ai-autoplay',injectedDeathOrWinner:false,result},null,2));
    console.log('PASS natural native result',scenario,result.result,result.round);await page.evaluate(()=>nativeHarness.mount.dispose());
  }
  assert.deepEqual(errors,[]);console.log('PASS four native mode seat/control startup scenarios');
}finally{await browser?.close();await server.close();}
