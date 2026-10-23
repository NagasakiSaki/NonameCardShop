// frontend/mock/mock-host.mjs — 与正式 Host 同形的演示实现（固定种子、内存态、不外写正式存档）。
import { loadCardLibrary } from "./fixtures/cards.mjs";
import { resolveFixture } from "./fixtures/fixtures.mjs";

const CONTRACT = "card-shop-ui/1.0";

const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
const money = (value) => Math.round(value);

function seeded(seed) {
  let s = seed >>> 0;
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function nowMinute(clock) {
  return clock.minute;
}

export async function createMockHost({ fixture = "store-day" } = {}) {
  const { id: fixtureId, config, fallback } = resolveFixture(fixture);
  const lib = await loadCardLibrary();
  const rng = seeded(0x5eed + fixtureId.length * 977);
  const warnings = fallback ? ["未找到 fixture " + fixture + "，已回落到 store-day"] : [];

  let revision = 1;
  let seq = 0;
  let requestSeq = 0;
  let inputSeq = 0;
  let leaseSeq = 0;
  let previewSeq = 0;
  let quoteSeq = 0;

  let loopTimer = null;
  const listeners = new Set();
  const operations = new Map();
  const previews = new Map();
  const quotes = new Map();
  const leases = new Map();
  const trades = [];

  // ---- 地图与导航（读前端自己产出的地图数据，缺图则退化为开放场地） ----
  const MAP_FALLBACK = { width: 30, height: 20, tileSize: 16, walkable: new Array(600).fill(1), interactions: [], tables: [] };
  async function loadMap(id) {
    try {
      const response = await fetch("/assets/frontend/maps/" + id + ".json", { cache: "no-cache" });
      if (!response.ok) return MAP_FALLBACK;
      const data = await response.json();
      return data && Array.isArray(data.walkable) ? data : MAP_FALLBACK;
    } catch {
      return MAP_FALLBACK;
    }
  }
  const maps = {
    store: await loadMap("store"),
    "battle-room": await loadMap("battle-room"),
  };

  // ---- 世界状态 ----
  const clock = {
    day: config.clock.day,
    minute: config.clock.minute,
    phase: config.clock.phase,
    speed: config.clock.speed,
    running: true,
    pauseReasons: [],
  };
  const wallet = { ...config.wallet };
  let manualPause = false;

  const catalog = lib.cards;
  const pool = catalog.slice();
  const inventory = [];
  const listings = [];
  const orders = [];
  const saves = [];
  const tasks = [];
  const ledgerLines = [];
  const rooms = { service: { fee: 200, registerOpen: true }, tables: [] };
  const matches = [];

  // ---- 库存 ----
  const targetCount = config.inventoryAll ? pool.length : config.inventoryCount || 64;
  const pickCards = () => {
    const start = Math.floor(rng() * Math.max(1, pool.length - targetCount));
    return pool.slice(start, start + targetCount);
  };
  const chosen = targetCount >= pool.length ? pool : pickCards();
  chosen.forEach((card, index) => {
    const owned = 1 + Math.floor(rng() * 3);
    const overlap = config.overlap && index % 5 === 0;
    const protectedN = overlap ? 1 : rng() > 0.82 ? 1 : 0;
    const listedN = overlap ? 1 : rng() > 0.9 ? 1 : 0;
    const lockedN = overlap && index % 10 === 0 ? 1 : 0;
    inventory.push({
      inventoryRef: "inv:" + card.cardKey.slice(5) + ":" + (index % 3),
      cardKey: card.cardKey,
      printVersion: "print-2026a",
      printedRarity: card.printedRarity,
      location: index % 7 === 0 ? "warehouse" : "shelf",
      owned,
      available: Math.max(0, owned - Math.max(protectedN, listedN) - lockedN),
      protected: protectedN,
      locked: lockedN,
      listed: listedN,
      eligible: !(config.overlap && lockedN > 0),
      disabledReasons: config.overlap && lockedN > 0 ? [{ code: "ITEM_LOCKED", message: "已锁定在待结算的比赛阵容中" }] : [],
    });
  });

  // ---- 商品与供货版本 ----
  const themes = (lib.packs.length ? lib.packs : [
    { id: "standard", name: "标准包" }, { id: "refresh", name: "界限突破" }, { id: "shenhua", name: "神话再临" },
  ]).slice(0, 3);

  function poolSummaryOf(themeId) {
    const cards = catalog.filter((card) => card.pack === themeId);
    const summary = { N: 0, R: 0, SR: 0, SSR: 0 };
    for (const card of cards) summary[card.currentRarity] += 1;
    if (!cards.length) return { N: 40, R: 18, SR: 4, SSR: 1 };
    return summary;
  }

  function makeProduct(theme, version) {
    const poolSummary = poolSummaryOf(theme.id);
    const bump = version === 2 ? { N: -12, R: 8, SR: 3, SSR: 1 } : { N: 0, R: 0, SR: 0, SSR: 0 };
    const boxCounts = {
      N: clamp(84 + bump.N, 60, 110),
      R: clamp(30 + bump.R, 18, 60),
      SR: clamp(5 + bump.SR, 2, 12),
      SSR: clamp(1 + bump.SSR, 1, 4),
    };
    const packsPerBox = 24;
    const cardsPerPack = 5;
    const expected = {};
    const atLeast = {};
    const total = boxCounts.N + boxCounts.R + boxCounts.SR + boxCounts.SSR;
    for (const rarity of ["N", "R", "SR", "SSR"]) {
      expected[rarity] = Math.round((boxCounts[rarity] / (packsPerBox * cardsPerPack)) * 1000) / 1000;
      const perPack = boxCounts[rarity] / packsPerBox;
      atLeast[rarity] = rarity === "SSR"
        ? Math.round((1 - Math.pow(1 - 1 / packsPerBox, 1)) * 10000) / 10000
        : Math.round((1 - Math.pow(1 - clamp(perPack / cardsPerPack, 0, 0.999), cardsPerPack)) * 10000) / 10000;
    }
    const previous = version === 2 ? {
      boxCounts: { N: clamp(84 + 0, 60, 110), R: clamp(30 + 0, 18, 60), SR: clamp(5 + 0, 2, 12), SSR: clamp(1 + 0, 1, 4) },
    } : null;
    const changes = previous
      ? ["N", "R", "SR", "SSR"].map((rarity) => ({
          label: "整盒 " + rarity,
          from: previous.boxCounts[rarity],
          to: boxCounts[rarity],
        })).filter((row) => row.from !== row.to)
      : [];
    return {
      productId: "prod:" + theme.id + ":v" + version,
      themeId: theme.id,
      themeName: theme.name,
      productVersion: "v" + version,
      previousVersion: version === 2 ? "v1" : null,
      changes,
      changeReason: version === 2 ? "全局评分复核后本主题高分段卡种增加，配方同步上调 SR/SSR 定额" : null,
      effectiveAt: { day: clock.day, minute: 9 * 60 },
      ratingVersion: "mock-demo-rating-1",
      priceVersion: version === 2 ? "price-" + clock.day : "price-" + (clock.day - 1),
      cardsPerPack,
      packsPerBox,
      poolSummary,
      boxCounts,
      packExpectedCounts: expected,
      packAtLeastOneProbabilities: atLeast,
      guarantees: ["每包至少 1 张 R 或以上", "整盒至少 1 张 SSR（按本版定额）"],
      substitutionSummary: poolSummary.SSR === 0 ? "本主题无 SSR 卡种，整盒大保底改用同档补位卡池" : null,
      availability: "available",
      unavailableReason: null,
      unitAmounts: {
        pack: money(2400 + version * 120),
        box: money(2400 * 24 * 0.82),
      },
      totalCardsPerBox: total,
    };
  }

  const products = [];
  for (const theme of themes) {
    products.push(makeProduct(theme, config.productRevisions ? 2 : 1));
    if (config.productRevisions) products.push(makeProduct(theme, 1));
  }

  // ---- 二级市场挂单 ----
  const sellerTypes = ["shop", "npc", "npc"];
  for (let i = 0; i < (config.listingCount || 0); i += 1) {
    const card = pool[Math.floor(rng() * pool.length)];
    if (!card) continue;
    const base = card.globalScore == null ? 1200 : Math.round(card.globalScore * 42 + rng() * 400);
    listings.push({
      listingId: "listing:" + i,
      cardKey: card.cardKey,
      name: card.name,
      rarity: card.currentRarity,
      imageUrl: card.imageUrl,
      sellerType: sellerTypes[i % sellerTypes.length],
      sellerName: sellerTypes[i % sellerTypes.length] === "shop" ? "本店自营" : ["收藏家 · 陈先生", "竞技玩家 · 小林", "路过顾客"][i % 3],
      unitAmount: base,
      quantity: 1 + Math.floor(rng() * 3),
      expiresMinute: clock.minute + 240,
      demand: ["收藏补齐", "竞技需要", "缺卡"][i % 3],
      status: "open",
      grade: card.currentRarity,
      priceBreakdown: card.priceBreakdown || {
        globalScore: card.globalScore,
        sessions: card.priceSessions || 0,
        demandIndex: Math.round((0.9 + rng() * 0.5) * 100) / 100,
        versionPremium: card.currentRarity === "SSR" ? 1.18 : card.currentRarity === "SR" ? 1.08 : 1,
        lastChange: card.rngChangePct == null ? Math.round((rng() - 0.5) * 12) : card.rngChangePct,
        note: "评分与样本决定基准，供需与版本溢价做有界修正",
      },
    });
  }

  // ---- 任务 ----
  const taskDefs = [
    { taskId: "task.purchase", title: "向供应商进一批新版本散包", target: "store.counter", goal: 1, unit: "单" },
    { taskId: "task.retail", title: "把密封卡包摆上零售货架", target: "store.retail", goal: 12, unit: "包" },
    { taskId: "task.market", title: "在二级市场挂出一张重复卡", target: "store.secondaryMarket", goal: 1, unit: "张" },
    { taskId: "task.battle", title: "在对战房开一张桌", target: "battleRoom.service", goal: 1, unit: "桌" },
    { taskId: "task.trash", title: "清理一次垃圾桶", target: "store.trash", goal: 1, unit: "次" },
  ];
  taskDefs.forEach((def, index) => {
    tasks.push({
      ...def,
      progress: index === 0 ? 1 : index === 1 ? 7 : 0,
      claimed: false,
      reward: 800 + index * 200,
      hint: "走到对应的柜台按 E，或点击手账中的指引",
    });
  });

  // ---- 员工与街坊（可变状态：接单/交付/拒绝会真的改变待办） ----
  const people = {
    staff: [
      { personId: "staff.1", name: "阿青", role: "店员", wage: 1600, hired: true, mood: "正常", note: "负责零售补货" },
      { personId: "staff.2", name: "老赵", role: "收银", wage: 1800, hired: false, mood: "—", note: "可减少排队" },
    ],
    neighbors: [
      { personId: "neighbor.1", name: "隔壁面馆老板", relation: 42, portrait: "regular", dialog: "最近卡包涨价了？给我留两包。", pending: { kind: "application", day: clock.day, cardName: "界关羽", quantity: 1, offer: 4200, note: "收卡申请：想补齐同一势力", accepted: false } },
      { personId: "neighbor.2", name: "卡片社社长", relation: 66, portrait: "collector", dialog: "周六想借你的场地办小型赛。", pending: { kind: "booking", day: 6, fee: 8000, accepted: false } },
      { personId: "neighbor.3", name: "常来点卡的高中生", relation: 31, portrait: "rookie", dialog: "这张重复的能卖我吗？我攒了三个月的零花钱。", pending: { kind: "application", day: clock.day, cardName: "界徐盛", quantity: 2, offer: 2600, note: "收卡申请：预算有限，可议价", accepted: false } },
    ],
  };

  // ---- 日报 ----
  const ledger = {
    day: clock.day,
    revenue: { sealedSales: 26800, serviceIncome: 6400 },
    cost: { procurement: 15200, wages: 4200, rent: 3000, tableFees: 800 },
    combat: { stakeIn: 6000, stakeOut: 7200, rake: 300 },
    escrow: { held: wallet.escrowLiability },
    unsoldValuation: 1845000,
    note: "未售卡估值不计收入；赌注本金不计营业所得。",
  };

  // ---- 存档 ----
  const saveRows = [
    { saveId: "save:d5-night", day: 5, branch: "main", minute: 21 * 60, source: "auto", status: "readable", note: "闭店结算后自动存档" },
    { saveId: "save:d4-night", day: 4, branch: "main", minute: 20 * 60 + 50, source: "auto", status: "readable", note: "" },
    { saveId: "save:d4-alt", day: 4, branch: "experiment", minute: 18 * 60 + 10, source: "manual", status: "readable", note: "改配比前的手动分支" },
  ];
  if (config.saveBranches) {
    saveRows.push({ saveId: "save:d3-alt", day: 3, branch: "aggressive", minute: 16 * 60, source: "manual", status: "readable", note: "高价进货路线" });
    saveRows.push({ saveId: "save:d3-broken", day: 3, branch: "main", minute: 17 * 60, source: "auto", status: "unreadable", note: "格式校验未通过，未加载" });
  }

  // ---- 角色与移动 ----
  const appearances = ["owner", "rookie", "collector", "competitor", "passerby", "regular", "bigspender"];
  const actors = new Map();
  const ownedActorId = "actor:owner";
  const startMap = config.scene || "store";
  const start = maps[startMap].spawn || { x: 232, y: 264, tile: { x: 14, y: 16 } };
  actors.set(ownedActorId, {
    actorId: ownedActorId,
    appearanceId: "owner",
    roomId: startMap,
    x: start.x,
    y: start.y,
    direction: "up",
    moving: false,
    activity: "idle",
    label: "店长（你）",
    navVersion: maps[startMap].navVersion || "nav-mock",
    controlled: true,
    path: [],
    intentDirection: null,
  });

  const npcSpawnTiles = [
    { x: 7, y: 9, activity: "浏览货架", look: "rookie" },
    { x: 10, y: 6, activity: "挑选卡包", look: "collector" },
    { x: 23, y: 8, activity: "看单卡", look: "competitor" },
    { x: 17, y: 12, activity: "排开包队", look: "regular" },
    { x: 12, y: 15, activity: "闲逛", look: "passerby" },
  ];
  for (let i = 0; i < (config.npcCount || 0); i += 1) {
    const spot = npcSpawnTiles[i % npcSpawnTiles.length];
    const walkable = isWalkable(maps[startMap], spot.x, spot.y);
    if (!walkable) continue;
    const id = "actor:npc" + (i + 1);
    actors.set(id, {
      actorId: id,
      appearanceId: spot.look,
      roomId: startMap,
      x: spot.x * 16 + 8,
      y: spot.y * 16 + 14,
      direction: "down",
      moving: false,
      activity: spot.activity,
      label: spot.activity,
      navVersion: maps[startMap].navVersion || "nav-mock",
      path: [],
      intentDirection: null,
      wanderAt: 0,
    });
  }

  // 对战房的两名 NPC：一名入座、一名旁观
  const battleSeats = [
    { x: 9, y: 5, activity: "入座 · 1 号桌", look: "competitor", label: "竞技玩家 · 小林" },
    { x: 21, y: 12, activity: "旁观 · 2 号桌", look: "collector", label: "收藏家 · 陈先生" },
  ];
  if (typeof window !== "undefined") {
    battleSeats.forEach((spot, index) => {
      const id = "actor:battle" + (index + 1);
      actors.set(id, {
        actorId: id,
        appearanceId: spot.look,
        roomId: "battle-room",
        x: spot.x * 16 + 8,
        y: spot.y * 16 + 14,
        direction: "left",
        moving: false,
        activity: spot.activity,
        label: spot.label,
        navVersion: maps["battle-room"].navVersion || "nav-mock",
        path: [],
        intentDirection: null,
        wanderAt: 6 + index * 4,
      });
    });
  }

  // ---- 房间桌位 ----
  function buildTables() {
    const presetStatus = config.flags && config.flags.tableError
      ? ["error", "settling"]
      : config.battlePreset
        ? ["in-progress", "settling"]
        : ["waiting", "idle"];
    rooms.tables = (maps["battle-room"].tables || []).map((table, index) => {
      const busy = presetStatus[index] === "in-progress";
      return {
        tableId: table.id,
        label: table.label,
        status: presetStatus[index] || "idle",
        mode: index === 0 ? "BO3" : "KOF",
        opponentName: index === 0 ? "竞技玩家 · 小林" : "收藏家 · 陈先生",
        seated: busy ? 2 : 0,
        maxSeats: 2,
        stake: index === 0 ? { base: 2000, multiplier: 2, final: 4000 } : { base: 1000, multiplier: 1, final: 1000 },
        fee: rooms.service.fee,
        rakeRate: 0.05,
        note: busy ? "NPC 对局进行中，可旁观" : "",
        matchId: busy ? "match:demo-1" : null,
      };
    });
  }
  buildTables();

  // ---- 工具 ----
  function touch() {
    revision += 1;
    return revision;
  }
  function emit(type, data = {}) {
    seq += 1;
    const event = {
      contractVersion: CONTRACT,
      worldId: world.worldId,
      branchId: world.branchId,
      seq,
      revision,
      type,
      data,
    };
    for (const listener of listeners) {
      try {
        listener(event);
      } catch (error) {
        console.error("[mock] 事件订阅者异常", error);
      }
    }
  }
  function ok(data) {
    return { ok: true, revision: touch(), data };
  }
  function fail(code, message, retryable = false, details) {
    return { ok: false, error: { code, message, retryable, details } };
  }
  function pauseReasons() {
    const list = [];
    if (manualPause) list.push({ code: "manual", label: "手动暂停" });
    for (const lease of leases.values()) list.push({ code: "ui." + lease.ownerId, label: lease.reason });
    return list;
  }
  function refreshRunning() {
    clock.running = pauseReasons().length === 0;
    clock.pauseReasons = pauseReasons();
  }

  function isWalkable(map, tx, ty) {
    if (!map || !Array.isArray(map.walkable)) return true;
    if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
    return map.walkable[ty * map.width + tx] === 1;
  }

  function walkableAtPixel(map, x, y) {
    const tx = Math.floor(x / 16);
    const ty = Math.floor((y - 2) / 16);
    return isWalkable(map, tx, ty);
  }

  function canStand(map, x, y) {
    return walkableAtPixel(map, x - 5, y) && walkableAtPixel(map, x + 5, y) && walkableAtPixel(map, x, y);
  }

  function bfsPath(map, from, to) {
    const startT = { x: Math.floor(from.x / 16), y: Math.floor((from.y - 2) / 16) };
    const goalT = { x: Math.floor(to.x / 16), y: Math.floor((to.y - 2) / 16) };
    const W = map.width;
    const H = map.height;
    if (!isWalkable(map, goalT.x, goalT.y)) {
      // 目标不可走：找最近可走格，避免“点了墙边走不动"
      let best = null;
      for (let dy = -2; dy <= 2; dy += 1) {
        for (let dx = -2; dx <= 2; dx += 1) {
          const nx = goalT.x + dx;
          const ny = goalT.y + dy;
          if (!isWalkable(map, nx, ny)) continue;
          const d = dx * dx + dy * dy;
          if (!best || d < best.d) best = { x: nx, y: ny, d };
        }
      }
      if (!best) return null;
      goalT.x = best.x;
      goalT.y = best.y;
    }
    const key = (x, y) => y * W + x;
    const prev = new Map();
    const queue = [startT];
    prev.set(key(startT.x, startT.y), null);
    let found = false;
    while (queue.length) {
      const current = queue.shift();
      if (current.x === goalT.x && current.y === goalT.y) { found = true; break; }
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = current.x + dx;
        const ny = current.y + dy;
        if (!isWalkable(map, nx, ny)) continue;
        const k = key(nx, ny);
        if (prev.has(k)) continue;
        prev.set(k, current);
        queue.push({ x: nx, y: ny });
      }
    }
    if (!found) return null;
    const path = [];
    let node = goalT;
    while (node) {
      path.unshift({ x: node.x * 16 + 8, y: node.y * 16 + 14 });
      node = prev.get(key(node.x, node.y));
    }
    return path;
  }

  // ---- 世界对象 ----
  const world = {
    worldId: "mock-world-1",
    branchId: "main",
    get revision() { return revision; },
    clock,
    wallet,
    allowedActions: ["inventory.view", "supplier.order", "opening.execute", "market.trade", "combat.register"],
  };

  function snapshot() {
    return {
      worldId: world.worldId,
      branchId: world.branchId,
      revision,
      clock: {
        day: clock.day,
        minute: Math.floor(clock.minute),
        phase: clock.phase,
        speed: clock.speed,
        running: clock.running,
        pauseReasons: pauseReasons(),
      },
      wallet: { ...wallet },
      allowedActions: world.allowedActions.slice(),
      actors: [...actors.values()].map(publicActor),
      mode: "mock",
      fixture: fixtureId,
      fixtureLabel: config.label,
      presetOpening: config.presetOpening || null,
      warnings,
    };
  }

  function phaseFor(minute) {
    if (minute < 8 * 60) return "preparing";
    if (minute < 18 * 60) return "open";
    if (minute < 19 * 60) return "closing";
    return "closed";
  }

  // ---- 时钟推进 ----
  let accumulator = 0;
  function tick(dtSeconds) {
    // 游戏分钟推进：营业速度快于真实时间，暂停时停止
    if (clock.running) {
      clock.minute += dtSeconds * 4 * clock.speed;
      if (clock.minute >= 24 * 60) {
        clock.minute -= 24 * 60;
        clock.day += 1;
      }
      const phase = phaseFor(clock.minute);
      if (phase !== clock.phase) clock.phase = phase;
    }
    // 角色推进
    for (const actor of actors.values()) moveActor(actor, dtSeconds);
    // NPC 闲逛
    for (const actor of actors.values()) {
      if (actor.controlled || !clock.running) continue;
      if (actor.path.length) continue;
      actor.wanderAt -= dtSeconds;
      if (actor.wanderAt > 0) continue;
      actor.wanderAt = 3 + Math.random() * 5;
      const map = maps[actor.roomId];
      if (!map) continue;
      for (let attempt = 0; attempt < 12; attempt += 1) {
        const tx = 2 + Math.floor(Math.random() * (map.width - 4));
        const ty = 3 + Math.floor(Math.random() * (map.height - 5));
        if (!isWalkable(map, tx, ty)) continue;
        const path = bfsPath(map, actor, { x: tx * 16 + 8, y: ty * 16 + 14 });
        if (path && path.length > 1) {
          actor.path = path.slice(1);
          actor.activity = ["浏览货架", "看看卡包", "等着开包", "闲逛"][Math.floor(Math.random() * 4)];
          break;
        }
      }
    }
    // 事件节流推送
    accumulator += dtSeconds;
    if (accumulator >= 0.2) {
      accumulator = 0;
      emit("actorsUpdated", { roomId: startMap, actors: [...actors.values()].map(publicActor) });
      emit("snapshotUpdated", { snapshot: snapshot() });
    }
  }

  function publicActor(actor) {
    return {
      actorId: actor.actorId,
      appearanceId: actor.appearanceId,
      roomId: actor.roomId,
      x: Math.round(actor.x * 10) / 10,
      y: Math.round(actor.y * 10) / 10,
      direction: actor.direction,
      moving: actor.moving,
      activity: actor.activity,
      label: actor.label,
      navVersion: actor.navVersion,
    };
  }

  const SPEED = 88;
  function moveActor(actor, dt) {
    const map = maps[actor.roomId];
    if (!map) return;
    let vx = 0;
    let vy = 0;
    if (actor.intentDirection) {
      const d = actor.intentDirection;
      if (d === "left") vx = -1;
      else if (d === "right") vx = 1;
      else if (d === "up") vy = -1;
      else if (d === "down") vy = 1;
      actor.direction = d;
      actor.path = [];
    } else if (actor.path.length) {
      const waypoint = actor.path[0];
      let dx = waypoint.x - actor.x;
      let dy = waypoint.y - actor.y;
      let dist = Math.hypot(dx, dy);
      const step = SPEED * dt;
      // 先判断能否一步到位：直接吸附，避免越过路点来回抖
      while (dist <= step) {
        actor.x = waypoint.x;
        actor.y = waypoint.y;
        actor.path.shift();
        if (!actor.path.length) {
          actor.moving = false;
          return;
        }
        const next = actor.path[0];
        dx = next.x - actor.x;
        dy = next.y - actor.y;
        dist = Math.hypot(dx, dy);
      }
      vx = dx / dist;
      vy = dy / dist;
      if (Math.abs(dx) > Math.abs(dy)) actor.direction = dx > 0 ? "right" : "left";
      else actor.direction = dy > 0 ? "down" : "up";
    }
    if (!vx && !vy) {
      actor.moving = false;
      return;
    }
    const nx = actor.x + vx * SPEED * dt;
    const ny = actor.y + vy * SPEED * dt;
    let moved = false;
    if (canStand(map, nx, actor.y)) {
      actor.x = nx;
      moved = true;
    }
    if (canStand(map, actor.x, ny)) {
      actor.y = ny;
      moved = true;
    }
    actor.moving = moved;
    if (!moved) {
      // 撞墙即停：自动寻路到墙边不抖腿
      actor.path = [];
      actor.intentDirection = null;
      actor.moving = false;
    }
  }

  // ---- 查询 ----
  function cardSummary(card) {
    return {
      cardKey: card.cardKey,
      generalId: card.generalId,
      skillVersion: card.skillVersion,
      name: card.name,
      imageUrl: config.flags && config.flags.imageBroken && card.generalId.length % 7 === 0 ? "/img/__missing_demo__.jpg" : card.imageUrl,
      currentRarity: card.currentRarity,
      globalScore: card.globalScore,
      ratingVersion: card.ratingVersion,
      reviewStatus: card.reviewStatus,
      printedRarity: card.printedRarity,
      faction: card.faction,
    };
  }

  const QUERIES = {
    "shop.snapshot": () => snapshot(),

    "catalog.list": (input = {}) => {
      const search = (input.search || "").trim();
      const rarity = input.rarity || null;
      const pack = input.pack || null;
      const sort = input.sort || "score-desc";
      const limit = clamp(input.limit || 48, 1, 96);
      const offset = Number(input.cursor || 0) || 0;
      let rows = catalog;
      if (search) rows = rows.filter((card) => card.name.includes(search));
      if (rarity) rows = rows.filter((card) => card.currentRarity === rarity);
      if (pack) rows = rows.filter((card) => card.pack === pack);
      const sorted = rows.slice().sort((a, b) => {
        if (sort === "score-asc") return (a.globalScore ?? -1) - (b.globalScore ?? -1);
        if (sort === "name") return a.name.localeCompare(b.name, "zh");
        return (b.globalScore ?? -1) - (a.globalScore ?? -1);
      });
      const page = sorted.slice(offset, offset + limit).map(cardSummary);
      return {
        items: page,
        nextCursor: offset + limit < sorted.length ? String(offset + limit) : null,
        total: sorted.length,
        ratingVersion: "mock-demo-rating-1",
        limit,
      };
    },

    "catalog.detail": (input = {}) => {
      const card = lib.byKey.get(input.cardKey);
      if (!card) return { missing: true };
      const rows = inventory.filter((row) => row.cardKey === card.cardKey);
      const owned = rows.reduce((sum, row) => sum + row.owned, 0);
      const available = rows.reduce((sum, row) => sum + row.available, 0);
      return {
        ...cardSummary(card),
        faction: card.faction,
        pack: card.pack,
        hp: card.hp,
        skills: card.skills,
        confidence: card.confidence,
        duel: card.duel,
        kof: card.kof,
        holdings: { owned, available, protected: rows.reduce((s, r) => s + r.protected, 0), listed: rows.reduce((s, r) => s + r.listed, 0) },
        marketEligibility: {
          eligible: available > 0,
          reasons: available > 0 ? [] : [{ code: "NOT_ELIGIBLE", message: "当前没有可交易副本，先到二级市场收购或开包获取" }],
        },
        referencePrice: { amount: card.globalScore == null ? 1200 : Math.round(card.globalScore * 42), unit: "张" },
        stats: {
          kof: { sessions: 0, wins: 0, losses: 0, draws: 0, sampleSufficient: false },
          bo3: { sessions: 0, wins: 0, losses: 0, draws: 0, sampleSufficient: false },
          sampleSufficient: false,
          note: "实战样本不足",
        },
        skillSourceAvailable: true,
      };
    },

    "inventory.list": (input = {}) => {
      const limit = clamp(input.limit || 40, 1, 120);
      const offset = Number(input.cursor || 0) || 0;
      const search = (input.search || "").trim();
      const rarity = input.rarity || null;
      const filter = input.filter || "all";
      const location = input.location || null;
      if (location === "trash") {
        const trashShaped = trashRows.map((item) => {
          const card = lib.byKey.get(item.cardKey);
          return {
            inventoryRef: item.inventoryRef, cardKey: item.cardKey, printVersion: item.printVersion,
            printedRarity: item.printedRarity, location: "trash", owned: item.quantity, available: 0,
            protected: 0, locked: 0, listed: 0, eligible: false, disabledReasons: [],
            name: card ? card.name : item.cardKey, rarity: card ? card.currentRarity : item.printedRarity,
            imageUrl: card ? card.imageUrl : "", globalScore: card ? card.globalScore : null,
          };
        });
        return { items: trashShaped, nextCursor: null, total: trashShaped.length, totals: { distinct: trashShaped.length, owned: trashShaped.reduce((s, r) => s + r.owned, 0), available: 0 } };
      }
      let rows = inventory.map((row) => {
        const card = lib.byKey.get(row.cardKey);
        return { ...row, name: card ? card.name : row.cardKey, rarity: card ? card.currentRarity : row.printedRarity, imageUrl: card ? card.imageUrl : "", globalScore: card ? card.globalScore : null };
      });
      if (search) rows = rows.filter((row) => row.name.includes(search));
      if (rarity) rows = rows.filter((row) => row.printedRarity === rarity);
      if (filter === "duplicate") rows = rows.filter((row) => row.owned > 1);
      if (filter === "protected") rows = rows.filter((row) => row.protected > 0);
      if (filter === "listed") rows = rows.filter((row) => row.listed > 0);
      const sort = input.sort || "score-desc";
      rows.sort((a, b) => {
        if (sort === "score-asc") return (a.globalScore ?? -1) - (b.globalScore ?? -1);
        if (sort === "name") return String(a.name).localeCompare(String(b.name), "zh");
        if (sort === "owned-desc") return b.owned - a.owned;
        return (b.globalScore ?? -1) - (a.globalScore ?? -1);
      });
      return {
        items: rows.slice(offset, offset + limit),
        nextCursor: offset + limit < rows.length ? String(offset + limit) : null,
        total: rows.length,
        totals: {
          distinct: rows.length,
          owned: rows.reduce((s, r) => s + r.owned, 0),
          available: rows.reduce((s, r) => s + r.available, 0),
        },
      };
    },

    "products.list": (input = {}) => {
      const theme = input.themeId || null;
      const current = input.version === "history" ? products : products.filter((product) => product.productVersion === "v" + (config.productRevisions ? 2 : 1));
      return { items: theme ? current.filter((p) => p.themeId === theme) : current, allVersions: products, ratingVersion: "mock-demo-rating-1" };
    },

    "products.quote": (input = {}) => {
      const product = products.find((p) => p.productId === input.productId);
      if (!product) return { missing: true };
      const quantity = clamp(Number(input.quantity) || 1, 1, 40);
      const unit = input.unit === "box" ? "box" : "pack";
      const unitAmount = product.unitAmounts[unit];
      const subtotal = unitAmount * quantity;
      const fee = Math.round(subtotal * 0.01);
      const expired = config.flags && config.flags.quoteExpired;
      const quote = {
        quoteId: "quote:" + (quoteSeq += 1),
        productVersion: product.productVersion,
        priceVersion: product.priceVersion,
        quantity,
        unit,
        unitAmount,
        subtotal,
        feeAmount: fee,
        totalDebit: subtotal + fee,
        totalCredit: 0,
        validUntil: expired ? { day: clock.day, minute: Math.max(0, Math.floor(clock.minute) - 30) } : { day: clock.day, minute: Math.floor(clock.minute) + 40 },
        explanation: [
          product.themeName + " " + product.productVersion + " · " + (unit === "box" ? "整盒 " + product.packsPerBox + " 包" : "散包"),
          "按配方的各档张数 × 当期发行卡值折算，含 1% 订货手续费",
        ],
        expired,
      };
      quotes.set(quote.quoteId, quote);
      return quote;
    },

    "retail.list": () => ({
      shelves: [
        { shelfId: "shelf.sealed-1", label: "零售货架 · 散包", kind: "sealed-pack", stock: 42, unitAmount: 2580, capacity: 60 },
        { shelfId: "shelf.sealed-2", label: "零售货架 · 整盒", kind: "sealed-box", stock: 3, unitAmount: 48200, capacity: 6 },
      ],
      note: "正店货架只放密封商品；单卡交易请到二级市场柜台",
    }),

    "supplier.orders": (input = {}) => ({
      items: orders.filter((order) => !input.status || order.status === input.status),
      note: "未签收的订单不计入可开库存",
    }),

    "opening.preview": (input = {}) => {
      const quantity = clamp(Number(input.quantity) || 1, 1, 60);
      const packs = quantity;
      const cardsPerPack = 5;
      const previewId = "preview:open:" + (previewSeq += 1);
      previews.set(previewId, { kind: "opening", packs, cardsPerPack, at: clock.minute });
      return {
        previewId,
        scope: input.scope || "sealed",
        packs,
        cards: packs * cardsPerPack,
        boxesIncluded: input.includeBoxes ? 1 : 0,
        excluded: inventory.filter((row) => row.protected > 0).length,
        validUntil: { day: clock.day, minute: Math.floor(clock.minute) + 20 },
      };
    },

    "inventory.surplusPreview": (input = {}) => {
      const keep = Math.max(1, Number(input.keep || 1));
      const rows = inventory.filter((row) => row.owned > keep);
      const newListings = rows.reduce((sum, row) => sum + (row.owned - keep - row.listed), 0);
      const previewId = "preview:surplus:" + (previewSeq += 1);
      previews.set(previewId, { kind: "surplus", rows: rows.length, keep });
      return {
        previewId,
        keep,
        groups: rows.length,
        newListings: Math.max(0, newListings),
        alreadyListed: rows.reduce((s, r) => s + r.listed, 0),
        lockedExcluded: rows.reduce((s, r) => s + r.locked, 0),
        estimatedFee: Math.max(0, newListings) * 40,
      };
    },

    "market.list": (input = {}) => {
      const tab = input.tab || "buy";
      if (tab === "mine") return { items: listings.filter((l) => l.sellerType === "shop"), tradeCount: trades.length };
      if (tab === "bids") {
        return {
          items: [
            { bidId: "bid:1", cardKey: pool[3] ? pool[3].cardKey : null, name: pool[3] ? pool[3].name : "—", rarity: pool[3] ? pool[3].currentRarity : "N", unitAmount: 2400, quantity: 2, buyer: "收藏家 · 陈先生", expiresMinute: clock.minute + 90 },
            { bidId: "bid:2", cardKey: pool[9] ? pool[9].cardKey : null, name: pool[9] ? pool[9].name : "—", rarity: pool[9] ? pool[9].currentRarity : "R", unitAmount: 1800, quantity: 4, buyer: "竞技玩家 · 小林", expiresMinute: clock.minute + 40 },
          ],
        };
      }
      if (tab === "history") return { items: trades.slice(-12) };
      const search = (input.search || "").trim();
      const rarity = input.rarity || null;
      let rows = listings.filter((l) => l.status === "open");
      if (search) rows = rows.filter((row) => row.name.includes(search));
      if (rarity) rows = rows.filter((row) => row.rarity === rarity);
      return { items: rows, empty: rows.length === 0, note: rows.length === 0 ? "市场暂时没有挂单；挂单不等于成交，也不代表现金到账" : "" };
    },

    "market.quote": (input = {}) => {
      const listing = listings.find((l) => l.listingId === input.listingId);
      if (!listing) return { missing: true };
      const quantity = clamp(Number(input.quantity) || 1, 1, listing.quantity);
      const subtotal = listing.unitAmount * quantity;
      const fee = Math.round(subtotal * 0.04);
      const quote = {
        quoteId: "quote:" + (quoteSeq += 1),
        priceVersion: "market-" + clock.day,
        quantity,
        unitAmount: listing.unitAmount,
        subtotal,
        feeAmount: fee,
        totalDebit: input.direction === "sell" ? 0 : subtotal + fee,
        totalCredit: input.direction === "sell" ? subtotal - fee : 0,
        validUntil: { day: clock.day, minute: Math.floor(clock.minute) + 15 },
        explanation: ["单价来自当前挂单", "手续费 4%，成交后才计入可用资金"],
      };
      quotes.set(quote.quoteId, quote);
      return quote;
    },

    "cardStats.summary": (input = {}) => ({
      cardKey: input.cardKey,
      mode: input.mode || "kof",
      sessions: 0,
      wins: 0,
      losses: 0,
      draws: 0,
      weighted: null,
      note: "实战样本不足，当前分数为语义初估",
      ratingVersion: "mock-demo-rating-1",
    }),

    "room.snapshot": () => ({
      roomId: "battle-room",
      service: rooms.service,
      tables: rooms.tables,
      note: "开桌费与抽水由 Host 结算，旁观不计费",
      allowWatch: true,
    }),

    "combat.eligible": (input = {}) => {
      const mode = input.mode || "kof";
      const slots = mode === "kof" ? 3 : 1;
      const rows = inventory.slice(0, 24).map((row) => {
        const card = lib.byKey.get(row.cardKey);
        return {
          inventoryRef: row.inventoryRef,
          cardKey: row.cardKey,
          name: card ? card.name : row.cardKey,
          rarity: card ? card.currentRarity : row.printedRarity,
          imageUrl: card ? card.imageUrl : "",
          eligible: row.eligible && row.available > 0,
          reasons: row.eligible && row.available > 0 ? [] : (row.disabledReasons.length ? row.disabledReasons : [{ code: "ITEM_LOCKED", message: "没有可用副本" }]),
        };
      });
      return { mode, slots, items: rows, note: "可用阵容来自后端，前端不做准入判断" };
    },

    "combat.preview": (input = {}) => {
      const mode = input.mode || "kof";
      const cards = (input.inventoryRefs || []).slice(0, mode === "kof" ? 3 : 1);
      const table = rooms.tables.find((t) => t.tableId === input.tableId) || rooms.tables[0] || { stake: { base: 1000, multiplier: 1, final: 1000 }, fee: 200, rakeRate: 0.05, mode };
      const noStake = input.noStake === true;
      const previewId = "preview:combat:" + (previewSeq += 1);
      previews.set(previewId, { kind: "combat", mode, tableId: table.tableId, cards });
      return {
        previewId,
        mode,
        tableId: table.tableId,
        lineup: cards.map((ref) => {
          const card = inventory.find((row) => row.inventoryRef === ref);
          const meta = card ? lib.byKey.get(card.cardKey) : null;
          return { inventoryRef: ref, name: meta ? meta.name : ref, rarity: meta ? meta.currentRarity : "N" };
        }),
        stakeProposal: {
          proposalId: "stake:" + (quoteSeq += 1),
          multiplier: noStake ? 0 : table.stake.multiplier,
          base: noStake ? 0 : table.stake.base,
          final: noStake ? 0 : table.stake.final,
          reason: noStake ? "无赌注对局：只计开桌费" : "对手历史胜率与稀有度差给出的让注",
        },
        opponent: {
          name: table.opponentName || ["竞技玩家 · 小林", "收藏家 · 陈先生"][Math.floor(rng() * 2)],
          appearanceId: table.opponentLook || "competitor",
          raritySummary: { N: 0, R: 1, SR: 2, SSR: noStake ? 0 : 1 },
          record: "12 胜 5 负",
        },
        noStake,
        fee: table.fee,
        rakeRate: table.rakeRate,
        balance: wallet.available,
        escrow: wallet.escrowLiability,
        rules: [
          "KOF 三个位置固定次序：1 号先手位、2 号中坚、3 号收尾",
          "BO3 单将，每局重新确认",
          "抽水按最终注的 " + Math.round(table.rakeRate * 100) + "%，从赢家收益中扣除",
          "败局、本局认输、整场认输分别结算，返店不等于退款",
        ],
      };
    },

    "tasks.list": () => ({ items: tasks, day: clock.day }),

    "ledger.daily": () => ({ ...ledger, day: clock.day }),

    "management.upgrades": () => ({
      items: [
        { upgradeId: "up.shelf", name: "加固货架", level: 1, maxLevel: 3, nextCost: 26000, effect: "货架容量 +12", unlocked: true },
        { upgradeId: "up.counter", name: "第二柜台", level: 0, maxLevel: 2, nextCost: 42000, effect: "同时服务两位顾客", unlocked: true },
        { upgradeId: "up.lighting", name: "暖光照明", level: 2, maxLevel: 3, nextCost: 18000, effect: "晚间客流 +8%", unlocked: true },
        { upgradeId: "up.table", name: "对战房第三桌", level: 0, maxLevel: 1, nextCost: 96000, effect: "多一张牌桌", unlocked: false, unlockHint: "需要日营业额连续 3 天超过 3 万" },
      ],
    }),
    "management.people": () => ({ items: people.staff.slice(), neighbors: people.neighbors.slice() }),
    "management.orders": () => ({ items: orders.filter((o) => o.status !== "received") }),

    "config.list": () => ({
      items: [
        { configId: "runtime.speed", label: "营业速度", editable: true, capability: "business", text: JSON.stringify({ minutesPerSecond: 4 }, null, 2) },
        { configId: "market.fee", label: "二级市场手续费", editable: false, capability: "market", text: JSON.stringify({ rate: 0.04 }, null, 2) },
      ],
      permissions: { canEdit: true, role: "owner" },
    }),
    "config.validate": (input = {}) => {
      try {
        const parsed = JSON.parse(input.draft || "{}");
        return { valid: true, parsed, warnings: [] };
      } catch (error) {
        return { valid: false, errors: [{ message: "JSON 解析失败：" + error.message }] };
      }
    },

    "saves.list": () => ({ items: saveRows.slice().sort((a, b) => b.day - a.day), branches: [...new Set(saveRows.map((row) => row.branch))] }),

    "operations.get": (input = {}) => {
      const record = operations.get(input.requestId || input.operationId);
      if (!record) return { status: "pending", note: "尚未收到该操作的确定结果" };
      return record;
    },
  };

  // ---- 命令 ----
  function requireQuote(quoteId) {
    if (!quoteId) return { error: fail("QUOTE_REQUIRED", "该操作需要有效报价，请重新获取") };
    const quote = quotes.get(quoteId);
    if (!quote) return { error: fail("QUOTE_EXPIRED", "报价已失效，请重新确认价格", true) };
    if (quote.expired) return { error: fail("QUOTE_EXPIRED", "报价已过期，请按最新价格重新确认", true) };
    if (quote.validUntil && quote.validUntil.day === clock.day && clock.minute > quote.validUntil.minute + 15) {
      return { error: fail("QUOTE_EXPIRED", "报价已过期，请按最新价格重新确认", true) };
    }
    return { quote };
  }

  function spend(amount) {
    if (wallet.available < amount) return false;
    wallet.available -= amount;
    return true;
  }

  function grantOpening(packs, cardsPerPack) {
    const results = [];
    const byRarity = { N: 0, R: 0, SR: 0, SSR: 0 };
    for (let p = 0; p < packs; p += 1) {
      for (let c = 0; c < cardsPerPack; c += 1) {
        const roll = rng();
        const card = roll > 0.965 ? pool[Math.floor(rng() * 12)] : pool[Math.floor(rng() * pool.length)];
        if (!card) continue;
        byRarity[card.currentRarity] += 1;
        const existing = inventory.find((row) => row.cardKey === card.cardKey);
        const isNew = !existing;
        if (existing) existing.owned += 1;
        else {
          inventory.push({
            inventoryRef: "inv:" + card.cardKey.slice(5) + ":new",
            cardKey: card.cardKey,
            printVersion: "print-2026a",
            printedRarity: card.printedRarity,
            location: "warehouse",
            owned: 1,
            available: 1,
            protected: 0,
            locked: 0,
            listed: 0,
            eligible: true,
            disabledReasons: [],
          });
        }
        results.push({
          cardKey: card.cardKey,
          name: card.name,
          rarity: card.currentRarity,
          imageUrl: card.imageUrl,
          isNew,
          duplicateOf: isNew ? null : card.cardKey,
        });
      }
    }
    return { results, byRarity };
  }

  const COMMANDS = {
    "world.changeRoom": (payload) => {
      const actor=actors.get(ownedActorId),exit=maps[actor.roomId].exits.find(e=>e.id===payload.anchorId);
      if(!exit?.target||Math.hypot(actor.x-exit.fromTile.x*16-8,actor.y-exit.fromTile.y*16-8)>24)return fail('NOT_IN_RANGE','请先走到门口',false);
      const tile=exit.target.spawnTile;actor.roomId=exit.target.mapId;actor.x=tile.x*16+8;actor.y=tile.y*16+8;actor.path=[];actor.intentDirection=null;actor.moving=false;
      return ok(actor);
    },
    "business.open": () => {
      clock.phase = "open";
      clock.running = true;
      return ok({ phase: clock.phase });
    },
    "business.close": () => {
      clock.phase = "closed";
      return ok({ phase: clock.phase, note: "已闭店，明天开店前垃圾桶会被清空" });
    },
    "business.nextDay": () => {
      clock.day += 1;
      clock.minute = 8 * 60;
      clock.phase = "preparing";
      trashRows.length = 0;
      ledger.day = clock.day;
      return ok({ day: clock.day, trashCleared: true });
    },
    "clock.setManualPause": (payload) => {
      manualPause = Boolean(payload.paused);
      refreshRunning();
      emit("snapshotUpdated", { snapshot: snapshot() });
      return ok(snapshot().clock);
    },
    "clock.setSpeed": (payload) => {
      const speed = clamp(Number(payload.speed) || 1, 0.5, 4);
      clock.speed = speed;
      emit("snapshotUpdated", { snapshot: snapshot() });
      return ok({ speed });
    },

    "supplier.placeOrder": (payload) => {
      const check = requireQuote(payload.quoteIdArg);
      if (check.error) return check.error;
      const quote = check.quote;
      if (wallet.available < quote.totalDebit) return fail("INSUFFICIENT_FUNDS", "可用资金不足，还差 " + (quote.totalDebit - wallet.available) + " 金币");
      spend(quote.totalDebit);
      const product = products.find((p) => p.productId === payload.productId);
      const order = {
        orderId: "order:" + (orders.length + 1),
        productId: payload.productId,
        productVersion: product ? product.productVersion : "v1",
        themeName: product ? product.themeName : "—",
        unit: quote.unit,
        quantity: quote.quantity,
        total: quote.totalDebit,
        status: "pending",
        etaMinute: Math.floor(clock.minute) + 60,
        frozenQuoteId: quote.quoteId,
        priceVersion: quote.priceVersion,
        note: "已冻结价格；新价格发布不改本单金额",
      };
      orders.push(order);
      return ok({ order, wallet: { ...wallet } });
    },
    "supplier.receive": (payload) => {
      const order = orders.find((o) => o.orderId === payload.orderId);
      if (!order) return fail("NOT_FOUND", "找不到该订单");
      if (order.status === "received") return ok({ order, duplicate: true });
      order.status = "received";
      const product = products.find((p) => p.productId === order.productId);
      const packs = order.unit === "box" ? order.quantity * (product ? product.packsPerBox : 24) : order.quantity;
      return ok({ order, stock: { packs, location: "warehouse" }, note: "已签收，密封包进入仓库（尚未开包）" });
    },
    "boxes.unseal": (payload) => {
      const boxIds = payload.boxIds || [];
      if (!boxIds.length) return fail("INVALID_INPUT", "请选择要拆的整盒");
      return ok({ unsealed: boxIds.length, packs: boxIds.length * 24, note: "拆盒不重掷内容，余包保留来源" });
    },
    "opening.execute": (payload, extra) => {
      const preview = previews.get(extra.previewId);
      if (!preview) return fail("PREVIEW_EXPIRED", "开包预览已失效，请重新选择范围", true);
      previews.delete(extra.previewId);
      const opening = grantOpening(preview.packs, preview.cardsPerPack);
      const operationId = "op:" + (requestSeq += 1);
      if (config.flags && config.flags.unknownResult && !config.flags.__consumed) {
        // 演练"结果未知"：效果已发生，但首个响应丢失
        config.flags.__consumed = true;
        operations.set(extra.requestId, { status: "succeeded", operationId, opening, note: "首次响应丢失后按同一请求 ID 补查得到" });
        return { ok: false, requestId: extra.requestId, error: { code: "RESULT_UNKNOWN", message: "未收到开包结果，请按同一操作重试查询", retryable: true } };
      }
      const record = { status: "succeeded", operationId, opening, packs: preview.packs };
      operations.set(extra.requestId, record);
      return ok(record);
    },

    "inventory.setProtection": (payload) => {
      const rows = inventory.filter((row) => row.inventoryRef === payload.inventoryRef);
      if (!rows.length) return fail("NOT_FOUND", "找不到该库存记录");
      const row = rows[0];
      const nextProtected = payload.protected ? Math.min(row.owned, row.protected + 1) : Math.max(0, row.protected - 1);
      row.protected = nextProtected;
      row.available = Math.max(0, row.owned - Math.max(row.protected, row.listed) - row.locked);
      return ok({ row });
    },
    "inventory.discard": (payload) => {
      const row = inventory.find((r) => r.inventoryRef === payload.inventoryRef);
      if (!row) return fail("NOT_FOUND", "找不到该库存记录");
      if (row.locked > 0) return fail("ITEM_LOCKED", "该实体已被锁定（参赛或已挂单），不能丢弃");
      const quantity = clamp(Number(payload.quantity) || 1, 1, row.available);
      if (quantity <= 0) return fail("NO_STOCK", "没有可丢弃的副本");
      row.owned -= quantity;
      row.available -= quantity;
      const existingTrash = trashRows.find((item) => item.cardKey === row.cardKey);
      if (existingTrash) existingTrash.quantity += quantity;
      else trashRows.push({ inventoryRef: "trash:" + row.inventoryRef, cardKey: row.cardKey, quantity, location: "trash", printVersion: row.printVersion, printedRarity: row.printedRarity });
      return ok({ discarded: quantity, trash: trashRows.length, note: "次日开始新的一天时清空，清空前可捡回" });
    },
    "inventory.recover": (payload) => {
      const targetRef = payload.inventoryRef || null;
      const recovered = targetRef ? trashRows.filter((item) => item.inventoryRef === targetRef) : trashRows.slice();
      let count = 0;
      for (const item of recovered) {
        const row = inventory.find((r) => r.cardKey === item.cardKey);
        if (row) {
          row.owned += item.quantity;
          row.available += item.quantity;
        }
        count += item.quantity;
        const index = trashRows.indexOf(item);
        if (index >= 0) trashRows.splice(index, 1);
      }
      return ok({ recovered: count, note: count ? "已捡回仓库" : "垃圾桶是空的" });
    },

    "retail.list": (payload) => {
      const quantity = clamp(Number(payload.quantity) || 0, 0, 999);
      return ok({ listed: quantity, location: "retail", note: "正店货架只允许密封包与整盒" });
    },
    "retail.withdraw": (payload) => ok({ withdrawn: clamp(Number(payload.quantity) || 1, 1, 999) }),
    "retail.setPrice": (payload) => {
      const price = Number(payload.unitAmount);
      if (!Number.isFinite(price) || price <= 0) return fail("INVALID_INPUT", "价格必须是正整数");
      return ok({ unitAmount: Math.round(price) });
    },

    "market.listSurplus": (payload, extra) => {
      const preview = previews.get(extra.previewId);
      if (!preview) return fail("PREVIEW_EXPIRED", "上架预览已失效，请重新预览", true);
      previews.delete(extra.previewId);
      let created = 0;
      for (const row of inventory) {
        if (row.owned <= 1) continue;
        const card = lib.byKey.get(row.cardKey);
        const count = Math.max(0, row.owned - 1 - row.listed);
        if (count <= 0) continue;
        listings.push({
          listingId: "listing:" + listings.length + ":" + row.inventoryRef,
          cardKey: row.cardKey,
          name: card ? card.name : row.cardKey,
          rarity: card ? card.currentRarity : row.printedRarity,
          imageUrl: card ? card.imageUrl : "",
          sellerType: "shop",
          sellerName: "本店自营",
          unitAmount: card && card.globalScore ? Math.round(card.globalScore * 42) : 1200,
          quantity: count,
          expiresMinute: Math.floor(clock.minute) + 600,
          demand: null,
          status: "open",
          grade: card ? card.currentRarity : "N",
        });
        row.listed += count;
        row.available = Math.max(0, row.owned - Math.max(row.protected, row.listed) - row.locked);
        created += count;
      }
      return ok({ created, note: "已进入市场不等于已售出" });
    },
    "market.placeListing": (payload) => {
      const row = inventory.find((r) => r.inventoryRef === payload.inventoryRef);
      if (!row) return fail("NOT_FOUND", "找不到该库存记录");
      if (row.available <= 0) return fail("NO_STOCK", "没有可挂单的副本");
      const card = lib.byKey.get(row.cardKey);
      listings.push({
        listingId: "listing:" + (listings.length + 1) + ":manual",
        cardKey: row.cardKey,
        name: card ? card.name : row.cardKey,
        rarity: card ? card.currentRarity : row.printedRarity,
        imageUrl: card ? card.imageUrl : "",
        sellerType: "shop",
        sellerName: "本店自营",
        unitAmount: Math.round(Number(payload.unitAmount) || 1200),
        quantity: 1,
        expiresMinute: Math.floor(clock.minute) + 600,
        status: "open",
        grade: card ? card.currentRarity : "N",
      });
      row.listed += 1;
      row.available = Math.max(0, row.owned - Math.max(row.protected, row.listed) - row.locked);
      return ok({ listingId: listings[listings.length - 1].listingId });
    },
    "market.cancelListing": (payload) => {
      const listing = listings.find((l) => l.listingId === payload.listingId);
      if (!listing) return fail("NOT_FOUND", "找不到该挂单");
      listing.status = "cancelled";
      const row = inventory.find((r) => r.cardKey === listing.cardKey);
      if (row) {
        row.listed = Math.max(0, row.listed - listing.quantity);
        row.available = Math.max(0, row.owned - Math.max(row.protected, row.listed) - row.locked);
      }
      return ok({ listing });
    },
    "market.acceptTrade": (payload, extra) => {
      const check = requireQuote(extra.quoteId);
      if (check.error) return check.error;
      const quote = check.quote;
      const listing = listings.find((l) => l.listingId === payload.listingId);
      if (!listing) return fail("NOT_FOUND", "挂单已不存在");
      if (listing.quantity < quote.quantity) return fail("OUT_OF_STOCK", "挂单数量已变化，请按最新报价重新确认", true);
      if (quote.totalDebit > 0 && wallet.available < quote.totalDebit) return fail("INSUFFICIENT_FUNDS", "可用资金不足");
      if (listing.sellerType === "shop") {
        // 卖出：所有权转移 + 到账
        wallet.available += quote.totalCredit;
      } else {
        wallet.available -= quote.totalDebit;
        const card = lib.byKey.get(listing.cardKey);
        const row = inventory.find((r) => r.cardKey === listing.cardKey);
        if (row) {
          row.owned += quote.quantity;
          row.available += quote.quantity;
        } else if (card) {
          inventory.push({
            inventoryRef: "inv:" + card.cardKey.slice(5) + ":bought",
            cardKey: card.cardKey,
            printVersion: "print-2026a",
            printedRarity: card.printedRarity,
            location: "warehouse",
            owned: quote.quantity,
            available: quote.quantity,
            protected: 0, locked: 0, listed: 0, eligible: true, disabledReasons: [],
          });
        }
      }
      listing.quantity -= quote.quantity;
      if (listing.quantity <= 0) listing.status = "sold";
      const trade = {
        tradeId: "trade:" + (trades.length + 1),
        listingId: listing.listingId,
        name: listing.name,
        quantity: quote.quantity,
        unitAmount: quote.unitAmount,
        total: quote.totalDebit || quote.totalCredit,
        at: Math.floor(clock.minute),
        direction: listing.sellerType === "shop" ? "sell" : "buy",
      };
      trades.push(trade);
      return ok({ trade, wallet: { ...wallet }, note: "成交后资金计入可用余额；挂单价本身不代表到账" });
    },

    "room.reserve": (payload) => {
      const table = rooms.tables.find((t) => t.tableId === payload.tableId);
      if (!table) return fail("NOT_FOUND", "找不到该桌位");
      if (table.status === "in-progress") return fail("NOT_ELIGIBLE", "该桌正在对局");
      table.status = "reserved";
      return ok({ table });
    },
    "room.cancelReservation": (payload) => {
      const table = rooms.tables.find((t) => t.tableId === payload.tableId);
      if (table) table.status = "idle";
      return ok({ table });
    },
    "combat.register": (payload, extra) => {
      const preview = previews.get(extra.previewId);
      if (!preview) return fail("PREVIEW_EXPIRED", "参赛预览已失效", true);
      previews.delete(extra.previewId);
      const fee = rooms.service.fee;
      if (!spend(fee)) return fail("INSUFFICIENT_FUNDS", "开桌费不足");
      const table = rooms.tables.find((t) => t.tableId === preview.tableId);
      if (table) table.status = "in-progress";
      const match = { matchId: "match:" + (matches.length + 1), tableId: preview.tableId, mode: preview.mode, stake: table ? table.stake.final : 0, state: "playing" };
      matches.push(match);
      wallet.escrowLiability += match.stake;
      return ok({ match, note: "阵容已冻结，本金进入托管" });
    },
    "combat.start": (payload) => ok({ matchId: payload.matchId, state: "playing" }),
    "combat.continue": (payload) => ok({ matchId: payload.matchId, state: "playing" }),
    "combat.surrender": (payload) => {
      const match = matches.find((m) => m.matchId === payload.matchId) || matches[0];
      if (match) {
        match.state = "settled";
        wallet.escrowLiability = Math.max(0, wallet.escrowLiability - match.stake);
      }
      return ok({ matchId: match ? match.matchId : payload.matchId, settled: true, note: "认输按当前局结算；返店不等于退款" });
    },

    "tasks.claim": (payload) => {
      const task = tasks.find((t) => t.taskId === payload.taskId);
      if (!task) return fail("NOT_FOUND", "找不到该任务");
      if (task.claimed) return ok({ task, duplicate: true });
      if (task.progress < task.goal) return fail("NOT_ELIGIBLE", "任务尚未完成");
      task.claimed = true;
      wallet.available += task.reward;
      return ok({ task, reward: task.reward });
    },
    "upgrades.purchase": (payload) => {
      const levels = { "up.shelf": 26000, "up.counter": 42000, "up.lighting": 18000 };
      const cost = levels[payload.upgradeId];
      if (!cost) return fail("NOT_ELIGIBLE", "该设施尚未解锁");
      if (!spend(cost)) return fail("INSUFFICIENT_FUNDS", "资金不足");
      return ok({ upgradeId: payload.upgradeId, spent: cost });
    },
    "neighbors.act": (payload) => {
      const neighbor = people.neighbors.find((row) => row.personId === payload.personId);
      if (!neighbor) return fail("NOT_FOUND", "找不到这位街坊");
      const action = payload.action || "accept";
      if (action === "accept") {
        if (!neighbor.pending) return fail("NOT_ELIGIBLE", "这位街坊暂时没有待办");
        neighbor.pending.accepted = true;
        neighbor.relation = Math.min(100, neighbor.relation + 3);
        return ok({ personId: neighbor.personId, action, note: "已接单，等待交付（" + neighbor.pending.kind + "）" });
      }
      if (action === "deliver") {
        if (!neighbor.pending || !neighbor.pending.accepted) return fail("NOT_ELIGIBLE", "还没有接单，不能直接交付");
        const income = neighbor.pending.kind === "booking" ? neighbor.pending.fee : neighbor.pending.offer;
        wallet.available += income;
        neighbor.relation = Math.min(100, neighbor.relation + 5);
        neighbor.pending = null;
        return ok({ personId: neighbor.personId, action, income, note: "交付完成，入账 " + income + " 金币" });
      }
      if (action === "decline") {
        neighbor.pending = null;
        neighbor.relation = Math.max(0, neighbor.relation - 6);
        return ok({ personId: neighbor.personId, action, note: "已拒绝，关系下降" });
      }
      return ok({ personId: neighbor.personId, action, note: "已记录" });
    },
    "config.apply": (payload) => {
      let parsed;
      try {
        parsed = JSON.parse(payload.draft || "{}");
      } catch (error) {
        return fail("INVALID_INPUT", "配置不是合法 JSON：" + error.message);
      }
      return ok({ configId: payload.configId, applied: parsed, note: "已由 Host 校验并应用" });
    },
    "config.restoreDefault": (payload) => ok({ configId: payload.configId, restored: true }),
    "saves.create": () => {
      const save = { saveId: "save:d" + clock.day + "-" + (saveRows.length + 1), day: clock.day, branch: "main", minute: Math.floor(clock.minute), source: "manual", status: "readable", note: "手动存档" };
      saveRows.unshift(save);
      return ok({ save });
    },
    "saves.load": (payload) => {
      const row = saveRows.find((s) => s.saveId === payload.saveId);
      if (!row) return fail("NOT_FOUND", "找不到该存档");
      if (row.status !== "readable") return fail("NOT_ELIGIBLE", "该存档格式校验未通过，无法读取");
      clock.day = row.day;
      clock.minute = row.minute;
      return ok({ save: row, restored: true });
    },
    "saves.export": () => ok({ blobName: "noname-cardshop-day" + clock.day + ".json", bytes: 18240, note: "导出内容由 Host 生成，前端不接触原始存档结构" }),
    "saves.import": () => fail("NOT_IMPLEMENTED", "导入需要主模型落地 saves.import 命令", false),
  };

  function runCommand(type, payload, extra) {
    const handler = COMMANDS[type];
    if (!handler) return { ok: false, error: { code: "NOT_IMPLEMENTED", message: "命令 " + type + " 尚未在演示 Host 中实现", retryable: false } };
    const result = handler(payload || {}, extra);
    if (result && result.ok === true) {
      emit("snapshotUpdated", { snapshot: snapshot() });
    }
    return result;
  }

  // ---- 垃圾桶（清空前可捡回；次日开始新的一天时清空） ----
  const trashRows = [];

  const host = {
    async connect() {
      emit("connectionChanged", { state: "connected" });
      return {
        contractVersion: CONTRACT,
        worldId: world.worldId,
        branchId: world.branchId,
        sessionId: "session:mock",
        revision,
        currency: { code: "GOLD", label: "游戏币", minorUnit: 1 },
        capabilities: {
          catalog: true, inventory: true, supplier: true, opening: true, market: true,
          combat: true, tasks: true, ledger: true, management: true, config: true,
          saves: true, battleMount: true,
        },
        initialSnapshot: snapshot(),
      };
    },

    async query(name, input) {
      const handler = QUERIES[name];
      if (!handler) return { ok: false, error: { code: "NOT_IMPLEMENTED", message: "查询 " + name + " 尚未在演示 Host 中实现", retryable: false } };
      try {
        const data = handler(input || {});
        if (name === "catalog.detail" && data.missing) return { ok: false, error: { code: "NOT_FOUND", message: "卡牌不存在", retryable: false } };
        return { ok: true, revision, data };
      } catch (error) {
        return { ok: false, error: { code: "HOST_ERROR", message: error.message, retryable: true } };
      }
    },

    async command(input) {
      const requestId = input.requestId || "req:" + (requestSeq += 1);
      const extra = { requestId, quoteId: input.quoteId, previewId: input.previewId };
      const payload = { ...(input.payload || {}) };
      if (input.quoteId) payload.quoteIdArg = input.quoteId;
      if (input.type === "opening.execute" && input.payload && input.payload.previewId) extra.previewId = input.payload.previewId;
      const known = operations.get(requestId);
      if (known && known.status === "succeeded" && known.response) {
        // 幂等：同一 requestId 不重复扣款
        return { ok: true, requestId, revision, data: known.response };
      }
      const result = runCommand(input.type, payload, extra);
      if (result && result.ok === true) {
        operations.set(requestId, {
          status: "succeeded",
          operationId: result.data && result.data.operationId ? result.data.operationId : null,
          response: result.data,
        });
        refreshRunning();
        return { ok: true, requestId, revision: touch(), data: result.data };
      }
      // 已生效但响应丢失的操作保留成功记录，供 operations.get 补查
      const existing = operations.get(requestId);
      if (!existing || existing.status !== "succeeded") {
        operations.set(requestId, { status: "failed", error: result?.error || null });
      }
      return { ok: false, requestId, error: result?.error || { code: "HOST_ERROR", message: "命令失败", retryable: false } };
    },

    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },

    pause: {
      async acquire({ ownerId, reason }) {
        leaseSeq += 1;
        const lease = { leaseId: "lease:" + leaseSeq, ownerId, reason };
        leases.set(lease.leaseId, lease);
        refreshRunning();
        emit("snapshotUpdated", { snapshot: snapshot() });
        return lease;
      },
      async release(leaseId) {
        leases.delete(leaseId);
        refreshRunning();
        emit("snapshotUpdated", { snapshot: snapshot() });
      },
    },

    world: {
      input(input) {
        const actor = actors.get(ownedActorId);
        if (!actor) return;
        if (input.roomId && input.roomId !== actor.roomId) {
          // 换房间：由 UI 触发场景切换，Mock 只做位置对齐
          actor.roomId = input.roomId;
          const map = maps[input.roomId];
          if (map && map.spawn) {
            actor.x = map.spawn.x;
            actor.y = map.spawn.y;
          }
        }
        if (input.stop) {
          actor.intentDirection = null;
          actor.path = [];
          actor.moving = false;
          return;
        }
        if (input.direction) {
          actor.intentDirection = input.direction;
          actor.moving = true;
          return;
        }
        if (input.destination) {
          const map = maps[actor.roomId];
          actor.intentDirection = null;
          const path = bfsPath(map, actor, input.destination);
          actor.path = path ? path.slice(1) : [];
          actor.moving = actor.path.length > 0;
          if (!actor.path.length) emit("notification", { code: "UNREACHABLE", message: "那里走不过去" });
        }
      },
    },

    battle: {
      async mount({ container, matchId }) {
        const placeholder = document.createElement("div");
        placeholder.className = "battle-placeholder";
        placeholder.innerHTML = "<strong>战斗占位预览</strong><p>演示模式不加载真实引擎；正式模式由主模型挂载无名杀 iframe。</p><p class='mono'>matchId: " + String(matchId || "—") + "</p>";
        container.appendChild(placeholder);
        return {
          dispose() {
            placeholder.remove();
          },
        };
      },
    },

    async disconnect() {
      if (loopTimer) {
        clearInterval(loopTimer);
        loopTimer = null;
      }
      listeners.clear();
    },

    // ---- 仅 Mock 暴露的控制面（正式 Host 没有这些） ----
    __mock: {
      fixture: fixtureId,
      config,
      tick,
      snapshot,
      getMetrics: () => ({ revision, seq, actors: actors.size, inventory: inventory.length, leases: leases.size }),
      trash: () => trash,
      previews,
    },
  };

  // 浏览器里由 Mock 自己推进时钟与角色（正式 Host 有自己的逻辑时钟）
  if (typeof window !== "undefined" && typeof window.setInterval === "function") {
    let last = (typeof performance !== "undefined" ? performance.now() : Date.now());
    loopTimer = window.setInterval(() => {
      const now = typeof performance !== "undefined" ? performance.now() : Date.now();
      const dt = Math.min(0.3, (now - last) / 1000);
      last = now;
      try {
        tick(dt);
      } catch (error) {
        console.error("[mock] tick 失败", error);
      }
    }, 100);
  }

  refreshRunning();
  return host;
}
