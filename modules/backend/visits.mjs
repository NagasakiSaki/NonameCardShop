// Customer identities own money/cards permanently; presence belongs to a finite shop visit.
import {serial} from './common.mjs';
import {note} from './world.mjs';
import {canStand,pathfind} from './navigation.mjs';

export const onSite=npc=>npc.presence!=='offsite';
const stamp=w=>w.clock.day*1440+w.clock.minute;
export function departCustomer(w,npc,reason='visit-complete'){
  if(npc.currentMatchId)return false;
  const wasPresent=onSite(npc);npc.presence='offsite';npc.trip=null;npc.activity='away';npc.label='';npc.moving=false;npc.returnAfterMatch=false;
  npc.nextVisitAt=stamp(w)+Math.max(1,w.rules.npcIntervalMinutes);npc.lastVisit=npc.visit?{...npc.visit,leftAt:stamp(w),reason}:null;delete npc.visit;
  if(wasPresent)note(w,'npcDeparted',{actorId:npc.actorId,reason});return true;
}
export function migrateVisits(w){
  if(w.customerVisitVersion===1)return;
  let count=0;
  for(const npc of w.npcs){
    if(npc.trip||npc.currentMatchId||npc.returnAfterMatch)npc.presence='onsite';
    else if(departCustomer(w,npc,'legacy-idle'))count++;
  }
  w.customerVisitVersion=1;if(count)note(w,'customerVisitsMigrated',{quantity:count});
}
export function arriveCustomer(w,npc,map,intent=null){
  const entry=map?.anchors['store.entry'];npc.presence='onsite';npc.roomId='store';npc.activity='shopping';npc.label='刚进店';npc.moving=false;npc.trip=null;
  if(entry){npc.x=entry.x;npc.y=entry.y;npc.navVersion=map.navVersion;}
  npc.customerCategory=npc.regularId==='collector'?'收藏客':npc.regularId==='duelist'?'对战客':npc.regularId==='student'?'学生玩家':npc.scavenger?'拾牌客':'顾客';
  npc.visit={visitId:serial(w,'visit'),enteredAt:stamp(w),elapsedSeconds:0,idleSeconds:0,intent:intent||{kind:'shopping',label:npc.regularId==='collector'?'寻找缺少的单卡':'看看合适的卡牌'},purchases:0,pickups:0,matches:0,issues:[]};note(w,'npcVisitStarted',{actorId:npc.actorId,visitId:npc.visit.visitId});
}
export function lingerCustomer(w,npc,seconds){
  npc.trip=null;npc.activity='idle';npc.label='逛店 / 找牌友';npc.moving=false;
  npc.visit??={visitId:serial(w,'visit'),enteredAt:stamp(w),elapsedSeconds:0};npc.visit.idleSeconds=seconds;
}
/** Reserve distinct reachable stopping points. The doorway remains a transit area. */
export function customerTarget(w,map,anchor,npc){
  const occupied=w.npcs.filter(n=>n!==npc&&onSite(n)&&n.roomId==='store').map(n=>n.trip?.target||n),entry=map.anchors['store.entry'];
  const candidates=[anchor];
  for(let ring=1;ring<=3;ring++)for(const [dx,dy]of [[ring,0],[-ring,0],[0,ring],[0,-ring],[ring,ring],[-ring,ring],[ring,-ring],[-ring,-ring]])candidates.push({x:anchor.x+dx*16,y:anchor.y+dy*16});
  for(const p of candidates){
    if(!canStand(map,p.x,p.y)||Math.hypot(p.x-anchor.x,p.y-anchor.y)>(anchor.radius||24)||entry&&Math.hypot(p.x-entry.x,p.y-entry.y)<24||occupied.some(n=>Math.hypot(n.x-p.x,n.y-p.y)<15))continue;
    try{return {target:{x:p.x,y:p.y},path:pathfind(map,npc,p)};}catch{}
  }
  return null;
}
