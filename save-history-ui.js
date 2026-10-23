/* Day boundaries, config snapshots and the player's archive picker. */
window.ShopDaySaves=(()=>{
  const repository=ShopHistory.createRepository(),clone=value=>JSON.parse(JSON.stringify(value));
  let config,initialising,tail=Promise.resolve(),seenDay=null,seenPhase=null,restoring=false,lastError=null,filter='days';
  const labels={start:'当天起点',close:'打烊档',manual:'手动档','before-load':'读档前备份'};
  const button=document.querySelector('#saveHistoryBtn'),dialog=document.querySelector('#saveHistoryDialog'),message=document.querySelector('#saveHistoryMessage'),list=document.querySelector('#saveHistoryList');
  function status(text,error=false){message.textContent=text;message.dataset.status=error?'error':'ok';button.title=text;}
  function ensureCampaign(save){if(!save.campaignId){save.campaignId=crypto.randomUUID();localStorage.setItem(store.key,JSON.stringify(save));}return save.campaignId;}
  function captureRules(){return {business:clone(ShopBusiness.config),tasks:clone(ShopTasks.config),modules:ShopModules.configSummary().map(({id,config})=>({id,config}))};}
  function capture(save,slot,{reason=slot,rules=captureRules(),id}={}){
    const campaignId=ensureCampaign(save),b=save.business;
    return {format:'noname-shop-day-save',version:ShopHistory.VERSION,id:id||`${campaignId}:${b.day}:${slot}`,campaignId,day:b.day,slot,reason,createdAt:Date.now(),minute:b.minute,phase:b.phase,cash:save.shop.cash,revenue:b.daily.revenue,cards:ShopModel.total(save.collection),boxes:window.ShopBoxes?.lots(save).filter(box=>box.status==='sealed').length||0,parent:save.campaignParent||null,save:clone(save),rules:clone(rules)};
  }
  function init(){
    if(!initialising)initialising=(async()=>{const response=await fetch('data/save-history.json');if(!response.ok)throw new Error('存档保留策略无法读取。');const value=await response.json(),errors=ShopHistory.validateConfig(value);if(errors.length)throw new Error(errors.join('\n'));await repository.open();config=value;return value;})().catch(error=>{initialising=null;throw error;});
    return initialising;
  }
  function enqueue(record,options){
    const operation=tail.catch(()=>{}).then(init).then(()=>repository.put(record,config,options));
    tail=operation.catch(error=>{lastError=error;status(`按天存档失败：${error.message}。当前进度仍保存在原存档中。`,true);});
    return operation.then(result=>{lastError=null;status(`第 ${record.day} 天 · ${labels[record.slot]}已保存。`);return result;});
  }
  function observe(save=state){
    if(restoring||!DATA||saveLoadError||!save?.business)return;
    try{
      const campaign=ensureCampaign(save),key=`${campaign}:${save.business.day}`,phase=save.business.phase;
      if(seenDay!==key){const first=seenDay===null;seenDay=key;seenPhase=phase;void enqueue(capture(save,'start',{reason:first?'first-seen':'day-start'}),{ifAbsent:true}).catch(()=>{});if(phase==='closed')void enqueue(capture(save,'close')).catch(()=>{});}
      else if(phase==='closed'&&seenPhase!=='closed'){seenPhase=phase;void enqueue(capture(save,'close')).catch(()=>{});}
      else seenPhase=phase;
    }catch(error){lastError=error;status(`按天存档失败：${error.message}`,true);}
  }
  function blocked(){return !DATA||saveLoadError||busy||!document.querySelector('#battleScreen').hidden||document.querySelector('#battleSetup').open;}
  async function saveCurrent(){
    if(blocked())throw new Error('请先结束开包或返回小店后再手动存档。');
    if(ShopGame.scene?.owner)state.player={x:Math.round(ShopGame.scene.owner.x),y:Math.round(ShopGame.scene.owner.y)};
    store.save(state);const result=await enqueue(capture(state,'manual'));await render();return result;
  }
  function checkRules(rules){
    const errors=[...ShopBusiness.validate(rules.business),...ShopTasks.validate(rules.tasks)];
    for(const item of rules.modules){if(!ShopModules.get(item.id))throw new Error(`此版本缺少存档模块 ${item.id}。`);errors.push(...ShopModules.validate(item.id,item.config));}
    if(errors.length)throw new Error('存档中的配置不兼容：'+errors.join('\n'));
  }
  function applyRules(rules){ShopBusiness.configure(rules.business);ShopTasks.configure(rules.tasks);for(const item of rules.modules)ShopModules.configure(item.id,item.config);}
  function configEntries(rules){return [['noname-business-config-v1',rules.business],[ShopTasks.OVERRIDE_KEY,rules.tasks],...rules.modules.map(item=>[`noname-module-${item.id}-v1`,item.config])];}
  async function load(id){
    if(blocked())throw new Error('请先结束开包或返回小店，再读取按天存档。');
    if(!dialog.open)dialog.showModal();
    await tail;await init();const record=await repository.read(id);if(!record)throw new Error('这份按天存档已不存在。');ShopHistory.validateRecord(record);checkRules(record.rules);
    const currentRules=captureRules();let next;
    // Validate/migrate in memory before touching the player's persisted current progress.
    try{applyRules(record.rules);next=ShopModel.normalise(record.save);ShopModules.ready(next);ShopTasks.evaluate(next);}finally{applyRules(currentRules);}
    await enqueue(capture(state,'before-load',{id:`backup:${crypto.randomUUID()}`,reason:'before-load'}));
    next.campaignId=crypto.randomUUID();next.campaignParent=record.id;
    const entries=configEntries(record.rules),previous=new Map(entries.map(([key])=>[key,localStorage.getItem(key)])),oldSave=localStorage.getItem(store.key);
    restoring=true;
    try{
      for(const [key,value]of entries)localStorage.setItem(key,JSON.stringify(value));
      localStorage.setItem(store.key,JSON.stringify(next));
      await enqueue(capture(next,'start',{reason:'loaded',rules:record.rules}),{ifAbsent:true});
    }catch(error){
      for(const [key,value]of previous)value===null?localStorage.removeItem(key):localStorage.setItem(key,value);
      if(oldSave===null)localStorage.removeItem(store.key);else localStorage.setItem(store.key,oldSave);restoring=false;throw error;
    }
    state=next;location.reload();
  }
  async function exportRecord(id){
    await tail;await init();const record=await repository.read(id);if(!record)throw new Error('存档已不存在。');
    const file={format:'noname-shop-save',version:1,savedAt:new Date(record.createdAt).toISOString(),save:record.save,dayArchive:record};
    const url=URL.createObjectURL(new Blob([JSON.stringify(file,null,2)],{type:'application/json'})),a=document.createElement('a');a.href=url;a.download=`无名小店-第${record.day}天-${labels[record.slot]}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
  }
  async function importRecord(file){
    if(blocked())throw new Error('请先返回小店后再导入。');if(!file||file.size>30*1024*1024)throw new Error('请选择不超过30MB的按天档案。');
    const parsed=JSON.parse((await file.text()).replace(/^\uFEFF/,'')),record=parsed.dayArchive||parsed;ShopHistory.validateRecord(record);checkRules(record.rules);
    const imported=clone(record);imported.id=`import:${crypto.randomUUID()}`;imported.campaignId=crypto.randomUUID();imported.save.campaignId=imported.campaignId;imported.originalCreatedAt=record.createdAt;imported.createdAt=Date.now();imported.reason='imported';await enqueue(imported);await render();return imported;
  }
  function element(tag,text){const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;}
  async function action(fn){try{await fn();}catch(error){status(error.message,true);if(!dialog.open)ShopGame.toast(error.message);}}
  async function render(){
    await tail;await init();const rows=await repository.list();list.replaceChildren();
    const visible=rows.filter(row=>filter==='backups'?row.slot==='before-load':row.slot!=='before-load').sort((a,b)=>(b.campaignId===state.campaignId)-(a.campaignId===state.campaignId)||b.day-a.day||b.createdAt-a.createdAt);
    const groups=new Map();for(const row of visible){const key=`${row.campaignId}:${row.day}`;if(!groups.has(key))groups.set(key,[]);groups.get(key).push(row);}
    for(const records of groups.values()){
      const first=records[0],section=element('article');section.className='day-save-group';section.dataset.saveDay=String(first.day);
      section.append(element('h3',`第 ${first.day} 天 · ${first.campaignId===state.campaignId?'本次进度':'历史进度 '+first.campaignId.slice(0,8)}`));
      for(const row of records){
        const line=element('div');line.className='day-save-row';line.dataset.checkpointId=row.id;
        const text=element('div'),time=new Date(row.createdAt).toLocaleString('zh-CN');
        text.append(element('strong',`${labels[row.slot]}${row.reason==='loaded'?'（读档分支起点）':''} · ${ShopBusiness.time(row.minute)} · ¥${row.cash.toLocaleString('zh-CN')}`),element('small',`${time} · 营业额 ¥${row.revenue} · 收藏 ${row.cards} 张 · 封盒 ${row.boxes} 盒`));
        const controls=element('div');controls.className='day-save-actions';
        const read=element('button','读取');read.type='button';read.className='btn';read.dataset.loadCheckpoint=row.id;read.onclick=()=>action(async()=>{if(confirm(`读取第${row.day}天「${labels[row.slot]}」？当前进度会先备份；读档创建独立分支，原后续档案保留。`))await load(row.id);});
        const download=element('button','导出');download.type='button';download.className='btn plain';download.onclick=()=>action(()=>exportRecord(row.id));controls.append(read,download);line.append(text,controls);section.append(line);
      }list.append(section);
    }
    if(!visible.length)list.append(element('p',filter==='backups'?'还没有读档前备份。':'当前没有每日档案。'));
    document.querySelector('#saveHistoryRetention').textContent=`每次开店/读档分支保留最近 ${config.maxDaysPerCampaign} 天；另保留最近 ${config.maxBeforeLoadBackups} 份读档前备份。档案保存于此浏览器或桌面用户目录，迁移请导出。`;
  }
  async function show(){if(blocked())throw new Error('请先结束开包或返回小店，再打开按天档案。');if(!dialog.open)dialog.showModal();await render();}
  button.onclick=()=>action(show);document.querySelector('#saveHistoryClose').onclick=()=>dialog.close();document.querySelector('#saveHistoryNow').onclick=()=>action(saveCurrent);
  document.querySelector('#saveHistoryImport').onchange=event=>action(async()=>{await importRecord(event.target.files[0]);event.target.value='';status('已导入档案，点击读取后才会替换当前进度。');});
  document.querySelectorAll('[data-history-filter]').forEach(tab=>tab.onclick=()=>{filter=tab.dataset.historyFilter;document.querySelectorAll('[data-history-filter]').forEach(t=>t.classList.toggle('active',t===tab));void action(render);});
  window.addEventListener('collectionchange',()=>observe());
  const start=()=>{observe();void init().catch(error=>status(error.message,true));};
  if(typeof DATA!=='undefined'&&DATA)start();else window.addEventListener('catalogueready',start,{once:true});
  return {show,saveCurrent,load,exportRecord,importRecord,observe,flush:()=>tail,repository,get lastError(){return lastError;}};
})();
