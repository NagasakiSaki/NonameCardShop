// PLAY-B · B1 采购、到货、仓库与货架。
// 纯展示组件：所有价格、数量、可用性与版本都来自 view；组件不做任何经济计算，
// 也不把“目录合计”当成交报价——成交金额只认 actions.quoteBasket 冻结的报价。
import { el, button, segmented, sectionCard, emptyState, muted, errorText, chip, stepper, packaging } from './dom.mjs';
import { injectStyles } from './styles.mjs';
import { createFormatter } from './format.mjs';
import { createOperationState, pendingBlock, callAction, describeError, queryOperationResult, retryOperationResult } from './ops.mjs';

const TABS = [['order', '采购商品'], ['arrive', '到货签收'], ['stock', '密封仓库'], ['retail', '零售货架']];
const ORDER_STATUS = { pending: '运输中', arrived: '已到货', received: '已签收' };

function orderCountdown(order, clock) {
  if (order.status !== 'pending' || !order.dueAt) return null;
  const due=typeof order.dueAt==='number'?{day:Math.floor(order.dueAt/1440),minute:Math.floor(order.dueAt%1440)}:order.dueAt;const minutes = (due.day-clock.day)*1440+(due.minute-clock.minute);
  return minutes <= 0 ? '随时可能到货' : '预计第 ' + due.day + ' 天 ' + String(Math.floor(due.minute / 60)).padStart(2, '0') + ':' + String(due.minute % 60).padStart(2, '0') + ' 前后送达';
}

