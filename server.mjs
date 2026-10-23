import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createEngineServer, ENGINE_ROOT } from "./integration/engine-server.mjs";

const ROOT = path.dirname(fileURLToPath(import.meta.url));
const IMG_DIR = fs.existsSync(path.join(ENGINE_ROOT, "image/character")) ? path.join(ENGINE_ROOT, "image/character") : path.join(ROOT, "assets/character");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
};

function send(res, file, type) {
  fs.readFile(file, (err, buf) => {
    if (err) {
      res.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      res.end("not found");
      return;
    }
    res.writeHead(200, { "content-type": type || "application/octet-stream", "cache-control": "no-cache" });
    res.end(buf);
  });
}

export async function startShopServer({port=Number(process.env.PORT||5174),enginePort=Number(process.env.ENGINE_PORT||port+1),interceptRequest=null}={}) {
const engineServer = createEngineServer();
const server = http.createServer((req, res) => {
  if(interceptRequest?.(req,res))return;
  let url;
  try { url = decodeURIComponent((req.url || "/").split("?")[0]); }
  catch { res.writeHead(400); return res.end("bad request"); }

  if (url === "/api/runtime") {
    res.writeHead(200, { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" });
    return res.end(JSON.stringify({ version: "1.11.6", integrationVersion:2, engineOrigin: `http://127.0.0.1:${engineServer.address()?.port}`, ready: engineServer.listening && fs.existsSync(path.join(ENGINE_ROOT, "noname/entry.js")) }));
  }

  if (url.startsWith("/img/")) {
    const name = path.basename(url);
    const file = path.join(IMG_DIR, name);
    if (fs.existsSync(file)) return send(res, file, MIME[path.extname(file).toLowerCase()]);
    res.writeHead(404, { "content-type": "text/plain" });
    return res.end("no image");
  }

  if (url === "/") url = "/index.html";
  const file = path.resolve(ROOT, `.${url}`);
  if (file !== ROOT && !file.startsWith(ROOT + path.sep)) {
    res.writeHead(403);
    return res.end("forbidden");
  }
  const relative=path.relative(ROOT,file).replaceAll('\\','/');
  if(relative.split('/').some(part=>part.startsWith('.'))||/^(desktop|node_modules|test-results|dev|tests)(\/|$)/.test(relative)||/^vendor\/noname\/Home(?:\/|$)/i.test(relative)){
    res.writeHead(404);return res.end('not found');
  }
  send(res, file, MIME[path.extname(file).toLowerCase()]);
});

const listen=(s,p)=>new Promise((resolve,reject)=>{const failed=e=>{s.removeListener('listening',ready);reject(e);};const ready=()=>{s.removeListener('error',failed);resolve();};s.once('error',failed);s.once('listening',ready);s.listen(p,'127.0.0.1');});
const closeOne=s=>new Promise(resolve=>{if(!s.listening)return resolve();s.close(resolve);s.closeAllConnections?.();});
try{await listen(engineServer,enginePort);await listen(server,port);}catch(error){await Promise.all([closeOne(server),closeOne(engineServer)]);throw error;}
const origin=`http://127.0.0.1:${server.address().port}`,engineOrigin=`http://127.0.0.1:${engineServer.address().port}`;
return {origin,engineOrigin,server,engineServer,close:()=>Promise.all([closeOne(server),closeOne(engineServer)])};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  startShopServer().then(runtime=>{console.log(`无名卡店 → ${runtime.origin}`);console.log(`图片目录 → ${IMG_DIR}`);console.log(`无名杀原版引擎 → ${runtime.engineOrigin}`);}).catch(error=>{console.error(`本地服务启动失败：${error.message}`);process.exitCode=1;});
}
