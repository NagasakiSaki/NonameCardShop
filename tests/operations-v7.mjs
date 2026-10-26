import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {CONTRACT} from '../modules/backend/common.mjs';
import {probeModeCapabilities} from '../integration/modes/capabilities.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {dailyBudgetSupplement} from '../modules/economy-v7/budget.mjs';
import {publishProducts,makeSealed} from '../modules/backend/products.mjs';
import {customerDecision,purchaseRetail} from '../modules/backend/trading.mjs';
import {planCollation} from '../modules/economy-v7/collation-policy.mjs';

const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json');
const catalog=buildCatalog(source,rules),capabilities=probeModeCapabilities({engineRoot:'vendor/noname'}).items;
let counter=0;
const make=async initial=>{const r=await createRuntime({source,rules,repository:memoryRepository(initial),modeCapabilities:capabilities});await r.connect({contractVersion:CONTRACT,clientId:'v7-test'});const intro=await r.query('dialogue.offer');if(intro.data?.kind==='debt-intro'){const v=await r.command({requestId:'test-intro-'+ ++counter,type:'dialogue.respond',payload:{offerId:intro.data.offerId,optionId:'begin',proof:intro.data.proof}});assert(v.ok,JSON.stringify(v));}return r;};
const command=async(r,type,payload={})=>{const v=await r.command({requestId:`v7-test-${++counter}`,type,payload});assert.equal(v.ok,true,`${type}: ${JSON.stringify(v.error)}`);return v.data;};
const query=async(r,name,payload={})=>{const v=await r.query(name,payload);assert.equal(v.ok,true,`${name}: ${JSON.stringify(v.error)}`);return v.data;};
let r=await make();let w=r.inspect().world;
assert.deepEqual(w.progression.unlockedProductIds,['yijiang']);
assert.deepEqual(w.products.filter(p=>p.availability==='available').map(p=>p.productId),['yijiang']);
assert(!w.products.some(p=>['newjiang','offline','standard'].includes(p.productId)));
assert.deepEqual([...new Set(w.products.map(p=>p.prices.pack.retail))].sort((a,b)=>a-b),[210,360,510]);
assert.equal(Object.values(w.items).length,1);assert.equal(Object.values(w.items)[0].kind,'box');
const initialBox=Object.values(w.items)[0],counts=Object.fromEntries(['N','R','SR','SSR'].map(k=>[k,initialBox.packets.flat().filter(c=>c.printedRarity===k).length]));
assert.deepEqual(counts,{N:60,R:42,SR:18,SSR:0});
assert(initialBox.packets.flat().every(c=>catalog.byKey.get(c.cardKey).pack==='yijiang'));
const no=await r.query('products.quote',{productId:'refresh'});assert.equal(no.error.code,'PRODUCT_LOCKED');
const before=JSON.stringify(r.inspect());await query(r,'products.list');await query(r,'progression.status');await query(r,'dialogue.offer');assert.equal(JSON.stringify(r.inspect()),before);
const ids=['yijiang','refresh'];planCollation({productId:'yijiang',unlockedProductIds:ids,catalog});assert.deepEqual(ids,['yijiang','refresh']);
const npc={actorId:'test',wallet:{available:100,buyerClass:'regular'}};dailyBudgetSupplement(npc,2);const balance=npc.wallet.available;dailyBudgetSupplement(npc,2);assert.equal(npc.wallet.available,balance);
console.log('PASS new game, prices, fixed box, locked theme, read-only queries, daily budget dedup');

