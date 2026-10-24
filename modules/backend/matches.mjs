import {clone,need,integer,serial,sum,debit,credit,id} from './common.mjs';
import {owned,free,wallet,income} from './trading.mjs';
import {note} from './world.mjs';
import {managementEffects} from './management.mjs';
import {onSite} from './visits.mjs';

export function eligible(w,catalog,ownerId='player'){
  return owned(w,ownerId).filter(i=>i.kind==='card').map(i=>{
    const c=catalog.byKey.get(i.cardKey),reasons=[];
    if(!w.circulation[i.cardKey])reasons.push({code:'NOT_IN_CIRCULATION',message:'该卡种尚未被售出开包或有效进入市场。'});
    if(!free(i))reasons.push({code:'ITEM_LOCKED',message:'副本受保护或被交易/其他比赛占用。'});
    if(i.location!=='collection')reasons.push({code:'NOT_IN_COLLECTION',message:'参赛副本必须在收藏中；请先捡回垃圾桶里的卡。'});
    const blocked=w.rules.compatibilityBlocks[c?.generalId];if(blocked)reasons.push({code:'SKILL_INCOMPATIBLE',message:blocked});
    return {inventoryRef:i.inventoryRef,cardKey:i.cardKey,generalId:c?.generalId,name:c?.name,rarity:c?.currentRarity,eligible:!reasons.length,disabledReasons:reasons,reviewStatus:c?.reviewStatus};
  });
}
export function combatPreview(w,catalog,p){
  need(w.clock.phase==='open','SHOP_CLOSED','只在营业中接受新比赛登记。');
  need(!w.matches.some(m=>!m.background&&m.status!=='finished'),'MATCH_ACTIVE','请先完成或取消当前的玩家比赛。');
  const mode=p.mode||'bo3',n=mode==='bo3'?1:mode==='kof'?3:0;
  need(n,'INVALID_INPUT','只支持 KOF 与 BO3。');
  const npc=p.opponentId?w.npcs.find(n=>n.actorId===p.opponentId):w.npcs.find(npc=>onSite(npc)&&!npc.currentMatchId&&npc.wallet.available>=managementEffects(w).tableFee&&new Set(eligible(w,catalog,npc.actorId).filter(i=>i.eligible).map(i=>i.generalId)).size>=n);need(npc&&onSite(npc)&&!npc.currentMatchId,'NOT_FOUND','暂时没有在店、实际持卡、付得起桌费且空闲的顾客可组成该赛制阵容。');
  const choose=(owner,refs)=>{
    const options=eligible(w,catalog,owner).filter(i=>i.eligible),team=[];
    if(refs){need(Array.isArray(refs)&&refs.length===n,'INVALID_INPUT','阵容人数不正确。');for(const ref of refs){const found=options.find(i=>i.inventoryRef===ref);need(found,'NOT_ELIGIBLE','阵容包含不具备流通资格、被锁定或未持有的牌。');team.push(found);}}
    else for(const item of options)if(!team.some(i=>i.generalId===item.generalId)&&team.length<n)team.push(item);
    need(team.length===n&&new Set(team.map(i=>i.generalId)).size===n,'NOT_ELIGIBLE','没有足够的不同武将组成阵容。');return team;
  };
  const mine=choose('player',p.inventoryRefs),enemy=choose(npc.actorId,p.opponentInventoryRefs);
  const rarityScore=team=>sum(team.map(i=>['N','R','SR','SSR'].indexOf(i.rarity)))/n;
  const delta=rarityScore(enemy)-rarityScore(mine),multiplier=delta>=1?2:delta<=-1?.5:1;
  const desired=Math.round(w.rules.baseStake*multiplier),maximum=Math.min(w.rules.maxStake,Math.floor(Math.min(w.wallet.available,npc.wallet.available)*w.rules.maxWalletStakeFraction));
  const amount=p.withStake?Math.min(desired,maximum):0;
  need(!p.withStake||w.rules.wageringEnabled,'FEATURE_UNAVAILABLE','下注暂未开放：引擎完整随机状态重放尚未完成，当前可进行无赌注比赛。');
  const table=p.tableId?w.tables.find(t=>t.tableId===p.tableId):w.tables.find(t=>!t.matchId&&!t.reservation);
  need(table&&!table.matchId&&(!table.reservation||table.reservation==='player'),'TABLE_BUSY','没有空闲桌位。');
  return {kind:'combat',mode,mine,enemy,opponentId:npc.actorId,tableId:table.tableId,tableFee:managementEffects(w).tableFee,stakeProposalId:id('stake-proposal'),stakeAmount:amount,multiplier,
    explanation:`顾客稀有度差 ${delta.toFixed(2)}，提议 ${multiplier} 倍；本金双方等额托管。店主参赛免该桌抽水。`,fingerprint:JSON.stringify([...mine,...enemy].map(i=>i.inventoryRef))};
}
export function registerMatch(w,catalog,preview,p){
  const fresh=combatPreview(w,catalog,{mode:preview.mode,opponentId:preview.opponentId,inventoryRefs:preview.mine.map(i=>i.inventoryRef),opponentInventoryRefs:preview.enemy.map(i=>i.inventoryRef),tableId:preview.tableId,withStake:preview.stakeAmount>0});
  need(fresh.fingerprint===preview.fingerprint,'PREVIEW_EXPIRED','阵容已变化。');
  if(preview.stakeAmount)need(p.stakeProposalId===preview.stakeProposalId,'PREVIEW_EXPIRED','请明确接受当前下注提议。');
  const npcWallet=wallet(w,preview.opponentId);
  debit(w.wallet,preview.stakeAmount);debit(npcWallet,preview.stakeAmount+preview.tableFee);
  const match={matchId:serial(w,'match'),mode:preview.mode,mine:clone(preview.mine),enemy:clone(preview.enemy),opponentId:preview.opponentId,tableId:preview.tableId,
    status:'prepared',wins:0,losses:0,bout:1,results:[],gameId:null,first:0,stake:preview.stakeAmount,serviceHeld:preview.tableFee,serviceRecognized:false,progress:{mine:0,enemy:0},
    rules:{initialHand:4,firstDrawPenalty:1,winsRequired:2,ratingVersion:w.rules.ratingVersion},createdDay:w.clock.day};
  match.mineOwnerId='player';match.enemyOwnerId=preview.opponentId;match.background=false;match.serviceContributions=[{ownerId:preview.opponentId,amount:preview.tableFee}];
  w.npcs.find(n=>n.actorId===preview.opponentId).currentMatchId=match.matchId;
  w.wallet.escrowLiability+=preview.stakeAmount*2+preview.tableFee;
  for(const i of [...match.mine,...match.enemy])w.items[i.inventoryRef].lock=match.matchId;
  const table=w.tables.find(t=>t.tableId===preview.tableId);table.matchId=match.matchId;table.reservation=null;w.matches.push(match);
  note(w,'matchRegistered',{matchId:match.matchId,stake:match.stake,serviceHeld:match.serviceHeld});return clone(match);
}
export function matchById(w,matchId){const m=w.matches.find(m=>m.matchId===matchId);need(m,'NOT_FOUND','比赛不存在。');return m;}
export function beginMatch(w,matchId){
  const m=matchById(w,matchId);need(['prepared','awaitingNext','interrupted'].includes(m.status),'INVALID_STATE','比赛当前不能开始。');
  need(!m.stake||m.status!=='interrupted','RECOVERY_REQUIRED','有赌注的中断比赛需要完整恢复，不能重新发牌。');
  m.gameId=serial(w,'game');m.status='running';m.progress={mine:0,enemy:0};return clone(m);
}
function ownerId(m,side){return side==='mine'?m.mineOwnerId||'player':m.enemyOwnerId||m.opponentId;}
function pay(w,owner,amount){if(owner==='player')income(w,amount);else credit(wallet(w,owner),amount);}
function releaseMatch(w,m){
  for(const i of [...m.mine,...m.enemy])if(w.items[i.inventoryRef]?.lock===m.matchId)w.items[i.inventoryRef].lock=null;
  for(const side of ['mine','enemy']){const npc=w.npcs.find(n=>n.actorId===ownerId(m,side));if(npc?.currentMatchId===m.matchId){npc.currentMatchId=null;npc.trip=null;npc.moving=false;npc.activity=m.background?'leaving-table':'idle';if(m.background)npc.returnAfterMatch=true;}}
  const table=w.tables.find(t=>t.tableId===m.tableId);if(table?.matchId===m.matchId)table.matchId=null;
}
function refundService(w,m){if(!m.serviceRecognized){for(const c of m.serviceContributions||[{ownerId:m.opponentId,amount:m.serviceHeld}])credit(wallet(w,c.ownerId),c.amount);w.wallet.escrowLiability-=m.serviceHeld;m.serviceHeld=0;}}
function finish(w,m,result){
  if(m.status==='finished')return;
  m.status='finished';m.result=result;w.lifetime.matches++;
  const metric=m.background?'npcMatches':'playerMatches';w.lifetime[metric]=(w.lifetime[metric]||0)+1;
  const mine=ownerId(m,'mine'),enemy=ownerId(m,'enemy'),pool=m.stake*2;
  if(result==='draw'){pay(w,mine,m.stake);pay(w,enemy,m.stake);}
  else {const rake=m.background?Math.floor(pool*w.rules.rake):0;pay(w,result==='win'?mine:enemy,pool-rake);if(rake){income(w,rake);w.daily.service+=rake;}}
  w.wallet.escrowLiability-=pool;
  if(mine==='player')w.daily.matchNet+=result==='win'?m.stake:result==='loss'?-m.stake:0;
  refundService(w,m);releaseMatch(w,m);
  for(const [side,team] of m.results.length||m.serviceRecognized?[['mine',m.mine],['enemy',m.enemy]]:[]){
    const deployed=m.mode==='kof'?team.slice(0,m.progress[side]+1):team;
    for(const c of deployed){const key=`${c.cardKey}|${m.mode}`,s=w.stats[key]||={wins:0,losses:0,draws:0,rulesVersion:1};const sideResult=side==='mine'?result:result==='win'?'loss':result==='loss'?'win':'draw';s[sideResult==='win'?'wins':sideResult==='loss'?'losses':'draws']++;}
  }
  note(w,'officialMatchSettled',{matchId:m.matchId,result,mode:m.mode});
}
// Only the origin/source-checked engine adapter may call this method, never a UI command.
export function engineMessage(w,matchId,message){
  const m=matchById(w,matchId);need(m.gameId===message.matchId&&m.status==='running','STALE_EVENT','收到过期牌局事件。');
  if(message.type==='ready')m.lastReadyGameId=message.matchId;
  if(message.type==='ready'&&!m.serviceRecognized){w.wallet.escrowLiability-=m.serviceHeld;income(w,m.serviceHeld);w.daily.service+=m.serviceHeld;m.serviceRecognized=true;m.serviceHeld=0;}
  if(message.type==='replacement'){
    need(m.mode==='kof'&&['mine','enemy'].includes(message.side),'INVALID_EVENT','换将事件不合法。');
    const side=message.side,team=m[side];integer(message.index,1,2);
    if(message.index>m.progress[side]){need(message.index===m.progress[side]+1&&team[message.index].generalId===message.newGeneral,'INVALID_EVENT','换将顺序不正确。');m.progress[side]=message.index;}
  }
  if(message.type==='result'){
    need(['win','loss','draw'].includes(message.result),'INVALID_EVENT','比赛结果不合法。');
    m.results.push({gameId:m.gameId,result:message.result});
    if(m.mode==='kof')finish(w,m,message.result);
    else {if(message.result==='win')m.wins++;if(message.result==='loss')m.losses++;if(m.wins>=2||m.losses>=2)finish(w,m,m.wins>=2?'win':'loss');else if(m.background&&m.results.filter(r=>r.result==='draw').length>=3)finish(w,m,'draw');else {m.status='awaitingNext';if(message.result!=='draw'){m.bout++;m.first=1-m.first;}}}
  }
  return clone(m);
}
export function surrender(w,matchId,scope){
  const m=matchById(w,matchId);need(m.status!=='finished','INVALID_STATE','比赛已结算。');
  if(scope==='bout'){need(m.status==='running'&&m.lastReadyGameId===m.gameId,'NOT_READY','当前没有已开始的小局，请先挂载牌局。');if(m.mode==='bo3')return engineMessage(w,matchId,{matchId:m.gameId,type:'result',result:'loss'});}
  if(!m.serviceRecognized&&!m.results.length)return cancelPrepared(w,matchId);
  finish(w,m,'loss');return clone(m);
}

