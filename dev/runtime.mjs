import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {startShopServer} from '../server.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function watchedFile(name){const f=String(name).replaceAll('\\','/');return /^(app\.js|battle\.js|shop[^/]*\.js|business-ui\.js|management-ui\.js|save-history-ui\.js|index\.html|legacy\.html|[^/]+\.css|data\/[^/]+\.json|modules\/[^/]+\.js|integration\/(duel|engine-preload)\.js|assets\/shop\/[^/]+|dev\/(client\.js|fixtures\.json|frontend-client\.mjs))$/.test(f)||/^(frontend|assets\/frontend|modules\/backend|contracts)\/.+\.(mjs|js|css|html|json|png|d\.ts)$/.test(f)||/^integration\/[^/]+\.mjs$/.test(f);}
export async function startDevelopmentServer({port=5190,enginePort=5191,watch=true}={}){
  const clients=new Set(),instanceId=crypto.randomUUID();let revision=0,debounce,watcher,changed=new Set();
  const status=()=>({application:'noname-card-shop-development',instanceId,revision,development:true});
  const emit=(type,data)=>{for(const res of clients)res.write(`event: ${type}\ndata: ${JSON.stringify(data)}\n\n`);};
  const interceptRequest=(req,res)=>{
    const route=new URL(req.url,'http://127.0.0.1').pathname;
    if(route==='/__dev/events'){
      res.writeHead(200,{'content-type':'text/event-stream','cache-control':'no-cache','connection':'keep-alive'});res.write(`event: ready\ndata: ${JSON.stringify(status())}\n\n`);clients.add(res);req.on('close',()=>clients.delete(res));return true;
    }
    if(route==='/__dev/status'){res.writeHead(200,{'content-type':'application/json','cache-control':'no-store'});res.end(JSON.stringify(status()));return true;}
    const files={'/__dev/client.js':['dev/client.js','text/javascript'],'/__dev/frontend-client.mjs':['dev/frontend-client.mjs','text/javascript'],'/__dev/fixtures.json':['dev/fixtures.json','application/json']};
    if(files[route]){res.writeHead(200,{'content-type':files[route][1]+'; charset=utf-8','cache-control':'no-store'});fs.createReadStream(path.join(root,files[route][0])).on('error',()=>res.destroy()).pipe(res);return true;}
    if(['/', '/index.html','/frontend/index.html','/legacy.html'].includes(route)){
      res.writeHead(200,{'content-type':'text/html; charset=utf-8','cache-control':'no-store'});
      const client=route==='/legacy.html'?'client.js':'frontend-client.mjs';
      const injection=`<script>window.__CARD_SHOP_DEV__=${JSON.stringify(status())};</script><script type="module" src="/__dev/${client}"></script>`;
      res.end(fs.readFileSync(path.join(root,route==='/'?'index.html':route.slice(1)),'utf8').replace('</body>',injection+'</body>'));return true;
    }
    return false;
  };
  const runtime=await startShopServer({port,enginePort,interceptRequest});
  const notify=names=>{revision++;emit('change',{instanceId,revision,files:names});};
  if(watch)watcher=fs.watch(root,{recursive:true},(_,filename)=>{if(!filename||!watchedFile(filename))return;changed.add(String(filename).replaceAll('\\','/'));clearTimeout(debounce);debounce=setTimeout(()=>{notify([...changed]);changed.clear();},200);});
  const ping=setInterval(()=>{for(const res of clients)res.write(': heartbeat\n\n');},15000);ping.unref();
  return {...runtime,notify,status,close:async()=>{watcher?.close();clearTimeout(debounce);clearInterval(ping);for(const res of clients)res.end();clients.clear();await runtime.close();}};
}
