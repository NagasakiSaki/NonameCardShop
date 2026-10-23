import assert from 'node:assert/strict';
import net from 'node:net';
import {startShopServer} from '../server.mjs';
const runtime=await startShopServer({port:0,enginePort:0});
try{
  assert.equal((await fetch(runtime.origin+'/api/runtime').then(r=>r.json())).engineOrigin,runtime.engineOrigin);
  const html=await fetch(runtime.origin).then(r=>r.text());assert.ok(!html.includes('__CARD_SHOP_DEV__'));
  for(const file of ['/.git/config','/.local/desktop-dev/desktop.log','/desktop/main.cjs','/node_modules/noname/index.js','/tests/helpers.cjs','/dev/fixtures.json','/%2egit/config'])assert.equal((await fetch(runtime.origin+file)).status,404,file);
  assert.equal((await fetch(runtime.engineOrigin+'/noname/entry.js')).status,200);
  for(const file of ['/Home/UserData/Preferences','/home/UserData/Preferences','/readFile?fileName=Home/UserData/Preferences','/getFileList?dir=Home/UserData'])assert.equal((await fetch(runtime.engineOrigin+file)).status,403,file);
  assert.equal((await fetch(runtime.origin+'/vendor/noname/Home/UserData/Preferences')).status,404);
  await assert.rejects(startShopServer({port:Number(new URL(runtime.origin).port),enginePort:0}),{code:'EADDRINUSE'});
}finally{await runtime.close();}
for(const origin of [runtime.origin,runtime.engineOrigin])await assert.rejects(fetch(origin));
// Failure while starting the UI must also release the already opened engine port.
const enginePort=Number(new URL(runtime.engineOrigin).port),occupied=net.createServer();await new Promise(resolve=>occupied.listen(0,'127.0.0.1',resolve));
try{await assert.rejects(startShopServer({port:occupied.address().port,enginePort}),{code:'EADDRINUSE'});const retry=await startShopServer({port:0,enginePort});await retry.close();}finally{await new Promise(resolve=>occupied.close(resolve));}
console.log('PASS server: runtime, private files, production HTML, engine, occupied ports, rollback and shutdown.');
