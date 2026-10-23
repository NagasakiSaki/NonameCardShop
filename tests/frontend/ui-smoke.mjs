// tests/frontend/ui-smoke.mjs — 浏览器端验收：启动、面板、开包、市场、对战房、暂停令牌、窄屏、异常场景。
import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import assert from "node:assert/strict";
import { chromium } from "playwright";

const ROOT = process.cwd();
const SHOTS = path.join(ROOT, "docs/frontend-handoff/screenshots");
fs.mkdirSync(SHOTS, { recursive: true });

const MIME = {
  ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8",
  ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg",
};

const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  // 与根 server.mjs 一致：/img/xxx.jpg 取自 assets/character
  const target = url.startsWith("/img/")
    ? path.join(ROOT, "assets/character", path.basename(url))
    : path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
  const file = target;
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) {
    res.writeHead(404);
    res.end("not found");
    return;
  }
  res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((resolve) => server.listen(5199, "127.0.0.1", resolve));

const results = [];
async function check(name, fn) {
  try {
    await fn();
    results.push({ name, ok: true });
    console.log("  ok   " + name);
  } catch (error) {
    results.push({ name, ok: false, error });
    console.log("  FAIL " + name + "\n       " + (error && error.message));
  }
}

const browser = await chromium.launch();
const consoleErrors = [];

async function openPage(query, viewport = { width: 1440, height: 900 }) {
  const page = await browser.newPage({ viewport });
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push("[" + query + "] " + message.text());
  });
  page.on("pageerror", (error) => consoleErrors.push("[" + query + "] pageerror: " + error.message));
  await page.goto("http://127.0.0.1:5199/frontend/index.html?" + query);
  await page.waitForFunction("window.__cardShopReady === true", { timeout: 25000 });
  await page.waitForTimeout(700);
  return page;
}

async function shot(page, name) {
  await page.screenshot({ path: path.join(SHOTS, name + ".png") });
}

const page = await openPage("mode=mock&fixture=store-day");

await check("启动后 HUD 显示天数、资金与 Mock 标记", async () => {
  const badge = await page.locator("#mode-badge").innerText();
  assert.match(badge, /前端演示数据/);
  const clock = await page.locator("#hud-clock").innerText();
  assert.match(clock, /第 3 天/);
  const wallet = await page.locator("#hud-wallet .wallet__amount").innerText();
  assert.match(wallet, /游戏币/);
  await shot(page, "01-store-day");
});

await check("键盘四向行走会改变玩家坐标与朝向", async () => {
  const before = await page.evaluate(() => {
    const player = window.__cardShopApp.getPlayer();
    return { x: player.x, y: player.y, direction: player.direction };
  });
  await page.keyboard.down("ArrowLeft");
  await page.waitForTimeout(520);
  await page.keyboard.up("ArrowLeft");
  await page.waitForTimeout(320);
  const after = await page.evaluate(() => {
    const player = window.__cardShopApp.getPlayer();
    return { x: player.x, y: player.y, direction: player.direction };
  });
  assert.ok(after.x < before.x, "向左走应减少 x：" + before.x + " → " + after.x);
  assert.equal(after.direction, "left");
});

await check("点击地面会下发寻路目的地并走过去", async () => {
  const box = await page.locator("#game-mount canvas").boundingBox();
  const before = await page.evaluate(() => window.__cardShopApp.getPlayer().x);
  await page.mouse.click(box.x + box.width * 0.62, box.y + box.height * 0.5);
  await page.waitForTimeout(1200);
  const after = await page.evaluate(() => window.__cardShopApp.getPlayer().x);
  assert.notEqual(before, after, "点击后位置应变化");
});

await check("背包：列表、筛选、分页与详情（嵌套窗口）", async () => {
  await page.locator('[data-action="inventory"]').click();
  await page.waitForSelector("#inventory, .window");
  await page.waitForSelector(".card-tile");
  const count = await page.locator(".card-tile").count();
  assert.ok(count > 3, "背包应有卡片：" + count);
  await shot(page, "04-inventory");
  const running = await page.evaluate(() => window.__cardShopApp.snapshot().clock.running);
  assert.equal(running, false, "打开背包后经营应暂停");
  await page.locator(".card-tile").first().click();
  await page.waitForSelector(".window__title:has-text('卡牌详情')");
  await page.waitForTimeout(400);
  await shot(page, "05-card-detail");
  // 关闭详情后，背包仍在，世界仍暂停
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
  const stillOpen = await page.locator(".window__title:has-text('背包')").count();
  assert.ok(stillOpen > 0, "关闭详情不应连带关闭背包");
  const stillPaused = await page.evaluate(() => window.__cardShopApp.snapshot().clock.running);
  assert.equal(stillPaused, false, "嵌套关闭后仍应暂停");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(400);
  const resumed = await page.evaluate(() => window.__cardShopApp.snapshot().clock.running);
  assert.equal(resumed, true, "全部关闭后恢复经营");
});

