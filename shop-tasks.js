/* Declarative quests. Config contains data only; extensions register named providers. */
window.ShopTasks = (() => {
  const OVERRIDE_KEY="noname-task-config-v1";
  let config={version:1,tasks:[]},catalog=null;
  const conditions=new Map(),metrics=new Map(),rewards=new Map();
  const clone=value=>JSON.parse(JSON.stringify(value));
  const stats=new Set(["revenue","soldCards","soldPacks","ordersPlaced","purchasedPacks","purchaseExpense","openedPacks","listedUnits","receivedPacks","visitors","served","lostCustomers","discarded","recovered","taskRewards","debtPaid","battlesWon"]);
  const key=(save,task)=>task.scope==="daily"?`day:${save.business.day}:${task.id}`:`once:${task.id}`;
  const entryFor=(save,task)=>save.tasks[key(save,task)];
  function isClaimed(save,id){const task=config.tasks.find(t=>t.id===id);return !!task&&entryFor(save,task)?.status==="claimed";}
  conditions.set("minDay",(save,condition)=>save.business.day>=condition.value);
  conditions.set("maxDay",(save,condition)=>save.business.day<=condition.value);
  conditions.set("phase",(save,condition)=>(Array.isArray(condition.value)?condition.value:[condition.value]).includes(save.business.phase));
  conditions.set("reputation",(save,condition)=>save.business.reputation>=condition.value);
  conditions.set("cash",(save,condition)=>save.shop.cash>=condition.value);
  conditions.set("taskClaimed",(save,condition)=>isClaimed(save,condition.value));
  metrics.set("cash",save=>save.shop.cash);
  metrics.set("reputation",save=>save.business.reputation);
  metrics.set("inventory.cards",save=>ShopBusiness.total(save.collection));
  metrics.set("inventory.packs",save=>ShopBusiness.total(save.stock));
  metrics.set("inventory.shelfUnits",save=>ShopBusiness.shelfUsed(save));
  metrics.set("inventory.trash",save=>ShopBusiness.total(save.trash));
  rewards.set("cash",(save,reward)=>ShopBusiness.addCash(save,reward.amount,"task"));
  rewards.set("reputation",(save,reward)=>{save.business.reputation=Math.max(0,Math.min(100,save.business.reputation+reward.amount));});
  rewards.set("packs",(save,reward)=>{if(!catalog?.packs.some(p=>p.id===reward.packId))throw new Error("奖励卡包不存在");save.stock[reward.packId]=(save.stock[reward.packId]||0)+reward.quantity;});
  function knownMetric(name){return metrics.has(name)||/^(daily|lifetime)\.[a-zA-Z]+$/.test(name)&&stats.has(name.split(".")[1]);}
  function metric(save,name){if(metrics.has(name))return Number(metrics.get(name)(save))||0;const [scope,field]=name.split(".");return Number(save.business[scope]?.[field])||0;}
  function target(save,value){return value==="dailyRevenueGoal"?save.business.goal:Number(value);}
  function validate(value){
    const errors=[],rawTasks=Array.isArray(value?.tasks)?value.tasks:[],tasks=rawTasks.filter(t=>t&&typeof t==="object"&&!Array.isArray(t)),ids=new Set();
    const check=(test,path,message)=>{if(!test)errors.push(`${path}：${message}`);};
    check(value?.version===1,"version","必须为 1");check(Array.isArray(value?.tasks)&&tasks.length<=100,"tasks","需要数组，最多 100 个任务");
    check(tasks.length===rawTasks.length,"tasks","每个任务必须是对象");
    for(const [i,t]of tasks.entries()){
      const path=`tasks[${i}]`;
      check(typeof t.id==="string"&&/^[a-z][a-z0-9_]{0,63}$/.test(t.id)&&!ids.has(t.id),`${path}.id`,"需要唯一英文 ID");ids.add(t.id);
      check(typeof t.title==="string"&&t.title.length>0&&t.title.length<=80,`${path}.title`,"需要 1—80 字标题");
      check(typeof t.description==="string"&&t.description.length<=800,`${path}.description`,"需要不超过 800 字的说明");
      check(["once","daily"].includes(t.scope),`${path}.scope`,"必须为 once 或 daily");
      check(!t.guide||["counter","display","trash","battle"].includes(t.guide),`${path}.guide`,"需要有效家具 ID");
      check(t.deadlineMinute===undefined||Number.isInteger(t.deadlineMinute)&&t.deadlineMinute>=0&&t.deadlineMinute<1440,`${path}.deadlineMinute`,"需要当天分钟数");
      check(!t.mode||["all","any"].includes(t.mode),`${path}.mode`,"必须为 all 或 any");
      check(Array.isArray(t.objectives)&&t.objectives.length>0&&t.objectives.length<=8,`${path}.objectives`,"需要 1—8 个目标");
      for(const [j,o]of (Array.isArray(t.objectives)?t.objectives:[]).entries()){
        const op=`${path}.objectives[${j}]`;
        if(!o||typeof o!=="object"){errors.push(`${op}：需要目标对象`);continue;}
        check(["metric","event"].includes(o.type),`${op}.type`,"必须为 metric 或 event");
        check(o.target==="dailyRevenueGoal"||Number.isSafeInteger(o.target)&&o.target>0,`${op}.target`,"需要正整数或 dailyRevenueGoal");
        if(o.type==="metric")check(typeof o.metric==="string"&&knownMetric(o.metric),`${op}.metric`,"指标未注册");
        if(o.type==="event"){
          check(typeof o.event==="string"&&/^[A-Za-z][A-Za-z0-9_]{0,63}$/.test(o.event),`${op}.event`,"需要事件名称");
          check(o.measure===undefined||["amount","quantity"].includes(o.measure),`${op}.measure`,"可选 amount 或 quantity，默认次数");
          check(!o.filter||typeof o.filter==="object"&&!Array.isArray(o.filter)&&Object.values(o.filter).every(v=>["string","number","boolean"].includes(typeof v)||Array.isArray(v)&&v.every(x=>["string","number","boolean"].includes(typeof x))),`${op}.filter`,"筛选值只能是基础值或其数组");
          check(!o.window||Number.isInteger(o.window.from)&&Number.isInteger(o.window.to)&&o.window.from>=0&&o.window.from<o.window.to&&o.window.to<=1440,`${op}.window`,"时间窗口不合法");
        }
      }
      check(Array.isArray(t.rewards)&&t.rewards.length<=8,`${path}.rewards`,"需要奖励数组，最多 8 项");
      for(const reward of Array.isArray(t.rewards)?t.rewards:[]){
        if(!reward||typeof reward!=="object"){errors.push(`${path}.rewards：需要奖励对象`);continue;}
        check(rewards.has(reward.type),`${path}.rewards` ,`奖励 ${reward.type} 未注册`);
        if(["cash","reputation"].includes(reward.type))check(Number.isSafeInteger(reward.amount)&&reward.amount>=0,`${path}.rewards.amount`,"需要非负整数");
        if(reward.type==="packs")check(typeof reward.packId==="string"&&Number.isSafeInteger(reward.quantity)&&reward.quantity>0&&(!catalog||catalog.packs.some(p=>p.id===reward.packId)),`${path}.rewards`,"卡包 ID 或数量不合法");
      }
      check(t.conditions===undefined||Array.isArray(t.conditions),`${path}.conditions`,"需要条件数组");
      for(const condition of Array.isArray(t.conditions)?t.conditions:[]){if(!condition||typeof condition!=="object"){errors.push(`${path}.conditions：需要条件对象`);continue;}check(conditions.has(condition.type),`${path}.conditions`,`条件 ${condition.type} 未注册`);}
      check(!t.dependsOn||Array.isArray(t.dependsOn)&&t.dependsOn.every(id=>typeof id==="string"&&id!==t.id),`${path}.dependsOn`,"需要依赖 ID 数组");
    }
    for(const t of tasks)for(const id of Array.isArray(t.dependsOn)?t.dependsOn:[])check(ids.has(id),`task ${t.id}.dependsOn`,`依赖 ${id} 不存在`);
    const visiting=new Set(),visited=new Set();
    function visit(id){if(visiting.has(id)){errors.push(`task ${id}：依赖形成循环`);return;}if(visited.has(id))return;visiting.add(id);const deps=tasks.find(t=>t.id===id)?.dependsOn;for(const dep of Array.isArray(deps)?deps:[])if(ids.has(dep))visit(dep);visiting.delete(id);visited.add(id);}
    for(const id of ids)visit(id);
    return errors;
  }
  function configure(value){const errors=validate(value);if(errors.length)throw new Error(errors.join("\n"));config=clone(value);return config;}
  async function loadConfig(){const response=await fetch("data/tasks.json");if(!response.ok)throw new Error("任务配置无法读取");let value=await response.json();try{const custom=JSON.parse(localStorage.getItem(OVERRIDE_KEY));if(custom&&!validate(custom).length)value=custom;}catch{}return configure(value);}
  function eligible(save,task){return(task.dependsOn||[]).every(id=>isClaimed(save,id))&&(task.conditions||[]).every(condition=>conditions.get(condition.type)?.(save,condition,task));}
  function progress(save,task,entry){return task.objectives.map((o,i)=>{const raw=o.type==="metric"?metric(save,o.metric):entry?.counters?.[i]||0;const max=target(save,o.target);return{value:Math.min(max,raw),raw,target:max,done:raw>=max};});}
  function evaluate(save){
    save.tasks||={};
    for(const task of config.tasks){
      let entry=entryFor(save,task);
      if(entry?.status==="claimed")continue;
      if(!eligible(save,task))continue;
      const signature=JSON.stringify([task.objectives,task.deadlineMinute]);
      if(!entry){entry=save.tasks[key(save,task)]={status:"active",day:save.business.day,counters:[],signature};}
      if(entry.signature!==signature){entry.counters=[];entry.signature=signature;entry.status="active";}
      if(entry.status==="expired")continue;
      if(task.deadlineMinute!==undefined&&save.business.minute>task.deadlineMinute&&entry.status!=="ready"){entry.status="expired";continue;}
      const values=progress(save,task,entry),done=task.mode==="any"?values.some(v=>v.done):values.every(v=>v.done);
      if(done)entry.status="ready";
      else if((task.deadlineMinute!==undefined&&save.business.minute>task.deadlineMinute)||(task.scope==="daily"&&save.business.phase==="closed"))entry.status="expired";
      else if(entry.status!=="expired")entry.status="active";
    }
  }
  function onEvent(save,event){
    evaluate(save);
    for(const task of config.tasks){const entry=entryFor(save,task);if(!entry||!["active","ready"].includes(entry.status)||!eligible(save,task))continue;
      task.objectives.forEach((o,index)=>{
        if(o.type!=="event"||o.event!==event.type)return;
        if(o.window&&(event.minute<o.window.from||event.minute>=o.window.to))return;
        if(task.deadlineMinute!==undefined&&event.minute>task.deadlineMinute)return;
        if(!Object.entries(o.filter||{}).every(([k,value])=>Array.isArray(value)?value.includes(event[k]):event[k]===value))return;
        const increment=o.measure?Number(event[o.measure])||0:1;
        entry.counters[index]=(entry.counters[index]||0)+Math.max(0,increment);
      });
    }
    evaluate(save);
  }
  function claim(save,id){
    evaluate(save);const task=config.tasks.find(t=>t.id===id),entry=task&&entryFor(save,task);
    if(!entry||entry.status!=="ready"||!eligible(save,task))return{ok:false,error:"任务尚未完成，或奖励已经领取。"};
    const backup=clone(save);
    try{for(const reward of task.rewards)rewards.get(reward.type)(save,reward,task);entry.status="claimed";entry.claimedDay=save.business.day;ShopBusiness.emit(save,"taskClaimed",{taskId:id});evaluate(save);return{ok:true,task};}
    catch(error){for(const name of Object.keys(save))delete save[name];Object.assign(save,backup);return{ok:false,error:error.message};}
  }
  function claimReady(save,scope){for(let pass=0;pass<config.tasks.length;pass++){let changed=false;for(const task of config.tasks)if((!scope||task.scope===scope)&&claim(save,task.id).ok)changed=true;if(!changed)break;}}
  function list(save){evaluate(save);return config.tasks.map(task=>{const entry=entryFor(save,task);const available=eligible(save,task);return{...task,status:entry?.status==="claimed"?"claimed":available?(entry?.status||"active"):"locked",progress:progress(save,task,entry)};});}
  function prune(save){for(const [id,entry]of Object.entries(save.tasks))if(id.startsWith("day:")&&entry.day<save.business.day-30)delete save.tasks[id];}
  function register(map,id,fn){if(typeof id!=="string"||typeof fn!=="function")throw new Error("扩展需要名称和函数");if(map.has(id))throw new Error(`扩展名称已存在：${id}`);map.set(id,fn);}
  return{get config(){return config;},OVERRIDE_KEY,validate,configure,loadConfig,setCatalog(value){catalog=value;},evaluate,onEvent,claim,claimReady,list,prune,isClaimed,registerMetric:(id,fn)=>register(metrics,id,fn),registerCondition:(id,fn)=>register(conditions,id,fn),registerReward:(id,fn)=>register(rewards,id,fn),metricNames:()=>[...metrics.keys(),...[...stats].flatMap(key=>[`daily.${key}`,`lifetime.${key}`])],conditionNames:()=>[...conditions.keys()],rewardNames:()=>[...rewards.keys()]};
})();