export function mountPurchase({ root, view, actions, assets, format, notify, draft = {} }) {
  {
    const money = createFormatter(format);
    const state = {
      tab: 'order', unit: 'pack', search: '', basket: new Map(), quote: null,
      quoteBasis: null, expanded: new Set(), op: createOperationState(), busy: false,
      scroll: {}, receiveNote: null, retailNote: null,
      ...draft, op:createOperationState(draft.operation),busy:false,
    };
    let disposed = false;
    const body = el('div', { class: 'pbc-body', 'data-purchase-root': 'true' });
    root.replaceChildren(body);
    injectStyles(root);
    const atStation = name => view.atStation?.[name] !== false;
    const saveScroll = () => { state.scroll[state.tab] = body.scrollTop; };
    const restoreScroll = () => { body.scrollTop = state.scroll[state.tab] || 0; };

    // ── 数据切片（只读） ─────────────────────────────
    const sealedOf = (productId, unit) => (view.sealed || []).filter(g => g.productId === productId && g.kind === unit);
    const inTransit = (productId, unit) => (view.orders || [])
      .filter(o => o.productId === productId && o.unit === unit && o.status !== 'received')
      .reduce((n, o) => n + o.quantity, 0);
    const canQuote = () => state.basket.size > 0
      && [...state.basket.keys()].every(k => (view.products || []).some(p => p.productId === k.split('|')[0] && p.availability === 'available'));

    // ── 购物篮操作：前端只维护“候选清单”，金额以询价为准 ──
    function changeQuantity(key, qty) {
      if (state.op.pending) return notify('上一笔操作尚未确认，购物篮暂时保留。', 'info');
      const [productId, unit] = key.split('|');
      if (!Number.isSafeInteger(qty) || qty < 0 || qty > 20) return notify('每项数量应为 0～20 的整数。', 'error');
      qty === 0 ? state.basket.delete(key) : state.basket.set(key, qty);
      state.quote = null; state.quoteBasis = null;
      paint();
    }
    function addProduct(productId, unit) {
      const key = productId + '|' + unit;
      changeQuantity(key, (state.basket.get(key) || 0) + 1);
    }
    function basketLines() {
      return [...state.basket.entries()].map(([key, quantity]) => {
        const [productId, unit] = key.split('|');
        const p = view.products?.find(x => x.productId === productId);
        return { productId, unit, quantity, product: p };
      });
    }

    // ── 报价与下单 ─────────────────────────────
    async function quoteBasket() {
      if (state.busy || state.op.pending) return;
      state.busy = true; paint();
      const lines = basketLines().map(l => ({ productId: l.productId, unit: l.unit, quantity: l.quantity }));
      const result = await callAction(actions, 'quoteBasket', { lines });
      state.busy = false;
      if (result.ok) {
        state.quote = result.data;
        state.quoteBasis = { branchId: view.branchId, day: view.clock?.day };
        notify('整篮报价已确认，请核对现金与授信后提交。','success');
      } else {
        notify(describeError(result.error), 'error');
      }
      paint();
    }
    async function placeOrder() {
      if (state.busy || state.op.pending || !state.quote) return;
      if (!atStation('counter')) return notify('采购下单需站在采购柜台；请先到柜台再确认。', 'info');
      const op = state.op.begin({ type: 'supplier.placeBasketOrder', quoteId: state.quote.quoteId, payload: {} }, view.branchId);
      state.busy = true; paint();
      const result = await callAction(actions, 'placeBasketOrder', { quoteId: state.quote.quoteId, requestId: op.requestId });
      state.op.finish(result, view.branchId); state.busy = false;
      handleResult(result, {
        success: data => {
          state.basket.clear(); state.quote = null; state.quoteBasis = null;
          state.tab = data.fulfillment === 'received' ? 'stock' : 'arrive';
          return (data.fulfillment === 'received' ? '购买成功，商品已入库。' : '订单已提交。') + '现金 ' + money(data.cashDebit) + '，授信 ' + money(data.creditDebit) + '。';
        },
        invalid: ['QUOTE_EXPIRED', 'UNAVAILABLE_PRODUCT', 'INSUFFICIENT_FUNDS'],
      });
    }
    function handleResult(result, { success, invalid = [] } = {}) {
      if (result.ok) {
        if (typeof success === 'function') notify(success(result.data), 'success');
      } else {
        notify(describeError(result.error), 'error');
        if (invalid.includes(result.error?.code)) { state.quote = null; state.quoteBasis = null; }
      }
      paint();
    }
    // 结果未知的恢复：查询原操作或原号重试，归一成原始命令结果再走统一处理。
    async function recover(retry) {
      if (state.busy || !state.op.pending) return;
      state.busy = true; paint();
      const result = await (retry ? retryOperationResult(state.op, actions) : queryOperationResult(state.op, actions, view.branchId));
      state.op.finish(result, view.branchId); state.busy = false;
      handleResult(result, {
        success: data => {
          if (state.op.current?.type === 'supplier.placeBasketOrder') {
            state.basket.clear(); state.quote = null; state.quoteBasis = null; state.tab = data.fulfillment === 'received' ? 'stock' : 'arrive';
            return data.fulfillment === 'received' ? '已确认购买结果，商品已在仓库，未重复扣款。' : '已找回下单结果，未重复扣款。';
          }
          return data?.note || '已找回原操作结果。';
        },
        invalid: ['QUOTE_EXPIRED', 'UNAVAILABLE_PRODUCT', 'INSUFFICIENT_FUNDS'],
      });
    }

    // ── 到货签收 ─────────────────────────────
    async function receive(request, label) {
      if (state.busy || state.op.pending) return notify('请先确认上一笔操作结果。', 'info');
      if (!atStation('counter')) return notify('签收需站在采购柜台。', 'info');
      const op = state.op.begin(request, view.branchId);
      state.busy = true; paint();
      const result = await callAction(actions, request.__action, { ...request.payload, requestId: op.requestId });
      state.op.finish(result, view.branchId); state.busy = false;
      handleResult(result, { success: data => (data?.note || label + '完成') });
    }
    async function retailRun(request, label) {
      if (state.busy || state.op.pending) return notify('请先确认上一笔操作结果。', 'info');
      if (!atStation('retail')) return notify('货架操作需站在零售货架前。', 'info');
      const op = state.op.begin(request, view.branchId);
      state.busy = true; paint();
      const result = await callAction(actions, request.__action, { ...request.payload, requestId: op.requestId });
      state.op.finish(result, view.branchId); state.busy = false;
      handleResult(result, {
        success: data => {
          const rest = Number.isSafeInteger(data?.remaining) && data.remaining > 0 ? '；容量不足，剩余 ' + data.remaining + ' 件未上架' : '';
          return (data?.note || label + '完成') + rest;
        },
      });
    }

    // ── 渲染 ─────────────────────────────
    function paint() {
      if (disposed) return;
      saveScroll();
      const pending = pendingBlock(state.op.current, {
        busy: state.busy,
        onQuery: () => recover(false),
        onRetry: () => recover(true),
      });
      const head = el('div', { class: 'pbc-tabbar' }, [
        segmented(TABS, state.tab, id => { state.tab = id; paint(); }, '采购工作区任务视图'),
        muted(taskHint(), 'pbc-tabbar__hint'),
      ]);
      body.replaceChildren(head);
      if (pending) body.append(pending);
      if (state.tab === 'order') paintOrder();
      else if (state.tab === 'arrive') paintArrive();
      else if (state.tab === 'stock') paintStock();
      else paintRetail();
      restoreScroll();
    }
    function taskHint() {
      return {
        order: '挑好商品后整篮询价一次下单；数量上限每行 20。',
        arrive: '未到货订单不能签收；签收不自动拆包。',
        stock: '包、盒及历史版本分开保存；开包请到拆包台。',
        retail: '货架只陈列密封散包与整盒；单卡交易在二级市场柜台。',
      }[state.tab];
    }

    function paintOrder() {
      const wrap = el('div', { class: 'pbc-supply' });
      const catalog = el('div', { class: 'pbc-toolbar-column' });
      const toolbar = el('div', { class: 'pbc-toolbar' }, [
        segmented([['pack', '独立散包'], ['box', '密封卡盒']], state.unit, id => { state.unit = id; paint(); }, '商品单位'),
        el('input', {
          class: 'pbc-input', type: 'search', value: state.search, placeholder: '搜索主题…',
          'aria-label': '搜索供货主题', style: 'flex:1;min-width:140px;max-width:240px',
          oninput: e => { state.search = e.target.value; paintGrid(); },
        }),
      ]);
      const grid = el('div', { class: 'pbc-product-grid' });
      catalog.append(toolbar, grid);
      wrap.append(catalog, paintBasket());
      body.append(wrap);

      function paintGrid() {
        const list = (view.products || [])
          .filter(p => !state.search || p.themeName.includes(state.search));
        grid.replaceChildren(...list.map(p => productTile(p)));
        if (!list.length) grid.append(emptyState('没有符合筛选的在售主题。', '供货目录来自服务端，停产商品不展示。'));
      }
      function productTile(p) {
        const stock = sealedOf(p.productId, state.unit);
        const warehouse = stock.reduce((n, g) => n + g.warehouse, 0);
        const onShelf = stock.reduce((n, g) => n + g.onShelf, 0);
        const transit = inTransit(p.productId, state.unit);
        const unavailable = p.availability !== 'available';
        const expanded = state.expanded.has(p.productId + '|' + state.unit);
        const art = packaging(assets, p.productId, state.unit, p.themeName + (state.unit === 'box' ? ' · 卡盒' : ' · 散包'));
        art.classList.add('pbc-product__art');
        const tile = el('article', { class: 'pbc-product' + (state.unit === 'box' ? ' pbc-product--box' : '') }, [
          el('div', { class: 'pbc-product__head' }, [
            art,
            el('div', { style: 'min-width:0;display:grid;gap:2px' }, [
              el('strong', { class: 'pbc-product__name', text: p.themeName + ' · ' + (state.unit === 'box' ? '密封卡盒' : '独立散包') }),
              p.priceTier ? el('span', { class: 'pbc-muted', style: 'font-size:12px', text: p.priceTier.label + ' · 主题平均强度 ' + p.averageStrength }) : null,
              el('span', { class: 'pbc-product__spec', text: state.unit === 'box'
                ? '每盒 ' + p.packsPerBox + ' 包 · 每包 ' + p.cardsPerPack + ' 张 · 盒定额 SSR ' + p.boxCounts.SSR
                : '每包 ' + p.cardsPerPack + ' 张 · 无累计大保底' }),
            ]),
          ]),
          el('div', { class: 'pbc-product__price' }, [
            el('strong', { text: money(p.prices[state.unit].wholesale) }),
            el('span', { class: 'pbc-muted', text: ' / ' + (state.unit === 'box' ? '盒' : '包') + '（服务端单价）' }),
          ]),
          el('div', { class: 'pbc-product__stock' }, [
            chip('仓库 ' + warehouse), chip('在架 ' + onShelf), chip('在途 ' + transit),
            unavailable ? chip('暂停供货', 'warn') : null,
          ]),
          el('div', { class: 'pbc-product__foot' }, [
            button('规格详情', () => { const k = p.productId + '|' + state.unit; state.expanded.has(k) ? state.expanded.delete(k) : state.expanded.add(k); paint(); }, { small: true, ghost: true }),
            button(unavailable ? '暂时缺货' : '＋ 加入购物篮', () => addProduct(p.productId, state.unit), { primary: true, disabled: unavailable }),
          ]),
          expanded ? productDetail(p) : null,
        ]);
        return tile;
      }
      function productDetail(p) {
        return sectionCard(null,
          muted('整盒固定张数：' + ['N', 'R', 'SR', 'SSR'].map(r => r + ' ' + p.boxCounts[r]).join(' / ')),
          muted((p.guarantees || []).join('；')),
          p.substitutionSummary ? muted(p.substitutionSummary) : null,
          muted('商品版本 ' + p.productVersion + ' · 价格版本 ' + p.priceVersion + ' · 每包期望价值 ' + money(p.packExpectedValue) + '（演示值）'),
        );
      }
      paintGrid();
    }

    function paintBasket() {
      const lines = basketLines();
      const box = el('aside', { class: 'pbc-basket', 'aria-label': '采购购物篮' }, [
        el('h3', { text: '这次带回店里' }),
        muted('购物篮只是候选清单；金额一律以整篮询价结果为准。'),
      ]);
      if (!lines.length) box.append(emptyState('先从左侧挑选商品', '包与盒分别计数，每行最多 20 件。'));
      for (const l of lines) {
        const price = l.product?.prices?.[l.unit]?.wholesale;
        const key = l.productId + '|' + l.unit;
        box.append(el('div', { class: 'pbc-basket__line' }, [
          el('strong', { text: (l.product?.themeName || l.productId) + ' · ' + (l.unit === 'box' ? '卡盒' : '散包') }),
          el('span', { class: 'pbc-muted', text: l.product ? money(price) + ' / 件' : '已停止供货，请移除' }),
          stepper({ value: l.quantity, min: 0, max: 20, label: (l.product?.themeName || l.productId) + l.unit, onChange: q => changeQuantity(key, q), disabled: state.busy }),
          el('span', { class: 'pbc-basket__amount', text: Number.isSafeInteger(price) ? money(price * l.quantity) + '（目录估价）' : '—' }),
          button('移除', () => changeQuantity(key, 0), { small: true, ghost: true }),
        ]));
      }
      const estimate = lines.reduce((n, l) => n + (l.product?.prices?.[l.unit]?.wholesale || 0) * l.quantity, 0);
      box.append(el('div', { class: 'pbc-basket__total' }, [
        el('span', { text: '目录合计（未询价）' }), el('strong', { text: money(estimate) }),
      ]));
      box.append(button(state.quote ? '重新获取整篮报价' : '获取整篮报价', quoteBasket, { disabled: !canQuote() || state.busy || state.op.pending }));
      const wallet = view.wallet || {};
      const quote = state.quote;
      if (quote && state.quoteBasis) {
        const stale = state.quoteBasis.branchId !== view.branchId || state.quoteBasis.day !== view.clock?.day;
        const short = quote.creditDebit > (wallet.supplierCreditAvailable ?? 0);
        box.append(el('section', { class: 'pbc-quote', 'data-basket-quote': quote.quoteId }, [
          el('h4', { text: '已冻结整篮报价' + (stale ? '（可能已过期）' : '') }),
          el('div', { class: 'pbc-line' }, [el('span', { text: '应付合计' }), el('strong', { text: money(quote.totalDebit) })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '预计现金支付' }), el('strong', { text: money(quote.cashDebit) })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '预计使用授信' }), el('strong', { text: money(quote.creditDebit) })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '可用授信 / 可用现金' }), el('strong', { text: money(wallet.supplierCreditAvailable ?? 0) + ' / ' + money(wallet.available ?? 0) })]),
          quote.validUntil ? muted('报价有效期至第 '+quote.validUntil.day+' 天 '+String(Math.floor(quote.validUntil.minute/60)).padStart(2,'0')+':'+String(Math.floor(quote.validUntil.minute%60)).padStart(2,'0')+'；跨日或读档后需重新询价。') : null,
          short ? errorText('现金与授信合计不足以支付本篮货款，请减少数量后重新询价。') : null,
          stale ? errorText('供货日期或进度分支已变化，旧报价不能用于下单，请重新询价。') : null,
          button('确认整篮采购', placeOrder, {
            primary: true, disabled: stale || short || state.busy || state.op.pending || !atStation('counter'),
            title: atStation('counter') ? undefined : '需站在采购柜台',
          }),
          muted('货款不足部分自动使用供应商授信，仅记欠款；任一行校验失败则整篮拒绝。'),
        ]));
      }
      if (!quote) box.append(muted('确认前先询价：报价会冻结单价与版本，过期、跨日、读档后失效。'));
      return box;
    }

    function paintArrive() {
      const orders = [...(view.orders || [])].reverse();
      const arrived = orders.filter(o => o.status === 'arrived');
      const wrap = el('div');
      wrap.append(el('div', { class: 'pbc-toolbar' }, [
        muted('待签收 ' + arrived.length + ' 单 · 运输中 ' + orders.filter(o => o.status === 'pending').length + ' 单 · 已签收 ' + orders.filter(o => o.status === 'received').length + ' 单'),
        button('一键签收全部已到货', () => receive({ __action: 'receiveAll', type: 'supplier.receiveAll', payload: {} }, '签收'), {
          primary: true, disabled: !arrived.length || state.busy || state.op.pending || !atStation('counter'),
        }),
      ]));
      if (state.receiveNote) wrap.append(muted(state.receiveNote));
      if (!orders.length) { wrap.append(emptyState('还没有采购订单。', '先在“采购商品”里加购物篮并整篮下单。')); body.append(wrap); return; }
      const list = el('div', { class: 'pbc-list' });
      for (const order of orders) {
        const eta = orderCountdown(order, view.clock || {});
        list.append(el('article', { class: 'pbc-receipt', 'data-order-id': order.orderId }, [
          el('div', { class: 'pbc-receipt__head' }, [
            el('h4', { text: order.themeName + ' · ' + (order.unit === 'box' ? '卡盒' : '散包') + ' ×' + order.quantity }),
            chip(ORDER_STATUS[order.status] || order.status, order.status === 'arrived' ? 'gold' : ''),
          ]),
          muted('已付货款 ' + money(order.total) + '（现金与授信以下单时实际扣款为准）'),
          muted(eta||'订单记录已保存'),el('details',{},[el('summary',{text:'订单与批次详情'}),muted(order.orderId+' · '+order.productVersion)]),
          order.status === 'arrived'
            ? button('签收本单', () => receive({ __action: 'receiveOrder', type: 'supplier.receive', payload: { orderId: order.orderId } }, '签收'), { primary: true, disabled: state.busy || state.op.pending || !atStation('counter') })
            : muted(order.status === 'received' ? '密封商品已入仓；未重复扣款，未自动拆包。' : '运输中，不能签收；关闭交互窗口后配送继续推进。'),
        ]));
      }
      wrap.append(list);
      body.append(wrap);
    }

    function paintStock() {
      const groups = view.sealed || [];
      const wrap = el('div');
      wrap.append(muted('密封仓库按商品 + 版本 + 单位聚合；这里只看数量，不显示内容。开包请到拆包台。'));
      if (!groups.length) { wrap.append(emptyState('仓库尚无密封商品。', '签收已到货订单后会显示在这里。')); body.append(wrap); return; }
      const grid = el('div', { class: 'pbc-shelf-grid' });
      for (const g of groups) {
        const art = packaging(assets, g.productId, g.kind, g.name);
        art.style.width = g.kind === 'box' ? '96px' : '72px';
        art.style.height = '96px';
        grid.append(el('article', { class: 'pbc-product' + (g.kind === 'box' ? ' pbc-product--box' : '') }, [
          el('div', { class: 'pbc-product__head' }, [art, el('div', { style: 'min-width:0' }, [
            el('strong', { class: 'pbc-product__name', text: g.name + ' · ' + (g.kind === 'box' ? '整盒' : '散包') }),
            muted('仓库 ×' + g.warehouse + ' · 可用 ' + g.available + ' · 在架 ' + g.onShelf, 'pbc-product__spec'),
          ])]),
          el('div', { class: 'pbc-product__stock' }, [
            chip('保护 ' + g.protected), chip('占用 ' + g.locked),
            g.retired ? chip('停产旧库存', 'warn') : null,
            g.suggestedRetail ? chip('建议售 ' + money(g.suggestedRetail)) : null,
          ]),
          el('div', { class: 'pbc-actions' }, [
            button('到拆包台开本组', () => actions?.goUnbox?.({ productId: g.productId, inventoryRefs: g.inventoryRefs, includeBoxes: g.kind === 'box' }), { small: true, disabled: !g.available }),
            g.kind === 'box' ? button('拆 1 盒取出密封包', () => {
              if (state.busy || state.op.pending) return notify('请先确认上一笔操作结果。', 'info');
              const request = { __action: 'unsealBox', type: 'boxes.unseal', payload: { inventoryRef: g.inventoryRefs[0] } };
              state.busy = true; paint();
              callAction(actions, 'unsealBox', { inventoryRef: g.inventoryRefs[0], requestId:state.op.current.requestId }).then(result => {
                state.op.finish(result, view.branchId); state.busy = false;
                handleResult(result, { success: data => data?.note || '卡盒已拆成原有密封包，内容保持不变。' });
              });
            }, { small: true, disabled: !g.available || state.busy || state.op.pending || !atStation('counter') }) : null,
          ]),
          muted('印刷版本 ' + g.productVersion, 'pbc-note'),
        ]));
      }
      wrap.append(grid);
      body.append(wrap);
    }

    function paintRetail() {
      const shelves = view.retail?.shelves || [];
      const cap = view.retailCapacity || {};
      const wrap = el('div');
      wrap.append(el('div', { class: 'pbc-toolbar' }, [
        muted(view.retail?.note || ('货架容量 ' + (cap.used ?? 0) + ' / ' + (cap.capacity ?? 0))),
        button('按剩余容量一键补货', () => retailRun({ __action: 'retailListAll', type: 'retail.listAll', payload: { inventoryRefs: shelves.flatMap(s => s.stockRefs) } }, '补货'), {
          primary: true, disabled: !shelves.some(s => s.stockRefs?.length) || state.busy || state.op.pending || !atStation('retail'),
        }),
      ]));
      if (!shelves.length) { wrap.append(emptyState('没有可陈列的密封商品。', '先采购并签收，再从这里按容量上架；停产商品不再上架。')); body.append(wrap); return; }
      const grid = el('div', { class: 'pbc-shelf-grid' });
      for (const shelf of shelves) {
        const kind = shelf.kind === 'sealed-box' ? 'box' : 'pack';
        const art = packaging(assets, shelf.productId, kind, shelf.label);
        art.style.width = kind === 'box' ? '96px' : '72px'; art.style.height = '96px';
        const priceInput = el('input', {
          class: 'pbc-input pbc-price-input', type: 'number', min: 1, max: 1000000, step: 1,
          value: shelf.unitAmount, 'aria-label': shelf.label + ' 首件售价',
        });
        grid.append(el('article', { class: 'pbc-product pbc-shelf' }, [
          el('div', { class: 'pbc-product__head' }, [art, el('div', { style: 'min-width:0' }, [
            el('strong', { class: 'pbc-product__name', text: shelf.label }),
            muted('在架 ×' + shelf.stock + ' · 可补货 ' + (shelf.warehouse ?? shelf.stockRefs?.length ?? 0), 'pbc-product__spec'),
          ])]),
          el('div', { class: 'pbc-actions' }, [
            button('上架 1 件', () => retailRun({ __action: 'retailList', type: 'retail.list', payload: { inventoryRef: shelf.stockRefs?.[0] } }, '上架'), { small: true, disabled: !shelf.stockRefs?.length || state.busy || state.op.pending }),
            button('撤回 1 件', () => retailRun({ __action: 'retailWithdraw', type: 'retail.withdraw', payload: { inventoryRef: shelf.inventoryRefs?.[0] } }, '撤回'), { small: true, disabled: !shelf.inventoryRefs?.length || state.busy || state.op.pending }),
          ]),
          el('div', { class: 'pbc-actions' }, [
            el('label', { class: 'pbc-muted', style: 'font-size:12px;display:flex;gap:6px;align-items:center' }, ['首件售价 ', priceInput]),
            button('更新首件售价', () => {
              const amount = Number(priceInput.value);
              if (!Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) return notify('售价须为 1～1000000 的整数游戏币。', 'error');
              retailRun({ __action: 'retailSetPrice', type: 'retail.setPrice', payload: { inventoryRef: shelf.inventoryRefs?.[0], amount } }, '改价');
            }, { small: true, disabled: !shelf.inventoryRefs?.length || state.busy || state.op.pending }),
          ]),
          muted('同组不同实物可能标价不同；此操作只修改首件，不代表全组改价。', 'pbc-note'),
        ]));
      }
      wrap.append(grid);
      body.append(wrap);
    }

    paint();
    return {
      setTab(tab){if(TABS.some(([id])=>id===tab)){state.tab=tab;paint();}},
      getDraft(){const {op,...values}=state;return structuredClone({...values,busy:false,operation:op.current});},
      update(nextView) {
        view = nextView;
        // 新视图可能意味着价格、库存或分支变化：旧报价失去依据时降级为待重新询价。
        if (state.quoteBasis && (state.quoteBasis.branchId !== nextView.branchId || state.quoteBasis.day !== nextView.clock?.day)) {
          state.quote = null; state.quoteBasis = null;
          notify('供货日期或进度分支已变化，旧报价已清除；购物篮数量保留，请重新询价。', 'info');
        }
        state.op.invalidate(nextView.branchId);
        paint();
      },
      dispose() { disposed = true; root.replaceChildren(); },
    };
  }
}
