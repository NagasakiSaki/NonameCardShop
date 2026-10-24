// deliverables/playability-v1/PLAY-C/src/styles.mjs
// 包内样式常量：全部选择器带 pc- 前缀，不改页面其他节点；配色沿用 UX-02 / trade.css 暗色基调。
// 通过 shared.injectStyles 注入 <style>，幂等。

export const BASE_CSS = `
.pc-root {
  container-type: inline-size;
  color: var(--pc-ink);
  font-family: "Microsoft YaHei", "PingFang SC", system-ui, sans-serif;
  font-size: 15px;
  line-height: 1.6;
}
.pc-root, .pc-root *, .pc-root *::before, .pc-root *::after { box-sizing: border-box; }
.pc-root h3, .pc-root p, .pc-root ul { margin: 0; }
.pc-root {
  --pc-bg: #111819; --pc-panel: #1d2728; --pc-panel-high: #253234; --pc-line: #394747;
  --pc-ink: #f2ede0; --pc-muted: #a5b4ad;
  --pc-green: #b7d4a9; --pc-gold: #e4bb7a;
  --pc-red: #e2a29b; --pc-amber: #e4c78a; --pc-blue: #a8c5e0; --pc-violet: #c9aee0; --pc-teal: #9ed0c4;
}
.pc-card { background: var(--pc-panel); border: 1px solid var(--pc-line); border-radius: 10px; padding: 12px 14px; margin-bottom: 12px; }
.pc-card--accent { border-color: rgba(228,187,122,.55); background: #232c28; }
.pc-card--danger { border-color: rgba(226,162,155,.55); }
.pc-card--info { border-color: rgba(168,197,224,.5); }
.pc-card__title { display: flex; align-items: center; gap: 8px; margin-bottom: 8px; flex-wrap: wrap; }
.pc-card__title h3 { font-size: 16px; font-weight: 600; }
.pc-card__tail { margin-left: auto; color: var(--pc-muted); font-size: 12px; font-weight: 400; }
.pc-grid { display: grid; gap: 10px; }
.pc-grid--2 { grid-template-columns: repeat(2, minmax(0,1fr)); }
.pc-grid--3 { grid-template-columns: repeat(3, minmax(0,1fr)); }
.pc-grid--5 { grid-template-columns: repeat(5, minmax(0,1fr)); }
.pc-kpi { display: flex; flex-direction: column; gap: 2px; padding: 8px 10px; background: var(--pc-panel-high); border-radius: 8px; }
.pc-kpi__label { font-size: 12px; color: var(--pc-muted); }
.pc-kpi__value { font-size: 20px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-kpi__value--good { color: var(--pc-green); }
.pc-kpi__value--bad { color: var(--pc-red); }
.pc-kpi__value--neutral { color: var(--pc-blue); }
.pc-kpi__note { font-size: 11.5px; color: var(--pc-muted); }
.pc-chip { display: inline-flex; align-items: center; gap: 4px; padding: 1px 8px; border-radius: 999px; font-size: 12px; background: #2b3637; border: 1px solid var(--pc-line); color: var(--pc-ink); white-space: nowrap; }
.pc-chip--good { color: var(--pc-green); border-color: rgba(183,212,169,.5); }
.pc-chip--warn { color: var(--pc-amber); border-color: rgba(228,199,138,.5); }
.pc-chip--bad { color: var(--pc-red); border-color: rgba(226,162,155,.5); }
.pc-chip--info { color: var(--pc-blue); border-color: rgba(168,197,224,.5); }
.pc-chip--violet { color: var(--pc-violet); border-color: rgba(201,174,224,.5); }
.pc-chip--teal { color: var(--pc-teal); border-color: rgba(158,208,196,.5); }
.pc-chip--gold { color: var(--pc-gold); border-color: rgba(228,187,122,.55); }
.pc-chip--muted { color: var(--pc-muted); }
.pc-note { color: var(--pc-muted); font-size: 12.5px; }
.pc-tag-sample { color: var(--pc-gold); font-size: 11px; border: 1px dashed rgba(228,187,122,.6); border-radius: 4px; padding: 0 5px; margin-left: 6px; white-space: nowrap; }
.pc-avatar { display: inline-grid; place-items: center; width: 26px; height: 26px; border-radius: 50%; color: #10181a; font-size: 13px; font-weight: 600; flex: none; }
.pc-btn { font: inherit; font-size: 13.5px; color: var(--pc-ink); background: #2b3637; border: 1px solid var(--pc-line); border-radius: 8px; padding: 6px 14px; min-height: 34px; cursor: pointer; }
.pc-btn--primary { background: #3a4a3c; border-color: rgba(228,187,122,.55); color: #f0e9c8; font-size: 15px; min-height: 40px; }
.pc-btn[disabled] { opacity: .4; cursor: default; }
.pc-table { width: 100%; border-collapse: collapse; font-size: 13.5px; }
.pc-table-scroll { overflow-x: auto; max-width: 100%; }
.pc-table th, .pc-table td { text-align: left; padding: 5px 8px; border-bottom: 1px solid #2c3839; vertical-align: top; }
.pc-table th { color: var(--pc-muted); font-weight: 500; font-size: 12px; white-space: nowrap; }
.pc-table td.num, .pc-table th.num { text-align: right; font-variant-numeric: tabular-nums; white-space: nowrap; }
.pc-table tr.pc-row--bad td { background: rgba(226,162,155,.07); }
.pc-table tr.pc-row--warn td { background: rgba(228,199,138,.06); }
.pc-pending { padding: 10px 12px; border: 1px dashed var(--pc-line); border-radius: 8px; color: var(--pc-muted); font-size: 13px; background: #191f20; }
.pc-result { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-top: 8px; padding: 6px 10px; border-radius: 8px; font-size: 13px; }
.pc-result--ok { background: rgba(183,212,169,.1); border: 1px solid rgba(183,212,169,.4); color: var(--pc-green); }
.pc-result--error { background: rgba(226,162,155,.1); border: 1px solid rgba(226,162,155,.5); color: var(--pc-red); }
.pc-result--unknown { background: rgba(168,197,224,.1); border: 1px solid rgba(168,197,224,.5); color: var(--pc-blue); }
.pc-dev { margin-top: 8px; border: 1px dashed var(--pc-line); border-radius: 8px; padding: 6px 10px; font-size: 12.5px; color: var(--pc-muted); background: #191f20; }
.pc-dev summary { cursor: pointer; color: var(--pc-gold); font-size: 12px; user-select: none; }
.pc-footer { color: var(--pc-muted); font-size: 12px; margin-top: 10px; border-top: 1px dashed var(--pc-line); padding-top: 8px; }
@container (max-width: 760px) {
  .pc-grid--2, .pc-grid--3, .pc-grid--5 { grid-template-columns: 1fr 1fr; }
  .pc-kpi__value { font-size: 17px; }
}
@container (max-width: 460px) {
  .pc-grid--2, .pc-grid--3, .pc-grid--5 { grid-template-columns: 1fr; }
  .pc-card { padding: 10px; }
}
`;

