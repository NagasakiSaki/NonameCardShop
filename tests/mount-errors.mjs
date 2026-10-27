// tests/mount-errors.mjs — 牌局载入失败分类（OPT-06）。
//
// 目的：引擎超时/连不上（技术中断，可重试）必须与内核不兼容、状态不允许、
// 赛果冲突、玩家取消分开，否则界面只能把所有异常压成一句话，玩家也不知道该不该重试。
// 这里逐条钉住 integration/host-battle.mjs 与 integration/modes/mount.mjs 实际抛出的 code。
import assert from 'node:assert/strict';
import {classifyMountError,mountErrorAction,MOUNT_ERROR_KINDS} from '../frontend/combat/mount-errors.mjs';

const cases=[
  // 技术中断：可重试，阵容与比分保留
  ['ENGINE_TIMEOUT','technical',true],
  ['ENGINE_ERROR','technical',true],
  ['ENGINE_UNAVAILABLE','technical',true],
  ['NOT_READY','technical',true],
  ['BUSY','technical',true],
  ['RESULT_UNKNOWN','technical',true],
  // 内核不兼容：重试不会变好
  ['FEATURE_UNAVAILABLE','incompatible',false],
  ['PROFILE_MISMATCH','incompatible',false],
  // 状态不允许：按提示操作
  ['RECOVERY_REQUIRED','state',false],
  ['MATCH_ACTIVE','state',false],
  ['INVALID_STATE','state',false],
  ['SHOP_CLOSED','state',false],
  ['NOT_ELIGIBLE','state',false],
  ['INVALID_INPUT','state',false],
  ['NOT_TEAMMATE','state',false],
  ['INVALID_CONTROL','state',false],
  ['STALE_EVENT','state',false],
  // 赛果冲突：不能当胜利
  ['RESULT_CONFLICT','conflict',false],
  // 玩家自己取消：不是失败
  ['MOUNT_CANCELLED','cancelled',false],
  ['WINDOW_CLOSED','cancelled',false],
];

for(const [code,kind,retryable] of cases){
  const info=classifyMountError(Object.assign(new Error('原始信息'),{code}));
  assert.equal(info.code,code);
  assert.equal(info.known,true,`${code} 应被登记`);
  assert.equal(info.kind,kind,`${code} 分类应为 ${kind}，实际 ${info.kind}`);
  assert.equal(info.retryable,retryable,`${code} 可重试应为 ${retryable}`);
  assert.ok(MOUNT_ERROR_KINDS.includes(info.kind));
  assert.ok(info.title.length>0&&info.detail.length>0,`${code} 必须有面向玩家的标题与说明`);
}

// 只有技术中断给“重试载入”；其余不给重试按钮，避免反复点坏掉的入口。
assert.deepEqual(mountErrorAction(classifyMountError({code:'ENGINE_TIMEOUT'})),{id:'retry',label:'重试载入'});
for(const code of ['FEATURE_UNAVAILABLE','PROFILE_MISMATCH','RECOVERY_REQUIRED','RESULT_CONFLICT']){
  assert.equal(mountErrorAction(classifyMountError({code})),null,`${code} 不应提供重试`);
}
assert.equal(mountErrorAction(classifyMountError({code:'MOUNT_CANCELLED'})),null,'玩家取消不算失败');

// 没有 code 的异常：网络类按技术问题处理并保留原文，其余不假装可重试。
const network=classifyMountError(new Error('Failed to fetch'));
assert.equal(network.kind,'technical');assert.equal(network.retryable,true);assert.equal(network.known,false);
assert.equal(network.detail,'Failed to fetch');
const opaque=classifyMountError(new Error('窗口渲染失败：undefined'));
assert.equal(opaque.kind,'unknown');assert.equal(opaque.retryable,false);
assert.equal(classifyMountError(undefined).title,'牌局载入失败','空异常也要有可读标题');

console.log(`PASS 牌局载入失败分类：${cases.length} 个真实错误码分入 technical/incompatible/state/conflict/cancelled，只有技术中断提供重试`);
