import fs from "node:fs";
import path from "node:path";
import http from "node:http";
import { chromium } from "playwright";
const ROOT = process.cwd();
const MIME = { ".html": "text/html; charset=utf-8", ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8", ".json": "application/json; charset=utf-8", ".png": "image/png", ".jpg": "image/jpeg" };
const server = http.createServer((req, res) => {
  const url = decodeURIComponent((req.url || "/").split("?")[0]);
  const file = url.startsWith("/img/") ? path.join(ROOT, "assets/character", path.basename(url)) : path.join(ROOT, url === "/" ? "index.html" : url.slice(1));
  if (!fs.existsSync(file) || fs.statSync(file).isDirectory()) { res.writeHead(404); res.end("no"); return; }
  res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream", "cache-control": "no-cache" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(5201, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
const errors = [];
page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 300)); });
page.on("pageerror", (e) => errors.push("pageerror: " + e.message.slice(0, 300)));
await page.goto("http://127.0.0.1:5201/frontend/index.html?mode=host", { waitUntil: "domcontentloaded" });
let ready = false;
try { await page.waitForFunction("window.__cardShopReady === true", { timeout: 25000 }); ready = true; } catch {}
await page.waitForTimeout(1500);
const boot = await page.locator("#boot").innerText().catch(() => "");
const detail = await page.evaluate(() => {
  const app = window.__cardShopApp;
  if (!app) return null;
  const snapshot = app.snapshot();
  return { clock: snapshot.clock, wallet: snapshot.wallet, actors: (app.actors() || []).length, hasBattleMount: !!(app.host.battle && app.host.battle.mount) };
});
await page.screenshot({ path: "docs/frontend-handoff/screenshots/22-host-mode.png" });
console.log("ready:", ready);
console.log("boot:", boot.replace(/\n+/g, " | ").slice(0, 300));
console.log("state:", JSON.stringify(detail));
console.log("errors:", errors.length);
for (const e of errors.slice(0, 8)) console.log("  ", e);
await browser.close();
server.close();
