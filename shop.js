/* Pixel RPG shell. Phaser is bundled locally; all saves reuse the existing collection. */
window.ShopGame = (() => {
  let game, scene, panelMode = "bag", inventoryTab = "collection", toastTimer, inventorySignature="";
  const stations = [
    { id: "counter", name: "柜台", desc: "进货 · 收货 · 拆库存", x: 490, y: 296, label: [490,164], hit: [308,160,378,115] },
    { id: "display", name: "陈列架", desc: "上架卡片 · 等待顾客", x: 232, y: 375, label: [152,210], hit: [100,210,106,275] },
    { id: "trash", name: "垃圾桶", desc: "丢入卡片 · 捡回卡片", x: 853, y: 321, label: [895,306], hit: [875,310,50,73] },
    { id: "battle", name: "牌桌", desc: "用收藏武将与 AI 打牌", x: 648, y: 435, label: [769,357], hit: [671,356,203,141] },
  ];
  const walls = [
    [304,160,384,111], [100,207,106,277], [25,244,70,244],
    [877,310,47,73], [700,355,145,119], [670,432,54,66], [827,432,49,66],
    [876,145,50,146],
  ];
  function toast(message) {
    clearTimeout(toastTimer);
    $("#shopToast").textContent = message;
    $("#shopToast").hidden = false;
    toastTimer = setTimeout(() => { $("#shopToast").hidden = true; }, 3400);
  }
  function near(id) {
    const station = stations.find((item) => item.id === id);
    return !!scene?.owner && Phaser.Math.Distance.Between(scene.owner.x, scene.owner.y, station.x, station.y) <= 76;
  }
  function modalOpen() { return !!document.querySelector("dialog[open]") || !$("#overlay").hidden || !$("#battleScreen").hidden; }
  function refresh() {
    if (!DATA) return;
    const n = ShopModel.total(state.collection);
    $("#shopCash").textContent = "¥" + state.shop.cash.toLocaleString("zh-CN");
    $("#bagTotal").textContent = n;
    $("#statDisplay").textContent = ShopBusiness.shelfUsed(state);
    $("#statSold").textContent = state.business.daily.soldCards+state.business.daily.soldPacks;
    $("#statStock").textContent = ShopModel.total(state.stock);
    const last = state.receipts.at(-1);
    if (last) $("#latestReceipt").textContent = `${last.name} ×1${last.kind==="pack"?"（整包）":""}\n${last.customer||"顾客"}付款 ¥${last.amount}${last.day?` · 第 ${last.day} 天 ${ShopBusiness.time(last.minute)}`:""}`;
    else $("#latestReceipt").textContent = "暂时还没有成交。\n把卡片放到货架上，等等第一位顾客吧。";
    renderMeter();
    for (const {station,text} of scene?.labels || []) {
      const count = station.id === "trash" ? ShopModel.total(state.trash) : station.id === "display" ? ShopBusiness.shelfUsed(state) : 0;
      const level=state.modules?.upgrades.data.levels[station.id==="display"?"shelf":station.id==="battle"?"table":""]||0;
      text.setText(station.name + (level?` Lv.${level}`:"") + (count ? ` ×${count}` : ""));
    }
    scene?.updateFixtures?.();
    const signature=JSON.stringify([state.collection,state.trash,state.display,state.stock,state.packDisplay,state.business.pricing,state.modules.inventory,state.business.day,state.modules.upgrades,ShopModules.revision]);
    if ($("#shopPanel").open && panelMode !== "counter" && panelMode !== "catalogue" && signature!==inventorySignature) renderInventory();
    inventorySignature=signature;
    window.BusinessUI?.refresh();
  }
  function panel(mode, tab) {
    if (!DATA) return;
    panelMode = mode;
    scene?.stopWalking();
    const catalogue = mode === "counter" || mode === "catalogue";
    $("#shopCatalogue").hidden = !catalogue;
    $("#counterBusiness").hidden = mode!=="counter";
    $("#inventoryView").hidden = catalogue;
    $("#shelfBusiness").hidden = mode!=="display";
    const title = { counter: "柜台开包", catalogue: "卡牌图鉴", bag: "我的背包", trash: "垃圾桶", display: "商品陈列架" }[mode];
    const descriptions = {
      counter: "供应商下单 → 等待送达 → 签收入库 → 整包上架或拆成单卡。",
      catalogue: near("counter") ? "浏览卡包与收藏，也可以在这里拆包。" : "查看收藏与技能。开包需要走到柜台前。",
      bag: "同名卡片叠放显示。点击卡图，查看详细技能与原始代码。",
      trash: `桶内卡片在进入第 ${state.business.day+1} 天时清空；今天仍可全部捡回。`,
      display: "单卡与整包都能上架。顾客会按预算、偏好和售价挑选，再到柜台付款。",
    };
    $("#shopPanelTitle").textContent = title;
    $("#shopPanelEyebrow").textContent = catalogue ? "卡包与收藏" : `店铺资金 ¥${state.shop.cash.toLocaleString("zh-CN")}`;
    $("#shopPanelDesc").textContent = descriptions[mode];
    if (catalogue) { renderPacks();if(mode==="counter")BusinessUI.renderCounter(); }
    else {
      inventoryTab = tab || "collection";
      $("#inventorySearch").value = "";
      $("#inventoryRarity").value = "";
      renderInventoryTabs();
      renderInventory();
    }
    if (!$("#shopPanel").open) $("#shopPanel").showModal();
    $("#shopPanel").scrollTop = 0;
  }
  function renderInventoryTabs() {
    const tabs = $("#inventoryTabs");
    tabs.replaceChildren();
    const options = panelMode === "trash" ? [["collection", "背包 · 选择丢入"], ["trash", "桶内 · 换日清空"]] : panelMode === "display" ? [["collection", "单卡上架"], ["display", "在售单卡"], ["stock", "整包上架"], ["packDisplay", "在售卡包"]] : [["collection", "全部卡片"]];
    for (const [id, label] of options) {
      const button = elementWithText("button", label, "inventory-tab" + (inventoryTab === id ? " active" : ""));
      button.type = "button";
      button.dataset.tab = id;
      button.onclick = () => { inventoryTab = id; renderInventoryTabs(); renderInventory(); };
      tabs.appendChild(button);
    }
  }
  function moveCard(id, from, to, n = 1) {
    if ((to === "trash" || from === "trash") && !near("trash")) return toast("先走到垃圾桶旁边。");
    if ((to === "display" || from === "display") && !near("display")) return toast("先走到左侧陈列架旁边。");
    if (!ShopModel.transfer(state, from, to, id, n)) {toast("操作未完成：请检查收藏保护、数量、货架容量或是否已经打烊。");return false;}
    store.save(state);
    const verbs = to === "trash" ? "已放进垃圾桶，请在换日前捡回" : from === "trash" ? "已捡回背包" : to === "display" ? "已上架，开门后顾客会来挑选" : "已撤回背包";
    toast(`${byId.get(id)?.name || id} ×${n}，${verbs}。`);
    return true;
  }
  function renderInventory() {
    $("#inventoryRarity").disabled=false;$("#inventoryGrid").classList.remove("pack-inventory");
    if(panelMode==="display")BusinessUI.renderShelfPricing();
    if(["stock","packDisplay"].includes(inventoryTab)){BusinessUI.renderShelfPacks(inventoryTab);return;}
    const items = state[inventoryTab];
    const query = $("#inventorySearch").value.trim().toLowerCase();
    const rarity = $("#inventoryRarity").value;
    const cards = DATA.cards.filter((card) => items[card.id] && (!rarity || card.rarity === rarity) && (!query || `${card.name} ${card.id}`.toLowerCase().includes(query)))
      .sort((a, b) => ORDER.indexOf(b.rarity) - ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name, "zh"));
    $("#inventoryCount").textContent = `${cards.length} 种 · 共 ${cards.reduce((sum, card) => sum + items[card.id], 0)} 张${query || rarity ? "（筛选结果）" : ""}`;
    $("#recoverAllBtn").hidden = inventoryTab !== "trash" || !ShopModel.total(state.trash);
    const grid = $("#inventoryGrid");
    const scrollTop = $("#shopPanel").scrollTop;
    grid.replaceChildren();
    if (!cards.length) {
      const message = query || rarity ? "没有找到这张卡，换个关键词试试。" : inventoryTab === "trash" ? "垃圾桶是空的。桶内卡片只保留到当天结束，换日清空。" : inventoryTab === "display" ? "单卡货架是空的，也可以切到“整包上架”售卖未拆封卡包。" : "背包还是空的。先在柜台进货并签收，再拆一包库存。";
      grid.appendChild(elementWithText("div", message, "inventory-empty"));
    }
    for (const card of cards) {
      const item = document.createElement("article");
      item.className = "stock-card";
      item.dataset.card = card.id;
      item.style.setProperty("--rarity", RARITY[card.rarity].color);
      const portrait = document.createElement("button");
      portrait.className = "stock-portrait";
      portrait.setAttribute("aria-label", `${card.name}，查看技能`);
      const image = document.createElement("img");
      image.src = `/img/${encodeURIComponent(card.img)}`;
      image.alt = card.name;
      image.loading = "lazy";
      image.onerror = () => { image.hidden = true; };
      portrait.append(image, elementWithText("span", card.rarity, "stock-rarity"), elementWithText("strong", `×${items[card.id]}`, "stock-quantity"));
      portrait.onclick = () => openCardDetails(card);
      item.append(portrait, elementWithText("h3", card.name), elementWithText("p", `${GROUP_NAME[card.group] || card.group} · 售价 ¥${ShopBusiness.retailCard(card,state)}`, "stock-meta"));
      const actions = document.createElement("div");
      actions.className = "stock-actions";
      const target = inventoryTab === "trash" ? "collection" : inventoryTab === "display" ? "collection" : panelMode === "trash" ? "trash" : "display";
      if (panelMode !== "bag") {
        const text = inventoryTab === "trash" ? "捡回 1 张" : inventoryTab === "display" ? "撤回 1 张" : panelMode === "trash" ? "丢入 1 张" : "上架 1 张";
        const button = elementWithText("button", text, "btn stock-transfer");
        button.dataset.action = target === "trash" ? "discard" : inventoryTab === "trash" ? "recover" : target === "display" ? "list" : "withdraw";
        button.onclick = () => moveCard(card.id, inventoryTab, target);
        actions.appendChild(button);
        if (items[card.id] > 1) {
          const all = elementWithText("button", inventoryTab === "collection" ? "保留 1 张" : "全部", "btn plain stock-all");
          all.onclick = () => moveCard(card.id, inventoryTab, target, inventoryTab === "collection" ? items[card.id] - 1 : items[card.id]);
          actions.appendChild(all);
        }
      } else {
        const details = elementWithText("button", "查看技能", "btn plain");
        details.onclick = () => openCardDetails(card);
        actions.appendChild(details);
      }
      if(inventoryTab==="collection"){const reserved=ShopModules.value("inventory.locked",state,0,{cardId:card.id}),lock=elementWithText("button",reserved?"已保留 1 张 · 解锁":"保留 1 张收藏","btn stock-lock");lock.dataset.locked=String(!!reserved);lock.dataset.lockCard=card.id;if(state.modules.inventory.data.activeRoster.includes(card.id)){lock.textContent="参赛阵容保留 1 张";lock.disabled=true;}lock.onclick=()=>{const result=ShopModules.dispatch(state,"inventory.toggle",{cardId:card.id});if(!result.ok)return toast(result.error);store.save(state);renderInventory();};actions.appendChild(lock);}
      item.appendChild(actions);
      grid.appendChild(item);
    }
    $("#shopPanel").scrollTop = scrollTop;
  }
  function interact(id) {
    if (!scene?.owner || modalOpen()) return;
    const station = stations.find((item) => item.id === id) || scene.closest;
    if (!station) return toast("靠近家具，按 E 交互。也可以直接点击家具。");
    if (!near(station.id)) return scene.walkTo(station.x, station.y, () => interact(station.id));
    scene.stopWalking();
    if (station.id === "counter") panel("counter");
    else if (station.id === "battle") openBattleSetup();
    else panel(station.id);
  }
  function canStand(x, y) {
    const inside = (x >= 77 && x <= 905 && y >= 164 && y <= 520) || (x >= 399 && x <= 542 && y >= 510 && y <= 587);
    return inside && !walls.some(([rx, ry, rw, rh]) => x > rx - 9 && x < rx + rw + 9 && y > ry - 5 && y < ry + rh + 5);
  }
  function pathfind(start, target) {
    const size = 16;
    const cell = (p) => [Math.round(p.x / size), Math.round(p.y / size)];
    const key = ([x, y]) => `${x},${y}`;
    const a = cell(start), b = cell(target), queue = [a], visited = new Map([[key(a), null]]);
    let found;
    for (let i = 0; i < queue.length && i < 2400; i++) {
      const current = queue[i];
      if (Math.abs(current[0] - b[0]) + Math.abs(current[1] - b[1]) <= 1) { found = current; break; }
      for (const [dx, dy] of [[0,1],[1,0],[0,-1],[-1,0]]) {
        const next = [current[0] + dx, current[1] + dy];
        if (!visited.has(key(next)) && canStand(next[0] * size, next[1] * size)) { visited.set(key(next), current); queue.push(next); }
      }
    }
    if (!found) return [];
    const result = [];
    while (found && key(found) !== key(a)) { result.push({ x: found[0] * size, y: found[1] * size }); found = visited.get(key(found)); }
    result.reverse();
    if (canStand(target.x, target.y)) result.push({x: target.x, y: target.y});
    return result;
  }
  class CardShop extends Phaser.Scene {
    constructor() { super("CardShop"); }
    preload() { this.load.image("shop", "assets/shop/card-shop.png"); this.load.image("owner", "assets/shop/owner.png"); }
    create() {
      scene = this;
      this.background=this.add.image(480,320,"shop").setDisplaySize(960,640);
      this.dawnShade=this.add.rectangle(480,320,960,640,0xd89138,1).setAlpha(0).setDepth(899);
      this.nightShade=this.add.rectangle(480,320,960,640,0x07132e,1).setAlpha(0).setDepth(900);
      const glow=this.textures.createCanvas("lamp-glow",128,128),g=glow.context.createRadialGradient(64,64,0,64,64,64);g.addColorStop(0,"rgba(255,207,111,.5)");g.addColorStop(1,"rgba(255,190,80,0)");glow.context.fillStyle=g;glow.context.fillRect(0,0,128,128);glow.refresh();
      this.lamps=[[237,53],[713,53],[492,210]].map(([x,y])=>this.add.image(x,y,"lamp-glow").setDisplaySize(180,130).setDepth(901).setAlpha(0));
      // Trim only the display frame of the supplied transparent sprite; preserve the source asset.
      const source = this.textures.get("owner").getSourceImage();
      const canvas = document.createElement("canvas"); canvas.width = source.width; canvas.height = source.height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true }); ctx.drawImage(source,0,0);
      const pixels = ctx.getImageData(0,0,source.width,source.height).data;
      let left = source.width, right = 0, top = source.height, bottom = 0;
      for (let y=0;y<source.height;y++) for(let x=0;x<source.width;x++) if(pixels[(y*source.width+x)*4+3]>32){ left=Math.min(left,x);right=Math.max(right,x);top=Math.min(top,y);bottom=Math.max(bottom,y); }
      this.textures.get("owner").add("body",0,left,top,right-left+1,bottom-top+1);
      const position = canStand(state.player.x,state.player.y) ? state.player : {x:480,y:500};
      this.owner = this.add.container(position.x,position.y);
      this.shadow = this.add.ellipse(0,-1,31,10,0x172218,.32);
      this.person = this.add.image(0,0,"owner","body").setOrigin(.5,1).setDisplaySize(32,66);
      this.owner.add([this.shadow,this.person]);
      this.ownerName = this.add.text(0,-77,"店主",{fontFamily:"Microsoft YaHei",fontSize:"11px",color:"#fff5d9",backgroundColor:"#173c2c",padding:{x:6,y:3}}).setOrigin(.5,1);
      this.owner.add(this.ownerName);
      this.labels = stations.map((station) => {
        const text = this.add.text(station.label[0],station.label[1],station.name,{fontFamily:"Microsoft YaHei",fontSize:"12px",color:"#f6ecd1",backgroundColor:"#233c30",padding:{x:9,y:5}}).setOrigin(.5,1).setDepth(1100);
        return {station,text};
      });
      this.marker = this.add.circle(0,0,6,0xf8e0a4,.65).setVisible(false).setDepth(50);
      this.tweens.add({targets:this.marker,scale:1.4,alpha:.2,duration:600,yoyo:true,repeat:-1});
      this.keys = this.input.keyboard.addKeys("W,A,S,D,UP,DOWN,LEFT,RIGHT,SHIFT",false);
      this.path = [];
      this.touch = null;
      this.lastSave = 0;
      this.customers = [];
      this.nextCustomer = 1;
      this.walkClock = 0;
      this.fixtureLayer=this.add.container(0,0).setDepth(700);
      this.fixtureSignature='';
      this.input.on("pointerdown", (pointer) => {
        if (modalOpen()) return;
        $("#shopCanvas").focus({preventScroll:true});
        const hit = stations.find((station) => {
          const [x,y,w,h] = station.hit;
          return (pointer.x >= x && pointer.x <= x+w && pointer.y >= y && pointer.y <= y+h) || (Math.abs(pointer.x-station.label[0])<40 && pointer.y>station.label[1]-30 && pointer.y<station.label[1]+5);
        });
        if (hit) this.walkTo(hit.x,hit.y,()=>interact(hit.id));
        else if (canStand(pointer.x,pointer.y)) this.walkTo(pointer.x,pointer.y);
      });
      this.cameras.main.fadeIn(450,22,35,28);
      $("#shopLoading").hidden = true;
      $("#shopCanvas canvas").setAttribute("aria-label","像素卡店地图");
      refresh();
      window.dispatchEvent(new Event("shopready"));
    }
    stopWalking() { this.path = []; this.onArrival = null; this.touch = null; this.marker?.setVisible(false); }
    updateFixtures(){
      if(!this.fixtureLayer)return;const levels=state.modules.upgrades.data.levels,arrivals=state.orders.filter(o=>o.status==='arrived').length,signature=JSON.stringify([levels,arrivals]);if(signature===this.fixtureSignature)return;this.fixtureSignature=signature;this.fixtureLayer.removeAll(true);
      const label=(x,y,text)=>this.add.text(x,y,text,{fontFamily:'Microsoft YaHei',fontSize:'10px',color:'#fff1cd',backgroundColor:'#31533b',padding:{x:5,y:3}}).setOrigin(.5,1);
      if(arrivals){for(let i=0;i<Math.min(3,arrivals);i++){const x=590+i*22,y=283;this.fixtureLayer.add([this.add.rectangle(x,y,20,17,0xb88b54).setStrokeStyle(2,0x745334),this.add.rectangle(x,y,3,17,0xe2c493)]);}this.fixtureLayer.add(label(612,269,`待签收 ${arrivals} 箱`));}
      if(levels.showcase){this.fixtureLayer.add([this.add.rectangle(889,211,34,65,0x334d44).setStrokeStyle(3,0xc9ad62),this.add.rectangle(889,211,24,53,0x8aafb0,.75),this.add.rectangle(889,207,13,23,0xe7cb71),label(889,174,'珍藏柜')]);}
      for(const [id,x,y,name,tint] of [['cashier',559,247,'收银员',0xc6b5e3],['stocker',219,465,'补货员',0xa8c99b]])if(levels[id]){this.fixtureLayer.add([this.add.image(x,y,'owner','body').setOrigin(.5,1).setDisplaySize(26,53).setTint(tint),label(x,y-56,name)]);}
      if(levels.table)this.fixtureLayer.add(label(772,378,'周日 KOF 店赛'));
    }
    walkTo(x,y,callback) {
      this.path = pathfind(this.owner,{x,y});
      this.onArrival = callback;
      this.marker.setPosition(x,y).setVisible(this.path.length>0);
      if (!this.path.length && Phaser.Math.Distance.Between(this.owner.x,this.owner.y,x,y)<30) { this.onArrival=null; callback?.(); }
    }
    advance(actor, path, speed, delta) {
      const point = path[0]; if(!point)return false;
      const distance = Phaser.Math.Distance.Between(actor.x,actor.y,point.x,point.y);
      const step = speed*delta/1000;
      if(distance<=step){actor.setPosition(point.x,point.y);path.shift();}
      else {actor.x+=(point.x-actor.x)/distance*step;actor.y+=(point.y-actor.y)/distance*step;}
      return true;
    }
    spawnCustomer() {
      const profile=ShopBusiness.profile(Math.random,state);
      const actor = this.add.container(472,574);
      const shadow = this.add.ellipse(0,-1,27,9,0x172218,.25);
      const sprite = this.add.image(0,0,"owner","body").setOrigin(.5,1).setDisplaySize(29,60).setTint(profile.tint);
      const bubble = this.add.text(0,-70,profile.name,{fontFamily:"Microsoft YaHei",fontSize:"11px",color:"#3a3b29",backgroundColor:"#f3e5bf",padding:{x:6,y:4}}).setOrigin(.5,1);
      actor.add([shadow,sprite,bubble]);
      if(profile.regularId)sprite.setInteractive({useHandCursor:true}).on("pointerdown",(pointer,x,y,event)=>{event.stopPropagation();ManagementUI.show("people",profile.regularId);});
      const slot=this.customers.length;
      this.customers.push({actor,sprite,bubble,profile,path:pathfind(actor,{x:247,y:370+slot*25}),phase:"arriving",wait:0,slot});
      ShopBusiness.visitor(state,profile);store.save(state);
    }
    resetCustomers(){for(const c of this.customers||[])c.actor.destroy();this.customers=[];this.nextCustomer=1;}
    updateCustomers(delta,minutes) {
      if(state.business.phase!=="open"){if(this.customers.length)this.resetCustomers();return;}
      this.nextCustomer-=minutes*ShopBusiness.traffic(state);
      if(this.nextCustomer<=0&&this.customers.length<ShopModules.value("customer.maxConcurrent",state,ShopBusiness.config.customers.maxConcurrent)){this.spawnCustomer();this.nextCustomer=ShopBusiness.config.customers.intervalMinutes;}
      for(const c of [...this.customers])this.updateCustomer(c,delta);
    }
    updateCustomer(c,delta) {
      c.actor.setDepth(c.actor.y);
      if (c.path.length) { const oldX=c.actor.x;this.advance(c.actor,c.path,84,delta);c.sprite.setFlipX(c.actor.x<oldX);c.sprite.y=Math.sin(this.time.now/100)*1.5;return; }
      c.sprite.y=0;
      if (c.phase==="arriving") {c.phase="shopping";c.bubble.setText(ShopBusiness.shelfUsed(state)?`预算 ¥${c.profile.budget}，挑一挑…`:"货架还没有商品呀");c.wait=ShopBusiness.config.customers.shoppingSeconds*1000;}
      else if(c.phase==="shopping") {
        c.wait-=delta;
        if(c.wait<=0){
          c.product=ShopBusiness.chooseProduct(state,c.profile);
          if(c.product){c.phase="checkout";c.bubble.setText("去柜台结账");c.path=pathfind(c.actor,{x:460+c.slot*26,y:300+c.slot*6});c.wait=ShopModules.value("customer.checkoutMs",state,1000);}
          else{c.bubble.setText(ShopBusiness.shelfUsed(state)?"没有合适的价位，下次吧":"还没补货，下次再来");ShopBusiness.lost(state,"noSuitableProduct",c.profile);store.save(state);c.phase="leaving";c.wait=ShopModules.value("customer.checkoutMs",state,1000);}
        }
      } else if(c.phase==="checkout"){
        c.wait-=delta;if(c.wait<=0){const sale=ShopBusiness.sell(state,c.product.kind,c.product.id,c.profile);if(sale.ok){c.bubble.setText(`谢谢！¥${sale.amount}`);toast(`${c.profile.name}买走${sale.item.name} ×1，营业额 +¥${sale.amount}。`);}else{c.bubble.setText("刚刚卖完了，下次再来");ShopBusiness.lost(state,"soldOut",c.profile);}store.save(state);c.phase="leaving";c.wait=1200;}
      } else if(c.phase==="leaving") {c.wait-=delta;if(c.wait<=0){c.phase="exit";c.path=pathfind(c.actor,{x:472,y:576});}}
      else if(c.phase==="exit") {c.actor.destroy();this.customers=this.customers.filter(item=>item!==c);}
    }
    update(time,rawDelta) {
      if (!this.owner || !DATA) return;
      const delta=Math.min(rawDelta,45);
      const simulation=window.BusinessUI?.tick(Math.min(rawDelta,1000)/1000)||{running:false,minutes:0};
      if(simulation.running)this.updateCustomers(delta*state.business.speed,simulation.minutes);
      this.updateLighting();
      if (modalOpen() || document.hidden) { this.touch=null;return; }
      const k=this.keys;
      let dx=(k.D.isDown||k.RIGHT.isDown||this.touch==="right"?1:0)-(k.A.isDown||k.LEFT.isDown||this.touch==="left"?1:0);
      let dy=(k.S.isDown||k.DOWN.isDown||this.touch==="down"?1:0)-(k.W.isDown||k.UP.isDown||this.touch==="up"?1:0);
      const oldX=this.owner.x,oldY=this.owner.y;
      if(dx||dy){this.path=[];this.onArrival=null;this.marker.setVisible(false);const length=Math.hypot(dx,dy);const step=(k.SHIFT.isDown?190:130)*delta/1000;dx=dx/length*step;dy=dy/length*step;if(canStand(this.owner.x+dx,this.owner.y))this.owner.x+=dx;if(canStand(this.owner.x,this.owner.y+dy))this.owner.y+=dy;}
      else if(this.path.length){this.advance(this.owner,this.path,145,delta);if(!this.path.length){this.marker.setVisible(false);const callback=this.onArrival;this.onArrival=null;callback?.();}}
      const moving=Math.abs(oldX-this.owner.x)+Math.abs(oldY-this.owner.y)>.05;
      if(moving){this.walkClock+=delta;this.person.y=Math.round(Math.sin(this.walkClock/90)*2);if(this.owner.x!==oldX)this.person.setFlipX(this.owner.x<oldX);}
      else this.person.y=0;
      this.owner.setDepth(this.owner.y);
      const closest=stations.map((station)=>({station,distance:Phaser.Math.Distance.Between(this.owner.x,this.owner.y,station.x,station.y)})).sort((a,b)=>a.distance-b.distance)[0];
      this.closest=closest.distance<=76?closest.station:null;
      for(const {station,text} of this.labels)text.setBackgroundColor(this.closest?.id===station.id?"#427052":"#233c30");
      $("#worldInteraction").hidden=!this.closest;
      if(this.closest)$("#worldInteraction span").textContent=`${this.closest.name} · ${this.closest.desc}`;
      if(moving && time-this.lastSave>1500){state.player={x:Math.round(this.owner.x),y:Math.round(this.owner.y)};store.save(state);this.lastSave=time;}
    }
    updateLighting(){
      const m=state.business.minute;
      const night=Math.max(0,Math.min(1,(m-1020)/180));
      const morning=Math.max(0,Math.min(1,(600-m)/120));
      const blend=(a,b,t)=>Math.round(a+(b-a)*t);
      this.background.setTint(Phaser.Display.Color.GetColor(blend(255,143,night),blend(255,162,night)-Math.round(morning*10),blend(255,201,night)-Math.round(morning*24)));
      this.dawnShade.setAlpha(morning*.08);
      this.nightShade.setAlpha(night*.48);
      this.lamps.forEach(lamp=>lamp.setAlpha(night*.9));
    }
  }
  function bootShop() {
    if(game || !DATA)return;
    refresh();
    game = new Phaser.Game({type:Phaser.CANVAS,parent:"shopCanvas",width:960,height:640,backgroundColor:"#17251e",pixelArt:true,roundPixels:true,antialias:false,banner:false,scale:{mode:Phaser.Scale.FIT,autoCenter:Phaser.Scale.CENTER_BOTH},scene:CardShop,audio:{noAudio:true},input:{mouse:{preventDefaultWheel:false}}});
  }
  window.addEventListener("catalogueready",bootShop);
  window.addEventListener("collectionchange",refresh);
  window.addEventListener("storage",(event)=>{if(event.key===store.key&&event.newValue){try{state=ShopModel.normalise(JSON.parse(event.newValue));refresh();}catch{}}});
  window.addEventListener("blur",()=>{scene?.stopWalking();if(scene?.keys)Object.values(scene.keys).forEach(key=>key.reset());});
  window.addEventListener("pagehide",()=>{if(scene?.owner){state.player={x:Math.round(scene.owner.x),y:Math.round(scene.owner.y)};store.save(state);}});
  document.addEventListener("keydown",(event)=>{
    if(event.repeat || ["INPUT","SELECT","TEXTAREA"].includes(event.target.tagName))return;
    const key=event.key.toLowerCase();
    if(key==="b"&&!["cardDetail","shopHelp","battleSetup","taskBoard","taskEditor","dayReport"].some(id=>$("#"+id).open)&&$("#overlay").hidden&&$("#battleScreen").hidden){event.preventDefault();if($("#shopPanel").open)$("#shopPanel").close();else panel("bag");}
    if(key==="e"&&!modalOpen()){event.preventDefault();interact();}
    if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(key)&&!modalOpen())event.preventDefault();
  });
  $("#bagBtn").onclick=()=>panel("bag");
  $("#catalogueBtn").onclick=()=>panel("catalogue");
  $("#helpBtn").onclick=()=>$("#shopHelp").showModal();
  $("#shopHelpClose").onclick=()=>$("#shopHelp").close();
  $("#shopPanelClose").onclick=()=>$("#shopPanel").close();
  $("#shopPanel").addEventListener("close",()=>{if(scene?.keys)Object.values(scene.keys).forEach(key=>key.reset());});
  $("#interactBtn").onclick=()=>interact();
  $("#inventorySearch").oninput=renderInventory;
  $("#inventoryRarity").onchange=renderInventory;
  $("#recoverAllBtn").onclick=()=>{
    if(!near("trash"))return;
    let n=0;for(const [id,count] of Object.entries(state.trash))if(ShopModel.transfer(state,"trash","collection",id,count))n+=count;
    store.save(state);toast(`已捡回 ${n} 张卡，全部放进背包。`);
  };
  document.querySelectorAll("[data-direction]").forEach((button)=>{
    button.addEventListener("pointerdown",(event)=>{event.preventDefault();button.setPointerCapture(event.pointerId);if(scene)scene.touch=button.dataset.direction;});
    for(const type of ["pointerup","pointercancel","lostpointercapture"])button.addEventListener(type,()=>{if(scene)scene.touch=null;});
  });
  bootShop();
  return { toast, panel, interact, moveCard, refresh, renderInventory, near, canOpenPack:()=>near("counter"), get scene(){return scene;}, get stations(){return stations;}, get panelMode(){return panelMode;}, canStand };
})();
