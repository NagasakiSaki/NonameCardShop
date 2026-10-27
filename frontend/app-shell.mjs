import {installWorldDialogue} from './v7-dialogue.mjs';
// frontend/app-shell.mjs — 应用外壳：Host 连接、场景、HUD、手账、窗口调度与交互路由。
import { el, clear, toast, formatMoney, formatShort, formatClock, formatPhase, newRequestId } from "./ui/components.mjs";
import { createHud } from "./ui/hud.mjs";
import { createWindowManager } from "./ui/window-manager.mjs";
import { createMapLoader, assetUrl } from "./world/map-loader.mjs";
import { createMovementView } from "./world/movement-view.mjs";
import { createInteractionRouter } from "./world/interaction-router.mjs";
import { createInteractionQueue } from "./world/interaction-queue.mjs";
import { setSceneContext, createWorldSceneClass, worldSceneZoom } from "./scenes/world-scene.mjs";
import { nearestInteraction, exitAt } from "./world/map-loader.mjs";
import { normalizeQuery } from "./host/normalize.mjs";
import {mountQueueStatus} from './ui/queue-status.mjs';

const mockTrades = new URLSearchParams(location.search).get('mode') === 'mock';
const classicTrades = mockTrades || new URLSearchParams(location.search).get('tradeUI') === 'classic';
const previousTrades = new URLSearchParams(location.search).get('tradeUI') === 'previous';
const PANEL_LOADERS = {
  inventory: () => classicTrades?import("./ui/inventory.mjs").then(m=>m.openInventory):previousTrades?import('../frontend-next/screens/cards.mjs').then(m=>m.openCollection):import('../frontend-next/screens/workspace.mjs').then(m=>m.openCollection),
  cardDetail: () => classicTrades?import("./ui/card-detail.mjs").then(m=>m.openCardDetail):import('../frontend-next/screens/card-detail.mjs').then(m=>m.openCardDetail),
  supplier: () => classicTrades?import("./ui/supplier.mjs").then(m=>m.openSupplier):previousTrades?import('../frontend-next/screens/supplier.mjs').then(m=>m.openSupply):import('../frontend-next/screens/stations.mjs').then(m=>m.openSupply),
  warehouse: () => import('../frontend-next/screens/stations.mjs').then(m=>m.openWarehouse),
  opening: () => classicTrades?import("./ui/opening.mjs").then(m=>m.openOpening):previousTrades?import('../frontend-next/screens/opening.mjs').then(m=>m.openOpening):import('../frontend-next/screens/stations.mjs').then(m=>m.openOpening),
  market: () => classicTrades?import("./ui/secondary-market.mjs").then(m=>m.openMarket):previousTrades?import('../frontend-next/screens/cards.mjs').then(m=>m.openCards):import('../frontend-next/screens/workspace.mjs').then(m=>m.openCards),
  allies:()=>import('./combat/v7-room.mjs').then(m=>m.openAllies),
  combat: () => classicTrades||previousTrades?import('./ui/combat-room.mjs').then(m=>m.openCombat):import('./combat/v7-room.mjs').then(m=>m.openCombat),
  tasks: () => import("./ui/tasks.mjs").then((m) => m.openTasks),
  report: () => mockTrades?import('./ui/day-report.mjs').then(m=>m.openDayReport):import('../frontend-next/screens/management.mjs').then(m=>m.openDayReport),
  guide: () => import('../frontend-next/screens/management.mjs').then(m=>m.openGuide),
  customers: () => import('../frontend-next/screens/management.mjs').then(m=>m.openCustomers),
  finance: () => import('./ui/finance.mjs').then(m=>m.openFinance),
  saves: () => import("./ui/day-saves.mjs").then((m) => m.openDaySaves),
  management: () => previousTrades||classicTrades?import('./ui/management.mjs').then(m=>m.openManagement):import('../frontend-next/screens/management.mjs').then(m=>m.openManagement),
  settings: () => import("./ui/settings.mjs").then((m) => m.openSettings),
  trash: () => previousTrades||classicTrades?import('./ui/trash.mjs').then(m=>m.openTrash):import('../frontend-next/screens/trash.mjs').then(m=>m.openTrash),
  help: () => import("./ui/help.mjs").then((m) => m.openHelp),
  more:()=>import('./ui/more.mjs').then(m=>m.openMore),
  story:()=>import('./ui/story.mjs').then(m=>m.openStory),
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
    modeBadge.textContent = "旧版演示界面 · " + (snapshot.fixtureLabel || fixture);
    modeBadge.title = "当前使用 Mock Host，交易与规则均为演示；不代表正式经济验收";
  }

  let queueStatus=null,v7=null,pendingActor=null;
  // 场景对话打断点击时记住原本要开的窗口；对话结束后补做一次，换档则丢弃。
  const interactionQueue=createInteractionQueue({branchOf:()=>`${snapshot.worldId}:${snapshot.branchId}`});
  const windows = createWindowManager({
    host,
    mount: document.getElementById("windows"),
    onInspectCard:cardKey=>app.openPanel('cardDetail',{cardKey}),
    onChange: (stack) => {
      document.body.classList.toggle("has-window", stack.length > 0);
      if (stack.length) movement.releaseAll();
      queueStatus?.render();
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
    getWorldScene: () => sceneRef,
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
      if (result.ok && !destroying) {
        snapshot = result.data;
        if (Array.isArray(snapshot.actors)) actors = snapshot.actors;
        syncRoom();
        render();
      }
      return result;
    },
    async openPanel(kind, options = {}) {
      if(destroying||v7?.blocked)return null;
      const loader = PANEL_LOADERS[kind];
      if (!loader) {
        toast("error", "未实现的入口", kind);
        return null;
      }
      const open = await loader();
      if(destroying||v7?.blocked)return null;
      return open(app, options);
    },
    goToInteraction(interactionId,panel,panelOptions={}) {
      for (const mapId of Object.keys(maps)) {
        const found = (maps[mapId].interactions || []).find((item) => item.id === interactionId);
        if (!found) continue;
        const target={...found,...(panel?{panel,panelOptions}:{})};
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
    /** 对话关闭后补做被打断的事：先处理“已到站位”的点击意图，再恢复没走完的路。 */
    resumeAfterDialogue() {
      if (destroying || v7?.blocked || windows.depth > 0) return false;
      const queued = interactionQueue.take({ blocked: false });
      if (queued.status === 'ready') { handleInteraction(queued.interaction); return true; }
      return resumeInterruptedWalk();
    },
    navigateScene(mapId) {
      if (!maps[mapId] || mapId===currentMapId) return;
      const exit=maps[currentMapId].exits.find(e=>e.target?.mapId===mapId);
      if(!exit){toast('error','没有可用出口',mapId);return;}
      windows.closeAll();router.clearPending();
      scheduleWalk(()=>movement.moveTo(exit.seamlessEdge?(exit.seamlessEdge==='east'?maps[currentMapId].width*16-1:1):exit.fromTile.x*16+8,exit.fromTile.y*16+8));
    },
    destroy() {
      destroying = true;v7?.dispose();
      movement.destroy();observer?.disconnect();clearTimeout(notebookTask);window.removeEventListener('keydown',onGlobalKeyDown);
      document.getElementById('notebook-toggle').removeEventListener('click',onNotebookToggle);
      windows.closeAll();
      hud.destroy?.();
      queueStatus?.dispose();
      if (game) game.destroy(true);
    },
  };
  if(!mockTrades)queueStatus=mountQueueStatus(app);

  function flushWalk(){if(walkIntent&&windows.depth===0&&!snapshot.clock.manualPaused&&!(snapshot.clock.pauseReasons||[]).length){const fn=walkIntent;walkIntent=null;fn();}}
  function scheduleWalk(fn){walkIntent=fn;flushWalk();}

  function syncRoom(){
    const player=actors.find(a=>a.actorId===playerActorId);
    if(!player?.roomId||player.roomId===currentMapId||!maps[player.roomId])return;
    currentMapId=player.roomId;router.resetForMap();
    if(sceneRef?.ready)sceneRef.setActiveRoom(currentMapId);
    render();
  }

  // ---- 交互路由 ----
  const router = createInteractionRouter({
    getMap: () => maps[currentMapId],
    hintNode,
    onActivate: (interaction) => handleInteraction(interaction),
    onExit: async (exit) => {
      if(!exit.target||changingRoom)return;
      changingRoom=true;movement.suspend();
      try{const result=await host.command({requestId:newRequestId('room'),type:'world.changeRoom',payload:{anchorId:exit.id}});if(!result.ok)toast('error',result.error.code,result.error.message);else {await app.refreshSnapshot();syncRoom();}}
      finally{changingRoom=false;
        if(travelTarget){const target=travelTarget;travelTarget=null;movement.moveTo(target.stand.x,target.stand.y);router.walkThenActivate(target);}
        else if(!movement.resume()){const p=app.getPlayer();if(p)movement.moveTo(p.x+(exit.seamlessEdge==='east'?24:-24),p.y);}
      }
    },
  });

  // 对话会打断“走过去再开窗”。记下被打断的目标，对话结束后接着走完，
  // 避免玩家点了柜台却停在半路、还得重新点一次。
  let interruptedWalk = null;
  function stopWalkForDialogue() {
    const pending = router.pending;
    movement.releaseAll();
    router.clearPending();
    interruptedWalk = pending && pending.interaction
      ? { interaction: pending.interaction, branch: `${snapshot.worldId}:${snapshot.branchId}`, mapId: currentMapId }
      : null;
    return Boolean(interruptedWalk);
  }
  function resumeInterruptedWalk() {
    const intent = interruptedWalk;
    interruptedWalk = null;
    if (!intent || destroying || v7?.blocked || windows.depth > 0) return false;
    if (`${snapshot.worldId}:${snapshot.branchId}` !== intent.branch || currentMapId !== intent.mapId) return false;
    const stand = intent.interaction.stand;
    if (!stand) return false;
    scheduleWalk(() => {
      movement.moveTo(stand.x, stand.y);
      router.walkThenActivate(intent.interaction);
    });
    return true;
  }

  function handleInteraction(interaction) {
    if (!interaction) return;
    // 对话正在进行时不能把窗口盖在对话上：记住意图，等对话结束后补做一次。
    if (v7?.blocked) { interactionQueue.push(interaction); return; }
    if(interaction.panel){app.openPanel(interaction.panel,interaction.panelOptions);return;}
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
      case 'table':
        app.openPanel('combat',{tableId:interaction.tableId});
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
    isBlocked: () => windows.depth > 0 || v7?.blocked || window.__bootFailed === true,
    onWorldClick: (x, y, roomId=currentMapId) => {
      if(roomId!==currentMapId){const destination=maps[roomId],hit=destination.interactions.find(i=>(i.props||[]).some(id=>{const p=destination.props.find(p=>p.id===id);return p&&x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.h;}));if(hit)app.goToInteraction(hit.id);else app.navigateScene(roomId);return;}
      const map = maps[currentMapId];
      const person=actors.filter(n=>n.actorId!==playerActorId&&n.roomId===currentMapId).find(n=>Math.abs(n.x-x)<17&&y>=n.y-48&&y<=n.y+10);
      if(person&&v7){router.clearPending();const player=app.getPlayer();if(Math.hypot(player.x-person.x,player.y-person.y)<=52)void v7.interact(person.actorId);else{pendingActor={actorId:person.actorId,until:performance.now()+12000,lastX:person.x,lastY:person.y};movement.moveTo(person.x,person.y+12);}return;}
      pendingActor=null;
      const hit=map.interactions.find(i=>(i.props||[]).some(id=>{const p=map.props.find(p=>p.id===id);return p&&x>=p.x&&x<=p.x+p.w&&y>=p.y&&y<=p.y+p.h;}));
      if(hit){app.goToInteraction(hit.id);return;}
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
      if(pendingActor&&v7){const n=actors.find(n=>n.actorId===pendingActor.actorId);if(!n||n.roomId!==currentMapId||performance.now()>pendingActor.until)pendingActor=null;else if(Math.hypot(player.x-n.x,player.y-n.y)<=48){pendingActor=null;movement.stop();void v7.interact(n.actorId);}else if(Math.hypot(n.x-pendingActor.lastX,n.y-pendingActor.lastY)>24){pendingActor.lastX=n.x;pendingActor.lastY=n.y;movement.moveTo(n.x,n.y+12);}}
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
    isBlocked: () => windows.depth > 0 || v7?.blocked || changingRoom,
    // 用户自己按方向键即放弃自动寻路与待触发的交互
    onManualMove: () => {pendingActor=null;walkIntent=null;travelTarget=null;router.clearPending();},
  });

  // ---- HUD ----
  const hud = createHud({
    mount: document.getElementById("hud"),
    demo:mode==='mock',
    storyAvailable:!!connection.capabilities?.narrative,
    currency,
    getSnapshot: () => snapshot,
    onAction: (action) => {
      if(v7?.blocked)return;
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
      else if(action==='warehouse')app.openPanel('warehouse');
      else if(action==='more')app.openPanel('more');
      else if(action==='allies')app.openPanel('allies');
      else if(action==='goals')app.openPanel('allies',{tab:'future'});
      else if(action==='story')app.openPanel('story');
      else if (action === "tasks") app.openPanel("tasks", {});
      else if (action === "report") app.openPanel("report", {});
      else if (action === 'finance') app.openPanel('finance', {});
      else if (action === "saves") app.openPanel("saves", {});
      else if (action === "management") app.openPanel("management", {});
      else if (action === 'guide') app.openPanel('guide');
      else if (action === 'customers') app.openPanel('customers');
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
  let notebookTask = null,notebookLoading=false;
  async function renderNotebook() {
    if(destroying||notebookLoading)return;
    notebookLoading=true;const identity=snapshot.worldId+':'+snapshot.branchId;
    try{
    const [tasksResult,ledgerResult]=await Promise.all([app.query('tasks.list'),app.query('ledger.daily')]);
    if(destroying||identity!==snapshot.worldId+':'+snapshot.branchId)return;
    clear(notebookBody);
    if (tasksResult.ok) {
      const daily=tasksResult.data.items.filter(task=>task.scope==='daily');
      const shown=daily.length?daily:tasksResult.data.items;
      const open = shown.filter((task) => !task.claimed);
      const totalTasks = shown.length;
      const card = el("div", { class: "note-card" }, [
        el("p", { class: "note-card__title" }, ["今日任务", el("span", { class: "muted", text: '待完成 '+open.length + "/" + totalTasks })]),
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
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "进货与运营支出" }), el("span", { class: "stat-row__value", text: app.formatMoney(cost) })]),
        el("div", { class: "stat-row" }, [el("span", { class: "stat-row__label", text: "对局净额" }), el("span", { class: "stat-row__value", text: app.formatMoney((ledger.combat?.stakeOut || 0) - (ledger.combat?.stakeIn || 0)) })]),
        el("p", { class: "small muted", text: ledger.note || "未售卡估值不计收入；赌注本金不计营业所得。" }),
      ]));
    }
    const map = maps[currentMapId];
    notebookBody.append(el("div", { class: "note-card" }, [
      el("p", { class: "note-card__title" }, ["店面导航", el("span", { class: "muted", text: map.label })]),
      el("p", { class: "small muted", text: "WASD / 方向键可斜向行走；点击设施自动走近并打开。穿过右侧通道进入对战房。" }),
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
    }finally{notebookLoading=false;}
  }

  function render() {
    if(destroying)return;
    hud.render(snapshot);
    queueStatus?.render();
    if(notebookTask)return;
    notebookTask = setTimeout(() => {
      notebookTask=null;
      renderNotebook().catch((error) => console.error("[notebook] 渲染失败", error));
    }, 1000);
  }

  if (window.innerWidth < 720) {
    notebook.classList.add("collapsed");
    document.getElementById("notebook-toggle").setAttribute("aria-expanded", "false");
  }

  const onNotebookToggle=(event) => {
    const collapsed = notebook.classList.toggle("collapsed");
    event.currentTarget.setAttribute("aria-expanded", String(!collapsed));
  };
  document.getElementById("notebook-toggle").addEventListener("click",onNotebookToggle);

  // ---- 键盘 ----
  const onGlobalKeyDown=(event) => {
    const target = event.composedPath?.()[0] || event.target;
    const typing = target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.isContentEditable);
    if (event.key === "Escape") {
      if (windows.depth > 0) {
        event.preventDefault();
        windows.closeTop();
      }
      return;
    }
    if (typing||v7?.blocked) return;
    if (event.code === "KeyB") {
      event.preventDefault();
      app.openPanel("inventory", {});
    } else if (event.code === "KeyE") {
      event.preventDefault();
      if (windows.depth === 0){const p=app.getPlayer(),n=actors.filter(n=>n.actorId!==playerActorId&&n.roomId===currentMapId&&Math.hypot(n.x-p.x,n.y-p.y)<=48).sort((a,b)=>Math.hypot(a.x-p.x,a.y-p.y)-Math.hypot(b.x-p.x,b.y-p.y))[0];if(n&&v7)void v7.interact(n.actorId);else router.activateNearest();}
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
      toast("info", "已读取进度", "正在刷新店铺。");
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

  if(connection.capabilities?.operationsV7)v7=installWorldDialogue(app,{stopMovement:stopWalkForDialogue});
  movement.bindTouchpad(document.getElementById("touchpad"));
  window.__cardShopApp = app;
  render();
  await sceneReady;
  return { app, destroy: () => { off(); window.removeEventListener("resize", onResize); app.destroy(); } };
}
