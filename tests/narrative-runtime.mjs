import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {createWorld,note,validateWorld} from '../modules/backend/world.mjs';
import {compileStoryPack,loadStoryPack} from '../modules/narrative/content.mjs';
import {createRegistry} from '../modules/narrative/registry.mjs';
import {createNarrativeRuntime} from '../modules/narrative/runtime.mjs';
import {loadNarrativeContent} from '../integration/story-content.mjs';
const read=p=>JSON.parse(fs.readFileSync(new URL('../'+p,import.meta.url),'utf8'));
const source=read('data/cards.json'),rules=read('data/backend-rules.json'),managementConfig=read('data/backend-management.json');
const index=read('data/story/index.json'),published=read('data/story/'+index.current);
let seq=0;
function client(host){
  const q=async(name,p={})=>{const r=await host.query(name,p);assert(r.ok,JSON.stringify(r));return r.data;};
  const identity=()=>{const w=host.inspect().world;return {worldId:w.worldId,branchId:w.branchId};};
  const raw=(type,payload={})=>host.command({requestId:'story-test-'+(++seq),type,payload:type.startsWith('narrative.')?{...identity(),...payload}:payload});
  const c=async(type,p={})=>{const r=await raw(type,p);assert(r.ok,JSON.stringify(r));return r.data;};
  return {q,c,raw,identity,view:()=>q('narrative.session')};
}
async function make({pack=published,initial=null,repository=memoryRepository(initial),extensions={}}={}){
  const h=await createRuntime({source,rules,managementConfig,repository,storyPacks:pack?[pack]:[],storyExtensions:extensions});
  await h.connect({contractVersion:'card-shop-ui/1.0',clientId:'story-test'});return h;
}

await loadStoryPack(published);
const corrupt=structuredClone(published);corrupt.payload.lines['c00.arrival']='corrupt';await assert.rejects(()=>loadStoryPack(corrupt),/hash/);
const unsupported=structuredClone(published.payload);unsupported.requires={actions:{'not.installed':1}};await assert.rejects(()=>compileStoryPack(unsupported),/capability/);
const unknown=structuredClone(published.payload);unknown.chapters[0].nodes[0].type='executeJS';await assert.rejects(()=>compileStoryPack(unknown),/unsupported/);
console.log('PASS: runtime pack hash, explicit capabilities and unknown opcode rejection');

