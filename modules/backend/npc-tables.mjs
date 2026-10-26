import {clone,need} from './common.mjs';
import {eligible,registerNpcMatch,voidNpcMatch,advanceNpcSimulation} from './matches.mjs';
import {managementEffects} from './management.mjs';
import {pathfind,moveActor} from './navigation.mjs';
import {note} from './world.mjs';
import {onSite,departCustomer} from './visits.mjs';
import {customerFeedback} from './trading.mjs';

function tableSeat(map,tableId,index){const table=map.tables?.find(t=>t.id===tableId||tableId.endsWith(t.id));return table?.seatAnchors?.[index];}
function routeToTable(npc,index,table,navigation){
  const store=navigation.get('store'),room=navigation.get('battle-room');
  if(!store||!room)return null;
  const seat=tableSeat(room,table.tableId,index);need(seat,'INVALID_MAP','地图没有对应牌桌座位。');
  if(npc.roomId==='battle-room')return {kind:'match',stage:'seat',path:pathfind(room,npc,seat),seat:clone(seat)};
  const door=store.anchors['store.toBattleRoom'];need(door,'INVALID_MAP','主店缺少对战房出口。');return {kind:'match',stage:'store-door',path:pathfind(store,npc,door),seat:clone(seat)};
}
export function seatNpcMatch(w,match,navigation){
  const npcs=[match.mineOwnerId,match.enemyOwnerId].map(id=>w.npcs.find(n=>n.actorId===id));
  const table=w.tables.find(t=>t.tableId===match.tableId);
  const routes=npcs.map((npc,index)=>routeToTable(npc,index,table,navigation));
  npcs.forEach((npc,index)=>{npc.trip=routes[index];npc.activity=routes[index]?'going-to-table':'seated';if(!routes[index])npc.roomId='battle-room';});
}
export function tickNpcTables(w,catalog,navigation,seconds,{schedule=true,routes:moveRoutes=true,simulate=true}={}){
  const store=navigation.get('store'),room=navigation.get('battle-room');
  if(moveRoutes)for(const npc of w.npcs){
    try{
    if(npc.returnAfterMatch){
      if(!store||!room){departCustomer(w,npc,'match-finished');continue;}
      if(npc.roomId==='store')npc.trip={kind:'match',stage:'store-return',path:pathfind(store,npc,store.anchors['store.entry'])};
      else {const door=room.anchors['battleRoom.toStore'];npc.trip={kind:'match',stage:'room-exit',path:pathfind(room,npc,door)};}
      npc.activity='leaving-table';npc.returnAfterMatch=false;
    }
    if(npc.trip?.kind!=='match')continue;
    const map=navigation.get(npc.roomId);need(map,'INVALID_MAP','顾客牌桌路线所在地图不可用。');
    npc.trip.travelSeconds=(npc.trip.travelSeconds||0)+Math.max(0,seconds)*w.clock.speed;
    need(npc.trip.travelSeconds<=60,'NPC_ROUTE_TIMEOUT','顾客未能在规定时间内完成牌桌行程。');
    moveActor(map,npc,npc.trip,seconds*w.clock.speed);if(npc.trip.path.length)continue;
    if(npc.trip.stage==='store-door'){
      const door=store.anchors['store.toBattleRoom'],entry=room.anchors[door.targetAnchor];need(entry,'INVALID_MAP','对战房入口未匹配。');npc.roomId='battle-room';npc.navVersion=room.navVersion;npc.x=entry.x;npc.y=entry.y;npc.trip.stage='seat';npc.trip.path=pathfind(room,npc,npc.trip.seat);
    }else if(npc.trip.stage==='room-exit'){
      const door=room.anchors['battleRoom.toStore'],entry=store.anchors[door.targetAnchor];need(entry,'INVALID_MAP','主店入口未匹配。');npc.roomId='store';npc.navVersion=store.navVersion;npc.x=entry.x;npc.y=entry.y;npc.trip={kind:'match',stage:'store-return',path:pathfind(store,npc,store.anchors['store.entry'])};
    }else if(npc.trip.stage==='seat'){npc.activity='seated';npc.trip=null;npc.moving=false;}
    else departCustomer(w,npc,'match-finished');
    }catch(error){note(w,'npcTableRouteUnavailable',{actorId:npc.actorId,reason:error.message});if(npc.currentMatchId)voidNpcMatch(w,npc.currentMatchId,error.message);if(!npc.currentMatchId)departCustomer(w,npc,'table-route-unavailable');}
  }
  if(simulate)for(const m of w.matches)if(m.background&&m.simulated)advanceNpcSimulation(w,catalog,m,seconds);
  if(!schedule||w.rules.npcAutoBattles===false||w.clock.phase!=='open'||w.matches.some(m=>m.background&&m.status!=='finished'))return;
  const stamp=w.clock.day*1440+w.clock.minute;if(stamp<(w.nextNpcMatchAt||0))return;w.nextNpcMatchAt=stamp+(w.rules.npcMatchIntervalMinutes||45);
  const table=w.tables.find(t=>!t.matchId&&!t.reservation);if(!table){for(const npc of w.npcs.filter(n=>onSite(n)&&n.activity==='idle'&&!n.currentRoomId&&!n.currentMatchId&&eligible(w,catalog,n.actorId).some(i=>i.eligible)))customerFeedback(w,npc,'table-full');return;}
  const fee=managementEffects(w).tableFee;
  const event=w.experience?.events.find(e=>e.day===w.clock.day&&e.status==='scheduled');
  const npcs=w.npcs.filter(n=>onSite(n)&&!n.trip&&!n.currentRoomId&&!n.currentMatchId&&n.activity==='idle'&&n.wallet.available>=fee&&(n.nextMatchAt||0)<=stamp&&(!event||event.actorIds.includes(n.actorId))&&new Set(eligible(w,catalog,n.actorId).filter(i=>i.eligible).map(i=>i.generalId)).size>=3).slice(0,2);
  if(npcs.length<2)return;
  let routes;
  try{routes=npcs.map((npc,index)=>routeToTable(npc,index,table,navigation));}
  catch(error){note(w,'npcTableRouteUnavailable',{tableId:table.tableId,reason:error.message});return;}
  const match=registerNpcMatch(w,catalog,table,npcs);
  npcs.forEach((npc,i)=>{npc.nextMatchAt=stamp+(w.rules.npcMatchCooldownMinutes||90);npc.trip=routes[i];npc.activity=routes[i]?'going-to-table':'seated';if(!routes[i])npc.roomId='battle-room';});
  note(w,'npcTableReserved',{matchId:match.matchId});
}
export function backgroundState(w,paused){
  return {worldId:w.worldId,branchId:w.branchId,paused,matches:w.matches.filter(m=>m.background&&!m.simulated&&m.status!=='finished').map(m=>({...clone(m),seated:[m.mineOwnerId,m.enemyOwnerId].every(owner=>w.npcs.find(n=>n.actorId===owner)?.activity==='seated')}))};
}
