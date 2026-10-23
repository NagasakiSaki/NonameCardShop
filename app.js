const RARITY = {
  C: { label: "普通", color: "#8b93a1", glow: "transparent" },
  U: { label: "少见", color: "#57c785", glow: "rgba(87,199,133,.28)" },
  R: { label: "稀有", color: "#5b9cf8", glow: "rgba(91,156,248,.3)" },
  SR: { label: "超稀有", color: "#b47cf5", glow: "rgba(180,124,245,.35)" },
  UR: { label: "传说", color: "#f0c14b", glow: "rgba(240,193,75,.45)" },
};

const ORDER = ["C", "U", "R", "SR", "UR"];
const LINEAGE_COLOR = { canon: "#d8b25a", chronicle: "#57c785", realms: "#5b9cf8", apocrypha: "#b47cf5" };
const GROUP_NAME = {
  wei: "魏", shu: "蜀", wu: "吴", qun: "群", jin: "晋", shen: "神", unknown: "？",
};

const $ = (sel) => document.querySelector(sel);
let saveLoadError = null;
const store = {
  key: "noname-packer-v1",
  load() {
    try {
      const raw = localStorage.getItem(this.key);
      const saved = JSON.parse(raw);
      if(saved&&!saved.modules?.boxes&&!localStorage.getItem('noname-packer-before-boxes-v1'))localStorage.setItem('noname-packer-before-boxes-v1',raw);
      if(saved&&!saved.modules?.balance&&!localStorage.getItem('noname-packer-before-balance-v1'))localStorage.setItem('noname-packer-before-balance-v1',raw);
      if (saved && !saved.shop && !localStorage.getItem("noname-packer-before-shop-v1")) {
        try { localStorage.setItem("noname-packer-before-shop-v1", raw); } catch {}
      }
      if (saved && !saved.business && !localStorage.getItem("noname-packer-before-business-v1")) {
        try { localStorage.setItem("noname-packer-before-business-v1",raw); } catch {}
      }
      if(saved&&!saved.modules&&!localStorage.getItem("noname-packer-before-modules-v1"))localStorage.setItem("noname-packer-before-modules-v1",raw);
      return ShopModel.normalise(saved);
    } catch(error) {
      saveLoadError=error;
      return ShopModel.normalise();
    }
  },
  save(state) {
    if (state.business && DATA) window.ShopTasks?.evaluate(state);
    localStorage.setItem(this.key, JSON.stringify(state));
    window.dispatchEvent(new Event("collectionchange"));
  },
};

let DATA = null;
let state = store.load();
let activeLineage = 0;
let busy = false;
let currentCodex = null;
const overlayTimers = new Set();
const skillRequests = new Map();
function overlayLater(fn, delay) {
  const timer = setTimeout(() => { overlayTimers.delete(timer); fn(); }, delay);
  overlayTimers.add(timer);
}

const byId = new Map();
const byPack = new Map();

