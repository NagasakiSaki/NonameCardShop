// Day-seven account review. Only trusted engine results can forgive real debt.
// Outdoor access is a prerequisite flag; no outdoor map or trading exchange is shipped here.
import policy from '../../data/long-term-policy.json' with {type:'json'};
import {clone,need,serial} from './common.mjs';
import {note} from './world.mjs';
import {onSite,arriveCustomer,departCustomer,customerTarget} from './visits.mjs';
import {moveActor,pathfind} from './navigation.mjs';

export const DEBT_KIND='debt-challenge';
export const debtStage=()=>({stageId:'debt-day7',productId:policy.debt.productId,challengerId:'challenger-creditor'});
export function initialiseLongTerm(w){
  if(!w.longTerm)w.longTerm={version:1,policyVersion:policy.version,debtChallenge:{actorId:'specialist:creditor',status:'pending',nextVisitDay:policy.debt.firstDay,attempt:0,receipts:{}},outdoor:{status:'locked'}};
}
const current=w=>w.longTerm?.version===1?w.longTerm.debtChallenge:null;
export function acceptedDebt(w,actorId){const d=current(w);return d?.status==='accepted'&&(!actorId||d.actorId===actorId)?d:null;}
export function debtRelief(w){return Math.min(w.wallet.debt,policy.debt.maximumReduction,Math.max(policy.debt.minimumReduction,Math.floor(w.wallet.debt*policy.debt.reductionRate)));}
export function longTermView(w){const d=current(w);return {available:!!d,policyVersion:policy.version,debt:d?{...clone(d),outstanding:w.wallet.debt,potentialReduction:debtRelief(w),firstDay:policy.debt.firstDay}:null,outdoor:clone(w.longTerm?.outdoor||{status:'locked'}),futureSystems:clone(policy.futureSystems),marketRarities:clone(policy.market.allowedRarities)};}
function depart(w,n,navigation){
  const map=navigation.get(n.roomId),entry=map?.anchors['store.entry'];n.activity='leaving';n.label='改天再来';
  try{if(entry){n.trip={stage:'debt-leave',path:pathfind(map,n,entry)};return;}}catch{}
  departCustomer(w,n,'debt-visit-ended');
}
export function endDebtDay(w){const d=current(w);if(!d||d.status==='resolved')return;d.status='deferred';d.nextVisitDay=Math.max(d.nextVisitDay,w.clock.day+1);d.roomOpponentPlans={};if(w.dialogueOffer?.kind===DEBT_KIND)w.dialogueOffer=null;}
export function tickDebt(w,navigation,seconds=0){
  const d=current(w);if(!d)return;let n=w.npcs.find(n=>n.actorId===d.actorId);
  if(n?.trip?.stage==='debt-leave'){
    const map=navigation.get(n.roomId);if(map)moveActor(map,n,n.trip,seconds*w.clock.speed);
    if(!map||!n.trip.path.length)departCustomer(w,n,'debt-visit-ended');return;
  }
  if(d.status==='resolved'){
    if(n&&onSite(n)&&!n.currentRoomId&&!n.currentMatchId)depart(w,n,navigation);return;
  }
  if(w.clock.phase!=='open'){if(n&&onSite(n)&&!n.currentRoomId&&!n.currentMatchId){endDebtDay(w);depart(w,n,navigation);}return;}
  if(w.clock.day<d.nextVisitDay)return;
  if(!n){n={actorId:d.actorId,name:policy.debt.name,appearanceId:policy.debt.appearanceId,wallet:{available:0},specialist:true,debtCollector:true,presence:'offsite',roomId:'store',x:240,y:272,direction:'up',moving:false};w.npcs.push(n);}
  if(!onSite(n)){arriveCustomer(w,n,navigation.get('store'));d.status='onsite';d.visitDay=w.clock.day;d.offeredToday=false;n.nameColor='#D19B43';}
  n.customerCategory='账务专员';if(n.currentMatchId||n.currentRoomId)return;
  if(d.status==='accepted'){n.label='等你选将';return;}
  n.label=w.wallet.debt?'核对账目 / 切磋减债':'核对账目';
  const map=navigation.get(n.roomId);if(n.roomId!==w.player.roomId){
    n.label='等待店长回店';const anchor=map?.anchors['store.counter'];
    if(anchor){if(!n.trip?.path.length){const route=customerTarget(w,map,{...anchor,radius:40},n);if(route)n.trip={stage:'debt-wait',...route};}if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);}return;
  }
  if(map&&Math.hypot(n.x-w.player.x,n.y-w.player.y)>52){
    if(!n.trip?.path.length||Math.hypot((n.trip.target?.x??0)-w.player.x,(n.trip.target?.y??0)-w.player.y)>48){const route=customerTarget(w,map,{...w.player,radius:40},n);n.trip=route?{stage:'debt-approach',...route}:null;}
    if(n.trip)moveActor(map,n,n.trip,seconds*w.clock.speed);
  }
  if(Math.hypot(n.x-w.player.x,n.y-w.player.y)<=52&&!d.offeredToday&&!w.dialogueOffer&&!w.matches.some(m=>!m.background&&m.status!=='finished'))offerDebt(w,n);
}
export function offerDebt(w,n){
  const d=current(w);need(d&&n.actorId===d.actorId&&onSite(n)&&d.nextVisitDay<=w.clock.day&&n.trip?.stage!=='debt-leave'&&d.status!=='resolved','CHALLENGE_DEFERRED','账务专员会在约定日期再次来访。');
  if(d.status==='accepted')return {openCombat:true,opponentId:n.actorId};
  d.offeredToday=true;n.trip=null;n.moving=false;w.dialogueOffer={kind:DEBT_KIND,offerId:serial(w,'debt-offer'),actorId:n.actorId};return {};
}
function unlock(w,reason){w.longTerm.outdoor={status:'unlocked-planned',unlockedAtDay:w.clock.day,reason};note(w,'outdoorPrologueUnlocked',{reason});}
export function debtDialogue(w){const amount=w.wallet.debt;return {roleLabel:'账务专员',text:amount?`账上尚欠 ${amount} 游戏币。和我打一场，获胜可减免 ${debtRelief(w)} 游戏币，不动用店里的现金。三种赛制都可以，也可以明天再谈。`:'目前没有未偿债务，账目已结清。完成本次核对后，将记录店外探索的开放资格；户外地图还在筹备中。',choices:amount?[{optionId:current(w).status==='lost'?'rematch':'accept',text:current(w).status==='lost'?'再战一局（重新选将）':'以牌会友，争取减债'},{optionId:'tomorrow',text:'明日再战'}]:[{optionId:'settled',text:'确认账目'},{optionId:'tomorrow',text:'明天再谈'}]};}
export function respondDebt(w,n,response,navigation){
  const d=current(w);need(d&&d.nextVisitDay<=w.clock.day&&d.status!=='resolved','CHALLENGE_DEFERRED','本次账务会谈已结束。');
  if(response==='settled'){
    need(w.wallet.debt===0,'INVALID_STATE','账目发生变化，请重新核对。');d.status='resolved';d.resolvedDay=w.clock.day;unlock(w,'accounts-settled');w.dialogueOffer=null;depart(w,n,navigation);return {status:'resolved',outdoor:clone(w.longTerm.outdoor)};
  }
  if(['accept','rematch'].includes(response)){
    need(w.wallet.debt>0,'INVALID_STATE','没有欠款，请重新核对账目。');d.status='accepted';d.attempt++;d.challengeId=serial(w,'debt-challenge');d.roomOpponentPlans={};delete d.matchId;n.trip=null;n.activity='waiting-player';w.dialogueOffer=null;return {openCombat:true,opponentId:n.actorId};
  }
  need(['tomorrow','close','escape'].includes(response),'INVALID_INPUT','无效的账务选项。');d.status='deferred';d.nextVisitDay=w.clock.day+1;d.roomOpponentPlans={};w.dialogueOffer=null;depart(w,n,navigation);return {status:'deferred',returnDay:d.nextVisitDay};
}
export function settleDebt(w,m,{trusted=false}={}){
  const d=current(w),s=m.series,r=s.officialResult;need(d&&d.challengeId===s.challengeId,'STALE_EVENT','账务挑战记录已变化。');
  if(d.receipts[s.challengeId])return;
  if(trusted&&r.complete&&r.result==='win'&&r.winVerified){
    const amount=debtRelief(w);w.wallet.debt-=amount;w.daily.debtRelief=(w.daily.debtRelief||0)+amount;
    d.receipts[s.challengeId]={matchId:m.matchId,day:w.clock.day,amount};d.status='resolved';d.resolvedDay=w.clock.day;
    s.debtRelief=amount;note(w,'debtChallengeCleared',{matchId:m.matchId,amount,debtRemaining:w.wallet.debt});unlock(w,'debt-challenge-won');
  }else{d.status='lost';d.lastMatchId=m.matchId;d.roomOpponentPlans={};}
}
