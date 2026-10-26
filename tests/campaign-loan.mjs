import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {loanBalance,reviewGoal} from '../modules/backend/campaign-loan.mjs';
import {income} from '../modules/backend/trading.mjs';
import {createProgressionState,reduceProgression} from '../modules/progression/state.mjs';
import {planChallengerVisit} from '../modules/progression/scheduler.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json');
let seq=0,r;const make=async initial=>{const h=await createRuntime({source,rules,repository:memoryRepository(initial)});await h.connect({contractVersion:'card-shop-ui/1.0',clientId:'campaign-loan'});return h;};
const command=async(type,payload={},requestId)=>{const v=await r.command({requestId:requestId||'loan-test-'+ ++seq,type,payload});assert(v.ok,JSON.stringify(v));return v.data;};
const query=async(name,p={})=>{const v=await r.query(name,p);assert(v.ok,JSON.stringify(v));return v.data;};
r=await make();const start=r.inspect(),intro=await query('dialogue.offer');assert.equal(intro.kind,'debt-intro');assert.equal(intro.speakerName,'海玲');assert.equal(intro.portrait,'bd-umiri');assert.equal(intro.roleLabel,'债主');assert(intro.text.includes('20000')&&intro.text.includes('5000'));assert.equal(start.world.wallet.available,rules.startingCash);assert.equal(start.world.wallet.debt,0);assert.equal(start.archives[0].world.longTerm.loan.principal,20000);
let no=await r.command({requestId:'before-story',type:'debt.repay',payload:{milestoneId:'week-1',amount:500}});assert.equal(no.error.code,'NOT_READY');await command('dialogue.respond',{offerId:intro.offerId,optionId:'begin',proof:intro.proof},'intro-ack');await command('dialogue.respond',{offerId:intro.offerId,optionId:'begin',proof:intro.proof},'intro-ack');
const traded=r.inspect().world;income(traded,100);assert.equal(traded.wallet.available,rules.startingCash+100);assert.equal(loanBalance(traded),20000,'sales cannot drain campaign principal');
await command('debt.repay',{milestoneId:'week-1',amount:500});assert.equal((await query('longTerm.status')).loan.currentGoal.remaining,4500);assert.equal(r.inspect().world.wallet.available,rules.startingCash-500);
const archive=await command('saves.export');const check=JSON.parse(archive.content);assert.equal(check.world.longTerm.loan.paid,500);
await command('saves.loadDay',{archiveId:start.archives[0].id});assert.equal((await query('longTerm.status')).loan.paid,0);assert.equal((await query('dialogue.offer')).kind,'debt-intro');assert.equal(r.inspect().world.wallet.available,rules.startingCash);
console.log('PASS opening lender cutscene, no extra cash or supplier debt, explicit partial repayment, day-start story and principal rewind');

let saved=r.inspect();await r.disconnect();saved.world.longTerm.loan.intro.status='acknowledged';saved.world.dialogueOffer=null;saved.world.wallet.available=25000;
for(const [index,dueDay]of [7,14,21,28].entries()){
 saved.world.clock={...saved.world.clock,day:dueDay,phase:'open'};const npc=saved.world.npcs.find(n=>n.debtCollector);Object.assign(npc,{presence:'onsite',trip:null,roomId:saved.world.player.roomId,x:saved.world.player.x+24,y:saved.world.player.y});
 r=await make(saved);const before=r.inspect().world.wallet.available;
 await command('debt.repay',{milestoneId:'week-'+(index+1),amount:5000});assert.equal(r.inspect().world.wallet.available,before-5000);
 if(index===0){const early=r.inspect().world;early.clock.day=6;assert.throws(()=>reviewGoal(early),e=>e.code==='NOT_READY');}
 await command('actors.interact',{actorId:'specialist:creditor'});const offer=await query('dialogue.offer');await command('dialogue.respond',{offerId:offer.offerId,optionId:'settled',proof:offer.proof});
 const v=await query('longTerm.status');assert.equal(v.loan.completedCount,index+1);assert.equal(v.loan.outstanding,20000-(index+1)*5000);assert.equal(v.outdoor.status,'unlocked-planned');if(index<3)assert.equal(v.debt.nextVisitDay,[14,21,28][index]);else assert.equal(v.debt.status,'resolved');
 saved=r.inspect();await r.disconnect();
}
assert.equal(saved.world.longTerm.loan.paid,20000);assert.equal(saved.world.wallet.available,5000);console.log('PASS four frozen 5000-payment phases, due-date review, next deadline, full principal conservation and final payoff');

const legacy=structuredClone(saved);delete legacy.world.longTerm.loan;legacy.world.wallet.debt=1234;legacy.world.wallet.available=8500;const cardCount=Object.keys(legacy.world.items).length;r=await make(legacy);assert.equal((await query('dialogue.offer')).kind,'debt-intro');assert.equal(r.inspect().world.wallet.debt,1234);assert.equal(r.inspect().world.wallet.available,8500);assert.equal(Object.keys(r.inspect().world.items).length,cardCount);assert.equal(r.inspect().world.longTerm.loan.principal,20000);assert.equal(r.inspect().world.longTerm.outdoor.status,'unlocked-planned');await r.disconnect();console.log('PASS old-account-review migration adds phase goals without rewriting cash, credit, cards or prior outdoor permission');

const p=createProgressionState();p.stages[1].dueDay=30;reduceProgression(p,{type:'CHALLENGE_CLEARED',stageId:p.stages[0].stageId,productId:p.stages[0].productId,day:10},{day:10});assert.equal(p.stages[1].dueDay,11);assert.equal(planChallengerVisit(p,10).data.shouldVisit,false);assert.equal(planChallengerVisit(p,11).data.shouldVisit,true);assert.equal(p.activeStageId,p.stages[1].stageId);console.log('PASS delayed victory schedules exactly the next day, never the same day or an obsolete fixed date');
