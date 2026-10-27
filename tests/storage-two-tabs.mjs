import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const context=await browser.newContext(),a=await context.newPage(),b=await context.newPage(),database='two-tabs-'+Date.now();
  for(const page of [a,b]){await page.goto(server.origin+'/data/backend-rules.json');await page.evaluate(async database=>{const {browserRepository}=await import('/modules/backend/storage.mjs');window.repo=browserRepository(indexedDB,database);},database);}
  await a.evaluate(()=>repo.commit({schemaVersion:2,revision:0,world:{wallet:1000},archives:[],requests:{}},null));
  for(const page of [a,b])await page.evaluate(async()=>{window.base=await repo.read();});
  const results=await Promise.all([a,b].map((page,index)=>page.evaluate(async index=>{const next={...base,revision:1,world:{wallet:1000-(index?400:300)},archives:[{id:'archive-'+index,world:{winner:index}}]};try{await repo.commit(next,0);return {ok:true,index};}catch(e){return {ok:false,index,code:e.code};}},index)));
  assert.equal(results.filter(r=>r.ok).length,1);assert.equal(results.find(r=>!r.ok).code,'CONCURRENT_UPDATE');
  const winner=results.find(r=>r.ok).index,state=await a.evaluate(()=>repo.read());assert.equal(state.world.wallet,winner?600:700);assert.deepEqual(state.archives,[{id:'archive-'+winner,world:{winner}}]);
  const raw=await a.evaluate(database=>new Promise((resolve,reject)=>{const request=indexedDB.open(database);request.onsuccess=()=>{const db=request.result,tx=db.transaction('worlds'),q=tx.objectStore('worlds').getAllKeys();q.onsuccess=()=>{resolve(q.result);db.close();};};request.onerror=()=>reject(request.error);}),database);
  assert.deepEqual(raw.sort(),['active','archive:archive-'+winner].sort(),'losing transaction must not leave an archive orphan');
  for(const page of [a,b])await page.evaluate(()=>repo.close());console.log('PASS real same-origin two-tab concurrent commits: one winner, explicit conflict, exact wallet and no orphan archive.');
}finally{await browser?.close();await server.close();}
