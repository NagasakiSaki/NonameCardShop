// FAST-06 · 采购窗口候选：商品分页 + 购物篮 + 一次购买动作。
// 只表达 UI 意图：金额只显示 view 给出的目录单价并标明“预估”，权威金额以 actions.purchase
// 的返回为准；组件不做报价、扣款、入库等任何经济计算。响应未知时保留购物篮，
// 只提供“查看结果”（查询原操作号），不提供会新开第二批的重试按钮。
import { el, button, segmented, emptyState, muted, errorText, chip, stepper, packaging } from '../workspace/dom.mjs';
import { createFormatter } from '../workspace/format.mjs';
import { createOperationState, callAction, describeError } from '../workspace/ops.mjs';
import { injectF6Styles } from './styles.mjs';
import { paginate, pagerBar, createCapacity, pageSizeFor, pendingNotice, unwrapOperationResult } from './common.mjs';
import {productAlbum} from './product-album.mjs';

const UNITS = [['pack', '散包'], ['box', '密封卡盒']];
const MAX_PER_LINE = 20;

export function mountPurchase({ root, view, actions, draft = {}, layout, assets, format, notify = () => {} }) {
  const money = createFormatter(format);
  const state = {
    unit: 'pack', search: '', basket: {}, page: 0, receipt: null,showBasket:false,basketPage:0,
    op: createOperationState(draft.operation), busy: false,
    ...draft, op: createOperationState(draft.operation), busy: false,
  };
  if (!state.basket || typeof state.basket !== 'object' || Array.isArray(state.basket)) state.basket = {};
  let disposed = false;

  const main = el('div', { class: 'f6-main', 'data-purchase-root': 'true' });
  const foot = el('div', { class: 'f6-foot' });
  const headMeta = el('div', { class: 'f6-head__meta' });
  const frame = el('section', { class: 'f6-root', 'aria-label': '采购窗口' }, [
    el('header', { class: 'f6-head' }, [
      el('h2', { class: 'f6-head__title', text: '采购' }),
      headMeta,
    ]),
    main, foot,
  ]);
  root.replaceChildren(frame);
  injectF6Styles(frame);

  const priceOf = (product, unit) => product?.prices?.[unit]?.wholesale ?? product?.unitAmounts?.[unit] ?? null;
  const atCounter = () => view.atStation?.counter !== false;
  const basketEntries = () => Object.entries(state.basket).filter(([, qty]) => qty > 0);
  const basketCount = () => basketEntries().reduce((n, [, qty]) => n + qty, 0);

  function visibleProducts() {
    const q = state.search.trim();
    return (view.products || []).filter(p => (p.unit ? p.unit === state.unit : true) && (!q || String(p.themeName || p.name || '').includes(q))).sort((a,b)=>Number(b.availability==='available')-Number(a.availability==='available'));
  }

  function changeQuantity(key, qty, label) {
    if (state.op.pending || state.busy) { notify('上一笔操作尚未确认，购物篮暂时保留。', 'info'); return; }
    if (!Number.isSafeInteger(qty) || qty < 0 || qty > MAX_PER_LINE) { notify('每项数量应为 0～20 的整数。', 'error'); return; }
    if (qty === 0) delete state.basket[key]; else state.basket[key] = qty;
    state.receipt = null;
    paintAll();
  }

  // ── 一次购买动作：成败都由 actions.purchase 返回决定 ──
  async function purchase() {
    if (state.busy || state.op.pending) return;
    const lines = basketEntries().map(([key, quantity]) => {
      const [productId, unit] = key.split('|');
      return { productId, unit, quantity };
    });
    if (!lines.length) return;
    if (!atCounter()) { notify('采购需站在采购柜台；请先到柜台再确认。', 'info'); return; }
    const op = state.op.begin({ type: 'purchase', payload: { lines } }, view.branchId);
    state.busy = true; paintAll();
    const result = await callAction(actions, 'purchase', { lines, requestId: op.requestId });
    state.busy = false;
    state.op.finish(result, view.branchId);
    applyPurchaseResult(result);
  }

  async function checkLastOperation() {
    if (state.busy || !state.op.pending) return;
    state.busy = true; paintAll();
    const raw = await callAction(actions, 'checkLastOperation', { requestId: state.op.current.requestId });
    state.busy = false;
    const result = unwrapOperationResult(raw);
    state.op.finish(result, view.branchId);
    applyPurchaseResult(result);
  }

  function applyPurchaseResult(result) {
    if(result.ok&&(!Array.isArray(result.data?.lines)||result.data?.fulfillment!=='received')){
      result={ok:false,error:{code:'RESULT_UNKNOWN',message:'尚未收到完整入库回执，请查看原操作结果。',retryable:true}};
      state.op.finish(result,view.branchId);
    }
    if (result.ok) {
      state.basket = {};
      state.receipt = {
        title: '已入库',
        fulfillment: result.data?.fulfillment || 'received',
        lines: result.data?.lines || [],
        totalDebit: result.data?.totalDebit ?? null,
        cashDebit: result.data?.cashDebit ?? null,
        creditDebit: result.data?.creditDebit ?? null,
        note: result.data?.note || null,
        branchId: view.branchId,
      };
      notify('购买完成：货物已直接入库。', 'success');
    } else if (result.error?.code === 'RESULT_UNKNOWN') {
      notify('上次购买的结果尚未确定，请查看结果。', 'info');
    } else {
      notify(describeError(result.error), 'error');
    }
    paintAll();
  }

  // ── 渲染 ─────────────────────────────
  function paintHead() {
    const wallet = view.wallet || {};
    const chips = [
      view.clock ? chip('第 ' + view.clock.day + ' 天') : null,
      wallet.available != null ? chip('现金 ' + money(wallet.available)) : null,
      wallet.supplierCreditAvailable != null ? chip('授信 ' + money(wallet.supplierCreditAvailable)) : null,
      atCounter() ? null : chip('需站在采购柜台', 'warn'),
    ].filter(Boolean);
    headMeta.replaceChildren(...chips);
    if(view.legacyPending)headMeta.append(chip('旧订单运输中 '+view.legacyPending));
    if(view.legacyArrived)headMeta.append(button('旧订单入库（'+view.legacyArrived+'）',()=>callAction(actions,'receiveLegacy',{}),{small:true,disabled:!atCounter()||state.busy}));
  }

  function paint() {
    if (disposed) return;
    paintHead();
    main.replaceChildren();
    const pending = pendingNotice(state.op.current, { onCheck: checkLastOperation, busy: state.busy });
    if (state.receipt) main.append(paintReceipt(pending));
    else {
      if (pending) main.append(pending);
      if(!pending)main.append(state.showBasket ? paintBasket() : paintCatalog());
    }
    paintFoot();
  }

  function paintReceipt(pending) {
    const r = state.receipt;
    const box = el('div', { class: 'f6-receipt', 'data-purchase-receipt': 'true' }, [
      el('div', { class: 'f6-receipt__title', text: '已入库' }),
      r.fulfillment && r.fulfillment !== 'received' ? errorText('本次返回 fulfillment=' + r.fulfillment + '，尚未直接入库（当前正式接口为 pending 订单，属已知差异）。') : null,
      muted(view.demoNotice ? '以下为拟定回执（演示输入，正式后端待接）。' : '以下为本次采购的实际入库结果。', 'f6-note'),
      ...paginate(r.lines,state.receiptPage||0,Number.MAX_SAFE_INTEGER).rows.map(line => el('div', { class: 'pbc-line' }, [
        el('span', { text: (line.themeName || line.productId) + ' · ' + (line.unit === 'box' ? '密封卡盒' : '散包') + ' ×' + line.quantity }),
        el('strong', { text: Array.isArray(line.inventoryRefs) ? '入库 ' + line.inventoryRefs.length + ' 件' : '—' }),
      ])),
      el('div', { class: 'pbc-line' }, [el('span', { text: '本次花费' }), el('strong', { text: r.totalDebit != null ? money(r.totalDebit) : '—' })]),
      r.cashDebit != null ? el('div', { class: 'pbc-line' }, [el('span', { text: '其中现金' }), el('strong', { text: money(r.cashDebit) })]) : null,
      r.creditDebit ? el('div', { class: 'pbc-line' }, [el('span', { text: '其中供应商授信' }), el('strong', { text: money(r.creditDebit) })]) : null,
      r.note ? muted(r.note, 'f6-note') : null,
      el('div', { class: 'pbc-actions' }, [
        button('去仓库看看', () => callAction(actions, 'goToWarehouse', {}), { disabled: state.busy }),
        button('去拆包台', () => callAction(actions, 'goToOpening', { source: 'purchase' }), { disabled: state.busy }),
        button('继续采购', () => { state.receipt = null; paintAll(); }, { ghost: true }),
      ]),
      pending || null,
    ]);
    return box;
  }

  function paintBasket() {
    const entries = basketEntries();
    if (!entries.length) {
      return el('div', { class: 'f6-basket', 'data-basket': 'empty' }, [
        muted('购物篮是空的：在下方挑选商品，数量在商品卡上调整。', 'f6-note'),
      ]);
    }
    const lines = el('div', { class: 'f6-basket__lines' });
    let estimate = entries.reduce((total,[key,qty])=>{const [id,unit]=key.split('|');return total+(priceOf((view.products||[]).find(p=>p.productId===id),unit)||0)*qty;},0);
    const paging=paginate(entries,state.basketPage,Number.MAX_SAFE_INTEGER);state.basketPage=paging.page;
    for (const [key, qty] of paging.rows) {
      const [productId, unit] = key.split('|');
      const product = (view.products || []).find(p => p.productId === productId);
      const price = priceOf(product, unit);
      lines.append(el('div', { class: 'f6-basket__line' }, [
        el('strong', { text: (product?.themeName || productId) + ' · ' + (unit === 'box' ? '卡盒' : '散包') + ' ×' + qty }),
        el('span', { class: 'f6-basket__amount', text: Number.isSafeInteger(price) ? money(price * qty) + '（预估）' : '单价缺失' }),
        button('移除', () => changeQuantity(key, 0), { small: true, ghost: true }),
      ]));
    }
    return el('div', { class: 'f6-basket', 'data-basket': String(entries.length) }, [
      el('strong', { text: '购物篮 · ' + basketCount() + ' 件' }),
      lines,
      el('div', { class: 'f6-basket__total' }, [
        el('span', { class: 'f6-note', text: '目录预估（以确认为准）' }),
        el('strong', { text: money(estimate) }),
      ]),
    ]);
  }

  function paintCatalog() {
    const toolbar = el('div', { class: 'f6-scope__row' }, [
      segmented(UNITS, state.unit, id => { state.unit = id; paintAll(); }, '商品单位'),
      el('input', {
        class: 'f6-select', type: 'search', value: state.search, placeholder: '搜索主题…',
        'aria-label': '搜索供货主题', style: 'flex:1;min-width:140px;max-width:280px',
        oninput: e => { state.search = e.target.value; state.page = 0; paintGridOnly(); },
      }),
    ]);
    const grid = el('div', { class: 'f6-grid', 'data-product-grid': 'true' });
    const box = el('div', {}, [toolbar, el('div', { style: 'height:10px' }), grid]);
    paintGridInto(grid);
    return box;
  }

  // 搜索输入时只重画网格与底栏，保持输入焦点。
  function paintGridOnly() {
    if (disposed) return;
    const grid = main.querySelector('[data-product-grid]');
    if (grid) paintGridInto(grid);
    paintFoot();
  }

  function currentPaging() {
    const size = 1;
    return paginate(visibleProducts(), state.page, size);
  }

  function paintGridInto(grid) {
    const { rows, page, total } = currentPaging();
    state.page = page;
    grid.replaceChildren();
    if (!total) {
      grid.append(emptyState('没有符合筛选的在售商品。', '供货目录来自服务端；可切换散包 / 卡盒或清空搜索。'));
    }
    for (const p of rows) grid.append(productTile(p));
  }

  function productTile(p) {
    const key = p.productId + '|' + state.unit;
    const price = priceOf(p, state.unit);
    const unavailable = p.availability !== 'available';
    const sealed = (view.sealed || []).filter(g => g.productId === p.productId && g.kind === state.unit);
    const warehouse = sealed.reduce((n, g) => n + g.warehouse, 0);
    const onShelf = sealed.reduce((n, g) => n + g.onShelf, 0);
    const art = packaging(assets, p.productId, state.unit, (p.themeName || p.productId) + (state.unit === 'box' ? ' · 卡盒' : ' · 散包'));
    art.classList.add('f6-artframe');
    art.style.width = state.unit === 'box' ? '84px' : '64px';
    art.style.height = '88px';
    const qty = state.basket[key] || 0;
    const tile = el('article', { class: 'f6-tile' + (unavailable ? ' is-unavailable' : ''), 'data-product': key }, [
      el('div', { class: 'f6-tile__head' }, [
        art,
        el('div', { class: 'f6-tile__body' }, [
          el('strong', { class: 'f6-tile__name', text: (p.themeName || p.productId) + ' · ' + (state.unit === 'box' ? '密封卡盒' : '散包') }),
          el('span', { class: 'f6-tile__spec', text: state.unit === 'box'
            ? '每盒 ' + (p.packsPerBox ?? '?') + ' 包 · 每包 ' + (p.cardsPerPack ?? '?') + ' 张'
            : '每包 ' + (p.cardsPerPack ?? '?') + ' 张' }),
          el('div', { class: 'f6-tile__chips' }, [
            chip('仓库 ' + warehouse), chip('在架 ' + onShelf),
            unavailable ? chip(p.unavailableReason || '暂停供货', 'warn') : null,
          ]),
        ]),
      ]),
      el('div', { class: 'f6-tile__price' }, [
        el('strong', { text: Number.isSafeInteger(price) ? money(price) : '—' }),
        el('span', { class: 'f6-note', text: ' / ' + (state.unit === 'box' ? '盒' : '包') + '（预估单价）' }),
      ]),
      el('div', { class: 'f6-tile__foot' }, [
        stepper({
          value: qty, min: 0, max: MAX_PER_LINE, label: (p.themeName || p.productId) + (state.unit === 'box' ? '卡盒' : '散包'),
          onChange: q => changeQuantity(key, q), disabled: unavailable,
        }),
        unavailable ? el('span', { class: 'f6-note', text: '不可购买' }) : null,
      ]),
    ]);
    tile.classList.add('f6-product-detail');tile.append(productAlbum(p.productId,actions));return tile;
  }

  function paintFoot() {
    if (state.receipt) {
      foot.replaceChildren(
        pagerBar({...paginate(state.receipt.lines,state.receiptPage||0,Number.MAX_SAFE_INTEGER),unit:'行',onPage:next=>{state.receiptPage=next;paintAll();}}),
        el('span', { class: 'f6-foot__total' }, ['本次采购已完成入库；可去仓库或拆包台，或继续下一单']),
        el('span', { class: 'f6-foot__spacer' }),
      );
      const submit = button('购买', purchase, { primary: true, disabled: true });
      submit.dataset.purchaseSubmit = 'true';
      foot.append(submit);
      return;
    }
    const count = basketCount();
      let estimate = 0;
    for (const [key, qty] of basketEntries()) {
      const [productId, unit] = key.split('|');
      const price = priceOf((view.products || []).find(p => p.productId === productId), unit);
      if (Number.isSafeInteger(price)) estimate += price * qty;
    }
    const { page, pages, total } = state.showBasket?paginate(basketEntries(),state.basketPage,Number.MAX_SAFE_INTEGER):currentPaging();
    foot.replaceChildren(
      pagerBar({ page, pages, total, unit: state.showBasket?'行':'个商品', onPage: next => { if(state.showBasket)state.basketPage=next;else state.page = next; paintAll(); } }),
      button(state.showBasket?'返回商品':'购物篮（'+count+'件）',()=>{state.showBasket=!state.showBasket;paintAll();},{small:true}),
      el('span', { class: 'f6-foot__spacer' }),
      el('span', { class: 'f6-foot__total', 'data-basket-total': String(count) },
        count ? ['已选 ' + count + ' 件 · 预估 ', el('strong', { text: money(estimate) }), '（以确认为准）'] : ['从上方挑选商品，一次“购买”完成入库']),
    );
    const submit = button(count ? '购买' : '购买（先选商品）', purchase, {
      primary: true,
      disabled: !count || state.busy || state.op.pending || !atCounter(),
      title: atCounter() ? undefined : '需站在采购柜台',
    });
    submit.dataset.purchaseSubmit = 'true';
    foot.append(submit);
  }

  function paintAll() { paint(); }

  const capacity = createCapacity(frame, layout, () => paintAll());
  paint();
  return {
    update(nextView) {
      const previous=view.worldId+':'+view.branchId;
      view = nextView;
      state.op.invalidate(view.branchId);
      if (state.receipt && state.receipt.branchId && state.receipt.branchId !== view.branchId) state.receipt = null;
      if(previous!==view.worldId+':'+view.branchId)state.receipt=null;
      capacity.refresh?.();
      paint();
    },
    getDraft() {
      const { op } = state;
      return structuredClone({
        unit: state.unit, search: state.search, basket: state.basket, page: state.page,showBasket:state.showBasket,basketPage:state.basketPage,
        receipt: state.receipt ? { ...state.receipt, branchId: view.branchId } : null,
        operation: op.current,
      });
    },
    setLayout(next) { Object.assign(layout = layout || {}, next || {}); capacity.refresh?.(); paint(); },
    dispose() { disposed = true; capacity.disconnect(); root.replaceChildren(); },
  };
}
