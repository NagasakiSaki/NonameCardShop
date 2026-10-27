// tests/npc-day-loop.mjs — NPC 营业闭环：模拟比赛、离桌离店、关店、跨日、存读档（OPT-10）。
//
// 已有覆盖（不重复断言，只引用）：tests/customer-trash.mjs 覆盖 购物→收银→店内拆包→弃牌→拾牌
// 与成本守恒；tests/customer-visits.mjs 覆盖到店/离店身份与关店清场；tests/three-formats.mjs
// 覆盖 NPC 牌桌阵容与“结算一次、付费一次”。本测试补的是**同一天里连起来**跑完并跨日/存读档，
// 逐步核对资金、预留与实物归属。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createWorld,validateWorld} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {publishProducts} from '../modules/backend/products.mjs';
import {tickEconomy,owned} from '../modules/backend/trading.mjs';
import {tickNpcTables} from '../modules/backend/npc-tables.mjs';
import {onSite,departCustomer} from '../modules/backend/visits.mjs';
import {validateMap} from '../modules/backend/navigation.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';

const read=p=>JSON.parse(fs.readFileSync(new URL(p,import.meta.url)));
const source=read('../data/cards.json'),rules=read('../data/backend-rules.json');
rules.npcAutoBattles=true;rules.npcSimulation=true;rules.npcSimulationSeconds=2;rules.npcMatchIntervalMinutes=10;
const catalog=buildCatalog(source,rules),products=publishProducts(catalog,rules,1);
const maps={};
for(const name of ['store','battle-room']){const raw=read(`../assets/frontend/maps/${name}.json`);maps[raw.mapId||name]=validateMap(raw);}
const navigation={get:id=>maps[id]};
const store=navigation.get('store'),room=navigation.get('battle-room');
assert.ok(store&&room,'需要正式 store 与 battle-room 地图');

const actor=(actorId,extra={})=>({actorId,name:actorId,appearanceId:'rookie',wallet:{available:1000,reserved:0},roomId:'store',x:store.anchors['store.entry'].x,y:store.anchors['store.entry'].y,direction:'down',activity:'idle',moving:false,scavenger:false,presence:'onsite',...extra});
function fixture(){
  const w=createWorld(rules);
  w.seed=7;w.clock.phase='open';w.clock.minute=540;w.nextNpcMinute=10000;w.nextNpcMatchAt=0;w.products=products;
  w.npcs=[actor('npc-a'),actor('npc-b',{x:store.anchors['store.entry'].x+20})];
  // 两名 NPC 各持 3 名不同武将并已流通，才能真的开一桌
  const picks=catalog.cards.filter(c=>c.currentRarity==='N').slice(0,6);
  for(const [index,npc]of w.npcs.entries())for(let i=0;i<3;i+=1){
    const card=picks[index*3+i],ref=`${npc.actorId}-card-${i}`;
    w.items[ref]={inventoryRef:ref,ownerId:npc.actorId,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,printVersion:'loop',location:'collection',cost:0,protected:false,lock:null};
    w.circulation[card.cardKey]={firstDay:1,source:'fixture'};
  }
  return w;
}
const step=(w,seconds=.25)=>{tickEconomy(w,catalog,{map:store,seconds});tickNpcTables(w,catalog,navigation,seconds);validateWorld(w);};
const until=(w,predicate,label,limit=4000)=>{for(let i=0;i<limit;i+=1){if(predicate())return i;step(w);}assert.fail(`闭环超时：${label}`);};

/** 每一步都要成立的钱包/实物不变量。 */
function invariants(w,stage){
  const refs=Object.keys(w.items);
  assert.equal(refs.length,new Set(refs).size,`${stage}：实物引用不能重复`);
  for(const [ref,item]of Object.entries(w.items)){
    assert.equal(item.inventoryRef,ref,`${stage}：${ref} 的 inventoryRef 必须与键一致`);
    assert.ok(typeof item.ownerId==='string'&&item.ownerId.length>0,`${stage}：${ref} 缺少归属`);
  }
  assert.ok(w.wallet.available>=0,`${stage}：玩家可用资金为负`);
  assert.ok((w.wallet.debt||0)>=0,`${stage}：供应商欠款为负`);
  assert.ok((w.wallet.escrowLiability||0)>=0,`${stage}：托管负债为负`);
  for(const npc of w.npcs){
    assert.ok((npc.wallet?.available??0)>=0,`${stage}：${npc.actorId} 可用资金为负`);
    assert.ok((npc.wallet?.reserved??0)>=0,`${stage}：${npc.actorId} 预留为负`);
  }
}

const w=fixture();
invariants(w,'开局');

