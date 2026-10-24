// FAST-06 · 仓库窗口候选：真实密封盒/包库存分页 + 选择后表达“去货架 / 去拆包台”的意图。
// 只读展示：数量、可用、在架、保护、占用全部来自 view；不创建库存、不远程开包、
// 不做任何绕过站位的操作。新档赠送说明只转述 view.newcomerGift，组件不发礼包。
import { el, button, segmented, emptyState, muted, chip, packaging } from '../workspace/dom.mjs';
import { createFormatter } from '../workspace/format.mjs';
import { callAction, describeError } from '../workspace/ops.mjs';
import { injectF6Styles } from './styles.mjs';
import { paginate, pagerBar, createCapacity, pageSizeFor } from './common.mjs';

const KINDS = [['all', '全部'], ['pack', '散包'], ['box', '卡盒']];

export function mountWarehouse({ root, view, actions, draft = {}, layout, assets, format, notify = () => {} }) {
  const money = createFormatter(format);
  const state = {
    kind: 'all', search: '', page: 0, selectedKey: null,
    ...draft,
  };
  let disposed = false;

  const main = el('div', { class: 'f6-main', 'data-warehouse-root': 'true' });
  const foot = el('div', { class: 'f6-foot' });
  const headMeta = el('div', { class: 'f6-head__meta' });
  const frame = el('section', { class: 'f6-root', 'aria-label': '仓库窗口' }, [
    el('header', { class: 'f6-head' }, [
      el('h2', { class: 'f6-head__title', text: '仓库' }),
      headMeta,
    ]),
    main, foot,
  ]);
  root.replaceChildren(frame);
  injectF6Styles(frame);

  const groups = () => view.sealed || [];
  const byKey = key => groups().find(g => g.groupId === key) || null;
  const selected = () => byKey(state.selectedKey);

  function visibleGroups() {
    const q = state.search.trim();
    return groups().filter(g => (state.kind === 'all' || g.kind === state.kind)
      && (!q || String(g.name || '').includes(q)));
  }

  function select(key) {
    state.selectedKey = state.selectedKey === key ? null : key;
    paint();
  }

  // ── 意图动作：只把选择交回主模型，由主模型完成路由、暂停交接与后续操作 ──
  async function intent(name, args, label) {
    const group = selected();
    if (!group) { notify('先选择一组库存。', 'info'); return; }
    const result = await callAction(actions, name, {
      productId: group.productId, kind: group.kind, inventoryRefs: group.inventoryRefs, quantity: group.available,
      ...args,
    });
    if(!disposed)notify(result.ok ? label : describeError(result.error), result.ok ? 'success' : 'error');
    paint();
  }
  const goRetail = () => intent('goToRetail', {}, '送去货架');
  const goOpening = () => intent('goToOpening', {}, '去拆包台');

  function paintHead() {
    const totals = groups().reduce((acc, g) => {
      acc.warehouse += g.warehouse || 0; acc.available += g.available || 0; acc.onShelf += g.onShelf || 0;
      return acc;
    }, { warehouse: 0, available: 0, onShelf: 0 });
    const chips = [
      view.clock ? chip('第 ' + view.clock.day + ' 天') : null,
      chip('仓内 ' + totals.warehouse + ' · 可用 ' + totals.available + ' · 在架 ' + totals.onShelf),
    ].filter(Boolean);
    headMeta.replaceChildren(...chips);
  }

  function paint() {
    if (disposed) return;
    paintHead();
    main.replaceChildren();
    if (view.newcomerGift?.note || view.newcomerGift?.title) {
      main.append(el('div', { class: 'f6-receipt', 'data-newcomer-gift': 'true', style: 'margin-bottom:10px' }, [
        el('div', { class: 'f6-receipt__title', text: view.newcomerGift.title || '新店赠礼' }),
        muted(view.newcomerGift.note || '', 'f6-note'),
        view.demoNotice ? muted('赠送内容来自演示输入，正式后端待接。', 'f6-note') : null,
      ]));
    }
    main.append(paintToolbar(), el('div', { style: 'height:10px' }), paintGrid());
    paintFoot();
  }

  function paintToolbar() {
    return el('div', { class: 'f6-scope__row' }, [
      segmented(KINDS, state.kind, id => { state.kind = id; state.page = 0; paint(); }, '库存类型'),
      el('input', {
        class: 'f6-select', type: 'search', value: state.search, placeholder: '搜索主题…',
        'aria-label': '搜索仓库主题', style: 'flex:1;min-width:140px;max-width:280px',
        oninput: e => { state.search = e.target.value; state.page = 0; paintGridOnly(); },
      }),
    ]);
  }

  function paintGridOnly() {
    if (disposed) return;
    const grid = main.querySelector('[data-warehouse-grid]');
    if (grid) grid.replaceWith(paintGrid());
    paintFoot();
  }

  function paintGrid() {
    const list = visibleGroups();
    const size = Number.isSafeInteger(layout?.pageSize) ? layout.pageSize : pageSizeFor(capacity.tier, layout?.pageSizes);
    const { rows, page, total } = paginate(list, state.page, size);
    state.page = page;
    const grid = el('div', { class: 'f6-grid', 'data-warehouse-grid': 'true' });
    if (!total) {
      grid.append(emptyState(
        groups().length ? '没有符合筛选的库存。' : '仓库还没有密封商品。',
        groups().length ? '可切换类型或清空搜索。' : (view.newcomerGift ? '按新店赠礼先去采购，或等待赠送到账。' : '在采购窗口完成购买后，货物会直接出现在这里。'),
      ));
    }
    for (const g of rows) grid.append(groupTile(g));
    return grid;
  }

  function groupTile(g) {
    const art = packaging(assets, g.productId, g.kind, (g.name || g.productId) + (g.kind === 'box' ? ' · 整盒' : ' · 散包'));
    art.classList.add('f6-artframe');
    art.style.width = g.kind === 'box' ? '84px' : '64px';
    art.style.height = '88px';
    const isSelected = state.selectedKey === g.groupId;
    const tile = el('article', {
      class: 'f6-tile is-selectable' + (isSelected ? ' is-selected' : ''),
      role: 'button', tabindex: '0', 'aria-pressed': String(isSelected),
      'data-stock': g.groupId,
      onclick: () => select(g.groupId),
      onkeydown: e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(g.groupId); } },
    }, [
      el('div', { class: 'f6-tile__head' }, [
        art,
        el('div', { class: 'f6-tile__body' }, [
          el('strong', { class: 'f6-tile__name', text: (g.name || g.productId) + ' · ' + (g.kind === 'box' ? '整盒' : '散包') }),
          el('span', { class: 'f6-tile__spec', text: '仓内 ' + (g.warehouse ?? 0) + ' · 可用 ' + (g.available ?? 0) + ' · 在架 ' + (g.onShelf ?? 0) }),
          el('div', { class: 'f6-tile__chips' }, [
            g.protected ? chip('保护 ' + g.protected) : null,
            g.locked ? chip('占用 ' + g.locked, 'warn') : null,
            g.retired ? chip('停产旧库存', 'warn') : null,
            g.suggestedRetail ? chip('建议售 ' + money(g.suggestedRetail)) : null,
          ]),
        ]),
      ]),
      isSelected ? el('div', { class: 'f6-tile__foot' }, [
        button('送去货架（意图）', event => { event.stopPropagation(); goRetail(); }, { small: true, disabled: !g.available }),
        button('去拆包台（意图）', event => { event.stopPropagation(); goOpening(); }, { small: true, primary: true, disabled: !g.available }),
      ]) : null,
      g.available === 0 ? muted('没有可用件：被保护、占用或已在架。', 'f6-note') : null,
    ]);
    return tile;
  }

  function paintFoot() {
    const group = selected();
    const list = visibleGroups();
    const size = Number.isSafeInteger(layout?.pageSize) ? layout.pageSize : pageSizeFor(capacity.tier, layout?.pageSizes);
    const { page, pages, total } = paginate(list, state.page, size);
    foot.replaceChildren(
      pagerBar({ page, pages, total, unit: '组库存', onPage: next => { state.page = next; paint(); } }),
      el('span', { class: 'f6-foot__spacer' }),
      el('span', { class: 'f6-foot__total', 'data-warehouse-selection': group ? group.groupId : '' },
        group ? ['已选：', el('strong', { text: (group.name || group.productId) + ' · 可用 ' + group.available })] : ['点选一组库存后，选择去向（只表达意图）']),
      button('送去货架', goRetail, { disabled: !group || !group.available }),
      button('去拆包台开包', goOpening, { primary: true, disabled: !group || !group.available }),
    );
  }

  const capacity = createCapacity(frame, layout, () => paint());
  paint();
  return {
    update(nextView) {
      view = nextView;
      if (state.selectedKey && !byKey(state.selectedKey)) state.selectedKey = null;
      capacity.refresh?.();
      paint();
    },
    getDraft() { return structuredClone({ kind: state.kind, search: state.search, page: state.page, selectedKey: state.selectedKey }); },
    setLayout(next) { Object.assign(layout = layout || {}, next || {}); capacity.refresh?.(); paint(); },
    dispose() { disposed = true; capacity.disconnect(); root.replaceChildren(); },
  };
}