const preview=await query(r,'opening.preview',{includeBoxes:true});await r.command({requestId:'open-gift',type:'opening.execute',previewId:preview.previewId,payload:{}}).then(v=>assert(v.ok,JSON.stringify(v)));
for(let day=1;day<=2;day++){await command(r,'business.open');await command(r,'business.close');await command(r,'business.nextDay');}
await command(r,'business.open');await r.advance(.1);
let offer=await query(r,'dialogue.offer');assert.equal(offer.speakerName,'高松灯');
await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'tomorrow',proof:offer.proof});
assert.equal(r.inspect().world.progression.stages[0].dueDay,4);
await command(r,'business.close');await command(r,'business.nextDay');await command(r,'business.open');await r.advance(.1);
offer=await query(r,'dialogue.offer');assert(offer);await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'accept',proof:offer.proof});
const challengeCards=(await query(r,'combat.eligible')).items.filter(c=>c.eligible).filter((c,i,a)=>a.findIndex(x=>x.generalId===c.generalId)===i).slice(0,3),card=challengeCards[0],opponent=r.inspect().world.progression.activeChallenge.actorId;
let room=await command(r,'combat.room.create',{formatId:'kof',opponentId:opponent});assert.equal(room.pools.enemy.length,3);assert.equal(room.pools.enemy[0].loan,true);assert.equal(room.tableFee,0);
const disclosed=room.pools.enemy.map(c=>c.generalId);await command(r,'combat.room.cancel',{roomId:room.roomId,proof:room.proof});
room=await command(r,'combat.room.create',{formatId:'kof',opponentId:opponent});assert.deepEqual(room.pools.enemy.map(c=>c.generalId),disclosed,'recreating a challenger room must not reroll its disclosed pool');
room=await command(r,'combat.room.prepare',{roomId:room.roomId,reserveRefs:challengeCards.map(c=>c.inventoryRef),proof:room.proof});let series=room.series;
const m0=r.inspect().world.matches.at(-1);assert(m0.enemy[0].loanRef);assert(!r.inspect().world.items[m0.enemy[0].loanRef]);
const minute=r.inspect().world.clock.minute,marketBefore=JSON.stringify(r.inspect().world.circulation);
for(let round=0;round<1;round++){
  await command(r,'combat.selectRound',{matchId:series.matchId,roundId:series.round.roundId,selections:[{seatId:'mine-main',inventoryRef:card.inventoryRef}]});
  await command(r,'combat.start',{matchId:series.matchId});const game=r.inspect().world.matches.at(-1).gameId;
  await r.trustedEngineEvent(series.matchId,{type:'ready',matchId:game});await r.advance(.5);assert.equal(r.inspect().world.clock.minute,minute);
  series=await r.trustedEngineEvent(series.matchId,{type:'result',matchId:game,result:'win'});
}
w=r.inspect().world;assert(w.progression.unlockedProductIds.includes('refresh'));assert.equal(w.progression.allies.length,1);assert.equal(w.progression.allies[0].onDuty,true);assert.equal(Object.keys(w.progression.receipts).length,1);assert.equal(w.clock.minute,minute+30);assert.equal(w.items[card.inventoryRef].lock,null);assert.equal(JSON.stringify(w.circulation),marketBefore);
assert.equal((await query(r,'allies.list')).effects.attractionRate,.1);
assert(w.products.find(p=>p.productId==='refresh').availability==='available');
console.log('PASS postpone, return next day, real-series-only unlock/recruit, no loan circulation, single 30-minute cost');

// The fixtures below supply owned, circulating NPC cards, never the production game.
let saved=r.inspect();saved.world.npcs.push({actorId:'fixture-rival',name:'测试牌友',appearanceId:'rookie',roomId:'store',x:240,y:272,presence:'onsite',wallet:{available:50000},direction:'down',moving:false});
const cards=[...new Map(catalog.cards.filter(c=>!rules.compatibilityBlocks[c.generalId]).map(c=>[c.generalId,c])).values()].slice(0,8);
for(const [i,c]of cards.entries())for(const ownerId of ['player','fixture-rival']){const ref=`fixture-${ownerId}-${i}`;saved.world.items[ref]={inventoryRef:ref,ownerId,kind:'card',cardKey:c.cardKey,generalId:c.generalId,printedRarity:c.currentRarity,productId:c.pack,location:'collection',cost:0,lock:null,protected:false};saved.world.circulation[c.cardKey]={firstDay:1,source:'fixture'};}
const blocked=catalog.byId.get('ol_chitu');saved.world.items['fixture-blocked']={inventoryRef:'fixture-blocked',ownerId:'player',kind:'card',cardKey:blocked.cardKey,printedRarity:blocked.currentRarity,productId:blocked.pack,location:'collection',cost:0,lock:null,protected:false};
await r.disconnect();r=await make(saved);
const unavailable=(await query(r,'combat.eligible',{formatId:'versus2v2-bo3'})).items.find(c=>c.inventoryRef==='fixture-blocked');assert.equal(unavailable.eligible,false);assert(unavailable.disabledReasons.some(reason=>reason.code==='NATIVE_GENERAL_UNAVAILABLE'));

