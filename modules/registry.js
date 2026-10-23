/* Feature contracts: data/config, state migration, commands, queries and domain events. */
window.ShopModules = (() => {
  const modules = new Map();
  let catalog = null, loaded = false, transaction = null, revision=0;
  const clone = value => JSON.parse(JSON.stringify(value));
  const safeId = id => typeof id === "string" && /^[a-z][a-z0-9_-]*$/.test(id)&&!['constructor','prototype','__proto__'].includes(id);
  const error = message => ({ ok:false, error:message });
  function register(module) {
    if (!safeId(module.id) || modules.has(module.id) || !module.version) throw new Error("模块 ID 重复或不合法");
    modules.set(module.id, module);
  }
  const api = (save, module) => ({ save, catalog, config:module.config, state:save.modules[module.id].data,
    emit:(type, detail={}) => ShopBusiness.emit(save,type,detail), value:(key,fallback,detail={})=>value(key,save,fallback,detail),
    get:id=>save.modules[id]?.data, clone, error,
    card:id=>catalog?.cards.find(c=>c.id===id), pack:id=>catalog?.packs.find(p=>p.id===id) });
  function initialise(save, previous={}) {
    save.modules=clone(previous.modules || save.modules || {});
    for (const module of modules.values()) {
      const saved=save.modules[module.id];
      if (saved?.version > module.version) throw new Error(`模块 ${module.id} 存档版本较新，请使用较新程序`);
      const data=module.migrate ? module.migrate(saved?.data,save,saved?.version||0) : {...module.defaults(),...(saved?.data||{})};
      save.modules[module.id]={version:module.version,data};
    }
    return save;
  }
  function ready(save) { if (!loaded || !catalog) return;for (const module of modules.values()) module.ready?.(api(save,module)); }
  function validate(id, config) { const m=modules.get(id);return m ? m.validate(config,catalog) : ["模块不存在"]; }
  function configure(id, config) {const errors=validate(id,config);if(errors.length)throw new Error(errors.join("\n"));modules.get(id).config=clone(config);revision++;}
  async function load() {
    for(const module of modules.values())for(const id of module.requires||[])if(!modules.has(id))throw new Error(`模块 ${module.id} 缺少依赖 ${id}`);
    await Promise.all([...modules.values()].filter(m=>m.file).map(async module=>{
      const response=await fetch(module.file);if(!response.ok)throw new Error(`无法读取模块配置 ${module.id}`);
      let config=await response.json();
      try {const custom=JSON.parse(localStorage.getItem(`noname-module-${module.id}-v1`));if(custom&&!validate(module.id,custom).length)config=custom;}catch{}
      configure(module.id,config);
    }));
    loaded=true;
  }
  function setCatalog(data) {catalog=data;for(const m of modules.values())if(m.config){const errors=validate(m.id,m.config);if(errors.length)throw new Error(errors.join("\n"));}}
  function value(key,save,fallback,detail={}) {
    let result=fallback;
    if(!save?.modules)return result;
    for(const module of modules.values())if(save.modules[module.id]&&module.queries?.[key])result=module.queries[key](api(save,module),result,detail);
    return result;
  }
  function handle(save,event) {if(!save.modules)return;for(const module of modules.values())if(save.modules[module.id])module.onEvent?.(api(save,module),event);}
  function tick(save,minutes) {if(!save.modules||minutes<=0)return;for(const module of modules.values())module.tick?.(api(save,module),minutes);}
  function queueEvent(save,type,detail) {if(transaction?.save!==save)return false;transaction.events.push({type,detail:clone(detail)});return true;}
  function batch(save,commands) {
    if(!Array.isArray(commands)||!commands.length)return error("缺少操作");
    if(transaction)return error("命令不能嵌套执行，请改用事件或纯函数");
    const backup=clone(save),events=[];transaction={save,events};
    try {
      const results=[];
      for(const {command,payload={}} of commands){
        const [id,action]=String(command).split('.'),module=modules.get(id);
        if(!module?.actions?.[action]||!save.modules?.[id])throw new Error("操作不存在");
        const result=module.actions[action](api(save,module),payload)||{ok:true};
        if(result.then)throw new Error("模块命令必须同步完成");
        if(result.ok===false)throw new Error(result.error||"操作失败");
        results.push(result);
      }
      transaction=null;
      for(const event of events)ShopBusiness.emit(save,event.type,event.detail);
      return {ok:true,results};
    } catch(e) {Object.keys(save).forEach(k=>delete save[k]);Object.assign(save,backup);return error(e.message);}
    finally {transaction=null;}
  }
  function dispatch(save,command,payload={}){const result=batch(save,[{command,payload}]);return result.ok?result.results[0]:result;}
  function configSummary(){return [...modules.values()].filter(m=>m.file).map(m=>({id:m.id,title:m.title,file:m.file,config:clone(m.config)}));}
  return {register,initialise,ready,load,setCatalog,validate,configure,value,handle,tick,dispatch,batch,queueEvent,configSummary,clone,
    get catalog(){return catalog;},get loaded(){return loaded;},get revision(){return revision;},get(id){return modules.get(id);}};
})();
