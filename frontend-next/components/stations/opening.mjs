// FAST-06 · 拆包窗口候选：选库存与数量 → 一次确认 → 固定页结果。
// 组件只做一次 actions.openPacks(scope) 意图调用；正式流程的“取冻结预览→提交”、
// 随机、保底、库存扣减全部由主模型内部完成。响应未知时只提供“查看结果”，
// 不提供会新开第二批的重试按钮；结果一旦返回，翻页/返回选择/关闭重开都不再重新开包。
import { el, button, segmented, emptyState, muted, errorText, chip, rarityChip, stepper, packaging, art } from '../workspace/dom.mjs';
import { createFormatter } from '../workspace/format.mjs';
import { createOperationState, callAction, describeError } from '../workspace/ops.mjs';
import { injectF6Styles } from './styles.mjs';
import { paginate, pagerBar, createCapacity, pageSizeFor, pendingNotice, unwrapOperationResult } from './common.mjs';
import {productAlbum} from './product-album.mjs';

const MODES = [
  ['pack', '开一包', '选主题与包数，逐包计入一次结果。'],
  ['box', '开一盒', '拆开密封卡盒；盒内余包保持原内容。'],
  ['all', '全部打开', '一次开完全部可用散包；整盒需明确勾选。'],
];

export function mountOpening({ root, view, actions, draft = {}, layout, assets, format, notify = () => {} }) {
  const state = {
    mode: 'pack', productId: null, quantity: 1, boxQuantity: 1, includeBoxes: false,
    page: 0, result: null, lastResult: null,
    op: createOperationState(draft.operation), busy: false,
    ...draft, op: createOperationState(draft.operation), busy: false,
  };
  if (state.result && !Array.isArray(state.result.results)) state.result = null;
  if (state.lastResult && !Array.isArray(state.lastResult.results)) state.lastResult = null;
  let disposed = false;
  let pagingInfo = null;

  const main = el('div', { class: 'f6-main', 'data-opening-root': 'true' });
  const foot = el('div', { class: 'f6-foot' });
  const headMeta = el('div', { class: 'f6-head__meta' });
  const frame = el('section', { class: 'f6-root', 'aria-label': '拆包窗口' }, [
    el('header', { class: 'f6-head' }, [
      el('h2', { class: 'f6-head__title', text: '拆包' }),
      headMeta,
    ]),
    main, foot,
  ]);
  root.replaceChildren(frame);
  injectF6Styles(frame);

  const packs = () => (view.sealed || []).filter(g => g.kind === 'pack');
  const boxes = () => (view.sealed || []).filter(g => g.kind === 'box');
  const atOpening = () => view.atStation?.opening !== false;

  function currentGroup() {
    const list = state.mode === 'box' ? boxes() : packs();
    return list.find(g => g.groupId === state.productId) || null;
  }
  function ensureSelection(list) {
    if (state.mode === 'all') return;
    const options = list || (state.mode === 'box' ? boxes() : packs()).filter(g => g.available > 0);
    if (!state.productId || !options.some(g => g.groupId === state.productId)) {
      state.productId = options[0]?.groupId ?? null;
    }
  }

  // ── 一次确认：单笔 openPacks 意图；scope 表达范围，预览与提交由主模型内部完成 ──
  function buildScope() {
    if (state.mode === 'all') return { mode: 'all', includeBoxes: !!state.includeBoxes };
    const group = currentGroup();
    if (!group) return null;
    if (state.mode === 'box') return { mode: 'box', productId: group.productId, boxQuantity: state.boxQuantity, inventoryRefs: group.inventoryRefs };
    return { mode: 'pack', productId: group.productId, quantity: state.quantity, inventoryRefs: group.inventoryRefs };
  }

  async function confirmOpening() {
    if (state.busy || state.op.pending) return;
    const scope = buildScope();
    if (!scope) { notify('请先选择要开的库存。', 'error'); return; }
    if (scope.mode === 'pack' && (!Number.isSafeInteger(scope.quantity) || scope.quantity < 1)) { notify('开包数量应为 1 以上的整数。', 'error'); return; }
    if (scope.mode === 'box' && (!Number.isSafeInteger(scope.boxQuantity) || scope.boxQuantity < 1)) { notify('开盒数量应为 1 以上的整数。', 'error'); return; }
    if (!atOpening()) { notify('拆包需站在拆包台；请先到拆包台再确认。', 'info'); return; }
    const op = state.op.begin({ type: 'openPacks', payload: scope }, view.branchId);
    state.busy = true; paint();
    const result = await callAction(actions, 'openPacks', { scope, requestId: op.requestId });
    state.busy = false;
    state.op.finish(result, view.branchId);
    applyOpeningResult(result);
  }

  async function checkLastOperation() {
    if (state.busy || !state.op.pending) return;
    state.busy = true; paint();
    const raw = await callAction(actions, 'checkLastOperation', { requestId: state.op.current.requestId });
    state.busy = false;
    const result = unwrapOperationResult(raw);
    state.op.finish(result, view.branchId);
    applyOpeningResult(result);
  }

  function applyOpeningResult(result) {
    if (result.ok) {
      const opening = result.data?.opening && Array.isArray(result.data.opening.results) ? result.data.opening : result.data;
      if (!opening || !Array.isArray(opening.results)) {
        state.op.finish({ok:false,error:{code:'RESULT_UNKNOWN',message:'未收到完整开包结果。',retryable:true}},view.branchId);
        notify('未收到完整开包结果，请保留操作号并查看结果。', 'error');
      } else {
        state.result = opening;
        state.lastResult = opening;
        state.page = 0;
        notify('开包结果已返回：这批卡已写入收藏（结果为准，无需等待动画）。', 'success');
      }
    } else if (result.error?.code === 'RESULT_UNKNOWN') {
      notify('上次开包的结果尚未确定，请查看结果。', 'info');
    } else {
      notify(describeError(result.error), 'error');
    }
    paint();
  }

  // ── 渲染 ─────────────────────────────
  function paintHead() {
    const chips = [
      view.clock ? chip('第 ' + view.clock.day + ' 天') : null,
      chip('可用散包 ' + packs().reduce((n, g) => n + g.available, 0) + ' · 可用整盒 ' + boxes().reduce((n, g) => n + g.available, 0)),
      atOpening() ? null : chip('需站在拆包台', 'warn'),
    ].filter(Boolean);
    headMeta.replaceChildren(...chips);
  }

  function paint() {
    if (disposed) return;
    paintHead();
    main.replaceChildren();
    pagingInfo = computeChoosePaging();
    const pending = pendingNotice(state.op.current, { onCheck: checkLastOperation, busy: state.busy });
    if (state.result) paintResult(pending);
    else paintChoose(pending);
    paintFoot();
  }

  // 选择网格分页：结果阶段与“全部打开”没有分页列表；其余按当前档位收敛页号。
  function computeChoosePaging() {
    if (state.result || state.mode === 'all') return null;
    const size = 1;
    const list = (state.mode === 'box' ? boxes() : packs()).filter(g => g.available > 0);
    const paged = paginate(list, state.page, size);
    state.page = paged.page;
    return { ...paged, list };
  }

  function paintChoose(pending) {
    const body = el('div', { class: 'f6-scope' });
    if (pending) body.append(pending);
    if (state.lastResult) {
      body.append(el('div', { class: 'f6-scope__row' }, [
        muted('已保留上次开包结果（不会重复开包）。', 'f6-note'),
        button('查看上次结果', () => { state.result = state.lastResult; state.page = 0; paint(); }, { small: true }),
      ]));
    }
    body.append(segmented(MODES.map(m => [m[0], m[1]]), state.mode, id => {
      state.mode = id; state.productId = null; state.quantity = 1; state.boxQuantity = 1; state.page = 0; paint();
    }, '拆包范围'));
    body.append(muted(MODES.find(m => m[0] === state.mode)?.[2] || '', 'f6-note'));

    if (state.mode === 'all') {
      const packsTotal = packs().reduce((n, g) => n + g.available, 0);
      const boxesTotal = boxes().reduce((n, g) => n + g.available, 0);
      const check = el('input', { type: 'checkbox', 'aria-label': '包含密封卡盒', onchange: e => { state.includeBoxes = e.target.checked; paint(); } });
      check.checked = !!state.includeBoxes;
      body.append(el('div', { class: 'pbc-card' }, [
        el('h3', { text: '全部打开' }),
        el('div', { class: 'pbc-line' }, [el('span', { text: '可用散包' }), el('strong', { text: packsTotal + ' 包' })]),
        el('div', { class: 'pbc-line' }, [el('span', { text: '包含密封卡盒' }), el('strong', { text: state.includeBoxes ? boxesTotal + ' 盒' : '不包含' })]),
        el('label', { class: 'f6-check' }, [check, '包含密封卡盒' + (boxesTotal ? '（当前可用 ' + boxesTotal + ' 盒）' : '（没有可用整盒）')]),
        packsTotal + (state.includeBoxes ? boxesTotal : 0) === 0 ? errorText('当前范围内没有可拆的商品。') : null,
      ]));
      main.append(body);
      return;
    }

    if (!pagingInfo || !pagingInfo.list.length) {
      body.append(emptyState(
        state.mode === 'box' ? '没有可用整盒。' : '没有可用散包。',
        '先在采购窗口购买，或到仓库把库存送来；货架上的商品不在拆包范围。'));
      main.append(body);
      return;
    }
    ensureSelection(pagingInfo.list);
    body.append(scopeGrid(pagingInfo));
    main.append(body);
  }

  // 库存选择网格：分页选择真实组，选择按 groupId 保持，翻页/搜索不串行。
  function scopeGrid(paging) {
    state.productId=paging.rows[0]?.groupId||null;
    const grid = el('div', { class: 'f6-grid', 'data-scope-grid': 'true' });
    for (const g of paging.rows) grid.append(scopeTile(g));
    return grid;
  }

  function scopeTile(g) {
    const isSelected = state.productId === g.groupId;
    const artFrame = packaging(assets, g.productId, g.kind, (g.name || g.productId) + (g.kind === 'box' ? ' · 整盒' : ' · 散包'));
    artFrame.classList.add('f6-artframe');
    artFrame.style.width = g.kind === 'box' ? '84px' : '64px';
    artFrame.style.height = '88px';
    const tile = el('article', {
      class: 'f6-tile is-selectable' + (isSelected ? ' is-selected' : ''),
      role: 'button', tabindex: '0', 'aria-pressed': String(isSelected),
      'data-stock': g.groupId,
      onclick: () => { state.productId = g.groupId; paint(); },
      onkeydown: e => { if (e.target===e.currentTarget&&(e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); state.productId = g.groupId; paint(); } },
    }, [
      el('div', { class: 'f6-tile__head' }, [
        artFrame,
        el('div', { class: 'f6-tile__body' }, [
          el('strong', { class: 'f6-tile__name', text: (g.name || g.productId) + ' · ' + (g.kind === 'box' ? '整盒' : '散包') }),
          el('span', { class: 'f6-tile__spec', text: '可用 ' + g.available + ' · 仓内 ' + g.warehouse + (g.kind === 'box' && g.spec?.packsPerBox ? ' · 每盒 ' + g.spec.packsPerBox + ' 包' : '') }),
          el('div', { class: 'f6-tile__chips' }, [
            g.spec?.cardsPerPack ? chip('每包 ' + g.spec.cardsPerPack + ' 张') : null,
            g.retired ? chip('停产旧库存', 'warn') : null,
          ]),
        ]),
      ]),
      isSelected ? el('div', { class: 'f6-tile__foot' }, [
        state.mode === 'box'
          ? stepper({ value: state.boxQuantity, min: 1, max: g.available, label: '开盒数量', onChange: q => { state.boxQuantity = q; paint(); } })
          : stepper({ value: state.quantity, min: 1, max: g.available, label: '开包数量', onChange: q => { state.quantity = q; paint(); } }),
      ]) : null,
    ]);
    tile.classList.add('f6-product-detail');tile.append(productAlbum(g.productId,actions,g));return tile;
  }

  function paintResult(pending) {
    const result = state.result;
    const results = result.results || [];
    const size = Number.MAX_SAFE_INTEGER;
    const { rows, page, pages, total } = paginate(results, state.page, size);
    state.page = page;
    const rarity = result.byRarity || countRarity(results);
    const body = el('div', { class: 'f6-scope', 'data-opening-result': 'true' }, [
      pending || null,
      el('div', { class: 'pbc-card' }, [
        el('h3', { text: '开包结果 · 已写入收藏' }),
        el('div', { class: 'f6-scope__row' }, [
          el('strong', { text: '已开 ' + (result.packs ?? '?') + ' 包 · 共 ' + total + ' 种卡面（重复合并计数）' }),
          ['SSR', 'SR', 'R', 'N'].map(r => rarity.summary?.[r] || rarity[r] ? chip(r + ' × ' + (rarity.summary?.[r] ?? rarity[r] ?? 0)) : null),
        ]),
        view.demoNotice ? muted('结果来自演示 fixture（拟定 DTO，正式后端待接）。', 'f6-note') : muted('重复数量按同一卡面合并显示；卡面缺失时显示名称占位。', 'f6-note'),
      ]),
    ]);
    const stage = el('div', { class: 'f6-stage', 'data-result-grid': 'true' });
    for (const row of rows) stage.append(resultFrame(row));
    body.append(stage);
    main.append(body);
  }

  function resultFrame(row) {
    const copies = Number.isSafeInteger(row.copies) && row.copies > 1 ? row.copies : 1;
    const frameArt = art(row.imageUrl || null, row.name || row.cardKey);
    const frame = el('figure', { class: 'f6-frame', 'data-result-card': row.cardKey, 'data-card-key':row.cardKey, style: 'margin:0' }, [
      el('div', { class: 'f6-frame__badges' }, [rarityChip(row.printedRarity)]),
      copies > 1 ? el('span', { class: 'f6-frame__copies', text: '×' + copies }) : null,
      frameArt,
      el('figcaption', { class: 'f6-frame__name', text: row.name || row.cardKey }),
      row.isNew ? el('span', { class: 'f6-frame__meta', text: '新收录' }) : null,
    ]);
    return frame;
  }

  function countRarity(results) {
    const acc = { SSR: 0, SR: 0, R: 0, N: 0 };
    for (const row of results) {
      const copies = Number.isSafeInteger(row.copies) && row.copies > 1 ? row.copies : 1;
      if (row.printedRarity in acc) acc[row.printedRarity] += copies;
    }
    return acc;
  }

  function paintFoot() {
    if (state.result) {
      const results = state.result.results || [];
      const size = Number.MAX_SAFE_INTEGER;
      const { page, pages, total } = paginate(results, state.page, size);
      foot.replaceChildren(
        pagerBar({ page, pages, total, unit: '种卡面', onPage: next => { state.page = next; paint(); } }),
        el('span', { class: 'f6-foot__spacer' }),
        button('返回选择', () => { state.result = null; state.page = 0; paint(); }, { ghost: true }),
      );
      return;
    }
    const scope = buildScope();
    const nothingAll = scope?.mode === 'all'
      && packs().reduce((n, g) => n + g.available, 0) + boxes().reduce((n, g) => n + g.available, 0) === 0;
    const summary = !scope ? '先选择库存'
      : scope.mode === 'all'
        ? '全部可用散包' + (scope.includeBoxes ? '及整盒' : '') + '，一次开完'
        : scope.mode === 'box'
          ? '将开 ' + scope.boxQuantity + ' 盒（' + (scope.boxQuantity * (currentGroup()?.spec?.packsPerBox || 0) || '?') + ' 包，预估）'
          : '将开 ' + scope.quantity + ' 包（约 ' + (scope.quantity * (currentGroup()?.spec?.cardsPerPack || 0) || '?') + ' 张卡，预估）';
    const pager = pagingInfo
      ? pagerBar({ page: pagingInfo.page, pages: pagingInfo.pages, total: pagingInfo.total, unit: '组库存', onPage: next => { state.page = next; paint(); } })
      : null;
    foot.replaceChildren(
      ...(pager ? [pager] : []),
      el('span', { class: 'f6-foot__spacer' }),
      el('span', { class: 'f6-foot__total', 'data-opening-scope': scope ? scope.mode : '' }, [summary + ' · 一次确认']),
      button('确认开包', confirmOpening, { primary: true, disabled: !scope || nothingAll || state.busy || state.op.pending || !atOpening(), title: atOpening() ? undefined : '需站在拆包台' }),
    );
  }

  const capacity = createCapacity(frame, layout, () => paint());
  paint();
  return {
    update(nextView) {
      const previous = view.worldId + ':' + view.branchId;
      view = nextView;
      state.op.invalidate(view.branchId);
      if (view.worldId + ':' + view.branchId !== previous) {
        // 读档/换分支：已写入收藏的结果仍在存档里，但本窗口的未决操作已被 invalidate 标记为 stale。
        state.productId = null;
        state.result=null;state.lastResult=null;
        ensureSelection();
      }
      capacity.refresh?.();
      paint();
    },
    getDraft() {
      const { op } = state;
      return structuredClone({
        mode: state.mode, productId: state.productId, quantity: state.quantity, boxQuantity: state.boxQuantity,
        includeBoxes: state.includeBoxes, page: state.page, result: state.result, lastResult: state.lastResult,
        operation: op.current,
      });
    },
    setLayout(next) { Object.assign(layout = layout || {}, next || {}); capacity.refresh?.(); paint(); },
    dispose() { disposed = true; capacity.disconnect(); root.replaceChildren(); },
  };
}
