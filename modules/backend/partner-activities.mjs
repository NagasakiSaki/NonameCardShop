import policy from '../../data/partner-activities.json' with {type:'json'};
import {clone,random} from './common.mjs';
import {eligible,registerNpcMatch,voidNpcMatch} from './matches.mjs';
import {fundPartnerWager} from './partner-wager-accounting.mjs';
import {seatNpcMatch} from './npc-tables.mjs';
import {managementEffects} from './management.mjs';
import {onSite} from './visits.mjs';
import {note} from './world.mjs';
import {leaveQueue} from './match-queue.mjs';

const stamp=w=>w.clock.day*1440+w.clock.minute;
export function partnerActivityView(w){return {policy:clone(policy),allies:(w.progression?.allies||[]).map(a=>({allyId:a.allyId,today:clone(a.earning?.day===w.clock.day?a.earning:{day:w.clock.day,started:0,matches:0,wins:0,losses:0,net:0,fees:0}),total:clone(a.earningTotal||{matches:0,net:0,fees:0})}))};}
function partnerTeam(w,catalog,ally){
  const stage=w.progression.stages.find(s=>s.challengerId===ally.allyId),pack=stage?.productId?.replace(/^pack:/,'');
  const cards=catalog.cards.filter(c=>w.circulation[c.cardKey]&&!w.rules.compatibilityBlocks[c.generalId]);
  cards.sort((a,b)=>Number(b.pack===pack)-Number(a.pack===pack)||b.globalScore-a.globalScore||a.cardKey.localeCompare(b.cardKey));
  return cards.filter((c,i)=>cards.findIndex(o=>o.generalId===c.generalId)===i).slice(0,3).map((c,i)=>({loanRef:`ally:${ally.allyId}:${i}`,cardKey:c.cardKey,generalId:c.generalId,name:c.name,rarity:c.issuanceRarity||c.currentRarity,globalScore:c.globalScore,purpose:'partner-earning'}));
}
export function tickPartnerActivities(w,catalog,navigation){
  if(w.clock.phase!=='open'||!w.progression||w.progression.disabled||w.matches.some(m=>m.status!=='finished')||(w.matchQueue||[]).some(q=>q.ownerId==='player')||w.wallet.available<=policy.cashReserve)return;
  const table=w.tables.find(t=>!t.matchId&&!t.reservation);if(!table)return;
  for(const ally of w.progression.allies){
    if(!ally.onDuty||ally.assignedDuty!=='duelist')continue;
    const actor=w.npcs.find(n=>n.allyId===ally.allyId);
    if(!actor||!onSite(actor)||actor.currentMatchId||actor.currentRoomId||actor.currentQueueId||actor.playerInviteUntil||actor.returnAfterMatch||actor.trip?.kind==='match'||actor.trip?.stage==='specialist-leave')continue;
    const a=ally.earning?.day===w.clock.day?ally.earning:(ally.earning={day:w.clock.day,started:0,matches:0,wins:0,losses:0,net:0,fees:0,nextAt:0});
    if(stamp(w)<a.nextAt||a.started>=policy.maxMatchesPerDay||a.net<=-policy.dailyLossLimit)continue;
    a.nextAt=stamp(w)+policy.searchIntervalMinutes;
    const team=partnerTeam(w,catalog,ally);if(team.length<3){actor.label='等待流通武将凑齐';continue;}
    const fee=managementEffects(w).tableFee;
    const candidates=w.npcs.filter(n=>!n.specialist&&!n.allyId&&onSite(n)&&n.roomId==='store'&&!n.currentMatchId&&!n.currentRoomId&&!n.playerInviteUntil&&!n.trip&&['idle','waiting-match'].includes(n.activity)&&(n.nextMatchAt||0)<=stamp(w));
    for(const customer of candidates){
      const queued=(w.matchQueue||[]).find(q=>q.ownerId===customer.actorId&&q.queueId===customer.currentQueueId);
      if(customer.currentQueueId&&(!queued||queued.mode!=='kof'||queued.expiresAt<=stamp(w)||queued.tableId&&queued.tableId!==table.tableId))continue;
      // Normal matchmaking queues eligible customers before the next partner
      // search. Their own queue lock/reserved fee is convertible, not a reason
      // to exclude every willing customer. Other locks stay unavailable.
      const options=eligible(w,catalog,customer.actorId).filter(c=>c.eligible||queued&&w.items[c.inventoryRef]?.lock===queued.queueId&&!w.items[c.inventoryRef].protected&&c.disabledReasons.every(r=>r.code==='ITEM_LOCKED')).sort((a,b)=>b.globalScore-a.globalScore),enemy=options.filter((c,i)=>options.findIndex(o=>o.generalId===c.generalId)===i).slice(0,3);if(enemy.length!==3)continue;
      const customerFee=queued?.fee??fee,customerCash=customer.wallet.available-Math.max(0,(customer.wallet.reserved||0)-(queued?.fee||0));
      const rarity=t=>t.reduce((s,c)=>s+Math.max(0,['N','R','SR','SSR'].indexOf(c.rarity)),0)/3,delta=rarity(enemy)-rarity(team),multiplier=delta>=1?2:delta<=-1?.5:1;
      const stake=Math.min(Math.round(policy.baseStake*multiplier),policy.maxStake,Math.floor(w.wallet.available*policy.maxCashFraction),w.wallet.available-policy.cashReserve,customerCash-customerFee,policy.dailyLossLimit+Math.min(0,a.net));
      if(stake<Math.round(policy.baseStake*.5))continue;
      // Customers accept the offer in seeded simulation, including a chance to decline.
      if(random(w)>.8){customer.nextMatchAt=stamp(w)+policy.searchIntervalMinutes;continue;}
      if(queued)leaveQueue(w,customer.actorId,'partner-offer-accepted');
      const m=registerNpcMatch(w,catalog,table,[actor,customer],{tableFee:0,partnerTeam:team,inventoryRefs:[[],enemy.map(c=>c.inventoryRef)],forceSimulation:true});
      fundPartnerWager(w,m,{allyId:ally.allyId,stake,fee:customerFee});m.simulation.durationSeconds=policy.durationSeconds;m.simulation.expertScoreBonus=policy.expertScoreBonus;
      a.started++;a.nextAt=stamp(w)+policy.cooldownMinutes;customer.nextMatchAt=a.nextAt;
      actor.label='与顾客约战';actor.trip=null;
      try{seatNpcMatch(w,m,navigation);}catch(error){voidNpcMatch(w,m.matchId,error.message);}
      note(w,'partnerActivityScheduled',{matchId:m.matchId,allyId:ally.allyId,customerId:customer.actorId,stake,multiplier});return;
    }
    actor.label='寻找愿意约战的顾客';
  }
}