async function boot() {
  try {
    if(saveLoadError)throw new Error(`存档未被覆盖：${saveLoadError.message}`);
    const loaded = await Promise.all([fetch("data/cards.json").then(res=>{if(!res.ok)throw new Error("卡牌数据无法读取");return res.json();}),ShopBusiness.loadConfig(),ShopTasks.loadConfig(),ShopModules.load()]);
    DATA = loaded[0];
    ShopBusiness.setCatalog(DATA);ShopTasks.setCatalog(DATA);ShopTasks.configure(ShopTasks.config);
    ShopModules.setCatalog(DATA);
  } catch(error) { $("#shopLoading").textContent = `载入失败：${error.message}`; return; }
  try{state = ShopModel.normalise(localStorage.getItem(store.key)?state:undefined);ShopModules.ready(state);}
  catch(error){$("#shopLoading").textContent=`存档未被覆盖：${error.message}`;return;}
  ShopTasks.evaluate(state);
  for (const c of DATA.cards) byId.set(c.id, c);
  for (const c of DATA.cards) {
    if (!byPack.has(c.pack)) byPack.set(c.pack, []);
    byPack.get(c.pack).push(c);
  }
  for (const list of byPack.values()) {
    list.sort((a, b) => ORDER.indexOf(b.rarity) - ORDER.indexOf(a.rarity) || a.name.localeCompare(b.name, "zh"));
  }
  $("#totalCount").textContent = DATA.cards.length;
  renderLineages();
  renderPacks();
  renderMeter();
  store.save(state);
  window.dispatchEvent(new Event("catalogueready"));

  // 开发用：?codex=standard 直接看图鉴，?open=standard&reveal=1 直接看开包结果
  const params = new URLSearchParams(location.search);
  const codexId = params.get("codex");
  const openId = params.get("open");
  if (codexId || openId) {
    const showRequestedView = () => {
      if (codexId && byPack.has(codexId)) { ShopGame.panel("catalogue"); renderCodex(codexId); }
      if (openId && byPack.has(openId)) {
        if ($("#shopPanel").open) $("#shopPanel").close();
        ShopGame.scene.walkTo(490,296,() => {
          openPack(openId);
          if (params.get("reveal")) overlayLater(() => $("#wrapper")?.click(),250);
        });
      }
    };
    if (window.ShopGame?.scene?.owner) showRequestedView();
    else window.addEventListener("shopready",showRequestedView,{once:true});
  }
}

/* ---------- 顶栏 ---------- */
function ownedCount() {
  return Object.keys(state.collection).length;
}

function renderMeter() {
  const own = ownedCount();
  const total = DATA.cards.length;
  const pct = total ? own / total : 0;
  $("#ownCount").textContent = own;
  $("#ringText").textContent = Math.round(pct * 100) + "%";
  $("#ring").style.background = `conic-gradient(#d8b25a ${pct * 360}deg, rgba(255,255,255,.08) 0deg)`;
}

/* ---------- 谱系 ---------- */
function renderLineages() {
  const nav = $("#lineages");
  nav.innerHTML = "";
  DATA.lineages.forEach((l, i) => {
    const b = document.createElement("button");
    b.className = "lineage" + (i === activeLineage ? " active" : "");
    const count = l.packs.reduce((s, pid) => s + (byPack.get(pid)?.length || 0), 0);
    b.innerHTML = `
      <div class="lineage-name">${l.name}<span style="font-size:11px;color:var(--muted);margin-left:8px">${count}</span></div>
      <div class="lineage-sub">${l.subtitle}</div>`;
    b.onclick = () => {
      activeLineage = i;
      renderLineages();
      renderPacks();
    };
    nav.appendChild(b);
  });
}

/* ---------- 卡包 ---------- */
function packOwned(packId) {
  const list = byPack.get(packId) || [];
  return list.filter((c) => state.collection[c.id]).length;
}

