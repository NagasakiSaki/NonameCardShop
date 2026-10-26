import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {CONTRACT} from '../modules/backend/common.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {getFormat,listFormatIds} from '../modules/combat-formats/registry.mjs';
import {probeModeCapabilities} from '../integration/modes/capabilities.mjs';
import {settleChallenge} from '../modules/progression/settlement.mjs';
import {createWorld} from '../modules/backend/world.mjs';
import {registerNpcMatch,advanceNpcSimulation} from '../modules/backend/matches.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json'),catalog=buildCatalog(source,rules),modeCapabilities=probeModeCapabilities({engineRoot:'vendor/noname'}).items;
assert.deepEqual(listFormatIds(),['kof','doudizhu-bo3','versus2v2-bo3']);assert.equal(getFormat('bo3'),null);
let r=await createRuntime({source,rules,repository:memoryRepository(),modeCapabilities}),seq=0;await r.connect({contractVersion:CONTRACT,clientId:'three-formats'});
const c=async(type,payload={})=>{const v=await r.command({requestId:'three-formats-'+ ++seq,type,payload});assert(v.ok,JSON.stringify(v));return v.data;};
const intro=(await r.query('dialogue.offer')).data;await c('dialogue.respond',{offerId:intro.offerId,optionId:'begin',proof:intro.proof});
for(let day=1;day<3;day++){await c('business.open');await c('business.close');await c('business.nextDay');}await c('business.open');await r.advance(.1);
let offer=(await r.query('dialogue.offer')).data;await c('dialogue.respond',{offerId:offer.offerId,optionId:'accept',proof:offer.proof});const base=r.inspect();await r.disconnect();
const refs=[];for(const [i,id]of ['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo'].entries()){const card=catalog.byId.get(id),ref='three-player-'+i;refs.push(ref);base.world.items[ref]={inventoryRef:ref,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,ownerId:'player',location:'collection',lock:null,protected:false,cost:0};}
for(const formatId of listFormatIds()){
 r=await createRuntime({source,rules,repository:memoryRepository(structuredClone(base)),modeCapabilities});await r.connect({contractVersion:CONTRACT,clientId:'three-formats'});
 const opponentId=r.inspect().world.progression.activeChallenge.actorId,format=getFormat(formatId),minute=r.inspect().world.clock.minute;
 for(const type of ['combat.room.create','combat.prepareSeries','combat.joinQueue']){const v=await r.command({requestId:'removed-mode-'+ ++seq,type,payload:{formatId:'bo3',mode:'bo3',inventoryRefs:[refs[0]],reserveRefs:[refs[0]],opponentId}});assert.equal(v.ok,false,'removed mode must not be callable: '+type);}
 assert.equal((await r.query('combat.eligible',{formatId:'bo3'})).ok,false);
 // Each supported challenge keeps its own disclosed pool across mode switches.
 const disclosed={};for(const mode of listFormatIds()){
  const room=await c('combat.room.create',{formatId:mode,opponentId});disclosed[mode]=room.pools.enemy.map(c=>c.generalId);assert.equal(disclosed[mode].length,getFormat(mode).reservePerSide);await c('combat.room.cancel',{roomId:room.roomId,proof:room.proof});
 }
 let room=await c('combat.room.create',{formatId,opponentId});assert.deepEqual(room.pools.enemy.map(c=>c.generalId),disclosed[formatId]);room=await c('combat.room.prepare',{roomId:room.roomId,proof:room.proof,reserveRefs:refs.slice(0,format.reservePerSide)});let series=room.series;
 assert.equal(room.kind,'stage-challenge');assert.equal(room.tableFee,0);
 if(formatId!=='kof'){
  const w=r.inspect().world,s=w.matches.at(-1).series,rejected=settleChallenge(structuredClone(w.progression),{completed:true,simulated:false,originVerified:true,sourceVerified:true,challengeId:s.challengeId,stageId:s.stageId,productId:w.progression.stages[0].productId,resultId:'one-win-fake',matchId:s.matchId,formatId,winningTeamId:'mine',playerWins:1,winsRequired:1});assert.equal(rejected.ok,false,'native BO3 must not unlock on one win');
 }
 for(let round=0;round<format.winsRequired;round++){
  const seats=series.round.seatSkeleton.filter(s=>s.teamId==='mine');await c('combat.selectRound',{matchId:series.matchId,roundId:series.round.roundId,selections:seats.map((seat,i)=>({seatId:seat.seatId,inventoryRef:refs[i]}))});await c('combat.start',{matchId:series.matchId});const game=r.inspect().world.matches.at(-1).gameId;await r.trustedEngineEvent(series.matchId,{type:'ready',matchId:game});series=await r.trustedEngineEvent(series.matchId,{type:'result',matchId:game,result:'win'});if(round+1<format.winsRequired)assert.equal(r.inspect().world.progression.allies.length,0);
 }
 const w=r.inspect().world;assert.equal(series.phase,'finished');assert.equal(w.progression.allies.length,1);assert(w.progression.unlockedProductIds.includes('refresh'));assert.equal(Object.keys(w.progression.receipts).length,1);assert.equal(w.clock.minute,minute+30);assert(refs.every(ref=>w.items[ref].lock===null));await r.disconnect();console.log('PASS challenge',formatId,'complete-win unlock, per-format frozen pool, fees, locks, exact time charge');
}
const world=createWorld(rules);world.clock.phase='open';const npcs=['npc-a','npc-b'].map(actorId=>({actorId,name:actorId,presence:'onsite',activity:'seated',wallet:{available:100,reserved:0}}));world.npcs.push(...npcs);
for(const npc of npcs)for(const [i,id]of ['caocao','liubei','sunquan'].entries()){const card=catalog.byId.get(id),ref=npc.actorId+'-'+i;world.items[ref]={inventoryRef:ref,kind:'card',cardKey:card.cardKey,ownerId:npc.actorId,location:'collection',lock:null,protected:false,cost:0};world.circulation[card.cardKey]={day:1,source:'fixture'};}
const simulated=registerNpcMatch(world,catalog,world.tables[0],npcs,{tableFee:10});assert.equal(simulated.mode,'kof');assert.equal(simulated.rules.winsRequired,1);assert.equal(simulated.mine.length,3);assert.equal(simulated.enemy.length,3);advanceNpcSimulation(world,catalog,simulated,1000);assert.equal(simulated.status,'finished');assert.equal(simulated.results.length,1);assert(npcs.every(n=>n.wallet.available===90&&n.wallet.reserved===0));assert.equal(world.daily.service,20);console.log('PASS NPC auto tables use complete three-general KOF pools, finish once and pay once');
