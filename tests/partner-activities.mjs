import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,validateWorld} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {initialiseV7} from '../modules/backend/v7-policy.mjs';
import {tickV7,progressionQuery,assignV7} from '../modules/backend/operations-v7.mjs';
import {tickPartnerActivities,partnerActivityView} from '../modules/backend/partner-activities.mjs';
import {tickNpcTables} from '../modules/backend/npc-tables.mjs';
import {voidNpcMatch,finish,advanceNpcSimulation} from '../modules/backend/matches.mjs';
import {onSite} from '../modules/backend/visits.mjs';
import {validateMap} from '../modules/backend/navigation.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {CONTRACT} from '../modules/backend/common.mjs';
import {joinQueue} from '../modules/backend/match-queue.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const rules=read('../data/backend-rules.json'),source=read('../data/cards.json'),catalog=buildCatalog(source,rules);
const navigation=new Map(['store','battle-room'].map(n=>[n,validateMap(read(`../assets/frontend/maps/${n}.json`))]));
function fixture(){
  const w=createWorld(rules);initialiseV7(w,rules,{fresh:true});w.clock.phase='open';w.clock.minute=540;w.nextNpcMinute=1e6;w.seed=1;
  const stage=w.progression.stages[0];stage.status='cleared';stage.clearedAtDay=1;
  w.progression.allies=[{allyId:stage.challengerId,personId:stage.personId,appearanceId:stage.appearanceId,name:stage.displayName,onDuty:true,defaultDuty:'attraction',assignedDuty:'duelist',rate:.1,recruitedAtDay:1}];
  const actor=(id,extra={})=>({actorId:id,name:id,appearanceId:'bd-anon',wallet:{available:1000,reserved:0},presence:'onsite',roomId:'store',x:240,y:200,activity:'idle',direction:'left',moving:false,trip:null,...extra});
  w.npcs=[actor('partner',{wallet:{available:0},specialist:true,personId:stage.personId,allyId:stage.challengerId}),actor('customer')];
  const cards=catalog.cards.filter(c=>!w.rules.compatibilityBlocks[c.generalId]).slice(0,6);
  for(const [i,c]of cards.entries()){
    w.circulation[c.cardKey]={day:1,source:'fixture'};
    if(i>=3){const ref='customer-card-'+i;w.items[ref]={inventoryRef:ref,ownerId:'customer',kind:'card',cardKey:c.cardKey,printedRarity:c.issuanceRarity,location:'collection',cost:0,protected:false,lock:null};}
  }
  return w;
}
const cash=w=>w.wallet.available+w.npcs.reduce((s,n)=>s+n.wallet.available,0)+w.wallet.escrowLiability;
function schedule(w){tickPartnerActivities(w,catalog,navigation);const m=w.matches.find(m=>m.partnerWager);assert(m,'伙伴应主动预约一场有本金托管的后台牌局');validateWorld(w);return m;}
for(const result of ['win','loss','draw']){
  const w=fixture(),before=cash(w),shop=w.wallet.available,customer=w.npcs[1].wallet.available,items=Object.keys(w.items),m=schedule(w),b=m.partnerWager;
  assert.equal(m.background,true);assert.equal(m.simulated,true);assert(!m.timeSession);assert.equal(w.wallet.available,shop-b.stake);assert.equal(w.npcs[1].wallet.available,customer-b.stake-b.feeHeld);assert.equal(cash(w),before);
  assert.deepEqual(Object.keys(w.items),items,'借用伙伴牌不能生成可出售实物');assert(m.mine.every(c=>c.loanRef&&w.circulation[c.cardKey]));
  m.serviceRecognized=true;m.results.push({gameId:'controlled-result',result,simulated:true});
  finish(w,m,result);validateWorld(w);assert.equal(cash(w),before);assert.equal(w.wallet.escrowLiability,0);
  assert.equal(w.daily.matchNet,result==='win'?b.stake:result==='loss'?-b.stake:0);assert.equal(w.daily.service,b.feeHeld);
  assert.equal(w.wallet.available,shop+w.daily.matchNet+b.feeHeld);assert.equal(w.npcs[0].wallet.available,0,'伙伴免桌费，不能凭空获得游戏币');
  const saved=structuredClone(w);finish(w,m,result);advanceNpcSimulation(w,catalog,m,100);assert.deepEqual(w,saved,'同一结果不得重复结算');
}
{
  const w=fixture();w.wallet.debt=500;const shop=w.wallet.available,m=schedule(w),b=m.partnerWager;
  m.serviceRecognized=true;m.results.push({gameId:'debt-test',result:'win',simulated:true});finish(w,m,'win');validateWorld(w);
  assert.equal(w.wallet.available,shop,'退本金不应自动偿还进货欠款');assert.equal(w.wallet.debt,500-b.stake-b.feeHeld,'只有净盈利与桌费清偿欠款');
  const refund=fixture();refund.wallet.debt=500;const before=structuredClone(refund.wallet),cancel=schedule(refund);voidNpcMatch(refund,cancel.matchId,'cancel');assert.deepEqual(refund.wallet,before,'技术退款不能清偿欠款');
}
{
  const w=fixture(),m=schedule(w);for(const n of w.npcs){n.activity='seated';n.trip=null;}m.simulation.elapsedSeconds=7;
  const restored=structuredClone(w);advanceNpcSimulation(w,catalog,m,100);advanceNpcSimulation(restored,catalog,restored.matches[0],100);validateWorld(w);validateWorld(restored);
  assert.deepEqual(restored,w,'进行中的存档按相同 RNG 和收据继续，不能读档重抽或重复下注');
  const day=fixture();day.clock.day=2;day.progression.allies[0].earning={day:1,started:3,matches:3,wins:0,losses:3,net:-180,fees:0,nextAt:999999};schedule(day);assert.equal(day.progression.allies[0].earning.day,2);assert.equal(day.progression.allies[0].earning.started,1,'新一天重置当日风控，不清空累计');
}
{
  const w=fixture(),before=structuredClone(w.wallet),npcCash=w.npcs[1].wallet.available,m=schedule(w);
  voidNpcMatch(w,m.matchId,'测试路线异常');validateWorld(w);assert.deepEqual(w.wallet,before);assert.equal(w.npcs[1].wallet.available,npcCash);assert.equal(w.daily.matchNet,0);assert.equal(w.daily.service,0);assert.equal(w.progression.allies[0].earning.started,0);
  const snapshot=structuredClone(w);voidNpcMatch(w,m.matchId,'重复取消');assert.deepEqual(w,snapshot);
}
{
  const w=fixture(),refs=Object.keys(w.items),before=cash(w),customerCash=w.npcs[1].wallet.available;
  const q=joinQueue(w,catalog,{mode:'kof',inventoryRefs:refs},'customer');assert.equal(w.npcs[1].wallet.reserved,q.fee);
  const m=schedule(w);assert.equal(w.matchQueue.length,0);assert.equal(w.npcs[1].wallet.reserved,0,'原等候桌费预留释放，再转入本次托管');
  assert.equal(m.partnerWager.feeHeld,q.fee,'沿用已经接受的桌费');assert.equal(cash(w),before);assert(refs.every(ref=>w.items[ref].lock===m.matchId),'队列实物锁转换为比赛锁');
  voidNpcMatch(w,m.matchId,'queued-route-test');validateWorld(w);assert.equal(w.npcs[1].wallet.available,customerCash);assert.equal(cash(w),before);
}
for(const kind of ['rest','reserve','no-market','busy-customer','protected','daily-limit','loss-limit','player-waiting','closed']){
  const w=fixture(),a=w.progression.allies[0];
  if(kind==='rest')a.onDuty=false;if(kind==='reserve')w.wallet.available=1000;if(kind==='no-market')w.circulation={};if(kind==='busy-customer')w.npcs[1].currentRoomId='busy';if(kind==='protected')for(const i of Object.values(w.items))i.protected=true;
  if(kind==='daily-limit'||kind==='loss-limit')a.earning={day:1,started:kind==='daily-limit'?3:0,matches:0,wins:0,losses:0,net:kind==='loss-limit'?-180:0,fees:0,nextAt:0};
  if(kind==='player-waiting')w.matchQueue=[{ownerId:'player'}];if(kind==='closed')w.clock.phase='closed';
  tickPartnerActivities(w,catalog,navigation);assert.equal(w.matches.length,0,kind+' 应阻止开局');
}
{
  const w=fixture(),startMinute=w.clock.minute,start=cash(w),m=schedule(w);m.simulation.durationSeconds=.5;
  for(let i=0;i<300&&m.status!=='finished';i++){tickV7(w,catalog,navigation,.25);tickNpcTables(w,catalog,navigation,.25,{schedule:false});w.clock.minute+=.05;validateWorld(w);}
  assert.equal(m.status,'finished');assert.equal(m.partnerWager.settled,true);assert(w.clock.minute>startMinute,'NPC 对局营业时钟继续推进');assert.equal(cash(w),start);
  const restored=structuredClone(w);validateWorld(restored);tickPartnerActivities(restored,catalog,navigation);assert.equal(restored.matches.length,1,'存读档后保留冷却，不立即再次下注');
  for(let i=0;i<300;i++){tickV7(w,catalog,navigation,.25);tickNpcTables(w,catalog,navigation,.25,{schedule:false});if(!onSite(w.npcs[1])&&w.npcs[0].roomId==='store'&&!w.npcs[0].trip)break;}
  assert.equal(onSite(w.npcs[1]),false,'顾客打完离店');assert.equal(onSite(w.npcs[0]),true,'当班伙伴打完留店');assert.equal(w.npcs[0].roomId,'store');assert.equal(w.npcs[0].direction,'down');assert.equal(w.npcs[0].moving,false);assert.equal(w.npcs[0].currentMatchId,null);
  const view=partnerActivityView(w);assert.equal(view.allies[0].today.matches,1);assert.equal(view.allies[0].total.matches,1);
}
{
  const w=fixture(),repo=memoryRepository({schemaVersion:2,revision:0,world:w,archives:[],requests:{},legacyResetDone:true});
  const runtime=await createRuntime({source,rules,repository:repo,maps:['store','battle-room'].map(n=>read(`../assets/frontend/maps/${n}.json`))});await runtime.connect({contractVersion:CONTRACT,clientId:'partner-test'});
  const result=await runtime.query('allies.list');assert(result.ok);assert.equal(result.data.earning.policy.maxMatchesPerDay,3);
  const response=await runtime.command({requestId:'partner-duty',type:'allies.assign',payload:{allyId:w.progression.allies[0].allyId,dutyId:'duelist'}});assert(response.ok,JSON.stringify(response));
  await runtime.advance(.25);const state=runtime.inspect().world;validateWorld(state);assert(state.matches.some(m=>m.partnerWager),'正式 advance 链应调度伙伴约战');assert(state.cashJournal.some(e=>e.label.includes('伙伴约战托管')),'托管本金在实时流水中说明');
  for(let i=0;i<400&&!runtime.inspect().world.matches[0].partnerWager.settled;i++)await runtime.advance(.25);
  const final=runtime.inspect().world;validateWorld(final);assert.equal(final.matches[0].status,'finished','正式 tick 完成入座和结算');assert.equal(final.wallet.escrowLiability,0);assert(final.clock.minute>state.clock.minute);assert.equal(final.cashJournal.filter(e=>e.label.includes('伙伴约战结算')).length,1);assert(!final.matches[0].timeSession,'后台比赛不触发玩家时间政策');await runtime.disconnect();
}
console.log('PASS partner activities: win/loss/draw/refund conservation, idempotence, loan circulation, risk limits, background clock, saved cooldown, return to work/front idle, formal runtime scheduling and cash journal.');