const h=await make(),api=client(h);
try{
  assert((await api.q('narrative.available')).enabled);
  const firstDay=(await api.q('saves.days')).items[0];
  const lease=await h.pause.acquire({ownerId:'story-test-window',reason:'阅读剧情'}),minute=h.inspect().world.clock.minute;
  let v=await api.c('narrative.start',{campaignId:'corner_card_shop',chapterId:'chapter_00'});
  await h.advance(1);assert.equal(h.inspect().world.clock.minute,minute);
  v=await api.c('narrative.advance',v.proof);assert.equal(v.nodeType,'choice');
  const money=h.inspect().world.wallet.available;
  v=await api.c('narrative.choose',{...v.proof,choiceId:'c00_opt_stock',amount:999999});
  v=await api.c('narrative.advance',v.proof);assert.equal(v.status,'completed');assert.equal(h.inspect().world.wallet.available,money);
  v=await api.c('narrative.start',{campaignId:'corner_card_shop',chapterId:'chapter_01'});
  v=await api.c('narrative.advance',v.proof);
  v=await api.c('narrative.choose',{...v.proof,choiceId:'c01_opt_stock'});
  v=await api.c('narrative.advance',v.proof);assert.equal(v.status,'waiting');
  await h.advance(1);assert.equal(h.inspect().world.clock.minute,minute,'another lease remains in force');
  await h.pause.release(lease.leaseId);
  const box=Object.values(h.inspect().world.items).find(i=>i.kind==='box'&&i.ownerId==='player');
  const unsealed=await api.c('boxes.unseal',{inventoryRef:box.inventoryRef});
  await api.c('retail.listAll',{inventoryRefs:unsealed.inventoryRefs});await api.c('business.open');
  for(let i=0;i<100&&(await api.view()).status==='waiting';i++)await h.advance(.25);
  v=await api.view();assert.equal(v.proof.nodeId,'c01_receipt');assert(h.inspect().world.lifetime.sales>0);
  assert(h.inspect().world.log.some(e=>e.type==='packSaleCompleted'),'real domain sale, not a fixture flag');
  while(v.nodeType==='line')v=await api.c('narrative.advance',v.proof);
  assert.equal(v.proof.nodeId,'c01_priority');const oldProof=structuredClone(v.proof);
  const input={requestId:'story-choice-idempotency',type:'narrative.choose',payload:{...v.proof,choiceId:'c01_opt_collection'}};
  const result=await h.command(input);assert(result.ok);const once=h.inspect();assert.deepEqual(await h.command(input),result);assert.deepEqual(h.inspect(),once);
  v=result.data;while(v.nodeType==='line')v=await api.c('narrative.advance',v.proof);
  assert.equal(v.status,'completed');assert.equal(h.inspect().world.narrative.flags.corner_card_shop.visitPriority,'collection');
  const archived=await api.c('saves.create');const saved=h.inspect().world.narrative;
  await api.c('saves.load',{archiveId:archived.archiveId});const loadedStory=h.inspect().world.narrative;assert.ok(loadedStory.eventSequence>=saved.eventSequence);assert.deepEqual({...loadedStory,eventSequence:0},{...saved,eventSequence:0},'story state and receipts survive branch change; the restoration event cursor may advance');
  assert.equal((await h.command({requestId:'late-story-message',type:'narrative.choose',payload:{...oldProof,choiceId:'c01_opt_practice'}})).error.code,'STALE_OPERATION');
  await api.c('saves.loadDay',{archiveId:firstDay.archiveId||firstDay.id});
  const restored=h.inspect().world;assert.equal(restored.clock.minute,480);assert.equal(Object.keys(restored.narrative.completed).length,0);assert.equal(Object.keys(restored.narrative.receipts).length,0);
  assert.equal(Object.values(restored.items).filter(i=>i.ownerId==='player'&&i.kind==='box').length,1,'day rewind restores one gift, not a second reward');
  console.log('PASS: real first chapter sale/resume, modal pause, choices, operation retries, manual save and day-start causal rewind');
}finally{await h.disconnect();}

function tiny(chapters,revision='tiny-r1'){
  return {schemaVersion:1,campaignId:'tiny',contentRevision:revision,characters:[],flags:[],lines:{begin:'开始',after:'已完成',choice:'继续？',retry:'重试',end:'结束',failed:'未完成'},cast:{},chapters:chapters.map(c=>({schemaVersion:1,campaignId:'tiny',contentRevision:revision,sceneId:c.chapterId,...c})),entries:chapters.map(c=>({chapterId:c.chapterId,condition:{predicateId:'world.dayAtLeast',params:{value:1}}}))};
}
const waitChapter=id=>({chapterId:id,chapterTitle:id,entryNodeId:'wait',nodes:[{nodeId:'wait',type:'wait',pausePolicy:'release-modal',historyPolicy:'since-wait-entry',dayEndPolicy:'continue',condition:{predicateId:'event.occurred',params:{eventType:'test.completed'},sourcePolicy:'actual-business'},onSatisfied:'after',onDeferred:'defer'},{nodeId:'after',type:'line',speakerId:null,lineId:'after',next:'end'},{nodeId:'defer',type:'end',result:'deferred',resumeAt:'wait'},{nodeId:'end',type:'end',result:'scene-completed',resumeAt:null}]});
const eventExtensions={eventTypes:['test.completed']},eventPack=await compileStoryPack(tiny([waitChapter('a'),waitChapter('b')]),{registry:createRegistry(eventExtensions)});
const vm=createNarrativeRuntime({packs:[eventPack],extensions:eventExtensions}),w=createWorld(rules);vm.initialise(w,true);
note(w,'test.completed');
const start=id=>vm.command(w,'narrative.start',{worldId:w.worldId,branchId:w.branchId,campaignId:'tiny',chapterId:id});
const a=start('a'),b=start('b');assert.equal(a.status,'waiting');assert.equal(b.status,'waiting');
vm.command(w,'narrative.defer',b.proof);
note(w,'test.completed');for(let i=0;i<1100;i++)note(w,'test.noise');assert(!w.log.some(e=>e.type==='test.completed'));
vm.observe(w);assert.equal(vm.view(w,a.proof.sessionId).status,'presenting');assert.equal(vm.view(w,b.proof.sessionId).status,'presenting');validateWorld(w);
console.log('PASS: one committed fixture event independently wakes two subscriptions after log eviction; no historical event reuse');
const provenanceChapter=waitChapter('proof');provenanceChapter.nodes[0].condition={all:['actual-business','actual-player'].map(sourcePolicy=>({predicateId:'event.occurred',params:{eventType:'officialMatchSettled'},sourcePolicy}))};
const provenancePack=await compileStoryPack(tiny([provenanceChapter],'proof-r1')),proofVM=createNarrativeRuntime({packs:[provenancePack]}),proofWorld=createWorld(rules);proofVM.initialise(proofWorld,true);
proofVM.command(proofWorld,'narrative.start',{worldId:proofWorld.worldId,branchId:proofWorld.branchId,campaignId:'tiny',chapterId:'proof'});
note(proofWorld,'officialMatchSettled',{matchId:'nonexistent'});proofVM.observe(proofWorld);assert.equal(proofVM.view(proofWorld).status,'waiting','business evidence cannot satisfy stricter player evidence for the same event');

