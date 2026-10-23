/* UI bindings for the pure daily-business and task models. */
window.BusinessUI = (()=>{
  let counterTab="supplier",taskScope="all",editorTab="tasks",buffers={},lastCounter="",lastTasks="",lastBoard="",saveElapsed=0,uiElapsed=0;
  const money=value=>"¥"+Math.round(value).toLocaleString("zh-CN");
  const el=(tag,text,className)=>elementWithText(tag,text,className);
  function button(text,fn,className="btn"){const b=el("button",text,className);b.type="button";b.onclick=fn;return b;}
  function commit(){store.save(state);}
  function close(id){$("#"+id).close();}
  function go(station){for(const id of ["taskBoard","shopPanel","dayReport"])if($("#"+id).open)close(id);ShopGame.interact(station);}
  function isPaused(){return document.hidden||state.business.paused||window.ManagementUI?.isPaused()||["shopHelp","taskEditor","dayReport"].some(id=>$("#"+id).open)||!$("#battleScreen").hidden;}
  function tick(seconds){
    if(!DATA||!state.business)return{running:false,minutes:0};
    const running=!isPaused();
    const result=running?ShopBusiness.tick(state,seconds):{minutes:0,closed:false};
    uiElapsed+=seconds;saveElapsed+=seconds;
    if(uiElapsed>.25){uiElapsed=0;refresh();}
    if(running&&saveElapsed>=3){saveElapsed=0;commit();}
    if(result.closed){ShopGame.scene?.resetCustomers();commit();showReport();}
    return{running:running&&state.business.phase!=="closed",minutes:result.minutes};
  }
  function refresh(){
    if(!DATA||!state.business)return;
    const b=state.business,d=b.daily,phase={preparing:"准备中",open:"营业中",closed:"已打烊"}[b.phase];
    $("#businessDay").textContent=`第 ${b.day} 天`;
    $("#businessTime").textContent=ShopBusiness.time(b.minute);
    $("#businessSign").textContent=phase;
    $("#businessSign").dataset.phase=b.phase;
    $("#clockPause").textContent=b.paused?"▶":"Ⅱ";
    $("#clockPause").setAttribute("aria-label",b.paused?"继续营业时间":"暂停营业时间");
    $("#clockSpeed").textContent=`${b.speed}×`;
    $("#dayAction").textContent=b.phase==="preparing"?"开门营业":b.phase==="open"?"打烊结算":"查看结算 / 换日";
    $("#dailyRevenue").textContent=money(d.revenue);$("#dailyGoal").textContent=`/ ${money(b.goal)}`;
    $("#revenueBar").style.width=Math.min(100,d.revenue/Math.max(1,b.goal)*100)+"%";
    $("#dailyPurchase").textContent=money(d.purchaseExpense);
    const mood=b.phase==="preparing"?"营业前准备":b.phase==="closed"?"打烊后整理":b.minute<690?"上午 · 客流平稳":b.minute<840?"午间 · 客流高峰":b.minute<1020?"午后 · 慢慢经营":"傍晚 · 灯光亮起";
    $("#dayMood").textContent=mood;
    $("#trafficText").textContent=b.paused?"营业时间已暂停":b.phase==="open"?`${mood} · ${ShopBusiness.traffic(state).toFixed(2)}× 客流`:mood;
    const pending=state.orders.filter(o=>o.status==="pending").length,arrived=state.orders.filter(o=>o.status==="arrived").length;
    $("#incomingOrders").textContent=arrived?`${arrived} 笔待签收`:`${pending} 笔在途`;
    $("#incomingOrders").classList.toggle("goods-ready",arrived>0);
    $("#customerStats").textContent=`${d.visitors} 位进店 · ${d.served} 位成交 · ${d.lostCustomers} 位未购 · 口碑 ${Math.round(b.reputation)}`;
    $("#dailyGuidance").textContent=b.phase==="preparing"?(b.minute>=ShopBusiness.config.clock.openMinute?"已到开门时间。点击“开门营业”继续计时；营业中仍可进货和收货。":arrived?"货已送达！到柜台签收入库，再补上货架。":"先下单进货，签收后可整包销售，也可拆成单卡。"):
      b.phase==="closed"?"整理好垃圾桶，再开始下一天。仓库与货架会保留。":ShopBusiness.shelfUsed(state)===0?"货架空了，顾客可能空手离开。快去补货吧。":d.revenue>=b.goal?"营业目标已达成！任务簿里有奖励可领取。":`距离目标还差 ${money(Math.max(0,b.goal-d.revenue))}，${ShopBusiness.time(ShopBusiness.config.clock.closeMinute)} 打烊。`;
    $("#trashNotice").textContent=`桶内 ${ShopModel.total(state.trash)} 张卡 · 开始第 ${b.day+1} 天时清空，记得及时捡回。`;
    renderShortTasks();
    window.ManagementUI?.refresh();
    if($("#taskBoard").open)renderTaskBoard();
    if($("#shopPanel").open&&ShopGame.panelMode==="counter"){
      const signature=JSON.stringify([state.orders.map(o=>[o.id,o.status]),state.stock,state.packDisplay,state.shop.cash,b.phase,ShopModules.revision]);
      if(signature!==lastCounter){lastCounter=signature;renderCounter();}
      updateSupplierSummary();
    }
  }
  function rewardText(task){return task.rewards.map(r=>r.type==="cash"?`资金 +${money(r.amount)}`:r.type==="reputation"?`口碑 +${r.amount}`:r.type==="packs"?`卡包 ${r.packId} ×${r.quantity}`:r.type).join(" · ")||"无额外奖励";}
  function claim(id){const result=ShopTasks.claim(state,id);if(result.ok){commit();ShopGame.toast(`已领取「${result.task.title}」：${rewardText(result.task)}`);}else ShopGame.toast(result.error);return result;}
  function renderShortTasks(){
    const all=ShopTasks.list(state).filter(t=>!["claimed","locked","expired"].includes(t.status));
    all.sort((a,b)=>(b.status==="ready")-(a.status==="ready")||(a.scope==="once"?0:1)-(b.scope==="once"?0:1));
    const tasks=all.slice(0,3),signature=JSON.stringify(tasks.map(t=>[t.id,t.status,t.progress]));if(signature===lastTasks)return;lastTasks=signature;
    const list=$("#taskShortList");list.replaceChildren();
    if(!tasks.length)list.appendChild(el("li","今天的任务都处理好了，准备下一天吧。","no-task"));
    for(const task of tasks){const li=el("li","",task.status==="ready"?"ready":"");const content=document.createElement("div");content.append(el("strong",task.title),el("small",task.progress.map(p=>`${Math.floor(p.value)}/${p.target}`).join(" · ")));li.appendChild(content);li.appendChild(button(task.status==="ready"?"领取":"查看",()=>task.status==="ready"?claim(task.id):showTasks(),"task-small-button"));list.appendChild(li);}
  }
  function showTasks(){lastBoard="";renderTaskBoard();if(!$("#taskBoard").open)$("#taskBoard").showModal();}
  function renderTaskBoard(){
    const tasks=ShopTasks.list(state).filter(t=>taskScope==="all"||t.scope===taskScope),signature=JSON.stringify(tasks.map(t=>[t.id,t.status,t.progress,t.title,t.description,t.rewards]));
    if(signature===lastBoard)return;lastBoard=signature;
    const root=$("#taskBoardList");root.replaceChildren();
    for(const task of tasks){
      const item=el("article","",`quest-card ${task.status}`);item.dataset.task=task.id;item.dataset.status=task.status;
      const top=el("div","","quest-top");top.append(el("span",task.scope==="daily"?"每日任务":"经营主线","quest-scope"),el("span",{active:"进行中",ready:"可领取",claimed:"已领取",expired:"今日未完成",locked:"尚未解锁"}[task.status],"quest-status"));
      item.append(top,el("h3",task.title),el("p",task.description));
      if(task.deadlineMinute!==undefined)item.appendChild(el("small",`截止 ${ShopBusiness.time(task.deadlineMinute)}；期限内完成可在当天领取。`,"quest-deadline"));
      for(const progress of task.progress){const line=el("div","","quest-progress");const bar=el("span","","quest-track"),fill=document.createElement("i");fill.style.width=Math.min(100,progress.value/progress.target*100)+"%";bar.appendChild(fill);line.append(bar,el("small",`${Math.floor(progress.value)} / ${progress.target}`));item.appendChild(line);}
      item.appendChild(el("p",rewardText(task),"quest-reward"));
      if(task.status==="locked")item.appendChild(el("small",task.dependsOn?.length?`先完成并领取：${task.dependsOn.map(id=>ShopTasks.config.tasks.find(t=>t.id===id)?.title||id).join("、")}`:"尚未满足天数或其他解锁条件。","quest-lock"));
      const actions=el("div","","quest-actions");
      const claimButton=button(task.status==="claimed"?"奖励已领取":"领取奖励",()=>claim(task.id));claimButton.disabled=task.status!=="ready";claimButton.dataset.claim=task.id;actions.appendChild(claimButton);
      if(task.guide&&!["locked","claimed","expired"].includes(task.status))actions.appendChild(button("前往处理",()=>go(task.guide),"btn plain"));
      item.appendChild(actions);root.appendChild(item);
    }
  }
  function renderCounter(tab){
    if(tab)counterTab=tab;
    $("#counterBusiness").hidden=false;
    document.querySelectorAll("[data-counter-tab]").forEach(b=>b.classList.toggle("active",b.dataset.counterTab===counterTab));
    const opening=counterTab==="opening";$("#shopCatalogue").hidden=!opening;
    $("#supplyView").hidden=opening;
    if(opening){renderPacks();return;}
    const root=$("#supplyView"),oldPack=$("#orderPack")?.value,oldQuantity=$("#orderQuantity")?.value,oldCredit=$("#orderCredit")?.checked;
    root.replaceChildren();
    const summary=el("div","","supply-summary");summary.append(el("span",`仓库 ${ShopModel.total(state.stock)} 包 · 货架 ${ShopModel.total(state.packDisplay)} 包`),el("span",`供应商欠款 ${money(state.business.debt)} / 额度 ${money(ShopBusiness.config.economy.supplierCreditLimit)}`));root.appendChild(summary);
    if(counterTab==="supplier"){
      const form=el("form","","supplier-form");form.id="supplierForm";
      const packLabel=el("label","选择卡包"),select=document.createElement("select");select.id="orderPack";
      for(const pack of DATA.packs)select.add(new Option(`${pack.name} · 进价 ${money(ShopBusiness.wholesale(pack))} / 包`,pack.id));
      select.value=oldPack&&DATA.packs.some(p=>p.id===oldPack)?oldPack:"standard";packLabel.appendChild(select);
      const quantityLabel=el("label","订购数量"),quantity=document.createElement("input");quantity.id="orderQuantity";quantity.type="number";quantity.min="1";quantity.max=String(ShopBusiness.config.supplier.maxOrderQuantity);quantity.step="1";quantity.value=oldQuantity||"3";quantityLabel.appendChild(quantity);
      const creditLabel=el("label","","credit-option"),credit=document.createElement("input");credit.id="orderCredit";credit.type="checkbox";credit.checked=!!oldCredit;creditLabel.append(credit,document.createTextNode("资金不足时使用供应商额度（销售与任务收入优先还款）"));
      const amount=el("p","","order-summary");amount.id="orderSummary";const send=button("确认下单",()=>{});send.id="placeOrder";send.type="submit";send.onclick=null;
      form.append(packLabel,quantityLabel,creditLabel,amount,send);
      form.oninput=updateSupplierSummary;form.onchange=updateSupplierSummary;
      form.onsubmit=event=>{event.preventDefault();const pack=DATA.packs.find(p=>p.id===select.value),result=ShopBusiness.order(state,pack,Number(quantity.value),credit.checked);if(!result.ok)return ShopGame.toast(result.error);commit();ShopGame.toast(`${pack.name} ×${result.order.quantity} 已下单，送达后请签收。`);renderCounter();};
      root.appendChild(form);
    }
    renderOrders(root);
    if(counterTab==="warehouse"){
      root.appendChild(el("h3","已签收的仓库库存","warehouse-heading"));
      const list=el("div","","pack-stock-list");
      for(const pack of DATA.packs.filter(p=>state.stock[p.id])){
        const row=packRow(pack,state.stock[pack.id],"仓库");
        const actions=el("div","","pack-stock-actions"),open=button("拆 1 包",()=>openPack(pack.id));open.disabled=state.business.phase==="closed";open.dataset.openStock=pack.id;
        actions.append(open,button("去货架上架",()=>go("display"),"btn plain"));row.appendChild(actions);list.appendChild(row);
      }
      if(!list.children.length)list.appendChild(el("p","仓库还没有未拆封卡包。先下单，再签收送达的货物。","empty-business"));root.appendChild(list);
    }
    updateSupplierSummary();
  }
  function stampText(value){return `第 ${Math.floor(value/1440)+1} 天 ${ShopBusiness.time(value%1440)}`;}
  function updateSupplierSummary(){
    if(!$("#orderPack"))return;
    const pack=DATA.packs.find(p=>p.id===$("#orderPack").value),quantity=Number($("#orderQuantity").value),cost=ShopBusiness.wholesale(pack)*quantity;
    const shortfall=Math.max(0,cost-state.shop.cash),credit=$("#orderCredit").checked;
    const legal=Number.isInteger(quantity)&&quantity>0&&quantity<=ShopBusiness.config.supplier.maxOrderQuantity;
    $("#orderSummary").textContent=legal?`合计 ${money(cost)} · 预计 ${stampText(ShopBusiness.stamp(state)+ShopBusiness.config.supplier.deliveryMinutes)} 送达${shortfall?` · 需赊购 ${money(shortfall)}`:""}\n${ShopBalance.describe(pack,ShopBusiness.config.economy.cardPrices)}`:"请输入有效的整数数量。";
    $("#placeOrder").disabled=!legal||state.business.phase==="closed"||shortfall>0&&(!credit||shortfall+state.business.debt>ShopBusiness.config.economy.supplierCreditLimit);
  }
  function renderOrders(root){
    const orders=state.orders.filter(o=>o.status!=="received");
    root.appendChild(el("h3",`待处理订单 · ${orders.length} 笔`,"warehouse-heading"));
    const list=el("div","","order-list");
    for(const order of orders){
      const row=el("article","","order-row");row.dataset.order=order.id;
      const text=el("div","","order-copy");text.append(el("strong",`${DATA.packs.find(p=>p.id===order.packId)?.name||order.packId} ×${order.quantity}`),el("small",`${money(order.cost)} · ${stampText(order.dueAt)} ${order.status==="arrived"?"已送达":"预计送达"}`));
      const receive=button(order.status==="arrived"?"签收入库":"运送中",()=>{const result=ShopBusiness.receive(state,order.id);if(result.ok){commit();ShopGame.toast(`已签收 ${result.quantity} 包，可拆包或上架。`);renderCounter();}else ShopGame.toast(result.error);});receive.disabled=order.status!=="arrived"||state.business.phase==="closed";receive.dataset.receive=order.id;
      row.append(text,receive);list.appendChild(row);
    }
    if(!orders.length)list.appendChild(el("p","当前没有在途或待签收订单。","empty-business"));root.appendChild(list);
  }
  function packRow(pack,n,location){const row=el("article","","pack-stock-row");row.dataset.pack=pack.id;const icon=el("div",String(pack.name).slice(0,2),"sealed-pack-icon");const text=el("div","","pack-stock-copy");text.append(el("h3",pack.name),el("strong",`${location} ×${n}`),el("p",`整包售价 ${money(ShopBusiness.retailPack(pack,state))} · 拆开获得 5 张卡`));row.append(icon,text);return row;}
  function renderShelfPricing(){
    const root=$("#shelfBusiness");root.replaceChildren();root.appendChild(el("span",`货架容量 ${ShopBusiness.shelfUsed(state)} / ${ShopBusiness.capacity(state)}`));
    for(const [kind,label]of [["cards","单卡定价"],["packs","整包定价"]]){
      const wrapper=el("label",label),select=document.createElement("select");select.id=`pricing-${kind}`;
      for(let n=6;n<=18;n++)select.add(new Option(`${n*10}% 基准价`,String(n/10)));
      select.value=String(state.business.pricing[kind]);select.onchange=()=>{state.business.pricing[kind]=Number(select.value);ShopBusiness.emit(state,"priceChanged",{kind,multiplier:Number(select.value)});commit();ShopGame.renderInventory();};wrapper.appendChild(select);root.appendChild(wrapper);
    }
  }
  function renderShelfPacks(tab){
    const query=$("#inventorySearch").value.trim().toLowerCase(),items=state[tab],packs=DATA.packs.filter(p=>items[p.id]&&`${p.name} ${p.id}`.toLowerCase().includes(query));
    $("#inventoryRarity").disabled=true;$("#recoverAllBtn").hidden=true;
    $("#inventoryCount").textContent=`${packs.length} 种 · 共 ${packs.reduce((sum,p)=>sum+items[p.id],0)} 包`;
    const grid=$("#inventoryGrid");grid.replaceChildren();grid.classList.add("pack-inventory");
    for(const pack of packs){const row=packRow(pack,items[pack.id],tab==="stock"?"仓库":"在售"),list=tab==="stock";
      const move=n=>{if(!ShopGame.near("display"))return ShopGame.toast("请先走到陈列架旁边。");if(!ShopBusiness.movePacks(state,pack.id,tab,list?"packDisplay":"stock",n))return ShopGame.toast("操作未完成：库存、容量不足或已打烊。");commit();ShopGame.toast(`${pack.name} ×${n} 已${list?"上架":"撤回仓库"}。`);ShopGame.renderInventory();};
      const actions=el("div","","pack-stock-actions"),one=button(list?"上架 1 包":"撤回 1 包",()=>move(1));one.dataset.packAction=list?"list":"withdraw";one.disabled=state.business.phase==="closed"||list&&ShopBusiness.shelfUsed(state)>=ShopBusiness.capacity(state);actions.appendChild(one);
      if(items[pack.id]>1)actions.appendChild(button("全部",()=>move(Math.min(items[pack.id],list?Math.max(0,ShopBusiness.capacity(state)-ShopBusiness.shelfUsed(state)):items[pack.id])),"btn plain"));
      row.appendChild(actions);grid.appendChild(row);
    }
    if(!packs.length)grid.appendChild(el("p",tab==="stock"?"仓库没有卡包，先到柜台进货并签收。":"还没有整包商品在售。","inventory-empty"));
  }
  function showReport(){
    const b=state.business,closed=b.phase==="closed";if(b.phase==="preparing")return;
    const d=closed?b.report:b.daily,cost=closed?d.operatingCost:ShopBusiness.dailyCost(state);
    $("#dayReportTitle").textContent=`第 ${b.day} 天 · ${closed?"营业结算":"准备打烊"}`;
    $("#reportIntro").textContent=closed?`${ShopBusiness.time(d.minute)} 已打烊。${d.achieved?"营业目标达成。":"今日目标未达成，明天继续。"}`:`当前 ${ShopBusiness.time(b.minute)}。确认后停止接客并核算本日营业成本，未付款商品不会扣除库存。`;
    const root=$("#reportContent");root.replaceChildren();const grid=el("div","","report-grid");
    for(const [label,value]of [["顾客营业额",money(d.revenue)],["营业目标",money(b.goal)],["进货支出",money(d.purchaseExpense)],["营业成本",money(cost)],["售货−进货−费用",money(d.revenue-d.purchaseExpense-cost)],["任务奖励（另计）",money(b.daily.taskRewards)],["单卡 / 整包售出",`${d.soldCards} / ${d.soldPacks}`],["成交 / 进店人数",`${d.served} / ${d.visitors}`],["当前资金",money(state.shop.cash)],["供应商欠款",money(b.debt)]]){const item=el("div","","report-cell");item.append(el("span",label),el("strong",value));grid.appendChild(item);}root.appendChild(grid);
    if(b.history.length){const list=el("div","","report-history");list.appendChild(el("h3","最近营业记录"));for(const day of b.history.slice(-5).reverse())list.appendChild(el("p",`第 ${day.day} 天 · 营业额 ${money(day.revenue)} / ${money(day.goal)} · ${day.achieved?"达标":"未达标"} · 清理垃圾 ${day.clearedTrash||0} 张`));root.appendChild(list);}
    $("#reportTrashWarning").textContent=`垃圾桶还有 ${ShopModel.total(state.trash)} 张卡。开始第 ${b.day+1} 天时会清空；背包、仓库、货架和未完成送货订单会保留。`;
    $("#reportConfirmClose").hidden=closed;$("#nextDayBtn").hidden=!closed;$("#nextDayBtn").textContent=`领取每日奖励，开始第 ${b.day+1} 天`;
    $("#reportRecover").hidden=!ShopModel.total(state.trash);
    if(!$("#dayReport").open)$("#dayReport").showModal();
  }
  function showEditor(){
    if($("#taskBoard").open)close("taskBoard");buffers={tasks:JSON.stringify(ShopTasks.config,null,2),business:JSON.stringify(ShopBusiness.config,null,2)};editorTab="help";setEditor("tasks");$("#taskEditor").showModal();
  }
  function setEditor(tab){
    if(editorTab!=="help"&&buffers[editorTab]!==undefined)buffers[editorTab]=$("#configText").value||buffers[editorTab];editorTab=tab;
    $("#configText").hidden=tab==="help";$("#editorApi").hidden=tab!=="help";$("#applyConfig").disabled=tab==="help";$("#exportConfig").disabled=tab==="help";$("#restoreConfig").disabled=tab==="help";
    document.querySelectorAll("[data-editor]").forEach(b=>b.classList.toggle("active",b.dataset.editor===tab));
    if(tab!=="help")$("#configText").value=buffers[tab];
    else $("#editorApi").textContent=`配置文件：data/tasks.json / data/business.json\n\n任务：scope once/daily、dependsOn、conditions、objectives、deadlineMinute、rewards。\n目标：metric（快照指标）或 event（事件累计，可筛选与设置时间窗口）。\n事件：orderPlaced / deliveryArrived / goodsReceived / stockListed / packOpened / sale / customerEntered / customerLeft / shopOpened / dayClosed / dayStarted / taskClaimed / battleWon。\n\nShopTasks.registerMetric("custom.stockValue", save => ...);\nShopTasks.registerCondition("custom.condition", (save, condition) => ...);\nShopTasks.registerReward("custom.reward", (save, reward) => ...);\nShopBusiness.on((event, save) => ...);\nShopBusiness.emit(state, "customEvent", { quantity: 1 });\nstore.save(state);\n\n可用指标：\n${ShopTasks.metricNames().join("\n")}\n\n详细文档：docs/TASK_AUTHORING.md\n新增任务请使用新 id；已领取的同 id 奖励不会重复发放。编辑器暂停时间。`;
    $("#editorMessage").textContent=tab==="help"?"扩展函数请写进 integration/task-extensions.js，配置里只引用注册名称。":"修改后先校验再应用；任务进度和收藏不会重置。";
  }
  function applyConfig(){
    try{const value=JSON.parse($("#configText").value),engine=editorTab==="tasks"?ShopTasks:ShopBusiness,errors=engine.validate(value);if(errors.length)throw new Error(errors.join("\n"));
      localStorage.setItem(engine.OVERRIDE_KEY,JSON.stringify(value));engine.configure(value);buffers[editorTab]=JSON.stringify(value,null,2);
      if(editorTab==="business")synchroniseBusinessConfig();
      ShopTasks.evaluate(state);lastBoard="";lastTasks="";lastCounter="";commit();$("#editorMessage").textContent="校验通过，已应用并保存到此浏览器。导出后可替换项目默认 JSON。";$("#editorMessage").dataset.status="ok";
    }catch(error){$("#editorMessage").textContent=`没有应用，原配置保留：\n${error.message}`;$("#editorMessage").dataset.status="error";}
  }
  function synchroniseBusinessConfig(){const c=ShopBusiness.config.clock;state.business.minute=Math.max(c.prepareMinute,Math.min(c.closeMinute,state.business.minute));if(!c.speeds.includes(state.business.speed))state.business.speed=1;if(state.business.phase!=="closed")state.business.goal=ShopBusiness.goal(state.business.day);lastCounter="";}
  document.querySelectorAll("[data-close]").forEach(b=>b.onclick=()=>close(b.dataset.close));
  document.querySelectorAll("[data-counter-tab]").forEach(b=>b.onclick=()=>renderCounter(b.dataset.counterTab));
  document.querySelectorAll("[data-task-scope]").forEach(b=>b.onclick=()=>{taskScope=b.dataset.taskScope;document.querySelectorAll("[data-task-scope]").forEach(x=>x.classList.toggle("active",x===b));lastBoard="";renderTaskBoard();});
  document.querySelectorAll("[data-editor]").forEach(b=>b.onclick=()=>setEditor(b.dataset.editor));
  $("#tasksBtn").onclick=showTasks;$("#openTaskEditor").onclick=showEditor;
  $("#clockPause").onclick=()=>{state.business.paused=!state.business.paused;commit();};
  $("#clockSpeed").onclick=()=>{const speeds=ShopBusiness.config.clock.speeds;state.business.speed=speeds[(speeds.indexOf(state.business.speed)+1)%speeds.length];commit();};
  $("#dayAction").onclick=()=>{if(state.business.phase==="preparing"){ShopBusiness.open(state);commit();ShopGame.toast("开门营业！顾客会来挑选商品。营业时间内也可以继续进货。");}else showReport();};
  $("#supplyBtn").onclick=()=>go("counter");
  $("#reportConfirmClose").onclick=()=>{ShopBusiness.settle(state);ShopGame.scene.resetCustomers();ShopGame.scene.stopWalking();commit();showReport();};
  $("#nextDayBtn").onclick=()=>{const result=ShopBusiness.nextDay(state);if(!result.ok)return;ShopGame.scene.resetCustomers();commit();close("dayReport");ShopGame.toast(`第 ${state.business.day} 天开始，垃圾桶已清空 ${result.cleared} 张卡。补货后再开门吧。`);};
  $("#reportRecover").onclick=()=>go("trash");
  $("#applyConfig").onclick=applyConfig;
  $("#exportConfig").onclick=()=>{try{const value=JSON.parse($("#configText").value),url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:"application/json"})),a=document.createElement("a");a.href=url;a.download=editorTab==="tasks"?"tasks.json":"business.json";a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}catch{$("#editorMessage").textContent="JSON 尚不能解析，请先修正。";}};
  $("#importConfig").onchange=async event=>{const file=event.target.files[0];if(!file)return;if(file.size>1000000){$("#editorMessage").textContent="文件过大，配置限制为 1 MB。";return;}if(editorTab==="help")setEditor("tasks");$("#configText").value=await file.text();buffers[editorTab]=$("#configText").value;$("#editorMessage").textContent="已读入文件，尚未应用。请校验并应用。";event.target.value="";};
  $("#restoreConfig").onclick=async()=>{try{const engine=editorTab==="tasks"?ShopTasks:ShopBusiness,response=await fetch(`data/${editorTab==="tasks"?"tasks":"business"}.json`),value=await response.json();const errors=engine.validate(value);if(errors.length)throw new Error(errors.join("\n"));localStorage.removeItem(engine.OVERRIDE_KEY);engine.configure(value);if(editorTab==="business")synchroniseBusinessConfig();buffers[editorTab]=JSON.stringify(value,null,2);$("#configText").value=buffers[editorTab];ShopTasks.evaluate(state);lastTasks="";lastBoard="";commit();$("#editorMessage").textContent="已恢复项目默认配置，进度与收藏保留。";}catch(error){$("#editorMessage").textContent=error.message;}};
  ShopBusiness.on(event=>{if(event.type==="deliveryArrived")ShopGame.toast("供应商已送货，到柜台签收入库吧。");});
  window.addEventListener("catalogueready",refresh);window.addEventListener("shopready",refresh);
  document.addEventListener("visibilitychange",()=>{if(document.hidden&&DATA)commit();});
  return{tick,refresh,isPaused,renderCounter,renderShelfPricing,renderShelfPacks,showTasks,showEditor,showReport,claim};
})();
