// tests/contract-samples.mjs — 契约样本检查。
//
// 目的：用真实运行时返回核对预期的联合类型、必填字段和身份字段。
// 此测试不读取或编译 contracts/*.d.ts；声明变更仍需另行核对。
// 覆盖 2026-10-27 交接登记的差异：队列 mode、对话 kind、选将 DTO 字段、评分/身份分键名。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';

const DECLARED_QUEUE_MODES=['kof'];
const DECLARED_DIALOGUE_KINDS=['talk','stage-challenge','debt-intro','debt-challenge'];
const DECLARED_FORMATS=['kof','doudizhu-bo3','versus2v2-bo3'];
const EXPECTED_SLOTS={kof:3,'doudizhu-bo3':5,'versus2v2-bo3':8};
const IDENTITY_KEYS=['kof','landlord','farmer','versus2v2-bo3'];

const source=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url),'utf8'));
const rules={...JSON.parse(fs.readFileSync(new URL('../data/backend-rules.json',import.meta.url),'utf8')),startingCash:50000};
const host=await createRuntime({source,rules,repository:memoryRepository()});
await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'contract-samples'});
let serial=0;
const query=async(name,payload={})=>{const result=await host.query(name,payload);assert.equal(result.ok,true,`${name} 失败：${JSON.stringify(result.error)}`);return result.data;};
const command=async(type,payload={},extra={})=>host.command({requestId:`contract-${++serial}`,type,payload,...extra});

// ---- 赛制注册表：只承认三种 ----
const formatView=await query('combat.formats');
assert.ok(Array.isArray(formatView.formats),'combat.formats 应返回 {formats:[...]}');
const formatIds=formatView.formats.map(entry=>entry.formatId).filter(Boolean);
assert.deepEqual([...formatIds].sort(),[...DECLARED_FORMATS].sort(),`combat.formats 与预期不一致：${JSON.stringify(formatIds)}`);

// ---- combat.eligible：mode 联合、slots、DTO 字段 ----
const rejected=await host.query('combat.eligible',{formatId:'bo3'});
assert.equal(rejected.ok,false,'已删除的单将 bo3 不应再被 combat.eligible 接受');
assert.equal(rejected.error.code,'INVALID_INPUT');
const eligibleByFormat={};
for(const formatId of DECLARED_FORMATS){
  const data=await query('combat.eligible',{formatId});
  assert.equal(data.mode,formatId);
  assert.ok(DECLARED_FORMATS.includes(data.mode),`mode 超出预期：${data.mode}`);
  assert.equal(data.slots,EXPECTED_SLOTS[formatId],`${formatId} 整场备战人数应为 ${EXPECTED_SLOTS[formatId]}`);
  eligibleByFormat[formatId]=data;
}

// ---- 开局债主对话：kind 与必填字段 ----
assert.equal((await command('business.open')).ok,true);
let offer=null;
for(let attempt=0;attempt<40&&!offer;attempt+=1){await host.advance(30);offer=await query('dialogue.offer');}
assert.ok(offer,'第 1 天营业后应出现海玲的开场借款对话');
assert.ok(DECLARED_DIALOGUE_KINDS.includes(offer.kind),`对话 kind 超出预期：${offer.kind}`);
assert.equal(offer.kind,'debt-intro','新档开场对话应为 debt-intro');
for(const field of ['offerId','actorId','kind','proof','speakerName','portrait','roleLabel','text','choices'])assert.ok(field in offer,`DialogueOffer 缺字段 ${field}`);
assert.equal(offer.portrait,'bd-umiri');
assert.ok(Array.isArray(offer.choices)&&offer.choices.length>0);
for(const choice of offer.choices){assert.equal(typeof choice.optionId,'string');assert.equal(typeof choice.text,'string');}

