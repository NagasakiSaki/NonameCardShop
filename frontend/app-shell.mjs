// frontend/app-shell.mjs — 应用外壳：Host 连接、场景、HUD、手账、窗口调度与交互路由。
import { el, clear, toast, formatMoney, formatShort, formatClock, formatPhase, newRequestId } from "./ui/components.mjs";
import { createHud } from "./ui/hud.mjs";
import { createWindowManager } from "./ui/window-manager.mjs";
import { createMapLoader, assetUrl } from "./world/map-loader.mjs";
import { createMovementView } from "./world/movement-view.mjs";
import { createInteractionRouter } from "./world/interaction-router.mjs";
import { setSceneContext, createWorldSceneClass, worldSceneZoom } from "./scenes/world-scene.mjs";
import { nearestInteraction, exitAt } from "./world/map-loader.mjs";
import { normalizeQuery } from "./host/normalize.mjs";

const PANEL_LOADERS = {
  inventory: () => import("./ui/inventory.mjs").then((m) => m.openInventory),
  cardDetail: () => import("./ui/card-detail.mjs").then((m) => m.openCardDetail),
  supplier: () => import("./ui/supplier.mjs").then((m) => m.openSupplier),
  opening: () => import("./ui/opening.mjs").then((m) => m.openOpening),
  market: () => import("./ui/secondary-market.mjs").then((m) => m.openMarket),
  combat: () => import("./ui/combat-room.mjs").then((m) => m.openCombat),
  tasks: () => import("./ui/tasks.mjs").then((m) => m.openTasks),
  report: () => import("./ui/day-report.mjs").then((m) => m.openDayReport),
  saves: () => import("./ui/day-saves.mjs").then((m) => m.openDaySaves),
  management: () => import("./ui/management.mjs").then((m) => m.openManagement),
  settings: () => import("./ui/settings.mjs").then((m) => m.openSettings),
  trash: () => import("./ui/trash.mjs").then((m) => m.openTrash),
  help: () => import("./ui/help.mjs").then((m) => m.openHelp),
};

