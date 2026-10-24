// PLAY-B · B2 拆包与结果处理。
// 三条明确路径：单包欣赏 / 整盒快开 / 全部散包。流程始终是 预览 → 确认 → 提交 → 结果；
// 预览不透露密封内容；动画只是展示，业务结果以 actions.openingExecute 的返回为准，
// 结果未知时进入原号恢复，绝不重新生成一批卡。
import { el, button, segmented, sectionCard, emptyState, muted, errorText, chip, rarityChip, stepper, packaging, art, spinner } from './dom.mjs';
import { injectStyles } from './styles.mjs';
import { createFormatter } from './format.mjs';
import { createOperationState, pendingBlock, callAction, describeError, queryOperationResult, retryOperationResult } from './ops.mjs';

const PATHS = [
  ['single', '单包欣赏', '选一组散包逐包开，适合看卡面、听节奏。'],
  ['box', '整盒快开', '拆开一盒的密封包装按整盒预览，节奏更快。'],
  ['all', '全部散包', '一次开掉全部可用散包；默认不含整盒。'],
];

export function mountUnbox({ root, view, actions, assets, format, notify, draft = {} }) {
  {
    const money = createFormatter(format);
    const state = {
      path: 'single', productId: null, quantity: 1, includeBoxes: false,
      preview: null, result: null, op: createOperationState(), busy: false,
      revealed: 0, revealTimer: null, surplus: null, surplusOp: createOperationState(),
      resultMode: 'animating',
      ...draft, op:createOperationState(draft.operation),busy:false,
      surplusOp:createOperationState(draft.surplusOperation),revealTimer:null,resultMode:draft.result?'done':'animating',
    };
    let disposed = false;
    const body = el('div', { class: 'pbc-body', 'data-unbox-root': 'true' });
    root.replaceChildren(body);
    injectStyles(root);

    const atOpening = () => view.atStation?.opening !== false;
    const packs = () => (view.sealed || []).filter(g => g.kind === 'pack');
    const boxes = () => (view.sealed || []).filter(g => g.kind === 'box');
    const totalAvailable = rows => rows.reduce((n, g) => n + g.available, 0);
    function stopReveal() { if (state.revealTimer) { clearInterval(state.revealTimer); state.revealTimer = null; } }

    function scope() {
      if(state.selectedRefs?.length)return {inventoryRefs:state.selectedRefs,includeBoxes:!!state.includeBoxes||state.path==='box'};
      if (state.path === 'single') return { productId: state.productId, quantity: state.quantity };
      if (state.path === 'box') {
        const group = boxes().find(g => g.productId === state.productId);
        return group ? { inventoryRefs: group.inventoryRefs.slice(0,1), includeBoxes: true } : null;
      }
      return {includeBoxes:state.includeBoxes};
    }

    async function makePreview() {
      if (state.busy || state.op.pending) return;
      if (state.path === 'single' && (!Number.isSafeInteger(state.quantity) || state.quantity < 1)) return notify('开包数量应为 1 以上的整数。', 'error');
      const s = scope();
      if (!s || (!s.productId && !s.inventoryRefs?.length && state.path !== 'all')) return notify('请先选择要开的商品。', 'error');
      state.busy = true; state.preview = null; paint();
      const result = await callAction(actions, 'openingPreview', s);
      state.busy = false;
      if (result.ok) {
        state.preview = result.data;
        notify(result.data.packs
          ? '范围已确认：' + result.data.packs + ' 包 · ' + result.data.cards + ' 张卡。密封内容要在确认后才会揭晓。'
          : '当前范围没有可拆的卡包；请检查仓库、保护状态或包含整盒选项。', result.data.packs ? 'success' : 'info');
      } else notify(describeError(result.error), 'error');
      paint();
    }

    async function execute() {
      if (state.busy || state.op.pending || !state.preview) return;
      if (!atOpening()) return notify('开包需站在拆包台；请先到拆包台再确认。', 'info');
      const op = state.op.begin({ type: 'opening.execute', previewId: state.preview.previewId, payload: {} }, view.branchId);
      state.busy = true; paint();
      const result = await callAction(actions, 'openingExecute', { previewId: state.preview.previewId, requestId: op.requestId });
      state.op.finish(result, view.branchId); state.busy = false;
      if (result.ok) {
        state.result = result.data.opening || null;
        state.preview = null;
        if (!state.result || !Array.isArray(state.result.results)) {
          notify('未收到完整开包结果，请保留操作号并查询原操作。', 'error');
        } else {
          state.resultMode = 'animating'; state.revealed = 0;
          notify('开包已写入收藏。动画只是展示，关闭窗口不会退回这批卡。', 'success');
          startReveal();
        }
      } else {
        notify(describeError(result.error), 'error');
      }
      paint();
    }

    async function recover(retry) {
      if (state.busy || !state.op.pending) return;
      state.busy = true; paint();
      const result = await (retry ? retryOperationResult(state.op, actions) : queryOperationResult(state.op, actions, view.branchId));
      state.op.finish(result, view.branchId); state.busy = false;
      if (result.ok) {
        state.result = result.data?.opening || null; state.preview = null;
        state.resultMode = 'animating'; state.revealed = 0;
        if (state.result) startReveal();
        notify('已找回原操作结果，未重复生成卡牌。', 'success');
      } else notify(describeError(result.error), 'error');
      paint();
    }

    // ── 揭卡动画：只使用已结算的 result 数据；可跳过；大批量自动直达结果 ──
    function startReveal() {
      stopReveal();
      const results = state.result?.results || [];
      if (results.length > 24) { state.resultMode = 'done'; return; }
      const perCard = state.path === 'single' ? 520 : state.path === 'box' ? 260 : 120;
      paint();
      state.revealTimer = setInterval(() => {
        state.revealed++;
        if (state.revealed >= results.length) { stopReveal(); state.resultMode = 'done'; }
        paint();
      }, perCard);
    }
    function skipReveal() {
      stopReveal();
      state.revealed = state.result?.results?.length || 0;
      state.resultMode = 'done';
      paint();
    }

    async function loadSurplus() {
      if (state.busy) return;
      state.busy = true; paint();
      const result = await callAction(actions, 'surplusPreview', {});
      state.busy = false;
      if (result.ok) { state.surplus = result.data; notify('留一上架预览已生成；数量与费用来自预览，不是“持有减一”。', 'success'); }
      else notify(describeError(result.error), 'error');
      paint();
    }
    async function confirmSurplus() {
      if (state.busy || state.surplusOp.pending || !state.surplus) return;
      if (view.atStation?.market!==true) {notify('请先到二级市场柜台上架；卡牌已经在收藏中。','info');return callAction(actions,'openMarket',{tab:'collection'});}
      const op = state.surplusOp.begin({ type: 'market.listSurplus', previewId: state.surplus.previewId, payload: {} }, view.branchId);
      state.busy = true; paint();
      const result = await callAction(actions, 'listSurplus', { previewId: state.surplus.previewId, requestId: op.requestId });
      state.surplusOp.finish(result, view.branchId); state.busy = false;
      if (result.ok) {
        state.surplus = null;
        notify('已按预览批量上架 ' + ((typeof result.data.created==='number'?result.data.created:result.data.created?.length) ?? 0) + ' 张；成交前不产生收入。', 'success');
        actions?.openMarket?.({ tab: 'mine' });
      } else if (result.error?.code === 'PREVIEW_EXPIRED') { state.surplus = null; notify(describeError(result.error) + '，请重新生成预览。', 'error'); }
      else notify(describeError(result.error), 'error');
      paint();
    }

    // ── 渲染 ─────────────────────────────
    function paint() {
      if (disposed) return;
      body.replaceChildren();
      if (state.op.pending) {
        body.append(pendingBlock(state.op.current, {
          busy: state.busy,
          onQuery: () => recover(false),
          onRetry: () => recover(true),
        }));
      }
      if (state.result) { paintReveal(); return; }
      if (state.preview) { paintPreview(); return; }
      paintChoose();
    }

    function paintChoose() {
      const toolbar = el('div', { class: 'pbc-tabbar' }, [
        segmented(PATHS.map(p => [p[0], p[1]]), state.path, id => { state.path = id;state.selectedRefs=null; state.preview = null; state.productId = null; paint(); }, '开包路径'),
        muted(PATHS.find(p => p[0] === state.path)?.[2] || '', 'pbc-tabbar__hint'),
      ]);
      body.append(toolbar);
      const summary = sectionCard('当前密封库存',
        muted('散包 ' + packs().reduce((n, g) => n + g.warehouse, 0) + ' 包（可用 ' + totalAvailable(packs()) + '）· 整盒 ' + boxes().reduce((n, g) => n + g.warehouse, 0) + ' 盒（可用 ' + totalAvailable(boxes()) + '）。货架上的商品不在开包范围。'));
      body.append(summary);

      if (state.path === 'single') {
        const options = packs().filter(g => g.available > 0);
        if (!options.length) { body.append(emptyState('没有可用散包。', '先去采购并签收，或拆盒出包。')); return; }
        if (!state.productId || !options.some(g => g.productId === state.productId)) state.productId = options[0].productId;
        const group = options.find(g => g.productId === state.productId);
        const art = packaging(assets, group.productId, 'pack', group.name);
        art.style.cssText = 'width:96px;height:128px';
        const select = el('select', { class: 'pbc-input', 'aria-label': '选择散包主题', onchange: e => { state.productId = e.target.value;state.selectedRefs=null; state.preview=null;paint(); } },
          options.map(g => el('option', { value: g.productId, selected: g.productId === state.productId, text: g.name + '（可用 ' + g.available + '）' })));
        const max = Math.min(group.available, 10);
        body.append(sectionCard('单包欣赏 · ' + group.name,
          el('div', { class: 'pbc-actions' }, [art, el('div', { style: 'display:grid;gap:8px;min-width:0' }, [
            el('label', { class: 'pbc-muted', style: 'display:flex;gap:8px;align-items:center' }, ['主题 ', select]),
            el('div', { class: 'pbc-actions' }, ['开包数量 ', stepper({ value: Math.min(state.quantity, max), min: 1, max, label: '开包数量', onChange: q => { state.quantity = q; paint(); } })]),
            muted('逐包揭晓动画，适合欣赏；整盒快开在另一条路径。'),
            button('生成开包预览', makePreview, { primary: true, disabled: state.busy }),
          ])])));
        return;
      }
      if (state.path === 'box') {
        const options = boxes().filter(g => g.available > 0);
        if (!options.length) { body.append(emptyState('没有可用整盒。', '整盒快开需要仓库里的密封卡盒。')); return; }
        if (!state.productId || !options.some(g => g.productId === state.productId)) state.productId = options[0].productId;
        const group = options.find(g => g.productId === state.productId);
        const art = packaging(assets, group.productId, 'box', group.name);
        art.style.cssText = 'width:110px;height:110px';
        const select = el('select', { class: 'pbc-input', 'aria-label': '选择整盒主题', onchange: e => { state.productId = e.target.value;state.selectedRefs=null; state.preview=null;paint(); } },
          options.map(g => el('option', { value: g.productId, selected: g.productId === state.productId, text: g.name + '（可用 ' + g.available + ' 盒）' })));
        body.append(sectionCard('整盒快开 · ' + group.name,
          el('div', { class: 'pbc-actions' }, [art, el('div', { style: 'display:grid;gap:8px;min-width:0' }, [
            el('label', { class: 'pbc-muted', style: 'display:flex;gap:8px;align-items:center' }, ['主题 ', select]),
            muted('范围：' + group.name + ' 的 ' + group.available + ' 盒可用整盒，共 ' + group.available * (group.spec?.packsPerBox || 24) + ' 包；余包保持原内容。'),
            muted((group.spec?.guarantees || []).join('；')),
            button('生成开包预览', makePreview, { primary: true, disabled: state.busy }),
          ])])));
        return;
      }
      // 全部散包
      const checkbox = el('input', {
        type: 'checkbox', 'aria-label': '包含密封整盒',
        onchange: e => { state.includeBoxes = e.target.checked; paint(); },
      });
      checkbox.checked = !!state.includeBoxes;
      body.append(sectionCard('全部散包',
        muted('范围：全部可用散包 ' + totalAvailable(packs()) + ' 包' + (state.includeBoxes ? '，以及全部可用整盒 ' + totalAvailable(boxes()) + ' 盒' + '（整盒余包保持原内容）' : '。不含整盒；需要拆收藏中的整盒时再勾选。')),
        el('label', { class: 'pbc-actions', style: 'font-size:14px' }, [checkbox, '包含密封整盒' + (totalAvailable(boxes()) ? '（当前可用 ' + totalAvailable(boxes()) + ' 盒）' : '（没有可用整盒）')]),
        totalAvailable(packs()) + (state.includeBoxes ? totalAvailable(boxes()) : 0) === 0
          ? errorText('当前范围内没有可拆的商品。')
          : null,
        el('div', { class: 'pbc-actions' }, [button('生成开包预览', makePreview, { primary: true, disabled: state.busy })])));
    }

    function paintPreview() {
      const p = state.preview;
      const pathName = PATHS.find(x => x[0] === state.path)?.[1];
      body.append(sectionCard('开包预览 · ' + pathName,
        el('p', { style: 'font-size:16px;font-weight:700', text: '消耗 ' + p.packs + ' 包 · 将获得 ' + p.cards + ' 张卡 · 涉及密封盒 ' + (p.boxes || 0) + ' 盒' }),
        muted('受保护或占用的仓库商品排除 ' + (p.excluded || 0) + ' 件。整盒只取本次所需包，余包保留原内容。'),
        muted('这里不会提前显示任何卡牌；确认后到拆包台提交。'),
        state.op.pending ? spinner() : el('div', { class: 'pbc-actions' }, [
          button(atOpening() ? '确认开包' : '前往拆包台后再确认', execute, { primary: true, disabled: !p.packs || state.busy || state.op.pending, title: atOpening() ? undefined : '开包需站在拆包台' }),
          button('取消本次预览', () => { state.preview = null; paint(); }, { ghost: true }),
        ])));
    }

    function paintReveal() {
      const result = state.result;
      const results = result.results || [];
      const revealedCount = state.resultMode === 'animating' ? Math.min(state.revealed, results.length) : results.length;
      const done = state.resultMode !== 'animating';
      const stage = el('div', { class: 'pbc-reveal__stage', 'data-opening-cards': 'true' });
      results.slice(0, revealedCount).forEach(card => {
        const frame = el('figure', { class: 'pbc-reveal__card', style: 'position:relative;margin:0;width:92px' }, [art(card.imageUrl, card.name)]);
        frame.querySelector('.pbc-art').style.cssText = 'width:92px;height:128px';
        frame.append(el('span', { style: 'position:absolute;left:4px;bottom:4px' }, [rarityChip(card.printedRarity)]));
        if (card.isNew) frame.append(el('span', { class: 'pbc-chip pbc-chip--gold', style: 'position:absolute;right:2px;top:2px', text: '新收录' }));
        stage.append(frame);
      });
      const panel = el('div', { class: 'pbc-reveal', 'data-opening-result': 'true' }, [
        el('h3', { text: done ? '已开 ' + result.packs + ' 包 · 收入 ' + results.length + ' 张实物卡' : '正在揭晓…（' + revealedCount + ' / ' + results.length + '）' }),
        stage,
        el('div', { class: 'pbc-actions' }, [
          done ? null : button('跳过动画', skipReveal, { primary: true }),
          done ? raritySummary(result) : null,
        ]),
        muted(done
          ? '这批卡已实际写入收藏；上面的动画只是展示。'
          : '动画可以跳过；无论动画是否播完，业务结果都以下方结算状态为准。'),
      ]);
      body.append(panel);
      if (done) {
        body.append(paintSurplus());
        body.append(el('div', { class: 'pbc-actions' }, [
          button('再开一批', () => { stopReveal(); state.result = null; state.resultMode = 'animating'; state.surplus = null; paint(); }, { primary: true }),
          button('去二级市场看重复牌', () => actions?.openMarket?.({ tab: 'sell' }), { ghost: true }),
        ]));
      }
    }
    function raritySummary(result) {
      return el('span', { class: 'pbc-actions' }, ['SSR', 'SR', 'R', 'N'].map(r =>
        chip(r + ' × ' + (result.byRarity?.[r] || 0))));
    }

    function paintSurplus() {
      const s = state.surplus;
      const card = sectionCard('保留一张，其余上架');
      if (!s) {
        card.append(muted('重复牌可以批量上架：每种印刷版保留 1 张，其余挂到二级市场。数量、排除与费用以预览为准。'),
          el('div', { class: 'pbc-actions' }, [button('生成留一上架预览', loadSurplus, { disabled: state.busy || state.surplusOp.pending })]));
      } else {
        card.append(
          el('div', { class: 'pbc-line' }, [el('span', { text: '每种印刷版至少保留' }), el('strong', { text: s.keep })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '本次新增挂单' }), el('strong', { text: s.newListings })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '已在售' }), el('strong', { text: s.alreadyListed })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '保护 / 锁定排除' }), el('strong', { text: s.lockedExcluded })]),
          el('div', { class: 'pbc-line' }, [el('span', { text: '预计挂牌费' }), el('strong', { text: money(s.estimatedFee) })]),
          muted('受保护或占用副本会计入保留；确认时会重新核对保留数量与可售库存。'),
          state.surplusOp.pending ? pendingBlock(state.surplusOp.current, { busy: state.busy, onQuery: () => recoverSurplus(false), onRetry: () => recoverSurplus(true) })
            : el('div', { class: 'pbc-actions' }, [
              button('确认批量上架', confirmSurplus, { primary: true, disabled: !s.newListings || state.busy }),
              button('取消预览', () => { state.surplus = null; paint(); }, { ghost: true }),
            ]));
      }
      return card;
    }

    async function recoverSurplus(retry){if(state.busy)return;state.busy=true;paint();const result=await(retry?retryOperationResult(state.surplusOp,actions):queryOperationResult(state.surplusOp,actions,view.branchId));state.surplusOp.finish(result,view.branchId);state.busy=false;if(result.ok)state.surplus=null;notify(result.ok?'已找回原批量上架结果。':describeError(result.error),result.ok?'success':'error');paint();}
    paint();
    return {
      setScope(scope){if(state.op.pending)return;state.preview=null;state.productId=scope.productId||null;if(scope.inventoryRefs?.length){state.selectedRefs=scope.includeBoxes?scope.inventoryRefs.slice(0,1):[...scope.inventoryRefs];state.path=scope.includeBoxes?'box':'single';}paint();},
      getDraft(){const {op,surplusOp,revealTimer,...values}=state;return structuredClone({...values,busy:false,operation:op.current,surplusOperation:surplusOp.current});},
      update(nextView) {
        const previousBranch=view.worldId+':'+view.branchId;view = nextView;
        state.op.invalidate(nextView.branchId);
        state.surplusOp.invalidate(nextView.branchId);
        if (nextView.worldId+':'+nextView.branchId !== previousBranch) {
          stopReveal();
          state.preview = null; state.result = null; state.surplus = null;state.selectedRefs=null; state.resultMode = 'animating';
        }
        paint();
      },
      dispose() { disposed = true; stopReveal(); root.replaceChildren(); },
    };
  }
}
