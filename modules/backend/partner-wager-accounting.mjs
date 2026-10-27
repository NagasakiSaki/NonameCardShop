// Partner-only simulated stakes. Player/engine wagering stays disabled.
import {credit,debit,need} from './common.mjs';
import {wallet,income} from './trading.mjs';
import {note} from './world.mjs';

export function fundPartnerWager(w,m,{allyId,stake,fee}){
  need(m.background&&m.simulated&&!m.partnerWager&&Number.isSafeInteger(stake)&&stake>0&&Number.isSafeInteger(fee)&&fee>=0,'INVALID_STATE','伙伴牌桌托管参数不正确。');
  debit(w.wallet,stake);debit(wallet(w,m.enemyOwnerId),stake+fee);
  m.partnerWager={version:1,allyId,customerId:m.enemyOwnerId,stake,pool:stake*2,feeHeld:fee,settled:false};
  w.wallet.escrowLiability+=stake*2+fee;
  note(w,'partnerWagerFunded',{matchId:m.matchId,allyId,amount:stake,name:w.npcs.find(n=>n.actorId===m.mineOwnerId)?.name});
}
export function settlePartnerWager(w,m,result,{cancelled=false}={}){
  const b=m.partnerWager;if(!b||b.settled)return;
  const customer=wallet(w,b.customerId),ally=w.progression?.allies.find(a=>a.allyId===b.allyId);
  // Principal/refunds never repay supplier debt; only actual earnings do.
  if(cancelled||result==='draw'){credit(w.wallet,b.stake);credit(customer,b.stake);}
  else if(result==='win'){credit(w.wallet,b.stake);income(w,b.stake);}
  else credit(customer,b.pool);
  if(cancelled)credit(customer,b.feeHeld);
  else{income(w,b.feeHeld);w.daily.service+=b.feeHeld;}
  w.wallet.escrowLiability-=b.pool+b.feeHeld;
  const net=cancelled||result==='draw'?0:result==='win'?b.stake:-b.stake;
  if(!cancelled)w.daily.matchNet+=net;
  b.settled=true;b.result=cancelled?'cancelled':result;b.net=net;b.feePaid=cancelled?0:b.feeHeld;b.settledAt={day:w.clock.day,minute:w.clock.minute};
  if(ally){
    const a=ally.earning;if(a?.day===m.createdDay){
      if(cancelled)a.started=Math.max(0,a.started-1);
      else{a.matches++;a.net+=net;a.fees+=b.feePaid;if(result==='win')a.wins++;if(result==='loss')a.losses++;}
    }
    if(!cancelled){const total=ally.earningTotal??={matches:0,net:0,fees:0};total.matches++;total.net+=net;total.fees+=b.feePaid;}
  }
  note(w,cancelled?'partnerWagerRefunded':'partnerWagerSettled',{matchId:m.matchId,allyId:b.allyId,name:w.npcs.find(n=>n.actorId===m.mineOwnerId)?.name,customerName:w.npcs.find(n=>n.actorId===b.customerId)?.name,result:b.result,net,fee:b.feePaid,stake:b.stake,simulated:true});
}
export function validatePartnerWagers(w){
  for(const m of w.matches){const b=m.partnerWager;if(!b)continue;
    need(b.version===1&&m.background&&m.simulated&&m.stake===0&&b.customerId===m.enemyOwnerId&&w.npcs.some(n=>n.actorId===b.customerId)&&w.npcs.some(n=>n.actorId===m.mineOwnerId&&n.allyId===b.allyId)&&w.progression?.allies.some(a=>a.allyId===b.allyId)&&Number.isSafeInteger(b.stake)&&b.stake>0&&Number.isSafeInteger(b.pool)&&b.pool===2*b.stake&&Number.isSafeInteger(b.feeHeld)&&b.feeHeld>=0&&typeof b.settled==='boolean'&&b.settled===(m.status==='finished'),'INVALID_SAVE','伙伴约战托管记录不正确。');
  }
}
