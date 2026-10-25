// Default-economic Host sampling; isolated memory world, no player saves or browser navigation.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
const root=fileURLToPath(new URL('../../',import.meta.url));
const read=rel=>JSON.parse(fs.readFileSync(path.join(root,rel),'utf8'));

export function dailyMetrics(snapshot, insights, ledger) {
  const soldUnits=insights.products.reduce((s,p)=>s+p.sold,0), visits=insights.visits;
  return {day:snapshot.clock.day,minute:snapshot.clock.minute,openingCash:insights.cash.opening,
    closingCash:snapshot.wallet.available,cashChange:snapshot.wallet.available-insights.cash.opening,
    debt:snapshot.wallet.debt,revenue:ledger.revenue.total,cogs:ledger.cost.costOfGoods,
    operating:ledger.cost.rent+ledger.cost.wages,goodsMargin:snapshot.daily.goods-snapshot.daily.cogs,
    operatingProfit:ledger.netProfit,taskRewards:insights.cash.taskRewards,taskCash:insights.cash.taskCash,
    procurementCash:insights.cash.procurementCash,soldUnits,arrived:visits.arrived,departed:visits.departed,
    purchasedVisits:visits.outcomes.purchased,unconverted:visits.outcomes.unconverted,
    stockoutVisits:visits.issueVisits.filter(i=>i.code==='out-of-stock').reduce((s,i)=>s+i.count,0),
    departedPurchaseRate:visits.departed?visits.outcomes.purchased/visits.departed:null};
}

