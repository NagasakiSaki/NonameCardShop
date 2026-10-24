// PLAY-B · B3 收藏、市场与详情。
// 持有 / 可用 / 保护 / 锁定 / 在售分开表达；印刷稀有度与当前全局强度是两枚不同徽章；
// 参考行情与实际售价分开显示。关键动作在详情侧栏就地完成，不弹多层窗。
// 立绘头像只出现在街坊求购等交易对象位置，不参与任何预算推断。
import { el, button, segmented, sectionCard, emptyState, muted, errorText, chip, rarityChip, art, avatar, RARITIES } from './dom.mjs';
import { injectStyles } from './styles.mjs';
import { createFormatter } from './format.mjs';
import { createOperationState, pendingBlock, callAction, describeError, queryOperationResult, retryOperationResult } from './ops.mjs';

const TABS = [
  ['collection', '收藏'], ['buy', '市场买入'], ['mine', '本店挂单'],
  ['bids', '街坊求购'], ['history', '成交记录'],
];
const STATUS_FILTERS = [['all', '全部持有'], ['sellable', '可上架'], ['protected', '含保护'], ['listed', '在售']];
const SORTS = [['score-desc', '评分从高到低'], ['owned-desc', '持有数量'], ['name', '名称']];

function listingAmount(value) {
  const text = String(value).trim(), amount = Number(text);
  if (!/^\d+$/.test(text) || !Number.isSafeInteger(amount) || amount < 1 || amount > 1000000) {
    throw Object.assign(new Error('售价须为 1～1,000,000 的整数游戏币。'), { code: 'INVALID_INPUT' });
  }
  return amount;
}

