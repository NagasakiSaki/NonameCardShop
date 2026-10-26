import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {CONTRACT} from '../modules/backend/common.mjs';
import {probeModeCapabilities} from '../integration/modes/capabilities.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {managementEffects,purchaseUpgrade,initialiseManagement,neighborAct} from '../modules/backend/management.mjs';
import {placeListing,settleTrade,surplusPreview} from '../modules/backend/trading.mjs';
import {initialiseV7} from '../modules/backend/v7-policy.mjs';
import {validateWorld} from '../modules/backend/world.mjs';
import {printingMeta,physicalGroupKey,exchangeAssetKey} from '../modules/backend/card-finishes.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json'),managementConfig=json('data/backend-management.json');
const catalog=buildCatalog(source,rules),capabilities=probeModeCapabilities({engineRoot:'vendor/noname'}).items;
let serial=0;
const make=async initial=>{const r=await createRuntime({source,rules,managementConfig,repository:memoryRepository(initial),modeCapabilities:capabilities});await r.connect({contractVersion:CONTRACT,clientId:'long-term-test'});const intro=await r.query('dialogue.offer');if(intro.data?.kind==='debt-intro'){const ack=await r.command({requestId:'intro-'+ ++serial,type:'dialogue.respond',payload:{offerId:intro.data.offerId,optionId:'begin',proof:intro.data.proof}});assert(ack.ok,JSON.stringify(ack));}return r;};
const command=async(r,type,payload={},id)=>{const v=await r.command({requestId:id||`long-term-${++serial}`,type,payload});assert(v.ok,`${type}: ${JSON.stringify(v.error)}`);return v.data;};
const query=async(r,name,p={})=>{const v=await r.query(name,p);assert(v.ok,JSON.stringify(v.error));return v.data;};
const next=async r=>{await command(r,'business.close');await command(r,'business.nextDay');await command(r,'business.open');};
const prepare=async(r,opponentId)=>{
 const cards=(await query(r,'combat.eligible')).items.filter(c=>c.eligible).filter((c,i,a)=>a.findIndex(x=>x.generalId===c.generalId)===i).slice(0,3);
 let room=await command(r,'combat.room.create',{formatId:'kof',opponentId});assert.equal(room.tableFee,0);assert.equal(room.pools.enemy.length,3);
 room=await command(r,'combat.room.prepare',{roomId:room.roomId,reserveRefs:cards.map(c=>c.inventoryRef),proof:room.proof});return room.series;
};
const finish=async(r,series,result)=>{
 await command(r,'combat.selectRound',{matchId:series.matchId,roundId:series.round.roundId,selections:[{seatId:'mine-main',inventoryRef:series.reserveItems[0].inventoryRef}]});
 await command(r,'combat.start',{matchId:series.matchId});const game=r.inspect().world.matches.at(-1).gameId;
 await r.trustedEngineEvent(series.matchId,{type:'ready',matchId:game});return r.trustedEngineEvent(series.matchId,{type:'result',matchId:game,result});
};
let r=await make();
assert.deepEqual(r.inspect().world.progression.stages.slice(0,3).map(s=>s.dueDay),[2,3,4]);
let p=await query(r,'opening.preview',{includeBoxes:true});let opened=await r.command({requestId:'open-gift',type:'opening.execute',previewId:p.previewId,payload:{}});assert(opened.ok);
await command(r,'business.open');await next(r);await r.advance(.1);
let offer=await query(r,'dialogue.offer');assert.equal(offer.speakerName,'高松灯');
await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'accept',proof:offer.proof});
let s=await prepare(r,r.inspect().world.progression.activeChallenge.actorId);s=await finish(r,s,'loss');assert.equal(s.phase,'finished');
const firstMatch=s.matchId,firstChallenge=r.inspect().world.progression.activeChallenge.challengeId;
let result=await command(r,'challenges.rematch',{matchId:s.matchId});
assert.notEqual(r.inspect().world.progression.activeChallenge.challengeId,firstChallenge);assert.equal(result.openCombat,true);
s=await prepare(r,result.opponentId);assert.notEqual(s.matchId,firstMatch);assert.equal(s.score.mine,0);assert.equal(s.phase,'selecting');
s=await finish(r,s,'loss');const before=r.inspect().world;result=await command(r,'challenges.defer',{matchId:s.matchId},'defer-once');assert.equal(result.gift.quantity,1);assert.equal(result.gift.productId,'refresh');
const once=r.inspect();await command(r,'challenges.defer',{matchId:s.matchId},'defer-once');assert.equal(Object.values(r.inspect().world.items).length,Object.values(once.world.items).length);
assert.equal(once.world.wallet.available,before.wallet.available);assert(!once.world.progression.unlockedProductIds.includes('refresh'));
for(let n=0;n<5;n++)await r.advance(.2);
assert.equal(await query(r,'dialogue.offer'),null);assert.equal(r.inspect().world.progression.stages[0].dueDay,3);
let refused=await r.command({requestId:'defer-again',type:'challenges.rematch',payload:{matchId:s.matchId}});assert.equal(refused.error.code,'CHALLENGE_DEFERRED');
await next(r);await r.advance(.1);offer=await query(r,'dialogue.offer');assert(offer);
await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'accept',proof:offer.proof});s=await prepare(r,r.inspect().world.progression.activeChallenge.actorId);await finish(r,s,'win');
let w=r.inspect().world;assert.equal(w.progression.allies.length,1);assert(w.progression.stages[1].dueDay===4);assert.equal(w.progression.intervalDays,1);
console.log('PASS loss/rematch fresh room, single consolation gift, deferred same-day blocked, next-day return, daily chained cadence and recruit');

