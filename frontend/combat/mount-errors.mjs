// frontend/combat/mount-errors.mjs — 把牌局载入失败分成“技术中断 / 内核不兼容 / 状态不允许 / 已取消”，
// 让界面给出不同的下一步，而不是把所有异常都压成一句话。
//
// 依据：integration/host-battle.mjs 与 integration/modes/mount.mjs 实际抛出的 code。
// 关键区别（OPT-06 验收）：
//   technical   —— 引擎超时/连接失败/尚未就绪：同一局可以重试，阵容与比分不动；
//   incompatible—— 内核版本或 profile 不匹配：重试不会变好，需要换版本或换赛制；
//   state       —— 当前世界状态不允许（未开门、已有比赛、需要先重开小局）：要按提示操作；
//   cancelled   —— 玩家自己关窗/取消：不是失败，不打扰；
//   conflict    —— 同一小局收到不同赛果：不能当胜利，也不能自动重开。
export const MOUNT_ERROR_KINDS = Object.freeze(['technical','incompatible','state','cancelled','conflict','unknown']);

const TABLE = Object.freeze({
  // 技术中断：可重试，已结算的小局不重算
  ENGINE_TIMEOUT: { kind: 'technical', title: '牌局载入超时', detail: '引擎没有在限定时间内就绪。阵容和比分已保留，可以重试载入。', retryable: true },
  ENGINE_ERROR: { kind: 'technical', title: '引擎报告错误', detail: '原版引擎在小局中途报错。本局不会记为胜利，可以重试或重开当前小局。', retryable: true },
  ENGINE_UNAVAILABLE: { kind: 'technical', title: '引擎服务不可用', detail: '本地引擎没有启动或版本不匹配。确认启动器仍在运行后重试。', retryable: true },
  NOT_READY: { kind: 'technical', title: '牌局尚未就绪', detail: '引擎还没准备好接受操作，稍等片刻再重试。', retryable: true },
  BUSY: { kind: 'technical', title: '上一次操作还没结束', detail: '等上一个请求返回后再重试。', retryable: true },
  RESULT_UNKNOWN: { kind: 'technical', title: '结果尚未确认', detail: '没有收到确定回执。请先核对原操作，再决定是否重试。', retryable: true },

  // 内核不兼容：重试无效
  FEATURE_UNAVAILABLE: { kind: 'incompatible', title: '当前内核不支持该模式', detail: '这个原生模式与已安装的引擎版本不匹配。换一种赛制，或按维护文档升级引擎后再战。', retryable: false },
  PROFILE_MISMATCH: { kind: 'incompatible', title: '原生配置不匹配', detail: '引擎报告的席位控制状态与计划不一致，已拒绝开局。这不是你的操作问题，请报告该赛制与阵容。', retryable: false },

  // 状态不允许：按提示操作
  RECOVERY_REQUIRED: { kind: 'state', title: '需要先重开当前小局', detail: '上一小局被中断，请先在中断面板重开或放弃系列赛。', retryable: false },
  MATCH_ACTIVE: { kind: 'state', title: '已经有一场进行中的比赛', detail: '先结束或取消当前比赛，再开新的一局。', retryable: false },
  INVALID_STATE: { kind: 'state', title: '当前状态不能开局', detail: '请按界面提示回到选将或重开小局。', retryable: false },
  SHOP_CLOSED: { kind: 'state', title: '当前不在营业时间', detail: '开门营业后才能开始比赛。', retryable: false },
  NOT_ELIGIBLE: { kind: 'state', title: '阵容不满足参赛条件', detail: '请重新选择可用且未锁定的武将。', retryable: false },
  INVALID_INPUT: { kind: 'state', title: '提交内容不完整', detail: '重新选择赛制与阵容后再试。', retryable: false },
  NOT_TEAMMATE: { kind: 'state', title: '只能接管己方队友', detail: '接管请求被拒绝，当前操控不变。', retryable: false },
  INVALID_CONTROL: { kind: 'state', title: '接管请求不合法', detail: '请重新点击接管按钮。', retryable: false },
  STALE_EVENT: { kind: 'state', title: '收到过期的牌局事件', detail: '该事件不属于当前小局，已忽略。', retryable: false },

  // 冲突：不能当胜利
  RESULT_CONFLICT: { kind: 'conflict', title: '同一小局收到不同赛果', detail: '为避免把冲突结果当成胜利，本局已停止结算。请重开当前小局或放弃系列赛。', retryable: false },

  // 玩家自己取消
  MOUNT_CANCELLED: { kind: 'cancelled', title: '已取消载入', detail: '窗口已关闭或已取消，没有产生失败记录。', retryable: false },
  WINDOW_CLOSED: { kind: 'cancelled', title: '窗口已关闭', detail: '重新打开对战房间即可继续。', retryable: false },
});

/**
 * @param {unknown} error 抛出的异常（可能没有 code）
 * @returns {{code:string,kind:string,title:string,detail:string,retryable:boolean,known:boolean}}
 */
export function classifyMountError(error) {
  const code = typeof error?.code === 'string' ? error.code : '';
  const row = TABLE[code];
  if (row) return { code, known: true, ...row };
  const message = typeof error?.message === 'string' && error.message.trim() ? error.message.trim() : '未知错误';
  // 没有 code 的异常通常来自 fetch/JSON 解析等环境问题，按技术问题处理但保留原文。
  const looksNetwork = /fetch|network|json|Failed to fetch|Load failed/i.test(message);
  return {
    code: code || 'UNCLASSIFIED',
    known: false,
    kind: looksNetwork ? 'technical' : 'unknown',
    title: looksNetwork ? '与引擎通信失败' : '牌局载入失败',
    detail: message,
    retryable: looksNetwork,
  };
}

/**
 * 界面用：只有“技术中断”给“重试载入”。不兼容/状态/冲突重试不会变好，
 * 所以不给重试按钮，避免玩家反复点同一个坏掉的入口。
 */
export function mountErrorAction(info) {
  if (!info || info.kind === 'cancelled') return null;
  return info.retryable ? { id: 'retry', label: '重试载入' } : null;
}