export async function runFirstWeek({days=7,out=path.join(root,'.local/first-week'),replay=null,stepSeconds=.25}={}) {
  assert(Number.isInteger(days)&&days>=1&&days<=7);
  assert(Number.isFinite(stepSeconds)&&stepSeconds>0&&stepSeconds<=1,'Step must stay within Host normal 0..1 second bound');
  const inputHashes=Object.fromEntries(['tools/qa/first-week.mjs','modules/backend/trading.mjs','modules/backend/customer-demand.mjs','data/backend-rules.json'].map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(root,p))).digest('hex')]));
  out=path.resolve(out);const rel=path.relative(path.join(root,'.local'),out);
  assert(!rel.startsWith('..')&&!path.isAbsolute(rel),'QA output must stay within this checkout .local directory');
  fs.mkdirSync(out,{recursive:true});
  const rules=read('data/backend-rules.json'), initial=replay?JSON.parse(fs.readFileSync(replay,'utf8')):null;
  if(initial)assert(initial.world.clock.day===1&&initial.world.clock.phase==='preparing'&&initial.world.clock.minute===480,'Replay must be a day-one preparing fixture');
  const repository=memoryRepository(initial);
  const host=await createRuntime({source:read('data/cards.json'),rules,repository,managementConfig:read('data/backend-management.json')});
  const actions=[],rows=[],blockers=[],ticks=[];let seq=0;
  const command=async(type,payload={},extra={})=>{
    const w=host.inspect().world,r=await host.command({requestId:`first-week-${++seq}`,type,payload,...extra});
    actions.push({day:w.clock.day,minute:w.clock.minute,type,payload,ok:r.ok,...(!r.ok?{error:r.error}:{})});
    if(!r.ok)throw Error(`${type}: ${JSON.stringify(r.error)}`);return r.data;
  };
  const query=async(name,p={})=>{const r=await host.query(name,p);assert(r.ok,`${name}: ${JSON.stringify(r.error)}`);return r.data;};
  try {
    await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'first-week-qa'});
    // Capture the fresh world rather than replacing balances, customers or random draws.
    fs.writeFileSync(path.join(out,'initial-world.json'),JSON.stringify(host.inspect()));
    for(let day=1;day<=days;day++){
      let w=host.inspect().world;assert.equal(w.clock.day,day);
      const boxes=Object.values(w.items).filter(i=>i.ownerId==='player'&&i.kind==='box'&&i.location==='stock'&&!i.lock&&!i.protected);
      for(const box of boxes)await command('boxes.unseal',{inventoryRef:box.inventoryRef});
      w=host.inspect().world;
      const stock=Object.values(w.items).filter(i=>i.ownerId==='player'&&i.kind==='pack'&&['stock','retail'].includes(i.location)&&!i.lock);
      if(stock.length<6){
        const products=await query('products.list',{pageSize:100});
        const product=products.items.filter(p=>p.availability==='available').sort((a,b)=>a.prices.pack.wholesale-b.prices.pack.wholesale)[0];
        const quantity=product?Math.min(6,Math.floor(w.wallet.available/product.prices.pack.wholesale)):0;
        if(quantity){const q=await query('products.quote',{productId:product.productId,unit:'pack',quantity});await command('supplier.placeOrder',{productId:product.productId,unit:'pack',quantity},{quoteId:q.quoteId});}
      }
      const stockShelf=async()=>{
        const refs=Object.values(host.inspect().world.items).filter(i=>i.ownerId==='player'&&i.kind==='pack'&&i.location==='stock'&&!i.lock&&!i.protected).map(i=>i.inventoryRef);
        if(refs.length)await command('retail.listAll',{inventoryRefs:refs});
      };
      await stockShelf();await command('business.open');
      w=host.inspect().world;
      let count=0,lastRefill=540;
      while(w.clock.phase==='open'){
        const before=w.clock.minute;
        await host.advance(stepSeconds);count++;
        w=host.inspect().world;assert(w.clock.minute>before,'No clock progress in an unpaused open shop');
        if(w.clock.minute-lastRefill>=30){await stockShelf();lastRefill=w.clock.minute;}
        assert(count<10000,'Exceeded normal day step budget');
      }
      assert.equal(host.inspect().world.clock.minute,1200,'Must reach 20:00 before closing');
      // Let natural simulated NPC games finish; do not force wins or cancel as successful results.
      let drain=0;
      while(w.matches.some(m=>m.status!=='finished')){await host.advance(stepSeconds);w=host.inspect().world;assert(++drain<2000,'NPC matches did not finish while closing');}
      await command('business.close');
      const snapshot=await query('shop.snapshot'),insights=await query('management.insights',{day}),ledger=await query('ledger.daily',{day});
      rows.push(dailyMetrics(snapshot,insights,ledger));ticks.push({day,openSteps:count,closingSteps:drain,stepSeconds,closedMinute:snapshot.clock.minute});
      console.log(`day ${day}: 09:00-20:00; revenue ${ledger.revenue.total}; cash ${snapshot.wallet.available}; sold ${rows.at(-1).soldUnits}`);
      if(day<days)await command('business.nextDay');
    }
  }catch(e){blockers.push({message:e.message,day:host.inspect().world.clock.day});throw e;}
  finally{
    await host.disconnect();
    const report={evidenceType:'host-integration',coverage:'economic-headless-no-navigation',rulesModified:false,inputHashes,
      seed:initial?.world.seed??JSON.parse(fs.readFileSync(path.join(out,'initial-world.json'),'utf8')).world.seed,
      daysCompleted:rows.length,daysRequested:days,rows,ticks,blockers,
      limitations:['One strategy and one random world, not a balance conclusion.','No browser, navigation, story, engine-natural or qualification coverage.','Cash change, goods margin, operating profit and task rewards are separate quantities.']};
    fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2));
    fs.writeFileSync(path.join(out,'actions.jsonl'),actions.map(a=>JSON.stringify(a)).join('\n')+'\n');
    if(rows.length){const keys=Object.keys(rows[0]);fs.writeFileSync(path.join(out,'daily.csv'),keys.join(',')+'\n'+rows.map(r=>keys.map(k=>r[k]??'').join(',')).join('\n')+'\n');}
  }
  return rows;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const arg=n=>{const i=process.argv.indexOf(n);return i<0?undefined:process.argv[i+1];};
  runFirstWeek({days:Number(arg('--days')||7),out:arg('--out'),replay:arg('--replay'),stepSeconds:Number(arg('--step')||.25)}).catch(e=>{console.error(e.message);process.exitCode=1;});
}
