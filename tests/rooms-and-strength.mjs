import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {CONTRACT} from '../modules/backend/common.mjs';
import {buildCatalog,validateRules} from '../modules/backend/catalog.mjs';
import {modePower,RATED_FORMATS} from '../modules/backend/strength-modes.mjs';
import {probeModeCapabilities} from '../integration/modes/capabilities.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json'),catalog=buildCatalog(source,rules),caps=probeModeCapabilities({engineRoot:'vendor/noname'}).items;
for(const c of catalog.cards){const m=c.power.modeScores;assert.equal(c.globalScore,Math.round(RATED_FORMATS.reduce((s,k)=>s+m[k],0)/RATED_FORMATS.length*1000)/1000);assert(RATED_FORMATS.every(k=>Number.isFinite(m[k])));if(c.power.modeAvailability['doudizhu-bo3'])assert.equal(m['doudizhu-bo3'],Math.round((c.power.roles.landlord.score+c.power.roles.farmer.score)/2*1000)/1000);}
assert(catalog.byId.get('liubei').power.modeScores['versus2v2-bo3']>catalog.byId.get('liubei').power.modeScores.kof);
assert(catalog.byId.get('diaochan').power.modeScores['versus2v2-bo3']>catalog.byId.get('diaochan').power.modeScores.kof);
const blank=v=>({id:'fixture',hp:4,skills:[],power:{vector:v,confidence:.5}}),base=modePower(blank({}),rules.scoring);
const skill=description=>({...blank({}),skills:[{id:'fixture-skill',description}]});
assert(RATED_FORMATS.every(m=>base.modeScores[m]===50));assert(modePower(skill('结束阶段，你摸一张牌。'),rules.scoring).score>base.score);assert(modePower(skill('锁定技，结束阶段，你弃置一张牌。'),rules.scoring).score<base.score);assert.equal(modePower(blank({cards:999,carry:10,burst:10}),rules.scoring).score,base.score,'obsolete vectors do not leak into the two-round estimator');
assert.throws(()=>validateRules({...rules,modeWeights:{bo3:1,kof:0,'doudizhu-bo3':0,'versus2v2-bo3':0}}));
console.log('PASS 2563 generals: exact three-mode mean, role mean, team anchors, costs, no inherited-hand bonus, strict pricing weights');
let r=await createRuntime({source,rules,repository:memoryRepository(),modeCapabilities:caps});let seq=0;
const connect=()=>r.connect({contractVersion:CONTRACT,clientId:'room-test'}),c=async(type,payload={})=>{if(['combat.room.prepare','combat.room.cancel'].includes(type)&&!payload.proof){const w=r.inspect().world,room=w.combatRooms.items.find(r=>r.roomId===payload.roomId);payload={...payload,proof:{worldId:w.worldId,branchId:w.branchId,resourceRevision:room.revision}};}const x=await r.command({requestId:'room-test-'+ ++seq,type,payload});assert(x.ok,JSON.stringify(x));return x.data;},q=async(name,p={})=>{const x=await r.query(name,p);assert(x.ok,JSON.stringify(x));return x.data;};await connect();
let saved=r.inspect();saved.world.clock.phase='open';saved.world.clock.minute=540;saved.world.npcs.push({actorId:'rival',name:'陈远',roomId:'store',x:240,y:272,direction:'up',moving:false,presence:'onsite',wallet:{available:1000}});
const cards=['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo'].map(id=>catalog.byId.get(id));
for(const [i,card]of cards.entries())for(const ownerId of ['player','rival']){const ref=ownerId+'-'+i;saved.world.items[ref]={inventoryRef:ref,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,ownerId,location:'collection',lock:null,protected:false,cost:0};saved.world.circulation[card.cardKey]={day:1,source:'fixture'};}
await r.disconnect();r=await createRuntime({source,rules,repository:memoryRepository(saved),modeCapabilities:caps});await connect();
let room=await c('combat.room.create',{formatId:'versus2v2-bo3',opponentId:'rival'});assert.equal(room.pools.enemy.length,8);assert.equal(room.pools.mine.length,0);assert.equal(room.readiness.enemy,true);assert(room.pools.enemy.every(c=>c.imageUrl&&c.modeScores));
const raw=r.inspect(),before=JSON.stringify(raw);await q('combat.rooms');await q('combat.room',{roomId:room.roomId});assert.equal(JSON.stringify(r.inspect()),before);
assert.equal(raw.world.npcs.find(n=>n.actorId==='rival').wallet.reserved,room.tableFee);assert(raw.world.items['rival-0'].lock===room.roomId);
const failed=await r.command({requestId:'room-short',type:'combat.room.prepare',payload:{roomId:room.roomId,reserveRefs:['player-0'],proof:room.proof}});assert.equal(failed.ok,false);assert.equal(JSON.stringify(r.inspect()),before,'failed prepare must roll back temporary releases');
const frozen=room.pools.enemy.map(c=>c.generalId);room=await c('combat.room.prepare',{roomId:room.roomId,reserveRefs:cards.map((_,i)=>'player-'+i),expectedRevision:room.revision});assert.deepEqual(room.pools.enemy.map(c=>c.generalId),frozen);assert.equal(room.series.phase,'selecting');assert.equal(r.inspect().world.npcs.find(n=>n.actorId==='rival').wallet.reserved,0);
await c('combat.cancel',{matchId:room.matchId});assert.equal((await q('combat.rooms')).active,null);assert.equal(r.inspect().world.items['rival-0'].lock,null);
room=await c('combat.room.create',{formatId:'kof',opponentId:'rival'});await c('combat.room.cancel',{roomId:room.roomId});assert.equal(r.inspect().world.npcs.find(n=>n.actorId==='rival').wallet.available,1000);assert.equal(r.inspect().world.npcs.find(n=>n.actorId==='rival').wallet.reserved,0);
console.log('PASS room disclosure before player picks, fixed enemy pool, fees/locks, failed preparation rollback, cancellation/refund');
await c('business.close');await c('business.nextDay');await c('business.open');
saved=r.inspect();for(const n of saved.world.npcs)n.presence='offsite';await r.disconnect();r=await createRuntime({source,rules,repository:memoryRepository(saved),modeCapabilities:caps});await connect();
room=await c('combat.room.create',{formatId:'versus2v2-bo3'});assert.equal(room.status,'waiting-opponent');const minute=r.inspect().world.clock.minute;await r.advance(.2);assert(r.inspect().world.clock.minute>minute,'waiting room must not pause time');
const waitingBefore=structuredClone(room);saved=r.inspect();const returning=saved.world.npcs.find(n=>n.actorId==='rival');returning.presence='onsite';returning.activity='idle';returning.trip=null;
// A real visit can consign surplus cards. Give this returning fixture a fresh,
// complete reserve instead of relying on yesterday's shopping decisions.
for(const [i,card]of cards.entries()){const ref='returning-'+i;saved.world.items[ref]={inventoryRef:ref,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,ownerId:'rival',location:'collection',lock:null,protected:false,cost:0};}
await r.disconnect();r=await createRuntime({source,rules,repository:memoryRepository(saved),modeCapabilities:caps});await connect();
room=(await q('combat.rooms')).active;assert.equal(room.status,'selecting-reserve','waiting room must accept a qualifying returning NPC: '+JSON.stringify({room,npc:r.inspect().world.npcs.find(n=>n.actorId==='rival'),cards:Object.values(r.inspect().world.items).filter(i=>i.ownerId==='rival')}));
const backup=await c('saves.create');await c('saves.load',{archiveId:backup.archiveId});room=(await q('combat.rooms')).active;assert.notEqual(room.proof.branchId,waitingBefore.proof.branchId);
const stale=await r.command({requestId:'stale-room-cancel',type:'combat.room.cancel',payload:{roomId:room.roomId,proof:waitingBefore.proof}});assert.equal(stale.error.code,'STALE_OPERATION');
await c('business.close');assert.equal(r.inspect().world.combatRooms.items.at(-1).status,'cancelled');assert(r.inspect().world.tables.every(t=>!t.reservation));
console.log('PASS waiting room auto join, branch proof, backup/load consistency; waiting room allows business clock, closing releases room; old series API remains compatible');
saved=r.inspect();saved.world.rules.scoring.method='resource-yield-1';saved.world.rules.modeWeights={bo3:.5,kof:.5};delete saved.world.ratingRulesVersion;
const manufactured=JSON.stringify(saved.world.items);await r.disconnect();r=await createRuntime({source,rules,repository:memoryRepository(saved),modeCapabilities:caps});await connect();assert.equal(r.inspect().world.rules.scoring.method,'ideal-two-round-1');assert.equal(JSON.stringify(r.inspect().world.items),manufactured,'rating migration must preserve old printed cards, manufactured contents and cost');console.log('PASS legacy rating migrates without rewriting existing physical goods');await r.disconnect();
