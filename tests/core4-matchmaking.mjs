import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {createWorld} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url))),rules=JSON.parse(fs.readFileSync(new URL('../data/backend-rules.json',import.meta.url)));
const catalog=buildCatalog(source,rules),keys=['caocao','liubei','sunquan'].map(id=>catalog.byId.get(id).cardKey);
let seq=0;
async function fixture({npcs=0,maps=[],auto=true,fee=3,simulate=true}={}){
  const config={...rules,npcAutoBattles:auto,npcSimulation:simulate,npcSimulationSeconds:1,tableFee:fee},world=createWorld(config);world.clock.phase='open';world.clock.minute=540;world.nextNpcMinute=10000;
  if(maps.length){world.player.roomId='battle-room';Object.assign(world.player,maps.find(m=>m.mapId==='battle-room').interactions.find(i=>i.id==='battleRoom.service').stand);}
  for(let i=0;i<npcs;i++)world.npcs.push({actorId:'npc-'+i,name:'测试顾客'+i,appearanceId:'rookie',wallet:{available:1000},presence:'onsite',roomId:'store',x:120,y:120,activity:'idle',moving:false,direction:'down'});
  for(const owner of ['player',...world.npcs.map(n=>n.actorId)])for(let n=0;n<3;n++){
    const ref=owner+'-card-'+n;world.items[ref]={inventoryRef:ref,kind:'card',ownerId:owner,cardKey:keys[n],printedRarity:'R',printVersion:'test',location:'collection',cost:1,protected:false,lock:null};
    if(owner!=='player')world.circulation[keys[n]]={day:1,source:'test'};
  }
  const repository=memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{}}),host=await createRuntime({source,rules:config,repository,maps,backgroundAvailable:true});const connection=await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'queue-test'});
  return {host,repository,config,connection,async c(type,payload={}){const r=await host.command({requestId:'queue-test-'+ ++seq,type,payload});assert.equal(r.ok,true,JSON.stringify(r));return r.data;},async q(name,p={}){const r=await host.query(name,p);assert.equal(r.ok,true,JSON.stringify(r));return r.data;}};
}
const f=await fixture({auto:false}),refs=[0,1,2].map(n=>'player-card-'+n);
await f.c('combat.joinQueue',{mode:'kof',inventoryRefs:refs});assert.equal((await f.q('combat.queue')).player.mode,'kof');
assert.ok(refs.every(ref=>f.host.inspect().world.items[ref].lock.startsWith('queue-')));
const before=f.host.inspect().world.clock.minute;await f.host.advance(.25);assert.ok(f.host.inspect().world.clock.minute>before);assert.equal((await f.q('shop.snapshot')).clock.pauseReasons.length,0);
await f.c('combat.leaveQueue');assert.ok(refs.every(ref=>!f.host.inspect().world.items[ref].lock));assert.equal((await f.q('combat.queue')).player,null);await f.host.disconnect();

const maps=['store','battle-room'].map(n=>JSON.parse(fs.readFileSync(new URL('../assets/frontend/maps/'+n+'.json',import.meta.url))));
const moving=await fixture({maps,auto:false});await moving.c('combat.joinQueue',{mode:'bo3',tableId:'battleRoom.table.01',inventoryRefs:[refs[0]]});await moving.c('combat.setWaitMode',{mode:'wander'});
const position=moving.host.inspect().world.player;await moving.host.advance(.25);const moved=moving.host.inspect().world.player;assert.ok(Math.hypot(moved.x-position.x,moved.y-position.y)>0);
moving.host.world.input({sessionId:moving.connection.sessionId,inputSeq:1,roomId:moved.roomId,navVersion:moved.navVersion,vector:{x:1,y:0}});await moving.host.advance(.25);assert.equal((await moving.q('combat.queue')).player.waitMode,'manual');
await moving.c('combat.leaveQueue');await moving.host.disconnect();

