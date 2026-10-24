import {clone} from './common.mjs';
import {income} from './trading.mjs';
import {note} from './world.mjs';
export const STARTER_TASKS=[
  ['first-order','第一次进货','ordered',3,300,'store.counter'],
  ['first-receipt','三包商品入库','received',3,200,'store.counter'],
  ['first-opening','自己开一包','opened',1,200,'store.opening'],
  ['first-sale','迎来首位买包顾客','sales',1,300,'store.retail'],
  ['first-market','完成首笔单卡出售','marketSales',1,300,'store.secondaryMarket'],
  ['first-match','亲自完成一场比赛','playerMatches',1,400,'battleRoom.service'],
  ['first-npc-match','接待一场 NPC 比赛','npcMatches',1,250,'battleRoom.service']
].map(([taskId,title,metric,target,reward,guide])=>({taskId,title,metric,target,reward,guide,scope:'starter'}));
export const DAILY_TASKS=[
  ['daily-stock','今日进货三包','ordered',3,200,'store.counter'],
  ['daily-open','今日拆包体验','opened',1,200,'store.opening'],
  ['daily-sales','今日售出三件密封商品','sales',3,350,'store.retail'],
  ['daily-market','今日完成单卡出售','marketSales',1,300,'store.secondaryMarket'],
  ['daily-table','今日接待一场比赛','npcMatches',1,300,'battleRoom.service']
].map(([taskId,title,metric,target,reward,guide])=>({taskId,title,metric,target,reward,guide,scope:'daily'}));
export function initialiseDailyTasks(w,{fresh=false}={}){
  if(w.dailyTasks?.day===w.clock.day)return;
  w.dailyTasks={day:w.clock.day,baseline:fresh?{}:clone(w.lifetime),claimed:{}};
}
export function taskViews(w){
  return [...STARTER_TASKS,...DAILY_TASKS].map(t=>{
    const progress=Math.max(0,(w.lifetime[t.metric]||0)-(t.scope==='daily'?(w.dailyTasks?.baseline[t.metric]||0):0));
    return {...t,reward:Math.round(t.reward*(w.rules.tasks?.rewardMultiplier??1)),goal:t.target,unit:'次',hint:'完成后奖励自动到账；收入会先抵扣供应商欠款。',progress,completed:progress>=t.target,claimed:!!(t.scope==='daily'?w.dailyTasks?.claimed[t.taskId]:w.tasks[t.taskId]),autoClaim:true};
  });
}
export function grantTaskRewards(w,onReward=()=>{}){
  initialiseDailyTasks(w);
  for(const t of taskViews(w))if(t.completed&&!t.claimed){
    const before=clone(w.wallet);
    if(t.scope==='daily')w.dailyTasks.claimed[t.taskId]=true;else w.tasks[t.taskId]=true;
    const reward=t.reward;
    income(w,reward);w.daily.taskRewards=(w.daily.taskRewards||0)+reward;
    note(w,'taskRewardGranted',{taskId:t.taskId,title:t.title,scope:t.scope,amount:reward});
    onReward(before,{kind:'task',label:`${t.scope==='daily'?'每日任务':'引导任务'}：${t.title}`,grossIncome:reward});
  }
}