for(const formatId of ['doudizhu-bo3','versus2v2-bo3']){
  const count=formatId==='doudizhu-bo3'?5:8;
  series=await command(r,'combat.prepareSeries',{formatId,reserveRefs:cards.slice(0,count).map((_,i)=>`fixture-player-${i}`),opponentId:'fixture-rival'});
  const roles=[];
  for(let round=0;round<2;round++){
    roles.push(series.round.roles.mine);const seats=series.round.seatSkeleton.filter(s=>s.teamId==='mine');
    await command(r,'combat.selectRound',{matchId:series.matchId,roundId:series.round.roundId,selections:seats.map((s,i)=>({seatId:s.seatId,inventoryRef:`fixture-player-${i}`}))});
    await command(r,'combat.start',{matchId:series.matchId});const plan=await query(r,'combat.roundPlan',{matchId:series.matchId});
    const {validateRoundPlan}=await import('../integration/modes/round-plan.mjs');assert.doesNotThrow(()=>validateRoundPlan(plan));
    await r.trustedEngineEvent(series.matchId,{type:'ready',gameId:plan.gameId});
    const event={...plan,type:'result',originVerified:true,sourceVerified:true,simulated:false,completed:true,resultId:plan.gameId+':result',winningTeamId:'mine',winCondition:'native'};
    series=await r.trustedEngineEvent(series.matchId,event);
    if(round===0){const repeated=await r.trustedEngineEvent(series.matchId,event);assert.equal(repeated.score.mine,1);await assert.rejects(r.trustedEngineEvent(series.matchId,{...event,winningTeamId:'enemy'}));}
  }
  assert.equal(series.phase,'finished');if(formatId==='doudizhu-bo3')assert.notEqual(roles[0],roles[1]);
}
console.log('PASS native plan compatibility, roles alternate, BO3 settlement, duplicate/conflicting result guards');
const completed=r.inspect().world;assert(completed.matches.filter(m=>m.series).every(m=>m.series.lock.state==='released'&&m.series.time.applied));
const day4=(await query(r,'saves.days')).items.find(a=>a.day===4);await command(r,'saves.loadDay',{archiveId:day4.id});
assert.deepEqual(r.inspect().world.progression.unlockedProductIds,['yijiang']);assert.equal(r.inspect().world.progression.allies.length,0);assert.equal(Object.keys(r.inspect().world.progression.receipts).length,0);
console.log('PASS day-start restore rolls back unlocks, allies, receipts and series together');
const economy=r.inspect().world;economy.progression.unlockedProductIds=economy.products.map(p=>p.productId);economy.products=publishProducts(catalog,economy.rules,4,economy.prices,economy);
const prices=[210,360,510],picks=prices.map(price=>economy.products.find(p=>p.prices.pack.retail===price));
for(const p of picks){const item=makeSealed(economy,p,'pack',p.prices.pack.wholesale);item.location='retail';}
for(const [buyerClass,expected]of [['regular',210],['enthusiast',360],['boxBuyer',510]]){const npc={actorId:'budget-'+buyerClass,wallet:{available:20000,buyerClass},visit:{visitId:'visit-'+buyerClass,budgetSpent:0,budgetAmount:18000}};economy.npcs.push(npc);const decision=customerDecision(economy,catalog,npc);assert.equal(decision.item.retailPrice,expected);const cash=economy.wallet.available;purchaseRetail(economy,npc,decision.item,{deferOpening:true});assert.equal(economy.wallet.available,cash+expected);assert.equal(npc.visit.budgetSpent,expected);}
const buyer={actorId:'budget-box',wallet:{available:20000,buyerClass:'boxBuyer'},visit:{visitId:'box',budgetSpent:0,budgetAmount:18000}};economy.npcs.push(buyer);for(const unit of ['pack','box']){const item=makeSealed(economy,picks[2],unit,picks[2].prices[unit].wholesale);item.location='retail';}assert.equal(customerDecision(economy,catalog,buyer).item.kind,'box');
const reserved={actorId:'budget-reserved',wallet:{available:1000,reserved:950,buyerClass:'regular'}};economy.npcs.push(reserved);assert.throws(()=>purchaseRetail(economy,reserved,Object.values(economy.items).find(i=>i.location==='retail'),{deferOpening:true}));assert.equal(reserved.wallet.available,1000);
console.log('PASS real retail transactions at all three price tiers, box preference and reserved-budget rejection');
await r.disconnect();
