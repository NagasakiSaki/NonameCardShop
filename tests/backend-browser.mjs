import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const service=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(req.url!=='/__backend_test__')return false;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><div id="engine" style="height:650px"></div>');return true;}});
let browser;
try{
  browser=await chromium.launch({headless:true});const page=await browser.newPage();
  page.on('console',m=>{if(['warning','error'].includes(m.type()))console.log('BROWSER',m.text());});
  page.on('pageerror',e=>console.log('PAGE ERROR',e.message));
  page.on('dialog',dialog=>dialog.accept());
  await page.goto(service.origin+'/__backend_test__');
  const result=await page.evaluate(async()=>{
    const {createHost}=await import('/integration/frontend-host.mjs');
    localStorage.setItem('noname-packer-v1','old-test-save');localStorage.setItem('unrelated-test-key','keep');
    const first=await createHost();await first.connect({contractVersion:'card-shop-ui/1.0',clientId:'browser-test'});
    const oldRemoved=localStorage.getItem('noname-packer-v1')===null,otherKept=localStorage.getItem('unrelated-test-key')==='keep';
    const pause=await first.pause.acquire({ownerId:'test',reason:'浏览器持久化测试'});
    const response=await first.command({requestId:'persistent-manual-pause',type:'clock.setManualPause',payload:{paused:true}});
    await first.pause.release(pause.leaseId);await first.disconnect();
    const second=await createHost();await second.connect({contractVersion:'card-shop-ui/1.0',clientId:'browser-reconnect'});
    const snap=await second.query('shop.snapshot');await second.disconnect();
    return {oldRemoved,otherKept,persisted:snap.data.clock.manualPaused,commandOK:response.ok};
  });
  assert.deepEqual(result,{oldRemoved:true,otherKept:true,persisted:true,commandOK:true});

  await page.evaluate(async()=>{
    const [{createRuntime},{memoryRepository},{createWorld},{buildCatalog},{publishProducts},{createBattleMount}]=await Promise.all([
      import('/modules/backend/runtime.mjs'),import('/modules/backend/storage.mjs'),import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs'),import('/modules/backend/products.mjs'),import('/integration/host-battle.mjs')]);
    const source=await fetch('/data/cards.json').then(r=>r.json()),rules=await fetch('/data/backend-rules.json').then(r=>r.json()),world=createWorld(rules),catalog=buildCatalog(source,rules);world.products=publishProducts(catalog,rules,1);
    world.clock.phase='open';world.npcs.push({actorId:'npc-test',name:'测试对手',appearanceId:'competitive',wallet:{available:1500},roomId:'store',x:200,y:200});
    for(const [ref,ownerId,generalId] of [['mine','player','caocao'],['enemy','npc-test','zhangliao']]){
      const card=catalog.byId.get(generalId);world.items[ref]={inventoryRef:ref,ownerId,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,printVersion:'test',location:'collection',protected:false,lock:null,cost:10};world.circulation[card.cardKey]={source:'test-fixture',day:1};
    }
    window.backend=await createRuntime({source,rules,repository:memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true})});
    await backend.connect({contractVersion:'card-shop-ui/1.0',clientId:'engine-test'});
    const preview=(await backend.query('combat.preview',{mode:'bo3',opponentId:'npc-test',inventoryRefs:['mine']})).data;
    const registered=await backend.command({requestId:'register',type:'combat.register',previewId:preview.previewId,payload:{}});if(!registered.ok)throw Error(JSON.stringify(registered));
    window.matchId=registered.data.matchId;window.mount=createBattleMount(backend);
    const started=await backend.command({requestId:'start',type:'combat.start',payload:{matchId}});if(!started.ok)throw Error(JSON.stringify(started));
    window.mounted=await mount({container:document.querySelector('#engine'),matchId});
  });
  for(let round=1;round<=2;round++){
    try{await page.waitForFunction(()=>{const m=backend.inspect().world.matches[0];return m.lastReadyGameId===m.gameId;},null,{timeout:15000});}
    catch(error){for(const f of page.frames().slice(1))console.log('LOADING',f.url(),await f.evaluate(()=>({url:location.href,text:document.body.innerText.slice(0,1500),ready:document.readyState})));throw error;}
    const frame=await page.waitForSelector('#engine iframe').then(h=>h.contentFrame());
    await frame.evaluate(async()=>window.__engine=await import('/noname.js'));
    await frame.waitForFunction(()=>window.__engine.game.shopDuel&&window.__engine._status.imchoosing,null,{timeout:30000});
    await frame.evaluate(async()=>{
      const {game,ui,_status}=await import('/noname.js');const event=game.createEvent('backendTestDefeat',false);event.forceDie=true;
      event.setContent(async()=>{await game.players.find(p=>p!==game.me).die();});if(!_status.auto)ui.click.auto();game.resume();
    });
    try{await page.waitForFunction(wins=>backend.inspect().world.matches[0].wins===wins,round,{timeout:20000});}
    catch(error){console.log('MATCH',await page.evaluate(()=>backend.inspect().world.matches[0]));console.log('ENGINE',await frame.evaluate(async()=>{const{game,_status}=await import('/noname.js');return {event:_status.event.name,auto:_status.auto,paused:_status.paused,over:_status.over,pending:[...game.shopDuel.pending]};}));throw error;}
    await page.evaluate(()=>mounted.dispose());
    if(round===1)await page.evaluate(async()=>{await backend.command({requestId:'continue',type:'combat.continue',payload:{matchId}});mounted=await mount({container:document.querySelector('#engine'),matchId});});
  }
  const match=await page.evaluate(()=>{const w=backend.inspect().world;return {status:w.matches[0].status,result:w.matches[0].result,games:w.stats['noname-1.11.6:caocao|bo3'].wins,escrow:w.wallet.escrowLiability,service:w.daily.service,locked:!!w.items.mine.lock};});
  assert.deepEqual(match,{status:'finished',result:'win',games:1,escrow:0,service:10,locked:false});
  await page.evaluate(()=>backend.disconnect());
  console.log('PASS backend browser: IndexedDB reconnect, scoped legacy reset, preserved unrelated storage, actual noname BO3 2:0, one stat and one service fee.');
}finally{await browser?.close();await service.close();}
