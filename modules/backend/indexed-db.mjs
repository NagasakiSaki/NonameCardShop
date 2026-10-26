// Lazy, retryable IndexedDB connection shared by the world store and profile menu.
export function databaseConnection(indexedDB,name,upgrade){
  let pending=null,database=null,generation=0,cancelPending=null;
  return {
    open(){
      if(database)return Promise.resolve(database);
      if(pending)return pending;
      const token=++generation;
      pending=new Promise((resolve,reject)=>{
        if(!indexedDB)throw Error('当前浏览器不支持存档。');
        const request=indexedDB.open(name,1);let settled=false;
        const fail=error=>{if(settled)return;settled=true;reject(error);};
        cancelPending=()=>fail(Error('存档连接已关闭。'));
        request.onerror=()=>fail(request.error||Error('存档库打开失败，请重试。'));
        request.onblocked=()=>fail(Error('存档库被另一页面占用，请关闭旧页面后重试。'));
        request.onupgradeneeded=()=>{
          if(settled||token!==generation){request.transaction.abort();return;}
          try{upgrade(request.result);}catch(error){request.transaction.abort();fail(error);}
        };
        request.onsuccess=()=>{
          const db=request.result;
          if(settled||token!==generation){db.close();return;}
          database=db;settled=true;cancelPending=null;
          db.onversionchange=()=>{db.close();if(database===db){database=null;pending=null;generation++;}};
          resolve(db);
        };
      }).catch(error=>{if(token===generation)pending=null;throw error;});
      return pending;
    },
    async close(){
      const previous=pending;cancelPending?.();cancelPending=null;generation++;pending=null;
      database?.close();database=null;
      // A failed open must not mask the original startup error during teardown.
      await previous?.then(db=>db.close(),()=>{});
    }
  };
}
