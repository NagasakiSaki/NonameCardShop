import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.resolve(HERE, "../vendor/noname");
const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp4": "video/mp4",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm",
};

function localPath(name) {
  const resolved = path.resolve(ENGINE_ROOT, name.replaceAll("\\", "/"));
  if (resolved !== ENGINE_ROOT && !resolved.startsWith(ENGINE_ROOT + path.sep)) throw new Error("invalid path");
  return resolved;
}
function json(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
}
async function serveFile(req, res, file) {
  let stat;
  try { stat = await fs.promises.stat(file); } catch { res.writeHead(404); res.end("not found"); return; }
  if (!stat.isFile()) { res.writeHead(404); res.end("not a file"); return; }
  const headers = {
    "content-type": MIME[path.extname(file).toLowerCase()] || "application/octet-stream",
    "content-length": stat.size, "accept-ranges": "bytes", "cache-control": "no-cache",
  };
  const range = req.headers.range?.match(/^bytes=(\d*)-(\d*)$/);
  let start = 0, end = stat.size - 1, status = 200;
  if (req.headers.range) {
    if (!range || (!range[1] && !range[2])) { res.writeHead(416, {"content-range": `bytes */${stat.size}`}); res.end(); return; }
    start = range[1] ? Number(range[1]) : Math.max(0, stat.size - Number(range[2]));
    end = range[1] && range[2] ? Math.min(Number(range[2]), end) : end;
    if (start > end || start >= stat.size) { res.writeHead(416, {"content-range": `bytes */${stat.size}`}); res.end(); return; }
    status = 206;
    headers["content-range"] = `bytes ${start}-${end}/${stat.size}`;
    headers["content-length"] = end - start + 1;
  }
  res.writeHead(status, headers);
  if (req.method === "HEAD" || !stat.size) { res.end(); return; }
  const stream = fs.createReadStream(file, { start, end });
  stream.on("error", () => res.destroy());
  res.on("close", () => stream.destroy());
  stream.pipe(res);
}

export function createEngineServer() {
  return http.createServer(async (req, res) => {
    try {
      if (!["GET", "HEAD"].includes(req.method)) { json(res, { success: false, errorMsg: "unsupported operation" }, 405); return; }
      const url = new URL(req.url, "http://127.0.0.1");
      const route = decodeURIComponent(url.pathname);
      // These are the original browser adapter's read-only filesystem APIs.
      if (route === "/checkFile") {
        const file = localPath(url.searchParams.get("fileName") || ".");
        const stat = await fs.promises.stat(file).catch(() => null);
        json(res, { success: true, data: stat?.isFile() ? "file" : stat?.isDirectory() ? "directory" : null });
      } else if (route === "/getFileList") {
        const entries = await fs.promises.readdir(localPath(url.searchParams.get("dir") || "."), { withFileTypes: true });
        json(res, { success: true, data: { folders: entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name), files: entries.filter((entry) => entry.isFile()).map((entry) => entry.name) } });
      } else if (route === "/readFile") {
        const buffer = await fs.promises.readFile(localPath(url.searchParams.get("fileName") || ""));
        json(res, { success: true, data: buffer.toString("base64") });
      } else if (route === "/preload.js") {
        await serveFile(req, res, path.join(HERE, "engine-preload.js"));
      } else if (route === "/shop-integration/duel.js") {
        await serveFile(req, res, path.join(HERE, "duel.js"));
      } else if (route === "/vue") {
        // The installed HTML contains bare module script URLs as well as its import map.
        await serveFile(req, res, localPath("node_modules/.pnpm/vue@3.5.28/node_modules/vue/dist/vue.esm-browser.js"));
      } else {
        await serveFile(req, res, localPath(route === "/" ? "index.html" : `.${route}`));
      }
    } catch (error) {
      json(res, { success: false, errorMsg: error.message }, error.message === "invalid path" ? 403 : 400);
    }
  });
}
