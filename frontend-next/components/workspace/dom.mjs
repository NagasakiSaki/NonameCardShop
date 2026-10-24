// PLAY-B 展示层：纯 DOM 构造助手。组件不创建全局副作用；样式由 styles.js 注入组件根内。
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'text') node.textContent = value;
    else if (key === 'class') node.className = value;
    else if (key.startsWith('on') && typeof value === 'function') node.addEventListener(key.slice(2), value);
    else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export const RARITIES = ['SSR', 'SR', 'R', 'N'];

export function rarityChip(value, label) {
  return el('span', { class: 'pbc-rarity pbc-rarity--' + value, text: label || value });
}

export function button(text, onclick, { primary = false, ghost = false, small = false, disabled = false, title } = {}) {
  return el('button', {
    class: 'pbc-btn' + (primary ? ' pbc-btn--primary' : '') + (ghost ? ' pbc-btn--ghost' : '') + (small ? ' pbc-btn--small' : ''),
    type: 'button', text, onclick, disabled, title: title || null,
  });
}

export function segmented(options, current, onChange, label) {
  return el('div', { class: 'pbc-segmented', role: 'group', 'aria-label': label },
    options.map(([id, text]) => el('button', {
      class: 'pbc-seg' + (id === current ? ' is-active' : ''), type: 'button', text,
      'aria-pressed': String(id === current),
      onclick: () => onChange(id),
    })));
}

export function sectionCard(title, ...children) {
  return el('section', { class: 'pbc-card' }, [title ? el('h3', { text: title }) : null, ...children]);
}

export function line(label, value) {
  return el('div', { class: 'pbc-line' }, [el('span', { class: 'pbc-muted', text: label }), el('strong', { text: String(value ?? '—') })]);
}

export function emptyState(text, hint) {
  return el('div', { class: 'pbc-empty' }, [el('p', { text }), hint ? el('small', { class: 'pbc-muted', text: hint }) : null]);
}

export function errorText(text) { return el('p', { class: 'pbc-error', text }); }
export function muted(text, extra = '') { return el('p', { class: 'pbc-muted ' + extra, text }); }

// 卡图框：比例保留；加载失败或无 URL 时给可读名称占位，不显示裂图。
export function art(url, name, className = '') {
  const frame = el('div', { class: 'pbc-art ' + className });
  const missing = () => {
    frame.classList.add('pbc-art--missing');
    frame.replaceChildren(el('span', { 'aria-hidden': true, text: '◇' }), el('small', { text: name + ' · 暂无卡图' }));
  };
  const image = el('img', { alt: name + ' 卡面', loading: 'lazy', decoding: 'async' });
  image.addEventListener('error', missing, { once: true });
  if (url) { image.src = url; frame.append(image); } else missing();
  return frame;
}

// 头像/立绘：只用于交易对象、求购人等具体对话位置；缺图回退首字圆形。
export function avatar(url, name, className = '') {
  const frame = el('span', { class: 'pbc-avatar ' + className, title: name });
  const image = el('img', { alt: name + ' 头像', loading: 'lazy', decoding: 'async' });
  image.addEventListener('error', () => { frame.replaceChildren(el('span', { text: name.slice(0, 1) })); }, { once: true });
  image.src = url; frame.append(image);
  return frame;
}

// 包装图：productId+kind → URL 由 assets 提供，缺映射时占位。
export function packaging(assets, productId, kind, name) {
  const url = assets?.productImage?.(productId, kind) || null;
  const frame = el('div', { class: 'pbc-art pbc-art--' + kind });
  const missing = () => {
    frame.classList.add('pbc-art--missing');
    frame.replaceChildren(el('span', { 'aria-hidden': true, text: '▦' }), el('small', { text: name + ' · 暂无包装图' }));
  };
  if (!url) { missing(); return frame; }
  const image = el('img', { alt: name + ' 包装', loading: 'lazy', decoding: 'async' });
  image.addEventListener('error', missing, { once: true });
  image.src = url; frame.append(image);
  return frame;
}

export function chip(text, kind = '') { return el('span', { class: 'pbc-chip' + (kind ? ' pbc-chip--' + kind : ''), text }); }

// 数量步进器：严格整数；min/max 由调用方给出（0..20 或库存上限）。
export function stepper({ value, min = 0, max = 20, label, onChange, disabled = false }) {
  const clamp = n => Math.max(min, Math.min(max, n));
  const commit = n => { if (!Number.isFinite(n)) return; onChange(clamp(Math.trunc(n))); };
  const input = el('input', {
    type: 'number', min, max, step: 1, value, 'aria-label': label + ' 数量', disabled,
    onchange: e => commit(Number(e.target.value)),
    onkeydown: e => { if (e.key === 'Enter') commit(Number(e.target.value)); },
  });
  return el('div', { class: 'pbc-stepper' }, [
    el('button', { type: 'button', 'aria-label': label + ' 减少', disabled, onclick: () => commit(value - 1), text: '−' }),
    input,
    el('button', { type: 'button', 'aria-label': label + ' 增加', disabled: disabled || value >= max, onclick: () => commit(value + 1), text: '＋' }),
  ]);
}

export function spinner(label) { return el('span', { class: 'pbc-spinner', 'aria-live': 'polite', text: label || '处理中…' }); }