export async function startApp({ host, connection, mode, fixture }) {
  const mapLoader = createMapLoader();
  const manifest = await mapLoader.loadManifest();
  const maps = {};
  for (const mapId of Object.keys(manifest.maps)) maps[mapId] = await mapLoader.loadMap(mapId);

  let snapshot = connection.initialSnapshot;
  let actors = snapshot.actors || (Array.isArray(snapshot.player) ? [snapshot.player] : []);

  function resolvePlayerActorId(list) {
    // 正式 Host 的受控角色叫 player；Mock 叫 actor:owner。按可用性取第一个命中的。
    for (const candidate of ["player", "actor:owner", "owner"]) {
      if (list.some((actor) => actor && actor.actorId === candidate)) return candidate;
    }
    return list[0] && list[0].actorId ? list[0].actorId : "actor:owner";
  }
  let currentMapId = actors.find(a=>a.actorId==='actor:owner'||a.actorId==='player')?.roomId || 'store';
  let travelTarget = null, changingRoom = false,walkIntent=null;
  let playerActorId = "actor:owner";
  // 首次拿到角色列表后再定，避免正式模式下相机跟错人
  let playerIdResolved = false;
  let sceneRef = null;
  let readyScene;const sceneReady=new Promise(resolve=>readyScene=resolve);
  let game = null;
  let destroying = false;
  const currency = connection.currency || { code: "GOLD", label: "游戏币", minorUnit: 1 };

  const mountEl = document.getElementById("game-mount");
  const stageFrame = document.getElementById("stage-frame");
  const hintNode = document.getElementById("interaction-hint");
  const notebookBody = document.getElementById("notebook-body");
  const notebook = document.getElementById("notebook");
  const modeBadge = document.getElementById("mode-badge");

  if (mode === "mock") {
    modeBadge.hidden = false;
    modeBadge.textContent = "前端演示数据 · " + (snapshot.fixtureLabel || fixture);
    modeBadge.title = "当前使用 Mock Host，交易与规则均为演示；不代表正式经济验收";
  }

  const windows = createWindowManager({
    host,
    mount: document.getElementById("windows"),
    onChange: (stack) => {
      document.body.classList.toggle("has-window", stack.length > 0);
      if (stack.length) movement.releaseAll();
    },
  });

  const app = {
    host,
    connection,
    manifest,
    maps,
    currency,
    windows,
    mode,
    fixture,
    snapshot: () => snapshot,
    actors: () => actors,
    currentMap: () => maps[currentMapId],
    getPlayer: () => actors.find((actor) => actor.actorId === playerActorId) || null,
    isNearInteraction(id){const i=maps[currentMapId].interactions.find(i=>i.id===id),p=actors.find(a=>a.actorId===playerActorId);return !!(i&&p&&Math.hypot(p.x-i.stand.x,p.y-i.stand.y)<=i.radius);},
    applyZoomPreference() { fitStage(); },
    get playerActorId() { return playerActorId; },
    toast,
    formatMoney: (amount) => formatMoney(amount, currency),
    formatShort: (amount) => formatShort(amount, currency),
    query: (name, input) => host.query(name, input).then((result) => normalizeQuery(name, result)),
    command: (input) => host.command(input),
    async refreshSnapshot() {
      const result = await host.query("shop.snapshot");
      if (result.ok) {
        snapshot = result.data;
        if (Array.isArray(snapshot.actors)) actors = snapshot.actors;
        syncRoom();
        render();
      }
      return result;
    },
    async openPanel(kind, options = {}) {
      const loader = PANEL_LOADERS[kind];
      if (!loader) {
        toast("error", "未实现的入口", kind);
        return null;
      }
      const open = await loader();
      return open(app, options);
    },
    goToInteraction(interactionId) {
      for (const mapId of Object.keys(maps)) {
        const target = (maps[mapId].interactions || []).find((item) => item.id === interactionId);
        if (!target) continue;
        windows.closeAll();
        if (mapId !== currentMapId) {travelTarget=target;app.navigateScene(mapId);return true;}
        scheduleWalk(() => {
          movement.moveTo(target.stand.x, target.stand.y);
          router.walkThenActivate(target);
        });
        return true;
      }
      return false;
    },
    navigateScene(mapId) {
      if (!maps[mapId] || mapId===currentMapId) return;
      const exit=maps[currentMapId].exits.find(e=>e.target?.mapId===mapId);
      if(!exit){toast('error','没有可用出口',mapId);return;}
      windows.closeAll();router.clearPending();
      scheduleWalk(()=>movement.moveTo(exit.fromTile.x*16+8,exit.fromTile.y*16+8));
    },
    destroy() {
      destroying = true;
      movement.destroy();observer?.disconnect();clearTimeout(notebookTask);window.removeEventListener('keydown',onGlobalKeyDown);
      windows.closeAll();
      if (game) game.destroy(true);
    },
  };

  function flushWalk(){if(walkIntent&&windows.depth===0&&!snapshot.clock.manualPaused&&!(snapshot.clock.pauseReasons||[]).length){const fn=walkIntent;walkIntent=null;fn();}}
  function scheduleWalk(fn){walkIntent=fn;flushWalk();}

  function syncRoom(){
    const player=actors.find(a=>a.actorId===playerActorId);
    if(!player?.roomId||player.roomId===currentMapId||!maps[player.roomId])return;
    currentMapId=player.roomId;router.resetForMap();
    const next=maps[currentMapId];
    if(sceneRef)sceneRef.scene.restart({mapId:currentMapId,zoom:worldSceneZoom(mountEl.clientWidth,mountEl.clientHeight,next.width*next.tileSize,next.height*next.tileSize)});
    render();
  }

  // ---- 交互路由 ----
  const router = createInteractionRouter({
    getMap: () => maps[currentMapId],
    hintNode,
    onActivate: (interaction) => handleInteraction(interaction),
    onExit: async (exit) => {
      if(!exit.target||changingRoom)return;
      changingRoom=true;movement.stop();
      try{const result=await host.command({requestId:newRequestId('room'),type:'world.changeRoom',payload:{anchorId:exit.id}});if(!result.ok)toast('error',result.error.code,result.error.message);else {await app.refreshSnapshot();syncRoom();}}
      finally{changingRoom=false;}
    },
  });

  function handleInteraction(interaction) {
    if (!interaction) return;
    switch (interaction.kind) {
      case "retail":
        app.openPanel("supplier", { tab: "retail", interaction: interaction.id });
        break;
      case "counter":
        app.openPanel("supplier", { tab: "order", interaction: interaction.id });
        break;
      case "market":
        app.openPanel("market", { tab: "buy", interaction: interaction.id });
        break;
      case "trash":
        app.openPanel("trash", { interaction: interaction.id });
        break;
      case "service":
        app.openPanel("combat", { interaction: interaction.id });
        break;
      default:
        app.openPanel("supplier", { interaction: interaction.id });
    }
  }

  // ---- 场景上下文 ----
  setSceneContext({
    manifest,
    assetUrl,
    getMap: (mapId) => maps[mapId],
    getActors: () => actors,
    getPlayerActorId: () => playerActorId,
    getSnapshot: () => snapshot,
    isBlocked: () => windows.depth > 0 || window.__bootFailed === true,
    onWorldClick: (x, y) => {
      const map = maps[currentMapId];
      const near = nearestInteraction(map, x, y, 6);
      if (near && near.distance < (near.interaction.radius || 24) + 14) {
        router.walkThenActivate(near.interaction);
        movement.moveTo(near.interaction.stand.x, near.interaction.stand.y);
        return;
      }
      router.clearPending();
      movement.moveTo(x, y);
    },
    onPlayerMoved: (player) => {
      router.refresh(player);
    },
    onSceneReady: (mapId) => {
      router.clearPending();
      if(travelTarget){const target=travelTarget;travelTarget=null;scheduleWalk(()=>{movement.moveTo(target.stand.x,target.stand.y);router.walkThenActivate(target);});}
      if (hintNode) hintNode.hidden = true;
      // 场景 create 之后布局才稳定，这里再对齐一次整数缩放
      fitStage();
      render();
      readyScene();
    },
  });

  const movement = createMovementView({
    host,
    sessionId: connection.sessionId,
    getRoom: () => ({ mapId: currentMapId, navVersion: maps[currentMapId].navVersion }),
    isBlocked: () => windows.depth > 0,
    // 用户自己按方向键即放弃自动寻路与待触发的交互
    onManualMove: () => {walkIntent=null;travelTarget=null;router.clearPending();},
  });

  // ---- HUD ----
  const hud = createHud({
    mount: document.getElementById("hud"),
    currency,
    getSnapshot: () => snapshot,
    onAction: (action) => {
      if (['business','pause','speed'].includes(action)) {
        (async()=>{
          const lease=await host.pause.acquire({ownerId:'hud-action',reason:'店铺操作'});
          try{const clock=snapshot.clock,type=action==='business'?(clock.phase==='preparing'?'business.open':clock.phase==='closed'?'business.nextDay':'business.close'):action==='pause'?'clock.setManualPause':'clock.setSpeed';
            const payload=action==='pause'?{paused:!clock.manualPaused}:action==='speed'?{speed:clock.speed===1?2:clock.speed===2?4:1}:{};
            const r=await host.command({requestId:newRequestId('hud'),type,payload});if(!r.ok)toast('error',r.error.code,r.error.message);else {await app.refreshSnapshot();if(type==='business.close')app.openPanel('report');}
          }finally{await host.pause.release(lease.leaseId);}
        })().catch(e=>toast('error','操作失败',e.message));
      }
      else if (action === "inventory") app.openPanel("inventory", {});
      else if (action === "tasks") app.openPanel("tasks", {});
      else if (action === "report") app.openPanel("report", {});
      else if (action === "saves") app.openPanel("saves", {});
      else if (action === "management") app.openPanel("management", {});
      else if (action === "help") app.openPanel("help", {});
      else if (action === "settings") app.openPanel("settings", {});
    },
  });

  // ---- Phaser ----
  const SceneClass = createWorldSceneClass();
  game = new Phaser.Game({
    // 固定 CANVAS 渲染：像素画只需最近邻放大，且不依赖机器 GPU/framebuffer 是否可靠
    type: Phaser.CANVAS,
    parent: mountEl,
    width: Math.max(320, mountEl.clientWidth || 720),
    height: Math.max(240, mountEl.clientHeight || 480),
    backgroundColor: "#0b0910",
    pixelArt: true,
    antialias: false,
    roundPixels: true,
    scale: {
      mode: Phaser.Scale.RESIZE,
      autoCenter: Phaser.Scale.NO_CENTER,
    },
    scene: [SceneClass],
  });
  game.events.once("ready", () => {
    const firstMap = maps[currentMapId];
    game.scene.start("world", {
      mapId: currentMapId,
      zoom: worldSceneZoom(mountEl.clientWidth || 720, mountEl.clientHeight || 480, firstMap.width * firstMap.tileSize, firstMap.height * firstMap.tileSize),
    });
    sceneRef = game.scene.getScene("world");
  });

  function zoomPreference() {
    try {
      const raw = JSON.parse(localStorage.getItem("noname-card-shop-frontend-preview:prefs") || "{}");
      const value = Number(raw.zoom);
      return Number.isInteger(value) && value >= 1 && value <= 3 ? value : null;
    } catch {
      return null;
    }
  }

  function fitStage() {
    if (!game || destroying) return;
    const width = Math.max(320, mountEl.clientWidth || 720);
    const height = Math.max(240, mountEl.clientHeight || 480);
    game.scale.resize(width, height);
    const scene = game.scene.getScene("world");
    const map = maps[currentMapId];
    if (scene && scene.cameras && scene.cameras.main) {
      const preferred = zoomPreference();
      scene.cameras.main.setZoom(preferred || worldSceneZoom(width, height, map.width * map.tileSize, map.height * map.tileSize));
    }
  }
  const onResize = () => fitStage();
  window.addEventListener("resize", onResize);
  // 布局变化（手账折叠、窗口缩放、字体切换）也要重新对齐画布与整数缩放
  const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(() => fitStage()) : null;
  if (observer) observer.observe(stageFrame);
  requestAnimationFrame(() => fitStage());

  // ---- 手账 ----
  let notebookTask = null;
  async function renderNotebook() {
    clear(notebookBody);
    const tasksResult = await app.query("tasks.list");
    const ledgerResult = await app.query("ledger.daily");
    if (tasksResult.ok) {
      const open = tasksResult.data.items.filter((task) => !task.claimed);
      const totalTasks = tasksResult.data.items.length;
      const card = el("div", { class: "note-card" }, [
        el("p", { class: "note-card__title" }, ["今日任务", el("span", { class: "muted", text: open.length + "/" + totalTasks })]),
        el("ul", { class: "note-list" }, open.slice(0, 4).map((task) =>
          el("li", {}, [
            el("span", { text: task.title }),
            el("span", { class: "muted mono", text: Math.min(task.progress, task.goal) + "/" + task.goal }),
          ]),
        )),
        el("div", { class: "progress" }, [el("div", { class: "progress__bar", style: { width: Math.round((totalTasks - open.length) / Math.max(1, totalTasks) * 100) + "%" } })]),
        el("button", { class: "btn btn--sm", type: "button", text: "打开任务台", onclick: () => app.openPanel("tasks", {}) }),
      ]);
      notebookBody.append(card);
    }
    if (ledgerResult.ok) {
      const ledger = ledgerResult.data || {};
      const revenue = ledger.revenue?.total ?? ((ledger.revenue?.sealedSales || 0) + (ledger.revenue?.secondarySales || 0) + (ledger.revenue?.serviceIncome || 0));
      const cost = (ledger.cost?.procurement || 0) + (ledger.cost?.wages || 0) + (ledger.cost?.rent || 0) + (ledger.cost?.tableFees || 0);
      notebookBody.append(el("div", { class: "note-card" }, [
        el("p", { class: "note-card__title" }, ["今日收支", el("span", { class: "muted", text: "第 " + ledger.day + " 天" })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "营业收入" }), el("span", { class: "stat-row__value", text: app.formatMoney(revenue) })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "费用合计" }), el("span", { class: "stat-row__value", text: app.formatMoney(cost) })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "对局净额" }), el("span", { class: "stat-row__value", text: app.formatMoney((ledger.combat?.stakeOut || 0) - (ledger.combat?.stakeIn || 0)) })]),
        el("p", { class: "small muted", text: ledger.note || "未售卡估值不计收入；赌注本金不计营业所得。" }),
      ]));
    }
    const map = maps[currentMapId];
    notebookBody.append(el("div", { class: "note-card" }, [
      el("p", { class: "note-card__title" }, ["店面导航", el("span", { class: "muted", text: map.label })]),
      el("p", { class: "small muted", text: "点击地面走动，靠近柜台按 E 交互；点击家具会先走到可站的位置。" }),
      el("div", { style: { display: "flex", gap: "6px", flexWrap: "wrap" } }, (map.interactions || []).map((interaction) =>
        el("button", {
          class: "btn btn--sm", type: "button", text: interaction.label,
          onclick: () => {
            movement.moveTo(interaction.stand.x, interaction.stand.y);
            router.walkThenActivate(interaction);
          },
        }),
      )),
      el("button", {
        class: "btn btn--sm", type: "button",
        text: currentMapId === "store" ? "去对战房" : "回主店",
        onclick: () => app.navigateScene(currentMapId === "store" ? "battle-room" : "store"),
      }),
    ]));
  }

  function render() {
    hud.render(snapshot);
    if (notebookTask) clearTimeout(notebookTask);
    notebookTask = setTimeout(() => {
      renderNotebook().catch((error) => console.error("[notebook] 渲染失败", error));
    }, 180);
  }

  if (window.innerWidth < 720) {
    notebook.classList.add("collapsed");
    document.getElementById("notebook-toggle").setAttribute("aria-expanded", "false");
  }

  document.getElementById("notebook-toggle").addEventListener("click", (event) => {
    const collapsed = notebook.classList.toggle("collapsed");
    event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  });

  // ---- 键盘 ----
  const onGlobalKeyDown=(event) => {
    const target = event.target;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (event.key === "Escape") {
      if (windows.depth > 0) {
        event.preventDefault();
        windows.closeTop();
      }
      return;
    }
    if (typing) return;
    if (event.code === "KeyB") {
      event.preventDefault();
      app.openPanel("inventory", {});
    } else if (event.code === "KeyE") {
      event.preventDefault();
      if (windows.depth === 0) router.activateNearest();
    }
  };
  window.addEventListener('keydown',onGlobalKeyDown);

  // ---- Host 事件 ----
  let lastSeq = 0;
  let lastWorld = connection.worldId;
  let lastBranch = connection.branchId;
  const off = host.subscribe((event) => {
    if (!event || event.contractVersion !== "card-shop-ui/1.0") return;
    // 序号缺口或世界/分支切换：不拿旧缓存覆盖，重新读快照
    if (event.worldId !== lastWorld || event.branchId !== lastBranch) {
      lastWorld = event.worldId;
      lastBranch = event.branchId;
      actors = [];
      app.refreshSnapshot();
      toast("info", "世界已切换", "视图缓存已清空，正在重新读取");
    } else if (lastSeq > 0 && event.seq > lastSeq + 1) {
      app.refreshSnapshot();
    }
    lastSeq = event.seq;
    const payload = event.data;
    const incomingSnapshot = payload && payload.snapshot
      ? payload.snapshot
      : payload && payload.clock && payload.wallet
        ? payload
        : null;
    if (incomingSnapshot) {
      snapshot = incomingSnapshot;
      const embedded = incomingSnapshot.actors || (Array.isArray(incomingSnapshot.player) ? [incomingSnapshot.player] : null);
      if (embedded && embedded.length) {
        actors = embedded;
        if (!playerIdResolved) {
          playerActorId = resolvePlayerActorId(actors);
          playerIdResolved = true;
        }
      }
      hud.render(snapshot);
      render();
    }
    if (event.type === "actorsUpdated") {
      const list = Array.isArray(payload) ? payload : payload && Array.isArray(payload.actors) ? payload.actors : null;
      if (list) {
        actors = list;
        if (!playerIdResolved || !actors.some((actor) => actor.actorId === playerActorId)) {
          playerActorId = resolvePlayerActorId(actors);
          playerIdResolved = true;
        }
      }
    } else if (event.type === "notification") {
      const data = payload || {};
      // 走不过去这类提示不是错误，用中性提示，避免满屏红字
      const level = data.code === "UNREACHABLE" ? "info" : "error";
      toast(level, data.code || "提示", data.message || "");
    } else if (event.type === "worldReset") {
      walkIntent=null;travelTarget=null;
      toast("info", "档案已载入", "已清理旧分支窗口和选择");
      setTimeout(()=>windows.closeAll(),0);
      app.refreshSnapshot();
    }
    syncRoom();
    flushWalk();
  });

  movement.bindTouchpad(document.getElementById("touchpad"));
  window.__cardShopApp = app;
  render();
  await sceneReady;
  return { app, destroy: () => { off(); window.removeEventListener("resize", onResize); app.destroy(); } };
}
