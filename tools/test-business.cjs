const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..');
const context=vm.createContext({console});context.window=context;
for(const file of ['shop-state.js','shop-tasks.js','shop-business.js','integration/task-extensions.js'])vm.runInContext(fs.readFileSync(path.join(root,file),'utf8'),context,{filename:file});
const {ShopModel:M,ShopBusiness:B,ShopTasks:T}=context;
const config=JSON.parse(fs.readFileSync(path.join(root,'data/business.json'))),tasks=JSON.parse(fs.readFileSync(path.join(root,'data/tasks.json'))),data=JSON.parse(fs.readFileSync(path.join(root,'data/cards.json')));
B.configure(config);T.configure(tasks);B.setCatalog(data);T.setCatalog(data);
B.configure({...config,economy:{...config.economy,startingCash:0}});assert.equal(M.normalise().shop.cash,0);B.configure(config);
const pack=data.packs.find(p=>p.id==='standard'),card=data.cards.find(c=>c.id==='caocao');
const save=M.normalise({collection:{caocao:3,zhangfei:1},trash:{guanyu:1},shop:{cash:1200,revenue:999,sold:10}});
assert.equal(M.total(save.collection),4);assert.equal(save.business.daily.revenue,0);assert.equal(save.shop.revenue,999);
T.evaluate(save);
const first=B.order(save,pack,3);assert.equal(first.ok,true);assert.equal(save.shop.cash,1020);assert.equal(save.business.daily.purchaseExpense,180);assert.equal(B.receive(save,first.order.id).ok,false);
for(let i=0;i<16;i++)B.tick(save,1);
assert.equal(first.order.status,'arrived');assert.equal(B.receive(save,first.order.id).ok,true);assert.equal(B.receive(save,first.order.id).ok,false);assert.equal(save.stock.standard,3);
assert.equal(T.claim(save,'first_order').ok,true);assert.equal(T.claim(save,'first_order').ok,false);
assert.equal(T.claim(save,'receive_stock').ok,true);
assert.equal(B.movePacks(save,'standard','stock','packDisplay',2),true);assert.equal(T.claim(save,'put_on_shelf').ok,true);
const cashBeforeOpening=save.shop.cash;assert.equal(M.buy(save,pack),true);assert.equal(save.shop.cash,cashBeforeOpening);assert.equal(M.buy(save,pack),false);
assert.equal(B.open(save),true);
const casual=config.customers.profiles[0];
assert.equal(B.chooseProduct(save,casual).kind,'pack');
assert.equal(B.sell(save,'pack','standard',casual).ok,true);assert.equal(B.sell(save,'pack','standard',casual).ok,true);assert.equal(B.sell(save,'pack','standard',casual).ok,false);
assert.equal(save.business.daily.revenue,190);assert.equal(T.claim(save,'daily_revenue').ok,true);assert.equal(save.business.daily.revenue,190);assert.equal(T.claim(save,'daily_revenue').ok,false);
assert.equal(M.transfer(save,'collection','trash','caocao',1),true);
save.business.minute=1190;const overnight=B.order(save,pack,1);assert.equal(overnight.ok,true);
save.business.minute=1199;assert.equal(B.tick(save,1).closed,true);assert.equal(save.business.phase,'closed');const settledCash=save.shop.cash;B.settle(save);assert.equal(save.shop.cash,settledCash);
assert.equal(B.sell(save,'card','caocao').ok,false);assert.equal(B.order(save,pack,1).ok,false);
const bagBefore=M.total(save.collection),stockBefore=M.total(save.stock);
assert.equal(B.nextDay(save).ok,true);assert.equal(save.business.day,2);assert.equal(M.total(save.trash),0);assert.equal(M.total(save.collection),bagBefore);assert.equal(M.total(save.stock),stockBefore);
assert.equal(save.business.daily.revenue,0);assert.equal(save.business.goal,240);assert.equal(save.business.history.length,1);assert.equal(overnight.order.status,'arrived');assert.equal(T.isClaimed(save,'first_order'),true);
const roundTrip=M.normalise(JSON.parse(JSON.stringify(save)));assert.equal(roundTrip.business.day,2);assert.equal(T.isClaimed(roundTrip,'first_order'),true);assert.equal(T.claim(roundTrip,'first_order').ok,false);
// A late sale cannot revive the morning window, including across reload.
const late=M.normalise();T.evaluate(late);B.open(late);late.business.minute=781;T.evaluate(late);late.packDisplay.standard=1;B.sell(late,'pack','standard',casual);
assert.equal(T.list(late).find(t=>t.id==='morning_sale').status,'expired');assert.equal(T.claim(late,'morning_sale').ok,false);
// Debt repayment and turnover are separate; insufficient credit cannot mutate stock/cash.
const credit=M.normalise({shop:{cash:10}});B.open(credit);assert.equal(B.order(credit,pack,2,true).ok,true);assert.equal(credit.business.debt,110);assert.equal(credit.shop.cash,0);
credit.packDisplay.standard=2;B.sell(credit,'pack','standard',casual);assert.equal(credit.business.debt,15);assert.equal(credit.shop.cash,0);B.sell(credit,'pack','standard',casual);assert.equal(credit.business.debt,0);assert.equal(credit.shop.cash,80);assert.equal(credit.business.daily.revenue,190);assert.equal(credit.business.daily.debtPaid,110);assert.equal(credit.business.lifetime.debtPaid,110);
const before=JSON.stringify(credit);assert.equal(B.order(credit,pack,20,true).ok,false);assert.equal(JSON.stringify(credit),before);
// Budget/markup refusal and concurrent checkout cannot oversell the last item.
const scarcity=M.normalise();B.open(scarcity);scarcity.display.caocao=1;scarcity.business.pricing.cards=1.8;
assert.equal(B.chooseProduct(scarcity,config.customers.profiles[1]),null);scarcity.business.pricing.cards=1;
assert.equal(B.sell(scarcity,'card','caocao',config.customers.profiles[1]).ok,true);const revenue=scarcity.business.daily.revenue;assert.equal(B.sell(scarcity,'card','caocao',config.customers.profiles[1]).ok,false);assert.equal(scarcity.business.daily.revenue,revenue);
// Every transfer conserves physical copies; no negative stock through malformed quantities.
const conserve=M.normalise({collection:{caocao:5}});const total=s=>M.total(s.collection)+M.total(s.trash)+M.total(s.display);
for(let i=0;i<300;i++){const groups=['collection','trash','display'],from=groups[i%3],to=groups[(i+1)%3];M.transfer(conserve,from,to,'caocao',1);assert.equal(total(conserve),5);}
assert.equal(M.transfer(conserve,'trash','collection','caocao',-1),false);
// Extension rewards roll back completely when a provider fails.
T.registerReward('test_failure',()=>{throw new Error('provider failed')});T.configure({version:1,tasks:[{id:'rollback',scope:'once',title:'回滚测试',description:'',objectives:[{type:'metric',metric:'inventory.cards',target:1}],rewards:[{type:'cash',amount:100},{type:'test_failure'}]}]});
const rollback=M.normalise({collection:{caocao:1}});T.evaluate(rollback);const snapshot=JSON.stringify(rollback);assert.equal(T.claim(rollback,'rollback').ok,false);assert.equal(JSON.stringify(rollback),snapshot);
assert.ok(T.validate({version:1,tasks:[{id:'broken',scope:'daily',title:'坏任务',description:'',objectives:[],rewards:[]}]}).length);
assert.ok(T.validate({version:1,tasks:[null]}).length);
// Automatic daily rewards resolve dependencies regardless of file order.
T.configure({version:1,tasks:[{id:'dependent',scope:'daily',title:'后续',description:'',dependsOn:['predecessor'],objectives:[{type:'metric',metric:'inventory.cards',target:1}],rewards:[{type:'cash',amount:2}]},{id:'predecessor',scope:'daily',title:'前置',description:'',objectives:[{type:'metric',metric:'inventory.cards',target:1}],rewards:[{type:'cash',amount:1}]}]});
const reverse=M.normalise({collection:{caocao:1}});B.open(reverse);B.settle(reverse);T.claimReady(reverse,'daily');assert.equal(T.isClaimed(reverse,'dependent'),true);assert.equal(T.isClaimed(reverse,'predecessor'),true);
console.log('PASS: migration, ordering/delivery/receipt, sealed stock, daily turnover, rewards once, day rollover/trash cleanup, deadlines, debt, customer budgets, no overselling, conservation, extension rollback.');
