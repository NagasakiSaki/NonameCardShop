// deliverables/playability-v4/FAST-07/src/picker.mjs
// 独立选将窗口组件：支持分页、搜索、稀有度与收藏筛选、技能按需预览、有序阵容槽位管理。
// 翻页/搜索/切筛选/切技能绝不清除已选阵容；选满后才允许确认；取消不覆盖父窗草稿。
import { el, clear, button, rarityChip, chip, cardArt, RARITIES } from './dom.mjs';
import { injectStyles } from './styles.mjs';

export function mountRosterPicker({
  root,
  view = {},
  actions = {},
  draft = {},
  prefix = 'fast07',
}) {
  injectStyles(root);

  // 1. 初始化草稿与状态
  const initialMode = 'kof';
  const initialSlots = 3;
  const initialRefs = Array.isArray(draft.selectedRefs)
    ? [...draft.selectedRefs]
    : Array.isArray(view.initialSelectedRefs)
    ? [...view.initialSelectedRefs]
    : [];

  const state = {
    mode: initialMode,
    slots: initialSlots,
    selectedRefs: initialRefs.slice(0, initialSlots),
    page: draft.page || 0,
    search: draft.search || '',
    rarity: draft.rarity || 'all',
    favoriteFilter: draft.favoriteFilter || 'all', // 'all' | 'favorite'
    activePreviewKey: draft.activePreviewKey || null,
    skillLoading: false,
    skillCache: new Map(), // cardKey -> Array<{title, text}>
    favoriteCardKeys: new Set(view.favoriteCardKeys || []),
    modeNotice: null,skillPage:0,mobileView:'cards',
  };

  let disposed = false;
  let skillRequestId = 0;

  // 容器根节点
  const container = el('div', { class: `${prefix}-root ${prefix}-picker` });
  root.replaceChildren(container);

  // 2. 核心辅助计算：物品索引与武将去重
  let items = view.items || [];
  const itemMap = new Map();
  const favoritePending=new Set();
  for (const it of items) itemMap.set(it.inventoryRef, it);

  // 默认激活第一张卡为技能预览
  if (!state.activePreviewKey && items.length > 0) {
    state.activePreviewKey = items[0].cardKey;
  }

  // 响应式每页容量计算：以可用宽度为基准，避免溢出与纵向滚条
  function getPageSize() {
    const width = root.clientWidth || window.innerWidth || 1280;
    if (width <= 480) return 4;   // 极窄立屏 2x2
    if (width <= 1024) return 6;  // 平板/紧凑 3x2
    return 8;                     // 标准桌面 4x2
  }

  // 3. 筛选与稳定排序流水线（收藏置顶）
  function computeFilteredItems() {
    const q = state.search.trim().toLowerCase();
    let list = items;

    // 搜索
    if (q) {
      list = list.filter((it) =>
        (it.name && it.name.toLowerCase().includes(q)) ||
        (it.cardKey && it.cardKey.toLowerCase().includes(q)) ||
        (it.generalId && it.generalId.toLowerCase().includes(q))
      );
    }

    // 稀有度
    if (state.rarity !== 'all') {
      list = list.filter((it) => it.rarity === state.rarity);
    }

    // 仅看收藏
    if (state.favoriteFilter === 'favorite') {
      list = list.filter((it) => state.favoriteCardKeys.has(it.cardKey));
    }

    // 排序：收藏项严格置顶；其余按稀有度降序及稳定名称排序
    const rarityRank = { SSR: 4, SR: 3, R: 2, N: 1 };
    list = [...list].sort((a, b) => {
      const aFav = state.favoriteCardKeys.has(a.cardKey);
      const bFav = state.favoriteCardKeys.has(b.cardKey);
      if (aFav && !bFav) return -1;
      if (!aFav && bFav) return 1;

      // 稀有度
      const rDiff = (rarityRank[b.rarity] || 0) - (rarityRank[a.rarity] || 0);
      if (rDiff !== 0) return rDiff;

      // 稳定名称/cardKey
      return (a.name || '').localeCompare(b.name || '', 'zh');
    });

    return list;
  }

  // 4. 异步加载技能防竞态
  function requestSkillDetail(cardKey) {
    if (!cardKey || state.skillCache.has(cardKey)) return;
    if (typeof actions.loadCardDetail !== 'function') return;

    state.skillLoading = true;
    const currentToken = ++skillRequestId;

    Promise.resolve(actions.loadCardDetail({ cardKey }))
      .then((skills) => {
        if (disposed || currentToken !== skillRequestId) return;
        state.skillCache.set(cardKey, Array.isArray(skills) ? skills : []);
        state.skillLoading = false;
        renderSkillPanel();
      })
      .catch((err) => {
        if (disposed || currentToken !== skillRequestId) return;
        state.skillCache.set(cardKey, [{ title: '读取失败', text: err?.message || '技能信息暂未接入' }]);
        state.skillLoading = false;
        renderSkillPanel();
      });
  }

  // 5. 渲染各个子模块
  let headNode, selectedBarNode, bodyNode, footNode;
  let cardGridNode, paginationNode, skillPanelNode;

  function renderHead() {
    clear(headNode);
    headNode.append(
      el('div', { class: `${prefix}-picker__controls-row` }, [
        // 模式切换
        el('div', { class: `${prefix}-filter-group` }, [
          el('button', {
            class: `${prefix}-filter-btn` + (state.mode === 'kof' ? ' is-active' : ''),
            type: 'button',
            text: 'KOF 三将接力',
            disabled: true,
          }),

        ]),

        // 搜索框
        el('input', {
          class: `${prefix}-search-input`,
          type: 'search',
          placeholder: '搜索武将姓名…',
          value: state.search,
          oninput: (e) => {
            state.search = e.target.value;
            state.page = 0;
            renderContent();
          },
        }),

        // 稀有度筛选
        el('div', { class: `${prefix}-filter-group` }, [
          el('button', {
            class: `${prefix}-filter-btn` + (state.rarity === 'all' ? ' is-active' : ''),
            type: 'button',
            text: '全部品阶',
            onclick: () => { state.rarity = 'all'; state.page = 0; renderContent(); },
          }),
          ...RARITIES.map((r) =>
            el('button', {
              class: `${prefix}-filter-btn` + (state.rarity === r ? ' is-active' : ''),
              type: 'button',
              text: r,
              onclick: () => { state.rarity = r; state.page = 0; renderContent(); },
            })
          ),
        ]),

        // 收藏筛选开关
        el('div', { class: `${prefix}-filter-group` }, [
          el('button', {
            class: `${prefix}-filter-btn` + (state.favoriteFilter === 'all' ? ' is-active' : ''),
            type: 'button',
            text: '全部武将',
            onclick: () => { state.favoriteFilter = 'all'; state.page = 0; renderContent(); },
          }),
          el('button', {
            class: `${prefix}-filter-btn` + (state.favoriteFilter === 'favorite' ? ' is-active' : ''),
            type: 'button',
            text: '★ 仅看收藏',
            onclick: () => { state.favoriteFilter = 'favorite'; state.page = 0; renderContent(); },
          }),
        ]),
      ])
    );

    headNode.append(button(state.mobileView==='skills'?'返回卡牌':'查看技能',()=>{state.mobileView=state.mobileView==='skills'?'cards':'skills';container.dataset.subview=state.mobileView;renderAll();},{extraClass:prefix+'-skill-toggle',small:true}));
    // 模式变更提醒条
    if (state.modeNotice) {
      headNode.append(
        el('div', {
          class: `${prefix}-chip ${prefix}-chip--warn`,
          style: { alignSelf: 'flex-start', marginTop: '4px' },
          text: `ℹ ${state.modeNotice}`,
        })
      );
    }
  }

  function renderSelectedBar() {
    clear(selectedBarNode);

    const slotNames = state.mode === 'kof' ? ['1 号先手', '2 号中坚', '3 号收尾'] : ['单将出阵'];
    const filledCount = state.selectedRefs.length;
    const isFull = filledCount === state.slots;

    selectedBarNode.append(
      el('div', { class: `${prefix}-selected-bar__label` }, [
        el('span', { text: `当前出战阵容 (${filledCount}/${state.slots})` }),
        chip(isFull ? '已选齐' : `缺 ${state.slots - filledCount} 位`, isFull ? 'success' : 'warn'),
      ]),
      el('div', { class: `${prefix}-selected-slots` },
        Array.from({ length: state.slots }).map((_, index) => {
          const ref = state.selectedRefs[index];
          const item = ref ? itemMap.get(ref) : null;
          const slotTitle = slotNames[index];

          if (!item) {
            return el('div', { class: `${prefix}-slot-card is-empty` }, [
              el('span', { class: `${prefix}-slot-card__index`, text: slotTitle }),
              el('span', { class: `${prefix}-roster-slot-pill__empty`, text: '待点选武将' }),
            ]);
          }

          return el('div', { class: `${prefix}-slot-card is-filled` }, [
            el('span', { class: `${prefix}-slot-card__index`, text: slotTitle }),
            rarityChip(item.rarity),
            el('span', { class: `${prefix}-slot-card__name`, text: item.name, title: item.name }),
            el('div', { class: `${prefix}-slot-card__actions` }, [
              // 顺序调整按钮
              button('◀', () => moveSlot(index, index - 1), {
                small: true,
                disabled: index === 0,
                title: '前移出场次序',
                extraClass: `${prefix}-slot-btn`,
              }),
              button('▶', () => moveSlot(index, index + 1), {
                small: true,
                disabled: index >= state.selectedRefs.length - 1,
                title: '后移出场次序',
                extraClass: `${prefix}-slot-btn`,
              }),
              // 移除按钮
              button('✕', () => removeSlot(ref), {
                danger: true,
                small: true,
                title: '移出阵容',
                extraClass: `${prefix}-slot-btn`,
              }),
            ]),
          ]);
        })
      )
    );
  }

  function moveSlot(fromIndex, toIndex) {
    if (toIndex < 0 || toIndex >= state.selectedRefs.length) return;
    const temp = state.selectedRefs[fromIndex];
    state.selectedRefs[fromIndex] = state.selectedRefs[toIndex];
    state.selectedRefs[toIndex] = temp;
    renderSelectedBar();
    renderContent();
  }

  function removeSlot(ref) {
    state.selectedRefs = state.selectedRefs.filter((r) => r !== ref);
    renderSelectedBar();
    renderContent();
    renderFooter();
  }

  // 渲染卡牌网格与分页
  function renderContent() {
    clear(cardGridNode);
    clear(paginationNode);

    const filtered = computeFilteredItems();
    const pageSize = getPageSize();
    const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));

    if (state.page >= totalPages) state.page = totalPages - 1;
    if (state.page < 0) state.page = 0;

    const pageItems = filtered.slice(state.page * pageSize, (state.page + 1) * pageSize);

    // 卡片网格
    if (pageItems.length === 0) {
      cardGridNode.append(
        el('div', {
          style: { gridColumn: '1 / -1', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#9c9cb8', fontSize: '14px' },
          text: '未找到符合条件的武将卡牌。可尝试清除搜索关键词或切换品阶筛选。',
        })
      );
    } else {
      for (const item of pageItems) {
        const isSelected = state.selectedRefs.includes(item.inventoryRef);
        const selectedIndex = state.selectedRefs.indexOf(item.inventoryRef);
        const isFav = state.favoriteCardKeys.has(item.cardKey);
        const isPreview = state.activePreviewKey === item.cardKey;

        // 重复武将检查：同 generalId 已在其他槽位
        const isDuplicateGeneral =
          !isSelected &&
          state.selectedRefs.some((ref) => {
            const picked = itemMap.get(ref);
            return picked && picked.generalId === item.generalId;
          });

        const isDisabled = !item.eligible || isDuplicateGeneral;

        let statusText = '可出战';
        if (isSelected) statusText = `已选 · 第 ${selectedIndex + 1} 位`;
        else if (isDuplicateGeneral) statusText = '同名武将已出战';
        else if (!item.eligible) statusText = item.reasons?.[0]?.message || '不可出战';

        const tile = el(
          'div',
          {
            role:'button',tabindex:0,'data-card-ref':item.inventoryRef,'aria-pressed':String(isSelected),
            onkeydown:event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();event.currentTarget.click();}},
            class:
              `${prefix}-card-tile` +
              (isSelected ? ' is-selected' : '') +
              (isPreview ? ' is-active-preview' : '') +
              (isDisabled ? ' is-disabled' : ''),
            onclick: () => {
              // 无论是否可用，点击均激活技能预览
              state.activePreviewKey = item.cardKey;state.skillPage=0;
              requestSkillDetail(item.cardKey);
              renderSkillPanel();
              renderContent();

              if (isDisabled && !isSelected) return;

              // 选中 / 反选逻辑
              if (isSelected) {
                removeSlot(item.inventoryRef);
              } else if (state.selectedRefs.length < state.slots) {
                state.selectedRefs.push(item.inventoryRef);
                renderSelectedBar();
                renderContent();
                renderFooter();
              }
            },
          },
          [
            // 顶部悬浮栏：品阶 + 收藏星标
            el('div', { class: `${prefix}-card-tile__top-bar` }, [
              rarityChip(item.rarity),
              el('button', {
                class: `${prefix}-card-tile__fav-btn`,
                type: 'button',
                title: isFav ? '取消收藏' : '加入收藏（置顶显示）',
                text: isFav ? '★' : '☆',
                disabled:favoritePending.has(item.cardKey),
                onclick: async (e) => {
                  e.stopPropagation(); // 关键：收藏动作绝不触发卡牌选中
                  const nextFav = !isFav;
                  favoritePending.add(item.cardKey);renderContent();
                  try{
                    const result=await actions.setFavorite?.({cardKey:item.cardKey,favorite:nextFav});
                    if(disposed)return;
                    if(result?.ok){if(nextFav)state.favoriteCardKeys.add(item.cardKey);else state.favoriteCardKeys.delete(item.cardKey);}
                    else {state.modeNotice=result?.error?.message||'收藏尚未保存，请重试。';renderHead();}
                  }catch{if(!disposed){state.modeNotice='收藏尚未确认，请查看操作结果。';renderHead();}}
                  finally{favoritePending.delete(item.cardKey);if(!disposed)renderContent();}
                },
              }),
            ]),

            // 卡面原图（兜底文字）
            cardArt(item.imageUrl, item.name, { prefix }),

            // 卡面信息行
            el('div', { class: `${prefix}-card-tile__info` }, [
              el('div', { class: `${prefix}-card-tile__name-row` }, [
                el('span', { text: item.name }),
                isSelected ? chip(`第 ${selectedIndex + 1} 位`, 'success') : null,
              ]),
              el('span', { class: `${prefix}-card-tile__status-hint`, title: statusText }, [statusText]),
            ]),
          ]
        );

        cardGridNode.append(tile);
      }
    }

    // 分页器栏
    paginationNode.append(
      el('div', { class: `${prefix}-pagination__info` }, [
        el('span', { text: `第 ${state.page + 1} / ${totalPages} 页` }),
        el('span', { style: { marginLeft: '8px', opacity: 0.7 }, text: `(候选 ${filtered.length} 张)` }),
      ]),
      el('div', { class: `${prefix}-pagination__actions` }, [
        button('上一页', () => { state.page--; renderContent(); }, {
          small: true,
          disabled: state.page <= 0,
        }),
        button('下一页', () => { state.page++; renderContent(); }, {
          small: true,
          disabled: state.page >= totalPages - 1,
        }),
        el('select', {
          class: `${prefix}-btn ${prefix}-btn--sm`,
          style: { padding: '2px 6px', background: 'var(--fast07-card)' },
          onchange: (e) => {
            state.page = Number(e.target.value);
            renderContent();
          },
        }, Array.from({ length: totalPages }).map((_, i) =>
          el('option', { value: i, text: `跳至 ${i + 1} 页`, selected: i === state.page })
        )),
      ])
    );
  }

  // 渲染右侧技能详情面板
  function renderSkillPanel() {
    clear(skillPanelNode);

    const activeItem = items.find((it) => it.cardKey === state.activePreviewKey) || items[0];
    if (!activeItem) {
      skillPanelNode.append(el('p', { class: `${prefix}-text-muted`, text: '暂无选中武将' }));
      return;
    }

    const skills = state.skillCache.get(activeItem.cardKey);

    skillPanelNode.append(
      el('div', { class: `${prefix}-skill-panel__header` }, [
        el('div', { class: `${prefix}-skill-panel__art-thumb` }, [cardArt(activeItem.imageUrl, activeItem.name, { prefix })]),
        el('div', { class: `${prefix}-skill-panel__meta` }, [
          el('div', { style: { display: 'flex', gap: '6px', alignItems: 'center' } }, [
            el('span', { class: `${prefix}-skill-panel__name`, text: activeItem.name }),
            rarityChip(activeItem.rarity),
          ]),
          el('span', { style: { fontSize: '12px', color: 'var(--fast07-text-muted)' }, text: activeItem.eligible?'可加入阵容':activeItem.reasons?.[0]?.message||'暂时不可参赛' }),
        ]),
      ])
    );

    // 技能全文列表
    if (state.skillLoading) {
      skillPanelNode.append(el('p', { style: { color: 'var(--fast07-accent)', fontSize: '12px' }, text: '正在调取武将技能全文…' }));
    } else if (skills && skills.length > 0) {
      const pages=skills.flatMap(sk=>{const text=String(sk.text||'');return Array.from({length:Math.max(1,Math.ceil(text.length/120))},(_,i)=>({title:sk.title,text:text.slice(i*120,(i+1)*120)}));});
      state.skillPage=Math.min(state.skillPage,Math.max(0,pages.length-1));
      for (const sk of pages.slice(state.skillPage,state.skillPage+1)) {
        skillPanelNode.append(
          el('div', { class: `${prefix}-skill-item` }, [
            el('span', { class: `${prefix}-skill-item__title`, text: `【${sk.title}】` }),
            el('span', { class: `${prefix}-skill-item__text`, text: sk.text }),
          ])
        );
      }
      if(pages.length>1)skillPanelNode.append(el('div',{class:prefix+'-pagination'},[button('上一段技能',()=>{state.skillPage--;renderSkillPanel();},{small:true,disabled:state.skillPage===0}),el('span',{text:(state.skillPage+1)+' / '+pages.length}),button('下一段技能',()=>{state.skillPage++;renderSkillPanel();},{small:true,disabled:state.skillPage+1>=pages.length})]));
    } else {
      skillPanelNode.append(
        el('div', { style: { padding: '8px', color: 'var(--fast07-text-muted)', fontSize: '12px' }, text: '暂未检索到技能描述文本，以卡面正式效果为准。' })
      );
    }
  }

  // 渲染底部操作栏
  function renderFooter() {
    clear(footNode);
    const filledCount = state.selectedRefs.length;
    const isFull = filledCount === state.slots;

    footNode.append(
      el('div', { class: `${prefix}-picker__footer-hint` }, [
        el('span', {
          text: isFull
            ? '✓ 阵容已齐备，点击确认将草稿存入牌桌大厅。'
            : `出阵人数未满：还需选择 ${state.slots - filledCount} 位武将方可确认。`,
        }),
      ]),
      el('div', { class: `${prefix}-picker__footer-actions` }, [
        button('取消', () => {
          if (typeof actions.cancel === 'function') actions.cancel();
        }, { ghost: true }),
        button('确认出战阵容', () => {
          if (!isFull) return;
          if (typeof actions.selectLineup === 'function') {
            actions.selectLineup({
              inventoryRefs: [...state.selectedRefs],
              mode: state.mode,
            });
          }
        }, {
          primary: true,
          disabled: !isFull,
          title: isFull ? '确认并保存当前出战阵容' : `需选满 ${state.slots} 位武将方可确认`,
        }),
      ])
    );
  }

  function renderAll() {
    renderHead();
    renderSelectedBar();
    renderContent();
    renderSkillPanel();
    renderFooter();
  }

  // 构建骨架节点
  headNode = el('div', { class: `${prefix}-picker__head` });
  selectedBarNode = el('div', { class: `${prefix}-selected-bar` });
  cardGridNode = el('div', { class: `${prefix}-card-grid` });
  paginationNode = el('div', { class: `${prefix}-pagination` });
  skillPanelNode = el('div', { class: `${prefix}-skill-panel` });

  const cardGridContainer = el('div', { class: `${prefix}-card-grid-container` }, [cardGridNode, paginationNode]);
  bodyNode = el('div', { class: `${prefix}-picker__body` }, [cardGridContainer, skillPanelNode]);
  footNode = el('div', { class: `${prefix}-picker__footer` });

  container.append(headNode, selectedBarNode, bodyNode, footNode);

  // 预取首张卡技能
  if (state.activePreviewKey) {
    requestSkillDetail(state.activePreviewKey);
  }

  renderAll();
  let lastWidth=root.clientWidth;
  const observer=typeof ResizeObserver==='function'?new ResizeObserver(()=>{if(!disposed&&root.clientWidth!==lastWidth){lastWidth=root.clientWidth;renderContent();}}):null;
  observer?.observe(root);

  // 6. 暴露组件标准契约接口
  return {
    update(nextView) {
      if (disposed || !nextView) return;
      Object.assign(view, nextView);
      if(nextView.items){items=nextView.items;itemMap.clear();for(const item of items)itemMap.set(item.inventoryRef,item);state.selectedRefs=state.selectedRefs.filter(ref=>itemMap.get(ref)?.eligible);}
      if (nextView.favoriteCardKeys) {
        state.favoriteCardKeys = new Set(nextView.favoriteCardKeys);
      }
      renderAll();
    },
    getDraft() {
      return {
        mode: state.mode,
        selectedRefs: [...state.selectedRefs],
        page: state.page,
        search: state.search,
        rarity: state.rarity,
        favoriteFilter: state.favoriteFilter,
        activePreviewKey: state.activePreviewKey,
      };
    },
    dispose() {
      disposed = true;
      observer?.disconnect();
      skillRequestId++;
      clear(container);
      container.remove();
    },
  };
}
