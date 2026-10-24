import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const service=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(req.url!=='/__npc_test__')return false;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>NPC backend test</title>');return true;}});
let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();page.on('dialog',d=>d.accept());page.on('pageerror',e=>console.log('PAGE',e.message));page.on('console',m=>{if(['error','warning'].includes(m.type()))console.log('BROWSER',m.text());});
  await page.goto(service.origin+'/__npc_test__');
  await page.evaluate(async()=>{
    const [{createRuntime},{memoryRepository},{createWorld},{buildCatalog},{publishProducts},{createNpcEngine}]=await Promise.all([
      import('/modules/backend/runtime.mjs'),import('/modules/backend/storage.mjs'),import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs'),import('/modules/backend/products.mjs'),import('/integration/npc-engine.mjs')]);
    const source=await fetch('/data/cards.json').then(r=>r.json()),rules=await fetch('/data/backend-rules.json').then(r=>r.json()),catalog=buildCatalog(source,rules),world=createWorld(rules);
    rules.npcSimulation=false;world.rules.npcSimulation=false;world.clock.phase='open';world.clock.minute=540;world.products=publishProducts(catalog,rules,1);
    world.npcs=[{actorId:'npc-a',name:'A',appearanceId:'novice',wallet:{available:100},roomId:'store',x:240,y:272,activity:'idle'},{actorId:'npc-b',name:'B',appearanceId:'competitive',wallet:{available:100},roomId:'store',x:240,y:272,activity:'idle'}];
    for(const [ref,ownerId,generalId] of [['a','npc-a','caocao'],['b','npc-b','zhangliao'],['player-card','player','liubei']]){const c=catalog.byId.get(generalId);world.items[ref]={inventoryRef:ref,ownerId,kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:'test',location:'collection',protected:false,lock:null,cost:1};world.circulation[c.cardKey]={source:'test',day:1};}
    window.backend=await createRuntime({source,rules,repository:memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true}),backgroundAvailable:true});
    await backend.connect({contractVersion:'card-shop-ui/1.0',clientId:'npc-browser'});await backend.advance(0);window.worker=createNpcEngine(backend,{intervalMs:100});worker.start();
  });
  for(let round=1;round<=2;round++){
    try{await page.waitForFunction(round=>{const m=backend.inspect().world.matches[0];return m.status==='running'&&m.bout===round&&m.lastReadyGameId===m.gameId;},round,{timeout:30000});}
    catch(error){console.log('BACKGROUND',await page.evaluate(()=>backend.backgroundState()));for(const frame of page.frames().slice(1))console.log('ENGINE',await frame.evaluate(async()=>{const {game,_status}=await import('/noname.js');return {text:document.body.innerText.slice(0,300),paused2:_status.paused2,auto:_status.auto,event:_status.event?.name,duel:!!game.shopDuel};}));throw error;}
    const frame=await page.locator('iframe[data-shop-npc-engine]').elementHandle().then(h=>h.contentFrame());
    await frame.evaluate(async()=>window.__engine=await import('/noname.js'));
    assert.equal(await frame.evaluate(()=>window.__engine._status.auto),true,'background seat must be controlled by the original AI');
    if(round===1){
      await page.evaluate(async()=>{window.bagLease=await backend.pause.acquire({ownerId:'bag',reason:'背包'});await worker.pump();});
      await frame.waitForFunction(()=>window.__engine._status.paused2===true);
      assert.equal(await page.evaluate(()=>backend.backgroundState().paused),true);
      await page.evaluate(async()=>{await backend.pause.release(bagLease.leaseId);await worker.pump();});
      await frame.waitForFunction(()=>window.__engine._status.paused2===false);
    }
    await frame.waitForFunction(()=>window.__engine.game.roundNumber>=1,null,{timeout:15000});
    // End an actual engine life to keep the regression deterministic and short.
    await frame.evaluate(()=>{const {game}=window.__engine;const event=game.createEvent('npcBackendDefeatFixture',false);event.forceDie=true;event.setContent(async()=>{await game.players.find(p=>p!==game.me).die();});game.resume();});
    await page.waitForFunction(wins=>backend.inspect().world.matches[0].wins===wins,round,{timeout:20000});
  }
  const result=await page.evaluate(()=>{const w=backend.inspect().world,m=w.matches[0];return {result:m.result,wins:w.stats['noname-1.11.6:caocao|bo3'].wins,losses:w.stats['noname-1.11.6:zhangliao|bo3'].losses,fee:w.daily.service,escrow:w.wallet.escrowLiability,balanceA:w.npcs.find(n=>n.actorId==='npc-a').wallet.available,balanceB:w.npcs.find(n=>n.actorId==='npc-b').wallet.available,locked:!!w.items.a.lock};});
  assert.deepEqual(result,{result:'win',wins:1,losses:1,fee:20,escrow:0,balanceA:90,balanceB:90,locked:false});
  await page.evaluate(async()=>{
    await worker.dispose();const {createBattleMount}=await import('/integration/host-battle.mjs');const preview=(await backend.query('combat.preview',{mode:'bo3',opponentId:'npc-a',inventoryRefs:['player-card']})).data;
    const registered=await backend.command({requestId:'foreground-register',type:'combat.register',previewId:preview.previewId});if(!registered.ok)throw Error(JSON.stringify(registered));window.playerMatchId=registered.data.matchId;
    const container=document.createElement('div');container.id='player-engine';container.style.height='640px';document.body.append(container);window.playerMount=await createBattleMount(backend)({container,matchId:playerMatchId});
  });
  await page.waitForFunction(()=>{const m=backend.inspect().world.matches.find(m=>m.matchId===playerMatchId);return m.lastReadyGameId===m.gameId;},null,{timeout:30000});
  const playerFrame=await page.locator('#player-engine iframe').elementHandle().then(h=>h.contentFrame());
  assert.equal(await playerFrame.evaluate(async()=>{const {_status,lib}=await import('/noname.js');return !_status.auto&&lib.configprefix==='packer_match_v1_';}),true,'NPC autoplay must not leak into the human table');
  await page.evaluate(async()=>{await backend.command({requestId:'foreground-withdraw',type:'combat.surrender',payload:{matchId:playerMatchId}});playerMount.dispose();await backend.disconnect();});
  console.log('PASS real NPC engine: automatic seats, pause/resume, actual BO3 results, one table fee/stat, and isolated manual player table.');
}finally{await browser?.close();await service.close();}
