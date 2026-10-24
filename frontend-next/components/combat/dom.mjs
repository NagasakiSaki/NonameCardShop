// deliverables/playability-v4/FAST-07/src/dom.mjs
// 纯 DOM 构造助手：支持属性、dataset、事件绑定、无外溢类名
export function el(tag, props = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(props)) {
    if (value == null || value === false) continue;
    if (key === 'text') {
      node.textContent = String(value);
    } else if (key === 'class') {
      node.className = value;
    } else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2), value);
    } else if (key === 'dataset' && typeof value === 'object') {
      Object.assign(node.dataset, value);
    } else if (key === 'style' && typeof value === 'object') {
      Object.assign(node.style, value);
    } else {
      node.setAttribute(key, value === true ? '' : String(value));
    }
  }
  for (const child of children.flat(Infinity)) {
    if (child == null || child === false) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function clear(node) {
  while (node.firstChild) node.removeChild(node.firstChild);
}

export const RARITIES = ['SSR', 'SR', 'R', 'N'];

export function rarityChip(rarity, prefix = 'fast07') {
  const r = (rarity || 'N').toUpperCase();
  return el('span', { class: `${prefix}-rarity ${prefix}-rarity--${r}`, text: r });
}

export function chip(text, kind = '', prefix = 'fast07') {
  return el('span', {
    class: `${prefix}-chip` + (kind ? ` ${prefix}-chip--${kind}` : ''),
    text,
  });
}

export function button(text, onclick, { primary = false, danger = false, ghost = false, small = false, disabled = false, title = '', prefix = 'fast07', extraClass = '' } = {}) {
  let cls = `${prefix}-btn`;
  if (primary) cls += ` ${prefix}-btn--primary`;
  if (danger) cls += ` ${prefix}-btn--danger`;
  if (ghost) cls += ` ${prefix}-btn--ghost`;
  if (small) cls += ` ${prefix}-btn--sm`;
  if (extraClass) cls += ` ${extraClass}`;
  return el('button', {
    class: cls,
    type: 'button',
    text,
    onclick,
    disabled,
    title: title || null,
  });
}

// 卡图组件：保持 3:4 比例，防拉伸。当 URL 为空或加载错误时，优雅回退至清晰的武将名文字占位框，杜绝碎图。
export function cardArt(url, name, { prefix = 'fast07', className = '' } = {}) {
  const frame = el('div', { class: `${prefix}-art ${className}`.trim() });
  const missing = () => {
    frame.classList.add(`${prefix}-art--missing`);
    clear(frame);
    frame.append(
      el('span', { class: `${prefix}-art__placeholder-icon`, text: '⚔' }),
      el('span', { class: `${prefix}-art__placeholder-name`, text: name || '未命名武将' })
    );
  };

  if (!url) {
    missing();
    return frame;
  }

  const img = el('img', {
    src: url,
    alt: `${name || '武将'} 卡面`,
    loading: 'lazy',
    decoding: 'async',
    class: `${prefix}-art__img`,
  });
  img.addEventListener('error', missing, { once: true });
  frame.append(img);
  return frame;
}