function renderPacks() {
  const view = $("#packsView");
  const codex = $("#codexView");
  currentCodex = null;
  codex.hidden = true;
  view.hidden = false;

  const l = DATA.lineages[activeLineage];
  view.innerHTML = "";

  const allCards = l.packs.flatMap((pid) => byPack.get(pid) || []);
  const owned = allCards.filter((c) => state.collection[c.id]).length;
  $("#hero").innerHTML = `
    <h2 style="color:${LINEAGE_COLOR[l.id] || "var(--gold)"}">${l.name}</h2>
    <p>${l.desc}</p>
    <div class="stats">${l.packs.length} 个卡包 · ${allCards.length} 张 · 已收集 ${owned}</div>`;
  $("#hero").hidden = false;

  l.packs.forEach((pid) => {
    const pack = DATA.packs.find((p) => p.id === pid);
    const list = byPack.get(pid) || [];
    if (!pack || !list.length) return;

    const own = packOwned(pid);
    const el = document.createElement("article");
    el.className = "pack";
    el.style.setProperty("--accent", LINEAGE_COLOR[l.id] || "#d8b25a");

    const bar = ORDER.map((r) => {
      const n = list.filter((c) => c.rarity === r).length;
      if (!n) return "";
      return `<i style="width:${(n / list.length) * 100}%;background:${RARITY[r].color}"></i>`;
    }).join("");

    el.innerHTML = `
      <div class="pack-head">
        <span class="pack-name">${pack.name}</span>
        <span class="pack-count">${list.length} 张</span>
      </div>
      <div class="rarity-bar">${bar}</div>
      <p class="pack-odds"></p>
      <div class="pack-foot">
        <span class="pack-progress">${own} / ${list.length} 已收集</span>
        <span class="pack-actions">
          <button class="btn plain" data-codex="${pid}">图鉴</button>
          <button class="btn" data-open="${pid}" ${!(state.stock[pid]>0) || state.business.phase==="closed" || (window.ShopGame && !ShopGame.canOpenPack()) ? "disabled" : ""}>拆包 · 库存 ×${state.stock[pid]||0}</button>
        </span>
      </div>`;

    const loose=ShopBoxes.loose(state,pid),boxed=ShopBoxes.tracked(state,pid,'stock').length;
    el.querySelector('.pack-odds').textContent=ShopBalance.describe(pack,ShopBusiness.config.economy.cardPrices)+`\n仓库：独立散包 ${loose} / 拆盒余包 ${boxed}。默认先开独立包；上述独立概率不适用于内容已固定的盒内余包，可在收货/仓库指定原盒拆包。`;
    view.appendChild(el);
  });

  view.querySelectorAll("[data-open]").forEach((b) => (b.onclick = () => openPack(b.dataset.open)));
  view.querySelectorAll("[data-codex]").forEach((b) => (b.onclick = () => renderCodex(b.dataset.codex)));
}

/* ---------- 图鉴 ---------- */
function renderCodex(packId) {
  const pack = DATA.packs.find((p) => p.id === packId);
  const list = byPack.get(packId) || [];
  const view = $("#packsView");
  const codex = $("#codexView");

  const li = DATA.lineages.findIndex((l) => l.id === pack.lineage);
  if (li >= 0 && li !== activeLineage) {
    activeLineage = li;
    renderLineages();
  }

  currentCodex = packId;
  $("#hero").hidden = true;
  view.hidden = true;
  codex.hidden = false;

  const own = list.filter((c) => state.collection[c.id]).length;
  codex.innerHTML = `
    <div class="codex-head">
      <h2>${pack.name}</h2>
      <p>${list.length} 张 · 已收集 ${own}</p>
      <span class="spacer"></span>
      <button class="btn plain" id="backBtn">返回卡包</button>
    </div>
    <div class="grid"></div>`;

  const grid = codex.querySelector(".grid");
  for (const c of list) {
    const n = state.collection[c.id] || 0;
    const el = document.createElement("div");
    el.className = "mini" + (n ? "" : " locked");
    el.innerHTML = `
      <img src="/img/${encodeURIComponent(c.img)}" alt="${c.name}" loading="lazy">
      <span class="pip" style="background:${RARITY[c.rarity].color};color:${RARITY[c.rarity].color}"></span>
      ${n ? `<span class="dup">×${n}</span>` : ""}
      <span class="mini-name">${n ? c.name : "？？？"}</span>`;
    el.querySelector("img").onerror = (e) => {
      e.target.style.display = "none";
      el.style.background = "linear-gradient(160deg,#1e232b,#0e1115)";
    };
    el.title = n ? `${c.name}${c.title ? " · " + c.title : ""} · ${RARITY[c.rarity].label}` : "未获得";
    if (n) bindCardDetails(el, c);
    grid.appendChild(el);
  }

  $("#backBtn").onclick = () => renderPacks();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

/* ---------- 武将详情 ---------- */
function bindCardDetails(element, card) {
  element.classList.add("inspectable");
  element.tabIndex = 0;
  element.setAttribute("role", "button");
  element.setAttribute("aria-haspopup", "dialog");
  element.setAttribute("aria-label", `${card.name}，查看详细技能`);
  element.title = `${card.name} · 点击查看详细技能`;
  element.onclick = () => openCardDetails(card);
  element.onkeydown = (event) => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      openCardDetails(card);
    }
  };
}

