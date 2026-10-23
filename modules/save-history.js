/* IndexedDB holds daily snapshots outside the frequently written localStorage save. */
window.ShopHistory=(()=>{
  const VERSION=1,DB_NAME='noname-card-shop-day-saves-v1';
  function validateConfig(config){return config?.version===1&&Number.isInteger(config.maxDaysPerCampaign)&&config.maxDaysPerCampaign>=1&&config.maxDaysPerCampaign<=365&&Number.isInteger(config.maxBeforeLoadBackups)&&config.maxBeforeLoadBackups>=1&&config.maxBeforeLoadBackups<=100?[]:['存档保留策略不合法'];}
  function validateRecord(record){
    if(record?.format!=='noname-shop-day-save'||record.version!==VERSION)throw new Error('不支持的按天存档格式或版本。');
    if(typeof record.id!=='string'||typeof record.campaignId!=='string'||!Number.isSafeInteger(record.day)||record.day<1||!['start','close','manual','before-load'].includes(record.slot)||!Number.isFinite(record.createdAt)||!record.save?.shop||!record.save?.collection||record.save.business?.day!==record.day||!record.rules?.business||!record.rules?.tasks||!Array.isArray(record.rules?.modules))throw new Error('按天存档内容不完整。');
    return record;
  }
  function metadata(record){const {save,rules,...meta}=record;return meta;}
  function createRepository({indexedDB=window.indexedDB,name=DB_NAME}={}){
    let opening;
    function open(){
      if(!indexedDB)return Promise.reject(new Error('此环境不支持 IndexedDB，按天档案未写入；当前进度仍使用原有存档。'));
      if(!opening)opening=new Promise((resolve,reject)=>{
        const request=indexedDB.open(name,1);
        request.onupgradeneeded=()=>{request.result.createObjectStore('checkpoints',{keyPath:'id'});};
        request.onerror=()=>{opening=null;reject(request.error||new Error('无法打开按天档案库。'));};
        request.onblocked=()=>{opening=null;reject(new Error('按天档案库正被旧页面占用，请关闭旧页面后重试。'));};
        request.onsuccess=()=>{const db=request.result;db.onversionchange=()=>{db.close();opening=null;};resolve(db);};
      });
      return opening;
    }
    async function read(id){const db=await open();return new Promise((resolve,reject)=>{const request=db.transaction('checkpoints').objectStore('checkpoints').get(id);request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);});}
    async function list(){
      const db=await open();return new Promise((resolve,reject)=>{const rows=[],request=db.transaction('checkpoints').objectStore('checkpoints').openCursor();request.onerror=()=>reject(request.error);request.onsuccess=()=>{const cursor=request.result;if(!cursor)return resolve(rows);rows.push(metadata(cursor.value));cursor.continue();};});
    }
    async function put(record,config,{ifAbsent=false}={}){
      validateRecord(record);const errors=validateConfig(config);if(errors.length)throw new Error(errors[0]);const db=await open();
      return new Promise((resolve,reject)=>{
        const tx=db.transaction('checkpoints','readwrite'),store=tx.objectStore('checkpoints');let result=record;
        tx.oncomplete=()=>resolve(metadata(result));tx.onabort=()=>reject(tx.error||new Error('按天存档写入未完成，原档保留。'));tx.onerror=()=>{};
        const check=store.get(record.id);check.onsuccess=()=>{
          if(ifAbsent&&check.result){result=check.result;return;}
          store.put(record);
          const scan=store.getAll();scan.onsuccess=()=>{
            const rows=scan.result,days=[...new Set(rows.filter(r=>r.campaignId===record.campaignId&&r.slot!=='before-load').map(r=>r.day))].sort((a,b)=>b-a),keepDays=new Set(days.slice(0,config.maxDaysPerCampaign));
            for(const row of rows)if(row.campaignId===record.campaignId&&row.slot!=='before-load'&&!keepDays.has(row.day))store.delete(row.id);
            const backups=rows.filter(r=>r.slot==='before-load').sort((a,b)=>b.createdAt-a.createdAt);
            for(const row of backups.slice(config.maxBeforeLoadBackups))store.delete(row.id);
          };
        };
      });
    }
    return {open,read,list,put};
  }
  return {VERSION,DB_NAME,validateConfig,validateRecord,metadata,createRepository};
})();
