import {clone,integer,need,serial,random} from './common.mjs';
import {eligible,combatPreview,registerMatch,registerNpcMatch,voidNpcMatch} from './matches.mjs';
import {managementEffects} from './management.mjs';
import {onSite} from './visits.mjs';
import {note} from './world.mjs';
import {seatNpcMatch} from './npc-tables.mjs';
import {pathfind,canStand,moveActor} from './navigation.mjs';

const stamp=w=>w.clock.day*1440+w.clock.minute;
export const playerQueue=w=>(w.matchQueue||[]).find(q=>q.ownerId==='player');
export function queueView(w){
  return {player:clone(playerQueue(w)||null),waiting:(w.matchQueue||[]).map(q=>({queueId:q.queueId,ownerId:q.ownerId,name:q.ownerId==='player'?'店长':w.npcs.find(n=>n.actorId===q.ownerId)?.name,mode:q.mode,tableId:q.tableId,fee:q.fee,expiresAt:q.expiresAt})),playerMatch:clone(w.matches.find(m=>!m.background&&m.status!=='finished')||null)};
}
export function leaveQueue(w,ownerId='player',reason='cancelled'){
  const entry=(w.matchQueue||[]).find(q=>q.ownerId===ownerId);
  if(!entry)return {left:false};
  for(const ref of entry.inventoryRefs)if(w.items[ref]?.lock===entry.queueId)w.items[ref].lock=null;
  const npc=w.npcs.find(n=>n.actorId===ownerId);
  if(npc){npc.wallet.reserved=Math.max(0,(npc.wallet.reserved||0)-entry.fee);delete npc.currentQueueId;if(npc.activity==='waiting-match')npc.activity='idle';}
  w.matchQueue=w.matchQueue.filter(q=>q!==entry);
  note(w,'matchQueueLeft',{queueId:entry.queueId,ownerId,reason});return {left:true,queueId:entry.queueId};
}
export function joinQueue(w,catalog,p,ownerId='player'){
  need(w.clock.phase==='open','SHOP_CLOSED','请在营业时等待对手。');
  need(!(w.matchQueue||[]).some(q=>q.ownerId===ownerId),'ALREADY_QUEUED','已经在等待对手。');
  need(!w.matches.some(m=>m.status!=='finished'&&[m.mineOwnerId||'player',m.enemyOwnerId||m.opponentId].includes(ownerId)),'MATCH_ACTIVE','请先结束当前比赛。');
  const slots=p.mode==='kof'?3:p.mode==='bo3'?1:0;need(slots,'INVALID_INPUT','请选择 KOF 或 BO3。');
  need(Array.isArray(p.inventoryRefs)&&p.inventoryRefs.length===slots&&p.inventoryRefs.every(r=>typeof r==='string'),'INVALID_INPUT','请选择完整参赛阵容。');
  const options=eligible(w,catalog,ownerId),team=p.inventoryRefs.map(ref=>options.find(c=>c.inventoryRef===ref&&c.eligible));
  need(team.every(Boolean)&&new Set(team.map(c=>c.generalId)).size===slots,'NOT_ELIGIBLE','请选择足够的不同可用武将。');
  if(p.tableId)need(w.tables.some(t=>t.tableId===p.tableId),'NOT_FOUND','牌桌不存在。');
  const fee=ownerId==='player'?0:managementEffects(w).tableFee,npc=w.npcs.find(n=>n.actorId===ownerId);
  if(ownerId!=='player')need(npc&&onSite(npc)&&!npc.currentMatchId&&npc.wallet.available-(npc.wallet.reserved||0)>=fee,'NOT_READY','顾客当前不能报名。');
  const entry={queueId:serial(w,'queue'),ownerId,tableId:p.tableId||null,mode:p.mode,inventoryRefs:[...p.inventoryRefs],lineup:team.map(c=>({cardKey:c.cardKey,name:c.name,inventoryRef:c.inventoryRef})),fee,createdAt:stamp(w),expiresAt:stamp(w)+90,waitMode:'manual'};
  w.matchQueue??=[];w.matchQueue.push(entry);for(const ref of entry.inventoryRefs)w.items[ref].lock=entry.queueId;
  if(npc){npc.currentQueueId=entry.queueId;npc.wallet.reserved=(npc.wallet.reserved||0)+fee;npc.activity='waiting-match';}
  note(w,'matchQueueJoined',{queueId:entry.queueId,ownerId,mode:entry.mode,fee});return clone(entry);
}
export function setWaitMode(w,{mode}){
  need(['manual','wander'].includes(mode),'INVALID_INPUT','等待时可选择自由行动或自动走动。');
  const entry=playerQueue(w);need(entry,'NOT_QUEUED','当前没有等待中的比赛。');entry.waitMode=mode;delete entry.wanderTrip;return clone(entry);
}
function valid(w,catalog,q){
  const npc=w.npcs.find(n=>n.actorId===q.ownerId);
  if(w.clock.phase!=='open'||stamp(w)>=q.expiresAt||q.ownerId!=='player'&&(!npc||!onSite(npc)||npc.currentMatchId||npc.trip?.stage==='exit'))return false;
  return q.inventoryRefs.every(ref=>{const i=w.items[ref],c=catalog.byKey.get(i?.cardKey);return i&&c&&i.ownerId===q.ownerId&&i.location==='collection'&&i.lock===q.queueId&&!i.protected&&!w.rules.compatibilityBlocks[c.generalId]&&(q.ownerId==='player'||w.circulation[i.cardKey]);});
}
export function tickMatchQueue(w,catalog,navigation,{schedule=true}={}){
  for(const entry of [...(w.matchQueue||[])])if(!valid(w,catalog,entry))leaveQueue(w,entry.ownerId,'expired-or-unavailable');
  if(w.clock.phase!=='open')return;
  const player=playerQueue(w),event=w.experience?.events.find(e=>e.day===w.clock.day&&e.status==='scheduled');
  if(schedule&&(w.rules.npcAutoBattles!==false||player))for(const npc of w.npcs){
    if(npc.currentRoomId||npc.specialist||npc.allyId||npc.playerInviteUntil||!onSite(npc)||npc.currentMatchId||npc.currentQueueId||npc.trip||npc.activity!=='idle'||(npc.nextMatchAt||0)>stamp(w)||event&&!event.actorIds.includes(npc.actorId)||npc.wallet.available-(npc.wallet.reserved||0)<managementEffects(w).tableFee)continue;
    const options=eligible(w,catalog,npc.actorId).filter(c=>c.eligible),unique=options.filter((c,i)=>options.findIndex(other=>other.generalId===c.generalId)===i),mode=player?.mode||'bo3',n=mode==='kof'?3:1;
    if(unique.length>=n)joinQueue(w,catalog,{mode,inventoryRefs:unique.slice(0,n).map(c=>c.inventoryRef)},npc.actorId);
  }
  // Keep the current serial matchmaking policy. Only player matches claim business time.
  if(w.matches.some(m=>m.status!=='finished'))return;
  const entries=w.matchQueue||[];
  const pairs=player?entries.filter(q=>q.ownerId!=='player'&&q.mode===player.mode).map(n=>[player,n]):[];
  if(schedule&&w.rules.npcAutoBattles!==false)for(let i=0;i<entries.length;i++)for(let j=i+1;j<entries.length;j++){
    const a=entries[i],b=entries[j];if(a.ownerId!=='player'&&b.ownerId!=='player'&&a.mode===b.mode&&a.fee===b.fee)pairs.push([a,b]);
  }
  for(const [a,b] of pairs){
    const target=a.tableId||b.tableId;
    if(a.tableId&&b.tableId&&a.tableId!==b.tableId)continue;
    const table=w.tables.find(t=>!t.matchId&&!t.reservation&&(!target||t.tableId===target));if(!table)continue;
    leaveQueue(w,a.ownerId,'matched');leaveQueue(w,b.ownerId,'matched');
    try{
      let match;
      if(a.ownerId==='player'){
        const preview=combatPreview(w,catalog,{mode:a.mode,tableId:table.tableId,inventoryRefs:a.inventoryRefs,opponentId:b.ownerId,opponentInventoryRefs:b.inventoryRefs},{tableFee:b.fee});
        match=registerMatch(w,catalog,preview,{}, {frozenFee:true});
      }else{
        const npcs=[a,b].map(q=>w.npcs.find(n=>n.actorId===q.ownerId));
        match=registerNpcMatch(w,catalog,table,npcs,{mode:a.mode,tableFee:a.fee,inventoryRefs:[a.inventoryRefs,b.inventoryRefs]});
        try{seatNpcMatch(w,match,navigation);}catch(error){voidNpcMatch(w,match.matchId,error.message);}
      }
      for(const entry of [a,b]){const npc=w.npcs.find(n=>n.actorId===entry.ownerId);if(npc)npc.nextMatchAt=stamp(w)+(w.rules.npcMatchCooldownMinutes||90);}
      note(w,'matchQueueMatched',{matchId:match.matchId,queueIds:[a.queueId,b.queueId]});
    }catch(error){note(w,'matchQueueFailed',{owners:[a.ownerId,b.ownerId],reason:error.message});}
    break;
  }
}
export function moveWaitingPlayer(w,navigation,seconds){
  const entry=playerQueue(w),map=navigation.get(w.player.roomId);
  if(!entry||entry.waitMode!=='wander'||!map)return false;
  if(entry.wanderRoom!==map.mapId){delete entry.wanderTrip;entry.wanderRoom=map.mapId;}
  if(!entry.wanderTrip?.path?.length){
    for(let attempt=0;attempt<12;attempt++){
      const point={x:(2+Math.floor(random(w)*Math.max(1,map.width-4)))*16+8,y:(2+Math.floor(random(w)*Math.max(1,map.height-4)))*16+8};
      if(!canStand(map,point.x,point.y))continue;
      try{entry.wanderTrip={path:pathfind(map,w.player,point)};break;}catch{/* Try another reachable interior tile. */}
    }
  }
  moveActor(map,w.player,entry.wanderTrip,seconds);return true;
}
