/* Pure daily-business model. All times are in simulated minutes, never host time. */
window.ShopBusiness = (() => {
  const OVERRIDE_KEY = "noname-business-config-v1";
  let cfg = { version:1, clock:{prepareMinute:480,openMinute:540,closeMinute:1200,minutesPerSecond:2,speeds:[1,2,4]}, economy:{startingCash:1200,baseDailyGoal:180,dailyGoalStep:60,maxDailyGoal:900,operatingCost:30,supplierCreditLimit:300,shelfCapacity:36,wholesaleByTier:{1:60,2:80,3:110,4:145},retailPackByTier:{1:95,2:125,3:175,4:230},cardPrices:{C:8,U:16,R:48,SR:160,UR:480}}, supplier:{deliveryMinutes:30,maxOrderQuantity:20},customers:{intervalMinutes:22,maxConcurrent:3,shoppingSeconds:3,traffic:[],profiles:[]} };
  let catalog = null;
  const listeners = new Set();
  const clone = (value) => JSON.parse(JSON.stringify(value));
  const number = (value, fallback=0) => Number.isFinite(value) && value >= 0 ? value : fallback;
  const total = (items) => Object.values(items || {}).reduce((sum,n)=>sum+n,0);
  const DAY_METRICS = ["revenue","soldCards","soldPacks","ordersPlaced","purchasedPacks","purchaseExpense","openedPacks","listedUnits","receivedPacks","visitors","served","lostCustomers","discarded","recovered","taskRewards","debtPaid","battlesWon"];
  function daily() { return Object.fromEntries(DAY_METRICS.map((key)=>[key,0])); }
  function goal(day) { return Math.min(cfg.economy.maxDailyGoal,cfg.economy.baseDailyGoal+(day-1)*cfg.economy.dailyGoalStep); }
  function initialise(save, previous={}) {
    const old=previous.business || save.business || {};
    const day=Number.isInteger(old.day)&&old.day>0?old.day:1;
    save.business={
      day, minute:Math.max(cfg.clock.prepareMinute,Math.min(cfg.clock.closeMinute,number(old.minute,cfg.clock.prepareMinute))),
      phase:["preparing","open","closed"].includes(old.phase)&&!(old.phase==="closed"&&!old.report)?old.phase:"preparing",
      speed:cfg.clock.speeds.includes(old.speed)?old.speed:1, paused:!!old.paused,
      goal:number(old.goal,goal(day)), reputation:Math.min(100,number(old.reputation,50)), debt:Math.round(number(old.debt)),
      daily:Object.fromEntries(DAY_METRICS.map(key=>[key,number(old.daily?.[key])])),
      lifetime:{...Object.fromEntries(DAY_METRICS.map(key=>[key,number(old.lifetime?.[key])]))},
      pricing:{cards:Math.max(.6,Math.min(1.8,number(old.pricing?.cards,1))),packs:Math.max(.6,Math.min(1.8,number(old.pricing?.packs,1)))},
      history:Array.isArray(old.history)?clone(old.history).slice(-30):[],
      report:old.phase==="closed"&&old.report?clone(old.report):null,
      cashStart:number(old.cashStart,save.shop.cash), eventSerial:number(old.eventSerial),
    };
    save.stock=save.stock||{};save.packDisplay=save.packDisplay||{};save.orders=Array.isArray(previous.orders)?clone(previous.orders):save.orders||[];
    save.tasks=previous.tasks&&typeof previous.tasks==="object"?clone(previous.tasks):save.tasks||{};
    return save;
  }
  function validate(value) {
    const errors=[];
    const check=(test,path,message)=>{if(!test)errors.push(`${path}：${message}`);};
    check(value?.version===1,"version","必须为 1");
    const c=value?.clock||{},e=value?.economy||{},s=value?.supplier||{},n=value?.customers||{};
    check([c.prepareMinute,c.openMinute,c.closeMinute].every(Number.isInteger)&&c.prepareMinute>=0&&c.prepareMinute<c.openMinute&&c.openMinute<c.closeMinute&&c.closeMinute<1440,"clock","准备 < 开门 < 打烊，均为当天 0—1439 分钟");
    check(c.minutesPerSecond>0&&c.minutesPerSecond<=60,"clock.minutesPerSecond","必须大于 0 且不超过 60");
    check(Array.isArray(c.speeds)&&c.speeds.includes(1)&&c.speeds.every(x=>[1,2,4].includes(x)),"clock.speeds","包含 1，可选 1、2、4");
    for(const key of ["startingCash","baseDailyGoal","dailyGoalStep","maxDailyGoal","operatingCost","supplierCreditLimit","shelfCapacity"])check(Number.isSafeInteger(e[key])&&e[key]>=0&&(key!=="shelfCapacity"||e[key]>0),`economy.${key}`,"需要非负整数（容量须大于 0）");
    check(e.maxDailyGoal>=e.baseDailyGoal,"economy.maxDailyGoal","不能低于首日目标");
    for(const [key,ids] of [["wholesaleByTier",[1,2,3,4]],["retailPackByTier",[1,2,3,4]],["cardPrices",["C","U","R","SR","UR"]]])for(const id of ids)check(Number.isSafeInteger(e[key]?.[id])&&e[key][id]>0,`economy.${key}.${id}`,"需要正整数");
    check(Number.isInteger(s.deliveryMinutes)&&s.deliveryMinutes>0&&s.deliveryMinutes<=1440,"supplier.deliveryMinutes","范围为 1—1440");
    check(Number.isInteger(s.maxOrderQuantity)&&s.maxOrderQuantity>0&&s.maxOrderQuantity<=100,"supplier.maxOrderQuantity","范围为 1—100");
    check(n.intervalMinutes>=1&&n.intervalMinutes<=240,"customers.intervalMinutes","范围为 1—240");
    check(Number.isInteger(n.maxConcurrent)&&n.maxConcurrent>=1&&n.maxConcurrent<=8,"customers.maxConcurrent","范围为 1—8");
    check(n.shoppingSeconds>=.5&&n.shoppingSeconds<=30,"customers.shoppingSeconds","范围为 0.5—30");
    check(Array.isArray(n.traffic)&&n.traffic.every(t=>Number.isInteger(t.from)&&Number.isInteger(t.to)&&t.from>=0&&t.to<=1440&&t.from<t.to&&t.multiplier>0&&t.multiplier<=5),"customers.traffic","时段需要有效的 from/to 与 0—5 倍客流");
    const ids=new Set();
    check(Array.isArray(n.profiles)&&n.profiles.length>0,"customers.profiles","至少一类顾客");
    for(const [i,p] of (Array.isArray(n.profiles)?n.profiles:[]).entries()){
      check(typeof p.id==="string"&&/^[a-z][a-z0-9_]*$/.test(p.id)&&!ids.has(p.id),`customers.profiles[${i}].id`,"需要唯一英文 ID");ids.add(p.id);
      check(typeof p.name==="string"&&p.name.length>0&&p.name.length<40,`customers.profiles[${i}].name`,"需要顾客名称");
      check(p.weight>0&&p.budget>0&&p.maxMarkup>=.6&&p.maxMarkup<=2,`customers.profiles[${i}]`,"权重、预算、价格承受度不合法");
      check(["pack","card","cheapest"].includes(p.preference)&&Array.isArray(p.rarities)&&p.rarities.every(r=>["C","U","R","SR","UR"].includes(r)),`customers.profiles[${i}]`,"偏好必须为 pack/card/cheapest，并指定稀有度数组");
      check(Number.isInteger(p.tint)&&p.tint>=0&&p.tint<=16777215,`customers.profiles[${i}].tint`,"需要 0—16777215 的颜色整数");
    }
    return errors;
  }
  function configure(value) {const errors=validate(value);if(errors.length)throw new Error(errors.join("\n"));cfg=clone(value);return cfg;}
  async function loadConfig(){const response=await fetch("data/business.json");if(!response.ok)throw new Error("经营配置无法读取");let value=await response.json();try{const custom=JSON.parse(localStorage.getItem(OVERRIDE_KEY));if(custom&&!validate(custom).length){if(!custom.balanceEconomyVersion&&Object.entries({C:18,U:35,R:80,SR:180,UR:420}).every(([r,n])=>custom.economy.cardPrices[r]===n)){if(!localStorage.getItem('noname-business-before-balance-v1'))localStorage.setItem('noname-business-before-balance-v1',JSON.stringify(custom));custom.economy.cardPrices=value.economy.cardPrices;custom.balanceEconomyVersion=1;localStorage.setItem(OVERRIDE_KEY,JSON.stringify(custom));}value=custom;}}catch{}return configure(value);}
  function emit(save,type,detail={}) {
    if(window.ShopModules?.queueEvent(save,type,detail))return null;
    const event={type,day:save.business.day,minute:save.business.minute,serial:++save.business.eventSerial,...detail};
    window.ShopModules?.handle(save,event);
    window.ShopTasks?.onEvent(save,event);
    for(const fn of listeners){try{fn(event,save);}catch(error){console.error("经营事件扩展失败",error);}}
    return event;
  }
  function bump(save,key,amount=1){save.business.daily[key]=(save.business.daily[key]||0)+amount;save.business.lifetime[key]=(save.business.lifetime[key]||0)+amount;}
  function addCash(save,amount,source="other"){
    if(!Number.isSafeInteger(amount)||amount<0)return false;
    const repayment=Math.min(amount,save.business.debt);save.business.debt-=repayment;save.shop.cash+=amount-repayment;
    bump(save,"debtPaid",repayment);
    if(source==="task")bump(save,"taskRewards",amount);
    return true;
  }
  function stamp(save){return (save.business.day-1)*1440+save.business.minute;}
  function wholesale(pack){return window.ShopBalance?.config&&pack?ShopBalance.quote(pack,cfg.economy.cardPrices).wholesale:cfg.economy.wholesaleByTier[pack?.tier]||60;}
  function referenceCard(card,save){const base=cfg.economy.cardPrices[card.rarity]||18;return window.ShopModules?ShopModules.value("card.price",save,base,{card}):base;}
  function retailPack(pack,save){const base=window.ShopBalance?.config&&pack?ShopBalance.quote(pack,cfg.economy.cardPrices).retail:cfg.economy.retailPackByTier[pack?.tier]||95,market=window.ShopModules?ShopModules.value("pack.price",save,base,{pack}):base;return Math.round(market*(save?.business.pricing.packs||1));}
  function retailCard(card,save){return Math.round(referenceCard(card,save)*(save?.business.pricing.cards||1));}
  function capacity(save){return window.ShopModules?ShopModules.value("shelf.capacity",save,cfg.economy.shelfCapacity):cfg.economy.shelfCapacity;}
  function dailyCost(save){return window.ShopModules?ShopModules.value("business.dailyCost",save,cfg.economy.operatingCost):cfg.economy.operatingCost;}
  function shelfUsed(save){return total(save.display)+total(save.packDisplay);}
  function order(save,pack,quantity,useCredit=false){
    if(save.business.phase==="closed")return {ok:false,error:"今天已结算，请先进入下一天。"};
    if(!pack||!Number.isInteger(quantity)||quantity<1||quantity>cfg.supplier.maxOrderQuantity)return {ok:false,error:"进货数量不合法。"};
    const cost=wholesale(pack)*quantity,shortfall=Math.max(0,cost-save.shop.cash);
    if(shortfall&&(!useCredit||shortfall+save.business.debt>cfg.economy.supplierCreditLimit))return {ok:false,error:"资金不足，可减少数量或使用额度内的供应商赊购。"};
    save.shop.cash-=cost-shortfall;save.business.debt+=shortfall;
    const item={id:`order-${save.business.day}-${save.business.eventSerial+1}`,packId:pack.id,quantity,unitCost:wholesale(pack),cost,orderedAt:stamp(save),dueAt:stamp(save)+cfg.supplier.deliveryMinutes,status:"pending"};
    save.orders.push(item);save.orders=save.orders.filter(o=>o.status!=="received").concat(save.orders.filter(o=>o.status==="received").slice(-50));
    bump(save,"ordersPlaced");bump(save,"purchasedPacks",quantity);bump(save,"purchaseExpense",cost);emit(save,"orderPlaced",{packId:pack.id,quantity,amount:cost,credit:shortfall});
    return {ok:true,order:item};
  }
  function deliveries(save){let changed=false;for(const item of save.orders){if(item.status==="pending"&&item.dueAt<=stamp(save)){item.status="arrived";changed=true;emit(save,"deliveryArrived",{orderId:item.id,packId:item.packId,quantity:item.quantity});}}return changed;}
  function receive(save,id){
    if(save.business.phase==="closed")return {ok:false,error:"请明早再签收。"};
    const item=save.orders.find(o=>o.id===id&&o.status==="arrived");if(!item)return {ok:false,error:"这笔订单尚未送达或已签收。"};
    item.status="received";item.receivedAt=stamp(save);save.stock[item.packId]=(save.stock[item.packId]||0)+item.quantity;
    bump(save,"receivedPacks",item.quantity);emit(save,"goodsReceived",{orderId:item.id,packId:item.packId,quantity:item.quantity,cost:item.cost});return {ok:true,quantity:item.quantity};
  }
  function movePacks(save,packId,from,to,n=1){
    if(!["stock","packDisplay"].includes(from)||!["stock","packDisplay"].includes(to)||from===to||!Number.isInteger(n)||n<1||!(save[from][packId]>=n))return false;
    if(save.business.phase==="closed"||to==="packDisplay"&&shelfUsed(save)+n>capacity(save))return false;
    save[from][packId]-=n;if(!save[from][packId])delete save[from][packId];save[to][packId]=(save[to][packId]||0)+n;
    if(to==="packDisplay")bump(save,"listedUnits",n);emit(save,to==="packDisplay"?"stockListed":"stockWithdrawn",{kind:"pack",packId,quantity:n});return true;
  }
  function openPack(save,pack){
    if(save.business.phase==="closed"||!pack||!(save.stock[pack.id]>0))return false;
    save.stock[pack.id]--;if(!save.stock[pack.id])delete save.stock[pack.id];save.shop.packsOpened++;bump(save,"openedPacks");emit(save,"packOpened",{packId:pack.id,quantity:1});return true;
  }
  function noteTransfer(save,from,to,cardId,n){
    if(to==="display")bump(save,"listedUnits",n);if(to==="trash")bump(save,"discarded",n);if(from==="trash")bump(save,"recovered",n);
    emit(save,to==="display"?"stockListed":from==="display"?"stockWithdrawn":to==="trash"?"cardDiscarded":"cardRecovered",{kind:"card",cardId,quantity:n});
  }
  function sell(save,kind,id,profile){
    if(save.business.phase!=="open")return {ok:false,error:"店铺尚未营业。"};
    const item=kind==="card"?catalog?.cards.find(c=>c.id===id):catalog?.packs.find(p=>p.id===id);
    const container=kind==="card"?save.display:save.packDisplay;
    if(!item||!(container[id]>0))return {ok:false,error:"商品已售完。"};
    const amount=kind==="card"?retailCard(item,save):retailPack(item,save);
    if(profile&&(amount>profile.budget||save.business.pricing[kind==="card"?"cards":"packs"]>profile.maxMarkup))return {ok:false,error:"顾客预算或价格承受度不足。"};
    return checkout(save,{kind,id,quantity:1,amount,profile,container:kind==="card"?"display":"packDisplay",source:"shelf"});
  }
  function checkout(save,{kind,id,quantity=1,amount,profile,container,source}){
    if(save.business.phase!=="open")return {ok:false,error:"请在营业时完成交易。"};
    if(!["card","pack"].includes(kind)||!Number.isSafeInteger(quantity)||quantity<1||!Number.isSafeInteger(amount)||amount<1||!["collection","display","packDisplay"].includes(container)||kind==="card"&&container==="packDisplay"||kind==="pack"&&container!=="packDisplay")return {ok:false,error:"交易参数不合法。"};
    const item=kind==="card"?catalog?.cards.find(c=>c.id===id):catalog?.packs.find(p=>p.id===id),stock=save[container];
    if(!item||!(stock[id]>=quantity))return {ok:false,error:"商品数量不足。"};
    if(container==="collection"&&window.ShopModules&&ShopModules.value("inventory.available",save,stock[id],{cardId:id})<quantity)return {ok:false,error:"收藏保护中的卡片不能出售。"};
    stock[id]-=quantity;if(!stock[id])delete stock[id];addCash(save,amount);save.shop.revenue+=amount;save.shop.sold+=quantity;
    bump(save,"revenue",amount);bump(save,kind==="card"?"soldCards":"soldPacks",quantity);bump(save,"served");save.business.reputation=Math.min(100,save.business.reputation+.5);
    save.receipts.push({name:item.name,id,kind,amount,quantity,day:save.business.day,minute:save.business.minute,customer:profile?.name||"顾客"});save.receipts=save.receipts.slice(-50);
    emit(save,"sale",{kind,id,rarity:item.rarity,amount,quantity,source,customerId:profile?.id,regularId:profile?.regularId});return {ok:true,item,amount};
  }
  function chooseProduct(save,profile){
    const products=[];
    for(const [id,n] of Object.entries(save.display)){const card=catalog?.cards.find(c=>c.id===id);if(n>0&&card&&profile.rarities.includes(card.rarity)&&retailCard(card,save)<=profile.budget&&save.business.pricing.cards<=profile.maxMarkup)products.push({kind:"card",id,price:retailCard(card,save),score:profile.preference==="card"?100:20});}
    for(const [id,n] of Object.entries(save.packDisplay)){const pack=catalog?.packs.find(p=>p.id===id);if(n>0&&pack&&retailPack(pack,save)<=profile.budget&&save.business.pricing.packs<=profile.maxMarkup)products.push({kind:"pack",id,price:retailPack(pack,save),score:profile.preference==="pack"?100:20});}
    if(window.ShopModules)for(const product of products){const item=product.kind==="card"?catalog.cards.find(c=>c.id===product.id):catalog.packs.find(p=>p.id===product.id);product.score=ShopModules.value("customer.productScore",save,product.score,{profile,kind:product.kind,item});}
    products.sort((a,b)=>profile.preference==="cheapest"&&!profile.regularId?a.price-b.price:b.score-a.score||a.price-b.price);
    return products[0]||null;
  }
  function visitor(save,profile){bump(save,"visitors");emit(save,"customerEntered",{regularId:profile?.regularId});}
  function lost(save,reason,profile){if(save.business.phase!=="open")return;bump(save,"lostCustomers");save.business.reputation=Math.max(0,save.business.reputation-.3);emit(save,"customerLeft",{reason,regularId:profile?.regularId});}
  function traffic(save){return cfg.customers.traffic.find(t=>save.business.minute>=t.from&&save.business.minute<t.to)?.multiplier||1;}
  function profile(random=Math.random,save=null){const list=cfg.customers.profiles;let value=random()*list.reduce((sum,p)=>sum+p.weight,0);const chosen=clone(list.find(p=>(value-=p.weight)<=0)||list.at(-1));return window.ShopModules&&save?ShopModules.value("customer.profile",save,chosen,{random}):chosen;}
  function open(save){if(save.business.phase!=="preparing")return false;save.business.minute=Math.max(save.business.minute,cfg.clock.openMinute);save.business.phase="open";save.business.paused=false;deliveries(save);emit(save,"shopOpened");return true;}
  function settle(save){
    if(save.business.phase==="closed")return save.business.report;
    if(save.business.phase!=="open")return null;
    save.business.phase="closed";
    const cost=dailyCost(save),paid=Math.min(save.shop.cash,cost);save.shop.cash-=paid;save.business.debt+=cost-paid;
    const achieved=save.business.daily.revenue>=save.business.goal;
    save.business.reputation=Math.max(0,Math.min(100,save.business.reputation+(achieved?2:-1)));
    emit(save,"dayClosed",{achieved,revenue:save.business.daily.revenue,operatingCost:cost});window.ShopTasks?.evaluate(save);
    save.business.report={day:save.business.day,minute:save.business.minute,goal:save.business.goal,achieved,...clone(save.business.daily),operatingCost:cost,operatingPaid:paid,operatingUnpaid:cost-paid,cashEnd:save.shop.cash,trashAtClose:total(save.trash),reputation:save.business.reputation};
    return save.business.report;
  }
  function nextDay(save){
    if(save.business.phase!=="closed")return {ok:false,error:"请先打烊结算。"};
    window.ShopTasks?.claimReady(save,"daily");
    const cleared=total(save.trash),clearedCards=clone(save.trash);save.business.report.clearedTrash=cleared;save.business.report.cashEnd=save.shop.cash;save.business.report.taskRewards=save.business.daily.taskRewards;
    save.business.history.push(clone(save.business.report));save.business.history=save.business.history.slice(-30);
    save.trash={};save.business.day++;save.business.minute=cfg.clock.prepareMinute;save.business.phase="preparing";save.business.goal=goal(save.business.day);save.business.daily=daily();save.business.report=null;save.business.cashStart=save.shop.cash;save.business.paused=false;
    window.ShopTasks?.prune(save);deliveries(save);emit(save,"dayStarted",{clearedTrash:cleared,clearedCards});return {ok:true,cleared};
  }
  function tick(save,seconds){
    if(save.business.paused||save.business.phase==="closed"||!Number.isFinite(seconds)||seconds<=0)return {minutes:0,closed:false};
    const old=save.business.minute,limit=save.business.phase==="preparing"?cfg.clock.openMinute:cfg.clock.closeMinute;
    save.business.minute=Math.min(limit,old+Math.min(seconds,1)*cfg.clock.minutesPerSecond*save.business.speed);deliveries(save);window.ShopModules?.tick(save,save.business.minute-old);window.ShopTasks?.evaluate(save);
    if(save.business.phase==="open"&&save.business.minute>=cfg.clock.closeMinute){settle(save);return {minutes:save.business.minute-old,closed:true};}
    return {minutes:save.business.minute-old,closed:false};
  }
  function time(minute){const value=Math.floor(minute);return `${String(Math.floor(value/60)).padStart(2,"0")}:${String(value%60).padStart(2,"0")}`;}
  return {get config(){return cfg;},OVERRIDE_KEY,validate,configure,loadConfig,initialise,setCatalog(value){catalog=value;},goal,daily,total,bump,emit,addCash,stamp,wholesale,referenceCard,retailPack,retailCard,capacity,dailyCost,shelfUsed,order,deliveries,receive,movePacks,openPack,noteTransfer,sell,checkout,chooseProduct,visitor,lost,traffic,profile,open,settle,nextDay,tick,time,on(fn){listeners.add(fn);return()=>listeners.delete(fn);}};
})();