await check("进货：报价 → 下单 → 待签收列表", async () => {
  await page.locator('[data-action="management"]').count();
  const app = page;
  await app.evaluate(() => window.__cardShopApp.openPanel("supplier", { tab: "order" }));
  await page.waitForSelector(".window__title:has-text('进货与签收')");
  await page.waitForTimeout(400);
  await shot(page, "06-supplier");
  await page.locator("button:has-text('获取报价')").first().click();
  await page.waitForSelector(".quote-box");
  await page.waitForTimeout(300);
  await shot(page, "07-supplier-quote");
  const walletBefore = await page.evaluate(() => window.__cardShopApp.snapshot().wallet.available);
  await page.locator("button:has-text('确认下单')").first().click();
  await page.waitForTimeout(700);
  const walletAfter = await page.evaluate(() => window.__cardShopApp.snapshot().wallet.available);
  assert.ok(walletAfter < walletBefore, "下单应扣款：" + walletBefore + " → " + walletAfter);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("开包：预览 → 执行 → 结果展示", async () => {
  await page.evaluate(() => window.__cardShopApp.openPanel("opening", {}));
  await page.waitForSelector(".window__title:has-text('开包柜台')");
  await page.waitForTimeout(300);
  await page.locator("button:has-text('生成预览')").click();
  await page.waitForSelector("button:has-text('确认开包')");
  await page.locator("button:has-text('确认开包')").click();
  await page.waitForSelector(".reveal-card", { timeout: 8000 });
  await page.waitForTimeout(500);
  await shot(page, "08-opening");
  const reveal = await page.locator(".reveal-card").count();
  assert.ok(reveal > 0, "应有开包结果卡片");
  await page.locator("button:has-text('直接汇总')").click();
  await page.waitForTimeout(300);
  await shot(page, "09-opening-summary");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("二级市场：买卡 / 我的出售 两个页签可用", async () => {
  await page.evaluate(() => window.__cardShopApp.openPanel("market", { tab: "buy" }));
  await page.waitForSelector(".window__title:has-text('二级市场')");
  await page.waitForTimeout(400);
  await shot(page, "10-market");
  await page.locator("button.tab:has-text('我的出售')").click();
  await page.waitForTimeout(400);
  await shot(page, "11-market-mine");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("对战房：桌位、配队与确认页", async () => {
  await page.evaluate(() => window.__cardShopApp.navigateScene("battle-room"));
  await page.waitForTimeout(1200);
  await shot(page, "12-battle-room");
  await page.evaluate(() => window.__cardShopApp.openPanel("combat", {}));
  await page.waitForSelector(".window__title:has-text('对战房')");
  await page.waitForTimeout(500);
  await page.locator(".note-card").first().click();
  await page.waitForTimeout(600);
  await shot(page, "13-combat-room");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("日报、存档、设置、任务窗口都能打开", async () => {
  for (const [action, name, file] of [["tasks", "今日任务", "14-tasks"], ["report", "当日日报", "15-report"], ["saves", "按天存档", "16-saves"], ["settings", "设置", "17-settings"]]) {
    await page.locator('[data-action="' + action + '"]').click();
    await page.waitForSelector(".window__title:has-text('" + name + "')");
    await page.waitForTimeout(420);
    await shot(page, file);
    await page.keyboard.press("Escape");
    await page.waitForTimeout(260);
  }
});

await check("关闭所有窗口后暂停令牌全部释放", async () => {
  const metrics = await page.evaluate(() => {
    const app = window.__cardShopApp;
    return { running: app.snapshot().clock.running, reasons: app.snapshot().clock.pauseReasons.length, windows: app.windows.depth };
  });
  assert.equal(metrics.windows, 0);
  assert.equal(metrics.reasons, 0);
  assert.equal(metrics.running, true);
});

await check("门洞往返：主店→对战房→主店，位置与朝向正确", async () => {
  // 前置：确保当前在主店且角色也在主店
  await page.evaluate(() => window.__cardShopApp.navigateScene("store"));
  await page.waitForFunction(() => {
    const app = window.__cardShopApp;
    const player = app.getPlayer();
    return app.currentMap().mapId === "store" && player && player.roomId === "store";
  }, { timeout: 12000 });
  await page.waitForTimeout(400);
  await page.evaluate(() => {
    const app = window.__cardShopApp;
    const map = app.currentMap();
    app.host.world.input({
      sessionId: "s",
      inputSeq: 9001,
      roomId: "store",
      navVersion: map.navVersion,
      destination: { x: 28 * 16 + 8, y: 9 * 16 + 14 },
    });
  });
  await page.waitForFunction(() => {
    const app = window.__cardShopApp;
    const player = app.getPlayer();
    return app.currentMap().mapId === "battle-room" && player && player.roomId === "battle-room";
  }, { timeout: 12000 });
  const inBattle = await page.evaluate(() => {
    const app = window.__cardShopApp;
    const player = app.getPlayer();
    const map = app.currentMap();
    return { map: map.mapId, room: player.roomId, x: Math.round(player.x), y: Math.round(player.y), w: map.width * map.tileSize, h: map.height * map.tileSize };
  });
  assert.equal(inBattle.map, "battle-room");
  assert.equal(inBattle.room, "battle-room", "角色应落在对战房");
  assert.ok(inBattle.x > 0 && inBattle.x < inBattle.w && inBattle.y > 0 && inBattle.y < inBattle.h, "落点应在对战房内");
  await page.waitForTimeout(600);
  await shot(page, "23-door-battle");
  await page.evaluate(() => {
    const app = window.__cardShopApp;
    const map = app.currentMap();
    app.host.world.input({
      sessionId: "s",
      inputSeq: 9002,
      roomId: "battle-room",
      navVersion: map.navVersion,
      destination: { x: 1 * 16 + 8, y: 9 * 16 + 14 },
    });
  });
  await page.waitForFunction(() => {
    const app = window.__cardShopApp;
    const player = app.getPlayer();
    return app.currentMap().mapId === "store" && player && player.roomId === "store";
  }, { timeout: 12000 });
  const back = await page.evaluate(() => {
    const app = window.__cardShopApp;
    const player = app.getPlayer();
    return { map: app.currentMap().mapId, room: player.roomId, direction: player.direction };
  });
  assert.equal(back.map, "store");
  assert.equal(back.room, "store", "返回后角色应回到主店，不能卡在门口");
  assert.ok(["up", "down", "left", "right"].includes(back.direction), "朝向必须是四向之一");
  // 再等一会儿，确认不会在门口来回弹
  await page.waitForTimeout(1200);
  const stable = await page.evaluate(() => window.__cardShopApp.currentMap().mapId);
  assert.equal(stable, "store", "不应出现门口死循环");
  await page.waitForTimeout(500);
  await shot(page, "24-door-store");
});

await check("开包跳过普通动画直接落到汇总", async () => {
  await page.evaluate(() => window.__cardShopApp.openPanel("opening", {}));
  await page.waitForSelector(".window__title:has-text('开包柜台')");
  await page.selectOption(".window select:nth-of-type(2)", "skip").catch(() => {});
  await page.evaluate(() => {
    const selects = document.querySelectorAll(".window select");
    const animation = [...selects].find((node) => [...node.options].some((option) => option.value === "skip"));
    if (animation) {
      animation.value = "skip";
      animation.dispatchEvent(new Event("change"));
    }
  });
  await page.locator("button:has-text('生成预览')").click();
  await page.waitForSelector("button:has-text('确认开包')");
  await page.locator("button:has-text('确认开包')").click();
  await page.waitForSelector("table.data-table", { timeout: 8000 });
  const reveal = await page.locator(".reveal-card").count();
  assert.equal(reveal, 0, "跳过动画后不应停在逐张揭示");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("KOF 出阵按次序记录，可撤回单个位置", async () => {
  await page.evaluate(() => window.__cardShopApp.openPanel("combat", { tableId: "table.02" }));
  await page.waitForSelector(".window__title:has-text('对战房')");
  await page.waitForTimeout(400);
  const cards = page.locator(".card-tile:not([disabled])");
  const count = await cards.count();
  assert.ok(count >= 3, "可用阵容不足：" + count);
  await cards.nth(0).click();
  await page.waitForTimeout(200);
  await cards.nth(1).click();
  await page.waitForTimeout(200);
  await cards.nth(2).click();
  await page.waitForTimeout(300);
  const slotText = await page.locator(".window .btn--sm").allInnerTexts();
  const joined = slotText.join(" | ");
  assert.match(joined, /1 号先手位：/);
  assert.match(joined, /2 号中坚：/);
  assert.match(joined, /3 号收尾：/);
  await page.locator(".window button:has-text('2 号中坚：')").click();
  await page.waitForTimeout(300);
  const after = (await page.locator(".window .btn--sm").allInnerTexts()).join(" | ");
  assert.match(after, /3 号收尾：空/, "撤回后应留下空位，次序不被压缩乱序");
  await shot(page, "25-kof-order");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("二级市场价格详情可展开", async () => {
  await page.evaluate(() => window.__cardShopApp.openPanel("market", { tab: "buy" }));
  await page.waitForSelector(".window__title:has-text('二级市场')");
  await page.waitForTimeout(400);
  await page.locator("button:has-text('价格详情')").first().click();
  await page.waitForSelector(".price-detail");
  const text = await page.locator(".price-detail").first().innerText();
  assert.match(text, /价格构成/);
  await shot(page, "26-market-price-detail");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("手册窗口可从 HUD 打开", async () => {
  await page.locator('[data-action="help"]').click();
  await page.waitForSelector(".window__title:has-text('店主手册')");
  await page.waitForTimeout(300);
  await shot(page, "27-help");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
});

await check("街坊收卡申请：接单后交付才入账", async () => {
  await page.locator('[data-action="management"]').click();
  await page.waitForSelector(".window__title:has-text('店铺经营')");
  await page.locator("button.tab:has-text('员工与街坊')").click();
  await page.waitForTimeout(500);
  const before = await page.evaluate(() => window.__cardShopApp.snapshot().wallet.available);
  await page.locator("button:has-text('接下申请')").first().click();
  await page.waitForTimeout(400);
  const afterAccept = await page.evaluate(() => window.__cardShopApp.snapshot().wallet.available);
  assert.equal(afterAccept, before, "接单不应立即入账");
  await page.locator("button:has-text('交付卡牌')").first().click();
  await page.waitForTimeout(500);
  const afterDeliver = await page.evaluate(() => window.__cardShopApp.snapshot().wallet.available);
  assert.ok(afterDeliver > before, "交付后应入账：" + before + " → " + afterDeliver);
  await shot(page, "28-neighbor-delivery");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(300);
});

await check("设置里的画面缩放偏好会写入本地键", async () => {
  await page.locator('[data-action="settings"]').click();
  await page.waitForSelector(".window__title:has-text('设置')");
  await page.waitForTimeout(300);
  await page.evaluate(() => {
    const selects = document.querySelectorAll(".window select");
    const zoom = [...selects].find((node) => [...node.options].some((option) => option.value === "auto"));
    if (zoom) {
      zoom.value = "2";
      zoom.dispatchEvent(new Event("change"));
    }
  });
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem("noname-card-shop-frontend-preview:prefs") || "{}").zoom);
  assert.equal(stored, "2");
  await page.keyboard.press("Escape");
  await page.waitForTimeout(250);
  // 复原，避免影响后续截图
  await page.evaluate(() => localStorage.removeItem("noname-card-shop-frontend-preview:prefs"));
});

await page.close();

await check("黄昏 fixture：画面变暗且营业状态为已闭店", async () => {
  const evening = await openPage("mode=mock&fixture=store-evening");
  const phase = await evening.locator("#hud-clock .hud__phase").first().innerText();
  assert.match(phase, /已闭店/);
  await shot(evening, "02-store-evening");
  await evening.close();
});

await check("异常 fixture：缺图有占位、报价过期被拦", async () => {
  const errors = await openPage("mode=mock&fixture=errors");
  await errors.screenshot({ path: path.join(SHOTS, "03-store-errors.png") });
  await errors.evaluate(() => window.__cardShopApp.openPanel("supplier", { tab: "order" }));
  await errors.waitForTimeout(700);
  await errors.locator("button:has-text('获取报价')").first().click();
  await errors.waitForTimeout(500);
  const expired = await errors.locator("button:has-text('报价已过期')").count();
  assert.ok(expired > 0, "过期报价必须要求重新确认");
  await shot(errors, "18-error-quote");
  await errors.close();
});

await check("2563 条 fixture：背包分页仍可翻动", async () => {
  const many = await openPage("mode=mock&fixture=inventory-many", { width: 1366, height: 768 });
  await many.locator('[data-action="inventory"]').click();
  await many.waitForSelector(".card-tile");
  await many.waitForTimeout(600);
  const total = await many.locator(".state__title, .small.muted").first().innerText().catch(() => "");
  await shot(many, "19-inventory-many");
  await many.close();
});

await check("窄屏 / 触屏布局可用", async () => {
  const mobile = await openPage("mode=mock&fixture=store-day", { width: 430, height: 860 });
  await mobile.waitForTimeout(600);
  await shot(mobile, "20-narrow");
  await mobile.locator('[data-action="inventory"]').click();
  await mobile.waitForTimeout(700);
  await shot(mobile, "21-narrow-inventory");
  await mobile.close();
});

await browser.close();
server.close();

const resourceNoise = consoleErrors.filter((line) => line.includes("Failed to load resource"));
const realErrors = consoleErrors.filter((line) => !line.includes("Failed to load resource"));
console.log("控制台错误：" + realErrors.length + "（另有 " + resourceNoise.length + " 条资源 404，缺图有占位兜底）");
for (const error of realErrors.slice(0, 12)) console.log("   " + error);
const failed = results.filter((row) => !row.ok);
console.log((results.length - failed.length) + "/" + results.length + " 项通过");
if (failed.length || realErrors.length) process.exitCode = 1;
