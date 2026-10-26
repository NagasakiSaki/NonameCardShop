// Shared streaming static-file transport for the shop and upstream engine.
import fs from 'node:fs';
import path from 'node:path';
export const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".ts": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".gif": "image/gif",
  ".webp": "image/webp", ".svg": "image/svg+xml", ".ico": "image/x-icon",
  ".mp3": "audio/mpeg", ".ogg": "audio/ogg", ".wav": "audio/wav", ".mp4": "video/mp4",
  ".woff": "font/woff", ".woff2": "font/woff2", ".ttf": "font/ttf", ".wasm": "application/wasm",
};

export async function serveFile(req, res, file) {
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
