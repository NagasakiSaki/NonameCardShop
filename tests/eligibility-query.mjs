import assert from 'node:assert/strict';
import {eligible} from '../modules/backend/matches.mjs';
import {eligibleV7} from '../modules/backend/operations-v7.mjs';
import {referenceEligible} from '../tools/perf/eligibility-reference.mjs';

let roleReads=0;
const roles={kof:{score:51},landlord:{score:67},farmer:{score:49},'versus2v2-bo3':{score:58}};
const cards=Array.from({length:20},(_,i)=>({cardKey:'card-'+i,generalId:'general-'+i,name:'卡'+i,pack:'pack',currentRarity:'R',issuanceRarity:'N',globalScore:i,
  power:{modeScores:{kof:51,'doudizhu-bo3':58,'versus2v2-bo3':58},get roles(){roleReads++;return roles;}}}));
const catalog={byKey:new Map(cards.map(c=>[c.cardKey,c])),packNames:{pack:'卡包'}};
const world={items:{},rules:{compatibilityBlocks:{'general-3':'测试不兼容'}},player:{favoriteCardKeys:['card-2','card-7']},circulation:{'card-0':{day:1}}};
for(let i=0;i<200;i++){
  const ref='copy-'+i;
  world.items[ref]={inventoryRef:ref,kind:'card',ownerId:i%2?'npc':'player',cardKey:'card-'+(i%20),printedRarity:i%3?'SR':'N',location:i%11?'collection':'market',protected:i%13===0,lock:i%17===0?'lock':null};
}
world.items.box={inventoryRef:'box',kind:'box',ownerId:'player'};
for(const owner of ['player','npc']){
  const expected=referenceEligible(world,catalog,owner);roleReads=0;
  const actual=eligible(world,catalog,owner);
  assert.deepEqual(actual,expected,'副本顺序、印刷、评分、收藏和全部拒绝原因必须保持');
  assert.equal(roleReads,10,'每个不同卡种每次调用只读取一次角色评分');
}
const player=eligible(world,catalog);
assert(player.some(c=>c.eligible&&!world.circulation[c.cardKey]),'店长私有牌无需流通');
assert(eligible(world,catalog,'npc').some(c=>c.disabledReasons.some(r=>r.code==='NOT_IN_CIRCULATION')));
const duplicate=player.filter(c=>c.cardKey==='card-0');
duplicate[0].roleScores.kof=999;
assert.equal(duplicate[1].roleScores.kof,51,'返回值的角色分不在副本间共享可变对象');
world.items['copy-20'].protected=true;
world.items['copy-40'].lock='new-lock';
world.player.favoriteCardKeys=['card-4'];
world.circulation['card-1']={day:2};
world.rules.compatibilityBlocks['general-4']='新配置';
for(const owner of ['player','npc'])assert.deepEqual(eligible(world,catalog,owner),referenceEligible(world,catalog,owner),'后续调用必须立即反映锁、保护、收藏、流通和配置变更');
for(const formatId of ['kof','doudizhu-bo3','versus2v2-bo3'])assert.deepEqual(eligibleV7(world,catalog,'player',formatId),eligible(world,catalog));
console.log('PASS query-local eligibility reuse: exact legacy DTO parity, physical copy independence, fresh locks/protection/favorites/circulation/config and all three formats');
