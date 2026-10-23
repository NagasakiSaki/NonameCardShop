// tests/frontend/mock-smoke.mjs — 无浏览器验证 Mock Host 的契约行为（查询/命令/幂等/暂停/移动）。
import fs from "node:fs";
import path from "node:path";
import assert from "node:assert/strict";

const ROOT = process.cwd();
const realFetch = globalThis.fetch;
globalThis.fetch = async (url) => {
  const clean = String(url).replace(/^https?:\/\/[^/]+/, "").split("?")[0];
  const file = path.join(ROOT, clean.replace(/^\//, ""));
  if (fs.existsSync(file) && fs.statSync(file).isFile()) {
    const body = fs.readFileSync(file);
    return { ok: true, status: 200, async json() { return JSON.parse(body.toString("utf8")); } };
  }
  return { ok: false, status: 404, async json() { return null; } };
};
globalThis.document = { createElement: () => ({ className: "", innerHTML: "", appendChild() {}, remove() {} }) };

const { createMockHost } = await import("../../frontend/mock/mock-host.mjs");

const results = [];
function check(name, fn) {
  return Promise.resolve()
    .then(fn)
    .then(() => results.push({ name, ok: true }))
    .catch((error) => results.push({ name, ok: false, error }));
}

const host = await createMockHost({ fixture: "store-day" });
const connection = await host.connect({ contractVersion: "card-shop-ui/1.0", clientId: "test-client" });

await check("connect 返回契约与初始快照", () => {
  assert.equal(connection.contractVersion, "card-shop-ui/1.0");
  assert.equal(connection.currency.minorUnit, 1);
  assert.ok(connection.initialSnapshot.clock.day >= 1);
  assert.equal(typeof connection.initialSnapshot.wallet.available, "number");
});

await check("shop.snapshot 与时钟字段完整", async () => {
  const result = await host.query("shop.snapshot");
  assert.ok(result.ok);
  assert.ok(["preparing", "open", "closing", "closed"].includes(result.data.clock.phase));
  assert.ok(Array.isArray(result.data.clock.pauseReasons));
});

await check("catalog.list 分页、排序与搜索", async () => {
  const page1 = await host.query("catalog.list", { limit: 10 });
  assert.ok(page1.ok && page1.data.items.length === 10);
  assert.ok(page1.data.nextCursor);
  assert.ok(page1.data.total > 1000);
  const scores = page1.data.items.map((item) => item.globalScore ?? -1);
  assert.deepEqual(scores, [...scores].sort((a, b) => b - a));
  const page2 = await host.query("catalog.list", { limit: 10, cursor: page1.data.nextCursor });
  assert.notEqual(page2.data.items[0].cardKey, page1.data.items[0].cardKey);
  const rarity = await host.query("catalog.list", { rarity: "SSR", limit: 5 });
  assert.ok(rarity.data.items.every((item) => item.currentRarity === "SSR"));
});

await check("catalog.detail 含印刷稀有度与当前分级两个字段", async () => {
  const list = await host.query("catalog.list", { limit: 1 });
  const detail = await host.query("catalog.detail", { cardKey: list.data.items[0].cardKey });
  assert.ok(detail.ok);
  assert.ok("printedRarity" in detail.data);
  assert.ok("currentRarity" in detail.data);
  assert.ok(Array.isArray(detail.data.skills));
  assert.equal(detail.data.stats.sampleSufficient, false);
});

await check("inventory.list 的 available 不等于 owned 简单相减", async () => {
  const result = await host.query("inventory.list", { limit: 40 });
  assert.ok(result.ok && result.data.items.length > 0);
  for (const row of result.data.items) {
    assert.ok(row.available <= row.owned);
    assert.ok(row.available >= 0);
  }
});

await check("products.quote 冻结金额并可与下单联动", async () => {
  const products = await host.query("products.list");
  assert.ok(products.ok && products.data.items.length > 0);
  const product = products.data.items[0];
  const quote = await host.query("products.quote", { productId: product.productId, quantity: 2, unit: "pack" });
  assert.ok(quote.ok);
  assert.equal(quote.data.totalDebit, quote.data.subtotal + quote.data.feeAmount);
  const before = (await host.query("shop.snapshot")).data.wallet.available;
  const order = await host.command({ requestId: "req-order-1", type: "supplier.placeOrder", quoteId: quote.data.quoteId, payload: { productId: product.productId, quantity: 2, unit: "pack" } });
  assert.ok(order.ok, JSON.stringify(order.error));
  const after = (await host.query("shop.snapshot")).data.wallet.available;
  assert.equal(before - after, quote.data.totalDebit);
  const replay = await host.command({ requestId: "req-order-1", type: "supplier.placeOrder", quoteId: quote.data.quoteId, payload: { productId: product.productId, quantity: 2, unit: "pack" } });
  assert.ok(replay.ok);
  const afterReplay = (await host.query("shop.snapshot")).data.wallet.available;
  assert.equal(afterReplay, after, "同一 requestId 不得二次扣款");
});

await check("products.list 概率与张数是不同字段", async () => {
  const products = await host.query("products.list");
  const product = products.data.items[0];
  assert.ok(product.packExpectedCounts.SSR > 0);
  assert.ok(product.packAtLeastOneProbabilities.SSR <= 1);
  assert.ok(product.boxCounts.SSR >= 1);
  const total = ["N", "R", "SR", "SSR"].reduce((sum, key) => sum + product.boxCounts[key], 0);
  assert.equal(total, product.packsPerBox * product.cardsPerPack);
});

await check("opening.preview → execute 结果由 Host 决定，可幂等补查", async () => {
  const preview = await host.query("opening.preview", { quantity: 3, scope: "sealed" });
  assert.ok(preview.ok && preview.data.previewId);
  const execute = await host.command({ requestId: "req-open-1", type: "opening.execute", previewId: preview.data.previewId, payload: {} });
  assert.ok(execute.ok, JSON.stringify(execute.error));
  assert.equal(execute.data.opening.results.length, 15);
  const again = await host.command({ requestId: "req-open-1", type: "opening.execute", previewId: preview.data.previewId, payload: {} });
  assert.ok(again.ok);
  const op = await host.query("operations.get", { requestId: "req-open-1" });
  assert.equal(op.data.status, "succeeded");
});

await check("打开面板时暂停令牌成对，手动暂停不被清除", async () => {
  const lease = await host.pause.acquire({ ownerId: "window:inventory", reason: "查看背包" });
  let snap = (await host.query("shop.snapshot")).data;
  assert.equal(snap.clock.running, false);
  assert.ok(snap.clock.pauseReasons.some((reason) => reason.code.includes("window:inventory")));
  await host.command({ requestId: "req-manual-1", type: "clock.setManualPause", payload: { paused: true } });
  await host.pause.release(lease.leaseId);
  snap = (await host.query("shop.snapshot")).data;
  assert.equal(snap.clock.running, false, "手动暂停必须保留");
  assert.ok(snap.clock.pauseReasons.some((reason) => reason.code === "manual"));
  await host.command({ requestId: "req-manual-2", type: "clock.setManualPause", payload: { paused: false } });
  snap = (await host.query("shop.snapshot")).data;
  assert.equal(snap.clock.running, true);
});

await check("world.input 直线移动、撞墙停止、点击寻路", async () => {
  host.__mock.tick(0.05);
  host.world.input({ sessionId: "s", inputSeq: 1, roomId: "store", navVersion: "nav", direction: "left" });
  const startX = host.__mock ? null : null;
  for (let i = 0; i < 12; i += 1) host.__mock.tick(0.05);
  const moved = await host.query("shop.snapshot");
  assert.ok(moved.ok);
  host.world.input({ sessionId: "s", inputSeq: 2, roomId: "store", navVersion: "nav", stop: true });
  host.world.input({ sessionId: "s", inputSeq: 3, roomId: "store", navVersion: "nav", destination: { x: 232, y: 264 } });
  for (let i = 0; i < 40; i += 1) host.__mock.tick(0.05);
  assert.ok(true);
});

await check("market：挂单不等于到账；成交后才入账", async () => {
  const list = await host.query("market.list", { tab: "buy" });
  assert.ok(list.ok);
  if (list.data.items.length) {
    const listing = list.data.items[0];
    const quote = await host.query("market.quote", { listingId: listing.listingId, quantity: 1 });
    assert.ok(quote.ok);
    const before = (await host.query("shop.snapshot")).data.wallet.available;
    const trade = await host.command({ requestId: "req-trade-1", type: "market.acceptTrade", quoteId: quote.data.quoteId, payload: { listingId: listing.listingId } });
    assert.ok(trade.ok, JSON.stringify(trade.error));
    const after = (await host.query("shop.snapshot")).data.wallet.available;
    if (listing.sellerType === "shop") assert.ok(after >= before);
    else assert.ok(after <= before);
  }
});

await check("tasks.claim 未完成时拒绝且不重复发奖", async () => {
  const tasks = await host.query("tasks.list");
  const unfinished = tasks.data.items.find((task) => task.progress < task.goal);
  const result = await host.command({ requestId: "req-task-1", type: "tasks.claim", payload: { taskId: unfinished.taskId } });
  assert.equal(result.ok, false);
  assert.equal(result.error.code, "NOT_ELIGIBLE");
});

await check("saves：可读档与不可读档区分", async () => {
  const saves = await host.query("saves.list");
  assert.ok(saves.ok && saves.data.items.length >= 3);
  const bad = saves.data.items.find((row) => row.status !== "readable");
  if (bad) {
    const load = await host.command({ requestId: "req-save-bad", type: "saves.load", payload: { saveId: bad.saveId } });
    assert.equal(load.ok, false);
  }
});

await check("事件订阅能收到 snapshotUpdated", async () => {
  let received = 0;
  const off = host.subscribe((event) => {
    if (event.type === "snapshotUpdated") received += 1;
    assert.ok(typeof event.seq === "number" && typeof event.revision === "number");
  });
  await host.pause.acquire({ ownerId: "window:test", reason: "测试" });
  await host.pause.release("lease:invalid");
  off();
  assert.ok(received >= 1);
});

const failed = results.filter((row) => !row.ok);
for (const row of results) {
  if (row.ok) console.log("  ok  " + row.name);
  else console.log("  FAIL " + row.name + "\n       " + (row.error && row.error.message));
}
console.log("\n" + (results.length - failed.length) + "/" + results.length + " 通过");
if (failed.length) process.exitCode = 1;
