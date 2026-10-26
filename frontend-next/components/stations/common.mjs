// FAST-06 包内共享展示层：分页条、页容量、结果未知提示块。
// 纯 DOM、无全局副作用；正式 dom/ops 助手按运行基线复用，不复制其实现。
import { el, button, spinner } from '../workspace/dom.mjs';

// ── 页切片：页号越界时收敛到最后一页（尾页删除/搜索缩量不丢当前真实行） ──
export function paginate(rows, page, size) {
  const pages = Math.max(1, Math.ceil(rows.length / size));
  const current = Math.min(pages - 1, Math.max(0, Number.isFinite(page) ? Math.floor(page) : 0));
  return { rows: rows.slice(current * size, (current + 1) * size), page: current, pages, total: rows.length };
}

// ── 分页条：首页/上一页/页码/下一页/末页/跳页；按钮名固定，验收脚本按名字可达 ──
export function pagerBar({ page, pages, total, unit = '条', onPage }) {
  const bar = el('nav', { class: 'f6-pager', 'aria-label': '分页' }, [
    el('span', { class: 'f6-pager__info', 'data-pager-total': String(total), text: '共 ' + total + ' ' + unit + (pages>1?' · 第 ' + (page + 1) + ' / ' + pages + ' 页':'') }),
  ]);
  if(pages<=1)return bar;
  const go = next => { if (next !== page && next >= 0 && next <= pages - 1) onPage(next); };
  bar.append(
    button('首页', () => go(0), { small: true, disabled: page === 0 }),
    button('上一页', () => go(page - 1), { small: true, disabled: page === 0 }),
    button('下一页', () => go(page + 1), { small: true, disabled: page + 1 >= pages }),
    button('末页', () => go(pages - 1), { small: true, disabled: page + 1 >= pages }),
  );
  if (pages > 6) {
    const jump = el('input', {
      class: 'f6-pager__jump', type: 'number', min: 1, max: pages, step: 1,
      value: page + 1, 'aria-label': '跳至页码',
      onkeydown: e => { if (e.key === 'Enter') go(Number(e.target.value) - 1); },
      onchange: e => { go(Number(e.target.value) - 1); e.target.value = ''; },
    });
    bar.append(el('label', { class: 'f6-pager__info' }, ['跳至 ', jump, ' 页']));
  }
  return bar;
}

// ── 页容量档位：主模型接入时可传 layout={tier} 或 {pageSize} 固定；默认按根宽自适应 ──
export function createCapacity(root, layout, onChange) {
  if (layout?.pageSize || layout?.tier) {
    const tier = layout.tier || 'wide';
    root.dataset.cap = tier;
    return { get tier() { return tier; }, disconnect() {} };
  }
  let current = null;
  const measure = () => {
    const width = root.clientWidth || 960;
    return width >= 1100 ? 'wide' : width >= 700 ? 'mid' : 'narrow';
  };
  const apply = () => {
    const next = measure();
    if (next === current) return;
    const first = current === null;
    current = next;
    root.dataset.cap = next;
    if (!first) onChange?.(next);
  };
  apply();
  const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(apply) : null;
  observer?.observe(root);
  return {
    get tier() { return current; },
    refresh: apply,
    disconnect() { observer?.disconnect(); },
  };
}

export function pageSizeFor(tier, sizes) {
  return ({ wide: 6, mid: 4, narrow: 2, ...sizes })[tier] ?? 6;
}

// ── 结果未知块：只有“查看结果”（查询原操作号），不提供会新开第二批的重试按钮 ──
export function pendingNotice(op, { onCheck, busy = false }) {
  if (!op || !['submitting', 'unknown'].includes(op.status)) return null;
  return el('section', { class: 'f6-pending', 'data-pending-operation': op.requestId }, [
    el('h4', { text: op.status === 'submitting' ? '正在确认上次操作…' : '上次操作结果尚未确定' }),
    el('p', { class: 'f6-note', text: '上次操作还在确认中，请先查看结果。',title:'操作号 '+op.requestId }),
    el('div', { class: 'f6-pager' }, [
      busy ? spinner() : null,
      button('查看结果', onCheck, { disabled: busy, primary: true }),
    ]),
  ]);
}

// ── 归一 checkLastOperation 返回值：既接受原始命令结果，也接受 operations.get 的 {status,result} 包装 ──
export function unwrapOperationResult(result) {
  if (!result || typeof result.ok !== 'boolean') {
    return { ok: false, error: { code: 'VIEW_CONTRACT', message: '操作查询返回缺少 {ok} 形态。', retryable: false } };
  }
  if (result.ok && result.data && typeof result.data.status === 'string') {
    if ((result.data.status === 'succeeded' || result.data.status === 'failed') && typeof result.data.result?.ok === 'boolean') return result.data.result;
    if (result.data.status === 'stale') {
      return { ok: false, error: { code: 'STALE_OPERATION', message: '该操作属于另一条进度分支。', retryable: false } };
    }
    return { ok: false, error: { code: 'RESULT_UNKNOWN', message: '尚无已提交记录；可以稍后再次查看结果。', retryable: true } };
  }
  return result;
}