export const C1_CSS = `
.pc-hud { display: flex; gap: 14px; align-items: stretch; flex-wrap: wrap; background: var(--pc-panel); border: 1px solid var(--pc-line); border-radius: 10px; padding: 10px 14px; margin-bottom: 10px; }
.pc-hud__clock { display: flex; flex-direction: column; gap: 2px; min-width: 130px; }
.pc-hud__day { font-size: 15px; font-weight: 600; }
.pc-hud__phase { color: var(--pc-muted); font-size: 12.5px; }
.pc-hud__money { display: flex; flex-direction: column; gap: 2px; min-width: 170px; }
.pc-hud__cash { font-size: 21px; font-weight: 600; color: var(--pc-gold); font-variant-numeric: tabular-nums; }
.pc-hud__cash small { font-size: 12px; color: var(--pc-muted); font-weight: 400; }
.pc-hud__rev { display: flex; flex-direction: column; gap: 2px; min-width: 190px; }
.pc-hud__rev-num { font-size: 16px; font-weight: 600; font-variant-numeric: tabular-nums; }
.pc-hud__journal { margin-left: auto; display: flex; flex-direction: column; gap: 3px; min-width: 230px; max-width: 380px; }
.pc-hud__journal-title { color: var(--pc-muted); font-size: 11.5px; }
.pc-hud__entry { display: flex; justify-content: space-between; gap: 8px; font-size: 12.5px; }
.pc-hud__entry .amt { font-variant-numeric: tabular-nums; white-space: nowrap; }
.pc-hud__entry .amt--in { color: var(--pc-green); }
.pc-hud__entry .amt--out { color: var(--pc-red); }
.pc-pause { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; border-radius: 8px; padding: 8px 12px; font-size: 13.5px; margin-bottom: 10px; border: 1px solid var(--pc-line); background: var(--pc-panel-high); }
.pc-pause--running { border-color: rgba(183,212,169,.5); }
.pc-pause--paused { border-color: rgba(168,197,224,.7); background: #1f2a33; }
.pc-pause b { font-weight: 600; }
.pc-crowd { display: grid; grid-template-columns: repeat(auto-fill, minmax(215px, 1fr)); gap: 8px; }
.pc-grid--split { grid-template-columns: minmax(0,1.35fr) minmax(0,1fr); }
.pc-cust { display: flex; gap: 8px; align-items: flex-start; padding: 7px 8px; border: 1px solid #2c3839; border-radius: 8px; background: #202a2b; cursor: pointer; text-align: left; font: inherit; color: inherit; width: 100%; }
.pc-cust:hover { border-color: rgba(228,187,122,.5); }
.pc-cust--selected { border-color: rgba(228,187,122,.8); background: rgba(228,187,122,.08); }
.pc-cust__name { font-size: 14px; font-weight: 600; display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
.pc-cust__state { font-size: 12.5px; color: var(--pc-muted); display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
.pc-cust--busy { padding: 5px 8px; }
.pc-cust--busy .pc-cust__name { font-size: 13.5px; }
.pc-dot { width: 9px; height: 9px; border-radius: 50%; display: inline-block; flex: none; }
.pc-detail { margin-top: 10px; border: 1px solid rgba(228,187,122,.5); border-radius: 8px; padding: 10px 12px; background: #232c28; }
.pc-exits { list-style: none; padding: 0; margin: 8px 0 0; }
.pc-exits li { display: flex; align-items: center; gap: 8px; padding: 5px 4px; border-bottom: 1px solid #2c3839; font-size: 13px; flex-wrap: wrap; }
.pc-exits li:last-child { border-bottom: 0; }
.pc-exits .t { color: var(--pc-muted); font-size: 12px; }
.pc-exits .say { color: var(--pc-muted); font-style: normal; }
.pc-tables { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 10px; }
.pc-tsign { border: 1px solid var(--pc-line); border-radius: 8px; background: var(--pc-panel-high); padding: 9px 11px; display: flex; flex-direction: column; gap: 4px; }
.pc-tsign__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pc-tsign__main { font-size: 14.5px; font-weight: 600; }
.pc-tsign__sub { font-size: 12.5px; color: var(--pc-muted); }
.pc-tsign--playing { border-color: rgba(183,212,169,.6); }
.pc-tsign--waiting { border-color: rgba(228,199,138,.6); }
.pc-tsign--idle { opacity: .85; }
.pc-tsign--real { border-color: rgba(228,187,122,.7); }
.pc-reason-row { display: grid; grid-template-columns: 96px minmax(0,1fr) 36px; align-items: center; gap: 8px; margin: 4px 0; }
.pc-reason-row .bar { height: 12px; border-radius: 3px; background: #2b3637; overflow: hidden; }
.pc-reason-row .bar i { display: block; height: 100%; border-radius: 3px; }
.pc-reason-row .count { font-size: 13px; text-align: right; font-variant-numeric: tabular-nums; }
@container (max-width: 760px) {
  .pc-hud__journal { max-width: none; margin-left: 0; }
  .pc-crowd { grid-template-columns: 1fr; }
  .pc-grid--split { grid-template-columns: 1fr; }
}
`;

