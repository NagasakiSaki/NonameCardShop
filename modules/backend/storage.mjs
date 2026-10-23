import {clone, fail} from './common.mjs';

export function memoryRepository(initial=null){
  let record=clone(initial);
  return {
    async read(){return clone(record);},
    async commit(next,expected){if((record?.revision??null)!==expected)fail('CONCURRENT_UPDATE','存档已被另一会话更新，请重新连接。');record=clone(next);},
    close(){}
  };
}

export function browserRepository(indexedDB=globalThis.indexedDB){
  let opening;
  function open(){
    if(!opening)opening=new Promise((resolve,reject)=>{
      if(!indexedDB)return reject(new Error('当前环境不支持新版存档所需的 IndexedDB。'));
      const request=indexedDB.open('noname-card-shop-world-v2',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('worlds');
      request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('存档库被另一页面占用，请关闭旧页面。'));
      request.onsuccess=()=>{request.result.onversionchange=()=>{request.result.close();opening=null;};resolve(request.result);};
    });
    return opening;
  }
  return {
    async read(){const db=await open();return new Promise((resolve,reject)=>{const tx=db.transaction('worlds'),r=tx.objectStore('worlds').get('active');r.onsuccess=()=>resolve(r.result||null);r.onerror=()=>reject(r.error);});},
    async commit(record,expected){
      const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('worlds','readwrite'),store=tx.objectStore('worlds'),read=store.get('active');let conflict=false;
        read.onsuccess=()=>{if((read.result?.revision??null)!==expected){conflict=true;tx.abort();return;}store.put(clone(record),'active');};
        tx.oncomplete=resolve;
        tx.onabort=()=>reject(Object.assign(new Error(conflict?'存档已被另一会话更新，请重新连接。':'存档写入失败，本次操作未提交。'),{code:conflict?'CONCURRENT_UPDATE':'STORAGE_ERROR'}));
        tx.onerror=()=>{};
      });
    },
    async close(){if(opening)(await opening).close();opening=null;}
  };
}

// Only known card-shop keys; never clear the origin or the engine user profile.
export async function clearLegacyShopStorage({localStorage=globalThis.localStorage,indexedDB=globalThis.indexedDB}={}){
  const exact=new Set(['noname-task-config-v1','noname-business-config-v1','noname-dev-before-fixture']);
  const removed=[];
  if(localStorage)for(const key of Object.keys(localStorage))if(key.startsWith('noname-packer-')||key.startsWith('noname-module-')||exact.has(key)){localStorage.removeItem(key);removed.push(key);}
  if(indexedDB)await new Promise(resolve=>{const r=indexedDB.deleteDatabase('noname-card-shop-day-saves-v1');r.onsuccess=()=>resolve();r.onerror=()=>resolve();r.onblocked=()=>resolve();});
  return removed;
}
