import nativeEligibility from '../../data/v7/native-eligibility.json' with {type:'json'};
import {leaveQueue} from './match-queue.mjs';
import {normaliseAppearance} from './appearances.mjs';
// Authoritative V7 orchestration. Pure candidate reducers run only inside the Host transaction.
import {clone,need,serial,random} from './common.mjs';
import {isV7,unlockedProducts} from './v7-policy.mjs';
import {publishProducts} from './products.mjs';
import {eligible,matchById,finish as finishMatch,cancelSeriesAccounting,engineMessage} from './matches.mjs';
import {wallet,income} from './trading.mjs';
import {managementEffects} from './management.mjs';
import {note} from './world.mjs';
import {onSite,arriveCustomer,departCustomer,customerTarget} from './visits.mjs';
import {moveActor,pathfind} from './navigation.mjs';
import * as B from '../progression/index.mjs';
import * as C from '../combat-formats/index.mjs';

const unwrap=result=>{need(result?.ok,result?.error?.code||'INVALID_STATE',result?.error?.message||'操作未完成。');return result.data;};
const ready=w=>isV7(w)&&w.progression?.version===1&&!w.progression.disabled;
const context=w=>({day:w.clock.day,worldId:w.worldId,branchId:w.branchId,seed:w.seed+w.serial});
const proof=w=>({worldId:w.worldId,branchId:w.branchId,resourceRevision:w.progression?.revision||0});
const activeStage=w=>w.progression?.stages?.find(s=>s.stageId===w.progression.activeStageId);
const opponentOptions=(w,catalog,n,formatId,capabilities)=>unique(eligibleV7(w,catalog,n.actorId,formatId,capabilities).filter(c=>c.eligible||(n.currentQueueId&&w.items[c.inventoryRef]?.lock===n.currentQueueId&&!w.items[c.inventoryRef].protected&&w.circulation[c.cardKey]&&!w.rules.compatibilityBlocks[c.generalId]&&!nativeBlocks(formatId,capabilities)[c.generalId])));
const unique=items=>items.filter((v,i,a)=>a.findIndex(c=>c.generalId===v.generalId)===i);
export function checkProof(w,p){if(!p)return;need(p.worldId===w.worldId&&p.branchId===w.branchId,'STALE_OPERATION','世界已切换，请重新打开窗口。');}
export function actorForInteraction(w,actorId,navigation,{near=true}={}){
  const n=w.npcs.find(n=>n.actorId===actorId);need(n&&onSite(n),'NOT_ONSITE','对方已离店。');
  need(!n.currentMatchId&&!n.currentRoomId,'ACTOR_BUSY','对方正在对局。');
  if(near&&navigation.size)need(n.roomId===w.player.roomId&&Math.hypot(n.x-w.player.x,n.y-w.player.y)<=60,'NOT_IN_RANGE','请先走到对方身旁。');
  return n;
}
function refreshProducts(w,catalog){w.products=publishProducts(catalog,w.rules,w.clock.day,w.prices,w);}
function leave(w,n,navigation){
  const map=navigation.get(n.roomId),entry=map?.anchors['store.entry'];
  if(!entry){departCustomer(w,n,'specialist-visit-ended');return;}
  try{n.trip={stage:'specialist-leave',path:pathfind(map,n,entry)};n.activity='leaving';n.label='准备离店';}catch{departCustomer(w,n,'specialist-route-unavailable');}
}
export function endV7Day(w){
  if(!ready(w))return;
  const p=w.progression,s=activeStage(w);
  if(s&&s.status!=='cleared')s.dueDay=Math.max(s.dueDay,w.clock.day+1);
  p.currentVisit=null;p.currentInvite=null;p.activeChallenge=null;w.dialogueOffer=null;
  B.reduceProgression(p,{type:'DAY_STARTED',day:w.clock.day+1},context(w));
}
export function tickV7(w,catalog,navigation,seconds=0){
  if(!ready(w))return;
  const p=w.progression,open=w.clock.phase==='open';
  for(const n of w.npcs.filter(n=>n.playerInviteUntil))if(!open||n.playerInviteUntil<=w.clock.day*1440+w.clock.minute){delete n.playerInviteUntil;n.activity='idle';n.label='';if(n.visit)n.visit.idleSeconds=2;}
  if(open){
    const plan=unwrap(B.planChallengerVisit(p,w.clock.day,{...context(w),storeOpen:true,phase:w.clock.phase}));
    if(plan.shouldVisit){
      let n=w.npcs.find(n=>n.actorId===plan.actorId);const stage=activeStage(w);
      if(!n){n={actorId:plan.actorId,name:stage.displayName,appearanceId:normaliseAppearance(stage.appearanceId),wallet:{available:0},specialist:true,personId:stage.personId,presence:'offsite',roomId:'store',x:240,y:272,direction:'up',moving:false};w.npcs.push(n);}
      if(!onSite(n)&&!n.currentMatchId){arriveCustomer(w,n,navigation.get('store'));n.customerCategory='来访高手';n.nameColor='#C084FC';n.label='寻找店长';}
    }
  }
  for(const n of w.npcs.filter(n=>n.specialist&&onSite(n)&&!n.currentRoomId&&!n.currentMatchId)){
    const map=navigation.get(n.roomId);
    if(n.trip?.stage==='specialist-leave'){
      if(map)moveActor(map,n,n.trip,seconds);if(!map||!n.trip.path.length)departCustomer(w,n,'specialist-visit-ended');continue;
    }
    if(n.allyId){
      const ally=p.allies.find(a=>a.allyId===n.allyId);n.customerCategory='经营伙伴';n.label=ally?.onDuty?{attraction:'招呼顾客',checkout:'协助收银',wholesale:'联系供货'}[ally.assignedDuty||ally.defaultDuty]:'休息中';
      if(!open||!ally?.onDuty)leave(w,n,navigation);else if(map){const point=map.anchors[ally.assignedDuty==='checkout'?'store.checkout':ally.assignedDuty==='wholesale'?'store.counter':'store.retail'];if(point&&Math.hypot(n.x-point.x,n.y-point.y)>40&&!n.trip?.path.length){const route=customerTarget(w,map,{...point,radius:40},n);if(route)n.trip={stage:'ally-workstation',...route};}if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);}continue;
    }
    const visit=p.currentVisit,stage=activeStage(w);
    if(!open||visit?.actorId!==n.actorId||visit.status!=='onsite'||!stage){leave(w,n,navigation);continue;}
    if(p.activeChallenge?.status==='accepted'){n.label='等你到牌桌选将';continue;}
    if(w.player.roomId!==n.roomId){n.label='等待店长回店';if(map){if(!n.trip?.path.length){const route=customerTarget(w,map,{...map.anchors['store.counter'],radius:40},n);if(route)n.trip={stage:'specialist-wait',...route};}if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);}continue;}
    const distance=Math.hypot(n.x-w.player.x,n.y-w.player.y);
    if((distance>44||distance<22||n.trip?.stage==='specialist-approach'&&n.trip.path.length)&&map){
      if(!n.trip?.path.length||Math.hypot((n.trip.target?.x||0)-w.player.x,(n.trip.target?.y||0)-w.player.y)>48){
        const route=customerTarget(w,map,{x:w.player.x,y:w.player.y,radius:40},n);
        n.trip=route?{stage:'specialist-approach',...route}:null;
      }
      if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);
    }
    if((!map||Math.hypot(n.x-w.player.x,n.y-w.player.y)>=22)&&Math.hypot(n.x-w.player.x,n.y-w.player.y)<=52&&(!n.trip||!n.trip.path.length)&&!w.dialogueOffer&&!w.matches.some(m=>!m.background&&m.status!=='finished')){
      n.trip=null;n.moving=false;n.label='想和你切磋';
      if(!p.currentInvite&&!(p.dailyVisitStatus.proactiveOfferGiven&&p.dailyVisitStatus.day===w.clock.day)){
        unwrap(B.offerInvite(p,{actorId:n.actorId,source:'proactive'}, {...context(w),actorOnsite:true,actorReachable:true,actorBusy:false}));
        w.dialogueOffer={kind:'stage-challenge',offerId:p.currentInvite.inviteId,actorId:n.actorId};
      }
    }
  }
  // Recruited partners return each morning; they never enter the shopping/budget loop.
  for(const ally of p.allies){
    const n=w.npcs.find(n=>n.personId===ally.personId);if(!n)continue;n.allyId=ally.allyId;
    if(open&&ally.onDuty&&!onSite(n)){arriveCustomer(w,n,navigation.get('store'));n.customerCategory='经营伙伴';n.trip=null;}
  }
}
export function dialogueView(w){
  const d=w.dialogueOffer;if(!d)return null;
  const n=w.npcs.find(n=>n.actorId===d.actorId);if(!n||!onSite(n))return null;
  if(d.kind==='stage-challenge'&&!w.progression?.currentInvite)return null;
  return {...clone(d),proof:proof(w),speakerName:n.name,portrait:n.appearanceId,nameColor:n.nameColor,roleLabel:n.allyId?'经营伙伴':n.specialist?'来访高手':n.customerCategory||'顾客',
    text:d.kind==='stage-challenge'?`想和你切磋一下，三将接力、斗地主换边或双人对决都可以。赢下整场后，可解锁「${activeStage(w)?.productName||'新主题'}」供货，我也会留在店里帮忙。`:n.allyId?'今天需要我做些什么？':'想一起打牌吗？可以在牌桌选择赛制。',
    choices:d.kind==='stage-challenge'?[{optionId:'accept',text:'现在来一局'},{optionId:'tomorrow',text:'改天再战'}]:[{optionId:'challenge',text:'约一场牌局'},{optionId:'allies',text:n.allyId?'安排工作':'看看经营伙伴',available:!!n.allyId},{optionId:'close',text:'下次再聊'}]};
}
export function interactV7(w,p,navigation){
  need(ready(w),'FEATURE_UNAVAILABLE','当前存档的挑战模块不可用。');checkProof(w,p.proof);const n=actorForInteraction(w,p.actorId,navigation);
  need(!w.dialogueOffer||w.dialogueOffer.actorId===n.actorId,'ACTOR_BUSY','请先结束当前对话。');
  if(n.specialist&&!n.allyId){
    need(activeStage(w)&&w.progression.currentVisit?.actorId===n.actorId,'INVITE_STALE','这场挑战已经结束。');
    if(w.progression.activeChallenge?.status==='accepted')return {openCombat:true,opponentId:n.actorId};
    unwrap(B.offerInvite(w.progression,{actorId:n.actorId,source:'player'}, {...context(w),actorOnsite:true,actorReachable:true,actorBusy:false}));
    w.dialogueOffer={kind:'stage-challenge',offerId:w.progression.currentInvite.inviteId,actorId:n.actorId};
  }else w.dialogueOffer={kind:'talk',offerId:serial(w,'dialogue'),actorId:n.actorId};
  return {offer:dialogueView(w)};
}
export function respondV7(w,p,navigation){
  need(ready(w),'FEATURE_UNAVAILABLE','当前挑战数据版本暂不支持，原记录已保留。');
  checkProof(w,p.proof);const d=w.dialogueOffer;need(d&&d.offerId===p.offerId,'INVITE_STALE','对话已结束，请重新交谈。');
  const n=actorForInteraction(w,d.actorId,navigation),response=p.optionId||p.response;
  if(d.kind==='stage-challenge'){
    need(['accept','tomorrow','close','escape'].includes(response),'INVALID_INPUT','无效的挑战选项。');
    const result=unwrap(B.replyInvite(w.progression,{inviteId:d.offerId,response,proof:proof(w)},context(w)));
    w.dialogueOffer=null;
    if(response==='accept')return {...result,openCombat:true,opponentId:n.actorId};
    w.progression.activeChallenge=null;leave(w,n,navigation);return result;
  }
  need(['challenge','allies','close','escape'].includes(response),'INVALID_INPUT','无效的对话选项。');w.dialogueOffer=null;
  if(response==='challenge'){leaveQueue(w,n.actorId,'invited-by-player');n.trip=null;n.activity='waiting-player';n.label='等待与你约战';n.playerInviteUntil=w.clock.day*1440+w.clock.minute+90;}
  return {openCombat:response==='challenge',openAllies:response==='allies',opponentId:n.actorId};
}
export function progressionQuery(w,name){
  need(ready(w),'FEATURE_UNAVAILABLE','当前存档的挑战数据版本不受支持，原记录已保留。');
  if(name==='progression.status')return {...B.queryProgressionStatus(w.progression),unlockedProductIds:unlockedProducts(w)};
  if(name==='challenges.status')return {...B.queryChallengesStatus(w.progression),activeChallenge:clone(w.progression.activeChallenge)};
  return {...B.queryAlliesList(w.progression),effects:B.deriveAllyEffects(w.progression)};
}
export function assignV7(w,catalog,p){checkProof(w,p.proof);need(ready(w),'FEATURE_UNAVAILABLE','伙伴模块不可用。');const r=unwrap(B.assignAllyDuty(w.progression,p,context(w)));refreshProducts(w,catalog);return r;}
export function formatsView(capabilities){return unwrap(C.listFormats(capabilities));}
export function seriesView(w,matchId){
  const m=matchId?w.matches.find(m=>m.matchId===matchId):w.matches.find(m=>m.series&&m.status!=='finished');
  if(!m?.series)return null;if(m.series.seriesVersion!==1)return {matchId:m.matchId,unsupported:true,phase:'unsupported',message:'这场系列赛的数据来自较新版本，原记录已保留，请用兼容版本继续或读取较早日档。'};return {...C.seriesView(m.series),playerTeamId:'mine',reserveItems:clone(m.mine),opponentName:w.npcs.find(n=>n.actorId===m.opponentId)?.name,control:clone(m.nativeStatus||null)};
}
export function prepareV7(w,catalog,p,navigation,capabilities,{roomPlan=null}={}){
  checkProof(w,p.proof);need(w.clock.phase==='open','SHOP_CLOSED','请在营业中约战。');
  need(!w.matches.some(m=>!m.background&&m.status!=='finished'),'MATCH_ACTIVE','请先完成或取消当前比赛。');
  const format=C.getFormat(p.formatId||'kof');need(format,'INVALID_INPUT','没有这个赛制。');
  const active=ready(w)?w.progression.activeChallenge:null,stage=activeStage(w);
  const isChallenge=active?.status==='accepted'&&(!p.opponentId||p.opponentId===active.actorId);
  let fee=roomPlan?roomPlan.tableFee:isChallenge?0:managementEffects(w).tableFee;
  const npc=p.opponentId?w.npcs.find(n=>n.actorId===p.opponentId):isChallenge?w.npcs.find(n=>n.actorId===active.actorId):w.npcs.find(n=>onSite(n)&&!n.specialist&&!n.currentMatchId&&opponentOptions(w,catalog,n,format.formatId,capabilities).length>=format.reservePerSide&&n.wallet.available-(n.wallet.reserved||0)>=fee);
  need(npc&&onSite(npc)&&!npc.currentMatchId,'NOT_FOUND','暂时没有持卡足够且空闲的在店对手。');
  const isPractice=!!npc.allyId;if(isPractice)fee=0;
  if(npc.currentQueueId)leaveQueue(w,npc.actorId,'accepted-player-invitation');delete npc.playerInviteUntil;
  const table=p.tableId?w.tables.find(t=>t.tableId===p.tableId):w.tables.find(t=>!t.matchId&&!t.reservation||t.reservation==='player');
  need(table&&!table.matchId&&(!table.reservation||table.reservation==='player'),'TABLE_BUSY','请先空出一张牌桌。');
  if(navigation.size){const map=navigation.get(w.player.roomId),points=[map?.anchors['battleRoom.service'],map?.anchors[table.tableId]].filter(Boolean);need(points.some(a=>Math.hypot(w.player.x-a.x,w.player.y-a.y)<=(a.radius||24)),'NOT_IN_RANGE','请先走到报名台或牌桌旁。');}
  const mineOptions=eligibleV7(w,catalog,'player',format.formatId,capabilities),refs=p.reserveRefs||p.inventoryRefs||[];
  need(Array.isArray(refs)&&refs.every(r=>typeof r==='string'),'INVALID_INPUT','备战名单格式不正确。');
  const mine=refs.map(ref=>mineOptions.find(c=>c.inventoryRef===ref));need(mine.every(c=>c?.eligible),'NOT_ELIGIBLE','备战名单包含不可用的卡牌。');
  const matchId=serial(w,'match'),seed=roomPlan?.seed??Math.floor(random(w)*4294967296);let enemy,loans={};
  if(roomPlan){
    need(roomPlan.actorId===npc.actorId&&roomPlan.formatId===format.formatId&&roomPlan.kind===(isChallenge?'stage-challenge':isPractice?'ally-practice':'friendly'),'STALE_OPERATION','房间对手或赛制已经变化。');
    if(isChallenge)need(roomPlan.challengeId===active.challengeId,'STALE_OPERATION','高手挑战已变化，请重新约战。');
    enemy=clone(roomPlan.enemy);
    for(const c of enemy){
      if(c.loanRef)loans[c.loanRef]=c;
      else need(eligibleV7(w,catalog,npc.actorId,format.formatId,capabilities).some(i=>i.inventoryRef===c.inventoryRef&&i.eligible),'ROSTER_LOCKED','对方备战牌已不可用。');
    }
  }else if(isChallenge||isPractice){
    const loanStage=isChallenge?stage:w.progression.stages.find(s=>s.challengerId===npc.allyId&&s.status==='cleared');
    need(loanStage,'NOT_ELIGIBLE','伙伴的训练卡池记录不可用。');
    const roster=unwrap(B.buildChallengeLoanRoster({stage:loanStage,formatId:format.formatId,catalog:{cards:catalog.cards.filter(c=>!w.rules.compatibilityBlocks[c.generalId]&&!nativeBlocks(format.formatId,capabilities)[c.generalId])},seed}));
    need(roster.actualFormat===format.formatId,'INSUFFICIENT_ROSTER','该主题尚无足够兼容武将。');
    enemy=roster.loanCards.map(l=>{const c=catalog.cards.find(c=>c.generalId===l.generalId);if(isPractice)l.purpose='recruited-ally-practice';loans[l.loanRef]=l;return {...l,name:c.name,cardKey:c.cardKey,imageUrl:c.imageUrl,rarity:c.currentRarity};});
  }else{
    need(!npc.specialist,'NOT_ELIGIBLE','请先回应高手的挑战邀请。');
    enemy=unique(eligibleV7(w,catalog,npc.actorId,format.formatId,capabilities).filter(c=>c.eligible)).slice(0,format.reservePerSide);
    need(npc.wallet.available-(npc.wallet.reserved||0)>=fee,'INSUFFICIENT_FUNDS','对手支付不起当前桌费。');
  }
  const inventory=Object.fromEntries(Object.values(w.items).filter(i=>i.kind==='card').map(i=>[i.inventoryRef,{...i,generalId:catalog.byKey.get(i.cardKey)?.generalId}]));
  const created=unwrap(C.createSeries({formatId:format.formatId,worldId:w.worldId,branchId:w.branchId,matchId,seed,capabilities,playerTeamId:'mine',enemyActorId:npc.actorId,tableId:table.tableId,challengeKind:isChallenge?'stage-challenge':isPractice?'ally-practice':'friendly',challengeId:isChallenge?active.challengeId:null,stageId:isChallenge?stage.stageId:null,inviteId:isChallenge?w.progression.currentInvite?.inviteId:null,fee:{tableFee:fee},eligibility:{acceptedTableFee:fee,inventory,loans,circulation:w.circulation,compatibilityBlocks:{...w.rules.compatibilityBlocks,...nativeBlocks(format.formatId,capabilities)},owners:{mine:{kind:'player',actorId:'player'},enemy:{kind:isChallenge||isPractice?'challenge':'npc',actorId:npc.actorId}}},rosters:{mine:mine.map(c=>({sourceRef:c.inventoryRef})),enemy:enemy.map(c=>c.loanRef?{loanRef:c.loanRef}:{sourceRef:c.inventoryRef})}}));
  const m={matchId,mode:format.formatId,mine,enemy,opponentId:npc.actorId,mineOwnerId:'player',enemyOwnerId:npc.actorId,tableId:table.tableId,status:'prepared',wins:0,losses:0,bout:1,results:[],gameId:null,first:0,stake:0,serviceHeld:fee,serviceRecognized:false,serviceContributions:fee?[{ownerId:npc.actorId,amount:fee}]:[],background:false,progress:{mine:0,enemy:0},rules:{initialHand:4,firstDrawPenalty:1,winsRequired:format.winsRequired,ratingVersion:w.rules.ratingVersion},createdDay:w.clock.day,series:created.series};
  npc.wallet.available-=fee;w.wallet.escrowLiability+=fee;npc.currentMatchId=matchId;npc.trip=null;npc.moving=false;npc.activity='seated';
  for(const c of [...mine,...enemy])if(c.inventoryRef)w.items[c.inventoryRef].lock=m.series.lock.lockId;
  m.series=unwrap(C.acknowledgeLocks(m.series,{lockId:m.series.lock.lockId,state:'held'})).series;m.series=unwrap(C.acknowledgeFee(m.series,{receiptId:matchId+':fee-held'})).series;
  table.matchId=matchId;table.reservation=null;w.matches.push(m);
  if(isChallenge){active.matchId=matchId;active.formatId=format.formatId;active.loanRoster=clone(enemy);}
  note(w,'matchRegistered',{matchId,mode:m.mode,serviceHeld:fee});return seriesView(w,matchId);
}

