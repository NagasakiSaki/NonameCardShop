import {serial,clone} from './common.mjs';
import {recordExperienceCash} from './experience.mjs';
import {loanBalance} from './campaign-loan.mjs';
const LABELS={'supplier.placeOrder':'进货下单','supplier.placeBasketOrder':'购物篮进货','business.close':'日结工资与租金','upgrades.purchase':'购置设施','market.acceptTrade':'二级市场交易','neighbors.act':'常客交易','combat.register':'玩家比赛登记','combat.cancel':'比赛退款','combat.surrender':'玩家比赛结算','engine':'比赛结算','tick':'营业收支','debt.repay':'偿还海玲的开店借款'};
export function recordWalletChange(w,before,detail={}){
  const amount=w.wallet.available-before.available,debtDelta=w.wallet.debt-before.debt;
  if(!amount&&!debtDelta&&!detail.campaignDebtDelta)return;
  const entry={entryId:serial(w,'cash'),day:w.clock.day,minute:w.clock.minute,kind:detail.kind||'business',label:detail.label||LABELS[detail.operation]||'营业收支',amount,debtDelta,balance:w.wallet.available,debt:w.wallet.debt,campaignDebt:loanBalance(w),...clone(detail)};
  (w.cashJournal??=[]).push(entry);w.cashJournal=w.cashJournal.slice(-300);recordExperienceCash(w,entry);
}
export function financeView(w){return {day:w.clock.day,items:clone((w.cashJournal||[]).slice(-60).reverse()),cash:w.wallet.available,debt:w.wallet.debt,campaignDebt:loanBalance(w)};}