export const C2_CSS = `
.pc-phase { display: flex; gap: 8px; align-items: center; flex-wrap: wrap; margin-bottom: 12px; }
.pc-phase__step { display: inline-flex; align-items: center; gap: 6px; padding: 5px 12px; border-radius: 999px; border: 1px solid var(--pc-line); font-size: 13px; color: var(--pc-muted); background: var(--pc-panel); }
.pc-phase__step--now { color: #f0e9c8; border-color: rgba(228,187,122,.7); background: #2c352c; font-weight: 600; }
.pc-phase__step--done { color: var(--pc-green); border-color: rgba(183,212,169,.45); }
.pc-phase__arrow { color: var(--pc-muted); }
.pc-phase__actions { margin-left: auto; display: flex; gap: 8px; flex-wrap: wrap; }
.pc-advice { display: flex; gap: 12px; align-items: flex-start; }
.pc-grid--split2 { grid-template-columns: minmax(0,1.15fr) minmax(0,1fr); }
.pc-advice__icon { font-size: 22px; line-height: 1; margin-top: 2px; }
.pc-advice__why { margin-top: 6px; color: var(--pc-muted); font-size: 12.5px; }
.pc-advice__actions { margin-top: 8px; display: flex; gap: 8px; flex-wrap: wrap; align-items: center; }
.pc-avoid { margin-top: 8px; padding: 6px 10px; border-left: 3px solid var(--pc-amber); background: rgba(228,199,138,.06); font-size: 12.5px; color: var(--pc-amber); border-radius: 0 6px 6px 0; }
.pc-upg { display: flex; flex-direction: column; gap: 4px; padding: 8px 10px; border: 1px solid #2c3839; border-radius: 8px; background: #202a2b; }
.pc-upg--planned { border-style: dashed; opacity: .9; }
.pc-upg__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; }
.pc-prep { display: flex; flex-direction: column; gap: 8px; }
.pc-prep__item { display: flex; gap: 10px; align-items: flex-start; padding: 8px 10px; border: 1px solid #2c3839; border-radius: 8px; background: #202a2b; flex-wrap: wrap; }
.pc-prep__body { flex: 1; min-width: 200px; }
.pc-prep__body b { font-size: 14px; }
.pc-prep__body .d { color: var(--pc-muted); font-size: 12.5px; }
.pc-prep__side { display: flex; flex-direction: column; gap: 4px; align-items: flex-end; }
.pc-confirm { margin-top: 10px; padding: 10px 12px; border: 1px solid rgba(228,187,122,.5); border-radius: 8px; background: #232c28; display: flex; flex-direction: column; gap: 8px; }
.pc-confirm__btns { display: flex; gap: 8px; flex-wrap: wrap; }
@container (max-width: 760px) {
  .pc-grid--split2 { grid-template-columns: 1fr; }
  .pc-phase__actions { margin-left: 0; }
}
`;