/** Freeze the rival's complete pool BEFORE the player's reserve is submitted. No UI-selected enemy refs. */
export function planRoomOpponent(w,catalog,{formatId='kof',opponentId=null,seed},capabilities){
  const f=C.getFormat(formatId);need(f,'INVALID_INPUT','没有这个赛制。');unwrap(C.assertFormatAvailable(formatId,capabilities));
  const active=ready(w)?w.progression.activeChallenge:null;
  // Ordinary table matchmaking must not be hijacked by an outstanding challenge.
  // Challenge rooms are entered explicitly through the NPC/dialogue or rival picker.
  const challenge=active?.status==='accepted'&&opponentId===active.actorId;
  if(challenge)opponentId=active.actorId;
  const fee=challenge?0:managementEffects(w).tableFee;
  const canJoin=n=>onSite(n)&&!n.currentMatchId&&!n.currentRoomId&&(!n.specialist||n.allyId||challenge&&n.actorId===opponentId);
  const npc=opponentId?w.npcs.find(n=>n.actorId===opponentId&&canJoin(n)):w.npcs.find(n=>canJoin(n)&&!n.specialist&&opponentOptions(w,catalog,n,formatId,capabilities).length>=f.reservePerSide&&n.wallet.available-(n.wallet.reserved||0)>=fee);
  if(!npc){need(!opponentId,'NOT_READY','对手已离店或正在其他房间/对局中。');return null;}
  if(npc.currentQueueId)leaveQueue(w,npc.actorId,'joined-player-room');
  const practice=!!npc.allyId,tableFee=challenge||practice?0:fee,kind=challenge?'stage-challenge':practice?'ally-practice':'friendly';
  need(npc.wallet.available-(npc.wallet.reserved||0)>=tableFee,'INSUFFICIENT_FUNDS','对手支付不起本房间桌费。');
  let enemy;
  const cached=challenge?active.roomOpponentPlans?.[formatId]:null;
  if(cached)enemy=clone(cached.enemy);
  else if(challenge||practice){
    const stage=challenge?activeStage(w):w.progression.stages.find(s=>s.challengerId===npc.allyId&&s.status==='cleared');
    const roster=unwrap(B.buildChallengeLoanRoster({stage,formatId,catalog:{cards:catalog.cards.filter(c=>!w.rules.compatibilityBlocks[c.generalId]&&!nativeBlocks(formatId,capabilities)[c.generalId])},seed}));
    need(roster.actualFormat===formatId,'INSUFFICIENT_ROSTER','对手主题没有足够兼容武将组成这个备战池。');
    enemy=roster.loanCards.map(l=>{const c=catalog.byId.get(l.generalId);return {...l,purpose:practice?'recruited-ally-practice':'stage-challenge',name:c.name,cardKey:c.cardKey,imageUrl:c.imageUrl,rarity:c.currentRarity};});
  }else enemy=unique(eligibleV7(w,catalog,npc.actorId,formatId,capabilities).filter(c=>c.eligible)).sort((a,b)=>(catalog.byKey.get(b.cardKey)?.power.modeScores?.[formatId]??catalog.byKey.get(b.cardKey)?.globalScore)-(catalog.byKey.get(a.cardKey)?.power.modeScores?.[formatId]??catalog.byKey.get(a.cardKey)?.globalScore)).slice(0,f.reservePerSide);
  need(enemy.length===f.reservePerSide,'INSUFFICIENT_ROSTER',`对手需要 ${f.reservePerSide} 名不同武将，目前只有 ${enemy.length} 名可用。`);
  const plan={formatId,challengeId:challenge?active.challengeId:null,actorId:npc.actorId,tableFee,kind,enemy,seed:cached?cached.seed:seed};
  if(challenge){active.roomOpponentPlans??={};active.roomOpponentPlans[formatId]??=clone(plan);}
  return plan;
}
function update(w,m,result){m.series=unwrap(result).series;const s=m.series;m.wins=s.score.mine;m.losses=s.score.enemy;m.bout=s.round.index;m.gameId=s.round.gameId;m.status=s.phase==='live'||s.phase==='mounting'?'running':s.phase==='interrupted'?'interrupted':s.rounds.length?'awaitingNext':'prepared';return s;}
export function selectV7(w,p){checkProof(w,p.proof);const m=matchById(w,p.matchId);need(m.series,'INVALID_STATE','这场比赛不使用备战池。');update(w,m,C.selectRound(m.series,p));return seriesView(w,p.matchId);}
export function startV7(w,p){const m=matchById(w,p.matchId);need(m.series,'INVALID_STATE','缺少系列赛。');update(w,m,C.beginMount(m.series));m.timeSession??={startedAt:{day:w.clock.day,minute:w.clock.minute},minutes:30,applied:false};return clone(m);}
export function interruptV7(w,m,reason){if(m.series.seriesVersion!==1)return;if(['live','mounting','confirmed'].includes(m.series.phase)){m.series.phase='interrupted';m.series.interrupt={reason:reason||'牌局窗口已关闭'};m.series.revision++;m.status='interrupted';}}
export function restoreV7(w){for(const m of w.matches.filter(m=>m.series?.seriesVersion===1&&m.status!=='finished')){m.series.worldId=w.worldId;m.series.branchId=w.branchId;interruptV7(w,m,'读取存档后需要重开当前小局');}}
function finishSeries(w,catalog,m,{trusted=false}={}){
  const s=m.series,r=s.officialResult;if(!r)return;
  s.lock.state='released';s.lock.releaseReason=r.cancelled?'cancelled':'series-finished';
  // The old accounting path stays authoritative for escrow, table fees, locks and statistics.
  if(r.cancelled){cancelSeriesAccounting(w,m);m.series=s;}
  else{m.results=s.rounds.map(r=>({gameId:r.gameId,result:r.winner==='mine'?'win':r.winner==='enemy'?'loss':'draw'}));finishMatch(w,m,r.result);}
  if(s.challengeKind==='stage-challenge'){
    if(trusted&&r.complete&&r.result==='win'&&r.winVerified){
      const before=new Set(w.progression.allies.map(a=>a.allyId));
      unwrap(B.settleChallenge(w.progression,{completed:true,simulated:false,originVerified:true,sourceVerified:true,challengeId:s.challengeId,stageId:s.stageId,productId:activeStage(w)?.productId,resultId:s.seriesId+':final',matchId:m.matchId,formatId:m.mode,winningTeamId:'mine',playerWins:s.score.mine,winsRequired:C.getFormat(m.mode).winsRequired},context(w)));
      const n=w.npcs.find(n=>n.actorId===m.opponentId),ally=w.progression.allies.find(a=>!before.has(a.allyId));
      if(n&&ally){n.allyId=ally.allyId;n.customerCategory='经营伙伴';n.label='已成为伙伴';if(w.progression.allies.filter(a=>a.onDuty).length<3)unwrap(B.assignAllyDuty(w.progression,{allyId:ally.allyId,dutyId:ally.defaultDuty},context(w)));}
      refreshProducts(w,catalog);note(w,'challengeCleared',{stageId:s.stageId,productId:w.progression.stages.find(x=>x.stageId===s.stageId)?.productId});
    }else{
      B.reduceProgression(w.progression,{type:'CHALLENGE_FAILED',challengeId:s.challengeId,canRetry:true},context(w));
      w.progression.currentInvite=null;w.progression.dailyVisitStatus.proactiveOfferGiven=true;
    }
  }
}
export function lifecycleV7(w,catalog,type,p){
  const m=matchById(w,p.matchId),s=m.series;need(s,'INVALID_STATE','没有这个系列赛。');
  if(type==='combat.restartRound'){update(w,m,C.restartRound(s));m.gameId=m.series.round.gameId;return seriesView(w,m.matchId);}
  let result;if(type==='combat.cancel')result=C.cancelSeries(s,{reason:p.reason==='draw-cancellation'?'draw-cancellation':'player-cancelled'});else if(type==='combat.abandon')result=C.abandonSeries(s,{reason:'player-abandoned'});else {need(!p.scope||p.scope==='series','INVALID_INPUT','请使用整场认输。');result=C.surrenderSeries(s,{scope:'series'});}
  update(w,m,result);if(m.series.officialResult)finishSeries(w,catalog,m);return seriesView(w,m.matchId);
}
export function trustedV7(w,catalog,matchId,message){
  const m=matchById(w,matchId),s=m.series;need(s,'INVALID_STATE','没有系列赛。');
  if(message.type?.startsWith('control')||message.type==='playing'){need(message.gameId===m.gameId&&m.status==='running','STALE_EVENT','控制状态已过期。');m.nativeStatus={...clone(message),...(message.control?{}:m.nativeStatus?.control?{control:clone(m.nativeStatus.control)}:{})};return seriesView(w,matchId);}
  if(message.type==='replacement'){need(m.mode==='kof'&&m.status==='running'&&message.matchId===m.gameId&&['mine','enemy'].includes(message.side),'STALE_EVENT','换将事件已过期。');need(Number.isSafeInteger(message.index)&&message.index>=1&&message.index<=2&&m[message.side][message.index]?.generalId===message.newGeneral&&message.index<=m.progress[message.side]+1,'INVALID_EVENT','换将顺序与备战名单不一致。');m.progress[message.side]=Math.max(m.progress[message.side],message.index);return clone(m);}
  if(message.type==='ready'){
    need((message.gameId||message.matchId)===m.gameId&&m.status==='running','STALE_EVENT','当前小局已变化。');
    if(s.phase==='mounting')update(w,m,C.markRoundStarted(s,{gameId:m.gameId}));
    if(!m.serviceRecognized){w.wallet.escrowLiability-=m.serviceHeld;income(w,m.serviceHeld);w.daily.service+=m.serviceHeld;m.serviceHeld=0;m.serviceRecognized=true;}return seriesView(w,matchId);
  }
  need(message.type==='result','INVALID_EVENT','不支持的引擎事件。');
  const result=message.gameId?message:{type:'result',gameId:message.matchId,roundId:s.round.roundId,resultId:message.matchId+':result',profileId:s.profileId,reserveDigest:s.reserveDigest,worldId:s.worldId,branchId:s.branchId,completed:true,simulated:false,originVerified:true,sourceVerified:true,winningTeamId:message.result==='win'?'mine':message.result==='loss'?'enemy':null};
  need(result.worldId===w.worldId&&result.branchId===w.branchId,'STALE_EVENT','赛果来自另一份存档。');
  const reduced=unwrap(C.reduceSeries(s,result));if(reduced.duplicate)return seriesView(w,matchId);
  update(w,m,{ok:true,data:reduced});if(m.series.officialResult)finishSeries(w,catalog,m,{trusted:true});return seriesView(w,matchId);
}

function nativeBlocks(formatId,capabilities){const rule=nativeEligibility.formats[formatId];return rule&&(capabilities?.items||capabilities||[]).some(p=>p.formatId===formatId&&p.profileId===rule.profileId)?rule.blocked:{};}
export function eligibleV7(w,catalog,ownerId='player',formatId='kof',capabilities=[]){
  need(C.getFormat(formatId),'INVALID_INPUT','请选择三将接力、斗地主换边或双人对决。');
  const blocks=nativeBlocks(formatId,capabilities);return eligible(w,catalog,ownerId).map(c=>{if(!blocks[c.generalId])return c;const disabledReasons=[...c.disabledReasons,{code:'NATIVE_GENERAL_UNAVAILABLE',message:blocks[c.generalId]}];return {...c,eligible:false,disabledReasons};});
}
