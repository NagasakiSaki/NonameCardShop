const assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8')),plain=x=>JSON.parse(JSON.stringify(x));
const ctx=vm.createContext({console,localStorage:{getItem:()=>null},fetch:async f=>({ok:true,json:async()=>read(f)})});ctx.window=ctx;
for(const file of ['modules/registry.js','modules/balance.js','shop-state.js','shop-tasks.js','shop-business.js','modules/ledger.js','modules/inventory.js','modules/market.js','modules/upgrades.js','modules/neighbors.js','modules/tournaments.js','modules/combat.js','modules/boxes.js','integration/task-extensions.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),ctx,{filename:file});
(async()=>{
 const {ShopModules:M,ShopBalance:B,ShopModel:S,ShopBusiness:E,ShopBoxes:X,ShopLedger:L}=ctx,catalog=read('data/cards.json'),cfg=read('data/balance.json'),prices=read('data/business.json').economy.cardPrices;
 E.configure(read('data/business.json'));ctx.ShopTasks.configure(read('data/tasks.json'));await M.load();M.setCatalog(catalog);E.setCatalog(catalog);ctx.ShopTasks.setCatalog(catalog);
 const fresh=old=>{const save=S.normalise({shop:{cash:100000},...old});M.ready(save);return save;};const standard=catalog.packs.find(p=>p.id==='standard');
 fresh();
 let seed=2563;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 let boxes=0;for(const pack of catalog.packs){const spec=B.boxSpec(pack);for(let sample=0;sample<50;sample++){
   const packs=B.manufacture(pack,spec,random),counts=Object.fromEntries(B.ORDER.map(r=>[r,0]));assert.equal(packs.length,spec.packs);
   for(const cards of packs){assert.equal(cards.length,5);assert.ok(cards.some(c=>['R','SR','UR'].includes(c.rarity)));cards.forEach(c=>{counts[c.rarity]++;assert.ok(catalog.cards.some(card=>card.id===c.cardId&&card.rarity===c.rarity));});}assert.deepEqual(counts,plain(spec.counts));boxes++;
 }const q=B.quoteBox(pack,prices);assert.ok(q.wholesale<q.retail);assert.ok(q.ev/q.wholesale<=cfg.pricing.openingReturn);}
 assert.equal(B.quoteBox(standard,prices).wholesale,3050);assert.equal(B.quoteBox(standard,prices).retail,4360);
 for(const mutate of [c=>c.boxes.standard.counts.C++,c=>c.boxes.standard.counts.UR=0,c=>c.boxes.standard.packs=0,c=>c.boxes.standard.counts={C:0,U:0,R:0,SR:0,UR:120},c=>c.recipes.standard.slots[4]={R:1},c=>c.boxCustomer.chance=2]){const bad=plain(cfg);mutate(bad);assert.ok(B.validate(bad,catalog).length);}
 const noBoxes=plain(cfg);delete noBoxes.boxes;assert.deepEqual(plain(B.validate(noBoxes,catalog)),[]);M.configure('balance',noBoxes);assert.equal(B.boxSpec(standard),null);M.configure('balance',cfg);
 const legacy=fresh({stock:{standard:24}});assert.equal(X.lots(legacy).length,0);assert.equal(X.loose(legacy,'standard'),24);assert.equal(legacy.modules.ledger.data.pack.standard.cost,null);
 const poor=fresh({shop:{cash:1200}}),snapshot=JSON.stringify(poor);assert.equal(E.order(poor,standard,1,false,'box').ok,false);assert.equal(JSON.stringify(poor),snapshot);assert.equal(E.order(poor,standard,6,false,'box').ok,false);
 let save=fresh(),ordered=E.order(save,standard,2,false,'box');assert.ok(ordered.ok);assert.equal(ordered.order.cost,6100);assert.equal(save.business.daily.purchasedPacks,48);
 const frozen=plain(ordered.order.boxSpec),changed=plain(cfg);changed.boxes.standard.counts.R--;changed.boxes.standard.counts.SR++;M.configure('balance',changed);
 save.business.minute=ordered.order.dueAt%1440;E.deliveries(save);assert.ok(E.receive(save,ordered.order.id).ok);assert.equal(E.receive(save,ordered.order.id).ok,false);assert.equal(X.lots(save).length,2);assert.equal(save.stock.standard,undefined);assert.deepEqual(plain(X.lots(save)[0].spec),frozen);assert.equal(L.stateOf(save).daily.acquisitions,6100);
 const original=plain(X.lots(save));save=fresh(plain(save));assert.deepEqual(plain(X.lots(save)),original);M.configure('balance',cfg);
 const id=X.lots(save)[0].id,id2=X.lots(save)[1].id;assert.ok(M.dispatch(save,'boxes.unseal',{boxId:id}).ok);assert.equal(save.stock.standard,24);assert.equal(L.stateOf(save).pack.standard.cost,3050);assert.equal(L.stateOf(save).box[id],undefined);assert.equal(M.dispatch(save,'boxes.unseal',{boxId:id}).ok,false);
 assert.ok(E.movePacks(save,'standard','stock','packDisplay',6,id));assert.equal(X.tracked(save,'standard','packDisplay').length,6);assert.ok(E.movePacks(save,'standard','packDisplay','stock',2,id));assert.equal(X.tracked(save,'standard','packDisplay').length,4);
 E.open(save);save.business.paused=true;const firstSold=plain(X.tracked(save,'standard','packDisplay')[0].packet.cards);assert.ok(E.sell(save,'pack','standard',{budget:1000,maxMarkup:2}).ok);assert.equal(X.lots(save)[0].packets.filter(p=>p.location==='sold').length,1);
 const allCards=[];while(X.tracked(save,'standard','stock').length){const result=X.peek(save,'standard',id);assert.ok(result.ok);assert.ok(E.openPack(save,standard,id));result.pulls.forEach(p=>{save.collection[p.card.id]=(save.collection[p.card.id]||0)+1;allCards.push(p.rarity);});E.emit(save,'cardsOpened',{packId:'standard',cards:result.pulls.map(p=>p.card.id),pulls:result.pulls});}
 assert.equal(E.openPack(save,standard,id),false);assert.equal(X.lots(save)[0].packets.filter(p=>p.location==='opened').length,20);assert.equal(X.lots(save)[0].packets.filter(p=>p.location==='packDisplay').length,3);
 const beforeDay=plain(X.lots(save));E.settle(save);E.nextDay(save);assert.deepEqual(plain(X.lots(save)),beforeDay);save=fresh(plain(save));assert.deepEqual(plain(X.lots(save)),beforeDay);
 assert.ok(M.dispatch(save,'boxes.move',{boxId:id2,to:'display'}).ok);assert.equal(X.shelfUsed(save),4);assert.equal(M.dispatch(save,'boxes.unseal',{boxId:id2}).ok,false);
 const disabled=plain(cfg);disabled.boxCustomer.chance=0;M.configure('balance',disabled);assert.notEqual(M.value('customer.profile',save,{id:'collector'},{random:()=>0}).id,'box_buyer');
 const live=plain(cfg);live.boxCustomer.chance=1;live.boxCustomer.budget=12345;live.pricing.sealedMargin=.4;M.configure('balance',live);assert.equal(M.value('customer.profile',save,{id:'collector'},{random:()=>0}).budget,12345);assert.ok(X.retail(save,X.find(save,id2))>4360);M.configure('balance',cfg);
 const chosen=M.value('customer.profile',save,{id:'collector',budget:600,preference:'card',rarities:['UR'],maxMarkup:1.2},{random:()=>0});assert.equal(chosen.id,'box_buyer');assert.ok(X.products(save,chosen).some(p=>p.id===id2));
 E.open(save);const beforeCash=save.shop.cash,amount=X.retail(save,X.find(save,id2)),costs=L.stateOf(save).daily.cogs;assert.ok(E.sell(save,'box',id2,chosen).ok);assert.equal(save.shop.cash,beforeCash+amount);assert.equal(L.stateOf(save).daily.cogs,costs+3050);assert.equal(E.sell(save,'box',id2,chosen).ok,false);
 // Moving and selling cannot change any sealed contents or rarity quotas.
 for(const box of X.lots(save))assert.deepEqual(plain(box.packets.map(p=>p.cards)),original.find(b=>b.id===box.id).packets.map(p=>p.cards));
 const badSave=plain(save);badSave.modules.boxes.data.lots[0].packets[0].cards[0].rarity='UR';assert.throws(()=>fresh(badSave));
 console.log(`PASS boxes: ${boxes} physical boxes / ${boxes*120} cards, exact five-rarity quotas, per-pack guarantee, config feasibility, old saves, frozen orders/contents, idempotence, ledger conservation, split/sell/reload/next day, box customers and corruption rejection.`);
})().catch(error=>{console.error(error);process.exitCode=1;});