let attempts=0;
const action={version:1,authorityEffects:['money'],confirmationRequired:false,handledErrors:['EXPECTED_FAILURE'],validate:p=>Number.isSafeInteger(p?.amount)&&p.amount>0?[]:['bad amount'],run(ctx,p){attempts++;ctx.world.wallet.available+=p.amount;if(p.fail)throw Object.assign(Error('expected'),{code:'EXPECTED_FAILURE'});return {credited:p.amount};}};
const extensions={actions:{'test.credit':action}};
const rewardChapter={chapterId:'reward',chapterTitle:'reward',entryNodeId:'begin',nodes:[
  {nodeId:'begin',type:'line',speakerId:null,lineId:'begin',next:'pay'},
  {nodeId:'pay',type:'action',actionId:'test.credit',effectId:'once',params:{amount:10},onSuccess:'after',onFailure:'failed'},
  {nodeId:'after',type:'line',speakerId:null,lineId:'after',next:'choice'},
  {nodeId:'choice',type:'choice',lineId:'choice',choices:[{choiceId:'retry',lineId:'retry',target:'pay'},{choiceId:'end',lineId:'end',target:'end'}]},
  {nodeId:'failed',type:'line',speakerId:null,lineId:'failed',next:'end'},
  {nodeId:'end',type:'end',result:'scene-completed',resumeAt:null}]};
