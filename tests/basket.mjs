import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {publishProducts} from '../modules/backend/products.mjs';
import {createWorld} from '../modules/backend/world.mjs';
import {basketQuote,placeBasketOrder} from '../modules/backend/basket.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url)));
const rules={...JSON.parse(fs.readFileSync(new URL('../data/backend-rules.json',import.meta.url))),startingCash:1000000};
const products=publishProducts(buildCatalog(source,rules),rules,1).filter(p=>p.availability==='available'&&!rules.distribution.excludedPacks.includes(p.productId));
const [a,b]=products;
let sequence=0;
async function fixture({cash=rules.startingCash,debt=0,creditLimit=rules.supplierCreditLimit}={}){
  const config={...rules,supplierCreditLimit:creditLimit},world=createWorld(config);world.products=structuredClone(products);world.wallet.available=cash;world.wallet.debt=debt;
  const repository=memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true});
  const host=await createRuntime({source,rules:config,repository});
  await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'basket-test'});
  const query=async(name,p={})=>{const r=await host.query(name,p);assert.equal(r.ok,true,JSON.stringify(r));return r.data;};
  const command=(type,payload={},extra={})=>host.command({requestId:`basket-${++sequence}`,type,payload,...extra});
  return {host,query,command,repository};
}
const lines=[{productId:a.productId,unit:'pack',quantity:3},{productId:a.productId,unit:'box',quantity:1},{productId:b.productId,unit:'pack',quantity:2}];
const expected=3*a.prices.pack.wholesale+a.prices.box.wholesale+2*b.prices.pack.wholesale;
const f=await fixture(),before=f.host.inspect(),quote=await f.query('supplier.basketQuote',{lines});
assert.deepEqual(f.host.inspect(),before,'quoting must not mutate money, orders, revision or world seed');
assert.equal(quote.kind,'supplier-basket');assert.equal(quote.lines.length,3);assert.equal(quote.totalDebit,expected);
assert.equal(quote.cashDebit,expected);assert.equal(quote.creditDebit,0);
assert.equal(quote.lines[1].total,a.prices.box.wholesale);assert.equal(quote.availableCash,rules.startingCash);
assert.equal(quote.supplierCreditAvailable,rules.supplierCreditLimit);assert.deepEqual(quote.validUntil,{day:1,minute:1200});
for(const bad of [null,{}, {lines:[]},{lines:Array(39).fill(lines[0])},{lines:[lines[0],lines[0]]},...[0,21,1.5,'2',null,undefined].map(quantity=>({lines:[{...lines[0],quantity}]})),{lines:[{...lines[0],unit:undefined}]},{lines:[{...lines[0],unit:'BOX'}]},{lines:[{...lines[0],productId:1}]},{lines:[null]}]){
  const r=await f.host.query('supplier.basketQuote',bad);assert.equal(r.ok,false,JSON.stringify(bad));assert.equal(r.error.code,'INVALID_INPUT');
}
const single=await f.query('products.quote',lines[0]);
assert.equal((await f.command('supplier.placeBasketOrder',{}, {quoteId:single.quoteId})).error.code,'PREVIEW_EXPIRED');
assert.equal((await f.command('supplier.placeBasketOrder',{credit:true},{quoteId:quote.quoteId})).error.code,'INVALID_INPUT');
const request={requestId:'basket-idempotency',type:'supplier.placeBasketOrder',quoteId:quote.quoteId,payload:{}};
const purchased=await f.host.command(request);assert.equal(purchased.ok,true,JSON.stringify(purchased));
assert.equal(purchased.data.totalDebit,expected);assert.equal(purchased.data.orders.length,3);assert.equal(new Set(purchased.data.orderIds).size,3);
const after=f.host.inspect();assert.equal(after.world.wallet.available,before.world.wallet.available-expected+500,'first and daily procurement rewards are separate from purchase cost');assert.equal(after.world.daily.purchases,expected);
assert.equal(after.world.lifetime.ordered,29);assert.ok(after.world.orders.every(o=>o.status==='pending'&&o.dueAt===1*1440+480+rules.deliveryMinutes));
assert.equal(after.world.orders[1].unitCost,a.prices.box.wholesale);assert.deepEqual(after.world.orders[1].product,a);
assert.deepEqual(await f.host.command(request),purchased);assert.deepEqual(f.host.inspect(),after);
assert.equal((await f.host.command({...request,payload:{different:true}})).error.code,'REQUEST_ID_REUSED');
// The existing receiving path accepts every basket-created ordinary order and preserves unit costs.
for(let i=0;i<16;i++)await f.host.advance(1);
const received=await f.command('supplier.receiveAll');assert.equal(received.ok,true,JSON.stringify(received));assert.equal(received.data.orders,3);
assert.equal(Object.values(f.host.inspect().world.items).reduce((n,i)=>n+i.cost,0),expected);
// Persisted idempotency survives reconnecting to the same repository.
await f.host.disconnect();
const reopened=await createRuntime({source,rules,repository:f.repository});await reopened.connect({contractVersion:'card-shop-ui/1.0',clientId:'basket-reconnect'});
assert.deepEqual(await reopened.command(request),purchased);await reopened.disconnect();

