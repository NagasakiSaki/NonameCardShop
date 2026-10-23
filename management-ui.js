/* Presentation adapter. All writes go through named, transactional module commands. */
window.ManagementUI = (() => {
  let tab='news',selectedRegular=null,signature='',editorId='market';
  const money=n=>'¥'+Math.round(n||0).toLocaleString('zh-CN');
  const node=(tag,text,cls)=>{const el=document.createElement(tag);if(text!==undefined)el.textContent=text;if(cls)el.className=cls;return el;};
  const card=id=>byId.get(id);
  function button(text,fn,disabled=false){const b=node('button',text,'btn plain');b.type='button';b.disabled=disabled;b.onclick=fn;return b;}
  function command(name,payload){const result=ShopModules.dispatch(state,name,payload);if(!result.ok){ShopGame.toast(result.error);return result;}store.save(state);signature='';refresh();return result;}
  function show(next='news',regularId=null){if(!DATA)return;tab=next;selectedRegular=regularId;if($('#shopPanel').open)$('#shopPanel').close();if($('#taskBoard').open)$('#taskBoard').close();if($('#battleSetup').open)$('#battleSetup').close();signature='';render();if(!$('#managementPanel').open)$('#managementPanel').showModal();}
  function cardRow(id){const row=node('article',undefined,'management-card'),c=card(id);if(c){const image=node('img');image.src=`/img/${encodeURIComponent(c.img)}`;image.alt=c.name;image.loading='lazy';image.onerror=()=>image.hidden=true;const art=button('',()=>openCardDetails(c));art.classList.add('management-art');art.append(image);row.append(art);}return row;}
  function actions(row){const root=node('div',undefined,'management-actions');row.append(root);return root;}
  function heading(root,title,description){root.append(node('h3',title),node('p',description,'management-muted'));}
  function news(root){
    heading(root,`第 ${state.business.day} 天 · ${['周一','周二','周三','周四','周五','周六','周日'][(state.business.day-1)%7]}营业报`,'行情改变参考售价和顾客偏好；已接受订单和收卡申请的报价不会跟着改变。');
    for(const event of ShopModules.value('market.active',state,[])){const entry=node('article',undefined,'management-news');entry.append(node('span',event.fromDay?'赛后关注':'今日话题','management-tag'),node('h3',event.title),node('p',event.description||''),node('small',`参考价 ${Math.round((event.price||1)*100)}% · 需求 ${Math.round((event.demand||1)*100)}%${event.toDay?` · 至第 ${event.toDay} 天`:''}`));root.append(entry);}
    const cfg=ShopModules.get('tournaments').config,entry=state.modules.tournaments.data.entries.find(e=>e.day===state.business.day),panel=node('article',undefined,'management-news');
    panel.append(node('span','店内赛事','management-tag'),node('h3',cfg.name),node('p',`每周第 ${cfg.weekday} 天举办，首次第 ${cfg.minDay} 天。报名 ${money(cfg.entryFee)}，冠军奖金 ${money(cfg.winCash)}；赛后关注会带来单卡需求。`));
    const level=ShopModules.value('upgrades.level',state,0,{id:cfg.requiredUpgrade}),today=(state.business.day-1)%7+1===cfg.weekday&&state.business.day>=cfg.minDay;
    panel.append(button(entry?entry.status==='registered'?'继续已报名的比赛':'本周店赛已结束':!level?'先建一张店赛牌桌':!today?'查看 KOF 阵容，准备周日':'登记三将，参加店赛',()=>{close();openBattleSetup(null,{mode:'kof',ranked:today&&!!level});},!!entry&&entry.status==='finished'));
    if(entry?.status==='registered')panel.append(node('p','这场报名尚未结算，可从牌桌恢复登记。','management-muted'));
    root.append(panel);
  }
  function people(root){
    heading(root,'熟悉的街坊','常客会记住成交与委托。每天首次聊天增加关系；可以从背包保留一张收藏，再出售重复卡。');
    const cfg=ShopModules.get('neighbors').config;
    for(const person of cfg.regulars){const p=state.modules.neighbors.data.people[person.id]||{relationship:0},entry=node('article',undefined,'neighbor-card');entry.dataset.regular=person.id;entry.classList.toggle('selected',selectedRegular===person.id);entry.append(node('div',person.name,'neighbor-name'),node('span',p.lastVisit===state.business.day?'今日来过小店':'今天还没见到','management-tag'),node('p',person.wish),node('p',`关系 ${p.relationship}/100 · 购买 ${p.purchases||0} 次 · 委托 ${p.completed||0} 笔`,'management-muted'));
      const a=actions(entry);a.append(button(p.lastTalk===state.business.day?'再聊两句':'聊一聊',()=>{const result=command('neighbors.talk',{regularId:person.id});if(result.ok){selectedRegular=person.id;render();const target=$(`[data-regular="${person.id}"]`);target.append(node('blockquote',result.text,'neighbor-dialogue'));}},p.lastVisit!==state.business.day),button('看委托 / 收卡',()=>{tab='orders';selectedRegular=person.id;render();}),button('BO3 切磋',()=>{const enemy=DATA.cards.find(c=>c.pack==='standard'&&c.group===person.group);close();openBattleSetup(null,{mode:'bo3',opponent:enemy?.id,regularId:person.id});}));root.append(entry);
    }
  }
  function orders(root){
    heading(root,'预约委托','接单后在期限内，从背包交付。货架和锁定收藏不自动用于交单；只有交付所得计入顾客营业额。');
    if(selectedRegular)root.append(button('显示全部街坊',()=>{selectedRegular=null;render();}));
    const list=state.modules.neighbors.data.orders.filter(o=>!selectedRegular||o.regularId===selectedRegular).filter(o=>['offered','accepted'].includes(o.status));
    for(const order of list){const row=cardRow(order.cardId),body=node('div'),c=card(order.cardId),available=ShopModules.value('inventory.available',state,state.collection[order.cardId]||0,{cardId:order.cardId});row.dataset.order=order.id;body.append(node('span',order.status==='accepted'?'已接单':'可预约','management-tag'),node('h3',`${c?.name||order.cardId} ×${order.quantity}`),node('p',`${order.customer} · 报价 ${money(order.amount)} · 第 ${order.expiresDay} 天结束前交付`),node('small',`背包可交易 ${available} 张 · 已锁定 ${ShopModules.value('inventory.locked',state,0,{cardId:order.cardId})} 张`));row.append(body);const a=actions(body);if(order.status==='offered'){a.append(button('接受委托',()=>command('neighbors.accept',{id:order.id}),state.business.phase==='closed'),button('婉拒',()=>command('neighbors.decline',{id:order.id})));}else a.append(button('交付并收款',()=>command('neighbors.deliver',{id:order.id}),available<order.quantity||state.business.phase!=='open'));root.append(row);}
    if(!list.length)root.append(node('p','目前没有待处理委托，下一天会有新的需求。','empty-business'));
    heading(root,'街坊带来的旧收藏','报价在申请生成时确定。买下的是这张指定武将，直接进入背包并记录进货成本，不重新抽取。');
    const offers=state.modules.neighbors.data.offers.filter(o=>o.status==='offered'&&(!selectedRegular||o.regularId===selectedRegular));
    for(const offer of offers){const row=cardRow(offer.cardId),body=node('div');row.dataset.offer=offer.id;body.append(node('h3',`${card(offer.cardId)?.name||offer.cardId} ×${offer.quantity}`),node('p',`${offer.customer} · 收购价 ${money(offer.amount)} · 保留至第 ${offer.expiresDay} 天`),node('small',`今日参考售价 ${money(ShopBusiness.referenceCard(card(offer.cardId),state))}；实际能否成交取决于需求与预算。`));actions(body).append(button('支付并收卡',()=>{const result=command('neighbors.buy',{id:offer.id});if(result.ok)ShopGame.toast('收卡完成，武将已放进背包。');},state.shop.cash<offer.amount||state.business.phase==='closed'));row.append(body);root.append(row);}
    const done=state.modules.neighbors.data.orders.filter(o=>['completed','expired'].includes(o.status)).slice(-5).reverse();if(done.length){heading(root,'最近委托记录','');for(const o of done)root.append(node('p',`${o.customer} · ${card(o.cardId)?.name} · ${o.status==='completed'?'已交付':'逾期未交付'}`,'management-muted'));}
  }
  function upgrades(root){
    heading(root,'让小店慢慢长大',`当前货架 ${ShopBusiness.shelfUsed(state)} / ${ShopBusiness.capacity(state)} 件 · 每日营业费用 ${money(ShopBusiness.dailyCost(state))}（含已雇员工工资）。`);
    const config=ShopModules.get('upgrades').config;
    for(const u of config.upgrades){const level=state.modules.upgrades.data.levels[u.id]||0,cost=u.costs[level],row=node('article',undefined,'upgrade-card');row.dataset.upgrade=u.id;row.append(node('span',`等级 ${level}/${u.costs.length}`,'management-tag'),node('h3',u.name),node('p',u.description),node('small',`第 ${u.minDay} 天解锁${u.dailyCost?` · 每日工资 ${money(u.dailyCost)}`:''}`));row.append(button(cost===undefined?'已完成升级':`${level?'继续升级':'采购 / 雇用'} · ${money(cost)}`,()=>{const result=command('upgrades.buy',{id:u.id});if(result.ok)ShopGame.toast(`${u.name}已经安排好了。`);},cost===undefined||state.shop.cash<cost||state.business.day<u.minDay||state.business.phase==='closed'));root.append(row);}
    root.append(node('p',`补货员累计上架 ${state.modules.upgrades.data.restocked} 包。每种仓库保留 ${config.warehouseReservePerPack} 包，其余按货架容量补货。`,'management-muted'));
  }
  function ledger(root){
    const d=ShopModules.value('ledger.summary',state,{}),grid=node('div',undefined,'management-metrics');heading(root,'库存成本与经营账本','进货是现金流出，商品卖掉时才计入已售成本。任务和赛事奖励另列；设施采购是投资，不冒充已售商品成本。');
    for(const [label,value] of [['顾客营业额',money(d.sales)],['已知已售成本',money(d.cogs)],['商品毛差'+(d.hasUnknownCosts?'（含成本未知商品）':''),money(d.goodsMargin)],['今日营业费用',money(state.business.phase==='closed'?d.operating:ShopBusiness.dailyCost(state))],['今日设施投资',money(d.investment)],['库存已知成本',money(d.inventoryKnownValue)],['今日收货 / 收卡成本',money(d.acquisitions)],['当前现金 / 欠款',`${money(state.shop.cash)} / ${money(state.business.debt)}`],['赛事报名支出',money(d.tournamentFees)],['赛事奖金（另计）',money(d.tournamentRewards)],['任务奖励（另计）',money(state.business.daily.taskRewards)]]){const item=node('div');item.append(node('span',label),node('strong',value));grid.append(item);}root.append(grid);
    root.append(node('p',d.hasUnknownCosts?`今天售出 ${d.unknownCostUnits} 件旧库存，其成本未知，以上毛差不能视为完整利润。`:'新进货使用加权平均成本；拆包的成本按卡牌基准价值比例分摊。','management-notice'));
    heading(root,'最近营业账','换日时记录，垃圾桶清空造成的损失单列。');for(const h of state.modules.ledger.data.history.slice(-7).reverse())root.append(node('p',`第 ${h.day} 天 · 营业额 ${money(h.sales)} · 已知售出成本 ${money(h.cogs)} · 营业费用 ${money(h.operating)} · 丢弃损失 ${money(h.writeOff)}${h.unknownCostUnits?' · 含未知成本':''}`,'management-muted'));
    root.append(button('导出完整存档备份',()=>download(`noname-shop-day-${state.business.day}.json`,{format:'noname-shop-save',version:1,savedAt:new Date().toISOString(),save:state})));
  }
  function balance(root){
    const m=DATA.powerModel,t=m.rarityThresholds,w=m.weights;
    heading(root,'武将评分与卡包定价',`强度以中立单挑为主，兼顾 KOF 接力；分数是设计估计，尚未用大规模对局胜率拟合。C <${t.U}，U ${t.U}—${t.R}，R ${t.R}—${t.SR}，SR ${t.SR}—${t.UR}，UR ≥${t.UR}${m.legendRequiresReview?' 且已规则校准':''}。`);
    const counts=Object.fromEntries(ORDER.map(r=>[r,DATA.cards.filter(c=>c.rarity===r).length])),reviewed=DATA.cards.filter(c=>c.power?.method==='规则校准估算').length;
    root.append(node('p',`全卡池 ${DATA.cards.length} 位 · ${ORDER.map(r=>`${r} ${counts[r]}`).join(' / ')} · ${reviewed} 位规则校准，其余为待复核初估。`,'management-notice'));
    root.append(node('p',`基础分 ${m.baseline}；每回合净牌差 ×${m.pointsPerCE}，伤害 ×${m.pointsPerCE*w.damage}，防伤 ×${m.pointsPerCE*w.guard}，回复 ×${m.pointsPerCE*w.heal}，控制 ×${m.pointsPerCE*w.control}，牌质 ×${m.pointsPerCE*w.quality}；扣耗牌 ×${m.pointsPerCE}、主动掉血 ×${m.pointsPerCE*w.hpLoss}。体力每点 ±${m.hpPoint}（收益封顶${m.assumptions.hpCap}血），加有限爆发与 KOF 接力。卡牌详情可查看各项依据。`,'management-muted'));
    const help=node('a','下载全武将评分表（CSV）','btn plain');help.href='data/power-audit.csv';help.download='power-audit.csv';root.append(help);
    heading(root,'卡包出货与价格','散包仅有R+小保底；完整卡盒固定各稀有度数量并保底UR。盒内内容签收后固定，拆卖不补保底。卡值是参考售价合计，成交取决于客流、预算与定价。');
    for(const p of DATA.packs){const q=ShopBalance.quote(p,ShopBusiness.config.economy.cardPrices),row=node('article',undefined,'upgrade-card');row.append(node('h3',`${p.name} · ${q.name}`),node('p',ShopBalance.describe(p,ShopBusiness.config.economy.cardPrices)),node('p',ShopBalance.describeBox(p,ShopBusiness.config.economy.cardPrices)),node('small',`参考整包毛利 ${(q.margin*100).toFixed(1)}% · 当前实际售价 ${money(ShopBusiness.retailPack(p,state))}（含行情/店主调价）`));root.append(row);}
    root.append(node('p','模块编辑器 → 出货概率与进售价，可改槽位概率、产品档位、目标毛利。强度权重和逐将修正位于 data/power-model.json，修改后运行 node tools/build-balance.cjs 并刷新；会同步重建卡表和审计表。','management-muted'));
  }
  function download(name,value){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=node('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
  function editor(root){
    heading(root,'经营模块编辑','每个模块有独立 JSON 和校验器。应用保留既有订单报价、设施等级与比赛报名快照；数据修改不会执行脚本。');
    const select=node('select');select.id='moduleConfigSelect';for(const m of ShopModules.configSummary())select.add(new Option(`${m.title} · ${m.file}`,m.id));select.value=editorId;const area=node('textarea');area.id='moduleConfigText';area.spellcheck=false;area.setAttribute('aria-label','模块 JSON 配置');const message=node('p','修改后点击校验并应用。','management-notice');message.id='moduleConfigMessage';
    const fill=()=>{editorId=select.value;area.value=JSON.stringify(ShopModules.get(editorId).config,null,2);};select.onchange=fill;fill();
    root.append(select,area,message);const row=actions(root);
    row.append(button('校验并应用',()=>{try{const value=JSON.parse(area.value),errors=ShopModules.validate(editorId,value);if(errors.length)throw new Error(errors.join('\n'));localStorage.setItem(`noname-module-${editorId}-v1`,JSON.stringify(value));ShopModules.configure(editorId,value);store.save(state);message.textContent='已校验并应用。新参数生效，现有订单与报名快照保留。';message.dataset.status='ok';}catch(e){message.textContent=`未应用，原配置保留：${e.message}`;message.dataset.status='error';}}),button('导出配置',()=>{try{const value=JSON.parse(area.value),errors=ShopModules.validate(editorId,value);if(errors.length)throw new Error(errors.join('\n'));download(ShopModules.get(editorId).file.split('/').at(-1),value);}catch(e){message.textContent=e.message;}}),button('恢复项目默认',async()=>{try{const response=await fetch(ShopModules.get(editorId).file);if(!response.ok)throw new Error('默认配置读取失败');const value=await response.json();ShopModules.configure(editorId,value);localStorage.removeItem(`noname-module-${editorId}-v1`);fill();store.save(state);message.textContent='已恢复项目配置，进度保留。';}catch(e){message.textContent=e.message;}}));
    const label=node('label','导入 JSON','btn plain file-import'),input=node('input');input.type='file';input.accept='.json,application/json';input.onchange=async()=>{const f=input.files[0];if(!f)return;if(f.size>1000000){message.textContent='配置限制 1 MB';return;}area.value=await f.text();message.textContent='已读入，尚未应用。';input.value='';};label.append(input);row.append(label);root.append(node('p','扩展入口：modules/registry.js · 新模块注册自己的配置、存档版本、命令、查询和事件处理器。完整接口见 docs/MODULES.md。','management-muted'));
  }
  function render(){
    const root=$('#managementContent');root.replaceChildren();document.querySelectorAll('[data-manage-tab]').forEach(b=>b.classList.toggle('active',b.dataset.manageTab===tab));
    ({news,people,orders,upgrades,ledger,balance,editor}[tab]||news)(root);signature=JSON.stringify([state.modules,state.business.day,state.business.phase,state.collection,state.shop.cash]);
  }
  function refresh(){if(!DATA||!state.modules)return;const events=ShopModules.value('market.active',state,[]),orders=state.modules.neighbors.data.orders.filter(o=>o.status==='accepted').length;$('#managementSummary').textContent=`${events[0]?.title||'街坊小店'} · ${orders} 笔预约中`;if($('#managementPanel').open&&tab!=='editor'){const next=JSON.stringify([state.modules,state.business.day,state.business.phase,state.collection,state.shop.cash]);if(next!==signature)render();}}
  function close(){$('#managementPanel').close();}
  $('#managementBtn').onclick=()=>show();$('#managementJournalBtn').onclick=()=>show('orders');$('#managementClose').onclick=close;
  document.querySelectorAll('[data-manage-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.manageTab;selectedRegular=null;render();});
  window.addEventListener('catalogueready',refresh);window.addEventListener('collectionchange',refresh);
  return {show,close,refresh,command,isPaused:()=>$('#managementPanel').open&&tab==='editor'};
})();