const rewardPack=await compileStoryPack(tiny([rewardChapter]),{registry:createRegistry(extensions)});
const base=memoryRepository();let failNext=false;
const repository={...base,async commit(next,expected){if(failNext){failNext=false;throw Object.assign(Error('storage failure'),{code:'STORAGE_ERROR'});}return base.commit(next,expected);}};
const mh=await make({pack:rewardPack,repository,extensions}),m=client(mh);
try{
  let v=await m.c('narrative.start',{campaignId:'tiny',chapterId:'reward'});const before=mh.inspect().world.wallet.available;
  const beforeArchive=await m.c('saves.create');
  const input={requestId:'story-storage-retry',type:'narrative.advance',payload:v.proof};failNext=true;
  assert.equal((await mh.command(input)).ok,false);assert.equal(mh.inspect().world.wallet.available,before);assert.equal(Object.keys(mh.inspect().world.narrative.receipts).length,0);
  const retry=await mh.command(input);assert(retry.ok);assert.equal(mh.inspect().world.wallet.available,before+10);assert.equal(attempts,2);
  const afterArchive=await m.c('saves.create');
  await m.c('saves.load',{archiveId:afterArchive.archiveId});v=await m.view();v=await m.c('narrative.advance',v.proof);v=await m.c('narrative.choose',{...v.proof,choiceId:'retry'});
  assert.equal(mh.inspect().world.wallet.available,before+10);assert.equal(attempts,2,'new branch does not bypass effect receipt');
  await m.c('saves.load',{archiveId:beforeArchive.archiveId});v=await m.view();await m.c('narrative.advance',v.proof);assert.equal(mh.inspect().world.wallet.available,before+10,'rewinding before the reward also rewinds its cash');
  const record=mh.inspect(),newPayload=tiny([rewardChapter],'tiny-r2');newPayload.lines.after='new text';
  const newer=await compileStoryPack(newPayload,{registry:createRegistry(extensions)});
  const pinned=await make({pack:newer,initial:record,extensions});const p=client(pinned);
  assert.equal((await p.view()).status,'suspended');await p.c('business.open');assert.equal(pinned.inspect().world.clock.phase,'open');
  assert.equal(pinned.inspect().world.narrative.sessions[pinned.inspect().world.narrative.activeSessionId].contentHash,rewardPack.contentHash);
  await pinned.installStoryPacks([rewardPack]);
  const resumed=await p.c('narrative.start',{campaignId:'tiny',chapterId:'reward'});
  assert.equal(resumed.status,'presenting');assert.equal(resumed.text,'已完成');assert.equal(resumed.proof.contentHash,rewardPack.contentHash);
  assert(pinned.storyReferences(afterArchive.archiveId).includes(rewardPack.contentHash));
  assert.equal(pinned.inspect().world.wallet.available,before+10);
  await pinned.disconnect();
  const badChapter=structuredClone(rewardChapter);badChapter.nodes.find(n=>n.nodeId==='pay').params.fail=true;
  const failPack=await compileStoryPack(tiny([badChapter],'tiny-fail'),{registry:createRegistry(extensions)});
  const fh=await make({pack:failPack,extensions}),f=client(fh),cash=fh.inspect().world.wallet.available;
  let fv=await f.c('narrative.start',{campaignId:'tiny',chapterId:'reward'});fv=await f.c('narrative.advance',fv.proof);
  assert.equal(fv.proof.nodeId,'failed');assert.equal(fh.inspect().world.wallet.available,cash);assert.equal(Object.keys(fh.inspect().world.narrative.receipts).length,0);await fh.disconnect();
  console.log('PASS: atomic reward/cursor/receipt rollback, same-ID retry, branch-safe receipts, expected-failure savepoint and missing-version shop continuity');
}finally{await mh.disconnect();}

const legacy=await make({pack:null});const oldRecord=legacy.inspect();await legacy.disconnect();
const upgraded=await make({initial:oldRecord});const u=client(upgraded);
assert.equal((await u.q('narrative.available')).enabled,false);const cash=upgraded.inspect().world.wallet.available;await u.c('narrative.enable');assert.equal(upgraded.inspect().world.wallet.available,cash);await upgraded.disconnect();
const future=structuredClone(oldRecord);future.world.narrative={version:99,opaque:{keep:'progress'}};
const futureHost=await make({initial:future}),f=client(futureHost);assert.equal((await f.view()).status,'unsupported');await f.c('business.open');assert.deepEqual(futureHost.inspect().world.narrative,future.world.narrative);await futureHost.disconnect();
console.log('PASS: legacy opt-in without rewards and opaque future narrative state preserved while business remains playable');