const insufficient=await fixture({cash:expected-301}),iq=await insufficient.query('supplier.basketQuote',{lines}),ib=insufficient.host.inspect();
assert.equal((await insufficient.command('supplier.placeBasketOrder',{}, {quoteId:iq.quoteId})).error.code,'INSUFFICIENT_FUNDS');
assert.deepEqual(insufficient.host.inspect(),ib,'entire basket must roll back without any partial order, charge or serial change');await insufficient.host.disconnect();

// Exactly the remaining supplier credit is accepted; one coin above it is rejected.
const packCost=a.prices.pack.wholesale;
for(const [extra,ok] of [[0,true],[1,false]]){
  const edge=await fixture({cash:packCost-100-extra,debt:200}),q=await edge.query('supplier.basketQuote',{lines:[{productId:a.productId,unit:'pack',quantity:1}]});
  assert.equal(q.supplierCreditAvailable,100);const r=await edge.command('supplier.placeBasketOrder',{}, {quoteId:q.quoteId});assert.equal(r.ok,ok);
  assert.equal(q.cashDebit,packCost-100-extra);assert.equal(q.creditDebit,100+extra);
  if(ok){assert.equal(edge.host.inspect().world.wallet.available,0);assert.equal(edge.host.inspect().world.wallet.debt,300);assert.equal(r.data.cashDebit,packCost-100);assert.equal(r.data.creditDebit,100);}
  else assert.equal(edge.host.inspect().world.orders.length,0);
  await edge.host.disconnect();
}

// Validate all rows and both version identifiers before touching the transaction fork.
for(const change of ['productVersion','priceVersion','price','availability','retired']){
  const world=createWorld(rules);world.products=structuredClone(products);const q=basketQuote(world,{lines});
  const target=world.products.find(p=>p.productId===b.productId);
  if(change==='productVersion'||change==='priceVersion')target[change]+='-changed';
  if(change==='price')target.prices.pack.wholesale++;
  if(change==='availability')target.availability='unavailable';
  if(change==='retired')world.rules.distribution.excludedPacks.push(b.productId);
  const beforeReject=structuredClone(world);
  assert.throws(()=>placeBasketOrder(world,q),e=>e.code===(['availability','retired'].includes(change)?'UNAVAILABLE_PRODUCT':'QUOTE_EXPIRED'));
  assert.deepEqual(world,beforeReject,change);
}
const stale=await fixture(),sq=await stale.query('supplier.basketQuote',{lines});
const retired=await fixture(),rq=await retired.query('supplier.basketQuote',{lines});
const retiredRules=retired.host.inspect().world.rules;retiredRules.distribution.excludedPacks.push(b.productId);
assert.equal((await retired.command('config.apply',{configId:'backend-rules',value:retiredRules})).ok,true);
const retiredBefore=retired.host.inspect();
assert.equal((await retired.command('supplier.placeBasketOrder',{}, {quoteId:rq.quoteId})).error.code,'UNAVAILABLE_PRODUCT');
assert.deepEqual(retired.host.inspect(),retiredBefore);await retired.host.disconnect();
await stale.command('business.open');await stale.command('business.close');const closedBefore=stale.host.inspect();
assert.equal((await stale.command('supplier.placeBasketOrder',{}, {quoteId:sq.quoteId})).error.code,'SHOP_CLOSED');assert.deepEqual(stale.host.inspect(),closedBefore);
await stale.command('business.nextDay');assert.equal((await stale.command('supplier.placeBasketOrder',{}, {quoteId:sq.quoteId})).error.code,'PREVIEW_EXPIRED');
const dayTwoQuote=await stale.query('supplier.basketQuote',{lines}),saved=await stale.command('saves.create');assert.equal(saved.ok,true);
await stale.command('saves.load',{archiveId:saved.data.archiveId});
assert.equal((await stale.command('supplier.placeBasketOrder',{}, {quoteId:dayTwoQuote.quoteId})).error.code,'PREVIEW_EXPIRED');
const oldSuccessQuote=await stale.query('supplier.basketQuote',{lines:[lines[0]]}),oldRequest={requestId:'basket-before-load',type:'supplier.placeBasketOrder',quoteId:oldSuccessQuote.quoteId,payload:{}};
assert.equal((await stale.host.command(oldRequest)).ok,true);await stale.command('saves.load',{archiveId:saved.data.archiveId});
assert.equal((await stale.host.command(oldRequest)).error.code,'STALE_OPERATION');await stale.host.disconnect();
console.log('PASS basket: strict rows, mixed pack/box totals, read-only quotes, atomic order/receipt, persisted idempotency, credit boundary, product/price versions, closed/day/load invalidation.');
