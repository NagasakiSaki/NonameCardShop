import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {createWorld,note,validateWorld,enterCirculation} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {publishProducts,makeSealed} from '../modules/backend/products.mjs';
import {arriveCustomer,departCustomer} from '../modules/backend/visits.mjs';
import {customerFeedback,customerDecision,purchaseRetail} from '../modules/backend/trading.mjs';
import {discardCard,pickTrashCard} from '../modules/backend/trash.mjs';
import {experienceInsights,experienceStories,experienceGuide,validateExperienceConfig} from '../modules/backend/experience.mjs';
import {DEFAULT_SHOP_EXPERIENCE} from '../data/shop-experience.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url)));
const source=read('data/cards.json'),rules=read('data/backend-rules.json'),management=read('data/backend-management.json'),catalog=buildCatalog(source,rules);
const products=publishProducts(catalog,rules,1),product=products.filter(p=>p.prices).sort((a,b)=>a.prices.pack.wholesale-b.prices.pack.wholesale)[0];
const npc=(actorId,budget=2000)=>({actorId,name:actorId,wallet:{available:budget},presence:'offsite',appearanceId:'owner',roomId:'store',x:240,y:272,activity:'away',scavenger:false});
const record=w=>({schemaVersion:2,revision:0,world:w,archives:[],requests:{}});
function client(host){let seq=0;return {async query(name,p={}){const r=await host.query(name,p);assert.ok(r.ok,JSON.stringify(r));return r.data;},async command(type,payload={},extra={}){const r=await host.command({requestId:'experience-'+ ++seq,type,payload,...extra});assert.ok(r.ok,JSON.stringify(r));return r.data;}};}

// Outcomes and issues have different denominators; repeated rendering/log eviction cannot rewrite them.
const w=createWorld(rules);w.products=products;w.clock.phase='open';w.npcs=[npc('budget',0),npc('buyer'),npc('broken')];
arriveCustomer(w,w.npcs[0]);assert.equal(customerDecision(w,catalog,w.npcs[0]).reason,'out-of-stock');
customerFeedback(w,w.npcs[0],'out-of-stock');customerFeedback(w,w.npcs[0],'out-of-stock');customerFeedback(w,w.npcs[0],'budget');departCustomer(w,w.npcs[0],'no-purchase');
arriveCustomer(w,w.npcs[1]);const pack=makeSealed(w,product,'pack',product.prices.pack.wholesale);pack.location='retail';
assert.equal(customerDecision(w,catalog,w.npcs[1]).item.inventoryRef,pack.inventoryRef);purchaseRetail(w,w.npcs[1],pack);customerFeedback(w,w.npcs[1],'table-full');departCustomer(w,w.npcs[1]);
arriveCustomer(w,w.npcs[2]);departCustomer(w,w.npcs[2],'counter-unreachable');
let view=experienceInsights(w,catalog);assert.equal(view.visits.arrived,3);assert.equal(view.visits.departed,3);assert.deepEqual(view.visits.outcomes,{purchased:1,played:0,scavenged:0,unconverted:1,interrupted:1});
assert.deepEqual(view.visits.unconvertedReasons,[{code:'budget',label:'预算不足',count:1}]);assert.equal(view.visits.issueVisits.find(i=>i.code==='out-of-stock').count,1);assert.equal(view.products.find(p=>p.productId===product.productId&&p.kind==='pack').sold,1);
const copy=structuredClone(w);experienceInsights(w,catalog);experienceGuide(w);experienceStories(w,catalog);assert.deepEqual(w,copy,'queries are pure');
w.log=[];assert.equal(experienceInsights(w,catalog).visits.departed,3,'statistics survive bounded-log eviction');
const overpriced=makeSealed(w,product,'pack',product.prices.pack.wholesale);overpriced.location='retail';overpriced.retailPrice=100000;
assert.equal(customerDecision(w,catalog,w.npcs[0]).reason,'budget');w.npcs[0].wallet.available=200000;assert.equal(customerDecision(w,catalog,w.npcs[0]).reason,'price');
validateWorld(w);

