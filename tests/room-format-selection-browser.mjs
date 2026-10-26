import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {CONTRACT} from '../modules/backend/common.mjs';

const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json'),catalog=buildCatalog(source,rules);
const r=await createRuntime({source,rules,repository:memoryRepository()});let seq=0;
await r.connect({contractVersion:CONTRACT,clientId:'format-fixture'});
const command=async(type,payload={})=>{const result=await r.command({requestId:'format-fixture-'+ ++seq,type,payload});assert(result.ok,JSON.stringify(result));return result.data;};
try{
  for(let day=1;day<3;day++){await command('business.open');await command('business.close');await command('business.nextDay');}
  await command('business.open');await r.advance(.1);
  const offer=await r.query('dialogue.offer');assert(offer.data);await command('dialogue.respond',{offerId:offer.data.offerId,optionId:'accept',proof:offer.data.proof});
}finally{await r.disconnect();}
const fixture=r.inspect().world;fixture.clock.manualPaused=true;
const desk=json('assets/frontend/maps/battle-room.json').interactions.find(i=>i.id==='battleRoom.service').stand;Object.assign(fixture.player,{roomId:'battle-room',...desk});
const challenger=fixture.progression.activeChallenge.actorId;assert.equal(fixture.progression.activeChallenge.status,'accepted');
fixture.npcs.push({actorId:'format-rival',name:'测试牌友',presence:'onsite',roomId:'store',x:240,y:248,direction:'down',moving:false,activity:'idle',wallet:{available:50000}});
for(const [i,id]of ['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo'].entries()){
  const card=catalog.byId.get(id),ref='format-rival-'+i;fixture.items[ref]={inventoryRef:ref,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,ownerId:'format-rival',location:'collection',lock:null,protected:false,cost:0};fixture.circulation[card.cardKey]={firstDay:3,source:'fixture'};
}
const archive={format:'noname-shop-world-save',version:2,worldId:fixture.worldId,branchId:fixture.branchId,day:3,minute:fixture.clock.minute,slot:'backup',world:fixture};
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('dialog',d=>d.accept());page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(15000);
  const q=(name,p={})=>page.evaluate(async({name,p})=>{const r=await __cardShopApp.query(name,p);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,p});
  const c=(type,payload)=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({requestId:'format-browser-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const room=()=>page.locator('.v7-room');
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
  await c('saves.import',{content:JSON.stringify(archive)});await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await page.evaluate(()=>__cardShopApp.openPanel('combat'));await room().locator('[data-format-id]').first().waitFor();
  assert.equal(await room().locator('[data-format-id]').count(),3,'accepted challenge must not hide normal table formats');
  assert.equal(await room().getByLabel('约战对手').inputValue(),'','ordinary table must not silently select the challenger');
  for(const [formatId,count]of [['kof',3],['doudizhu-bo3',5],['versus2v2-bo3',8]]){
    await room().locator(`[data-format-id="${formatId}"]`).click();assert(await room().locator(`[data-format-id="${formatId}"].is-selected`).count());
    await room().getByRole('button',{name:'创建房间并选将',exact:true}).click();await room().locator('[data-combat-room]').waitFor();
    const active=(await q('combat.rooms')).active;assert.equal(active.formatId,formatId);assert.equal(active.opponentId,'format-rival');assert.equal(active.kind,'friendly');assert.equal(active.pools.enemy.length,count);
    await room().getByRole('button',{name:'取消房间 / 更换模式',exact:true}).click();await room().locator('[data-format-id]').first().waitFor();assert.equal(await room().locator('[data-format-id]').count(),3);
  }
  await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.evaluate(opponentId=>__cardShopApp.openPanel('combat',{opponentId}),challenger);await room().locator('[data-format-id]').first().waitFor();
  assert.equal(await room().locator('[data-format-id]').count(),3);assert.equal(await room().getByLabel('约战对手').inputValue(),challenger);assert(await room().locator('[data-format-id="kof"].is-selected').count());
  await room().locator('[data-format-id="versus2v2-bo3"]').click();assert.equal(await room().getByLabel('约战对手').inputValue(),challenger);
  await room().getByLabel('约战对手').selectOption(challenger);assert(await room().locator('[data-format-id="versus2v2-bo3"].is-selected').count());
  await room().getByRole('button',{name:'创建房间并选将',exact:true}).click();await room().locator('[data-combat-room]').waitFor();const challengeRoom=(await q('combat.rooms')).active;assert.equal(challengeRoom.kind,'stage-challenge');assert.equal(challengeRoom.formatId,'versus2v2-bo3');
  assert.deepEqual(errors,[]);console.log('PASS accepted challenge does not hide or hijack three ordinary table formats; challenge supports the selected format, switch/cancel restores all formats');
}finally{await browser?.close();await server.close();}
