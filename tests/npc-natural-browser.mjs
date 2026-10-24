import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/npc-natural';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(req.url!=='/__natural_test')return false;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>Natural AI verification</title>');return true;}});let browser;
try{
  browser=await chromium.launch();
  await Promise.all(['bo3','kof'].map(async mode=>{
    const context=await browser.newContext();await context.addInitScript(()=>{let value=826412;Math.random=()=>((value=(Math.imul(value,1664525)+1013904223)>>>0)/4294967296);});const page=await context.newPage();page.on('dialog',d=>d.accept());const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(server.origin+'/__natural_test');
    await page.evaluate(async mode=>{
      const [{createRuntime},{memoryRepository},{createWorld},{buildCatalog},{publishProducts},{createNpcEngine},{registerNpcMatch}]=await Promise.all([import('/modules/backend/runtime.mjs'),import('/modules/backend/storage.mjs'),import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs'),import('/modules/backend/products.mjs'),import('/integration/npc-engine.mjs'),import('/modules/backend/matches.mjs')]);
      const [source,rules]=await Promise.all(['/data/cards.json','/data/backend-rules.json'].map(p=>fetch(p).then(r=>r.json()))),w=createWorld(rules),catalog=buildCatalog(source,rules);rules.npcSimulation=false;w.rules.npcSimulation=false;w.seed=826412;w.clock.phase='open';w.clock.minute=540;w.nextNpcMinute=100000;w.products=publishProducts(catalog,rules,1);
      w.npcs=['a','b'].map(actorId=>({actorId,name:actorId,appearanceId:'owner',wallet:{available:100},roomId:'battle-room',x:72,y:72,activity:'seated',presence:'onsite'}));
      for(const [ownerId,team]of [['a',mode==='kof'?['caocao','guanyu','zhaoyun']:['caocao']],['b',mode==='kof'?['zhangliao','xuzhu','machao']:['zhangliao']]])for(const id of team){const c=catalog.byId.get(id),ref=ownerId+'-'+id;w.items[ref]={inventoryRef:ref,ownerId,kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:'natural-test',location:'collection',cost:1,protected:false,lock:null};w.circulation[c.cardKey]={source:'test',day:1};}
      registerNpcMatch(w,catalog,w.tables[0],w.npcs,{mode});window.backend=await createRuntime({source,rules,repository:memoryRepository({schemaVersion:2,revision:0,world:w,archives:[],requests:{},legacyResetDone:true}),backgroundAvailable:true});await backend.connect({contractVersion:'card-shop-ui/1.0',clientId:'natural-'+mode});window.worker=createNpcEngine(backend,{intervalMs:100});worker.start();
    },mode);
    const trace=[],started=Date.now();let paused=false,finished;
    while(Date.now()-started<360000){
      const state=await page.evaluate(async()=>({match:backend.inspect().world.matches[0],diagnostics:(await backend.query('room.diagnostics')).data}));
      const m=state.match;trace.push({seconds:Math.floor((Date.now()-started)/1000),status:m.status,bout:m.bout,wins:m.wins,losses:m.losses,progress:m.progress,result:m.result,diagnostics:state.diagnostics});
      if(!paused&&m.lastReadyGameId===m.gameId&&m.status==='running'){
        paused=true;await page.evaluate(async()=>{window.lease=await backend.pause.acquire({ownerId:'test-bag',reason:'背包暂停验证'});await worker.pump();});
        const before=await page.evaluate(()=>backend.inspect().world.matches[0].results.length);await new Promise(resolve=>setTimeout(resolve,500));assert.equal(await page.evaluate(()=>backend.inspect().world.matches[0].results.length),before);assert.equal((await page.evaluate(()=>backend.query('room.snapshot'))).data.tables[0].note.includes('暂停'),true);
        await page.evaluate(async()=>{await backend.pause.release(lease.leaseId);await worker.pump();});
      }
      if(m.status==='finished'){finished=m;break;}await new Promise(resolve=>setTimeout(resolve,1000));
    }
    fs.writeFileSync(output+'/'+mode+'.json',JSON.stringify({mode,seed:826412,trace,errors},null,2));
    assert.ok(finished,mode+' did not finish naturally within 6 active minutes');assert.ok(['win','loss','draw'].includes(finished.result),JSON.stringify(finished));assert.ok(paused);assert.ok(finished.results.length>0);if(mode==='kof')assert.ok(Math.max(finished.progress.mine,finished.progress.enemy)>=1,'natural KOF must exercise relay');
    const final=await page.evaluate(async()=>{await worker.pump();await backend.advance(0);const w=backend.inspect().world;return {service:w.daily.service,escrow:w.wallet.escrowLiability,locks:Object.values(w.items).some(i=>i.lock),present:w.npcs.some(n=>n.presence!=='offsite'),table:w.tables[0].matchId,stats:w.stats};});
    assert.equal(final.service,20);assert.equal(final.escrow,0);assert.equal(final.locks,false);assert.equal(final.present,false);assert.equal(final.table,null);assert.ok(Object.keys(final.stats).length>0);assert.deepEqual(errors,[]);
    console.log('PASS natural '+mode+': original AI, no forced death/result, '+finished.results.length+' bout(s), '+Math.round((Date.now()-started)/1000)+'s, pause/resume, one fee/stat, released locks and offsite departure.');await page.evaluate(async()=>{await worker.dispose();await backend.disconnect();});await context.close();
  }));
}finally{await browser?.close();await server.close();}
