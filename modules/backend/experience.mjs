// Persistent observations and editable guidance; no DOM, renderer, money mutation or RNG.
import {clone,need} from './common.mjs';
import {DEFAULT_SHOP_EXPERIENCE} from '../../data/shop-experience.mjs';

export const FEEDBACK_REASONS={
  'out-of-stock':'没有可售商品','budget':'预算不足','price':'价格不合适',
  'queue-timeout':'等待过久','table-full':'没有空桌','no-offer':'没有合适商品',
  'closed':'营业结束','technical':'路径或设施异常',
};
const METRICS=new Set(['ordered','received','opened','sales','marketSales','shelved','daysClosed','regularTalks','upgrades','communityEvents']);
const number=n=>Number.isSafeInteger(n)&&n>=0;
const object=o=>o&&typeof o==='object'&&!Array.isArray(o);
const safeId=s=>typeof s==='string'&&/^[a-z][a-z0-9_-]{0,63}$/.test(s)&&!['constructor','prototype','__proto__'].includes(s);
export function validateExperienceConfig(c){
  need(c?.version===1&&Number.isSafeInteger(c.storyLimit)&&c.storyLimit>=1&&c.storyLimit<=100,'INVALID_CONFIG','体验配置版本或记录容量不正确。');
  need(Array.isArray(c.steps)&&c.steps.length<=30&&new Set(c.steps.map(s=>s?.id)).size===c.steps.length,'INVALID_CONFIG','引导 ID 重复或条目过多。');
  for(const s of c.steps){
    need(safeId(s.id)&&Number.isSafeInteger(s.day)&&s.day>=1&&s.day<=365&&typeof s.optional==='boolean'&&typeof s.title==='string'&&s.title.length<=100&&typeof s.text==='string'&&s.text.length<=1000&&typeof s.guide==='string'&&s.guide.length<=100,'INVALID_CONFIG','引导文字、日期或定位点不正确。');
    need(Array.isArray(s.goals)&&s.goals.length>0&&s.goals.length<=8&&s.goals.every(g=>METRICS.has(g?.metric)&&Number.isSafeInteger(g.target)&&g.target>0&&g.target<=1000000),'INVALID_CONFIG','引导条件必须使用已实现的进度指标。');
  }
  const e=c.event;
  need(safeId(e?.id)&&typeof e.title==='string'&&e.title.length<=100&&typeof e.description==='string'&&e.description.length<=1000&&Number.isSafeInteger(e.minDay)&&e.minDay>=3&&e.minDay<=365&&e.requiredPlayers===2&&Number.isSafeInteger(e.matchesRequired)&&e.matchesRequired>=1&&e.matchesRequired<=10,'INVALID_CONFIG','交流会目前支持两位顾客，第三天起开放。');
  return c;
}
export function initialiseExperience(w,{fresh=false}={}){
  if(!w.experience)w.experience={version:1,config:clone(DEFAULT_SHOP_EXPERIENCE),trackingSince:{day:w.clock.day,minute:w.clock.minute},guide:{skipped:!fresh},milestones:{},days:{},stories:[],events:[]};
  const x=w.experience,key=String(w.clock.day);
  if(!x.days[key])x.days[key]={day:w.clock.day,coverage:fresh||w.clock.day>x.trackingSince.day&&w.clock.minute===480&&w.clock.phase==='preparing'?'complete':'partial',arrived:0,departed:0,outcomes:{purchased:0,played:0,scavenged:0,unconverted:0,interrupted:0},reasons:{},issues:{},products:{},taskRewards:0,openingCash:w.wallet.available,openingDebt:w.wallet.debt};
  const cutoff=w.clock.day-Math.max(2,Math.min(w.rules.maxDays||30,120))+1;
  for(const key of Object.keys(x.days))if(Number(key)<cutoff)delete x.days[key];
  return x;
}
export function configureExperience(w,config=DEFAULT_SHOP_EXPERIENCE){
  validateExperienceConfig(config);w.experience.config=clone(config);w.experience.stories=w.experience.stories.slice(-config.storyLimit);
  return {note:'引导配置已更新；已经安排的活动保留原规则，奖励仍由现有任务系统发放。'};
}
export function validateExperience(w){
  const x=w.experience;if(x===undefined)return;
  need(x?.version===1&&object(x.days)&&Object.keys(x.days).length<=121&&object(x.milestones)&&object(x.guide)&&typeof x.guide.skipped==='boolean'&&Array.isArray(x.stories)&&x.stories.length<=100&&Array.isArray(x.events)&&x.events.length<=120,'INVALID_SAVE','经营体验记录格式不正确。');
  validateExperienceConfig(x.config);
  need(object(x.trackingSince)&&Number.isSafeInteger(x.trackingSince.day)&&x.trackingSince.day>=1&&Number.isFinite(x.trackingSince.minute),'INVALID_SAVE','统计起点不正确。');
  need(Object.values(x.milestones).every(number),'INVALID_SAVE','引导累计值不正确。');
  for(const [key,d]of Object.entries(x.days)){
    need(String(d.day)===key&&Number.isSafeInteger(d.day)&&d.day>=1&&['complete','partial'].includes(d.coverage)&&['arrived','departed','taskRewards','openingCash','openingDebt'].every(k=>number(d[k]))&&object(d.outcomes)&&['purchased','played','scavenged','unconverted','interrupted'].every(k=>number(d.outcomes[k]))&&object(d.reasons)&&object(d.issues)&&object(d.products),'INVALID_SAVE','顾客日统计不正确。');
    need(Object.values(d.outcomes).reduce((a,b)=>a+b,0)===d.departed&&Object.entries(d.reasons).every(([k,v])=>Object.hasOwn(FEEDBACK_REASONS,k)&&number(v))&&Object.entries(d.issues).every(([k,v])=>Object.hasOwn(FEEDBACK_REASONS,k)&&number(v))&&Object.values(d.reasons).reduce((a,b)=>a+b,0)===d.outcomes.unconverted,'INVALID_SAVE','离店人数与原因口径不一致。');
    for(const key of ['closingCash','closingDebt'])need(d[key]===undefined||number(d[key]),'INVALID_SAVE','历史日终余额不正确。');
    need(Object.keys(d.products).length<=200&&Object.values(d.products).every(p=>typeof p.productId==='string'&&['pack','box'].includes(p.kind)&&['sold','revenue','stockoutVisits'].every(k=>number(p[k]))),'INVALID_SAVE','商品需求记录不正确。');
  }
  for(const s of x.stories)need(typeof s?.storyId==='string'&&typeof s.sourceEventId==='string'&&typeof s.type==='string'&&Number.isSafeInteger(s.day)&&Number.isFinite(s.minute),'INVALID_SAVE','本店记录来源不完整。');
  for(const e of x.events)need(safeId(e?.eventId)&&typeof e.title==='string'&&typeof e.description==='string'&&Number.isSafeInteger(e.day)&&e.day>=1&&['scheduled','completed','ended'].includes(e.status)&&Array.isArray(e.actorIds)&&e.actorIds.length===2&&e.actorIds.every(id=>typeof id==='string')&&new Set(e.actorIds).size===2&&number(e.completedMatches)&&Number.isSafeInteger(e.matchesRequired)&&e.matchesRequired>=1&&e.matchesRequired<=10&&Array.isArray(e.matchIds)&&new Set(e.matchIds).size===e.matchIds.length&&e.matchIds.length===e.completedMatches&&e.completedMatches<=e.matchesRequired&&(e.status==='completed')===(e.completedMatches>=e.matchesRequired),'INVALID_SAVE','交流会记录不正确。');
}
function productRow(d,productId,kind='pack'){
  const key=JSON.stringify([productId,kind]);
  return d.products[key]??=( {productId,kind,sold:0,revenue:0,stockoutVisits:0} );
}
function story(w,e,type,extra={}){
  const x=w.experience;
  x.stories.push({storyId:e.eventId,sourceEventId:e.eventId,type,day:e.day,minute:e.minute,...extra});
  x.stories=x.stories.slice(-x.config.storyLimit);
}
/** Called once by world.note at the transaction boundary, never replayed by a view. */
export function recordExperienceEvent(w,e){
  const x=initialiseExperience(w),d=x.days[String(w.clock.day)],npc=w.npcs.find(n=>n.actorId===(e.actorId||e.buyerId)),visit=npc?.visit;
  const inc=(key,n=1)=>x.milestones[key]=(x.milestones[key]||0)+n;
  if(e.type==='npcVisitStarted')d.arrived++;
  if(e.type==='customerPurchaseRejected'&&Object.hasOwn(FEEDBACK_REASONS,e.reason)){
    if(visit){visit.issues??=[];if(visit.issues.includes(e.reason))return;visit.issues.push(e.reason);visit.lastIssue=e.reason;}
    d.issues[e.reason]=(d.issues[e.reason]||0)+1;
    if(e.reason==='out-of-stock'&&e.productId)productRow(d,e.productId,e.kind).stockoutVisits++;
  }
  if(e.type==='packSaleCompleted'){
    const p=productRow(d,e.productId,e.kind);p.sold++;p.revenue+=e.amount;
    if(visit)visit.purchases=(visit.purchases||0)+1;
  }
  if(e.type==='secondaryTradeCompleted'&&visit)visit.purchases=(visit.purchases||0)+1;
  if(e.type==='trashCardPickedUp'){
    if(visit)visit.pickups=(visit.pickups||0)+1;
    if(e.discardedBy!==e.actorId)story(w,e,'recovered-card',{actorId:e.actorId,discardedBy:e.discardedBy,cardKey:e.cardKey,inventoryRef:e.inventoryRef});
  }
  if(e.type==='npcSimulationSettled'||e.type==='officialMatchSettled'){
    const m=w.matches.find(m=>m.matchId===e.matchId);
    if(m?.background&&(e.type!=='officialMatchSettled'||!m.simulated)){
      for(const n of w.npcs.filter(n=>[m.mineOwnerId,m.enemyOwnerId].includes(n.actorId)))if(n.visit)n.visit.matches=(n.visit.matches||0)+1;
      const active=x.events.find(v=>v.day===w.clock.day&&v.status==='scheduled'&&v.actorIds.every(a=>[m.mineOwnerId,m.enemyOwnerId].includes(a)));
      if(active&&!active.matchIds.includes(m.matchId)){
        active.matchIds.push(m.matchId);active.completedMatches++;
        if(active.completedMatches>=active.matchesRequired){active.status='completed';inc('communityEvents');story(w,e,'community-event',{eventId:active.eventId,title:active.title,matchId:m.matchId,simulated:!!m.simulated});}
      }
      const winner=e.result==='win'?m.mineOwnerId:e.result==='loss'?m.enemyOwnerId:null;
      const winningSide=e.result==='win'?'mine':e.result==='loss'?'enemy':null;
      const team=winningSide?m[winningSide]:[];
      const lineup=m.mode==='kof'&&winningSide?team.slice(0,m.progress[winningSide]+1):team;
      const recovered=lineup?.map(c=>w.items[c.inventoryRef]).find(i=>i?.lastTrashPickup?.actorId===winner&&i.lastTrashPickup.discardedBy!==winner);
      if(winner&&recovered)story(w,e,'recovered-card-win',{actorId:winner,cardKey:recovered.cardKey,inventoryRef:recovered.inventoryRef,matchId:m.matchId,simulated:!!m.simulated});
    }
  }
  if(e.type==='npcDeparted'){
    const v=npc?.lastVisit;
    // Legacy physical entities may have no tracked visit. Do not invent a visitor.
    if(v&&v.visitId){
      d.departed++;
      const technical=/path|route|unreachable|unknown-stage/.test(e.reason||'');
      const outcome=v.purchases?'purchased':v.matches?'played':v.pickups?'scavenged':technical?'interrupted':'unconverted';
      d.outcomes[outcome]++;
      if(outcome==='unconverted'){
        const reason=['closing','business-closed'].includes(e.reason)?'closed':e.reason==='visit-timeout'?'queue-timeout':v.lastIssue||'no-offer';
        d.reasons[reason]=(d.reasons[reason]||0)+1;
      }
    }
  }
  if(e.type==='retailItemsListed')inc('shelved',e.quantity);
  if(e.type==='employeeRestocked')inc('shelved');
  if(e.type==='regularTalked')inc('regularTalks');
  if(e.type==='upgradePurchased')inc('upgrades');
  if(e.type==='businessClosed'){
    inc('daysClosed');d.closingCash=w.wallet.available;d.closingDebt=w.wallet.debt;
    for(const event of x.events.filter(v=>v.day===w.clock.day&&v.status==='scheduled'))event.status='ended';
  }
  if(e.type==='taskRewardGranted')d.taskRewards+=e.amount;
}
export function experienceSnapshot(w){
  const x=w.experience,d=x?.days[String(w.clock.day)];if(!d)return null;
  const event=x.events.find(e=>e.day===w.clock.day&&e.status==='scheduled')||x.events.filter(e=>e.day===w.clock.day).at(-1);
  return {coverage:d.coverage,guideSkipped:x.guide.skipped,arrived:d.arrived,departed:d.departed,lastStoryId:x.stories.at(-1)?.storyId||null,event:event?{eventId:event.eventId,title:event.title,status:event.status,completedMatches:event.completedMatches,matchesRequired:event.matchesRequired}:null};
}
export function experienceGuide(w){
  const x=w.experience;
  const metrics={...w.lifetime,...x.milestones,daysClosed:Math.max(x.milestones.daysClosed||0,w.reports.length),upgrades:Math.max(x.milestones.upgrades||0,Object.values(w.management?.levels||{}).reduce((a,b)=>a+b,0)),regularTalks:Math.max(x.milestones.regularTalks||0,Object.keys(w.management?.talkedDays||{}).length),shelved:Math.max(x.milestones.shelved||0,Object.values(w.items).filter(i=>i.ownerId==='player'&&i.location==='retail').length)};
  const steps=x.config.steps.map(s=>({...clone(s),available:w.clock.day>=s.day,goals:s.goals.map(g=>({...g,progress:metrics[g.metric]||0,completed:(metrics[g.metric]||0)>=g.target}))})).map(s=>({...s,completed:s.goals.every(g=>g.completed)}));
  return {version:1,day:w.clock.day,skipped:x.guide.skipped,steps,next:steps.find(s=>s.available&&!s.completed&&!s.optional)||steps.find(s=>s.available&&!s.completed)||null,note:'引导不锁功能，不另发奖励；现有任务奖励仍自动领取。'};
}
export function experienceEvents(w,eligibleActors=[]){
  const x=w.experience,config=x.config.event,today=x.events.find(e=>e.day===w.clock.day),reasons=[];
  if(w.clock.day<config.minDay)reasons.push({code:'EVENT_DAY',message:`第 ${config.minDay} 天起可安排。`});
  if(!['preparing','open'].includes(w.clock.phase))reasons.push({code:'SHOP_CLOSED',message:'请在准备或营业时安排。'});
  if(w.rules.npcSimulation===false)reasons.push({code:'SIMULATION_DISABLED',message:'此活动需要开启 NPC 后台模拟。'});
  if(w.rules.npcAutoBattles===false)reasons.push({code:'AUTO_BATTLES_DISABLED',message:'请先开启 NPC 自动比赛。'});
  if(eligibleActors.length<config.requiredPlayers)reasons.push({code:'NOT_ENOUGH_PLAYERS',message:'需要两位持有可用流通卡、且未参加其他比赛的顾客；继续售包或交易即可培养玩家。'});
  if(today)reasons.push({code:'EVENT_ALREADY_SCHEDULED',message:'今天已经安排过这个活动。'});
  return {day:w.clock.day,available:!reasons.length,reasons,proposal:clone(config),eligibleActors:clone(eligibleActors),items:clone(x.events)};
}
export function scheduleExperienceEvent(w,eligibleActors){
  const view=experienceEvents(w,eligibleActors);need(view.available,'EVENT_UNAVAILABLE',view.reasons[0]?.message||'暂时不能安排活动。',view.reasons);
  const e={...clone(view.proposal),eventId:view.proposal.id,day:w.clock.day,status:'scheduled',actorIds:eligibleActors.slice(0,2).map(n=>n.actorId),completedMatches:0,matchIds:[]};delete e.id;
  w.experience.events.push(e);w.experience.events=w.experience.events.slice(-120);
  for(const npc of w.npcs.filter(n=>e.actorIds.includes(n.actorId)))npc.nextVisitAt=0;
  for(const npc of w.npcs.filter(n=>e.actorIds.includes(n.actorId)&&n.presence!=='offsite'&&n.visit))npc.visit.idleSeconds=Math.max(npc.visit.idleSeconds||0,120);
  return clone(e);
}
export function experienceStories(w,catalog,{limit=20}={}){
  need(Number.isSafeInteger(limit)&&limit>=1&&limit<=100,'INVALID_INPUT','记录数量必须在 1～100 之间。');
  const name=id=>id==='player'?'店长':w.npcs.find(n=>n.actorId===id)?.name||'一位顾客';
  return {items:w.experience.stories.slice(-limit).reverse().map(s=>{
    const card=catalog.byKey.get(s.cardKey),who=name(s.actorId);
    const text=s.type==='recovered-card'?`${who}从垃圾桶捡回了${card?.name||'一张卡'}，这张实物已进入流通。`:s.type==='recovered-card-win'?`${who}带着捡回的${card?.name||'卡牌'}赢得了一场${s.simulated?'模拟比赛':'比赛'}。`:s.type==='community-event'?`${s.title}已完成，参加者按正常规则支付了桌费。`:'本店有一条新记录。';
    return {...clone(s),actorName:who,cardName:card?.name,imageUrl:card?.imageUrl,text};
  })};
}
export function experienceInsights(w,catalog,day=w.clock.day){
  need(Number.isSafeInteger(day)&&day>=1,'INVALID_INPUT','日期不正确。');
  const d=w.experience.days[String(day)];need(d,'NOT_FOUND','该日没有经营观察记录，旧历史数据不会凭空补造。');
  const current=day===w.clock.day;
  const rows=clone(d.products);
  if(current){
    for(const p of w.products.filter(p=>p.prices))for(const kind of ['pack','box'])productRow({products:rows},p.productId,kind);
    for(const i of Object.values(w.items).filter(i=>i.ownerId==='player'&&['pack','box'].includes(i.kind)))productRow({products:rows},i.productId,i.kind);
    for(const o of w.orders.filter(o=>o.status!=='received'))productRow({products:rows},o.productId,o.unit);
  }
  const products=Object.values(rows).map(p=>{
    const product=w.products.find(v=>v.productId===p.productId),stock=Object.values(w.items).filter(i=>i.ownerId==='player'&&i.productId===p.productId&&i.kind===p.kind);
    return {...clone(p),name:product?.name||p.productId,...(current?{warehouse:stock.filter(i=>i.location==='stock').length,availableWarehouse:stock.filter(i=>i.location==='stock'&&!i.protected&&!i.lock).length,onShelf:stock.filter(i=>i.location==='retail').length,inTransit:w.orders.filter(o=>o.status!=='received'&&o.productId===p.productId&&o.unit===p.kind).reduce((n,o)=>n+o.quantity,0),averageStrength:product?.averageStrength??null,priceTier:clone(product?.priceTier??null),referenceWholesale:product?.prices?.[p.kind]?.wholesale??null}:{})};
  });
  const suggestions=[];
  if(d.issues['out-of-stock'])suggestions.push({code:'RESTOCK',text:'有顾客没找到可售商品；先核对在架、仓库和在途，再补货。',evidence:{visits:d.issues['out-of-stock']},guide:'store.counter'});
  if(d.issues.budget||d.issues.price)suggestions.push({code:'PRICE_RANGE',text:'部分顾客预算或接受价格不足，试着保留一档平价密封商品。',evidence:{budget:d.issues.budget||0,price:d.issues.price||0},guide:'store.retail'});
  if(d.issues['table-full'])suggestions.push({code:'TABLE_CAPACITY',text:'顾客遇到了满桌；观察占桌时间和实际桌位，不要只提高收费。',evidence:{visits:d.issues['table-full']},guide:'battleRoom.service'});
  if(!suggestions.length)suggestions.push({code:'OBSERVE',text:d.arrived?'比较密封商品、单卡与桌费的收入，再选择下一次投资。':'准备好货架再开门，观察第一位顾客的购买反馈。',evidence:{arrivals:d.arrived},guide:'store.retail'});
  const endCash=current?w.wallet.available:d.closingCash,endDebt=current?w.wallet.debt:d.closingDebt;
  return {day,coverage:d.coverage,trackingSince:clone(w.experience.trackingSince),visits:{arrived:d.arrived,departed:d.departed,active:current?w.npcs.filter(n=>n.presence!=='offsite'&&n.visit).length:0,outcomes:clone(d.outcomes),unconvertedReasons:Object.entries(d.reasons).map(([code,count])=>({code,label:FEEDBACK_REASONS[code],count})),issueVisits:Object.entries(d.issues).map(([code,count])=>({code,label:FEEDBACK_REASONS[code],count})),note:'离店结果每次访问只记一种；问题按访问与原因去重，一个访问可能有多个问题。技术中断单列，不算经营流失。'},products,suggestions,cash:{opening:d.openingCash,closing:endCash??null,change:endCash===undefined?null:endCash-d.openingCash,debtChange:endDebt===undefined?null:endDebt-d.openingDebt,taskRewards:d.taskRewards},...(current?{customers:w.npcs.filter(n=>n.presence!=='offsite').map(n=>({actorId:n.actorId,name:n.name,category:n.customerCategory||'顾客',intent:clone(n.visit?.intent||null),activity:n.activity,label:n.label,lastIssue:n.visit?.lastIssue||null}))}:{})};
}