// Day-seven milestones use a separate story obligation, never supplier credit.
let saved=r.inspect();await r.disconnect();saved.world.clock={...saved.world.clock,day:6,phase:'open'};saved.world.wallet.debt=10000;saved.world.wallet.available=25000;r=await make(saved);await r.advance(.1);assert(!r.inspect().world.npcs.some(n=>n.debtCollector&&n.presence!=='offsite'));await next(r);await r.advance(.1);
w=r.inspect().world;const creditor=w.npcs.find(n=>n.debtCollector);assert.equal(creditor.name,'海玲');let d=await query(r,'longTerm.status');assert.equal(d.loan.principal,20000);assert.equal(d.loan.currentGoal.amount,5000);assert.equal(d.debt.potentialReduction,1500);
async function talkCreditor(){const offered=await query(r,'dialogue.offer');if(offered&&offered.kind!=='debt-challenge')await command(r,'dialogue.respond',{offerId:offered.offerId,optionId:'tomorrow',proof:offered.proof});await command(r,'actors.interact',{actorId:'specialist:creditor'});return query(r,'dialogue.offer');}
offer=await talkCreditor();await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'accept',proof:offer.proof});s=await prepare(r,creditor.actorId);assert.equal(s.challengeKind,'debt-challenge');
const supplierBefore=r.inspect().world.wallet.debt;await command(r,'combat.surrender',{matchId:s.matchId});assert.equal(r.inspect().world.wallet.debt,supplierBefore);assert.equal((await query(r,'longTerm.status')).loan.relieved,0);
result=await command(r,'challenges.rematch',{matchId:s.matchId});s=await prepare(r,result.opponentId);const money=r.inspect().world.wallet.available,supplier=r.inspect().world.wallet.debt;
const cleared=r.inspect().world.progression.stages.filter(s=>s.status==='cleared').length;
await finish(r,s,'win');w=r.inspect().world;assert.equal(w.wallet.debt,supplier);assert.equal(w.wallet.available,money);assert.equal(w.longTerm.loan.relieved,1500);assert.equal((await query(r,'longTerm.status')).loan.currentGoal.remaining,3500);assert.equal(w.longTerm.outdoor.status,'locked');assert.equal(w.progression.stages.filter(s=>s.status==='cleared').length,cleared);assert.equal(Object.keys(w.longTerm.debtChallenge.receipts).length,1);
assert.equal(w.cashJournal.at(-1).campaignDebtDelta,-1500);assert.equal(w.cashJournal.at(-1).debtDelta,0);
offer=await talkCreditor();assert(!offer.choices.some(c=>['accept','rematch'].includes(c.optionId)),'one battle discount per phase');
let refusedGoal=await r.command({requestId:'premature-review',type:'dialogue.respond',payload:{offerId:offer.offerId,optionId:'settled',proof:offer.proof}});assert.equal(refusedGoal.error.code,'GOAL_INCOMPLETE');
const payment={milestoneId:'week-1',amount:1500};await command(r,'debt.repay',payment,'phase-payment-1');const paidOnce=r.inspect();await command(r,'debt.repay',payment,'phase-payment-1');assert.deepEqual(r.inspect(),paidOnce);
assert.equal((await query(r,'longTerm.status')).loan.currentGoal.remaining,2000);assert.equal(r.inspect().world.wallet.available,money-1500);assert.equal(r.inspect().world.wallet.debt,supplier);
let bad=await r.command({requestId:'overpayment',type:'debt.repay',payload:{milestoneId:'week-1',amount:2001}});assert.equal(bad.error.code,'INVALID_INPUT');
await command(r,'debt.repay',{milestoneId:'week-1',amount:2000});await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'settled',proof:offer.proof});
d=await query(r,'longTerm.status');assert.equal(d.loan.currentGoal.id,'week-2');assert.equal(d.loan.outstanding,15000);assert.equal(d.debt.nextVisitDay,14);assert.equal(d.outdoor.status,'unlocked-planned');assert.equal(d.loan.completedCount,1);
console.log('PASS phase-one target: trusted win credits 1500 once, partial/idempotent cash repayment, supplier credit isolated, full target required before outdoor gate');
// A later collection is a real second phase, with persistent postponement and whole-world rollback.
saved=r.inspect();await r.disconnect();saved.world.clock.day=14;r=await make(saved);await r.advance(.1);offer=await talkCreditor();await command(r,'dialogue.respond',{offerId:offer.offerId,optionId:'tomorrow',proof:offer.proof});await r.advance(.1);assert.equal((await query(r,'longTerm.status')).debt.nextVisitDay,15);assert.equal(await query(r,'dialogue.offer'),null);
const backup=await command(r,'saves.create');const balanceBefore=r.inspect().world.wallet.available;await command(r,'debt.repay',{milestoneId:'week-2',amount:500},'rollback-payment');await command(r,'saves.load',{archiveId:backup.archiveId});assert.equal((await query(r,'longTerm.status')).loan.currentGoal.remaining,5000);assert.equal(r.inspect().world.wallet.available,balanceBefore);bad=await r.command({requestId:'rollback-payment',type:'debt.repay',payload:{milestoneId:'week-2',amount:500}});assert.equal(bad.error.code,'STALE_OPERATION');
w=r.inspect().world;await r.disconnect();console.log('PASS recurring phase, next-day deferral, exact backup rollback and stale-branch repayment rejection');