// Three-day guidance remains optional; real orders/listing/rewards feed it, and rewind restores it.
const host=await createRuntime({source,rules,managementConfig:management,repository:memoryRepository()});await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'experience'});const api=client(host);
assert.equal((await api.query('experience.guide')).skipped,false);
const start=(await api.query('saves.days')).items[0];
const quote=await api.query('products.quote',{productId:product.productId,quantity:3,unit:'pack'});
await api.command('supplier.placeOrder',{productId:product.productId,quantity:3,unit:'pack'},{quoteId:quote.quoteId});
const order=(await api.query('supplier.orders')).items[0];assert.equal(order.status,'received');const receipt={inventoryRefs:order.inventoryRefs};
await api.command('retail.listAll',{inventoryRefs:receipt.inventoryRefs});
assert.ok((await api.query('experience.guide')).steps.find(s=>s.id==='stock-first').completed);
const rewards=host.inspect().world.daily.taskRewards;assert.ok(rewards>=700);
const cashBreakdown=await api.query('management.insights');assert.equal(cashBreakdown.cash.procurementCash,quote.totalDebit);assert.equal(cashBreakdown.cash.taskCash,rewards);assert.equal(cashBreakdown.cash.taskDebtOffset,0);
await api.command('experience.setGuideSkipped',{skipped:true});const balance=host.inspect().world.wallet.available;
await api.command('business.open');await api.command('business.close');await api.command('business.nextDay');
assert.equal((await api.query('management.insights')).coverage,'complete');assert.equal((await api.query('management.insights',{day:1})).cash.taskRewards,rewards);
const oldLedger=await api.query('ledger.daily',{day:1});assert.equal(oldLedger.walletAsOf,'day-close');assert.equal(oldLedger.valuationAsOf,'day-close');
await api.command('neighbors.act',{personId:'student',action:'talk'});assert.ok((await api.query('experience.guide')).steps.find(s=>s.id==='meet-regular').completed);
await api.command('saves.loadDay',{archiveId:start.archiveId});assert.equal(host.inspect().world.wallet.available,rules.startingCash);assert.equal((await api.query('experience.guide')).skipped,false);assert.equal((await api.query('experience.guide')).steps.find(s=>s.id==='stock-first').completed,false);assert.equal((await api.query('management.insights')).cash.taskRewards,0);assert.ok(balance>0);
await host.disconnect();

// Legacy saves do not claim complete historical coverage or force new tutorials.
const legacy=createWorld(rules);delete legacy.experience;legacy.clock.day=6;legacy.clock.minute=700;legacy.clock.phase='open';
const old=await createRuntime({source,rules,repository:memoryRepository(record(legacy))});await old.connect({contractVersion:'card-shop-ui/1.0',clientId:'legacy'});assert.equal((await old.query('management.insights')).data.coverage,'partial');assert.equal((await old.query('experience.guide')).data.skipped,true);assert.equal((await old.query('management.insights',{day:1})).error.code,'NOT_FOUND');await old.disconnect();

