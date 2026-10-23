import assert from 'node:assert/strict';
import fs from 'node:fs';
import {buildCatalog,validateRules} from '../modules/backend/catalog.mjs';
import {publishProducts,manufactureBox,manufacturePack,makeSealed} from '../modules/backend/products.mjs';
import {createWorld} from '../modules/backend/world.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {DEFAULT_DISTRIBUTION} from '../modules/backend/distribution.mjs';
import {initialiseManagement,tickManagement} from '../modules/backend/management.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../data/'+n+'.json',import.meta.url)));
const source=read('cards'),rules=read('backend-rules'),catalog=buildCatalog(source,rules),products=publishProducts(catalog,rules,1),retired=new Set(DEFAULT_DISTRIBUTION.excludedPacks);
assert.equal(products.length,19);assert.equal(catalog.cards.length,2563);assert.equal(catalog.activeCards.length,1840);
assert.ok(catalog.cards.some(c=>retired.has(c.pack)),'legacy card identities remain resolvable');
assert.ok(products.every(p=>!retired.has(p.productId)));
for(const pool of Object.values(catalog.pools))assert.ok(pool.every(k=>!retired.has(catalog.byKey.get(k).pack)),'global substitutions exclude retired themes');
const counts=cards=>Object.fromEntries(['N','R','SR','SSR'].map(r=>[r,cards.filter(c=>c.printedRarity===r).length]));
for(const p of products){
  const w=createWorld(rules),packets=manufactureBox(w,p),cards=packets.flat();
  assert.equal(packets.length,24);assert.deepEqual(counts(cards),p.boxCounts);
  assert.ok(p.boxCounts.N>=54&&p.boxCounts.N<=66);assert.ok(p.boxCounts.SR>=14&&p.boxCounts.SR<=18);assert.ok(p.boxCounts.SSR>=2&&p.boxCounts.SSR<=4);
  for(const packet of packets){assert.equal(packet.length,5);assert.notEqual(packet[0].printedRarity,'N');assert.ok(packet.slice(1).every(c=>['N','R'].includes(c.printedRarity)));}
  for(let i=0;i<30;i++){const packet=manufacturePack(w,p);assert.ok(packet.slice(0,4).every(c=>['N','R'].includes(c.printedRarity)));assert.notEqual(packet[4].printedRarity,'N');}
  assert.ok(cards.every(c=>catalog.byKey.get(c.cardKey).currentRarity===c.printedRarity&&!retired.has(catalog.byKey.get(c.cardKey).pack)));
  const ev=Object.entries(p.boxCounts).reduce((n,[r,q])=>n+q*p.values[r],0),round=n=>Math.ceil(n/rules.roundTo)*rules.roundTo;
  assert.equal(p.prices.box.wholesale,round(ev/rules.openingReturn));assert.equal(p.prices.pack.retail,round(p.prices.pack.wholesale/(1-rules.retailMargin)));
}
assert.ok(new Set(products.map(p=>JSON.stringify(p.boxCounts))).size>1);
assert.throws(()=>validateRules({...rules,distribution:{...rules.distribution,baseCounts:{N:80,R:42,SR:15,SSR:3}}}));
// Simulate an old active save with a retired SKU, a frozen box and an outstanding order.
const legacyRules=structuredClone(rules);delete legacyRules.distribution;
const w=createWorld(legacyRules),legacyProduct=structuredClone(products[0]);legacyProduct.productId='diy';legacyProduct.productVersion='legacy-frozen';delete legacyProduct.collationVersion;
const sealed=makeSealed(w,legacyProduct,'box',1234);sealed.location='retail';
w.products=[legacyProduct];w.orders=[{orderId:'legacy-order',product:structuredClone(legacyProduct),unit:'pack',quantity:1,unitCost:12,status:'arrived'}];
const originalPackets=structuredClone(sealed.packets),originalOrder=structuredClone(w.orders[0]);
const staffWorld=createWorld(rules);initialiseManagement(staffWorld,read('backend-management'));staffWorld.clock.phase='open';staffWorld.management.levels.stocker=1;staffWorld.management.onDuty.stocker=true;staffWorld.management.nextRestockAt=0;
for(let i=0;i<6;i++)makeSealed(staffWorld,legacyProduct,'pack',12);
tickManagement(staffWorld,catalog);assert.ok(Object.values(staffWorld.items).every(i=>i.location==='stock'),'employee cannot quietly relist retired stock');
const repository=memoryRepository({schemaVersion:2,revision:0,world:w,archives:[],requests:{},legacyResetDone:true});
const host=await createRuntime({source,rules,repository});await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'distribution-skin-test'});
let seq=0;const cmd=(type,payload={},extra={})=>host.command({requestId:'policy-'+(++seq),type,payload,...extra});
const upgraded=host.inspect().world;assert.equal(upgraded.products.length,19);assert.equal(upgraded.items[sealed.inventoryRef].location,'stock');assert.deepEqual(upgraded.items[sealed.inventoryRef].packets,originalPackets);assert.deepEqual(upgraded.orders[0],originalOrder);
assert.equal((await host.query('products.quote',{productId:'diy',quantity:1,unit:'pack'})).ok,false);
assert.equal((await cmd('retail.list',{inventoryRef:sealed.inventoryRef})).error.code,'PRODUCT_UNAVAILABLE');
assert.equal((await cmd('retail.listAll',{inventoryRefs:[sealed.inventoryRef]})).data.listed,0);
assert.equal((await cmd('supplier.receive',{orderId:'legacy-order'})).ok,true,'already paid orders are honoured');
const before=host.inspect();assert.equal((await cmd('player.setSkin',{appearanceId:'does-not-exist'})).ok,false);assert.deepEqual(host.inspect(),before);
const request={requestId:'one-skin',type:'player.setSkin',payload:{appearanceId:'collector'}};
assert.equal((await host.command(request)).ok,true);const changed=host.inspect();assert.deepEqual(await host.command(request),(await host.command(request)));assert.deepEqual(host.inspect(),changed);
assert.deepEqual(changed.world.wallet,before.world.wallet);assert.deepEqual(changed.world.items,before.world.items);assert.equal(changed.world.player.appearanceId,'collector');assert.equal(changed.world.player.actorId,'actor:owner');
const saved=await cmd('saves.create');assert.equal(saved.ok,true);await cmd('player.setSkin',{appearanceId:'regular'});assert.equal((await cmd('saves.load',{archiveId:saved.data.archiveId})).ok,true);assert.equal(host.inspect().world.player.appearanceId,'collector');
const oldArchive={format:'noname-shop-world-save',version:2,world:structuredClone(w)};assert.equal((await cmd('saves.import',{content:JSON.stringify(oldArchive)})).ok,true);assert.equal(host.inspect().world.products.length,19);assert.deepEqual(host.inspect().world.items[sealed.inventoryRef].packets,originalPackets);await cmd('player.setSkin',{appearanceId:'collector'});
await host.disconnect();const restored=await createRuntime({source,rules,repository});await restored.connect({contractVersion:'card-shop-ui/1.0',clientId:'skin-reconnect'});assert.equal((await restored.query('player.skins')).data.current,'collector');await restored.disconnect();
console.log('PASS distribution/skins: 19 active themes, retired-card compatibility, fixed slot quotas, global rarity matching, value-based prices, frozen legacy contents/orders, retired retail guards and persistent atomic cosmetic skin selection.');