// Public transactions and restored old low-rarity listings cannot bypass market policy.
w.wallet.available=1000000;w.clock.day=20;const sample=rarity=>catalog.cards.find(c=>c.currentRarity===rarity);
function card(ref,rarity){const c=sample(rarity);return w.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:c.cardKey,printedRarity:rarity,productId:c.pack,location:'collection',cost:0,lock:null,protected:false};}
for(const rarity of ['N','R']){const i=card('low-'+rarity,rarity);assert.throws(()=>placeListing(w,catalog,i,100),e=>e.code==='MARKET_RARITY');}
const high=card('high-SR','SR');let listing=placeListing(w,catalog,high,100);assert.equal(listing.status,'active');
const low=card('old-listing','R');low.location='market';low.lock='legacy-low';w.listings.push({listingId:'legacy-low',inventoryRef:low.inventoryRef,ownerId:'player',cardKey:low.cardKey,unitAmount:20,status:'active',day:w.clock.day});
const regular=w.npcs.find(n=>n.regularId);const funds=regular.wallet.available;regular.wallet.available-=10;w.wallet.escrowLiability+=10;w.management.requests.push({orderId:'legacy-request',kind:'purchase',personId:regular.regularId,actorId:regular.actorId,cardKey:low.cardKey,status:'accepted',fundsHeld:10,amount:10,expiresDay:22});
saved={...saved,world:w};r=await make(saved);w=r.inspect().world;assert.equal(w.items['old-listing'].location,'collection');assert.equal(w.items['old-listing'].lock,null);assert.equal(w.listings.find(l=>l.listingId==='legacy-low').status,'cancelled');assert.equal(w.management.requests.find(o=>o.orderId==='legacy-request').status,'cancelled');assert.equal(w.npcs.find(n=>n.actorId===regular.actorId).wallet.available,funds);
assert.equal(w.wallet.escrowLiability,0);assert((await query(r,'combat.eligible')).items.some(i=>i.inventoryRef==='low-N'&&i.eligible));
await r.disconnect();
// Physical print, rather than current recalculated grade, controls market admission.
const forged=w.items['low-N'];forged.lock='forged';w.listings.push({listingId:'forged',inventoryRef:forged.inventoryRef,ownerId:'player',unitAmount:1,status:'active'});assert.throws(()=>settleTrade(w,w.listings.at(-1),regular.actorId),e=>e.code==='MARKET_RARITY');w.listings.pop();forged.lock=null;
assert(surplusPreview(w,catalog).refs.every(ref=>['SR','SSR'].includes(w.items[ref].printedRarity)));
console.log('PASS SR/SSR market admission, preserved collection/battle cards, legacy listings/order refunds, no direct bypass');

