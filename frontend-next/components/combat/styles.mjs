// deliverables/playability-v4/FAST-07/src/styles.mjs
// FAST-07 专用样式系统：全部使用 fast07- 命名空间，支持注入组件根或 Shadow/Document。
// 适配 1440×900, 1366×768, 1280×720, 1024×768, 406×1000 五种尺寸。

export const CSS_STYLES = `
/* 根重置与变量 */
.fast07-root {
  --fast07-bg: #181824;
  --fast07-surface: #222234;
  --fast07-card: #2a2a40;
  --fast07-card-hover: #32324c;
  --fast07-card-selected: #343454;
  --fast07-border: #3c3c58;
  --fast07-border-subtle: #2d2d44;
  --fast07-text: #f0f0fa;
  --fast07-text-muted: #9c9cb8;
  --fast07-accent: #e5bd72;
  --fast07-accent-hover: #f3d08c;
  --fast07-accent-subtle: rgba(229, 189, 114, 0.15);
  --fast07-success: #4fb87c;
  --fast07-danger: #c2503c;
  --fast07-info: #5c7490;
  --fast07-focus: rgba(229, 189, 114, 0.6);

  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "PingFang SC", "Microsoft YaHei", sans-serif;
  color: var(--fast07-text);
  box-sizing: border-box;
  width: 100%;
  height: 100%;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  background: var(--fast07-bg);
}

.fast07-root *, .fast07-root *::before, .fast07-root *::after {
  box-sizing: inherit;
}

/* 按钮通用体系 */
.fast07-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  background: var(--fast07-card);
  color: var(--fast07-text);
  border: 1px solid var(--fast07-border);
  border-radius: 6px;
  padding: 8px 14px;
  font-size: 14px;
  font-weight: 500;
  cursor: pointer;
  transition: all 0.15s ease-out;
  min-height: 36px;
  user-select: none;
  white-space: nowrap;
}

.fast07-btn:hover:not(:disabled) {
  background: var(--fast07-card-hover);
  border-color: var(--fast07-accent);
}

.fast07-btn:active:not(:disabled) {
  transform: translateY(1px);
}

.fast07-btn:disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.fast07-btn--primary {
  background: var(--fast07-accent);
  color: #12121a;
  border-color: var(--fast07-accent);
  font-weight: 600;
}

.fast07-btn--primary:hover:not(:disabled) {
  background: var(--fast07-accent-hover);
  border-color: var(--fast07-accent-hover);
}

.fast07-btn--danger {
  background: rgba(194, 80, 60, 0.2);
  color: #f7a89e;
  border-color: rgba(194, 80, 60, 0.5);
}

.fast07-btn--danger:hover:not(:disabled) {
  background: var(--fast07-danger);
  color: #fff;
}

.fast07-btn--ghost {
  background: transparent;
  border-color: transparent;
  color: var(--fast07-text-muted);
}

.fast07-btn--ghost:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.08);
  color: var(--fast07-text);
  border-color: transparent;
}

.fast07-btn--sm {
  padding: 4px 8px;
  font-size: 12px;
  min-height: 28px;
  border-radius: 4px;
}

/* 稀有度与标签徽章 */
.fast07-rarity {
  display: inline-block;
  padding: 1px 6px;
  font-size: 11px;
  font-weight: 700;
  border-radius: 4px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
}
.fast07-rarity--SSR { background: #684a1a; color: #ffd88a; border: 1px solid #c2954a; }
.fast07-rarity--SR  { background: #4a2c68; color: #e5b8ff; border: 1px solid #8e58c2; }
.fast07-rarity--R   { background: #1f3e68; color: #aadcff; border: 1px solid #4a7bc2; }
.fast07-rarity--N   { background: #26382a; color: #bde8c6; border: 1px solid #4a6850; }

.fast07-chip {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  padding: 2px 8px;
  font-size: 12px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.08);
  color: var(--fast07-text-muted);
  border: 1px solid var(--fast07-border-subtle);
}
.fast07-chip--success { background: rgba(79, 184, 124, 0.2); color: #78e0a4; border-color: rgba(79, 184, 124, 0.4); }
.fast07-chip--warn    { background: rgba(229, 189, 114, 0.2); color: #f0cb85; border-color: rgba(229, 189, 114, 0.4); }
.fast07-chip--danger  { background: rgba(194, 80, 60, 0.2); color: #f7a89e; border-color: rgba(194, 80, 60, 0.4); }
.fast07-chip--info    { background: rgba(92, 116, 144, 0.2); color: #a4c2e5; border-color: rgba(92, 116, 144, 0.4); }

/* 卡图框：保留约 3:4 比例，占位符兜底 */
.fast07-art {
  width: 100%;
  aspect-ratio: 3 / 4;
  border-radius: 4px;
  overflow: hidden;
  background: #14141e;
  position: relative;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--fast07-border-subtle);
}

.fast07-art__img {
  width: 100%;
  height: 100%;
  object-fit: contain;
  display: block;
}

.fast07-art--missing {
  background: linear-gradient(135deg, #1e1e2d 0%, #151522 100%);
  flex-direction: column;
  gap: 6px;
  padding: 8px;
  text-align: center;
}

.fast07-art__placeholder-icon {
  font-size: 20px;
  color: var(--fast07-accent);
  opacity: 0.7;
}

.fast07-art__placeholder-name {
  font-size: 11px;
  color: var(--fast07-text-muted);
  word-break: break-all;
  line-height: 1.2;
}

/* ======================================================== */
/* 组件 1：牌桌大厅 (Table Lobby)                          */
/* ======================================================== */
.fast07-lobby {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

.fast07-lobby__header {
  padding: 12px 18px;
  background: var(--fast07-surface);
  border-bottom: 1px solid var(--fast07-border);
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-shrink: 0;
}

.fast07-lobby__title {
  font-size: 16px;
  font-weight: 700;
  color: var(--fast07-accent);
  margin: 0;
  display: flex;
  align-items: center;
  gap: 8px;
}

.fast07-lobby__wallet {
  font-size: 13px;
  color: var(--fast07-text-muted);
}
.fast07-lobby__wallet strong {
  color: #fff;
}

.fast07-lobby__main {
  flex: 1;
  display: grid;
  grid-template-columns: 1.1fr 1fr;
  gap: 16px;
  padding: 16px;
  overflow: hidden;
}

/* 左侧：牌桌列表与详情 */
.fast07-lobby__left-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow: hidden;
}

.fast07-lobby__table-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(160px, 1fr));
  gap: 10px;
  overflow-y: auto;
  max-height: 220px;
  padding-right: 4px;
}

.fast07-table-card {
  background: var(--fast07-card);
  border: 1px solid var(--fast07-border);
  border-radius: 8px;
  padding: 10px;
  cursor: pointer;
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition: all 0.15s;
}

.fast07-table-card:hover {
  background: var(--fast07-card-hover);
  border-color: rgba(229, 189, 114, 0.4);
}

.fast07-table-card.is-selected {
  background: var(--fast07-card-selected);
  border-color: var(--fast07-accent);
  box-shadow: 0 0 0 1px var(--fast07-accent);
}

.fast07-table-card__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fast07-table-card__name {
  font-weight: 600;
  font-size: 14px;
}

.fast07-table-card__meta {
  font-size: 12px;
  color: var(--fast07-text-muted);
  display: flex;
  justify-content: space-between;
}

.fast07-table-card__fee {
  color: var(--fast07-accent);
  font-weight: 500;
}

/* 牌桌详细展示 */
.fast07-table-detail {
  background: var(--fast07-surface);
  border: 1px solid var(--fast07-border);
  border-radius: 8px;
  padding: 12px 14px;
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
}

.fast07-table-detail__title {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.fast07-stat-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fast07-stat-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 2px 0;
  border-bottom: 1px dashed var(--fast07-border-subtle);
}

.fast07-stat-row:last-child {
  border-bottom: none;
}

.fast07-stat-label {
  color: var(--fast07-text-muted);
}

.fast07-stat-val {
  font-weight: 500;
}

/* 右侧：阵容摘要与开桌费设置 */
.fast07-lobby__right-col {
  display: flex;
  flex-direction: column;
  gap: 12px;
  overflow-y: auto;
}

.fast07-panel {
  background: var(--fast07-surface);
  border: 1px solid var(--fast07-border);
  border-radius: 8px;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.fast07-panel__head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 14px;
  font-weight: 600;
  color: var(--fast07-text);
}

/* 阵容摘要行 */
.fast07-roster-summary {
  display: flex;
  gap: 8px;
  align-items: center;
  flex-wrap: wrap;
}

.fast07-roster-slot-pill {
  background: var(--fast07-card);
  border: 1px solid var(--fast07-border);
  border-radius: 6px;
  padding: 6px 10px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
}

.fast07-roster-slot-pill__num {
  font-size: 11px;
  color: var(--fast07-accent);
  font-weight: 700;
}

.fast07-roster-slot-pill__empty {
  color: var(--fast07-text-muted);
  font-style: italic;
}

/* 店主收费设置独立块 */
.fast07-fee-config {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.fast07-fee-presets {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}

.fast07-fee-feedback {
  font-size: 12px;
  color: var(--fast07-success);
}

/* 大厅底部动作栏 */
.fast07-lobby__footer {
  padding: 10px 18px;
  background: var(--fast07-surface);
  border-top: 1px solid var(--fast07-border);
  display: flex;
  justify-content: flex-end;
  gap: 10px;
  flex-shrink: 0;
}

/* ======================================================== */
/* 组件 2：独立选将窗口 (Roster Picker)                     */
/* ======================================================== */
.fast07-picker {
  display: flex;
  flex-direction: column;
  height: 100%;
  overflow: hidden;
}

/* 选将头部工具栏 */
.fast07-picker__head {
  padding: 10px 16px;
  background: var(--fast07-surface);
  border-bottom: 1px solid var(--fast07-border);
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex-shrink: 0;
}

.fast07-picker__controls-row {
  display: flex;
  gap: 10px;
  align-items: center;
  flex-wrap: wrap;
}

.fast07-search-input {
  background: var(--fast07-card);
  border: 1px solid var(--fast07-border);
  color: var(--fast07-text);
  border-radius: 4px;
  padding: 6px 10px;
  font-size: 13px;
  min-width: 160px;
  flex: 1;
}

.fast07-search-input:focus {
  outline: none;
  border-color: var(--fast07-accent);
  box-shadow: 0 0 0 1px var(--fast07-accent);
}

.fast07-filter-group {
  display: inline-flex;
  border-radius: 4px;
  overflow: hidden;
  border: 1px solid var(--fast07-border);
}

.fast07-filter-btn {
  background: var(--fast07-card);
  border: none;
  border-right: 1px solid var(--fast07-border);
  color: var(--fast07-text-muted);
  padding: 6px 10px;
  font-size: 12px;
  cursor: pointer;
  transition: all 0.15s;
}

.fast07-filter-btn:last-child {
  border-right: none;
}

.fast07-filter-btn.is-active {
  background: var(--fast07-accent);
  color: #12121a;
  font-weight: 600;
}

/* 有序已选阵容栏 (Selected Bar) */
.fast07-selected-bar {
  background: #1e1e2c;
  border-bottom: 1px solid var(--fast07-border);
  padding: 8px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  flex-shrink: 0;
}

.fast07-selected-bar__label {
  font-size: 13px;
  font-weight: 600;
  color: var(--fast07-accent);
  display: flex;
  align-items: center;
  gap: 6px;
  white-space: nowrap;
}

.fast07-selected-slots {
  display: flex;
  gap: 10px;
  flex: 1;
  overflow-x: auto;
  padding: 2px 0;
}

.fast07-slot-card {
  background: var(--fast07-card);
  border: 1px solid var(--fast07-border);
  border-radius: 6px;
  padding: 6px 8px;
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 170px;
  position: relative;
  transition: all 0.15s;
}

.fast07-slot-card.is-filled {
  border-color: rgba(229, 189, 114, 0.4);
}

.fast07-slot-card.is-empty {
  border-style: dashed;
  background: transparent;
  color: var(--fast07-text-muted);
  justify-content: center;
}

.fast07-slot-card__index {
  font-size: 11px;
  font-weight: 700;
  color: var(--fast07-accent);
  background: rgba(229, 189, 114, 0.12);
  padding: 2px 5px;
  border-radius: 3px;
  white-space: nowrap;
}

.fast07-slot-card__name {
  font-size: 13px;
  font-weight: 600;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.fast07-slot-card__actions {
  display: flex;
  gap: 2px;
}

.fast07-slot-btn {
  background: transparent;
  border: 1px solid transparent;
  color: var(--fast07-text-muted);
  font-size: 11px;
  padding: 2px 4px;
  border-radius: 3px;
  cursor: pointer;
}

.fast07-slot-btn:hover:not(:disabled) {
  background: rgba(255, 255, 255, 0.1);
  color: #fff;
}

.fast07-slot-btn:disabled {
  opacity: 0.25;
  cursor: not-allowed;
}

/* 主内容区分列：左侧分页卡片网格 + 右侧卡牌技能详情 */
.fast07-picker__body {
  flex: 1;
  display: grid;
  grid-template-columns: 1fr 300px;
  gap: 14px;
  padding: 12px 16px;
  overflow: hidden;
}

.fast07-card-grid-container {
  display: flex;
  flex-direction: column;
  overflow: hidden;
}

.fast07-card-grid {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  grid-template-rows: repeat(2, 1fr);
  gap: 10px;
  overflow: hidden;
  padding: 2px;
}

/* 卡牌网格瓦片 (Card Tile) */
.fast07-card-tile {
  background: var(--fast07-card);
  border: 1px solid var(--fast07-border);
  border-radius: 6px;
  padding: 6px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  cursor: pointer;
  position: relative;
  transition: all 0.15s ease-out;
  overflow: hidden;
}

.fast07-card-tile:hover:not(.is-disabled) {
  border-color: var(--fast07-accent);
  background: var(--fast07-card-hover);
  transform: translateY(-1px);
}

.fast07-card-tile.is-selected {
  border-color: var(--fast07-accent);
  background: var(--fast07-card-selected);
  box-shadow: 0 0 0 1px var(--fast07-accent);
}

.fast07-card-tile.is-active-preview {
  outline: 2px solid rgba(229, 189, 114, 0.7);
}

.fast07-card-tile.is-disabled {
  opacity: 0.45;
  cursor: not-allowed;
  filter: grayscale(0.5);
}

.fast07-card-tile__top-bar {
  display: flex;
  justify-content: space-between;
  align-items: center;
  position: absolute;
  top: 8px;
  left: 8px;
  right: 8px;
  z-index: 2;
  pointer-events: none;
}

.fast07-card-tile__fav-btn {
  background: rgba(20, 20, 30, 0.75);
  border: 1px solid rgba(255, 255, 255, 0.2);
  color: #ffda73;
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 12px;
  cursor: pointer;
  pointer-events: auto;
  transition: transform 0.15s;
}

.fast07-card-tile__fav-btn:hover {
  transform: scale(1.15);
  background: rgba(20, 20, 30, 0.95);
}

.fast07-card-tile__info {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fast07-card-tile__name-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  font-size: 13px;
  font-weight: 600;
}

.fast07-card-tile__status-hint {
  font-size: 11px;
  color: var(--fast07-text-muted);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

/* 分页器 */
.fast07-pagination {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 8px 0 0 0;
  border-top: 1px solid var(--fast07-border-subtle);
  flex-shrink: 0;
  font-size: 13px;
}

.fast07-pagination__info {
  color: var(--fast07-text-muted);
}

.fast07-pagination__actions {
  display: flex;
  gap: 6px;
  align-items: center;
}

/* 技能预览侧栏 */
.fast07-skill-panel {
  background: var(--fast07-surface);
  border: 1px solid var(--fast07-border);
  border-radius: 8px;
  padding: 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  overflow-y: auto;
}

.fast07-skill-panel__header {
  display: flex;
  gap: 10px;
  align-items: center;
  border-bottom: 1px solid var(--fast07-border-subtle);
  padding-bottom: 8px;
}

.fast07-skill-panel__art-thumb {
  width: 48px;
  height: 64px;
  flex-shrink: 0;
}

.fast07-skill-panel__meta {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.fast07-skill-panel__name {
  font-size: 15px;
  font-weight: 700;
  color: #fff;
}

.fast07-skill-item {
  background: var(--fast07-card);
  border: 1px solid var(--fast07-border-subtle);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.fast07-skill-item__title {
  font-size: 13px;
  font-weight: 700;
  color: var(--fast07-accent);
}

.fast07-skill-item__text {
  font-size: 12px;
  line-height: 1.45;
  color: var(--fast07-text);
  word-break: break-all;
}

/* 选将底部操作栏 */
.fast07-picker__footer {
  padding: 10px 16px;
  background: var(--fast07-surface);
  border-top: 1px solid var(--fast07-border);
  display: flex;
  justify-content: space-between;
  align-items: center;
  flex-shrink: 0;
}

.fast07-picker__footer-hint {
  font-size: 13px;
  color: var(--fast07-text-muted);
}

.fast07-picker__footer-actions {
  display: flex;
  gap: 10px;
}

/* ======================================================== */
/* 组件 3：非模态候战状态条 (Waiting Bar)                   */
/* ======================================================== */
.fast07-waiting-bar-host {
  position: absolute;
  top: 16px;
  left: 50%;
  transform: translateX(-50%);
  z-index: 50;
  pointer-events: none; /* 关键：宿主容器绝不阻挡地图点击 */
  max-width: 90vw;
}

.fast07-waiting-bar {
  pointer-events: auto; /* 状态条自身接收点击 */
  background: rgba(26, 26, 40, 0.92);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  border: 1px solid rgba(229, 189, 114, 0.5);
  border-radius: 24px;
  padding: 6px 16px;
  display: flex;
  align-items: center;
  gap: 12px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  animation: fast07-slide-in 0.25s ease-out;
}

@keyframes fast07-slide-in {
  from { opacity: 0; transform: translateY(-10px); }
  to { opacity: 1; transform: translateY(0); }
}

.fast07-waiting-bar__status-chip {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  font-weight: 600;
  color: var(--fast07-accent);
}

.fast07-waiting-bar__pulse-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--fast07-accent);
  box-shadow: 0 0 6px var(--fast07-accent);
  animation: fast07-pulse 1.4s infinite;
}

@keyframes fast07-pulse {
  0% { transform: scale(0.9); opacity: 0.6; }
  50% { transform: scale(1.2); opacity: 1; }
  100% { transform: scale(0.9); opacity: 0.6; }
}

.fast07-waiting-bar__info {
  font-size: 13px;
  color: var(--fast07-text);
  display: flex;
  align-items: center;
  gap: 8px;
}

.fast07-waiting-bar__actions {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap:wrap;
}

/* ======================================================== */
/* 尺寸响应式适配规则 (5 种尺寸检验)                         */
/* ======================================================== */

/* 1. 紧凑桌面 / 平板横屏 (<= 1024px) */
@media (max-width: 1024px) {
  .fast07-picker__body {
    grid-template-columns: 1fr 240px;
    gap: 10px;
  }
  .fast07-card-grid {
    grid-template-columns: repeat(3, 1fr);
    grid-template-rows: repeat(2, 1fr);
  }
}

/* 2. 小笔记本 / 720p (<= 1280x720) */
@media (max-height: 720px) {
  .fast07-picker__head { padding: 6px 12px; }
  .fast07-selected-bar { padding: 6px 12px; }
  .fast07-picker__body { padding: 8px 12px; }
  .fast07-picker__footer { padding: 8px 12px; }
  .fast07-slot-card { min-width: 140px; padding: 4px 6px; }
}

/* 3. 极窄屏 / 手机立屏 (<= 480px, 特别针对 406x1000) */
@media (max-width: 480px) {
  .fast07-lobby__main {
    grid-template-columns: 1fr;
    overflow-y: auto;
  }
  .fast07-picker__body {
    grid-template-columns: 1fr;
    grid-template-rows: 1fr 140px;
  }
  .fast07-card-grid {
    grid-template-columns: repeat(2, 1fr);
    grid-template-rows: repeat(2, 1fr);
  }
  .fast07-selected-slots {
    flex-direction: column;
    max-height: 110px;
  }
  .fast07-waiting-bar {
    border-radius: 12px;
    padding: 6px 10px;
    flex-wrap: wrap;
    justify-content: center;
  }
}
`;

export function injectStyles(target = document.head) {
  const STYLE_ID = 'fast07-styles';
  const doc = target.ownerDocument || document;
  if (doc.getElementById(STYLE_ID)) return;
  const style = doc.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS_STYLES;
  // Component roots replace their children during mount. Keep the shared style outside them.
  doc.head.appendChild(style);
}
