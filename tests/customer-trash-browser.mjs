import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/customer-trash';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  // Seed a separate test origin through the production repository; never touch the player's dev save.
  await page.goto(server.origin+'/data/backend-rules.json');
  const fixture=await page.evaluate(async()=>{
    const [{createWorld},{buildCatalog},{publishProducts,makeSealed},{browserRepository},{validateMap}]=await Promise.all([import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs'),import('/modules/backend/products.mjs'),import('/modules/backend/storage.mjs'),import('/modules/backend/navigation.mjs')]);
    const [source,rules,mapSource]=await Promise.all(['/data/cards.json','/data/backend-rules.json','/assets/frontend/maps/store.json'].map(p=>fetch(p).then(r=>r.json())));
    rules.npcAutoBattles=false;rules.minutesPerSecond=.1;rules.maxNpcs=3;rules.customerBehavior={...rules.customerBehavior,discardChance:{N:1,R:1,SR:0,SSR:0},scavengerChance:0};
    const w=createWorld(rules),catalog=buildCatalog(source,rules),map=validateMap(mapSource),counter=map.anchors['store.counter'],trash=map.anchors['store.trash'],entry=map.anchors['store.entry'];
    w.clock.phase='open';w.clock.minute=540;w.seed=42;w.nextNpcMinute=10000;w.products=publishProducts(catalog,rules,1);w.player.x=trash.x;w.player.y=trash.y;
    const npc=(id,name,scavenger,budget)=>({actorId:id,name,appearanceId:'rookie',wallet:{available:budget},roomId:'store',...entry,direction:'up',moving:false,activity:'idle',scavenger});
    w.npcs=[{...npc('buyer','拆包顾客',false,10000),...counter,trip:{stage:'checkout',path:[],waitSeconds:.25}},npc('poor','拾荒顾客',true,0),npc('ordinary','普通低预算顾客',false,0)];
    const product=w.products.find(p=>p.availability==='available'),pack=makeSealed(w,product,'pack',100);pack.location='retail';
    const cards=[...catalog.cards.filter(c=>c.currentRarity==='N').slice(0,3),catalog.cards.find(c=>c.currentRarity==='R'),catalog.cards.find(c=>c.currentRarity==='SSR')];
    pack.cards=cards.map(c=>({cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:'test'}));
    const repo=browserRepository();await repo.commit({schemaVersion:2,revision:0,world:w,archives:[],requests:{},legacyResetDone:true},null);await repo.close();
    return {keys:cards.map(c=>c.cardKey),quantity:5};
  });
  await page.goto(server.origin+'/frontend/index.html?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);
  const query=(name,p={})=>page.evaluate(async({name,p})=>(await __cardShopApp.host.query(name,p)).data,{name,p});
  async function waitForCount(location,count){const started=Date.now();while(Date.now()-started<20000){if((await query('inventory.list',{kind:'card',location})).total===count)return;await page.waitForTimeout(100);}throw Error(`inventory ${location} did not reach ${count}`);}
  await page.waitForFunction(()=>__cardShopApp.snapshot().actors.find(n=>n.actorId==='buyer')?.activity==='opening');
  assert.equal((await query('inventory.list',{location:'trash'})).total,0);
  const startSnapshot=await query('shop.snapshot');assert.ok(['拆卡包','前往拆包台'].includes(startSnapshot.actors.find(n=>n.actorId==='buyer').label));
  await page.waitForFunction(()=>__cardShopApp.snapshot().actors.find(n=>n.actorId==='buyer')?.activity==='discarding',null,{timeout:15000});
  await waitForCount('trash',2);
  await page.evaluate(()=>__cardShopApp.goToInteraction('store.trash'));await page.waitForFunction(()=>__cardShopApp.windows.depth>0);
  try{await page.getByRole('button',{name:'捡回一张',exact:true}).first().waitFor({timeout:5000});}catch(error){console.error(await page.evaluate(()=>({text:document.body.innerText,snapshot:__cardShopApp.snapshot()})));await page.screenshot({path:path.join(output,'failure.png')});throw error;}assert.match(await page.locator('.facility-window').innerText(),/弃牌来源：拆包顾客/);
  const minute=(await query('shop.snapshot')).clock.minute;await page.waitForTimeout(1000);assert.equal((await query('shop.snapshot')).clock.minute,minute,'trash interaction pauses customers and clock');
  await page.getByRole('button',{name:'捡回一张',exact:true}).first().click();await waitForCount('trash',1);
  assert.equal((await query('inventory.list',{kind:'card',location:'collection'})).total,1);
  await page.screenshot({path:path.join(output,'shared-trash.png')});
  await page.keyboard.press('Escape');
  await waitForCount('trash',0);
  const people=(await query('management.people')).customers;assert.equal(people.find(n=>n.actorId==='poor').ownedCards,1);assert.equal(people.find(n=>n.actorId==='ordinary').ownedCards,0);
  const mine=(await query('inventory.list',{kind:'card',location:'collection'})).items[0];assert.equal(mine.eligible,true);assert.ok(fixture.keys.includes(mine.cardKey));
  await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);assert.equal((await query('inventory.list',{kind:'card',location:'collection'})).total,1);assert.equal((await query('inventory.list',{location:'trash'})).total,0);assert.deepEqual(errors,[]);
  await page.evaluate(()=>__cardShopApp.host.disconnect());console.log('PASS real frontend customer trash: visible buyer stages, actual discarded cards and provenance, paused pickup window, one-card transfer, poor NPC walking pickup, ordinary NPC exclusion and IndexedDB reload.');
}finally{await browser?.close();await server.close();}
