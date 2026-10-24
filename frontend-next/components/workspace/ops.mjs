// PLAY-B 展示层：业务操作结果处理。候选组件只表达“操作意图”，真实提交、requestId、
// quoteId/previewId、事务与暂停令牌都由主模型的正式适配层承担。这里约定四类结果：
// 成功 / 业务失败 / 结果未知（RESULT_UNKNOWN，保留原号查询或重试）/ 失效（分支变化）。
import { el, button, spinner } from './dom.mjs';

export function ok(data, note) { return { ok: true, data, note }; }
export function fail(code, message, extra = {}) { return { ok: false, error: { code, message, retryable: false, ...extra } }; }
export const unknown = message => fail('RESULT_UNKNOWN', message, { retryable: true });

// 统一调用注入回调：不抛异常，全部归一成 {ok,error|data}。
export async function callAction(actions, name, args) {
  const fn = actions?.[name];
  if (typeof fn !== 'function') return fail('NO_ACTION', '预览未提供「' + name + '」回调，正式接入时由适配层绑定。');
  try {
    const result = await fn(args);
    if (result && typeof result.ok === 'boolean') return result;
    return fail('BAD_RESULT', '回调返回值不是 {ok} 形态，请检查 Mock。');
  } catch (error) {
    return fail('RESULT_UNKNOWN', '未收到确定结果，请用原操作号查询：' + (error?.message || error), { retryable: true });
  }
}

// 每个组件草稿里跟踪一笔未决操作；关闭组件不等于结果消失，重开可凭同一 requestId 续查。
export function createOperationState(initial=null) {
  let seq = 0;
  return {
    current: initial?structuredClone(initial):null,
    get pending() { return this.current && ['submitting', 'unknown'].includes(this.current.status); },
    begin(request, branchId) {
      const requestId = request.requestId || 'trade-'+crypto.randomUUID();
      this.current = { ...structuredClone(request), requestId, status: 'submitting', branchId, result: null };
      return this.current;
    },
    finish(result, branchId) {
      const op = this.current;
      if (!op) return;
      if (branchId !== op.branchId) { op.status = 'stale'; op.result = fail('STALE_OPERATION', '操作返回时进度分支已变化，请刷新后重新确认。'); return; }
      op.result = result;
      op.status = result.ok ? 'succeeded'
        : result.error?.code === 'RESULT_UNKNOWN' ? 'unknown'
        : result.error?.code === 'STALE_OPERATION' ? 'stale' : 'failed';
    },
    invalidate(branchId) {
      const op = this.current;
      if (op && branchId !== op.branchId) { op.status = 'stale'; op.result = fail('STALE_OPERATION', '读档前的操作不可在新分支重放，请重新确认当前库存。'); }
    },
    clear() { this.current = null; },
  };
}

// “结果未知 / 正在提交”提示块：始终亮出操作号，提供查询与原号重试两个入口。
export function pendingBlock(op, { onQuery, onRetry, busy = false }) {
  if (!op || !['submitting', 'unknown'].includes(op.status)) return null;
  return el('section', { class: 'pbc-pending', 'data-pending-operation': op.requestId }, [
    el('h4', { text: op.status === 'submitting' ? '正在确认操作…' : '上次操作结果尚未确定' }),
    el('p', { class: 'pbc-muted', text: '业务结果未知时不能重复发起同类操作，否则可能重复扣款或重复生成卡牌。' }),
    el('p', {}, [el('code', { text: '操作号 ' + op.requestId })]),
    el('div', { class: 'pbc-actions' }, [
      busy ? spinner() : null,
      button('查询原操作结果', onQuery, { disabled: busy }),
      button('使用原操作号重试', onRetry, { disabled: busy || op.status !== 'unknown' }),
    ]),
  ]);
}

// 统一的“结果未知”恢复：查询 operations.get 或原号重试，都归一成原始命令结果。
// 正式接入时 queryOperation/retryOperation 由适配层绑定 operations.get 与原请求重发。
export async function queryOperationResult(state, actions, branchId) {
  const op = state.current;
  if (!op) return fail('NO_OPERATION', '没有待确认的操作。');
  const r = await callAction(actions, 'queryOperation', { requestId: op.requestId });
  if (branchId !== op.branchId) return fail('STALE_OPERATION', '查询期间进度分支已变化，请重新确认当前库存。');
  if (!r.ok) return r;
  const data = r.data || {};
  if (data.status === 'succeeded' || data.status === 'failed') {
    if (!data.result || typeof data.result.ok !== 'boolean') return fail('VIEW_CONTRACT', '操作查询缺少原始结果，不能认定交易已完成。');
    return data.result;
  }
  if (data.status === 'stale') return fail('STALE_OPERATION', '该操作属于另一条进度分支。');
  return fail('RESULT_UNKNOWN', '尚无已提交记录；可以稍后再次查询，或用原操作号重试。', { retryable: true });
}
export async function retryOperationResult(state, actions) {
  const op = state.current;
  if (!op) return fail('NO_OPERATION', '当前没有需要原号重试的操作。');
  return callAction(actions, 'retryOperation', { requestId: op.requestId, type: op.type, payload: op.payload, quoteId: op.quoteId, previewId: op.previewId });
}

// 失败文案：业务失败直接展示 code + message；RESULT_UNKNOWN 走 pending 块。
export function describeError(error) {
  if (!error) return '操作失败。';
  return '[' + (error.code || 'ERROR') + '] ' + (error.message || '操作失败。');
}
