/* Injected only by the development server; no changes to release HTML. */
(()=>{
  if(!window.__CARD_SHOP_DEV__)return;
  let pending=false,instance=window.__CARD_SHOP_DEV__.instanceId,fixtures=[];
  const panel=document.createElement('details');panel.id='developmentTools';panel.style.cssText='position:fixed;right:12px;bottom:12px;z-index:99999;background:#173b2c;color:#fff;padding:10px;border:2px solid #d4b76b;border-radius:8px;font:13px/1.6 sans-serif;max-width:360px;box-shadow:0 3px 18px #0008';
  const summary=document.createElement('summary');summary.textContent='开发工具 · 独立测试存档';panel.append(summary);
  const status=document.createElement('p');status.id='developmentStatus';status.textContent='自动刷新已连接；正式试玩存档使用其他端口。';panel.append(status);
  const select=document.createElement('select');select.id='developmentFixture';select.style.cssText='max-width:100%;padding:6px';panel.append(select);
  const button=(title,fn)=>{const b=document.createElement('button');b.textContent=title;b.style.cssText='margin:5px;padding:6px;cursor:pointer';b.onclick=fn;panel.append(b);return b;};
  function available(){return typeof DATA!=='undefined'&&DATA&&typeof state!=='undefined'&&typeof store!=='undefined';}
  function blocked(){return !available()||!document.querySelector('#battleScreen')?.hidden||document.querySelector('#taskEditor[open]')||document.querySelector('#saveHistoryDialog[open]')||document.querySelector('#managementPanel[open] #moduleConfigText');}
  function reload(){if(!available()||typeof saveLoadError!=='undefined'&&saveLoadError)return;store.save(state);location.reload();}
  button('载入测试存档',()=>{if(!available())return;if(!document.querySelector('#battleScreen')?.hidden)return alert('请先返回小店，再切换测试存档。');if(!confirm('替换当前开发存档？当前开发进度会留一份本地备份。'))return;const fixture=fixtures.find(f=>f.id===select.value);if(!fixture)return;localStorage.setItem('noname-dev-before-fixture',localStorage.getItem(store.key)||'null');const next=ShopModel.normalise(fixture.save);ShopModules.ready(next);state=next;store.save(state);location.reload();});
  button('立即刷新',reload);
  button('暂停 / 继续时钟',()=>{if(available()){state.business.paused=!state.business.paused;store.save(state);}});
  button('导出测试存档',()=>{if(!available())return;store.save(state);const a=document.createElement('a'),url=URL.createObjectURL(new Blob([JSON.stringify({format:'noname-shop-save',version:1,save:state},null,2)],{type:'application/json'}));a.href=url;a.download='development-save.json';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);});
  document.body.append(panel);fetch('/__dev/fixtures.json').then(r=>r.json()).then(value=>{fixtures=value;for(const f of fixtures)select.add(new Option(f.name,f.id));}).catch(e=>status.textContent=e.message);
  const events=new EventSource('/__dev/events');events.addEventListener('ready',event=>{const data=JSON.parse(event.data);status.textContent='自动刷新已连接 · 测试存档保留';if(instance!==data.instanceId){instance=data.instanceId;pending=true;}});
  events.addEventListener('change',event=>{const data=JSON.parse(event.data);if(data.files.every(f=>f.endsWith('.css'))){for(const link of document.querySelectorAll('link[rel=stylesheet]')){const url=new URL(link.href);if(url.origin===location.origin){url.searchParams.set('devRevision',String(data.revision));link.href=url.href;}}status.textContent='样式已更新，当前牌局保留。';return;}pending=true;status.textContent='检测到修改，等待安全刷新（对局和配置编辑结束后）。';});
  events.onerror=()=>status.textContent='等待开发后台重启；连接恢复后继续自动刷新。';
  const timer=setInterval(()=>{if(pending&&!blocked()){pending=false;reload();}},500);window.addEventListener('beforeunload',()=>{clearInterval(timer);events.close();});
})();
