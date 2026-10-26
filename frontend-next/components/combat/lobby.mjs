// deliverables/playability-v4/FAST-07/src/lobby.mjs
// 牌桌大厅组件：提供分页桌位/单桌信息、赛制、明示桌费、我的阵容摘要、独立选将入口、
// 开始等待/取消/返回桌边，以及独立店主桌费设定区。
import { el, clear, button, chip, rarityChip } from './dom.mjs';
import { injectStyles } from './styles.mjs';

const STATUS_LABELS = {
  idle: { text: '空闲可用', kind: 'success' },
  waiting: { text: '等候对手', kind: 'warn' },
  reserved: { text: '已预约', kind: 'info' },
  'in-progress': { text: '对战进行中', kind: 'info' },
  settling: { text: '对局结算中', kind: 'info' },
  error: { text: '异常待恢复', kind: 'danger' },
};

export function mountTableLobby({
  root,
  view = {},
  actions = {},
  draft = {},
  prefix = 'fast07',
}) {
  injectStyles(root);

  let disposed = false;

  let tables = view.tables || [];
  const initialTableId = draft.selectedTableId || (tables.length > 0 ? tables[0].tableId : null);

  const state = {
    selectedTableId: initialTableId,
    mode: 'kof',
    confirmedLineup: draft.confirmedLineup || view.confirmedLineup || { mode: 'kof', inventoryRefs: [], cards: [] },
    feeDraft: view.tableFeeConfig?.currentFee ?? 10,
    feeSaveFeedback: null,
  };

  const container = el('div', { class: `${prefix}-root ${prefix}-lobby` });
  root.replaceChildren(container);

  let headerNode, leftColNode, rightColNode, footerNode;

  function getSelectedTable() {
    return tables.find((t) => t.tableId === state.selectedTableId) || tables[0] || null;
  }

  function renderHeader() {
    clear(headerNode);
    headerNode.append(
      el('h3', { class: `${prefix}-lobby__title` }, [
        el('span', { text: '⚔ 牌桌对战大厅' }),
        chip('等候报名：1v1 三将接力', 'info'),
      ]),
      el('div', { class: `${prefix}-lobby__wallet` }, [
        el('span', { text: '可用资金：' }),
        el('strong', { text: `${view.balance ?? 500} 币` }),
      ])
    );
  }

  function renderLeftColumn() {
    clear(leftColNode);

    // 1. 牌桌卡片网格
    const grid = el('div', { class: `${prefix}-lobby__table-grid` });
    for (const table of tables) {
      const isSelected = table.tableId === state.selectedTableId;
      const st = STATUS_LABELS[table.status] || { text: table.status, kind: '' };

      grid.append(
        el(
          'div',
          {
            class: `${prefix}-table-card` + (isSelected ? ' is-selected' : ''),
            onclick: () => {
              state.selectedTableId = table.tableId;
              state.mode = 'kof';
              renderAll();
            },
          },
          [
            el('div', { class: `${prefix}-table-card__head` }, [
              el('span', { class: `${prefix}-table-card__name`, text: table.label }),
              chip(st.text, st.kind),
            ]),
            el('div', { class: `${prefix}-table-card__meta` }, [
              el('span', { text: `赛制: ${(table.mode || 'kof').toUpperCase()}` }),
              el('span', { text: `就座: ${table.seated} / ${table.maxSeats}` }),
            ]),
            el('div', { class: `${prefix}-table-card__meta` }, [
              el('span', { class: `${prefix}-table-card__fee`, text: `桌费: ${table.fee} 币` }),
              table.opponent ? el('span', { style: { color: 'var(--fast07-accent)' }, text: '有牌友' }) : el('span', { text: '空台' }),
            ]),
          ]
        )
      );
    }

    // 2. 牌桌单桌详细信息面板
    const curTable = getSelectedTable();
    const detailPanel = el('div', { class: `${prefix}-table-detail` });

    if (!curTable) {
      detailPanel.append(el('p', { class: `${prefix}-text-muted`, text: '请在上方选择一张牌桌查看详情。' }));
    } else {
      const st = STATUS_LABELS[curTable.status] || { text: curTable.status, kind: '' };
      detailPanel.append(
        el('div', { class: `${prefix}-table-detail__title` }, [
          el('span', { text: `【${curTable.label}】桌位详情` }),
          chip(st.text, st.kind),
        ]),
        el('div', { class: `${prefix}-stat-list` }, [
          el('div', { class: `${prefix}-stat-row` }, [
            el('span', { class: `${prefix}-stat-label`, text: '对战规则' }),
            el('span', { class: `${prefix}-stat-val`, text: ({'kof':'1v1 三将接力','doudizhu-bo3':'斗地主换边 BO3','versus2v2-bo3':'2v2 BO3'}[curTable.mode]||'尚未开桌') }),
          ]),
          el('div', { class: `${prefix}-stat-row` }, [
            el('span', { class: `${prefix}-stat-label`, text: '每人桌费' }),
            el('span', { class: `${prefix}-stat-val`, style: { color: 'var(--fast07-accent)' }, text: `${curTable.fee} 游戏币（顾客结算时支付，店长免费）` }),
          ]),
          el('div', { class: `${prefix}-stat-row` }, [
            el('span', { class: `${prefix}-stat-label`, text: '牌桌' }),
            el('span', { class: `${prefix}-stat-val`, text: curTable.note || '标准游戏桌' }),
          ]),
          el('div', { class: `${prefix}-stat-row` }, [
            el('span', { class: `${prefix}-stat-label`, text: '等候牌友' }),
            el('span', { class: `${prefix}-stat-val`, text: curTable.opponent ? `${curTable.opponent.name} (战绩: ${curTable.opponent.record})` : '暂无牌友，可以先报名等候' }),
          ]),
        ])
      );

      if (curTable.status === 'error') {
        detailPanel.append(
          el('div', { class: `${prefix}-chip ${prefix}-chip--danger`, style: { marginTop: '8px' }, text: '牌局中断了，请重开本局或取消尚未开始的比赛。' })
        );
      }
    }

    leftColNode.append(
      el('div', { style: { fontSize: '13px', fontWeight: '600', color: 'var(--fast07-text-muted)' }, text: '店内牌桌' }),
      grid,
      detailPanel
    );
  }

  function renderRightColumn() {
    clear(rightColNode);

    const curTable = getSelectedTable();
    const requiredSlots = 3;
    const lineupCards = state.confirmedLineup.cards || [];
    const isLineupFull = lineupCards.length === requiredSlots;

    // 1. 我的阵容摘要 (My Lineup Summary)
    const lineupPanel = el('div', { class: `${prefix}-panel` }, [
      el('div', { class: `${prefix}-panel__head` }, [
        el('span', { text: `我的参赛阵容 (三将接力 · 3 将)` }),
        button('选择武将 / 调整阵容', () => {
          if (typeof actions.openRosterPicker === 'function') {
            actions.openRosterPicker({
              mode: state.mode,
              currentRefs: state.confirmedLineup.inventoryRefs || [],
              onConfirm: (newLineup) => {
                state.confirmedLineup = newLineup;
                state.mode=newLineup.mode;renderAll();
              },
            });
          }
        }, { small: true, primary: !isLineupFull }),
      ]),
      el('div', { class: `${prefix}-roster-summary` }, [
        lineupCards.length === 0
          ? el('span', { class: `${prefix}-roster-slot-pill__empty`, text: '尚未选定出战武将，请点击上方按钮挑选阵容。' })
          : lineupCards.map((card, idx) =>
              el('div', { class: `${prefix}-roster-slot-pill` }, [
                el('span', { class: `${prefix}-roster-slot-pill__num`, text: `${idx + 1}.` }),
                rarityChip(card.rarity),
                el('strong', { text: card.name }),
              ])
            ),
      ]),
      !isLineupFull
        ? el('span', { style: { fontSize: '12px', color: 'var(--fast07-danger)' }, text: `⚠ 阵容未满：当前已选 ${lineupCards.length}/${requiredSlots} 位武将，选满后方可开始等待。` })
        : el('span', { style: { fontSize: '12px', color: 'var(--fast07-success)' }, text: '✓ 阵容完备，随时可加入候战队列。' }),
    ]);

    // 2. 候战报名与桌位排队 (Waiting & Queue Action)
    const inQueue = view.queue && view.queue.status !== 'none';
    const queuePanel = el('div', { class: `${prefix}-panel` }, [
      el('div', { class: `${prefix}-panel__head` }, [
        el('span', { text: '牌桌报名与候战操作' }),
        inQueue ? chip('正在候战队列中', 'warn') : chip('未报名', 'info'),
      ]),
      el('div', { style: { fontSize: '13px', lineHeight: '1.5' } }, [
        el('p', { text: `当前牌桌：${curTable?.label || '未选择'} · 模式 ${(curTable?.mode || state.mode).toUpperCase()}` }),
        el('p', { text: `每位顾客桌费： ${curTable?.fee ?? 10} 币（店长免费）` }),
      ]),
      el('div', { style: { display: 'flex', gap: '8px', flexWrap: 'wrap', marginTop: '6px' } }, [
        !inQueue
          ? button('开始等待对手 (进入候战)', () => {
              if (!isLineupFull || !curTable) return;
              if (typeof actions.joinQueue === 'function') {
                actions.joinQueue({
                  tableId: curTable.tableId,
                  mode: state.mode,
                  inventoryRefs: state.confirmedLineup.inventoryRefs,
                });
              }
            }, {
              primary: true,
              disabled: !isLineupFull || !curTable || curTable.status === 'in-progress' || curTable.status === 'error',
              title: !isLineupFull ? '需先选齐出战阵容' : curTable.status === 'in-progress' ? '该桌对战进行中' : '开始在店内候战',
            })
          : el('div', { style: { display: 'flex', gap: '8px', width: '100%' } }, [
              button('取消候战等待', () => {
                if (typeof actions.leaveQueue === 'function') actions.leaveQueue();
              }, { danger: true }),
              button('返回当前桌边', () => {
                if (typeof actions.goToTable === 'function') actions.goToTable({ tableId: curTable.tableId });
              }, { ghost: true }),
            ]),
      ]),
    ]);

    // 3. 店主收费设置独立块 (Store Owner Table Fee Settings)
    const feeConfig = view.tableFeeConfig || { currentFee: 10, minFee: 0, maxFee: 30, step: 2, presets: [0, 6, 10, 16, 20] };
    const feePanel = el('div', { class: `${prefix}-panel ${prefix}-fee-config` }, [
      el('div', { class: `${prefix}-panel__head` }, [
        el('span', { text: '店主开桌费设定（自主定价）' }),
        el('span', { style: { color: 'var(--fast07-accent)', fontWeight: '700' }, text: `${state.feeDraft} 币 / 人` }),
      ]),
      el('p', { style: { fontSize: '12px', color: 'var(--fast07-text-muted)' }, text: feeConfig.note || '设定每桌入座结算时收取的服务费；新收费在保存后下一次入座生效。' }),

      // 档位快速点选
      el('div', { class: `${prefix}-fee-presets` }, [
        el('span', { style: { fontSize: '12px', color: 'var(--fast07-text-muted)', alignSelf: 'center' }, text: '推荐档位:' }),
        ...(feeConfig.presets || [0, 6, 10, 16, 20]).map((preset) =>
          button(`${preset === 0 ? '0 (免费)' : preset + ' 币'}`, () => {
            state.feeDraft = preset;
            renderRightColumn();
          }, {
            small: true,
            primary: state.feeDraft === preset,
          })
        ),
      ]),

      // 微调与保存
      el('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', marginTop: '4px' } }, [
        button('−2 币', () => {
          state.feeDraft = Math.max(feeConfig.minFee ?? 0, state.feeDraft - (feeConfig.step || 2));
          renderRightColumn();
        }, { small: true }),
        el('span', { style: { fontSize: '13px', fontWeight: '600', minWidth: '60px', textAlign: 'center' }, text: `${state.feeDraft} 金币` }),
        button('+2 币', () => {
          state.feeDraft = Math.min(feeConfig.maxFee ?? 50, state.feeDraft + (feeConfig.step || 2));
          renderRightColumn();
        }, { small: true }),
        button('保存桌费', async () => {
          if (typeof actions.setTableFee === 'function') {
            state.feeSaveFeedback='保存中…';renderRightColumn();
            try{const result=await actions.setTableFee({ amount: state.feeDraft });if(disposed)return;state.feeSaveFeedback=result?.ok?'已保存桌费，已接受的费用保持原值。':result?.error?.message||'桌费尚未保存。';}
            catch{if(disposed)return;state.feeSaveFeedback='保存结果未确认，请查看上次操作。';}
            renderRightColumn();
          }
        }, { primary: true, small: true }),
      ]),
      state.feeSaveFeedback ? el('span', { class: `${prefix}-fee-feedback`, text: `✓ ${state.feeSaveFeedback}` }) : null,
    ]);

    rightColNode.append(lineupPanel, queuePanel, feePanel);
  }

  function renderFooter() {
    clear(footerNode);
    footerNode.append(
      button('关闭大厅 (回到店铺)', () => {
        if (typeof actions.close === 'function') actions.close();
      }, { ghost: true })
    );
  }

  function renderAll() {
    renderHeader();
    renderLeftColumn();
    renderRightColumn();
    renderFooter();
  }

  headerNode = el('div', { class: `${prefix}-lobby__header` });
  leftColNode = el('div', { class: `${prefix}-lobby__left-col` });
  rightColNode = el('div', { class: `${prefix}-lobby__right-col` });
  const mainNode = el('div', { class: `${prefix}-lobby__main` }, [leftColNode, rightColNode]);
  footerNode = el('div', { class: `${prefix}-lobby__footer` });

  container.append(headerNode, mainNode, footerNode);

  renderAll();

  return {
    update(nextView) {
      if (disposed || !nextView) return;
      Object.assign(view, nextView);
      if(nextView.tables)tables=nextView.tables;
      if (nextView.confirmedLineup) state.confirmedLineup = nextView.confirmedLineup;
      if (nextView.tableFeeConfig?.currentFee != null) state.feeDraft = nextView.tableFeeConfig.currentFee;
      renderAll();
    },
    getDraft() {
      return {
        selectedTableId: state.selectedTableId,
        mode: state.mode,
        confirmedLineup: state.confirmedLineup,
        feeDraft: state.feeDraft,
      };
    },
    dispose() {
      disposed = true;
      clear(container);
      container.remove();
    },
  };
}
