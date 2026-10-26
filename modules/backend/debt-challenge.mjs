// Phase-based campaign debt. All obligations are frozen in the save; engine wins only grant relief.
import policy from '../../data/long-term-policy.json' with {type:'json'};
import lines from '../../data/lender-dialogue.zh-CN.json' with {type:'json'};
import {clone,need,serial} from './common.mjs';
import {note} from './world.mjs';
import {onSite,arriveCustomer,departCustomer,customerTarget} from './visits.mjs';
import {moveActor,pathfind} from './navigation.mjs';
import {initialiseLoan,getLoan,currentGoal,goalRemaining,loanView,grantLoanRelief,reviewGoal} from './campaign-loan.mjs';

export const DEBT_KIND='debt-challenge',INTRO_KIND='debt-intro';
const text=(key,values={})=>lines[key].replace(/\{([a-zA-Z]+)\}/g,(_,name)=>String(values[name]??''));
export const debtStage=w=>({stageId:'debt-'+(currentGoal(w)?.id||'day7'),productId:currentGoal(w)?.productId||policy.debt.productId,challengerId:'challenger-creditor'});
const current=w=>getLoan(w)?w.longTerm.debtChallenge:null;
export function initialiseLongTerm(w){
 if(!w.longTerm)w.longTerm={version:1,policyVersion:policy.version,debtChallenge:{actorId:'specialist:creditor',status:'pending',nextVisitDay:policy.debt.firstDay,attempt:0,receipts:{}},outdoor:{status:'locked'}};
 if(initialiseLoan(w)){
  const d=current(w);d.legacyAccountReview={status:d.status,receipts:clone(d.receipts)};d.status='pending';d.nextVisitDay=currentGoal(w).dueDay;d.roomOpponentPlans={};
  // A live old-format game keeps its identity until settlement. No old reward is replayed.
  if(w.matches.some(m=>m.status!=='finished'&&m.series?.challengeKind===DEBT_KIND)){d.status='accepted';getLoan(w).legacyMatchId=d.matchId;}
  if(w.dialogueOffer?.kind===DEBT_KIND)w.dialogueOffer=null;
  w.longTerm.policyVersion=policy.version;
 }
 const n=w.npcs.find(n=>n.actorId===current(w)?.actorId);if(n){n.name=policy.debt.name;n.appearanceId=policy.debt.appearanceId;}
}
export function acceptedDebt(w,actorId){const d=current(w);return d?.status==='accepted'&&(!actorId||d.actorId===actorId)?d:null;}
export function debtRelief(w){const m=currentGoal(w);return m&&!m.battleRewardClaimed?Math.min(goalRemaining(m),policy.debt.maximumReduction,Math.max(policy.debt.minimumReduction,Math.floor(goalRemaining(m)*policy.debt.reductionRate))):0;}
export function longTermView(w){const d=current(w),l=loanView(w);return {available:!!d,policyVersion:policy.version,debt:d?{...clone(d),outstanding:l?.outstanding||0,potentialReduction:debtRelief(w),firstDay:policy.debt.firstDay,goalRemaining:goalRemaining(currentGoal(w)),supplierDebt:w.wallet.debt}:null,loan:l,outdoor:clone(w.longTerm?.outdoor||{status:'locked'}),futureSystems:clone(policy.futureSystems),marketRarities:clone(policy.market.allowedRarities)};}
function actor(w){
 const d=current(w);let n=w.npcs.find(n=>n.actorId===d.actorId);
 if(!n){n={actorId:d.actorId,name:policy.debt.name,appearanceId:policy.debt.appearanceId,wallet:{available:0},specialist:true,debtCollector:true,presence:'offsite',roomId:'store',x:240,y:272,direction:'up',moving:false};w.npcs.push(n);}return n;
}
function depart(w,n,navigation){
 const map=navigation.get(n.roomId),entry=map?.anchors['store.entry'];n.activity='leaving';n.label='约定日期再见';
 try{if(entry){n.trip={stage:'debt-leave',path:pathfind(map,n,entry)};return;}}catch{}
 departCustomer(w,n,'debt-visit-ended');
}
export function ensureLoanIntro(w){
 const l=getLoan(w);if(!l||l.intro.status!=='pending'||w.clock.phase==='closed'||w.dialogueOffer||w.matches.some(m=>!m.background&&m.status!=='finished'))return false;
 const n=actor(w);if(n.currentMatchId||n.currentRoomId)return false;
 n.presence='onsite';n.roomId=w.player.roomId;n.x=w.player.x+24;n.y=w.player.y;n.trip=null;n.moving=false;n.activity='talking';n.customerCategory='债主';n.nameColor='#D19B43';n.label='开店的约定';
 w.dialogueOffer={kind:INTRO_KIND,offerId:serial(w,'loan-intro'),actorId:n.actorId};return true;
}
export function endDebtDay(w){const d=current(w);if(!d||d.status==='resolved')return;d.status='deferred';d.nextVisitDay=Math.max(currentGoal(w)?.dueDay||1,d.nextVisitDay,w.clock.day+1);d.roomOpponentPlans={};if([DEBT_KIND,INTRO_KIND].includes(w.dialogueOffer?.kind))w.dialogueOffer=null;}
export function tickDebt(w,navigation,seconds=0){
 const d=current(w);if(!d)return;
 if(ensureLoanIntro(w)||w.dialogueOffer?.kind===INTRO_KIND)return;
 if(getLoan(w)?.intro.status!=='acknowledged')return;
 let n=w.npcs.find(n=>n.actorId===d.actorId);
 if(n?.trip?.stage==='debt-leave'){
  const map=navigation.get(n.roomId);if(map)moveActor(map,n,n.trip,seconds*w.clock.speed);
  if(!map||!n.trip.path.length)departCustomer(w,n,'debt-visit-ended');return;
 }
 if(d.status==='resolved'){if(n&&onSite(n)&&!n.currentRoomId&&!n.currentMatchId)depart(w,n,navigation);return;}
 if(w.clock.phase!=='open'){if(n&&onSite(n)&&!n.currentRoomId&&!n.currentMatchId){endDebtDay(w);depart(w,n,navigation);}return;}
 if(w.clock.day<d.nextVisitDay)return;n=actor(w);
 if(!onSite(n)){arriveCustomer(w,n,navigation.get('store'));d.status='onsite';d.visitDay=w.clock.day;d.offeredToday=false;n.nameColor='#D19B43';}
 n.customerCategory='债主';if(n.currentMatchId||n.currentRoomId)return;
 if(d.status==='accepted'){n.label='等你选将';return;}n.label='本期经营目标';
 const map=navigation.get(n.roomId);if(n.roomId!==w.player.roomId){
  n.label='等待店长回店';const anchor=map?.anchors['store.counter'];if(anchor){if(!n.trip?.path.length){const route=customerTarget(w,map,{...anchor,radius:40},n);if(route)n.trip={stage:'debt-wait',...route};}if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);}return;
 }
 if(map&&Math.hypot(n.x-w.player.x,n.y-w.player.y)>52){
  if(!n.trip?.path.length||Math.hypot((n.trip.target?.x??0)-w.player.x,(n.trip.target?.y??0)-w.player.y)>48){const route=customerTarget(w,map,{...w.player,radius:40},n);n.trip=route?{stage:'debt-approach',...route}:null;}
  if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);
 }
 if(Math.hypot(n.x-w.player.x,n.y-w.player.y)<=52&&!d.offeredToday&&!w.dialogueOffer&&!w.matches.some(m=>!m.background&&m.status!=='finished'))offerDebt(w,n);
}
export function offerDebt(w,n){
 const d=current(w);need(d&&n.actorId===d.actorId&&onSite(n)&&d.nextVisitDay<=w.clock.day&&n.trip?.stage!=='debt-leave'&&d.status!=='resolved','CHALLENGE_DEFERRED','海玲会在约定日期再次来访。');
 if(d.status==='accepted')return {openCombat:true,opponentId:n.actorId};
 d.offeredToday=true;n.trip=null;n.moving=false;w.dialogueOffer={kind:DEBT_KIND,offerId:serial(w,'debt-offer'),actorId:n.actorId};return {};
}
function unlock(w,reason){if(w.longTerm.outdoor.status!=='locked')return;w.longTerm.outdoor={status:'unlocked-planned',unlockedAtDay:w.clock.day,reason};note(w,'outdoorPrologueUnlocked',{reason});}
export function introDialogue(w){const l=getLoan(w),first=l.milestones[0];return {roleLabel:'债主',text:text('intro',{creditor:policy.debt.name,principal:l.principal,firstDueDay:first.dueDay,firstAmount:first.amount}),choices:[{optionId:'begin',text:lines.beginLabel}]};}
export function debtDialogue(w){
 const m=currentGoal(w),remaining=goalRemaining(m),relief=debtRelief(w),l=getLoan(w);
 if(!m)return {roleLabel:'债主',text:text('paidOff'),choices:[{optionId:'close',text:'谢谢你'}]};
 const choices=[];
 if(!remaining)choices.push({optionId:'settled',text:'确认本期目标完成'});
 else{if(!m.battleRewardClaimed)choices.push({optionId:current(w).status==='lost'?'rematch':'accept',text:current(w).status==='lost'?'再战一局（重新选将）':'打一场，争取减免'});choices.push({optionId:'goals',text:'查看目标与还款'});}
 choices.push({optionId:'tomorrow',text:'明天再谈'});
 return {roleLabel:'债主',text:text('stage',{...m,remaining,outstanding:l.principal-l.paid-l.relieved})+(remaining?(relief?text('battleOffer',{reduction:relief}):text('battleUsed')):text('funded')),choices};
}
export function respondIntro(w,n,response,navigation){
 const l=getLoan(w);need(l?.intro.status==='pending'&&['begin','close','escape'].includes(response),'INVALID_STATE','开店约定已经确认。');
 l.intro={status:'acknowledged',day:w.clock.day};if(w.clock.day>=currentGoal(w).dueDay)current(w).nextVisitDay=Math.max(current(w).nextVisitDay,w.clock.day+1);w.dialogueOffer=null;depart(w,n,navigation);note(w,'campaignLoanIntroduced',{principal:l.principal,firstDueDay:l.milestones[0].dueDay,firstAmount:l.milestones[0].amount});return {status:'acknowledged'};
}
export function respondDebt(w,n,response,navigation){
 const d=current(w);need(d&&d.nextVisitDay<=w.clock.day&&d.status!=='resolved','CHALLENGE_DEFERRED','本次会谈已结束。');
 if(response==='settled'){
  const result=reviewGoal(w);d.status=result.nextGoal?'pending':'resolved';d.nextVisitDay=result.nextGoal?Math.max(result.nextGoal.dueDay,w.clock.day+1):w.clock.day;d.roomOpponentPlans={};delete d.matchId;delete d.lastMatchId;
  w.dialogueOffer=null;unlock(w,'first-loan-goal-completed');depart(w,n,navigation);note(w,'campaignMilestoneCompleted',{milestoneId:result.completedGoal.id,amount:result.completedGoal.amount,outstanding:result.outstanding});return {status:'goal-completed',...result,outdoor:clone(w.longTerm.outdoor)};
 }
 if(response==='goals'){w.dialogueOffer=null;return {openGoals:true};}
 if(['accept','rematch'].includes(response)){
  need(debtRelief(w)>0,'NOT_READY','本期已获得牌局减免，或目标已完成。');d.status='accepted';d.attempt++;d.challengeId=serial(w,'debt-challenge');d.roomOpponentPlans={};delete d.matchId;n.trip=null;n.activity='waiting-player';w.dialogueOffer=null;return {openCombat:true,opponentId:n.actorId};
 }
 need(['tomorrow','close','escape'].includes(response),'INVALID_INPUT','无效的会谈选项。');d.status='deferred';d.nextVisitDay=w.clock.day+1;d.roomOpponentPlans={};w.dialogueOffer=null;depart(w,n,navigation);return {status:'deferred',returnDay:d.nextVisitDay};
}
export function settleDebt(w,m,{trusted=false}={}){
 const d=current(w),s=m.series,r=s.officialResult;need(d&&d.challengeId===s.challengeId,'STALE_EVENT','债务挑战记录已变化。');if(d.receipts[s.challengeId])return;
 if(trusted&&r.complete&&r.result==='win'&&r.winVerified){
  const amount=debtRelief(w),goal=grantLoanRelief(w,amount);w.daily.debtRelief=(w.daily.debtRelief||0)+amount;
  d.receipts[s.challengeId]={matchId:m.matchId,milestoneId:goal.id,day:w.clock.day,amount};d.status='onsite';s.debtRelief=amount;
  note(w,'debtChallengeCleared',{matchId:m.matchId,amount,milestoneId:goal.id,goalRemaining:goalRemaining(goal)});
  // A win advances repayment progress; it does not bypass the remaining operating target.
 }else{d.status='lost';d.lastMatchId=m.matchId;d.roomOpponentPlans={};}
}
