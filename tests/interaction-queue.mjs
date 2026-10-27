// tests/interaction-queue.mjs — 对话打断点击意图的记住/取回/丢弃（OPT-07）。
//
// 场景：玩家点柜台开始走过去，场景对话主动弹出。窗口不能盖在对话上，
// 但点击意图不能凭空消失。规则：
//   - 仍被挡（对话或窗口还在）→ 保留，下次再试；
//   - 换世界/分支 → 丢弃，绝不跨档重放；
//   - 可执行 → 只取回一次。
import assert from 'node:assert/strict';
import {createInteractionQueue} from '../frontend/world/interaction-queue.mjs';

const counter={id:'store.counter',panel:'supplier',panelOptions:{tab:'order'}};
const retail={id:'store.retail',panel:'supplier'};

// 1. 空队列
let queue=createInteractionQueue({branchOf:()=>'w1:b1'});
assert.deepEqual(queue.take({}),{status:'empty'});
assert.equal(queue.push(null),false,'空交互不入队');
assert.deepEqual(queue.take({}),{status:'empty'});

// 2. 被挡时保留，解除后只执行一次
queue=createInteractionQueue({branchOf:()=>'w1:b1'});
assert.equal(queue.push(counter),true);
assert.deepEqual(queue.take({blocked:true}),{status:'blocked'});
assert.ok(queue.pending,'被挡时必须保留意图');
assert.deepEqual(queue.take({blocked:false}),{status:'ready',interaction:counter});
assert.equal(queue.pending,null,'取回后必须清空');
assert.deepEqual(queue.take({blocked:false}),{status:'empty'},'同一意图不能执行两次');

// 3. 换分支丢弃，不跨档重放
let branch='w1:b1';
queue=createInteractionQueue({branchOf:()=>branch});
queue.push(counter);
branch='w1:b2';
assert.deepEqual(queue.take({}),{status:'stale'});
assert.equal(queue.pending,null,'跨分支必须丢弃');

// 4. 世界变化也算跨档
branch='w2:b1';
queue=createInteractionQueue({branchOf:()=>branch});
queue.push(counter);
branch='w3:b1';
assert.deepEqual(queue.take({}),{status:'stale'});

// 5. 显式 branch 优先于回调（读取时用当前值比较）
queue=createInteractionQueue({branchOf:()=>'w1:b1'});
queue.push(retail,{branch:'w9:b9'});
assert.deepEqual(queue.take({branch:'w1:b1'}),{status:'stale'});

// 6. 后一次点击覆盖前一次（一次只记一个）
queue=createInteractionQueue({branchOf:()=>'w1:b1'});
queue.push(counter);queue.push(retail);
assert.deepEqual(queue.take({}),{status:'ready',interaction:retail});

// 7. clear 用于销毁/换档
queue=createInteractionQueue({branchOf:()=>'w1:b1'});
queue.push(counter);queue.clear();
assert.deepEqual(queue.take({}),{status:'empty'});

console.log('PASS 交互意图队列：被挡保留、解除后只执行一次、换世界或分支丢弃、后点覆盖先点');