// ---- 模拟比赛：注册 → 入座 → 结算一次 → 费用只收一次 ----
const startCash=w.wallet.available;
const startNpcCash=Object.fromEntries(w.npcs.map(n=>[n.actorId,n.wallet.available]));
until(w,()=>w.matches.some(m=>m.background&&m.simulated),'NPC 自动开桌');
const match=w.matches.find(m=>m.background&&m.simulated);
assert.equal(match.status!=='finished',true,'刚注册的模拟比赛不应已结束');
invariants(w,'开桌后');
assert.equal(w.wallet.available,startCash,'开桌只应预留对手费用，不能提前增加玩家收入');
for(const npc of w.npcs)assert.ok(npc.wallet.reserved>0,`${npc.actorId} 应预留桌费`);

until(w,()=>match.status==='finished','模拟比赛结算');
invariants(w,'结算后');
const settledEvents=w.log.filter(e=>e.type==='npcSimulationSettled'&&e.matchId===match.matchId);
assert.equal(settledEvents.length,1,'同一场模拟比赛只能结算一次');
const due=settledEvents[0].amount;
assert.equal(w.wallet.available-startCash,due,'玩家收入必须等于本场桌费合计');
for(const npc of w.npcs){
  assert.equal(npc.wallet.reserved,0,`${npc.actorId} 结算后不应残留预留`);
  assert.equal(startNpcCash[npc.actorId]-npc.wallet.available,due/2,`${npc.actorId} 只应支付自己那一半桌费`);
}
assert.equal(w.daily.service,due,'日账服务收入应等于本场桌费');
const table=w.tables.find(t=>t.tableId===match.tableId);
assert.equal(table.matchId,null,'结算后牌桌必须释放');

// ---- 离桌离店：走回店门并离开，不能留下行程或占用 ----
until(w,()=>[match.mineOwnerId,match.enemyOwnerId].every(id=>{const n=w.npcs.find(x=>x.actorId===id);return !onSite(n);}),'离桌并离店');
invariants(w,'离店后');
for(const id of [match.mineOwnerId,match.enemyOwnerId]){
  const npc=w.npcs.find(x=>x.actorId===id);
  assert.equal(npc.currentMatchId??null,null,`${id} 离店后不应仍绑着比赛`);
  assert.equal(npc.trip??null,null,`${id} 离店后不应残留行程`);
  assert.equal(npc.wallet.reserved,0,`${id} 离店后预留必须归零`);
  assert.equal(owned(w,id).length,3,`${id} 的实物归属不应在离店时丢失`);
}

// ---- 关店：清场，不留队列 ----
w.clock.phase='closed';
for(let i=0;i<40;i+=1)step(w);
invariants(w,'关店后');
assert.equal(w.npcs.filter(onSite).length,0,'关店后不应还有在场顾客');
assert.equal((w.matchQueue||[]).length,0,'关店后不应残留报名队列');
assert.equal(w.matches.filter(m=>m.status!=='finished').length,0,'关店后不应残留未结束比赛');

// ---- 跨日：新一天开门，没有隔夜行程/队列/比赛 ----
const dayBefore=w.clock.day;
w.clock.day+=1;w.clock.minute=480;w.clock.phase='closed';w.nextNpcMinute=0;
for(let i=0;i<40;i+=1)step(w);
invariants(w,'跨日');
assert.equal(w.clock.day,dayBefore+1);
assert.equal(w.npcs.filter(n=>n.trip).length,0,'跨日不应带隔夜行程');
assert.equal((w.matchQueue||[]).length,0,'跨日不应带隔夜队列');
assert.equal(w.matches.filter(m=>m.status!=='running'&&m.status!=='finished').length,0);
for(const npc of w.npcs)assert.equal(npc.wallet.reserved,0,`${npc.actorId} 跨日后预留必须归零`);

// ---- 存读档：同一份世界读回后关键状态一致 ----
const before={day:w.clock.day,cash:w.wallet.available,items:Object.keys(w.items).length,cards:Object.values(w.items).filter(i=>i.kind==='card').length,npcs:w.npcs.length,seed:w.seed};
const restored=await createRuntime({source,rules,maps:[store,room],repository:memoryRepository({schemaVersion:2,revision:0,world:structuredClone(w),archives:[],requests:{},legacyResetDone:true})});
await restored.connect({contractVersion:'card-shop-ui/1.0',clientId:'npc-day-loop'});
const back=restored.inspect().world;
invariants(back,'读档后');
assert.deepEqual({day:back.clock.day,cash:back.wallet.available,items:Object.keys(back.items).length,cards:Object.values(back.items).filter(i=>i.kind==='card').length,npcs:back.npcs.length,seed:back.seed},before,'读档后关键状态必须一致');
const queue=(await restored.query('combat.queue')).data;
assert.equal(queue.player,null,'读档后玩家不应凭空处于报名队列');
assert.equal((await restored.query('combat.rooms')).data.items.length,0,'读档后不应有残留房间');
await restored.disconnect();

console.log(`PASS NPC 营业闭环：模拟比赛结算一次且桌费各半、离桌离店不留行程、关店清场、跨日无隔夜队列、读档后 ${before.items} 件实物与资金一致`);