export const C3_CSS = `
.pc-guide-top { display: flex; align-items: center; gap: 10px; flex-wrap: wrap; margin-bottom: 10px; }
.pc-guide-day { font-size: 17px; font-weight: 600; color: #f0e9c8; }
.pc-guide-goal { color: var(--pc-muted); font-size: 13px; }
.pc-step { padding: 10px 12px; border: 1px solid #2c3839; border-radius: 8px; background: #202a2b; margin-bottom: 8px; }
.pc-step--active { border-color: rgba(228,187,122,.75); background: #26302a; }
.pc-step--done { opacity: .75; }
.pc-step--upcoming { opacity: .55; }
.pc-step__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; font-weight: 600; font-size: 14.5px; }
.pc-step__body { color: var(--pc-muted); font-size: 13px; margin-top: 4px; }
.pc-step__trigger { color: var(--pc-muted); font-size: 11.5px; margin-top: 4px; }
.pc-step__choices { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; }
.pc-choice { display: flex; flex-direction: column; gap: 2px; align-items: flex-start; }
.pc-choice small { color: var(--pc-muted); font-size: 11.5px; }
.pc-reg { padding: 9px 11px; border: 1px solid #2c3839; border-radius: 8px; background: #202a2b; margin-bottom: 8px; }
.pc-reg__head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.pc-reg__head b { font-size: 14.5px; }
.pc-reg__need { margin-top: 6px; padding: 7px 10px; border-left: 3px solid var(--pc-violet); background: rgba(201,174,224,.06); border-radius: 0 6px 6px 0; font-size: 13px; }
.pc-reg__need .meta { color: var(--pc-muted); font-size: 12px; margin-top: 2px; }
.pc-reg__story { margin-top: 6px; color: var(--pc-muted); font-size: 12.5px; }
.pc-req { display: flex; gap: 8px; align-items: flex-start; padding: 6px 0; border-bottom: 1px solid #2c3839; font-size: 13.5px; }
.pc-req:last-child { border-bottom: 0; }
.pc-req .mark { flex: none; font-weight: 700; }
.pc-req--ok .mark { color: var(--pc-green); }
.pc-req--no .mark { color: var(--pc-red); }
.pc-req .d { color: var(--pc-muted); font-size: 12.5px; }
.pc-story-fact { padding: 7px 10px; border-left: 3px solid var(--pc-green); background: rgba(183,212,169,.05); border-radius: 0 6px 6px 0; margin-bottom: 6px; font-size: 13.5px; }
.pc-story-trend { padding: 7px 10px; border-left: 3px solid var(--pc-blue); background: rgba(168,197,224,.05); border-radius: 0 6px 6px 0; margin-bottom: 6px; font-size: 13px; }
.pc-story-sug { padding: 7px 10px; border-left: 3px solid var(--pc-gold); background: rgba(228,187,122,.05); border-radius: 0 6px 6px 0; margin-bottom: 6px; font-size: 13px; }
.pc-story-meta { color: var(--pc-muted); font-size: 11.5px; }
`;