// Real seeded simulation, reserved fees, invitation routing, one settlement, provenance and day-start rewind.
const arena=createWorld({...rules,npcIntervalMinutes:2,npcMatchIntervalMinutes:10});arena.clock.day=3;arena.clock.minute=480;arena.products=publishProducts(catalog,arena.rules,3);arena.npcs=[npc('甲'),npc('乙')];
for(const [index,n]of arena.npcs.entries()){
  const card=catalog.activeCards[index],ref='event-card-'+index;arena.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',location:'collection',cardKey:card.cardKey,printedRarity:card.currentRarity,printVersion:'fixture',cost:20,protected:false,lock:null};
  discardCard(arena,arena.items[ref],'player');pickTrashCard(arena,arena.items[ref],n.actorId);enterCirculation(arena,card.cardKey,'fixture',ref);
}
const eventHost=await createRuntime({source,rules:arena.rules,repository:memoryRepository(record(arena))});await eventHost.connect({contractVersion:'card-shop-ui/1.0',clientId:'event'});const eventApi=client(eventHost);
const rewind=await eventApi.command('saves.create');assert.ok((await eventApi.query('experience.events')).available);
const request={requestId:'event-same-request',type:'experience.scheduleEvent',payload:{eventId:'community-intro'}};
assert.ok((await eventHost.command(request)).ok);const scheduled=eventHost.inspect();assert.ok((await eventHost.command(request)).ok);assert.deepEqual(eventHost.inspect(),scheduled,'same request cannot duplicate invitation');
assert.equal((await eventHost.command({...request,requestId:'event-second-request'})).error.code,'EVENT_UNAVAILABLE');
const changed=structuredClone(DEFAULT_SHOP_EXPERIENCE);changed.event.matchesRequired=2;changed.event.title='未来的活动配置';
await eventApi.command('config.apply',{configId:'backend-experience',value:changed});assert.equal((await eventApi.query('experience.events')).items[0].matchesRequired,1,'already scheduled event freezes original rules');
assert.equal((await eventApi.query('experience.events')).items[0].title,'新手交流会');
await eventApi.command('config.restoreDefault',{configId:'backend-experience'});assert.equal((await eventApi.query('experience.events')).proposal.matchesRequired,1);
await eventApi.command('business.open');
for(let i=0;i<100&&!eventHost.inspect().world.matches.some(m=>m.status==='running');i++)await eventHost.advance(.5);
assert.equal(eventHost.inspect().world.matches[0]?.status,'running');const pause=await eventHost.pause.acquire({ownerId:'test',reason:'交流会暂停'}),paused=eventHost.inspect();await eventHost.advance(100);assert.deepEqual(eventHost.inspect(),paused);await eventHost.pause.release(pause.leaseId);
for(let i=0;i<80&&eventHost.inspect().world.matches[0]?.status!=='finished';i++)await eventHost.advance(.5);
const finished=eventHost.inspect().world;assert.equal(finished.experience.events[0].status,'completed');assert.equal(finished.experience.events[0].completedMatches,1);assert.equal(finished.daily.service,20);assert.equal(finished.experience.milestones.communityEvents,1);
const stories=await eventApi.query('experience.stories');assert.equal(stories.items.filter(s=>s.type==='community-event').length,1);assert.equal(stories.items.filter(s=>s.type==='recovered-card-win').length,1);assert.ok(stories.items.find(s=>s.type==='recovered-card-win').text.includes('模拟'));
const save=await eventApi.command('saves.create');await eventApi.command('saves.load',{archiveId:save.archiveId});assert.equal((await eventApi.query('experience.events')).items[0].completedMatches,1,'loading a completed event never replays settlement');
await eventApi.command('saves.load',{archiveId:rewind.archiveId});assert.equal((await eventApi.query('experience.events')).items.length,0);assert.equal(eventHost.inspect().world.daily.service,0);assert.equal((await eventApi.query('experience.stories')).items.filter(s=>s.type==='recovered-card-win').length,0);validateWorld(eventHost.inspect().world);await eventHost.disconnect();

const bad=structuredClone(DEFAULT_SHOP_EXPERIENCE);bad.steps[0].goals[0].metric='invented';assert.throws(()=>validateExperienceConfig(bad),e=>e.code==='INVALID_CONFIG');
const corrupt=createWorld(rules);corrupt.experience.days['1'].departed=1;assert.throws(()=>validateWorld(corrupt),e=>e.code==='INVALID_SAVE');
console.log('PASS shop experience: event-backed conversion/issue denominators, pure views/log eviction, budget/price causes, real procurement and guide, automatic rewards, historical close snapshot, daily rewind, legacy partial coverage, invited seeded NPC match/pause/fee, provenance/idempotency and save restoration.');
