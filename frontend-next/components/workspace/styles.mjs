// PLAY-B 展示层：全部样式。所有规则都限定在 .pbc-root 之下（pbc- 前缀），
// 不写任何 body/button/* 全站规则；可整体注入 Shadow DOM 也可注入普通节点。
export const STYLES = String.raw`
.pbc-root {
  --pbc-bg: #101a1a;
  --pbc-panel: #16232a;
  --pbc-panel-2: #1b2b33;
  --pbc-line: #31464d;
  --pbc-ink: #e8efe6;
  --pbc-muted: #9db3ac;
  --pbc-gold: #e8b64a;
  --pbc-green: #8fc07a;
  --pbc-red: #ef9f8a;
  --pbc-blue: #7fb6d9;
  --pbc-ssr: #e8a2c8;
  --pbc-sr: #c9a2e8;
  --pbc-r: #8fb6e8;
  --pbc-n: #b9c4bd;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  background: var(--pbc-bg);
  color: var(--pbc-ink);
  font: 14px/1.65 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  text-align: left;
}
.pbc-root *, .pbc-root *::before, .pbc-root *::after { box-sizing: border-box; }
.pbc-root[hidden] { display: none; }
.pbc-root :focus-visible { outline: 2px solid var(--pbc-gold); outline-offset: 2px; }
.pbc-root h2, .pbc-root h3, .pbc-root h4, .pbc-root p { margin: 0; }
.pbc-root button { font: inherit; color: inherit; }

/* ── 顶栏与消息 ─────────────────────────────── */
.pbc-header { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; padding: 10px 16px; border-bottom: 1px solid var(--pbc-line); background: var(--pbc-panel); }
.pbc-header__title { font-size: 17px; font-weight: 700; }
.pbc-header__meta { display: flex; gap: 12px; align-items: center; flex-wrap: wrap; margin-left: auto; font-size: 13px; color: var(--pbc-muted); }
.pbc-header__meta strong { color: var(--pbc-ink); font-size: 15px; }
.pbc-message { min-height: 20px; padding: 6px 16px; font-size: 13px; color: var(--pbc-muted); }
.pbc-message:empty { display: none; }
.pbc-message[data-kind="error"] { color: var(--pbc-red); }
.pbc-message[data-kind="success"] { color: var(--pbc-green); }

/* ── 区段导航 ─────────────────────────────── */
.pbc-nav { display: flex; gap: 6px; flex-wrap: wrap; padding: 10px 16px 0; background: var(--pbc-panel); }
.pbc-nav .pbc-seg { font-size: 15px; }

.pbc-body { flex: 1; min-height: 0; overflow: auto; padding: 14px 16px 20px; }
.pbc-tabbar { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.pbc-tabbar .pbc-muted { margin: 0; }

/* ── 通用控件 ─────────────────────────────── */
.pbc-btn { min-height: 40px; min-width: 40px; padding: 8px 16px; border: 1px solid var(--pbc-line); border-radius: 6px; background: var(--pbc-panel-2); cursor: pointer; font-size: 14px; }
.pbc-btn:hover:not(:disabled) { border-color: var(--pbc-gold); }
.pbc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.pbc-btn--primary { font-size: 16px; font-weight: 700; background: #6d5a22; border-color: #a98a35; color: #ffe9b3; }
.pbc-btn--primary:hover:not(:disabled) { background: #7d692a; }
.pbc-btn--ghost { background: transparent; }
.pbc-btn--small { min-height: 32px; padding: 4px 10px; font-size: 13px; }
.pbc-segmented { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 3px; border: 1px solid var(--pbc-line); border-radius: 8px; background: var(--pbc-panel); }
.pbc-seg { min-height: 34px; padding: 4px 12px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; color: var(--pbc-muted); font-size: 14px; }
.pbc-seg.is-active { background: var(--pbc-panel-2); color: var(--pbc-ink); font-weight: 700; box-shadow: inset 0 0 0 1px var(--pbc-line); }
.pbc-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--pbc-line); border-radius: 999px; background: var(--pbc-panel); color: var(--pbc-muted); font-size: 12px; white-space: nowrap; }
.pbc-chip--gold { color: var(--pbc-gold); border-color: #6d5a22; }
.pbc-chip--warn { color: #f0c37a; border-color: #7a5f2a; }
.pbc-rarity { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; padding: 1px 7px; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
.pbc-rarity--SSR { color: #241318; background: var(--pbc-ssr); }
.pbc-rarity--SR { color: #1d1428; background: var(--pbc-sr); }
.pbc-rarity--R { color: #101a2b; background: var(--pbc-r); }
.pbc-rarity--N { color: #171d19; background: var(--pbc-n); }
.pbc-muted { color: var(--pbc-muted); }
.pbc-error { color: var(--pbc-red); font-size: 13px; margin: 6px 0 0; }
.pbc-card { background: var(--pbc-panel); border: 1px solid var(--pbc-line); border-radius: 8px; padding: 14px 16px; }
.pbc-card > h3 { font-size: 16px; margin-bottom: 10px; }
.pbc-line { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px dashed var(--pbc-line); font-size: 13px; }
.pbc-line:last-child { border-bottom: 0; }
.pbc-line strong { font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.pbc-empty { border: 1px dashed var(--pbc-line); border-radius: 8px; padding: 26px 20px; text-align: center; color: var(--pbc-muted); }
.pbc-empty p { font-size: 15px; margin-bottom: 4px; }
.pbc-spinner { color: var(--pbc-gold); font-size: 13px; }
.pbc-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.pbc-note { font-size: 12px; color: var(--pbc-muted); line-height: 1.7; margin-top: 8px; }

/* ── 卡图与包装 ─────────────────────────────── */
.pbc-art { position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #0c1416; border: 1px solid var(--pbc-line); border-radius: 6px; }
.pbc-art img { width: 100%; height: 100%; object-fit: contain; }
.pbc-art--missing { flex-direction: column; gap: 6px; color: var(--pbc-muted); padding: 8px; text-align: center; }
.pbc-art--missing > span { font-size: 22px; color: var(--pbc-line); }
.pbc-art--missing small { font-size: 12px; line-height: 1.5; }
.pbc-avatar { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 50%; overflow: hidden; background: var(--pbc-panel-2); border: 1px solid var(--pbc-line); flex: none; }
.pbc-avatar img { width: 100%; height: 100%; object-fit: cover; image-rendering: pixelated; }

/* ── 采购：目录 + 购物篮 ─────────────────────────────── */
.pbc-supply { display: grid; grid-template-columns: minmax(0, 1fr) 300px; gap: 14px; align-items: start; }
.pbc-toolbar { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.pbc-input { min-height: 40px; padding: 6px 12px; background: #0e181a; border: 1px solid var(--pbc-line); border-radius: 6px; color: var(--pbc-ink); font: inherit; }
.pbc-input:focus { border-color: var(--pbc-gold); outline: none; }
.pbc-product-grid, .pbc-shelf-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; }
.pbc-product { display: flex; flex-direction: column; gap: 8px; padding: 12px; background: var(--pbc-panel); border: 1px solid var(--pbc-line); border-radius: 8px; min-width: 0; }
.pbc-product__art { width: 72px; height: 96px; }
.pbc-product--box .pbc-product__art { width: 96px; height: 96px; }
.pbc-product__head { display: flex; gap: 10px; align-items: flex-start; }
.pbc-product__name { font-size: 15px; font-weight: 700; line-height: 1.4; }
.pbc-product__spec { font-size: 12px; color: var(--pbc-muted); line-height: 1.7; }
.pbc-product__price { display: flex; align-items: baseline; gap: 6px; }
.pbc-product__price strong { font-size: 17px; color: var(--pbc-gold); font-variant-numeric: tabular-nums; }
.pbc-product__stock { display: flex; gap: 8px; flex-wrap: wrap; }
.pbc-product__foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; }

.pbc-basket { position: sticky; top: 0; display: flex; flex-direction: column; gap: 10px; padding: 14px; background: var(--pbc-panel); border: 1px solid var(--pbc-line); border-radius: 8px; max-height: calc(100vh - 140px); overflow: auto; }
.pbc-basket__line { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 4px 10px; padding: 8px 0; border-bottom: 1px dashed var(--pbc-line); }
.pbc-basket__line strong { font-size: 14px; overflow-wrap: anywhere; }
.pbc-basket__line .pbc-muted { font-size: 12px; }
.pbc-basket__line .pbc-stepper { grid-column: 1; }
.pbc-basket__line .pbc-basket__amount { grid-column: 2; grid-row: 2 / span 2; align-self: center; font-variant-numeric: tabular-nums; }
.pbc-basket__total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; padding-top: 6px; }
.pbc-basket__total strong { font-size: 22px; color: var(--pbc-gold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.pbc-quote { border: 1px solid #6d5a22; background: #1d1a10; border-radius: 8px; padding: 12px; display: grid; gap: 4px; }
.pbc-quote h4 { font-size: 15px; color: var(--pbc-gold); }
.pbc-quote .pbc-line { border-bottom: 0; }

.pbc-stepper { display: inline-flex; align-items: center; gap: 4px; }
.pbc-stepper button { width: 34px; height: 34px; padding: 0; border: 1px solid var(--pbc-line); border-radius: 6px; background: var(--pbc-panel-2); cursor: pointer; font-size: 16px; }
.pbc-stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
.pbc-stepper input { width: 64px; height: 34px; padding: 0 6px; text-align: center; background: #0e181a; border: 1px solid var(--pbc-line); border-radius: 6px; color: var(--pbc-ink); font: inherit; }
.pbc-stepper input::-webkit-outer-spin-button, .pbc-stepper input::-webkit-inner-spin-button { appearance: none; margin: 0; }

/* ── 订单与仓库 ─────────────────────────────── */
.pbc-list { display: grid; gap: 12px; grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); }
.pbc-receipt { display: flex; flex-direction: column; gap: 8px; padding: 12px 14px; background: var(--pbc-panel); border: 1px solid var(--pbc-line); border-radius: 8px; }
.pbc-receipt__head { display: flex; justify-content: space-between; align-items: center; gap: 10px; }
.pbc-receipt__head h4 { font-size: 15px; }
.pbc-shelf .pbc-price-input { width: 110px; }

/* ── 开包 ─────────────────────────────── */
.pbc-unbox-paths { display: grid; grid-template-columns: repeat(auto-fit, minmax(230px, 1fr)); gap: 12px; }
.pbc-reveal { display: flex; flex-direction: column; gap: 12px; padding: 16px; border: 1px solid var(--pbc-line); border-radius: 8px; background: var(--pbc-panel); min-height: 200px; }
.pbc-reveal__stage { display: flex; flex-wrap: wrap; gap: 10px; justify-content: center; min-height: 150px; align-items: center; }
.pbc-flip { width: 92px; height: 128px; perspective: 500px; }
.pbc-flip__inner { position: relative; width: 100%; height: 100%; transform-style: preserve-3d; transition: transform 0.45s ease; }
.pbc-flip.is-flipped .pbc-flip__inner { transform: rotateY(180deg); }
.pbc-flip__back, .pbc-flip__front { position: absolute; inset: 0; backface-visibility: hidden; border-radius: 6px; overflow: hidden; border: 1px solid var(--pbc-line); display: flex; align-items: center; justify-content: center; }
.pbc-flip__back { background: repeating-linear-gradient(45deg, #1d2b33, #1d2b33 6px, #16232a 6px, #16232a 12px); color: var(--pbc-muted); font-size: 12px; }
.pbc-flip__front { transform: rotateY(180deg); background: #0c1416; }
.pbc-flip__front img { width: 100%; height: 100%; object-fit: contain; }
.pbc-flip__front figcaption { position: absolute; left: 0; right: 0; bottom: 0; padding: 2px 4px; font-size: 11px; background: #000a; color: var(--pbc-ink); text-align: center; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }

/* ── 收藏 / 市场 ─────────────────────────────── */
.pbc-market { display: grid; grid-template-columns: minmax(0, 1fr) 320px; gap: 14px; align-items: start; }
.pbc-catalog__label { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; color: var(--pbc-muted); font-size: 13px; }
.pbc-card-grid-stack { display: flex; flex-direction: column; gap: 10px; }
.pbc-card-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(158px, 1fr)); gap: 10px; }
.pbc-card-tile { display: flex; flex-direction: column; gap: 6px; padding: 8px; text-align: left; background: var(--pbc-panel); border: 1px solid var(--pbc-line); border-radius: 8px; cursor: pointer; min-width: 0; }
.pbc-card-tile:hover { border-color: var(--pbc-gold); }
.pbc-card-tile.is-selected { border-color: var(--pbc-gold); box-shadow: 0 0 0 1px var(--pbc-gold); }
.pbc-card-tile__img { position: relative; width: 100%; aspect-ratio: 5 / 7; }
.pbc-card-tile__img .pbc-rarity { position: absolute; top: 4px; left: 4px; }
.pbc-card-tile__img .pbc-owned { position: absolute; top: 4px; right: 4px; padding: 1px 7px; border-radius: 4px; background: #000c; font-size: 12px; font-variant-numeric: tabular-nums; }
.pbc-card-tile__name { font-size: 14px; font-weight: 700; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.pbc-card-tile__price { display: flex; justify-content: space-between; font-size: 13px; color: var(--pbc-gold); font-variant-numeric: tabular-nums; }
.pbc-card-tile__meta { display: flex; justify-content: space-between; gap: 6px; font-size: 12px; color: var(--pbc-muted); }

.pbc-detail { position: sticky; top: 0; display: flex; flex-direction: column; gap: 10px; max-height: calc(100vh - 140px); overflow: auto; }
.pbc-detail__art { width: 200px; aspect-ratio: 5 / 7; }
.pbc-detail__badges { display: flex; gap: 6px; flex-wrap: wrap; align-items: center; }
.pbc-detail__skill { border-top: 1px solid var(--pbc-line); padding-top: 8px; }
.pbc-detail__skill h4 { color: var(--pbc-gold); font-size: 14px; margin-bottom: 2px; }
.pbc-detail__skill p { font-size: 13px; line-height: 1.8; overflow-wrap: anywhere; }
.pbc-detail__source { margin-top: 6px; padding: 10px; background: #0c1416; border: 1px solid var(--pbc-line); border-radius: 6px; font: 12px/1.6 Consolas, monospace; white-space: pre; overflow-x: auto; }
.pbc-bid-row { display: flex; gap: 10px; align-items: center; padding: 8px 0; border-bottom: 1px dashed var(--pbc-line); }
.pbc-bid-row:last-child { border-bottom: 0; }

/* ── 待确认操作块 ─────────────────────────────── */
.pbc-pending { border: 1px solid #a96e4f; background: #241512; border-radius: 8px; padding: 12px 14px; margin-bottom: 12px; }
.pbc-pending h4 { font-size: 15px; color: var(--pbc-red); }
.pbc-pending code { font-size: 12px; color: var(--pbc-muted); overflow-wrap: anywhere; }

/* ── 响应式：1280 收窄侧栏，640 以下单列 ─────────────── */
@media (max-width: 1280px) {
  .pbc-supply { grid-template-columns: minmax(0, 1fr) 264px; }
  .pbc-market { grid-template-columns: minmax(0, 1fr) 280px; }
  .pbc-basket, .pbc-detail { max-height: calc(100vh - 120px); }
}
@media (max-width: 900px) {
  .pbc-supply, .pbc-market { grid-template-columns: minmax(0, 1fr); }
  .pbc-basket, .pbc-detail { position: static; max-height: none; }
}
@media (max-width: 640px) {
  .pbc-root { font-size: 14px; }
  .pbc-body { padding: 10px 10px 16px; }
  .pbc-header { padding: 8px 10px; }
  .pbc-btn { min-height: 44px; }
  .pbc-btn--primary { font-size: 15px; }
  .pbc-card-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
  .pbc-basket__total strong { font-size: 20px; }
}
`;
export function injectStyles(root) {
  root.classList.add('pbc-root');
  if (!root.querySelector('style[data-pbc]')) {
    const style = document.createElement('style');
    style.dataset.pbc = 'play-b';
    style.textContent = STYLES;
    root.prepend(style);
  }
}

export const FORMAL_CSS = `.pbc-root [hidden]{display:none!important}.pbc-root{font:14px "Microsoft YaHei",system-ui,sans-serif;min-height:0}.pbc-root>.pbc-root{height:100%}.pbc-root .pbc-header__meta{flex-wrap:wrap}.pbc-root img{max-width:100%}.pbc-root .pbc-message{overflow-wrap:anywhere}.pbc-root .pbc-body{max-height:calc(100dvh - 280px);overflow:auto}.pbc-root .pbc-error{overflow-wrap:anywhere}`;
