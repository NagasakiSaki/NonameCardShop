if(window.__CARD_SHOP_DEV__){
  let pending=false,instance=window.__CARD_SHOP_DEV__.instanceId,reloading=false;
  const panel=document.createElement('details');panel.id='developmentTools';panel.style.cssText='position:fixed;bottom:12px;right:12px;z-index:99999;padding:10px;background:#173b2c;color:white;border:2px solid #d4b76b;font:13px sans-serif;max-width:300px';
  panel.innerHTML='<summary>开发工具 · 新版卡店</summary><p id="developmentStatus">自动刷新已连接；本端口独立存档。</p>';
  const status=panel.querySelector('p');
  const button=(label,fn)=>{const b=document.createElement('button');b.textContent=label;b.onclick=()=>Promise.resolve(fn()).catch(e=>status.textContent=e.message);panel.append(b);};
  async function safeToReload(){const app=window.__cardShopApp;if(!app||app.windows.depth)return false;const r=await app.host.query('room.snapshot');return r.ok&&!r.data.matches.some(m=>!m.background&&m.status==='running');}
  async function reload(){if(reloading||!await safeToReload()){pending=true;status.textContent='等待关闭窗口或结束玩家牌局后刷新。';return;}reloading=true;await window.__cardShopApp.host.disconnect();location.reload();}
  button('立即刷新',reload);
  button('暂停 / 继续时钟',async()=>{const app=window.__cardShopApp;if(!app)return;await app.command({requestId:'dev-'+crypto.randomUUID(),type:'clock.setManualPause',payload:{paused:!app.snapshot().clock.manualPaused}});});
  button('导出当前档',()=>window.__cardShopApp?.openPanel('saves'));
  document.body.append(panel);
  const events=new EventSource('/__dev/events');
  events.addEventListener('ready',event=>{const data=JSON.parse(event.data);status.textContent='自动刷新已连接 · 新世界进度保留';if(instance!==data.instanceId){instance=data.instanceId;pending=true;}});
  events.addEventListener('change',event=>{const data=JSON.parse(event.data);if(data.files.every(f=>f.endsWith('.css'))){for(const link of document.querySelectorAll('link[rel=stylesheet]')){const url=new URL(link.href);url.searchParams.set('devRevision',data.revision);link.href=url.href;}status.textContent='样式已更新，牌局保留。';}else{pending=true;status.textContent='修改已收到，等待关闭窗口或结束玩家牌局。';}});
  events.onerror=()=>status.textContent='等待开发服务重连。';
  const timer=setInterval(()=>{if(pending&&!reloading)safeToReload().then(ok=>{if(ok){pending=false;reload();}}).catch(e=>status.textContent=e.message);},750);
  window.addEventListener('beforeunload',()=>{clearInterval(timer);events.close();},{once:true});
}
