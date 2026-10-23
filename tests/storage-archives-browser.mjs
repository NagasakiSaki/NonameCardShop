import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const server=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(req.url!=='/__storage_test__')return false;res.writeHead(200,{'content-type':'text/html'});res.end('<!doctype html><title>storage test</title>');return true;}});let browser;
try{
 browser=await chromium.launch();const page=await browser.newPage();await page.goto(server.origin+'/__storage_test__');
 const result=await page.evaluate(async()=>{
  const {browserRepository}=await import('/modules/backend/storage.mjs');const repo=browserRepository();await repo.read();
  const open=()=>new Promise((resolve,reject)=>{const r=indexedDB.open('noname-card-shop-world-v2',1);r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
  const raw=await open(),tx=raw.transaction('worlds','readwrite');tx.objectStore('worlds').put({revision:0,world:{day:1},archives:[{id:'old-inline',world:{cards:['kept'],wallet:1200}}],requests:{}},'active');await new Promise((r,j)=>{tx.oncomplete=r;tx.onabort=j;});raw.close();
  const record=await repo.read();record.revision=1;await repo.commit(record,0);
  const db=await open(),load=(key)=>new Promise((r,j)=>{const t=db.transaction('worlds'),q=t.objectStore('worlds').get(key);q.onsuccess=()=>r(q.result);q.onerror=j;});
  const active=await load('active'),separate=await load('archive:old-inline');
  record.revision=2;record.world.day=2;await repo.commit(record,1);await repo.close();
  const second=browserRepository(),restored=await second.read();let conflict=false;try{await second.commit({...restored,revision:3,archives:[...restored.archives,{id:'should-not-exist',world:{}}]},0);}catch(e){conflict=e.code==='CONCURRENT_UPDATE';}
  const orphan=await load('archive:should-not-exist');
  const next={...restored,revision:3,archives:[]};await second.commit(next,2);const pruned=await load('archive:old-inline');
  db.close();await second.close();
  return {metadataOnly:active.archiveStorage===1&&!active.archives[0].world,original:separate.world,restored:restored.archives[0].world,current:restored.world,conflict,orphan:!!orphan,pruned:!!pruned};
 });
 assert.deepEqual(result,{metadataOnly:true,original:{cards:['kept'],wallet:1200},restored:{cards:['kept'],wallet:1200},current:{day:2},conflict:true,orphan:false,pruned:false});
 console.log('PASS archive storage: inline legacy migration, immutable snapshots outside active ticks, reconnect hydration, atomic conflicts without orphans and pruning.');
}finally{await browser?.close();await server.close();}