export function mountCollection({ root, view, actions, assets, format, notify, draft = {} }) {
  {
    const money = createFormatter(format);
    const state = {
      tab: 'collection', search: '', rarity: '', statusFilter: 'all', sort: 'score-desc',
      selected: null, op: createOperationState(), busy: false,
      quote: null, detail: null, detailLoading: false, detailVersion: 0, detailOpen: false,
      sellRef: {}, sellAmount: {}, expandedCopy: null,
      ...draft, op:createOperationState(draft.operation),busy:false,
    };
    let disposed = false;
    const body = el('div', { class: 'pbc-body', 'data-collection-root': 'true' });
    root.replaceChildren(body);
    injectStyles(root);

    const atMarket = () => view.atStation?.market !== false;
    const rowsFor = () => {
      if (state.tab === 'collection') return view.inventory || [];
      return view.market?.[state.tab] || [];
    };
    // 归一：收藏聚合行与市场行共用一套平铺字段，raw 保留原始行给适配层对照。
    function normalize(row) {
      if (state.tab === 'collection') {
        return {
          id: JSON.stringify([row.cardKey, row.printVersion, row.printedRarity, row.location]),
          cardKey: row.cardKey, name: row.name, artUrl: row.imageUrl,
          printed: row.printedRarity, current: row.currentRarity,
          owned: row.owned, available: row.available, protected: row.protected || 0,
          locked: row.locked || 0, listed: row.listed || 0,
          availableRefs: row.availableRefs || [],
          price: row.referencePrice?.amount ?? null, priceLabel: '参考行情',
          meta: '可用 ' + row.available + ' / 持有 ' + row.owned, seller: null, raw: row,
        };
      }
      if (state.tab === 'history') {
        return {
          id: row.eventId || row.seq, cardKey: row.cardKey, name: row.name, artUrl: row.imageUrl,
          printed: null, current: row.currentRarity, owned: null, available: null,
          price: row.unitAmount ?? null, priceLabel: row.direction === 'sell' ? '卖出单价' : '买入单价',
          meta: (row.direction === 'sell' ? '卖出' : '买入') + (row.day != null ? ' · 第 ' + row.day + ' 天' : ''),
          seller: null, raw: row,
        };
      }
      if (state.tab === 'bids') {
        return {
          id: row.bidId, cardKey: row.cardKey, name: row.name, artUrl: row.imageUrl,
          printed: null, current: row.currentRarity, owned: null, available: null,
          price: row.amount ?? null, priceLabel: '求购出价',
          meta: row.status === 'accepted' ? '已接单待交付' : '待接受 · ' + (row.expiresDay != null ? '第 ' + row.expiresDay + ' 天前有效' : ''),
          seller: row.buyer, personId: row.personId, raw: row,
        };
      }
      return {
        id: row.listingId, cardKey: row.cardKey, name: row.name, artUrl: row.imageUrl,
        printed: row.printedRarity || row.rarity || null, current: row.currentRarity,
        owned: row.holdings?.owned ?? null, available: row.holdings?.available ?? null,
        price: row.unitAmount ?? null, priceLabel: state.tab === 'buy' ? '挂单价' : '我的挂单价',
        meta: state.tab === 'buy' ? (row.sellerName || 'NPC 寄售') : '成交前不产生收入',
        seller: row.sellerName, raw: row,
      };
    }
    function visibleRows() {
      const q = state.search.trim();
      let rows = rowsFor().map(normalize);
      if (q) rows = rows.filter(r => r.name.toLowerCase().includes(q.toLowerCase()));
      if (state.rarity) rows = rows.filter(r => (state.tab === 'bids' || state.tab === 'history' ? r.current : r.printed) === state.rarity);
      if (state.tab === 'collection') {
        if (state.statusFilter === 'sellable') rows = rows.filter(r => r.available > 0);
        if (state.statusFilter === 'protected') rows = rows.filter(r => r.protected > 0);
        if (state.statusFilter === 'listed') rows = rows.filter(r => r.listed > 0);
        const sorters = {
          'score-desc': (a, b) => (b.raw._score || 0) - (a.raw._score || 0),
          'owned-desc': (a, b) => (b.owned || 0) - (a.owned || 0),
          name: (a, b) => a.name.localeCompare(b.name, 'zh'),
        };
        rows.sort(sorters[state.sort] || sorters['score-desc']);
      }
      return rows;
    }

    function select(row) {
      state.selected = row ? row.id : null;
      state.quote = null; state.detail = null; state.detailOpen = false; state.detailVersion++;
      if (state.tab === 'collection' && row?.availableRefs?.length) state.sellRef[row.id] ??= row.availableRefs[0];
      paint();
    }
    const selectedRow = () => visibleRows().find(r => r.id === state.selected) || null;

    // ── 详情数据（按需加载） ─────────────────────────────
    async function loadDetail(cardKey) {
      const version = ++state.detailVersion;
      state.detailLoading = true; paint();
      const result = await callAction(actions, 'cardDetail', { cardKey });
      if (disposed || version !== state.detailVersion) return;
      state.detailLoading = false;
      if (result.ok) state.detail = result.data;
      else { state.detail = null; notify(describeError(result.error), 'error'); }
      paint();
    }
    async function loadSource(skillEl, cardKey) {
      const loading = el('pre', { class: 'pbc-detail__source', text: '正在读取技能源码…' });
      skillEl.replaceChildren(loading);
      const result = await callAction(actions, 'cardDetail', { cardKey, includeCode: true });
      if (!result.ok) { loading.textContent = '源码读取失败：' + describeError(result.error); return; }
      const code = (result.data.skills || []).map(s => '// ' + (s.name || s.id) + '\n' + (s.code || '// 未提供')).join('\n\n');
      loading.textContent = code || '当前技能未提供源码。';
    }

    // ── 交易动作 ─────────────────────────────
    async function run(request, actionName, args, after) {
      if (state.busy || state.op.pending) return notify('请先确认上一笔操作结果。', 'info');
      if (!atMarket()) return notify('单卡买卖与上架需到二级市场柜台；查看不受限制。', 'info');
      const op = state.op.begin(request, view.branchId);
      state.busy = true; paint();
      const result = await callAction(actions, actionName, { ...args, requestId: op.requestId });
      state.op.finish(result, view.branchId); state.busy = false;
      if (result.ok) {
        notify(after?.(result.data) || '操作已完成。', 'success');
        state.quote = null;
        actions?.refresh?.();
      } else {
        notify(describeError(result.error), 'error');
        if (['QUOTE_EXPIRED', 'OUT_OF_STOCK', 'ITEM_LOCKED', 'PREVIEW_EXPIRED'].includes(result.error?.code)) {
          state.quote = null; actions?.refresh?.();
        }
      }
      paint();
    }
    async function recover(retry) {
      if (state.busy || !state.op.pending) return;
      state.busy = true; paint();
      const result = await (retry ? retryOperationResult(state.op, actions) : queryOperationResult(state.op, actions, view.branchId));
      state.op.finish(result, view.branchId); state.busy = false;
      if (result.ok) { notify('已找回原操作结果，未重复交易。', 'success'); state.quote = null; actions?.refresh?.(); }
      else notify(describeError(result.error), 'error');
      paint();
    }

    // ── 渲染 ─────────────────────────────
    function paint() {
      if (disposed) return;
      body.replaceChildren();
      if (state.op.pending) body.append(pendingBlock(state.op.current, { busy: state.busy, onQuery: () => recover(false), onRetry: () => recover(true) }));
      const rarityFilterLabel = (state.tab === 'bids' || state.tab === 'history') ? '全部全局强度' : '全部印刷稀有度';
      const filters = el('div', { class: 'pbc-toolbar' }, [
        segmented(TABS, state.tab, id => {
          state.tab = id; state.selected = null; state.quote = null; state.detail = null; state.detailOpen = false;
          state.rarity = ''; state.statusFilter = 'all'; state.sort = 'score-desc'; paint();
        }, '收藏与市场任务视图'),
        el('input', {
          class: 'pbc-input', type: 'search', value: state.search, placeholder: '搜索卡名…',
          'aria-label': '搜索单卡', style: 'flex:1;min-width:130px;max-width:220px',
          oninput: e => { state.search = e.target.value; paintGrid(); },
        }),
        el('select', { class: 'pbc-input', 'aria-label': rarityFilterLabel, onchange: e => { state.rarity = e.target.value; paintGrid(); } }, [
          el('option', { value: '', text: rarityFilterLabel }),
          ...RARITIES.map(r => el('option', { value: r, selected: state.rarity === r, text: r })),
        ]),
      ]);
      if (state.tab === 'collection') {
        filters.append(
          el('select', { class: 'pbc-input', 'aria-label': '收藏状态筛选', onchange: e => { state.statusFilter = e.target.value; paintGrid(); } },
            STATUS_FILTERS.map(([id, label]) => el('option', { value: id, selected: state.statusFilter === id, text: label }))),
          el('select', { class: 'pbc-input', 'aria-label': '收藏排序', onchange: e => { state.sort = e.target.value; paintGrid(); } },
            SORTS.map(([id, label]) => el('option', { value: id, selected: state.sort === id, text: label }))),
          button('留一，其余上架', openSurplus, { disabled: state.busy || state.op.pending || !atMarket(), title: atMarket() ? undefined : '需站在二级市场柜台' }),
        );
      }
      body.append(filters);
      const rows = visibleRows();
      if (!rows.some(r => r.id === state.selected) && rows.length) { select(rows[0]); return; }
      const market = el('div', { class: 'pbc-market' }, [paintGridArea(rows), paintDetail()]);
      body.append(market);
    }

    function paintGridArea(rows) {
      const area = el('div');
      const label = el('div', { class: 'pbc-catalog__label' }, [
        el('span', { text: '已显示 ' + rows.length + ' 条 · ' + tabCaption() }),
        state.tab === 'collection' ? chip('印刷稀有度与全局强度分开显示') : null,
      ]);
      const grid = el('div', { class: 'pbc-card-grid', 'data-card-grid': 'true' });
      if (!rows.length) grid.append(emptyState(emptyText(), emptyHint()));
      else for (const row of rows) grid.append(cardTile(row));
      area.append(label, grid);
      return area;
    }
    function tabCaption() {
      return {
        collection: '收藏聚合行 · 金额为参考行情', buy: '非自营真实挂单', mine: '本店挂单',
        bids: '真实街坊求购 · 按全局强度筛选', history: '当前存档真实成交',
      }[state.tab];
    }
    function emptyText() {
      return {
        collection: '收藏还没有记录。', buy: '市场上暂时没有可买的挂单。', mine: '本店还没有挂单。',
        bids: '目前没有街坊求购。', history: '还没有成交记录。',
      }[state.tab];
    }
    function emptyHint() {
      return {
        collection: '开包、买入或拾牌后这里会出现卡牌聚合行。', buy: '换个筛选，或等街坊上新。',
        mine: '在收藏里选中一张卡即可就地挂单。', bids: '熟客回访时可能带来新的求购。',
        history: '成交后这里会记录真实价格与方向。',
      }[state.tab];
    }

    function cardTile(row) {
      const img = art(row.artUrl, row.name);
      img.classList.add('pbc-card-tile__img');
      img.append(rarityChip(row.printed));
      if (row.owned != null) img.append(el('span', { class: 'pbc-owned', text: '×' + row.owned }));
      return el('button', {
        class: 'pbc-card-tile' + (row.id === state.selected ? ' is-selected' : ''),
        type: 'button', 'data-card': row.id, 'aria-pressed': String(row.id === state.selected),
        'aria-label': row.name + ' 查看详情',
        onclick: () => select(row),
      }, [
        img,
        el('span', { class: 'pbc-card-tile__name', text: row.name }),
        el('span', { class: 'pbc-card-tile__price' }, [
          el('span', { text: Number.isSafeInteger(row.price) ? money(row.price) : '—' }),
          el('span', { class: 'pbc-muted', style: 'font-size:11px', text: row.priceLabel }),
        ]),
        el('span', { class: 'pbc-card-tile__meta' }, [
          el('span', { text: row.meta }),
          row.current ? el('span', { text: '全局 ' + row.current }) : null,
        ]),
      ]);
    }

    function paintDetail() {
      const row = selectedRow();
      const panel = el('aside', { class: 'pbc-detail', 'aria-label': '选中卡牌与交易确认' });
      if (!row) {
        panel.append(emptyState('点选一张卡', '卡面、持有量与交易操作会显示在这里。'));
        return panel;
      }
      panel.append(el('div', { class: 'pbc-detail__badges' }, [
        rarityChip(row.printed), row.printed ? el('span', { class: 'pbc-muted', style: 'font-size:12px', text: '印刷' }) : null,
        rarityChip(row.current), el('span', { class: 'pbc-muted', style: 'font-size:12px', text: '当前全局强度' }),
      ]));
      const big = art(row.artUrl, row.name, 'pbc-detail__art');
      panel.append(big, el('h3', { text: row.name }, row.raw._title ? [el('div', { class: 'pbc-muted', style: 'font-size:12px;font-weight:400', text: row.raw._title })] : []));
      panel.append(muted([row.raw._pack && view.packNames?.[row.raw._pack] || row.raw._pack, row.raw._group && view.groupNames?.[row.raw._group] || row.raw._group, row.raw._hp ? '体力 ' + row.raw._hp : null].filter(Boolean).join(' · ') || tabCaption()));
      panel.append(el('div', { class: 'pbc-line' }, [el('span', { text: row.priceLabel }), el('strong', { text: Number.isSafeInteger(row.price) ? money(row.price) : '—' })]));
      if (row.owned != null) {
        panel.append(
          el('div', { class: 'pbc-line' }, [el('span', { text: '持有 / 可上架' }), el('strong', { text: row.owned + ' / ' + row.available })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '受保护' }), el('strong', { text: row.protected })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '交易 / 比赛锁定' }), el('strong', { text: row.locked })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '已挂单' }), el('strong', { text: row.listed })]),
        );
      }
      if (row.personId) panel.append(el('div', { class: 'pbc-bid-row' }, [avatar(assets?.portrait?.(row.personId), row.seller), el('span', { text: row.seller + ' 求购 · 定金已托管 ' + money(row.raw.fundsHeld || 0) })]));
      panel.append(tabActions(row));
      if (state.detailOpen) panel.append(detailSection(row));
      return panel;
    }

    function tabActions(row) {
      const wrap = el('div', { style: 'display:grid;gap:8px' });
      if (state.tab === 'collection') {
        const refs = row.availableRefs || [];
        const chosenRef = refs.includes(state.sellRef[row.id]) ? state.sellRef[row.id] : refs[0];
        const previous = state.sellAmount[row.id];
        const suggested = row.price;
        const input = el('input', {
          class: 'pbc-input', type: 'number', min: 1, max: 1000000, step: 1,
          value: previous ?? suggested ?? '', 'aria-label': '单卡上架售价',
          oninput: e => { state.sellAmount[row.id] = e.target.value; },
        });
        wrap.append(
          refs.length
            ? el('label', { class: 'pbc-muted', style: 'display:grid;gap:4px;font-size:12px' }, ['待出售实物（未保护未锁定）',
              el('select', { class: 'pbc-input', 'aria-label': '待出售实物', onchange: e => { state.sellRef[row.id] = e.target.value; paint(); } },
                refs.map((ref,index) => el('option', { value: ref, selected: ref === chosenRef, text: '可用副本 '+(index+1) })))])
            : muted(row.available > 0 ? '可上架副本引用待适配层提供。' : '当前印刷版本没有可出售副本（保护/锁定/在售占用）。'),
          el('label', { class: 'pbc-muted', style: 'display:grid;gap:4px;font-size:12px' }, ['挂单售价（整数游戏币）', input]),
          button('确认单卡上架', () => {
            try {
              const amount = listingAmount(input.value);
              run({ type: 'market.placeListing', payload: { inventoryRef: chosenRef, amount } }, 'placeListing', { inventoryRef: chosenRef, amount }, () => '已挂单 ' + row.name + ' ×1，售价 ' + money(amount) + '；成交前不产生收入。');
            } catch (error) { notify(error.message, 'error'); }
          }, { primary: true, disabled: !chosenRef || state.busy || state.op.pending || !atMarket() }),
          muted('上架会占用这个实物副本；真正成交后才产生收入。'),
          button(state.detailOpen ? '收起大图与技能' : '查看大图与完整技能', () => {
            state.detailOpen = !state.detailOpen;
            if (state.detailOpen && !state.detail) loadDetail(row.cardKey); else paint();
          }, { ghost: true }),
        );
      } else if (state.tab === 'buy') {
        if (state.quote && state.quote.listingId === row.raw.listingId) {
          wrap.append(
            el('h4', { text: '确认买入报价' }),
            el('div', { class: 'pbc-line' }, [el('span', { text: '单价' }), el('strong', { text: money(state.quote.unitAmount) })]),
            el('div', { class: 'pbc-line' }, [el('span', { text: '手续费' }), el('strong', { text: money(state.quote.feeAmount) })]),
            el('div', { class: 'pbc-line' }, [el('span', { text: '应付合计' }), el('strong', { text: money(state.quote.totalDebit) })]),
            muted((state.quote.explanation || []).join(' · ') || '报价冻结了实际金额；确认后立即成交。'),
            button('确认买入', () => run(
              { type: 'market.acceptTrade', quoteId: state.quote.quoteId, payload: { listingId: row.raw.listingId, quantity: 1 } },
              'marketAccept', { listingId: row.raw.listingId, quoteId: state.quote.quoteId },
              () => '已买入 ' + row.name + ' ×1。卡已入收藏。'
            ), { primary: true, disabled: state.busy || state.op.pending || !atMarket() }),
            button('取消报价', () => { state.quote = null; paint(); }, { ghost: true }),
          );
        } else {
          wrap.append(
            muted('买入前先冻结报价：金额、手续费以报价为准。'),
            button('获取买入报价', async () => {
              if (state.busy || state.op.pending) return;
              state.busy = true; paint();
              const result = await callAction(actions, 'marketQuote', { listingId: row.raw.listingId });
              state.busy = false;
              if (result.ok) { state.quote = { ...result.data, listingId: row.raw.listingId }; paint(); }
              else { notify(describeError(result.error), 'error'); paint(); }
            }, { primary: true, disabled: state.busy || state.op.pending || !atMarket() }),
          );
        }
        wrap.append(button(state.detailOpen ? '收起大图与技能' : '查看大图与完整技能', () => {
          state.detailOpen = !state.detailOpen;
          if (state.detailOpen && !state.detail) loadDetail(row.cardKey); else paint();
        }, { ghost: true }));
      } else if (state.tab === 'mine') {
        wrap.append(
          muted('挂单尚未成交，不占现金；撤单后实物立即回到收藏。'),
          button('撤回此挂单', () => run({ type: 'market.cancelListing', payload: { listingId: row.raw.listingId } }, 'cancelListing', { listingId: row.raw.listingId }, () => '已撤回挂单，实物已回收藏。'), { primary: true, disabled: state.busy || state.op.pending || !atMarket() }),
        );
      } else if (state.tab === 'bids') {
        wrap.append(
          muted('这里只展示真实求购；接单与交付由街坊订单窗口处理，资金已托管。'),
          button('打开街坊订单', () => actions?.openNeighborOrders?.({ personId: row.raw.personId }), { disabled: state.busy }),
        );
      } else {
        const minute = Math.floor(row.raw.minute ?? row.raw.at ?? 0);
        wrap.append(
          el('div', { class: 'pbc-line' }, [el('span', { text: '成交时间' }), el('strong', { text: (row.raw.day ?? '—') + ' 日 ' + String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0') })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '成交数量' }), el('strong', { text: row.raw.quantity ?? 1 })]),
          muted('历史成交价不代表当前可买价格；记录来自当前存档。'),
        );
      }
      return wrap;
    }

    function detailSection(row) {
      const wrap = el('section', { class: 'pbc-card', 'data-card-detail': row.cardKey });
      if (state.detailLoading || !state.detail || state.detail.cardKey !== row.cardKey) {
        wrap.append(muted(state.detailLoading ? '正在读取完整详情…' : '详情暂不可用。'));
        return wrap;
      }
      const d = state.detail;
      wrap.append(el('h3', { text: '技能与背景' }));
      if (!d.skills?.length) wrap.append(muted('当前版本未提供技能说明。'));
      for (const skill of d.skills || []) {
        const skillEl = el('section', { class: 'pbc-detail__skill' }, [
          el('h4', { text: skill.name || skill.id }),
          el('p', { text: skill.description || '暂无技能说明。' }),
        ]);
        wrap.append(skillEl);
      }
      wrap.append(button('按需读取技能源码', () => loadSource(wrap.querySelector('.pbc-detail__source') || wrap, row.cardKey), { small: true, ghost: true }));
      const stats = d.stats || {};
      wrap.append(el('h3', { text: '整场战绩（含模拟场次）', style: 'margin-top:12px;font-size:15px' }));
      wrap.append(el('table', { class: 'pbc-detail__source', style: 'font:13px/1.8 inherit;white-space:normal' }, [
        el('tbody', {}, ['bo3', 'kof'].map(mode => {
          const s = stats[mode] || {};
          return el('tr', {}, [
            el('td', { style: 'padding-right:12px;font-weight:700', text: mode.toUpperCase() }),
            el('td', { text: '场次 ' + (s.sessions ?? s.games ?? 0) }),
            el('td', { text: '胜 ' + (s.wins ?? 0) }),
            el('td', { text: '负 ' + (s.losses ?? 0) }),
            el('td', { text: '平 ' + (s.draws ?? 0) }),el('td',{text:'其中模拟 '+(s.simulatedGames??0)}),
          ]);
        })),
      ]));
      wrap.append(muted(stats.note || '统计可能包含模拟对局，模拟场次另列；样本不足时谨慎判断胜率。'));
      wrap.append(el('h3', { text: '流通与准入', style: 'margin-top:12px;font-size:15px' }));
      wrap.append(muted('店长可用自己持有的可参赛副本；只有 NPC 的用牌需要流通资格。'));
      wrap.append(muted(d.combatEligibility?.note || (d.circulation ? '该卡种已进入市场流通。' : '该卡种尚未登记流通；私下开包不自动成为市场牌。')));
      if (d.copies?.length) {
        wrap.append(el('h3', { text: '实物副本', style: 'margin-top:12px;font-size:15px' }));
        for (const copy of d.copies) {
          wrap.append(el('div', { class: 'pbc-line' }, [
            el('span', { class: 'pbc-muted', style: 'font-size:12px', text: [copy.inventoryRef, copy.location === 'market' ? '二级市场挂单' : '收藏', copy.protected ? '受保护' : null, copy.locked ? '占用' : null].filter(Boolean).join(' · ') }),
            el('span', {}, [
              button(copy.protected ? '取消保护' : '保护', () => run(
                { type: 'inventory.setProtection', payload: { inventoryRef: copy.inventoryRef, protected: !copy.protected } },
                'setProtection', { inventoryRef: copy.inventoryRef, protected: !copy.protected },
                () => (copy.protected ? '已取消保护：' : '已保护：') + row.name + ' 的一个副本。'
              ), { small: true, ghost: true, disabled: copy.locked || state.busy || state.op.pending }),
            ]),
          ]));
        }
        wrap.append(muted('保护按单张实物设置；挂单或比赛锁定的副本不能更改保护。'));
      }
      return wrap;
    }

    let surplusPreview = null;
    async function openSurplus() {
      if (state.busy || state.op.pending) return;
      state.busy = true; paint();
      const result = await callAction(actions, 'surplusPreview', {});
      state.busy = false;
      if (result.ok) { surplusPreview = result.data; notify('留一上架预览已生成；范围是全部收藏，按印刷版各留 1 张。', 'success'); }
      else { surplusPreview = null; notify(describeError(result.error), 'error'); }
      paint();
      if (surplusPreview) showSurplusDialog();
    }
    function showSurplusDialog() {
      const s = surplusPreview;
      const panel = el('section', { class: 'pbc-card', style: 'margin-top:12px', 'data-surplus-preview': s.previewId }, [
        el('h3', { text: '留一上架预览（尚未提交）' }),
        el('div', { class: 'pbc-line' }, [el('span', { text: '范围' }), el('strong', { text: '全部收藏 · 本页搜索不限制此操作' })]),
        el('div', { class: 'pbc-line' }, [el('span', { text: '每种印刷版至少保留' }), el('strong', { text: s.keep })]),
        el('div', { class: 'pbc-line' }, [el('span', { text: '本次新增挂单' }), el('strong', { text: s.newListings })]),
        el('div', { class: 'pbc-line' }, [el('span', { text: '已在售' }), el('strong', { text: s.alreadyListed })]),
        el('div', { class: 'pbc-line' }, [el('span', { text: '保护 / 锁定排除' }), el('strong', { text: s.lockedExcluded })]),
        el('div', { class: 'pbc-line' }, [el('span', { text: '预计挂牌费' }), el('strong', { text: money(s.estimatedFee) })]),
        muted('确认时会重新核对保留数量与可售库存；受保护或占用副本计入保留。'),
        el('div', { class: 'pbc-actions' }, [
          button('确认批量上架', () => run({ type: 'market.listSurplus', previewId: s.previewId, payload: {} }, 'listSurplus', { previewId: s.previewId }, data => '已按预览上架 ' + ((typeof data.created==='number'?data.created:data.created?.length) ?? 0) + ' 张；成交前不产生收入。'), { primary: true, disabled: !s.newListings || state.busy || state.op.pending || !atMarket() }),
          button('取消', () => { surplusPreview = null; paint(); }, { ghost: true }),
        ]),
      ]);
      body.append(panel);
      panel.scrollIntoView({ block: 'nearest' });
    }

    paint();
    return {
      setTab(tab){if(TABS.some(([id])=>id===tab)){state.tab=tab;state.selected=null;paint();}},
      selectCard(cardKey){state.tab='collection';state.search='';state.selected=null;paint();const item=rowsFor().map(normalize).find(c=>c.cardKey===cardKey);if(item)return select(item);return callAction(actions,'openCardDetail',{cardKey});},
      getDraft(){const {op,...values}=state;return structuredClone({...values,busy:false,operation:op.current});},
      update(nextView) {
        const previous=view.worldId+':'+view.branchId;view=nextView;
        state.op.invalidate(nextView.branchId);
        if (nextView.worldId+':'+nextView.branchId!==previous) { state.quote = null; state.detail = null; state.detailOpen = false; state.selected = null; }
        paint();
      },
      dispose() { disposed = true; root.replaceChildren(); },
    };
  }
}
