// Serialized into the sandboxed renderer. No Node API or private storage access there.
async function readCurrentSave(){
  const app=window.__cardShopApp;
  if(app&&window.__cardShopReady){
    if(app.mode==='mock')return null;
    const r=await app.host.command({requestId:'desktop-export-'+crypto.randomUUID(),type:'saves.export',payload:{}});
    if(!r.ok)throw Error(r.error.message);return r.data.content;
  }
  if(typeof state==='undefined'||typeof DATA==='undefined'||!DATA)return null;
  store.save(state);await window.ShopDaySaves?.flush();
  const raw=localStorage.getItem('noname-packer-v1');
  return raw?JSON.stringify({format:'noname-shop-save',version:1,savedAt:new Date().toISOString(),save:JSON.parse(raw)}):null;
}
async function openDaySaves(){
  if(window.__cardShopApp&&window.__cardShopReady)return !!await window.__cardShopApp.openPanel('saves');
  if(window.ShopDaySaves?.show){window.ShopDaySaves.show();return true;}
  return false;
}
module.exports={readCurrentSave,openDaySaves};
