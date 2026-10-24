// PLAY-B · 交易工作区：同一空间切换 采购/货架、拆包、收藏/市场 三个任务视图。
// 组件同时保持挂载，切换不丢草稿与滚动；销毁时全部清理。暂停令牌、站位与
// 真实提交由主模型的适配层承担——本组件只表达意图。
import { el, chip } from './dom.mjs';
import { injectStyles, FORMAL_CSS } from './styles.mjs';
import { mountPurchase } from './purchase.mjs';
import { mountUnbox } from './unbox.mjs';
import { mountCollection } from './collection.mjs';

const SECTIONS = [
  ['purchase', '采购与货架'],
  ['unbox', '拆包'],
  ['collection', '收藏与市场'],
];

export function mountTradeWorkspace({ root, view, actions = {}, assets = {}, format, draft = {}, title = '卡店交易台' }) {
  let current = view;
  let disposed = false;
  const messages = [];
  const header = el('div', { class: 'pbc-header', role: 'banner' });
  const messageNode = el('div', { class: 'pbc-message', role: 'status', 'aria-live': 'polite' });
  const nav = el('nav', { class: 'pbc-nav', 'aria-label': '交易工作区' });
  const panels = { purchase: el('div', { style: 'min-width:0;min-height:0' }), unbox: el('div', { style: 'min-width:0;min-height:0' }), collection: el('div', { style: 'min-width:0;min-height:0' }) };
  const notify = (text, kind = 'info') => {
    messages.unshift({ text, kind, at: Date.now() });
    messages.length = Math.min(messages.length, 3);
    renderMessage();
  };
  function renderMessage() {
    const m = messages[0];
    if (!m) { messageNode.replaceChildren(); return; }
    messageNode.replaceChildren(el('span', { text: m.text }));
    messageNode.dataset.kind = m.kind;
  }
  function renderHeader() {
    const minute = Math.floor(current.clock?.minute ?? 0);
    header.replaceChildren(
      el('span', { class: 'pbc-header__title', text: title }),
      el('span', { class: 'pbc-header__meta' }, [
        el('span', { text: '第 ' + (current.clock?.day ?? '—') + ' 天 ' + String(Math.floor(minute / 60)).padStart(2, '0') + ':' + String(minute % 60).padStart(2, '0') }),
        el('span', {}, ['现金 ', el('strong', { text: fmt(current.wallet?.available) })]),
        el('span', {}, ['授信 ', el('strong', { text: fmt(current.wallet?.supplierCreditAvailable) })]),
        chip('真实库存 · 游戏币结算'),
      ]),
    );
  }
  const fmt = amount => Number.isSafeInteger(amount)?(format?format(amount):amount.toLocaleString('zh-CN')):'—';
  function renderNav() {
    nav.replaceChildren(...SECTIONS.map(([id, label]) => el('button', {
      class: 'pbc-seg' + (activeSection === id ? ' is-active' : ''), type: 'button', text: label,
      'aria-pressed': String(activeSection === id),
      onclick: () => setSection(id),
    })));
  }
  let activeSection = draft.section || 'purchase';
  function setSection(id) {
    activeSection = id;
    for (const [key, node] of Object.entries(panels)) node.hidden = key !== id;
    renderNav();
  }

  const container = el('div', { style: 'display:flex;flex-direction:column;flex:1;min-height:0' });
  root.replaceChildren(header, messageNode, nav, container);
  injectStyles(root);root.append(el('style',{text:FORMAL_CSS}));
  Object.values(panels).forEach(p => container.append(p));

  const shared = { actions, assets, format, notify };
  const children = {
    purchase: mountPurchase({ root: panels.purchase, view, draft:draft.purchase, ...shared }),
    unbox: mountUnbox({ root: panels.unbox, view, draft:draft.unbox, ...shared }),
    collection: mountCollection({ root: panels.collection, view, draft:draft.collection, ...shared }),
  };
  setSection(activeSection);
  renderHeader();

  return {
    setSection,
    setPurchaseTab(tab){children.purchase.setTab(tab);},
    getDraft(){return {section:activeSection,...Object.fromEntries(Object.entries(children).map(([id,c])=>[id,c.getDraft()]))};},
    selectCard(cardKey){setSection('collection');return children.collection.selectCard(cardKey);},
    setTab(tab){children.collection.setTab(tab);},
    setOpeningScope(scope){children.unbox.setScope(scope);},
    update(nextView) {
      if (disposed) return;
      const branchChanged = nextView.branchId !== current.branchId;
      current = nextView;
      renderHeader();
      for (const child of Object.values(children)) child.update(nextView);
      if (branchChanged) notify('已读取新的进度分支：旧报价、预览和选中实物已失效，需要重新确认。', 'info');
    },
    dispose() {
      disposed = true;
      for (const child of Object.values(children)) { try { child.dispose(); } catch { /* 保持其余清理 */ } }
      root.replaceChildren();
    },
  };
}
