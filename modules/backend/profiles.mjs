// Startup-only profile registry. Reading this does not connect or tick a world.
import {id,need,clone} from './common.mjs';
import {dayArchiveViews} from './views.mjs';
import {databaseConnection} from './indexed-db.mjs';
export const LEGACY_DATABASE='noname-card-shop-world-v2';
export function profileDatabase(profileId='legacy'){
  need(profileId==='legacy'||/^profile-[0-9a-f-]{36}$/.test(profileId),'INVALID_PROFILE','存档编号不合法。');
  return profileId==='legacy'?LEGACY_DATABASE:'noname-card-shop-'+profileId;
}
export function profileRegistry(indexedDB=globalThis.indexedDB){
  const connection=databaseConnection(indexedDB,'noname-card-shop-profiles-v1',db=>db.createObjectStore('profiles',{keyPath:'profileId'}));
  const open=()=>connection.open();
  async function metadata(action,input){const db=await open();return new Promise((resolve,reject)=>{
    const tx=db.transaction('profiles',action==='read'?'readonly':'readwrite'),store=tx.objectStore('profiles');let value,error;
    const r=store.getAll();r.onsuccess=()=>{try{
      if(action==='read'){value=r.result;return;}
      if(action==='put'){need(r.result.some(p=>p.profileId===input.profileId)||r.result.length<20,'PROFILE_LIMIT','最多保留 20 份独立卡店进度。');store.put(input);value=input;}
      if(action==='delete')store.delete(input);
    }catch(e){error=e;tx.abort();}};tx.oncomplete=()=>resolve(value);tx.onabort=()=>reject(error||tx.error||Error('存档目录写入失败。'));tx.onerror=()=>{};
  });}
  async function header(profileId){const c=databaseConnection(indexedDB,profileDatabase(profileId),db=>db.createObjectStore('worlds'));try{const db=await c.open();return await new Promise((resolve,reject)=>{
    const tx=db.transaction('worlds'),read=tx.objectStore('worlds').get('active');let result=null;read.onsuccess=()=>result=read.result||null;tx.oncomplete=()=>resolve(result);tx.onabort=()=>reject(tx.error);
  });}finally{await c.close();}}
  // 单个存档库打不开（被别的页面占用、磁盘错误、结构损坏）不能拖垮整个目录：
  // 只把这一条标成不可读，其他卡店照常列出，也不清理它的数据。
  async function readHeader(profileId){
    try{return {ok:true,record:await header(profileId)};}
    catch(error){return {ok:false,error:{code:error?.code||'STORAGE_ERROR',message:error?.message||'存档读取失败。'}};}
  }
  const dayCount=record=>{try{return dayArchiveViews(record?.archives||[],record?.world?.branchId,record?.world?.branchLineage).length;}catch{return 0;}};
  const cleanName=name=>{need(typeof name==='string'&&name.trim().length>=1&&name.trim().length<=32&&!/[\r\n\t]/.test(name),'INVALID_NAME','存档名称须为 1～32 个字符。');return name.trim();};
  async function list(){
    let entries=await metadata('read');const legacyRead=await readHeader('legacy'),legacy=legacyRead.ok?legacyRead.record:null;
    if(legacy?.world&&!entries.some(p=>p.profileId==='legacy')){const meta={profileId:'legacy',name:'原有卡店',createdAt:Date.now()};await metadata('put',meta);entries=[meta,...entries];}
    return Promise.all(entries.map(async p=>{
      const read=p.profileId==='legacy'?legacyRead:await readHeader(p.profileId);
      if(!read.ok)return {...p,ok:false,unreadable:read.error.code,message:read.error.message,worldId:null,day:1,minute:480,phase:'unreadable',cash:null,revision:null,days:0};
      const record=read.record,w=record?.world;
      return {...p,ok:true,worldId:w?.worldId||null,day:w?.clock.day||1,minute:w?.clock.minute??480,phase:w?.clock.phase||'new',cash:w?.wallet.available??null,revision:record?.revision??null,days:dayCount(record)};
    }));
  }
  return {
    list,
    async get(profileId){profileDatabase(profileId);return (await metadata('read')).find(p=>p.profileId===profileId)||null;},
    async create(name){const meta={profileId:id('profile'),name:cleanName(name),createdAt:Date.now()};await metadata('put',meta);return clone(meta);},
    async rename(profileId,name){profileDatabase(profileId);const p=(await metadata('read')).find(p=>p.profileId===profileId);need(p,'NOT_FOUND','这份存档不存在。');return metadata('put',{...p,name:cleanName(name)});},
    async days(profileId){const record=await header(profileId);return dayArchiveViews(record?.archives||[],record?.world?.branchId,record?.world?.branchLineage);},    async remove(profileId){
      const name=profileDatabase(profileId),p=(await metadata('read')).find(p=>p.profileId===profileId);need(p,'NOT_FOUND','这份存档不存在。');
      // Clear only this profile's store. Concurrent old sessions then fail their revision
      // check instead of recreating deleted data; no cross-profile/origin clearing.
      const c=databaseConnection(indexedDB,name,db=>db.createObjectStore('worlds'));try{const db=await c.open();await new Promise((resolve,reject)=>{const tx=db.transaction('worlds','readwrite');tx.objectStore('worlds').clear();tx.oncomplete=()=>resolve();tx.onabort=()=>reject(tx.error);});}finally{await c.close();}await metadata('delete',profileId);
    },
    close:()=>connection.close()
  };
}