// ---- 开包取得实物，核对选将 DTO 的评分/身份分/印刷字段 ----
const gift=await query('player.starterGift');
assert.equal(gift.status,'granted');
const boxRef=gift.inventoryRefs[0];
const preview=await query('opening.preview',{inventoryRefs:[boxRef],includeBoxes:true});
assert.equal(preview.cards,120);
const opened=await command('opening.execute',{},{previewId:preview.previewId});
assert.equal(opened.ok,true,JSON.stringify(opened.error));
const kofItems=(await query('combat.eligible',{formatId:'kof'})).items;
assert.ok(kofItems.length>0,'开包后应有可参赛武将');
const sample=kofItems[0];
for(const field of ['inventoryRef','cardKey','generalId','name','rarity','eligible','favorite','reasons','disabledReasons','reviewStatus'])assert.ok(field in sample,`CombatEligibleView.items 缺字段 ${field}`);
assert.deepEqual(Object.keys(sample.modeScores).sort(),[...DECLARED_FORMATS].sort(),`modeScores 应覆盖三赛制：${JSON.stringify(sample.modeScores)}`);
assert.deepEqual(Object.keys(sample.roleScores).sort(),[...IDENTITY_KEYS].sort(),`roleScores 应覆盖四种身份：${JSON.stringify(sample.roleScores)}`);
// rarity 是实物印刷等级，不是理论分级
const inventoryRows=await query('inventory.list',{kind:'card',limit:200});
const physical=inventoryRows.items.find(row=>row.inventoryRef===sample.inventoryRef);
assert.ok(physical,'选将 DTO 的 inventoryRef 必须指向真实副本');
assert.equal(sample.rarity,physical.printedRarity,'CombatEligibleView.rarity 必须取实物 printedRarity');

// ---- 自动报名队列：只接受 KOF ----
for(const mode of DECLARED_FORMATS.filter(mode=>mode!=='kof')){
  const result=await command('combat.joinQueue',{mode,inventoryRefs:kofItems.slice(0,3).map(item=>item.inventoryRef)});
  assert.equal(result.ok,false,`队列不应接受 ${mode}`);
  assert.equal(result.error.code,'INVALID_INPUT');
  assert.match(result.error.message,/三将接力/);
}
// 一盒里可能有同一武将的重复副本；joinQueue 要求三张**不同**武将，必须按 generalId 去重。
const team=[];const picked=new Set();
for(const item of kofItems){
  if(!item.eligible||picked.has(item.generalId))continue;
  picked.add(item.generalId);team.push(item.inventoryRef);
  if(team.length===3)break;
}
assert.equal(team.length,3,`可参赛的不同武将不足 3 个：${JSON.stringify(kofItems.map(item=>[item.generalId,item.eligible]))}`);
const joined=await command('combat.joinQueue',{mode:'kof',inventoryRefs:team});
assert.equal(joined.ok,true,JSON.stringify(joined.error));
assert.equal(joined.data.mode,'kof');
assert.ok(DECLARED_QUEUE_MODES.includes(joined.data.mode));
assert.equal(joined.data.lineup.length,3);
const queue=await query('combat.queue');
assert.equal(queue.player.mode,'kof');
for(const waiting of queue.waiting)assert.ok(DECLARED_QUEUE_MODES.includes(waiting.mode),`等待列表出现预期以外的 mode：${waiting.mode}`);

// ---- catalog.detail 的 stats 只有三赛制键 ----
const cardKey=sample.cardKey;
const detail=await query('catalog.detail',{cardKey});
for(const formatId of DECLARED_FORMATS)assert.ok(formatId in detail.stats,`catalog.detail.stats 缺 ${formatId}`);
assert.equal('bo3' in detail.stats,false,'catalog.detail.stats 不应再有 bo3 键');
assert.ok('sampleSufficient' in detail.stats&&'note' in detail.stats);

await host.disconnect?.();
console.log('PASS 运行时样本：三赛制注册表、选将评分与身份字段、债主开场对话、KOF 报名队列及三赛制战绩；未自动校验 .d.ts');