function elementWithText(tag, text, className) {
  const element = document.createElement(tag);
  element.textContent = text;
  if (className) element.className = className;
  return element;
}

function skillText(description) {
  if (!description) return "源数据暂未提供技能说明。";
  const document = new DOMParser().parseFromString(String(description), "text/html");
  document.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  document.querySelectorAll("script,style").forEach((node) => node.remove());
  return document.body.textContent.trim();
}

function loadSkills(packId) {
  if (!skillRequests.has(packId)) {
    skillRequests.set(packId, fetch(`data/skills/${encodeURIComponent(packId)}.json`)
      .then((response) => {
        if (!response.ok) throw new Error("技能文件暂时无法读取");
        return response.json();
      }).catch((error) => { skillRequests.delete(packId); throw error; }));
  }
  return skillRequests.get(packId);
}

function renderSkillCode(record, records, seen = new Set()) {
  const fragment = document.createDocumentFragment();
  const pre = document.createElement("pre");
  pre.appendChild(elementWithText("code", record.code));
  const source = elementWithText("a", `${record.source.file}:${record.source.line}`, "skill-source");
  source.href = record.source.file.split("/").map(encodeURIComponent).join("/");
  source.target = "_blank";
  source.rel = "noopener";
  source.textContent = `原始文件 · ${source.textContent}`;
  fragment.append(source, pre);
  const visited = new Set([...seen, record.key]);
  for (const reference of record.dependencies) {
    if (visited.has(reference.key)) continue;
    const dependency = records[reference.key];
    const details = document.createElement("details");
    details.className = "skill-dependency";
    details.appendChild(elementWithText("summary", `关联技能 · ${dependency?.name || reference.id}（${reference.id}）`));
    if (dependency) {
      details.addEventListener("toggle", () => {
        if (!details.open || details.dataset.loaded) return;
        details.dataset.loaded = "true";
        details.appendChild(renderSkillCode(dependency, records, visited));
      });
    } else {
      details.appendChild(elementWithText("p", "源数据中未找到该关联技能定义。", "detail-muted"));
    }
    fragment.appendChild(details);
  }
  return fragment;
}

function openCardDetails(card) {
  const dialog = $("#cardDetail");
  $("#detailName").textContent = card.name;
  $("#detailTitle").textContent = skillText(card.title || "无称号");
  $("#detailPack").textContent = DATA.packs.find((pack) => pack.id === card.pack)?.name || card.pack;
  $("#detailStats").textContent = `${GROUP_NAME[card.group] || card.group} · 体力 ${card.hp} / ${card.maxHp} · ${RARITY[card.rarity].label} · 已拥有 ${state.collection[card.id] || 0} 张`;
  $("#battleFromDetail").disabled = !state.collection[card.id];
  $("#battleFromDetail").onclick = () => {
    dialog.close();
    openBattleSetup(card.id);
  };
  const image = $("#detailImage");
  image.hidden = false;
  $("#detailImageFallback").hidden = true;
  image.alt = card.name;
  image.onerror = () => { image.hidden = true; $("#detailImageFallback").hidden = false; };
  image.src = `/img/${encodeURIComponent(card.img)}`;
  const content = $("#detailSkills");
  content.replaceChildren();
  if(card.power){
    const p=card.power,section=elementWithText('article','','skill-item power-assessment');
    section.append(elementWithText('h4',`强度估算 ${p.score.toFixed(1)} · BO3 ${p.duel.toFixed(1)} / KOF ${p.kof.toFixed(1)}`),elementWithText('p',`${p.method} · 模型可信标记 ${Math.round(p.confidence*100)} / 100（非胜率）\n${p.notes}`,'skill-description'));
    const labels={cards:'净牌差',damage:'额外伤害',guard:'防伤',heal:'回复',control:'控制',quality:'牌质',cost:'耗牌成本',hpLoss:'主动掉血',burst:'爆发',carry:'接力'};
    section.append(elementWithText('p',Object.entries(p.vector).filter(([,v])=>v).map(([k,v])=>`${labels[k]} ${v}`).join(' · ')||'空白4血武将基准；尚无可计入的稳定技能收益。','detail-muted'));
    if(p.flags.length)section.append(elementWithText('p',`待复核：${p.flags.join('；')}`,'detail-muted'));
    const details=document.createElement('details');details.append(elementWithText('summary','查看技能估算证据与复核项'));
    details.append(elementWithText('p','规则校准条目按上方向量计算；以下自动识别线索用于核对文本，不覆盖校准值。','detail-muted'),elementWithText('pre',JSON.stringify(p.components,null,2),'power-evidence'));section.append(details);content.append(section);
  }
  for (const skill of card.skills) {
    const section = document.createElement("article");
    section.className = "skill-item";
    section.append(elementWithText("h4", skill.name), elementWithText("p", skillText(skill.description), "skill-description"));
    const details = document.createElement("details");
    details.className = "skill-code";
    details.appendChild(elementWithText("summary", `查看技能代码 · ${skill.id}`));
    const body = document.createElement("div");
    details.appendChild(body);
    details.addEventListener("toggle", async () => {
      if (!details.open || details.dataset.loading || details.dataset.loaded) return;
      details.dataset.loading = "true";
      body.textContent = "正在读取技能代码…";
      try {
        const { skills } = await loadSkills(card.pack);
        const record = skills[skill.key];
        body.replaceChildren(record ? renderSkillCode(record, skills) : elementWithText("p", "源数据中未找到该技能的代码。", "detail-muted"));
        details.dataset.loaded = "true";
      } catch {
        body.textContent = "技能代码读取失败，请收起后重新展开。";
      } finally { delete details.dataset.loading; }
    });
    section.appendChild(details);
    content.appendChild(section);
  }
  if (!card.skills.length) content.appendChild(elementWithText("p", "该武将未配置技能。", "detail-muted"));
  if (!dialog.open) dialog.showModal();
  dialog.scrollTop = 0;
}

