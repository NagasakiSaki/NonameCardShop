// deliverables/playability-v4/FAST-07/src/waiting-bar.mjs
// 非模态候战状态条：悬浮于地图顶部，展示等待状态、赛制、阵容与快速操作。
// 绝不申请暂停令牌、不捕获全局按键、不遮挡地图交互、不接管玩家移动坐标。
import { el, clear, button, chip } from './dom.mjs';
import { injectStyles } from './styles.mjs';

const STATE_MAPPINGS = {
  waiting: { label: '等候对手入座', chipKind: 'warn' },
  opponent_ready: { label: '对手就绪·核验中', chipKind: 'info' },
  loading: { label: '准备载入牌局', chipKind: 'info' },
  playing: { label: '比赛进行中', chipKind: 'success' },
  error: { label: '异常待恢复', chipKind: 'danger' },
};

export function mountWaitingBar({
  root,
  view = {},
  actions = {},
  prefix = 'fast07',
}) {
  injectStyles(root);

  let disposed = false;

  // 宿主节点必须使用 pointer-events: none，只允许条身接收事件
  const host = el('div', { class: `${prefix}-waiting-bar-host ${prefix}-root`,style:{position:'static',transform:'none',width:'100%',height:'auto',overflow:'visible',maxWidth:'none',background:'transparent'} });
  root.appendChild(host);

  function render() {
    clear(host);

    // 如果未进入排队，则不显示候战条
    if (!view || view.status === 'none' || !view.status) return;

    const statusConfig = STATE_MAPPINGS[view.status] || { label: view.status, chipKind: '' };
    const autoMove = view.autoMove !== false;
    const tableTitle = view.tableLabel || view.tableId || '牌桌';
    const modeTitle = (view.mode || 'kof').toUpperCase();
    const lineupNames = (view.lineup || []).map((c) => c.name).join(' · ') || '未命名阵容';

    const bar = el('div', { class: `${prefix}-waiting-bar` }, [
      // 脉冲状态指示点 + 状态文字
      el('div', { class: `${prefix}-waiting-bar__status-chip` }, [
        el('span', { class: `${prefix}-waiting-bar__pulse-dot` }),
        chip(statusConfig.label, statusConfig.chipKind),
      ]),

      // 概要信息
      el('div', { class: `${prefix}-waiting-bar__info` }, [
        el('strong', { text: `${tableTitle} (${modeTitle})` }),
        el('span', { style: { color: 'var(--fast07-text-muted)' }, text: `阵容: ${lineupNames}` }),
        view.opponent ? el('span', { style: { color: 'var(--fast07-accent)' }, text: `对手: ${view.opponent.name}` }) : null,
      ]),

      // 动作栏
      el('div', { class: `${prefix}-waiting-bar__actions` }, [
        // 自动移动开关（委托主模型，组件不改坐标）
        view.status==='waiting'?button(autoMove ? '自动走动：开' : '自动走动：关', () => {
          if (typeof actions.setWaitMode === 'function') {
            actions.setWaitMode({ autoMove: !autoMove });
          }
        }, {
          small: true,
          ghost: !autoMove,
          title: '候战期间自动在店内走动，手动输入可接管。',
        }):null,

        // 返回桌边
        button(view.status==='waiting'?'返回桌边':'继续牌局', () => {
          if (typeof actions.goToTable === 'function') {
            actions.goToTable({ tableId: view.tableId });
          }
        }, { small: true, ghost: true }),

        // 打开大厅
        button('查看大厅', () => {
          if (typeof actions.openLobby === 'function') {
            actions.openLobby({ tableId: view.tableId });
          }
        }, { small: true }),

        // 取消等待
        view.status==='waiting'?button('取消等待', () => {
          if (typeof actions.leaveQueue === 'function') {
            actions.leaveQueue();
          }
        }, { small: true, danger: true }):null,
      ]),
    ]);

    host.appendChild(bar);
  }

  render();

  return {
    update(nextView) {
      if (disposed || !nextView) return;
      Object.assign(view, nextView);
      render();
    },
    dispose() {
      disposed = true;
      clear(host);
      host.remove();
    },
  };
}
