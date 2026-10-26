import {clone,need,serial,random} from './common.mjs';
import {activeRoom,initialiseRooms} from './room-state.mjs';
import {getFormat,assertFormatAvailable} from '../combat-formats/index.mjs';
import {planRoomOpponent,prepareV7,lifecycleV7,seriesView} from './operations-v7.mjs';
import {note} from './world.mjs';
import {leaveQueue} from './match-queue.mjs';

const stamp=w=>w.clock.day*1440+w.clock.minute;
const ensure=w=>{initialiseRooms(w);need(w.combatRooms.version===1,'FEATURE_UNAVAILABLE','房间数据来自较新版本，原记录已保留。');return w.combatRooms;};
const get=(w,roomId)=>{const r=ensure(w).items.find(r=>r.roomId===roomId);need(r,'NOT_FOUND','房间不存在。');return r;};
function near(w,tableId,navigation){if(!navigation.size)return;const map=navigation.get(w.player.roomId),anchors=[map?.anchors['battleRoom.service'],map?.anchors[tableId]].filter(Boolean);need(anchors.some(a=>Math.hypot(w.player.x-a.x,w.player.y-a.y)<=(a.radius||24)),'NOT_IN_RANGE','请先走到报名台或牌桌旁创建房间。');}
function check(w,r,p){need(p.proof?.worldId===w.worldId&&p.proof?.branchId===w.branchId,'STALE_OPERATION','房间操作属于旧存档分支。');need(r.worldId===w.worldId&&r.branchId===w.branchId,'STALE_OPERATION','房间属于旧存档分支。');need((p.expectedRevision??p.proof.resourceRevision)===r.revision,'STALE_OPERATION','房间已更新，请刷新后确认。');}
function release(w,r){
  if(r.opponentId){const n=w.npcs.find(n=>n.actorId===r.opponentId);if(n?.currentRoomId===r.roomId){n.wallet.reserved=Math.max(0,(n.wallet.reserved||0)-r.tableFee);delete n.currentRoomId;n.activity='idle';n.label='';if(n.visit)n.visit.idleSeconds=8;}}
  for(const c of r.plan?.enemy||[])if(c.inventoryRef&&w.items[c.inventoryRef]?.lock===r.roomId)w.items[c.inventoryRef].lock=null;
  const t=w.tables.find(t=>t.tableId===r.tableId);if(t?.reservation===r.roomId)t.reservation=null;
}
function bind(w,catalog,r,capabilities){
  const plan=planRoomOpponent(w,catalog,{formatId:r.formatId,opponentId:r.requestedOpponentId,seed:r.seed},capabilities);if(!plan)return false;
  const n=w.npcs.find(n=>n.actorId===plan.actorId);n.currentRoomId=r.roomId;n.wallet.reserved=(n.wallet.reserved||0)+plan.tableFee;n.trip=null;n.moving=false;n.activity='waiting-room';n.label='已入房，等待选将';delete n.playerInviteUntil;
  for(const c of plan.enemy)if(c.inventoryRef)w.items[c.inventoryRef].lock=r.roomId;
  r.plan=clone(plan);r.tableFee=plan.tableFee;r.opponentId=plan.actorId;r.opponentName=n.name;r.status='selecting-reserve';r.revision++;w.combatRooms.revision++;
  note(w,'combatRoomOpponentJoined',{roomId:r.roomId,actorId:n.actorId});return true;
}
function publicCards(catalog,cards){return (cards||[]).map(c=>{const card=catalog.byKey.get(c.cardKey)||catalog.byId.get(c.generalId);return {key:c.generalId,generalId:c.generalId,cardKey:card.cardKey,name:card.name,imageUrl:card.imageUrl,rarity:card.currentRarity,globalScore:card.globalScore,modeScores:clone(card.power.modeScores||{}),loan:!!c.loanRef,eligible:true};});}
export function roomView(w,catalog,r){
  const m=r.matchId?w.matches.find(m=>m.matchId===r.matchId):null,s=m?seriesView(w,m.matchId):null,f=getFormat(r.formatId);
  return {roomId:r.roomId,roomLabel:`${w.tables.findIndex(t=>t.tableId===r.tableId)+1}号房间`,version:1,revision:r.revision,proof:{worldId:w.worldId,branchId:w.branchId,resourceRevision:r.revision},worldId:w.worldId,branchId:w.branchId,tableId:r.tableId,formatId:r.formatId,formatLabel:f?.label||r.formatId,status:m?.status==='finished'?'finished':r.status,opponentId:r.opponentId||null,opponentName:r.opponentName||'等待对手',tableFee:r.tableFee,expiresAt:r.expiresAt,waitReason:r.waitReason||null,
    matchId:r.matchId||null,series:s,capacity:f?.reservePerSide||0,pools:{mine:publicCards(catalog,m?.mine||[]),enemy:publicCards(catalog,m?.enemy||r.plan?.enemy||[])},readiness:{mine:!!m,enemy:!!r.plan},kind:r.plan?.kind||'friendly',seedFrozen:!!r.plan,reason:r.reason||null};
}
function legacyRoom(w,catalog,m){return {roomId:'match:'+m.matchId,roomLabel:`${w.tables.findIndex(t=>t.tableId===m.tableId)+1}号房间`,legacy:true,capacity:getFormat(m.mode)?.reservePerSide||m.mine.length,kind:m.series?.challengeKind||'friendly',matchId:m.matchId,tableId:m.tableId,formatId:m.mode,formatLabel:getFormat(m.mode)?.label||m.mode,status:m.status==='finished'?'finished':'series',opponentName:w.npcs.find(n=>n.actorId===m.opponentId)?.name||'牌友',tableFee:((m.serviceContributions||[]).reduce((sum,c)=>sum+c.amount,0)||m.serviceHeld||m.serviceDue||0)/(m.background?2:1),pools:{mine:publicCards(catalog,m.mine),enemy:publicCards(catalog,m.enemy)},series:m.series?seriesView(w,m.matchId):null,readiness:{mine:true,enemy:true},background:!!m.background};}
export function queryRooms(w,catalog,p={}){
  const own=w.combatRooms?.version===1?w.combatRooms.items:[];
  if(p.roomId){const r=own.find(r=>r.roomId===p.roomId);if(r)return roomView(w,catalog,r);const m=w.matches.find(m=>'match:'+m.matchId===p.roomId);need(m,'NOT_FOUND','房间已不存在。');return legacyRoom(w,catalog,m);}
  const items=own.filter(r=>!['finished','cancelled'].includes(r.status)).map(r=>roomView(w,catalog,r));
  for(const m of w.matches.filter(m=>m.status!=='finished'&&!items.some(r=>r.matchId===m.matchId)))items.push(legacyRoom(w,catalog,m));
  return {version:1,items,active:items.find(r=>!r.background)||null};
}
export function createRoom(w,catalog,p,navigation,capabilities){
  const state=ensure(w);need(w.clock.phase==='open','SHOP_CLOSED','请在营业中创建对战房间。');need(!activeRoom(w)&&!w.matches.some(m=>!m.background&&m.status!=='finished'),'MATCH_ACTIVE','你已有房间或比赛，请先返回完成或取消。');
  leaveQueue(w,'player','created-room');
  const formatId=p.formatId||'kof',allowed=assertFormatAvailable(formatId,capabilities);need(allowed.ok,allowed.error?.code,allowed.error?.message);
  const table=p.tableId?w.tables.find(t=>t.tableId===p.tableId):w.tables.find(t=>!t.matchId&&!t.reservation||!t.matchId&&t.reservation==='player');need(table&&!table.matchId&&(!table.reservation||table.reservation==='player'),'TABLE_BUSY','没有空闲牌桌。');near(w,table.tableId,navigation);
  state.items=state.items.filter(r=>!['finished','cancelled'].includes(r.status)||r.createdDay>=w.clock.day-30).slice(-98);
  const r={roomId:serial(w,'room'),worldId:w.worldId,branchId:w.branchId,formatId,tableId:table.tableId,createdDay:w.clock.day,expiresAt:Math.min(w.clock.day*1440+1200,stamp(w)+(w.rules.roomWaitMinutes||180)),revision:1,status:'waiting-opponent',tableFee:0,requestedOpponentId:p.opponentId||null,seed:Math.floor(random(w)*4294967296)};
  table.reservation=r.roomId;state.items.push(r);state.revision++;bind(w,catalog,r,capabilities);note(w,'combatRoomCreated',{roomId:r.roomId,formatId});return roomView(w,catalog,r);
}
export function prepareRoom(w,catalog,p,navigation,capabilities){
  const r=get(w,p.roomId);check(w,r,p);need(r.status==='selecting-reserve'&&r.plan,'NOT_READY','对手尚未入房，请等待备战池确定。');near(w,r.tableId,navigation);
  // The temporary unlock and the series' permanent locks are within one world fork/commit.
  release(w,r);
  const s=prepareV7(w,catalog,{formatId:r.formatId,reserveRefs:p.reserveRefs,opponentId:r.opponentId,tableId:r.tableId},navigation,capabilities,{roomPlan:r.plan});
  r.matchId=s.matchId;r.status='series';r.revision++;w.combatRooms.revision++;w.matches.find(m=>m.matchId===r.matchId).roomId=r.roomId;
  note(w,'combatRoomReady',{roomId:r.roomId,matchId:r.matchId});return roomView(w,catalog,r);
}
export function cancelRoom(w,catalog,p){
  const r=get(w,p.roomId);check(w,r,p);if(['finished','cancelled'].includes(r.status))return roomView(w,catalog,r);
  if(r.matchId){const m=w.matches.find(m=>m.matchId===r.matchId);need(m?.status==='finished','MATCH_ACTIVE','牌局已登记，请在比赛选项中取消、认输或放弃。');r.status='finished';}
  else{release(w,r);r.status='cancelled';r.reason=p.reason||'player-cancelled';}
  r.revision++;w.combatRooms.revision++;note(w,'combatRoomClosed',{roomId:r.roomId});return roomView(w,catalog,r);
}
export function tickRooms(w,catalog,capabilities,{close=false,restore=false}={}){
  if(w.combatRooms?.version!==1)return;
  for(const r of w.combatRooms.items){
    if(['finished','cancelled'].includes(r.status))continue;
    if(restore){if(r.branchId!==w.branchId||r.worldId!==w.worldId){r.revision++;w.combatRooms.revision++;}r.worldId=w.worldId;r.branchId=w.branchId;}
    if(r.matchId){if(w.matches.find(m=>m.matchId===r.matchId)?.status==='finished'){r.status='finished';r.revision++;w.combatRooms.revision++;}continue;}
    if(close||stamp(w)>=r.expiresAt||!['open','preparing'].includes(w.clock.phase)){cancelRoom(w,catalog,{roomId:r.roomId,reason:close?'business-closed':'expired',proof:{worldId:w.worldId,branchId:w.branchId,resourceRevision:r.revision}});continue;}
    if(r.status==='waiting-opponent'&&w.clock.phase==='open')try{bind(w,catalog,r,capabilities);}catch(e){if(r.waitReason!==e.message){r.waitReason=e.message;r.revision++;w.combatRooms.revision++;}}
  }
}