const chargeChapter=structuredClone(rewardChapter);chargeChapter.nodes.find(n=>n.nodeId==='pay').actionId='test.charge';
chargeChapter.nodes.find(n=>n.nodeId==='choice').choices[1].condition={predicateId:'world.dayAtLeast',params:{value:2}};
const chargeExtensions={actions:{'test.charge':{version:1,authorityEffects:['money'],describe:(_,p)=>`支付 ${p.amount} 游戏币`,validate:action.validate,run(ctx,p){ctx.world.wallet.available-=p.amount;return {paid:p.amount};}}}};
const chargePack=await compileStoryPack(tiny([chargeChapter],'tiny-charge'),{registry:createRegistry(chargeExtensions)});
const ch=await make({pack:chargePack,extensions:chargeExtensions}),cc=client(ch);
try{
  let v=await cc.c('narrative.start',{campaignId:'tiny',chapterId:'reward'}),cash=ch.inspect().world.wallet.available;
  v=await cc.c('narrative.advance',v.proof);assert.equal(v.nodeType,'action');assert(v.confirmation.message.includes('10'));
  assert.equal(ch.inspect().world.wallet.available,cash,'advance does not automatically spend money');
  assert.equal((await cc.raw('narrative.advance',v.proof)).error.code,'CONFIRMATION_REQUIRED');
  v=await cc.c('narrative.advance',{...v.proof,confirm:true});assert.equal(ch.inspect().world.wallet.available,cash-10);
  v=await cc.c('narrative.advance',v.proof);assert.equal(v.choices.find(c=>c.choiceId==='end').available,false);
  assert.equal((await cc.raw('narrative.choose',{...v.proof,choiceId:'end'})).error.code,'STORY_OPTION_LOCKED');
  v=await cc.c('narrative.choose',{...v.proof,choiceId:'retry'});assert.equal(v.nodeType,'line');assert.equal(ch.inspect().world.wallet.available,cash-10,'looping an acknowledged effect does not charge twice');
}finally{await ch.disconnect();}
console.log('PASS: authority effects require confirmation, conditions are rechecked server-side, and confirmed effects remain idempotent');

const flow={chapterId:'flow',chapterTitle:'flow',entryNodeId:'branch',nodes:[
  {nodeId:'branch',type:'branch',cases:[{condition:{predicateId:'world.phase',params:{value:'preparing'}},target:'cue'}],fallback:'failed'},
  {nodeId:'cue',type:'cue',cueId:'visual.sample',skippable:true,next:'travel'},
  {nodeId:'travel',type:'transition',routeId:'not.open',effectId:'travel.once',onSuccess:'after',onFailure:'failed'},
  {nodeId:'after',type:'line',speakerId:null,lineId:'after',next:'end'},
  {nodeId:'failed',type:'line',speakerId:null,lineId:'failed',next:'end'},
  {nodeId:'end',type:'end',result:'scene-completed',resumeAt:null}]};
const flowPack=await compileStoryPack(tiny([flow],'flow-r1')),flowHost=await make({pack:flowPack}),fc=client(flowHost);
let fv=await fc.c('narrative.start',{campaignId:'tiny',chapterId:'flow'});assert.equal(fv.nodeType,'cue');fv=await fc.c('narrative.advance',fv.proof);assert.equal(fv.nodeType,'transition');
const position=structuredClone(flowHost.inspect().world.player);fv=await fc.c('narrative.advance',{...fv.proof,confirm:true});assert.equal(fv.proof.nodeId,'failed');assert.deepEqual(flowHost.inspect().world.player,position);await flowHost.disconnect();
const files=new Map([['/data/story/index.json',{format:'card-shop-story-index/1',packs:['old.aaaaaaaaaaaaaaaa.storypack.json','new.bbbbbbbbbbbbbbbb.storypack.json'],active:['new.bbbbbbbbbbbbbbbb.storypack.json'],current:'new.bbbbbbbbbbbbbbbb.storypack.json'}],['/data/story/old.aaaaaaaaaaaaaaaa.storypack.json',{marker:'old'}],['/data/story/new.bbbbbbbbbbbbbbbb.storypack.json',{marker:'new'}]]);
const content=await loadNarrativeContent(async p=>{assert(files.has(p));return files.get(p);},{savedStates:[{sessions:{archived:{contentHash:'a'.repeat(64)}}}]});
assert.deepEqual(content.packs.map(p=>p.marker),['old','new'],'archive references are loaded before current versions');
assert.equal((await loadNarrativeContent(async()=>{throw Error('missing');})).packs.length,0);
console.log('PASS: branch/cue/transition fallback, archive-pinned package discovery and optional content failure');
