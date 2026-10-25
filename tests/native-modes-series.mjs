import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/native-modes';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('dialog',d=>d.accept());
  page.on('console',m=>{if(m.type()==='error')console.log('ENGINE',m.text().slice(0,1800));});
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/experiments/native-modes/index.html');await page.waitForFunction(()=>window.nativeHarness);
  const records=[];
  for(const mode of ['doudizhu','versus']){
    let wins=0,losses=0;const seriesId='native-fixture-series-'+mode;
    for(let i=0;i<3;i++){
      const scenario=mode==='doudizhu'?(i%2?'farmer':'landlord'):(i%2?'versus-alternate':'versus');
      await page.evaluate(({scenario,seriesId,roundNumber})=>nativeHarness.start(scenario,{seriesId,roundNumber}),{scenario,seriesId,roundNumber:i+1});
      await page.waitForFunction(()=>nativeHarness.events.some(e=>e.type==='ready'||e.type==='error'),null,{timeout:60000});
      assert.equal(await page.evaluate(()=>nativeHarness.events.find(e=>e.type==='ready'||e.type==='error').type),'ready');
      const frame=page.frames().find(f=>f.url().startsWith(server.engineOrigin+'/'));
      const shouldWin=i!==1;
      await frame.evaluate(async shouldWin=>{
        const {game,lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.duration=10;
        window.addEventListener('unhandledrejection',e=>console.error(e.reason?.stack||e.reason));
        const e=game.createEvent('shopSeriesDeathFixture',false);e.forceDie=true;e.setContent(async()=>{
          const side=game.shopNative.plan.playerTeamId;
          for(const b of game.shopNative.bindings.filter(b=>(b.seat.teamId===side)!==shouldWin))if(b.player.isAlive())await b.player.die();
        });if(!_status.auto)ui.click.auto('forced');game.resume();
      },shouldWin);
      await page.waitForFunction(()=>nativeHarness.events.some(e=>e.type==='result'||e.type==='error'),null,{timeout:25000});
      const result=await page.evaluate(()=>nativeHarness.events.find(e=>e.type==='result'||e.type==='error'));
      assert.equal(result.type,'result',JSON.stringify(result));assert.equal(result.result,shouldWin?'win':'loss');assert.equal(result.matchId,seriesId);assert.equal(result.roundId,'round-'+(i+1));assert(result.originVerified&&result.sourceVerified);
      if(shouldWin)wins++;else losses++;records.push({mode,scenario,round:i+1,result});
      if(i===0&&mode==='doudizhu'){
        await frame.evaluate(({result,conflict})=>{
          const params=new URLSearchParams(location.search);parent.postMessage({...result,channel:'noname-shop-native',token:params.get('nativeToken'),winningTeamId:conflict?null:result.winningTeamId},params.get('parentOrigin'));
        },{result,conflict:false});
        await page.waitForTimeout(50);assert.equal(await page.evaluate(()=>nativeHarness.events.filter(e=>e.type==='result').length),1);
        await frame.evaluate(result=>{const p=new URLSearchParams(location.search);parent.postMessage({...result,channel:'noname-shop-native',token:p.get('nativeToken'),winningTeamId:null},p.get('parentOrigin'));},result);
        await page.waitForFunction(()=>nativeHarness.events.some(e=>e.code==='RESULT_CONFLICT'));
        assert.equal(await page.evaluate(()=>nativeHarness.events.filter(e=>e.type==='result').length),1);
      }
      await page.evaluate(()=>nativeHarness.mount.dispose());assert.equal(await page.locator('iframe').count(),0);
    }
    assert.equal(wins,2);assert.equal(losses,1);console.log('PASS native three-round 2:1 bridge fixture',mode);
  }
  const lifecycle=await page.evaluate(async()=>{
    const {mountNativeRound}=await import('/integration/modes/index.mjs');
    const runtime=await fetch('/api/runtime').then(r=>r.json());
    const plan=await nativeHarness.start('versus');await nativeHarness.mount.dispose();
    let acquired=0,released=0;const seen=[];
    const mount=await mountNativeRound({container:document.querySelector('#arena'),plan,onEvent:e=>seen.push(e)},{engineOrigin:runtime.engineOrigin,loadTimeoutMs:1,acquirePause:async()=>{acquired++;return {leaseId:'fixture-pause'};},releasePause:async()=>{released++;}});
    await new Promise(r=>setTimeout(r,100));await mount.dispose();await mount.dispose();
    return {acquired,released,disposed:mount.disposed,frames:document.querySelectorAll('iframe').length,error:seen.find(e=>e.type==='error')?.code};
  });
  assert.deepEqual(lifecycle,{acquired:1,released:1,disposed:true,frames:0,error:'ENGINE_TIMEOUT'});
  assert.deepEqual(errors,[]);
  fs.writeFileSync(path.join(out,'native-series-fixture.json'),JSON.stringify({evidenceType:'engine-real-controlled-death-fixture',notStoreSeriesIntegration:true,records,lifecycle,errors},null,2));
  console.log('PASS native timeout/double-dispose releases frame and pause lease exactly once');
}finally{await browser?.close();await server.close();}
