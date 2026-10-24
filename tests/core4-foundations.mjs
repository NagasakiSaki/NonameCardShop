import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {createWorld} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {publishProducts} from '../modules/backend/products.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url))),rules=JSON.parse(fs.readFileSync(new URL('../data/backend-rules.json',import.meta.url)));
let sequence=0;
async function fixture(repository=memoryRepository(),config=rules){
  const host=await createRuntime({source,rules:config,repository});await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'core4-test'});
  return {host,repository,async q(name,input={}){const r=await host.query(name,input);assert.equal(r.ok,true,JSON.stringify(r));return r.data;},async c(type,payload={},extra={}){const r=await host.command({requestId:'core4-'+ ++sequence,type,payload,...extra});assert.equal(r.ok,true,JSON.stringify(r));return r.data;}};
}
const f=await fixture(),start=f.host.inspect(),gift=await f.q('player.starterGift');
assert.equal(gift.status,'granted');assert.equal(gift.unit,'box');assert.equal(gift.quantity,1);
const cheapest=start.world.products.filter(p=>p.availability==='available').sort((a,b)=>a.prices.box.wholesale-b.prices.box.wholesale||a.productId.localeCompare(b.productId))[0];
assert.equal(gift.productId,cheapest.productId);assert.equal(start.world.wallet.available,rules.startingCash);assert.equal(start.world.daily.purchases,0);assert.equal(start.world.lifetime.received,0);
assert.equal(start.archives[0].world.starterGift.inventoryRefs[0],gift.inventoryRefs[0]);
assert.equal(start.world.items[gift.inventoryRefs[0]].cost,0);assert.equal(start.world.items[gift.inventoryRefs[0]].packets.flat().length,120);
for(const rarity of ['N','R','SR','SSR'])assert.equal(start.world.items[gift.inventoryRefs[0]].packets.flat().filter(c=>c.printedRarity===rarity).length,cheapest.boxCounts[rarity]);
const key=buildCatalog(source,rules).cards[0].cardKey;
await f.c('player.setFavorite',{cardKey:key,favorite:true});await f.c('player.setFavorite',{cardKey:key,favorite:true});assert.deepEqual((await f.q('player.favorites')).cardKeys,[key]);
assert.equal(Object.values(f.host.inspect().world.items).length,1,'favorites do not manufacture cards');
assert.equal((await f.c('room.setTableFee',{amount:3})).amount,3);assert.equal((await f.q('room.settings')).source,'manual');
assert.equal((await f.c('room.setTableFee',{amount:null})).amount,rules.tableFee);
for(const amount of [-1,1.2,'2',1001,undefined])assert.equal((await f.host.command({requestId:'bad-'+ ++sequence,type:'room.setTableFee',payload:{amount}})).ok,false);
const saved=await f.c('saves.create');await f.c('player.setFavorite',{cardKey:key,favorite:false});await f.c('saves.load',{archiveId:saved.archiveId});assert.deepEqual((await f.q('player.favorites')).cardKeys,[key]);
await f.c('saves.loadDay',{archiveId:start.archives[0].id});assert.deepEqual((await f.q('player.favorites')).cardKeys,[]);assert.equal(Object.values(f.host.inspect().world.items).length,1);
await f.host.disconnect();const again=await fixture(f.repository);assert.equal(Object.values(again.host.inspect().world.items).length,1,'reconnect never grants again');await again.host.disconnect();
// Existing worlds do not get gifts. Paid old orders keep their frozen product/cost and legacy receipt.
const old=createWorld(rules);delete old.player.favoriteCardKeys;delete old.storeSettings;
old.products=publishProducts(buildCatalog(source,rules),rules,1);const product=old.products.find(p=>p.availability==='available');
old.orders.push({orderId:'legacy-order',product:structuredClone(product),productId:product.productId,unit:'pack',quantity:2,unitCost:17,cost:34,status:'arrived',dueAt:0});
const legacy=await fixture(memoryRepository({schemaVersion:2,revision:0,world:old,archives:[],requests:{}}));assert.equal(Object.keys(legacy.host.inspect().world.items).length,0);
await legacy.c('supplier.receive',{orderId:'legacy-order'});assert.equal(Object.values(legacy.host.inspect().world.items).reduce((n,i)=>n+i.cost,0),34);
assert.equal((await legacy.host.command({requestId:'twice',type:'supplier.receive',payload:{orderId:'legacy-order'}})).ok,false);
const before=legacy.host.inspect(),quote=await legacy.q('supplier.basketQuote',{lines:[{productId:product.productId,unit:'pack',quantity:1}]});
const request={requestId:'instant-once',type:'supplier.placeBasketOrder',quoteId:quote.quoteId,payload:{}};
const bought=await legacy.host.command(request);assert.equal(bought.ok,true);assert.equal(bought.data.fulfillment,'received');assert.equal(bought.data.inventoryRefs.length,1);
assert.equal(legacy.host.inspect().world.items[bought.data.inventoryRefs[0]].cost,quote.totalDebit);assert.deepEqual(await legacy.host.command(request),bought);
assert.equal(legacy.host.inspect().world.daily.purchases,before.world.daily.purchases+quote.totalDebit);await legacy.host.disconnect();
const packs=await fixture(memoryRepository(),{...rules,starterGift:{enabled:true,unit:'pack',quantity:3,productId:null}});assert.equal(Object.values(packs.host.inspect().world.items).length,3);await packs.host.disconnect();
console.log('PASS CORE4 foundations: frozen zero-cost gift before day-start, no repeat on reconnect/load, configurable packs, independent favorites/settings, instant atomic/idempotent purchase and frozen legacy paid-order receipt.');
