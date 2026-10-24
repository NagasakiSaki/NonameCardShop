import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,validateWorld} from '../modules/backend/world.mjs';
import {buildCatalog,validateRules} from '../modules/backend/catalog.mjs';
import {publishProducts,makeSealed} from '../modules/backend/products.mjs';
import {tickEconomy,inventoryList,purchaseRetail,finishCustomerVisits,owned} from '../modules/backend/trading.mjs';
import {discardCard,pickTrashCard,trashItems,canScavenge,unwantedCards} from '../modules/backend/trash.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {validateMap} from '../modules/backend/navigation.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const source=read('../data/cards.json'),rules=read('../data/backend-rules.json');
rules.customerBehavior={...rules.customerBehavior,scavengerChance:0,discardChance:{N:1,R:1,SR:0,SSR:0}};
const catalog=buildCatalog(source,rules),products=publishProducts(catalog,rules,1),product=products.find(p=>p.availability==='available');
const map=validateMap({mapId:'store',navVersion:'trash-test',tileSize:16,width:8,height:8,walkable:Array(8).fill('11111111'),anchors:{'store.entry':{x:24,y:104},'store.counter':{x:24,y:24},'store.trash':{x:104,y:24},'store.secondaryMarket':{x:72,y:72},'store.retail':{x:40,y:40}}});
const actor=(actorId,extra={})=>({actorId,name:actorId,appearanceId:'rookie',wallet:{available:10000},roomId:'store',x:24,y:24,direction:'down',activity:'idle',moving:false,scavenger:false,...extra});
function fixture(){const w=createWorld(rules);w.seed=42;w.clock.phase='open';w.clock.minute=540;w.nextNpcMinute=10000;w.products=products;w.npcs=[actor('buyer')];return w;}
function pack(w){const i=makeSealed(w,product,'pack',95);const ns=catalog.cards.filter(c=>c.currentRarity==='N').slice(0,3),r=catalog.cards.find(c=>c.currentRarity==='R'),ssr=catalog.cards.find(c=>c.currentRarity==='SSR');i.cards=[...ns,r,ssr].map(c=>({cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:'test'}));i.location='retail';return i;}
const step=(w,n=1)=>{for(let i=0;i<n;i++){tickEconomy(w,catalog,{map,seconds:.25});validateWorld(w);}};
function until(w,predicate,label){for(let i=0;i<250;i++){if(predicate())return;step(w);}assert.fail(label);}
const w=fixture(),sealed=pack(w),buyer=w.npcs[0];buyer.trip={stage:'checkout',path:[],waitSeconds:.25};
step(w);assert.equal(buyer.activity,'opening');assert.equal(w.items[sealed.inventoryRef].ownerId,buyer.actorId);assert.equal(owned(w,buyer.actorId).filter(i=>i.kind==='card').length,0,'purchase does not secretly open cards before animation');
const checkpoint=structuredClone(w);step(w,12);assert.equal(buyer.activity,'sorting');assert.equal(owned(w,buyer.actorId).length,5);assert.equal(trashItems(w).length,0,'sorting does not discard before walking');
until(w,()=>buyer.trip?.stage==='discard','walk to trash');assert.equal(trashItems(w).length,0);assert.equal(buyer.x,24);
until(w,()=>trashItems(w).length===2,'discard after arriving');assert.equal(buyer.x,104);assert.equal(buyer.y,24);assert.equal(owned(w,buyer.actorId).length,3);assert.ok(owned(w,buyer.actorId).some(i=>i.printedRarity==='SSR'));
assert.equal(Object.values(w.items).reduce((n,i)=>n+i.cost,0),sealed.retailPrice,'the sold item basis is conserved through opening/discarding');
assert.equal(inventoryList(w,catalog,{location:'trash'}).total,2);assert.equal(owned(w).length,0);
const cash=structuredClone(w.wallet),daily=structuredClone(w.daily),picked=trashItems(w)[0],ref=picked.inventoryRef;
pickTrashCard(w,picked,'player');assert.equal(w.items[ref],picked);assert.equal(picked.cost,0);assert.equal(picked.ownerId,'player');assert.ok(w.circulation[picked.cardKey]);assert.deepEqual(w.wallet,cash);assert.deepEqual(w.daily,daily);assert.throws(()=>pickTrashCard(w,picked,'buyer'),/已被捡走/);
const poor=actor('poor',{scavenger:true,wallet:{available:100},x:24,y:104}),ordinary=actor('ordinary',{wallet:{available:0}}),rich=actor('rich',{scavenger:true,wallet:{available:401}});w.npcs.push(poor,ordinary,rich);
step(w);assert.equal(poor.trip.stage,'scavenge');assert.ok(!ordinary.trip);assert.ok(!rich.trip);assert.equal(trashItems(w).length,1);
until(w,()=>trashItems(w).length===0,'poor NPC walks then picks');assert.equal(owned(w,'poor').length,1);assert.equal(owned(w,'poor')[0].cost,0);assert.ok(Math.hypot(poor.x-104,poor.y-24)<=24,'pickup uses a reachable free position beside the bin');assert.equal(canScavenge(w,poor),false);assert.equal(ordinary.wallet.available,0);
// Previously private cards become eligible only on pickup, including owner's recovery.
const privateCard={...picked,inventoryRef:'private-card',ownerId:'player',location:'collection',cost:37,cardKey:catalog.cards.find(c=>!w.circulation[c.cardKey]).cardKey};w.items[privateCard.inventoryRef]=privateCard;
discardCard(w,privateCard,'player');assert.ok(!w.circulation[privateCard.cardKey]);pickTrashCard(w,privateCard,'player');assert.equal(privateCard.cost,37);assert.equal(w.circulation[privateCard.cardKey].source,'trashPickup');
discardCard(w,privateCard,'player');pickTrashCard(w,privateCard,'poor');assert.equal(privateCard.cost,0);assert.equal(privateCard.ownerId,'poor');
// Mid-opening reload consumes the frozen sealed object once and reaches the identical result.
const resumed=structuredClone(checkpoint);until(resumed,()=>trashItems(resumed).length===2,'resume opening');assert.equal(Object.values(resumed.items).length,5);assert.deepEqual(Object.values(resumed.items).map(i=>[i.inventoryRef,i.cardKey,i.location]),Object.values(w.items).filter(i=>i.inventoryRef!=='private-card').map(i=>[i.inventoryRef,i.cardKey,['player','poor'].includes(i.ownerId)?'trash':i.location]));
const mid=await createRuntime({source,rules,maps:[map],repository:memoryRepository({schemaVersion:2,revision:0,world:checkpoint,archives:[],requests:{},legacyResetDone:true})});await mid.connect({contractVersion:'card-shop-ui/1.0',clientId:'mid-open'});
const lease=await mid.pause.acquire({ownerId:'test',reason:'交互暂停'}),beforePause=mid.inspect().world;await mid.advance(1);assert.deepEqual(mid.inspect().world,beforePause);await mid.pause.release(lease.leaseId);
assert.ok((await mid.command({requestId:'mid-save',type:'saves.create'})).ok);const midArchive=mid.inspect().archives.at(-1);for(let i=0;i<16;i++)await mid.advance(.25);assert.equal(Object.values(mid.inspect().world.items).length,5);
assert.ok((await mid.command({requestId:'mid-load',type:'saves.load',payload:{archiveId:midArchive.id}})).ok);assert.equal(mid.inspect().world.npcs[0].trip.stage,'opening');assert.equal(Object.values(mid.inspect().world.items).filter(i=>i.kind==='card').length,0);for(let i=0;i<80;i++)await mid.advance(.25);assert.equal(Object.values(mid.inspect().world.items).length,5);assert.equal(trashItems(mid.inspect().world).length,2);await mid.disconnect();
// Boxes retain 120 real cards, and high rarity cards are never discarded by default.
const boxed=fixture(),box=makeSealed(boxed,product,'box',2400);box.location='retail';box.protected=true;const beforeBuy=boxed.wallet.available;assert.throws(()=>purchaseRetail(boxed,boxed.npcs[0],box),/不可出售/);assert.equal(boxed.wallet.available,beforeBuy);box.protected=false;purchaseRetail(boxed,boxed.npcs[0],box);const all=owned(boxed,'buyer');assert.equal(all.length,120);const discarded=unwantedCards(boxed,catalog,boxed.npcs[0],all.map(i=>i.inventoryRef));assert.ok(discarded.every(ref=>!['SR','SSR'].includes(boxed.items[ref].printedRarity)));assert.equal(all.reduce((n,i)=>n+i.cost,0),box.retailPrice);
// A close midway through a paid opening finishes it without charging twice; next day clears every owner's trash.
const closing=structuredClone(checkpoint),before=closing.daily.goods;finishCustomerVisits(closing,catalog);assert.equal(Object.values(closing.items).length,5);assert.equal(closing.daily.goods,before);assert.equal(trashItems(closing).length,2);assert.ok(!closing.npcs[0].trip);
const repository=memoryRepository({schemaVersion:2,revision:0,world:closing,archives:[],requests:{},legacyResetDone:true});
const host=await createRuntime({source,rules,repository});await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'trash-test'});
const cmd=async(requestId,type,payload={})=>{const r=await host.command({requestId,type,payload});assert.ok(r.ok,JSON.stringify(r));return r;};
const take=trashItems(host.inspect().world)[0].inventoryRef;const first=await cmd('take','inventory.recover',{inventoryRef:take});assert.deepEqual(await cmd('take','inventory.recover',{inventoryRef:take}),first);const stale=await host.command({requestId:'take-again',type:'inventory.recover',payload:{inventoryRef:take}});assert.equal(stale.error.code,'OUT_OF_STOCK');
await cmd('discard-picked','inventory.discard',{inventoryRef:take});await cmd('save','saves.create');const archive=host.inspect().archives.at(-1);await cmd('close','business.close');await cmd('day','business.nextDay');assert.equal(trashItems(host.inspect().world).length,0);await cmd('load','saves.load',{archiveId:archive.id});assert.equal(trashItems(host.inspect().world).length,2);await host.disconnect();
const legacy=structuredClone(rules);delete legacy.customerBehavior;assert.ok(validateRules(legacy));assert.throws(()=>validateRules({...rules,customerBehavior:{pickupLimit:-1}}),/pickupLimit/);assert.throws(()=>validateRules({...rules,customerBehavior:{discardChance:null}}),/弃牌概率/);
console.log('PASS customer trash: delayed real opening, keep/sort/walk/discard, shared physical inventory, poor subset and cooldown, free pickup vs own cost, circulation, no duplicate claims, box conservation, save/reload, early close, all-trash next-day cleanup and legacy configuration.');