export function cancelPrepared(w,matchId){
  const m=matchById(w,matchId);need(m.status!=='finished'&&!m.serviceRecognized&&!m.results.length,'INVALID_STATE','只有尚未真正开局的比赛可以取消退款。');
  pay(w,ownerId(m,'mine'),m.stake);pay(w,ownerId(m,'enemy'),m.stake);w.wallet.escrowLiability-=m.stake*2;refundService(w,m);
  m.status='finished';m.result='cancelled';releaseMatch(w,m);
  note(w,'matchCancelled',{matchId});return clone(m);
}

export function registerNpcMatch(w,catalog,table,npcs,{mode='bo3'}={}){
  need(w.clock.phase==='open'&&npcs.length===2&&!table.matchId&&!table.reservation,'NOT_READY','当前不能开 NPC 桌。');
  need(['bo3','kof'].includes(mode),'INVALID_INPUT','NPC 赛制不正确。');
  const teams=npcs.map(n=>{need(onSite(n)&&!n.currentMatchId,'ITEM_LOCKED','顾客未在店或已在其他牌局。');const cards=eligible(w,catalog,n.actorId).filter(i=>i.eligible).sort((a,b)=>catalog.byKey.get(b.cardKey).globalScore-catalog.byKey.get(a.cardKey).globalScore),team=[];for(const card of cards)if(!team.some(c=>c.generalId===card.generalId)&&team.length<(mode==='kof'?3:1))team.push(card);need(team.length===(mode==='kof'?3:1),'NOT_ELIGIBLE','顾客没有足够的不同流通武将。');return team;});
  const fee=managementEffects(w).tableFee;for(const npc of npcs)need(npc.wallet.available>=fee,'INSUFFICIENT_FUNDS','顾客支付不起开桌费。');
  for(const npc of npcs)debit(npc.wallet,fee);
  const m={matchId:serial(w,'npc-match'),mode,mine:clone(teams[0]),enemy:clone(teams[1]),mineOwnerId:npcs[0].actorId,enemyOwnerId:npcs[1].actorId,opponentId:npcs[1].actorId,background:true,tableId:table.tableId,
    status:'prepared',wins:0,losses:0,bout:1,results:[],gameId:null,first:0,stake:0,serviceHeld:fee*2,serviceContributions:npcs.map(n=>({ownerId:n.actorId,amount:fee})),serviceRecognized:false,progress:{mine:0,enemy:0},rules:{initialHand:4,firstDrawPenalty:1,winsRequired:2,ratingVersion:w.rules.ratingVersion,aiRoundLimit:w.rules.npcRoundLimit||60},createdDay:w.clock.day};
  w.wallet.escrowLiability+=fee*2;table.matchId=m.matchId;w.matches.push(m);for(const team of teams)for(const c of team)w.items[c.inventoryRef].lock=m.matchId;for(const npc of npcs)npc.currentMatchId=m.matchId;
  note(w,'npcMatchRegistered',{matchId:m.matchId,owners:npcs.map(n=>n.actorId),serviceHeld:fee*2});return m;
}
export function voidNpcMatch(w,matchId,reason){
  const m=matchById(w,matchId);need(m.background,'INVALID_STATE','该操作仅用于 NPC 后台牌局。');if(m.status==='finished')return clone(m);
  need(m.stake===0,'RECOVERY_REQUIRED','带赌注牌局不能直接作废。');refundService(w,m);m.status='finished';m.result='cancelled';m.error=String(reason).slice(0,300);releaseMatch(w,m);note(w,'npcMatchVoided',{matchId,reason:m.error});return clone(m);
}