$("#detailClose").onclick = () => $("#cardDetail").close();
$("#cardDetail").addEventListener("click", (event) => {
  const rect = event.currentTarget.getBoundingClientRect();
  if (event.target === event.currentTarget && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) event.currentTarget.close();
});

/* ---------- 开包 ---------- */

function openPack(packId,boxId) {
  if (busy) return;
  const candidate = DATA.packs.find((pack) => pack.id === packId);
  if (window.ShopGame && !ShopGame.canOpenPack()) { ShopGame.toast("到柜台前，按 E 开包。"); return; }
  if (state.business.phase==="closed") { window.ShopGame?.toast("今天已打烊，明早再拆包。"); return; }
  if (!candidate || !(state.stock[packId]>0)) { window.ShopGame?.toast("仓库里没有这包卡，先在柜台下单并签收。"); return; }
  if(boxId&&!ShopBoxes.peek(state,packId,boxId).ok){ShopGame.toast('这盒已没有仓库余包，请选择其他卡包。');return;}
  if ($("#shopPanel")?.open) $("#shopPanel").close();
  busy = true;

  const pack = DATA.packs.find((p) => p.id === packId);
  const list = byPack.get(packId) || [];
  const overlay = $("#overlay");
  const stage = $("#stage");
  overlay.hidden = false;

  stage.innerHTML = `
    <div class="wrapper" id="wrapper">
      <div class="wrapper-inner">
        <div class="wrapper-seal">包</div>
        <div class="wrapper-name">${pack.name}</div>
        <div class="wrapper-hint">${boxId?'指定卡盒余包':'库存卡包'} ×1 · 获得 5 张卡</div>
      </div>
    </div>`;

  const wrapper = $("#wrapper");
  wrapper.onclick = () => {
    wrapper.onclick = null;
    wrapper.classList.add("opening");
    overlayLater(() => reveal(packId, list,boxId), 720);
  };

  $("#closeBtn").onclick = () => closeOverlay();
}

