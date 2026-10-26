import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage();await page.goto(server.origin+'/frontend/index.html?mode=mock');
  const result=await page.evaluate(async()=>{
    const {databaseConnection}=await import('/modules/backend/indexed-db.mjs');
    const {browserRepository}=await import('/modules/backend/storage.mjs');
    const {profileRegistry}=await import('/modules/backend/profiles.mjs');
    let calls=0;const retryable={open(...args){if(++calls===1)throw Error('temporary open failure');return indexedDB.open(...args);}};
    const repository=browserRepository(retryable,'retry-world');let first=false;
    try{await repository.read();}catch{first=true;}const read=await repository.read();await repository.close();
    let registryCalls=0;const registry=profileRegistry({open(...args){if(++registryCalls===1)throw Error('temporary registry failure');return indexedDB.open(...args);}});
    let registryFailed=false;try{await registry.get('legacy');}catch{registryFailed=true;}const profile=await registry.get('legacy');await registry.close();
    const requests=[],fake={open(){const r={result:{close(){r.closed=true;}}};requests.push(r);return r;}};
    const connection=databaseConnection(fake,'blocked',()=>{});const blocked=connection.open().catch(e=>e.message);requests[0].onblocked();const blockedMessage=await blocked;
    const second=connection.open();requests[0].onsuccess();requests[1].onsuccess();await second;await connection.close();
    const closing=databaseConnection(fake,'cancel-during-open',()=>{}),opening=closing.open().then(()=>false,()=>true);await closing.close();requests[2].onsuccess();const cancelled=await opening;
    return {first,read,registryFailed,profile,blocked:blockedMessage.includes('占用'),oldClosed:requests[0].closed,newClosed:requests[1].closed,calls,cancelled,cancelledClosed:requests[2].closed};
  });
  assert.deepEqual(result,{first:true,read:null,registryFailed:true,profile:null,blocked:true,oldClosed:true,newClosed:true,calls:2,cancelled:true,cancelledClosed:true});
  console.log('PASS world/profile open retries, blocked-request cleanup and successful connection teardown; isolated browser storage');
}finally{await browser?.close();await server.close();}
