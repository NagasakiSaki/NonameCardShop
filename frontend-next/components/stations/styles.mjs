// FAST-06 包命名空间样式：全部规则限定在 .f6-root 之下（f6- 前缀），
// 不修改 frontend-next 公共样式、不写 body/* 全站规则；注入位置是组件自己的根节点。
//
// 其中 .f6-root .pbc-* 一段镜像自 frontend-next/components/workspace/styles.mjs（基线 0bbba5ad）
// 的同名规则：本包复用正式 dom.mjs 的纯展示助手（会输出 pbc-* 类），候选必须自带样式，
// 正式接入时这一段可整段删除，由主模型的公共样式接管。
export const F6_STYLES = String.raw`
.f6-root {
  --f6-bg: #101a1a;
  --f6-panel: #16232a;
  --f6-panel-2: #1b2b33;
  --f6-line: #31464d;
  --f6-ink: #e8efe6;
  --f6-muted: #9db3ac;
  --f6-gold: #e8b64a;
  --f6-green: #8fc07a;
  --f6-red: #ef9f8a;
  display: flex;
  flex-direction: column;
  min-width: 0;
  min-height: 0;
  height: 100%;
  box-sizing: border-box;
  background: var(--f6-bg);
  color: var(--f6-ink);
  font: 14px/1.65 "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  text-align: left;
}
.f6-root *, .f6-root *::before, .f6-root *::after { box-sizing: border-box; }
.f6-root :focus-visible { outline: 2px solid var(--f6-gold); outline-offset: 2px; }
.f6-root h2, .f6-root h3, .f6-root h4, .f6-root p { margin: 0; }
.f6-root button { font: inherit; color: inherit; }
.f6-root img { max-width: 100%; }

/* ── 固定窗口骨架：标题 / 主内容 / 底部动作区 ─────────────── */
.f6-head { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; padding: 10px 14px; border-bottom: 1px solid var(--f6-line); background: var(--f6-panel); flex: none; }
.f6-head__title { font-size: 17px; font-weight: 700; white-space: nowrap; }
.f6-head__meta { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; margin-left: auto; font-size: 12px; color: var(--f6-muted); }
.f6-main { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 12px 14px; }
.f6-foot { flex: none; display: flex; gap: 10px; align-items: center; flex-wrap: wrap; padding: 10px 14px; border-top: 1px solid var(--f6-line); background: var(--f6-panel); min-height: 58px; }
.f6-foot__spacer { flex: 1 1 auto; }

/* ── 分页条：页码 / 总数 / 跳页固定可达 ─────────────── */
.f6-pager { display: flex; gap: 6px; align-items: center; flex-wrap: wrap; font-size: 13px; color: var(--f6-muted); }
.f6-pager__info { font-variant-numeric: tabular-nums; white-space: nowrap; }
.f6-pager__jump { width: 76px; height: 36px; padding: 0 8px; background: #0e181a; border: 1px solid var(--f6-line); border-radius: 6px; color: var(--f6-ink); font: inherit; text-align: center; }
.f6-pager__jump:focus { border-color: var(--f6-gold); outline: none; }
.f6-pager input[type="number"]::-webkit-outer-spin-button,
.f6-pager input[type="number"]::-webkit-inner-spin-button { appearance: none; margin: 0; }

/* ── 商品 / 库存网格（当前页才建 DOM） ─────────────── */
.f6-grid { display: grid; gap: 10px; grid-template-columns: repeat(3, minmax(0, 1fr)); align-items: stretch; }
.f6-root[data-cap="mid"] .f6-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.f6-root[data-cap="narrow"] .f6-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.f6-tile { display: flex; flex-direction: column; gap: 6px; padding: 10px; background: var(--f6-panel); border: 1px solid var(--f6-line); border-radius: 8px; min-width: 0; }
.f6-tile.is-selectable { cursor: pointer; }
.f6-tile.is-selected { border-color: var(--f6-gold); box-shadow: 0 0 0 1px var(--f6-gold); }
.f6-tile.is-unavailable { opacity: 0.62; }
.f6-tile__head { display: flex; gap: 10px; align-items: flex-start; min-width: 0; }
.f6-tile__body { display: grid; gap: 2px; min-width: 0; flex: 1 1 auto; }
.f6-tile__name { font-size: 15px; font-weight: 700; line-height: 1.4; overflow-wrap: anywhere; }
.f6-tile__spec { font-size: 12px; color: var(--f6-muted); line-height: 1.6; overflow-wrap: anywhere; }
.f6-tile__price { display: flex; align-items: baseline; gap: 6px; }
.f6-tile__price strong { font-size: 17px; color: var(--f6-gold); font-variant-numeric: tabular-nums; }
.f6-tile__chips { display: flex; gap: 6px; flex-wrap: wrap; }
.f6-tile__foot { display: flex; justify-content: space-between; align-items: center; gap: 8px; margin-top: auto; padding-top: 4px; flex-wrap: wrap; }
.f6-artframe { flex: none; }

/* ── 购物篮与底栏合计 ─────────────── */
.f6-basket { display: grid; gap: 6px; padding: 10px 12px; background: var(--f6-panel); border: 1px solid var(--f6-line); border-radius: 8px; margin-bottom: 12px; }
.f6-basket__lines { display: flex; flex-direction: column; }
.f6-basket__line { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; padding: 5px 0; border-bottom: 1px dashed var(--f6-line); font-size: 13px; }
.f6-basket__line:last-child { border-bottom: 0; }
.f6-basket__line strong { overflow-wrap: anywhere; }
.f6-basket__line .f6-basket__amount { margin-left: auto; font-variant-numeric: tabular-nums; color: var(--f6-gold); white-space: nowrap; }
.f6-basket__total { display: flex; justify-content: space-between; align-items: baseline; gap: 10px; }
.f6-basket__total strong { font-size: 20px; color: var(--f6-gold); font-variant-numeric: tabular-nums; white-space: nowrap; }
.f6-foot__total { font-size: 13px; color: var(--f6-muted); }
.f6-foot__total strong { color: var(--f6-gold); font-size: 17px; font-variant-numeric: tabular-nums; }

/* ── 已入库回执 / 结果面板 ─────────────── */
.f6-receipt { display: grid; gap: 8px; padding: 14px; background: #14201a; border: 1px solid #3d5c44; border-radius: 8px; max-width: 720px; }
.f6-receipt__title { font-size: 17px; font-weight: 700; color: var(--f6-green); }
.f6-note { font-size: 12px; color: var(--f6-muted); line-height: 1.7; overflow-wrap: anywhere; }

/* ── 开包结果：固定页卡面 ─────────────── */
.f6-stage { display: grid; gap: 10px; grid-template-columns: repeat(4, minmax(0, 1fr)); align-items: stretch; }
.f6-root[data-cap="mid"] .f6-stage { grid-template-columns: repeat(4, minmax(0, 1fr)); }
.f6-root[data-cap="narrow"] .f6-stage { grid-template-columns: repeat(2, minmax(0, 1fr)); }
.f6-frame { position: relative; display: flex; flex-direction: column; gap: 4px; padding: 8px; background: var(--f6-panel); border: 1px solid var(--f6-line); border-radius: 8px; min-width: 0; }
.f6-frame .pbc-art { width: 100%; aspect-ratio: 3 / 4; max-height: 210px; }
.f6-root[data-cap="narrow"] .f6-frame .pbc-art { max-height: 250px; }
.f6-frame__name { font-size: 13px; font-weight: 700; overflow-wrap: anywhere; line-height: 1.5; }
.f6-frame__badges { position: absolute; top: 12px; left: 12px; display: flex; gap: 4px; z-index: 1; }
.f6-frame__copies { position: absolute; top: 12px; right: 12px; padding: 1px 8px; border-radius: 999px; background: #000c; border: 1px solid var(--f6-gold); color: var(--f6-gold); font-size: 12px; font-variant-numeric: tabular-nums; z-index: 1; }
.f6-frame__meta { font-size: 12px; color: var(--f6-muted); }

/* ── 待确认操作（结果未知） ─────────────── */
.f6-pending { border: 1px solid #a96e4f; background: #241512; border-radius: 8px; padding: 12px 14px; display: grid; gap: 6px; }
.f6-pending h4 { font-size: 15px; color: var(--f6-red); }
.f6-pending code { font-size: 12px; color: var(--f6-muted); overflow-wrap: anywhere; }

/* ── 选择范围表单 ─────────────── */
.f6-scope { display: grid; gap: 10px; }
.f6-scope__row { display: flex; gap: 10px; align-items: center; flex-wrap: wrap; }
.f6-select { min-height: 40px; padding: 6px 12px; background: #0e181a; border: 1px solid var(--f6-line); border-radius: 6px; color: var(--f6-ink); font: inherit; max-width: 100%; }
.f6-select:focus { border-color: var(--f6-gold); outline: none; }
.f6-check { display: inline-flex; gap: 8px; align-items: center; font-size: 14px; }
.f6-check input { width: 18px; height: 18px; accent-color: var(--f6-gold); }

/* ══ 以下镜像正式 pbc-* 规则（dom.mjs 助手输出这些类）══ */
.f6-root .pbc-btn { min-height: 40px; min-width: 40px; padding: 8px 16px; border: 1px solid var(--f6-line); border-radius: 6px; background: var(--f6-panel-2); cursor: pointer; font-size: 14px; }
.f6-root .pbc-btn:hover:not(:disabled) { border-color: var(--f6-gold); }
.f6-root .pbc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
.f6-root .pbc-btn--primary { font-size: 16px; font-weight: 700; background: #6d5a22; border-color: #a98a35; color: #ffe9b3; }
.f6-root .pbc-btn--primary:hover:not(:disabled) { background: #7d692a; }
.f6-root .pbc-btn--ghost { background: transparent; }
.f6-root .pbc-btn--small { min-height: 32px; padding: 4px 10px; font-size: 13px; }
.f6-root .pbc-segmented { display: inline-flex; flex-wrap: wrap; gap: 4px; padding: 3px; border: 1px solid var(--f6-line); border-radius: 8px; background: var(--f6-panel); }
.f6-root .pbc-seg { min-height: 34px; padding: 4px 12px; border: 0; border-radius: 6px; background: transparent; cursor: pointer; color: var(--f6-muted); font-size: 14px; }
.f6-root .pbc-seg.is-active { background: var(--f6-panel-2); color: var(--f6-ink); font-weight: 700; box-shadow: inset 0 0 0 1px var(--f6-line); }
.f6-root .pbc-chip { display: inline-flex; align-items: center; gap: 4px; padding: 2px 10px; border: 1px solid var(--f6-line); border-radius: 999px; background: var(--f6-panel); color: var(--f6-muted); font-size: 12px; white-space: nowrap; }
.f6-root .pbc-chip--gold { color: var(--f6-gold); border-color: #6d5a22; }
.f6-root .pbc-chip--warn { color: #f0c37a; border-color: #7a5f2a; }
.f6-root .pbc-rarity { display: inline-flex; align-items: center; justify-content: center; min-width: 34px; padding: 1px 7px; border-radius: 4px; font-size: 12px; font-weight: 700; letter-spacing: 1px; }
.f6-root .pbc-rarity--SSR { color: #241318; background: #e8a2c8; }
.f6-root .pbc-rarity--SR { color: #1d1428; background: #c9a2e8; }
.f6-root .pbc-rarity--R { color: #101a2b; background: #8fb6e8; }
.f6-root .pbc-rarity--N { color: #171d19; background: #b9c4bd; }
.f6-root .pbc-muted { color: var(--f6-muted); }
.f6-root .pbc-error { color: var(--f6-red); font-size: 13px; margin: 6px 0 0; overflow-wrap: anywhere; }
.f6-root .pbc-card { background: var(--f6-panel); border: 1px solid var(--f6-line); border-radius: 8px; padding: 14px 16px; }
.f6-root .pbc-card > h3 { font-size: 16px; margin-bottom: 10px; }
.f6-root .pbc-line { display: flex; justify-content: space-between; gap: 12px; padding: 4px 0; border-bottom: 1px dashed var(--f6-line); font-size: 13px; }
.f6-root .pbc-line:last-child { border-bottom: 0; }
.f6-root .pbc-line strong { font-variant-numeric: tabular-nums; text-align: right; overflow-wrap: anywhere; }
.f6-root .pbc-empty { border: 1px dashed var(--f6-line); border-radius: 8px; padding: 26px 20px; text-align: center; color: var(--f6-muted); }
.f6-root .pbc-empty p { font-size: 15px; margin-bottom: 4px; }
.f6-root .pbc-spinner { color: var(--f6-gold); font-size: 13px; }
.f6-root .pbc-actions { display: flex; gap: 8px; flex-wrap: wrap; align-items: center; margin-top: 10px; }
.f6-root .pbc-art { position: relative; display: flex; align-items: center; justify-content: center; overflow: hidden; background: #0c1416; border: 1px solid var(--f6-line); border-radius: 6px; }
.f6-root .pbc-art img { width: 100%; height: 100%; object-fit: contain; }
.f6-root .pbc-art--missing { flex-direction: column; gap: 6px; color: var(--f6-muted); padding: 8px; text-align: center; }
.f6-root .pbc-art--missing > span { font-size: 22px; color: var(--f6-line); }
.f6-root .pbc-art--missing small { font-size: 12px; line-height: 1.5; }
.f6-root .pbc-stepper { display: inline-flex; align-items: center; gap: 4px; }
.f6-root .pbc-stepper button { width: 34px; height: 34px; padding: 0; border: 1px solid var(--f6-line); border-radius: 6px; background: var(--f6-panel-2); cursor: pointer; font-size: 16px; }
.f6-root .pbc-stepper button:disabled { opacity: 0.4; cursor: not-allowed; }
.f6-root .pbc-stepper input { width: 64px; height: 34px; padding: 0 6px; text-align: center; background: #0e181a; border: 1px solid var(--f6-line); border-radius: 6px; color: var(--f6-ink); font: inherit; }
.f6-root .pbc-stepper input::-webkit-outer-spin-button, .f6-root .pbc-stepper input::-webkit-inner-spin-button { appearance: none; margin: 0; }

/* ── 响应式：窄屏放大触控目标，主按钮保持可达 ─────────────── */
.f6-root[data-cap="narrow"] { font-size: 14px; }
.f6-root[data-cap="narrow"] .pbc-btn { min-height: 44px; }
.f6-root[data-cap="narrow"] .f6-head, .f6-root[data-cap="narrow"] .f6-foot, .f6-root[data-cap="narrow"] .f6-main { padding-left: 10px; padding-right: 10px; }
`;

export function injectF6Styles(root) {
  root.classList.add('f6-root');
  if (!root.querySelector('style[data-f6]')) {
    const style = document.createElement('style');
    style.dataset.f6 = 'fast-06';
    style.textContent = F6_STYLES;
    root.prepend(style);
  }
}
