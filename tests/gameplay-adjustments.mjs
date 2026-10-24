import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {createWorld,validateWorld,enterCirculation} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {publishProducts,makeSealed} from '../modules/backend/products.mjs';
import {eligible,registerNpcMatch,advanceNpcSimulation} from '../modules/backend/matches.mjs';
import {purchaseRetail,openCustomerPurchase} from '../modules/backend/trading.mjs';
import {CHINESE_NAMES,migrateCustomerIdentity} from '../modules/backend/customer-identity.mjs';
import {validateMap,pathfind} from '../modules/backend/navigation.mjs';
import {debit} from '../modules/backend/common.mjs';
const source=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url))),rules=JSON.parse(fs.readFileSync(new URL('../data/backend-rules.json',import.meta.url)));
const c=buildCatalog(source,rules),products=publishProducts(c,rules,1),host=await createRuntime({source,rules,repository:memoryRepository()});
await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'adjustments'});let seq=0;
const query=async(name,payload={})=>{const r=await host.query(name,payload);assert.ok(r.ok,JSON.stringify(r));return r.data;};
const cmd=async(type,payload={},extra={})=>{const r=await host.command({requestId:'adjust-'+ ++seq,type,payload,...extra});assert.ok(r.ok,JSON.stringify(r));return r.data;};
const p=products.filter(p=>p.prices).sort((a,b)=>a.prices.pack.wholesale-b.prices.pack.wholesale)[0];
const q=await query('products.quote',{productId:p.productId,unit:'pack',quantity:3});
const request={requestId:'automatic-reward-idempotency',type:'supplier.placeOrder',quoteId:q.quoteId,payload:{productId:p.productId,quantity:3,unit:'pack'}};
assert.ok((await host.command(request)).ok);const before=host.inspect();
assert.equal(before.world.wallet.available,rules.startingCash-q.totalDebit+700,'starter, daily order and instant receipt rewards auto paid');
await host.command(request);assert.deepEqual(host.inspect(),before,'same request never pays twice');
let taskList=(await query('tasks.list'));assert.ok(taskList.find(t=>t.taskId==='daily-stock').claimed);assert.ok(taskList.find(t=>t.taskId==='first-order').claimed);
const archive=await cmd('saves.create');await cmd('business.open');for(let i=0;i<16;i++)await host.advance(1);
const order=(await query('supplier.orders')).items[0];assert.equal(order.status,'received');
const preview=await query('opening.preview',{quantity:1});await cmd('opening.execute',{}, {previewId:preview.previewId});
const cards=(await query('inventory.list',{kind:'card'})).items;assert.ok(cards.length);assert.ok((await query('combat.eligible')).items.every(i=>!i.disabledReasons.some(r=>r.code==='NOT_IN_CIRCULATION')));
assert.ok((await query('ledger.live')).items.some(e=>e.kind==='task'));assert.ok((await query('shop.snapshot')).cashJournal.length);
await cmd('business.close');await cmd('business.nextDay');taskList=(await query('tasks.list'));
assert.equal(taskList.find(t=>t.taskId==='daily-stock').progress,0);assert.equal(taskList.find(t=>t.taskId==='daily-stock').claimed,false);assert.ok(taskList.find(t=>t.taskId==='first-order').claimed);
await cmd('saves.load',{archiveId:archive.archiveId});const loadedBalance=host.inspect().world.wallet.available;await cmd('saves.create');assert.equal(host.inspect().world.wallet.available,loadedBalance,'loading paid rewards does not repeat payment');await host.disconnect();
for(const mode of ['bo3','kof']){
 const w=createWorld(rules);w.clock.phase='open';w.npcs=['a','b'].map(actorId=>({actorId,name:actorId,wallet:{available:1000},roomId:'battle-room',presence:'onsite',x:24,y:24,activity:'seated'}));
 for(const n of w.npcs)for(const [index,card]of c.activeCards.slice(0,3).entries()){const ref=n.actorId+index;w.items[ref]={inventoryRef:ref,kind:'card',ownerId:n.actorId,cardKey:card.cardKey,location:'collection',printedRarity:card.currentRarity,printVersion:'test',cost:0,protected:false,lock:null};}
 assert.ok(eligible(w,c,'a').every(i=>!i.eligible),'NPC remains restricted before circulation');
 for(const card of c.activeCards.slice(0,3))enterCirculation(w,card.cardKey,'test','fixture');
 const cash=w.wallet.available,m=registerNpcMatch(w,c,w.tables[0],w.npcs,{mode});assert.ok(m.simulated);assert.equal(w.wallet.available,cash);assert.equal(w.npcs[0].wallet.available,1000,'fees paid at exit, not entry');
 assert.throws(()=>debit(w.npcs[0].wallet,1000),e=>e.code==='INSUFFICIENT_FUNDS','reserved fee cannot be spent by another transaction');
 advanceNpcSimulation(w,c,m,9);assert.equal(m.status,'running');const saved=structuredClone(w);advanceNpcSimulation(saved,c,saved.matches[0],9);advanceNpcSimulation(w,c,m,9);
 assert.equal(m.status,'finished');assert.equal(w.tables[0].matchId,null);assert.equal(w.wallet.available-cash,20);assert.equal(w.npcs[0].wallet.available,990);assert.ok(w.npcs.every(n=>!n.currentMatchId&&n.returnAfterMatch));
 assert.deepEqual(w.seed,saved.seed);assert.deepEqual(w.matches,saved.matches,'saved simulation resumes with identical seeded result');const result=structuredClone(w);advanceNpcSimulation(w,c,m,100);assert.deepEqual(w,result,'finished simulation never charges twice');validateWorld(w);
}
const w=createWorld(rules);w.npcs=[{actorId:'buyer',name:'Maya Chen',wallet:{available:10000},appearanceId:'owner'}];migrateCustomerIdentity(w);assert.equal(w.npcs[0].name,CHINESE_NAMES[0]);
const pack=makeSealed(w,p,'pack',p.prices.pack.wholesale);pack.location='retail';purchaseRetail(w,w.npcs[0],pack,{deferOpening:true});const refs=openCustomerPurchase(w,c,w.npcs[0],pack.inventoryRef);assert.ok(refs.every(ref=>w.circulation[w.items[ref].cardKey]),'NPC pack cards all enter circulation');
const groups=new Map();for(const product of products.filter(p=>p.prices)){const value=groups.get(product.priceTier.id);if(value)assert.equal(product.prices.pack.wholesale,value);groups.set(product.priceTier.id,product.prices.pack.wholesale);assert.ok(Number.isFinite(product.averageStrength));}assert.ok(groups.size>=3);
// Exercise real map routing, paused simulation and automatic departure without an engine worker.
const maps=['store','battle-room'].map(id=>JSON.parse(fs.readFileSync(new URL(`../assets/frontend/maps/${id}.json`,import.meta.url))));
const nav=validateMap(maps[0]);for(const id of ['store.counter','store.checkout','store.opening'])assert.ok(pathfind(nav,maps[0].spawn,nav.anchors[id]).length);
const arena=createWorld(rules);arena.clock.phase='open';arena.clock.minute=540;arena.nextNpcMinute=10000;arena.products=products;
arena.npcs=['one','two'].map(actorId=>({actorId,name:actorId==='one'?'林知夏':'沈梨',presence:'onsite',appearanceId:'owner',wallet:{available:1000},roomId:'store',x:240,y:264,activity:'idle',visit:{elapsedSeconds:0,idleSeconds:600}}));
for(const [index,n]of arena.npcs.entries()){const card=c.activeCards[index],ref='runtime-'+index;arena.items[ref]={inventoryRef:ref,kind:'card',ownerId:n.actorId,cardKey:card.cardKey,location:'collection',printedRarity:card.currentRarity,printVersion:'test',cost:0,protected:false,lock:null};enterCirculation(arena,card.cardKey,'test',ref);}
const sim=await createRuntime({source,rules,maps,repository:memoryRepository({schemaVersion:2,revision:0,world:arena,archives:[],requests:{}})});await sim.connect({contractVersion:'card-shop-ui/1.0',clientId:'automatic-simulation'});
for(let i=0;i<250&&sim.inspect().world.matches[0]?.status!=='running';i++)await sim.advance(.25);
assert.equal(sim.inspect().world.matches[0]?.status,'running','NPCs route and start without any real engine');assert.equal(sim.backgroundState().matches.length,0,'simulated matches never reach the engine worker');
const lease=await sim.pause.acquire({ownerId:'test',reason:'测试交互暂停'}),elapsed=sim.inspect().world.matches[0].simulation.elapsedSeconds;await sim.advance(50);assert.equal(sim.inspect().world.matches[0].simulation.elapsedSeconds,elapsed);await sim.pause.release(lease.leaseId);
for(let i=0;i<500&&!sim.inspect().world.npcs.every(n=>n.presence==='offsite');i++)await sim.advance(.25);
const done=sim.inspect().world;assert.equal(done.matches[0].status,'finished');assert.equal(done.daily.service,20);assert.ok(done.npcs.every(n=>n.presence==='offsite'));assert.ok(done.cashJournal.some(e=>e.label.includes('NPC 离桌付费')));await sim.disconnect();
console.log('PASS gameplay adjustments: automatic daily rewards/idempotency/rewind, cash journal, player vs NPC eligibility, NPC BO3/KOF simulation fee/release/save determinism, real room routes/pause/auto departure, Chinese names, NPC opening circulation and strength tiers.');