// Facilities really affect operations; legacy purchased levels migrate without reset.
const baseline=managementEffects(w);for(const id of ['shelf','showcase','cashier','stocker','marketing','market'])purchaseUpgrade(w,id);
let effects=managementEffects(w);assert(effects.shelfCapacity>baseline.shelfCapacity);assert(effects.checkoutSeconds<baseline.checkoutSeconds);assert(effects.newCustomerWalletMultiplier>1);assert(effects.attractionRate>baseline.attractionRate);assert(effects.singlePriceCeilingMultiplier>baseline.singlePriceCeilingMultiplier);assert(effects.stocker);
purchaseUpgrade(w,'stocker');assert(managementEffects(w).restockTargetPerProduct>effects.restockTargetPerProduct);w.storeSettings={tableFee:17,feeRevision:1};purchaseUpgrade(w,'table');assert.equal(managementEffects(w).tableFee,17);
delete w.management.config.facilityDepthVersion;w.management.config.upgrades=w.management.config.upgrades.filter(u=>!['marketing','market'].includes(u.id)).map(u=>({...u,costs:u.costs.slice(0,3)}));const ownedLevels=structuredClone(w.management.levels);initialiseManagement(w,managementConfig);assert.deepEqual(w.management.levels,ownedLevels);assert.equal(w.management.config.upgrades.find(u=>u.id==='shelf').costs.length,10);
const p0=structuredClone(w.progression),clear=p0.stages.find(s=>s.status==='cleared');delete w.progression.cadenceVersion;initialiseV7(w,rules);assert.equal(w.progression.stages.find(s=>s.stageId===clear.stageId).clearedAtDay,clear.clearedAtDay);assert.deepEqual(w.progression.unlockedProductIds,p0.unlockedProductIds);
validateWorld(w);console.log('PASS seven deep upgrade paths, live benefits, custom table fee, purchased-level and progression migration');
const plain=card('finish-base','SR'),foil={...plain,finishId:'foil'},alt={...plain,artVariantId:'alternate'};
assert.equal(printingMeta(plain).finishId,'standard');assert.notEqual(physicalGroupKey(plain),physicalGroupKey(foil));assert.notEqual(physicalGroupKey(plain),physicalGroupKey(alt));assert.notEqual(exchangeAssetKey(plain),exchangeAssetKey(foil));
assert.equal(plain.cardKey,foil.cardKey);assert.equal(plain.printedRarity,foil.printedRarity);
console.log('PASS physical finish identity remains independent of combat card and strength grade; no premium cards issued');