// One NPC waits at the accepted price; changing the sign does not rewrite that queue's fee.
const game=await fixture({npcs:1});await game.host.advance(.1);assert.equal((await game.q('combat.queue')).waiting.length,1);assert.equal(game.host.inspect().world.npcs[0].wallet.reserved,3);
await game.c('room.setTableFee',{amount:99});await game.c('combat.joinQueue',{mode:'bo3',inventoryRefs:[refs[0]]});await game.host.advance(.1);
let match=game.host.inspect().world.matches[0];assert.equal(match.status,'prepared');assert.equal(match.serviceHeld,3);assert.equal(game.host.inspect().world.npcs[0].currentQueueId,undefined);
await game.c('combat.start',{matchId:match.matchId});match=game.host.inspect().world.matches[0];const frozen=game.host.inspect().world.clock.minute;
await game.host.advance(1);assert.equal(game.host.inspect().world.clock.minute,frozen);assert.ok((await game.q('shop.snapshot')).clock.pauseReasons.some(p=>p.code==='match-time'));
await game.host.trustedEngineEvent(match.matchId,{type:'ready',matchId:match.gameId});await game.host.trustedEngineEvent(match.matchId,{type:'result',matchId:match.gameId,result:'win'});
assert.equal(game.host.inspect().world.clock.minute,frozen,'a BO3 bout does not consume a whole match duration');
await game.c('combat.continue',{matchId:match.matchId});match=game.host.inspect().world.matches[0];await game.host.trustedEngineEvent(match.matchId,{type:'ready',matchId:match.gameId});await game.host.trustedEngineEvent(match.matchId,{type:'result',matchId:match.gameId,result:'win'});
assert.equal(game.host.inspect().world.clock.minute,frozen+30);assert.equal(game.host.inspect().world.daily.service,3);assert.equal(game.host.inspect().world.matches[0].timeSession.applied,true);
await assert.rejects(game.host.trustedEngineEvent(match.matchId,{type:'result',matchId:match.gameId,result:'win'}),e=>e.code==='STALE_EVENT');assert.equal(game.host.inspect().world.clock.minute,frozen+30);
await game.host.disconnect();const reconnected=await createRuntime({source,rules:game.config,repository:game.repository});await reconnected.connect({contractVersion:'card-shop-ui/1.0',clientId:'queue-reconnect'});assert.equal(reconnected.inspect().world.clock.minute,frozen+30);await reconnected.disconnect();

// NPC simulation uses its execution time while business is frozen, without a self-pause deadlock.
const npc=await fixture({npcs:2,fee:2});await npc.host.advance(.1);await npc.host.advance(.1);let n=npc.host.inspect().world.matches[0];assert.equal(n.status,'running');const minute=npc.host.inspect().world.clock.minute;
const lease=await npc.host.pause.acquire({ownerId:'test-dialog',reason:'测试交互'});await npc.host.advance(.25);assert.equal(npc.host.inspect().world.matches[0].simulation.elapsedSeconds,n.simulation.elapsedSeconds);await npc.host.pause.release(lease.leaseId);
await npc.host.advance(.25);assert.equal(npc.host.inspect().world.clock.minute,minute);await npc.host.advance(.25);await npc.host.advance(.25);await npc.host.advance(.25);
n=npc.host.inspect().world.matches[0];assert.equal(n.status,'finished');assert.equal(npc.host.inspect().world.clock.minute,minute+30);assert.equal(npc.host.inspect().world.daily.service,4);assert.equal(npc.host.inspect().world.wallet.escrowLiability,0);assert.equal((await npc.q('shop.snapshot')).clock.pauseReasons.length,0);await npc.host.disconnect();
// Trusted background events deferred by a dialog are drained even while match time freezes the world.
const background=await fixture({npcs:2,simulate:false});await background.host.advance(.1);let bg=background.host.inspect().world.matches[0];await background.host.startBackgroundMatch(bg.matchId);bg=background.host.inspect().world.matches[0];
await background.host.trustedEngineEvent(bg.matchId,{type:'ready',matchId:bg.gameId});const dialog=await background.host.pause.acquire({ownerId:'test',reason:'交互'});
assert.equal((await background.host.trustedEngineEvent(bg.matchId,{type:'result',matchId:bg.gameId,result:'win'})).deferred,true);await background.host.pause.release(dialog.leaseId);await background.host.advance(.1);
assert.equal(background.host.inspect().world.matches[0].status,'awaitingNext');assert.equal(background.host.inspect().world.pendingEngineEvents.length,0);
await background.host.startBackgroundMatch(bg.matchId);bg=background.host.inspect().world.matches[0];await background.host.trustedEngineEvent(bg.matchId,{type:'ready',matchId:bg.gameId});await background.host.trustedEngineEvent(bg.matchId,{type:'result',matchId:bg.gameId,result:'win'});assert.equal(background.host.inspect().world.matches[0].timeSession.applied,true);await background.host.disconnect();
console.log('PASS CORE4 matchmaking: real no-opponent queue, free/wander/manual movement, frozen accepted NPC fees, roster reservation/release, serial matches, BO3 one-time 30 minutes, persisted result dedupe and independently progressing paused-world NPC simulation.');
