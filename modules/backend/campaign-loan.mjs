// A story obligation is NOT supplier credit. Sales never automatically drain this balance.
import policy from '../../data/long-term-policy.json' with {type:'json'};
import {clone,need,integer,debit} from './common.mjs';
export const getLoan=w=>w.longTerm?.version===1&&w.longTerm.loan?.version===1?w.longTerm.loan:null;
export const loanBalance=w=>{const l=getLoan(w);return l?l.principal-l.paid-l.relieved:0;};
export const currentGoal=w=>getLoan(w)?.milestones.find(m=>m.status!=='completed')||null;
export const goalRemaining=m=>m?m.amount-m.paid-m.relieved:0;
export function initialiseLoan(w){
 const l=w.longTerm;if(l?.version!==1||l.loan)return false;
 const c=policy.debt.loan;need(c.version===1&&Number.isSafeInteger(c.principal)&&c.principal>0&&Array.isArray(c.milestones)&&c.principal===c.milestones.reduce((n,m)=>n+m.amount,0),'INVALID_CONFIG','剧情借款版本、本金或分期目标不正确。');
 l.loan={version:1,principal:c.principal,paid:0,relieved:0,intro:{status:'pending'},milestones:c.milestones.map(m=>({...clone(m),paid:0,relieved:0,status:'pending',battleRewardClaimed:false}))};
 return true;
}
export function loanView(w){
 const l=getLoan(w);if(!l)return null;
 return {...clone(l),outstanding:loanBalance(w),completedCount:l.milestones.filter(m=>m.status==='completed').length,currentGoal:currentGoal(w)?{...clone(currentGoal(w)),remaining:goalRemaining(currentGoal(w)),overdue:w.clock.day>currentGoal(w).dueDay}:null};
}
export function repayLoan(w,p){
 const l=getLoan(w),m=currentGoal(w);need(l?.intro.status==='acknowledged'&&m,'NOT_READY','请先听海玲说明借款约定。');
 need(w.clock.phase!=='closed','SHOP_CLOSED','今天已结算，请开始下一天后还款。');
 need(p.milestoneId===m.id,'STALE_OPERATION','当前还款阶段已经变化，请刷新目标。');
 const amount=integer(p.amount,1,goalRemaining(m));debit(w.wallet,amount);m.paid+=amount;l.paid+=amount;w.daily.campaignRepayment=(w.daily.campaignRepayment||0)+amount;
 return {amount,milestoneId:m.id,remaining:goalRemaining(m),outstanding:loanBalance(w)};
}
export function grantLoanRelief(w,amount){
 const l=getLoan(w),m=currentGoal(w);need(l&&m&&!m.battleRewardClaimed,'ALREADY_CLAIMED','本阶段的牌局减免已经领取。');
 integer(amount,0,goalRemaining(m));m.relieved+=amount;l.relieved+=amount;m.battleRewardClaimed=true;return m;
}
export function reviewGoal(w){
 const m=currentGoal(w);need(m&&goalRemaining(m)===0,'GOAL_INCOMPLETE','本期还款目标尚未完成。');
 need(w.clock.day>=m.dueDay,'NOT_READY',`已提前备好本期还款，海玲会在第 ${m.dueDay} 天核对。`);
 m.status='completed';m.completedAtDay=w.clock.day;
 return {completedGoal:clone(m),nextGoal:clone(currentGoal(w)),outstanding:loanBalance(w)};
}
