// tools/frontend-art/probe-perf.mjs — 实测帧与角色负载（只记录，不宣称达标）。
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
  res.writeHead(200, { "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream" });
  fs.createReadStream(file).pipe(res);
});
await new Promise((r) => server.listen(5202, "127.0.0.1", r));
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
await page.goto("http://127.0.0.1:5202/frontend/index.html?mode=mock&fixture=store-day");
await page.waitForFunction("window.__cardShopReady === true", { timeout: 25000 });
await page.waitForTimeout(1200);
const stats = await page.evaluate(async () => {
  const actors = window.__cardShopApp.actors().length;
  let frames = 0;
  const start = performance.now();
  await new Promise((resolve) => {
    const loop = () => {
      frames += 1;
      if (performance.now() - start < 3000) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  const elapsed = performance.now() - start;
  const canvas = document.querySelector("#game-mount canvas");
  return { actors, fps: Math.round((frames / elapsed) * 1000), canvas: canvas ? [canvas.width, canvas.height] : null };
});
console.log(JSON.stringify({ ...stats, viewport: [1440, 900] }));
await browser.close();
server.close();
