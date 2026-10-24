// Startup-only profile registry. Reading this does not connect or tick a world.
import {id,need,clone} from './common.mjs';
import {dayArchiveViews} from './views.mjs';
export const LEGACY_DATABASE='noname-card-shop-world-v2';
export function profileDatabase(profileId='legacy'){
  need(profileId==='legacy'||/^profile-[0-9a-f-]{36}$/.test(profileId),'INVALID_PROFILE','存档编号不合法。');
  return profileId==='legacy'?LEGACY_DATABASE:'noname-card-shop-'+profileId;
}
export function profileRegistry(indexedDB=globalThis.indexedDB){
  let opening;
  const open=()=>opening??=new Promise((resolve,reject)=>{
    if(!indexedDB)return reject(Error('当前浏览器不支持存档。'));
    const r=indexedDB.open('noname-card-shop-profiles-v1',1);r.onupgradeneeded=()=>r.result.createObjectStore('profiles',{keyPath:'profileId'});r.onsuccess=()=>{r.result.onversionchange=()=>{r.result.close();opening=null;};resolve(r.result);};r.onerror=()=>reject(r.error);
  });
  async function metadata(action,input){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('profiles',action==='read'?'readonly':'readwrite'),store=tx.objectStore('profiles');let value,error;
    const r=store.getAll();r.onsuccess=()=>{try{
      if(action==='read'){value=r.result;return;}
      if(action==='put'){need(r.result.some(p=>p.profileId===input.profileId)||r.result.length<20,'PROFILE_LIMIT','最多保留 20 份独立卡店进度。');store.put(input);value=input;}
      if(action==='delete')store.delete(input);
    }catch(e){error=e;tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error||tx.error||Error('存档目录写入失败。'));tx.onerror=()=>{};
  });}
  async function header(profileId){const databaseName=profileDatabase(profileId);return new Promise((resolve,reject)=>{
    const r=indexedDB.open(databaseName,1);r.onupgradeneeded=()=>r.result.createObjectStore('worlds');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('worlds'),read=tx.objectStore('worlds').get('active');let result=null;read.onsuccess=()=>result=read.result||null;tx.oncomplete=()=>{db.close();resolve(result);};tx.onabort=()=>{db.close();reject(tx.error);};};
  });}
  const cleanName=name=>{need(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=32&&!/[\r\n\t]/.test(name),'INVALID_NAME','存档名称须为 1～32 个字符。');return name.trim();};
  async function list(){
    let entries=await metadata('read');const legacy=await header('legacy');
    if(legacy?.world&&!entries.some(p=>p.profileId==='legacy')){const meta={profileId:'legacy',name:'原有卡店',createdAt:Date.now()};await metadata('put',meta);entries=[meta,...entries];}
    return Promise.all(entries.map(async p=>{const record=p.profileId==='legacy'?legacy:await header(p.profileId),w=record?.world;return {...p,worldId:w?.worldId||null,day:w?.clock.day||1,minute:w?.clock.minute??480,phase:w?.clock.phase||'new',cash:w?.wallet.available??null,revision:record?.revision??null,days:dayArchiveViews(record?.archives||[],w?.branchId,w?.branchLineage).length};}));
  }
  return {
    list,
    async get(profileId){profileDatabase(profileId);return (await metadata('read')).find(p=>p.profileId===profileId)||null;},
    async create(name){const meta={profileId:id('profile'),name:cleanName(name),createdAt:Date.now()};await metadata('put',meta);return clone(meta);},
    async rename(profileId,name){profileDatabase(profileId);const p=(await metadata('read')).find(p=>p.profileId===profileId);need(p,'NOT_FOUND','这份存档不存在。');return metadata('put',{...p,name:cleanName(name)});},
    async days(profileId){const record=await header(profileId);return dayArchiveViews(record?.archives||[],record?.world?.branchId,record?.world?.branchLineage);},
    async remove(profileId){
      const name=profileDatabase(profileId),p=(await metadata('read')).find(p=>p.profileId===profileId);need(p,'NOT_FOUND','这份存档不存在。');
      // Clear only this profile's store. Concurrent old sessions then fail their revision
      // check instead of recreating deleted data; no cross-profile/origin clearing.
      await new Promise((resolve,reject)=>{const r=indexedDB.open(name,1);r.onupgradeneeded=()=>r.result.createObjectStore('worlds');r.onerror=()=>reject(r.error);r.onsuccess=()=>{const db=r.result,tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').clear();tx.oncomplete=()=>{db.close();resolve();};tx.onabort=()=>{db.close();reject(tx.error);};};});await metadata('delete',profileId);
    },
    async close(){if(opening)(await opening).close();opening=null;}
  };
}
