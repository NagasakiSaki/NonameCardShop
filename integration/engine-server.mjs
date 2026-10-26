import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {serveFile} from './http-files.mjs';
import {probeModeCapabilities} from './modes/capabilities.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const ENGINE_ROOT = path.resolve(HERE, "../vendor/noname");

function localPath(name) {
  const resolved = path.resolve(ENGINE_ROOT, name.replaceAll("\\", "/"));
  if (resolved !== ENGINE_ROOT && !resolved.startsWith(ENGINE_ROOT + path.sep)) throw new Error("invalid path");
  if(/^Home(?:\/|$)/i.test(path.relative(ENGINE_ROOT,resolved).replaceAll('\\','/')))throw new Error('invalid path');
  return resolved;
}
function json(res, data, status = 200) {
  res.writeHead(status, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
  res.end(JSON.stringify(data));
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
      } else if(route==='/shop-integration/modes/capabilities.json'){
        res.setHeader('access-control-allow-origin','*');json(res,probeModeCapabilities({engineRoot:ENGINE_ROOT}));
      } else if(route.startsWith('/shop-integration/modes/')){
        const name=route.slice('/shop-integration/modes/'.length);
        if(!['bootstrap.mjs','native-engine.mjs','round-plan.mjs','profiles.mjs','ally-control.mjs'].includes(name)){res.writeHead(404);res.end('not found');return;}
        await serveFile(req,res,path.join(HERE,'modes',name));
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