function reveal(packId, list,boxId) {
  const pack = DATA.packs.find((item) => item.id === packId);
  let pulls;
  try{const picked=ShopBoxes.peek(state,packId,boxId);if(!picked.ok)throw new Error(picked.error);pulls=picked.pulls||ShopBalance.draw(pack);}catch(error){closeOverlay();ShopGame.toast(error.message);return;}
  if (!ShopBusiness.openPack(state, pack,boxId)) { closeOverlay(); window.ShopGame?.toast("库存不足或已打烊，本次没有消耗卡包。"); return; }
  const stage = $("#stage");
  const cards=pulls.map(p=>p.card);
  const alreadySeen = new Set(Object.keys(state.collection));
  const fresh = cards.map((c) => { const isNew = !alreadySeen.has(c.id); alreadySeen.add(c.id); return isNew; });
  const quantities = {};
  for (const card of cards) quantities[card.id] = (quantities[card.id] || 0) + 1;

  stage.innerHTML = `<div class="deal"></div><div class="after" id="after"></div>`;
  const deal = stage.querySelector(".deal");

  cards.forEach((c, i) => {
    const r = RARITY[c.rarity];
    const el = document.createElement("div");
    el.className = "card";
    el.style.animationDelay = `${i * 90}ms`;
    el.style.setProperty("--rc", r.color);
    el.style.setProperty("--glow", r.glow);
    el.innerHTML = `
      <div class="card-inner">
        <div class="face face-back">殺</div>
        <div class="face face-front">
          <img src="/img/${encodeURIComponent(c.img)}" alt="${c.name}">
          <span class="rt">${r.label}</span>
          ${fresh[i] ? `<span class="isnew">NEW</span>` : ""}
          <span class="card-quantity">×${(state.collection[c.id] || 0) + quantities[c.id]}</span>
          <div class="meta">
            <div class="nm">${c.name}</div>
            <div class="tt">${GROUP_NAME[c.group] || c.group} · ${pulls[i].source}${pulls[i].source==='本包'?'':` · ${DATA.packs.find(p=>p.id===c.pack).name}`}</div>
          </div>
        </div>
      </div>`;

    const img = el.querySelector("img");
    img.onerror = () => {
      img.style.display = "none";
      el.querySelector(".face-front").style.background = "linear-gradient(160deg,#20262f,#0f1216)";
    };

    deal.appendChild(el);
    overlayLater(() => el.classList.add("flip"), 140 + i * 260);
    overlayLater(() => bindCardDetails(el, c), 700 + i * 260);
  });

  cards.forEach((c) => {
    state.collection[c.id] = (state.collection[c.id] || 0) + 1;
  });
  ShopBusiness.emit(state,"cardsOpened",{packId,cards:cards.map(c=>c.id),quantity:cards.length,pulls:pulls.map(p=>({cardId:p.card.id,rarity:p.rarity,source:p.source}))});
  store.save(state);
  renderMeter();
  window.ShopGame?.toast(`拆开${pack.name}，5 张卡已放进背包。`);

  overlayLater(() => {
    const after = $("#after");
    after.innerHTML = `
      <button class="btn" id="againBtn">再来一包</button>
      <button class="btn plain" id="doneBtn">放进背包</button>`;
    after.classList.add("show");
    $("#againBtn").onclick = () => { busy = false; openPack(packId,boxId); };
    $("#doneBtn").onclick = () => closeOverlay();
  }, 140 + cards.length * 260 + 500);
}

function closeOverlay() {
  overlayTimers.forEach(clearTimeout);
  overlayTimers.clear();
  $("#overlay").hidden = true;
  $("#stage").innerHTML = "";
  busy = false;
  if (currentCodex && !$("#codexView").hidden) {
    renderCodex(currentCodex);
  } else {
    renderPacks();
  }
}

$("#resetBtn").onclick = () => {
  if (!confirm("重新开店？将清空背包、货架和垃圾桶，资金重置为 ¥1200。")) return;
  state = ShopModel.normalise();
  store.save(state);
  renderMeter();
  renderPacks();
};

document.addEventListener("keydown", (e) => {
  if (document.querySelector("dialog[open]")) return;
  if (e.key === "Escape" && !$("#overlay").hidden) closeOverlay();
});

boot();
