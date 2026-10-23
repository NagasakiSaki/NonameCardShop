import {CONTRACT,RARITIES,clone,id,need,fail,integer,errorDTO,page,serial,debit,credit,sum} from './common.mjs';
import {validateRules,buildCatalog,cardSummary,catalogList} from './catalog.mjs';
import {publishProducts,productDTO,unsealBox} from './products.mjs';
import {createWorld,validateWorld,snapshot,note} from './world.mjs';
import {owned,free,playerItem,referencePrice,updatePrices,inventoryList,openingPreview,executeOpening,surplusPreview,listSurplus,placeListing,settleTrade,receiveOrder,tickEconomy,income,wallet} from './trading.mjs';
import {eligible,combatPreview,registerMatch,beginMatch,engineMessage,matchById,surrender,cancelPrepared} from './matches.mjs';
import {validateMap,pathfind,moveActor,canStand} from './navigation.mjs';
import {initialiseManagement,configureManagement,validateManagement,managementEffects,shelfUsed,upgradesView,purchaseUpgrade,ensureRegulars,tickManagement,peopleView,neighborAct} from './management.mjs';
import {tickNpcTables,backgroundState} from './npc-tables.mjs';
import {voidNpcMatch} from './matches.mjs';

const tasks=[
  {taskId:'first-order',title:'第一次进货',metric:'ordered',target:3,reward:40,guide:'store.counter'},
  {taskId:'first-receipt',title:'签收三包卡',metric:'received',target:3,reward:40,guide:'store.counter'},
  {taskId:'first-opening',title:'自己开一包',metric:'opened',target:1,reward:40,guide:'store.counter'},
  {taskId:'first-sale',title:'迎来首位买包顾客',metric:'sales',target:1,reward:50,guide:'store.retail'},
  {taskId:'first-market',title:'完成首笔单卡出售',metric:'marketSales',target:1,reward:50,guide:'store.secondaryMarket'},
  {taskId:'first-match',title:'亲自完成一场正式比赛',metric:'playerMatches',target:1,reward:50,guide:'battleRoom.service'},
  {taskId:'first-npc-match',title:'接待一场 NPC 比赛',metric:'npcMatches',target:1,reward:20,guide:'battleRoom.service'}
];

export async function createRuntime({source,rules,repository,maps=[],managementConfig=null,backgroundAvailable=false,now=()=>Date.now()}){
  validateRules(rules);
  let catalog=buildCatalog(source,rules),record=await repository.read();
  if(!record){const world=createWorld(rules);initialiseManagement(world,managementConfig);ensureRegulars(world);world.products=publishProducts(catalog,rules,1);record={schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:false};record.archives.push(archive(world,'start'));await repository.commit(record,null);}
  initialiseManagement(record.world,managementConfig);ensureRegulars(record.world);record.world.player.actorId='actor:owner';
  validateWorld(record.world);validateRules(record.world.rules);catalog=buildCatalog(source,record.world.rules);
  for(const m of record.world.matches)if(m.status==='running'){
    if(m.background&&(record.world.pendingEngineEvents||[]).some(e=>e.matchId===m.matchId&&e.message.matchId===m.gameId))m.needsRestartAfterEvents=true;
    else m.status='interrupted';
  }
  const listeners=new Set(),pauses=new Map(),quotes=new Map(),previews=new Map(),navigation=new Map(maps.map(m=>[m.mapId,validateMap(m)]));
  let connected=false,clientId,sessionId,seq=0,queue=Promise.resolve(),disconnected=false,lastInputSeq=-1,movement=null;
  const serially=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const reasons=()=>[...pauses.values()].map(p=>({code:p.ownerId,label:p.reason}));
  const backgroundRunning=()=>connected&&!disconnected&&!record.world.clock.manualPaused&&!pauses.size&&['open','closing'].includes(record.world.clock.phase);
  const w=()=>record.world;
  const emit=(type,data)=>{const event={contractVersion:CONTRACT,worldId:w().worldId,branchId:w().branchId,seq:++seq,revision:record.revision,type,data:clone(data)};for(const listener of listeners)try{listener(event);}catch{}};
  const publish=()=>{emit('snapshotUpdated',snapshot(w(),reasons()));emit('actorsUpdated',[w().player,...w().npcs].map(({wallet,trip,...actor})=>actor));};
  function live(){need(connected&&!disconnected,'NOT_CONNECTED','请先连接新版世界。');}
  function archive(world,slot){return {id:id('archive'),format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:world.clock.day,minute:world.clock.minute,slot,createdAt:now(),world:clone(world)};}
  function saveArchive(next,slot){
    if(['start','close'].includes(slot)&&next.archives.some(a=>a.worldId===next.world.worldId&&a.branchId===next.world.branchId&&a.day===next.world.clock.day&&a.slot===slot))return;
    next.archives.push(archive(next.world,slot));
    const cutoff=next.world.clock.day-next.world.rules.maxDays;
    next.archives=next.archives.filter(a=>a.slot==='before-load'||a.day>=cutoff).slice(-next.world.rules.maxArchives);
  }
  async function persist(next){next.revision=record.revision+1;next.world.revision=next.revision;validateWorld(next.world);const rulesChanged=JSON.stringify(next.world.rules)!==JSON.stringify(w().rules);await repository.commit(next,record.revision);record=next;if(rulesChanged)catalog=buildCatalog(source,w().rules);publish();}
  function token(map,value){const tokenId=id('token');map.set(tokenId,{...clone(value),worldId:w().worldId,branchId:w().branchId,day:w().clock.day});return tokenId;}
  function lookup(map,tokenId,kind){const value=map.get(tokenId);need(value&&value.worldId===w().worldId&&value.branchId===w().branchId&&value.day===w().clock.day&&(!kind||value.kind===kind),'PREVIEW_EXPIRED','预览或报价已过期，请重新确认。');return value;}
  function quote(input){
    const quantity=integer(input.quantity??1,1,20),unit=input.unit||'pack',direction=input.action||'purchase';
    let values,priceVersion,productVersion,extra={};
    if(input.listingId){const listing=w().listings.find(l=>l.listingId===input.listingId&&l.status==='active');need(listing,'OUT_OF_STOCK','挂单已售出或撤回。');need(quantity===1,'INVALID_INPUT','实体卡挂单每笔一张。');values={unitAmount:listing.unitAmount,feeAmount:0,totalDebit:listing.unitAmount,totalCredit:0};priceVersion=`listing:${listing.listingId}:${listing.unitAmount}`;extra={listingId:listing.listingId,ownerId:listing.ownerId};}
    else {need(['pack','box'].includes(unit),'INVALID_INPUT','商品单位不正确。');const product=w().products.find(p=>p.productId===input.productId);need(product?.availability==='available','UNAVAILABLE_PRODUCT',product?.unavailableReason||'商品不存在。');values={unitAmount:product.prices[unit][direction==='purchase'?'wholesale':'retail'],feeAmount:0};values.totalDebit=values.unitAmount*quantity;values.totalCredit=0;priceVersion=product.priceVersion;productVersion=product.productVersion;extra={productId:product.productId,unit,action:direction};}
    const value={quantity,...values,subtotal:values.unitAmount*quantity,priceVersion,productVersion,validUntil:{day:w().clock.day,minute:1200},explanation:['报价按当前供货/挂单版本冻结；确认前库存变化需重新报价。'],...extra};
    return {...value,quoteId:token(quotes,value)};
  }
  function stats(cardKey,mode='bo3'){const s=w().stats[`${cardKey}|${mode}`]||{wins:0,losses:0,draws:0};const games=s.wins+s.losses+s.draws;return {...s,cardKey,mode,games,winRate:games?(s.wins+.5*s.draws)/games:null,insufficientSamples:games<20,label:mode==='kof'?'KOF 出场队伍胜率':'BO3 整场胜率'};}
  async function query(name,p={}){
    try{live();await queue;
      let data;
      switch(name){
        case 'shop.snapshot':data=snapshot(w(),reasons());break;
        case 'catalog.list':data=catalogList(catalog,p);break;
        case 'catalog.detail':{const c=catalog.byKey.get(p.cardKey);need(c,'NOT_FOUND','卡牌不存在。');data={...cardSummary(c),title:c.title,skills:clone(c.skills),power:clone(c.power),price:referencePrice(w(),catalog,c.cardKey),circulation:w().circulation[c.cardKey]||null,stats:['bo3','kof'].map(mode=>stats(c.cardKey,mode)),skillSourceAvailable:true};break;}
        case 'inventory.list':data=inventoryList(w(),catalog,p);break;
        case 'products.list':data=page(w().products.filter(x=>!p.themeId||x.themeId===p.themeId).map(productDTO),p);break;
        case 'products.quote':case 'market.quote':data=quote(p);break;
        case 'supplier.orders':data=page(w().orders.filter(o=>!p.status||o.status===p.status).map(({product,...o})=>({...clone(o),product:productDTO(product)})),p);break;
        case 'opening.preview':{const value=openingPreview(w(),p);data={...value,previewId:token(previews,value)};break;}
        case 'inventory.surplusPreview':{const value=surplusPreview(w(),catalog,p);data={...value,previewId:token(previews,value)};break;}
        case 'market.list':data=page(w().listings.filter(l=>(p.status?l.status===p.status:l.status==='active')&&(!p.ownerId||l.ownerId===p.ownerId)).map(l=>({...clone(l),name:catalog.byKey.get(l.cardKey)?.name,printedRarity:w().items[l.inventoryRef]?.printedRarity})),p);break;
        case 'cardStats.summary':data=stats(p.cardKey,p.mode);break;
        case 'room.snapshot':data={roomId:'battle-room',tables:w().tables.map((t,i)=>{const m=w().matches.find(m=>m.matchId===t.matchId);return {...clone(t),label:`${i+1} 号牌桌`,status:m?(m.status==='running'?'in-progress':'waiting'):t.reservation?'reserved':'idle',mode:m?.mode||'BO3 / KOF',seated:m?2:0,maxSeats:2,stake:{base:w().rules.baseStake,final:m?.stake||0},fee:managementEffects(w()).tableFee,rakeRate:w().rules.rake,note:m?.background?'NPC 真实引擎对战':null};}),matches:clone(w().matches),tableFee:managementEffects(w()).tableFee,rake:w().rules.rake,wageringEnabled:w().rules.wageringEnabled,note:'NPC 使用实际持有的流通卡；当前开放无赌注比赛。'};break;
        case 'combat.eligible':data={mode:p.mode||'bo3',slots:p.mode==='kof'?3:1,items:eligible(w(),catalog,p.ownerId||'player').map(i=>({...i,reasons:i.disabledReasons}))};break;
        case 'combat.preview':{const value=combatPreview(w(),catalog,p);data={...value,previewId:token(previews,value),lineup:value.mine,fee:value.tableFee,balance:w().wallet.available,rules:['实体副本锁定至整场结束','玩家参赛免该桌抽水','当前只开放无赌注比赛'],stakeProposal:{proposalId:value.stakeProposalId,multiplier:value.multiplier,base:w().rules.baseStake,final:value.stakeAmount,reason:value.explanation}};break;}
        case 'tasks.list':data=tasks.map(t=>({...t,progress:w().lifetime[t.metric]||0,completed:(w().lifetime[t.metric]||0)>=t.target,claimed:!!w().tasks[t.taskId]}));break;
        case 'ledger.daily':data=p.day&&p.day!==w().clock.day?w().reports.find(r=>r.day===p.day)||null:{day:w().clock.day,...clone(w().daily),wallet:clone(w().wallet)};break;
        case 'management.people':data=peopleView(w());break;
        case 'management.upgrades':data=upgradesView(w());break;
        case 'management.orders':data={items:[...w().orders.filter(o=>o.status!=='received').map(o=>({...clone(o),themeName:o.product.name,productVersion:o.product.productVersion,total:o.cost})),...(w().management?.requests||[]).filter(r=>['offered','accepted'].includes(r.status)).map(r=>({...clone(r),unit:'card',themeName:catalog.byKey.get(r.cardKey)?.name,productVersion:'单卡二级市场',total:r.amount}))]};break;
        case 'config.list':data={items:[{configId:'backend-rules',label:'全局评分、供货与经营',editable:true,text:JSON.stringify(w().rules,null,2)},...(w().management?[{configId:'backend-management',label:'设施、员工与街坊',editable:true,text:JSON.stringify(w().management.config,null,2)}]:[])],permissions:{canEdit:true,role:'owner'}};break;
        case 'config.validate':{const value=p.value??JSON.parse(p.draft||'null');if(p.configId==='backend-management')validateManagement(value);else validateRules(value);data={valid:true,parsed:value,warnings:[]};break;}
        case 'saves.list':data=record.archives.filter(a=>(!p.day||a.day===p.day)&&(!p.branchId||a.branchId===p.branchId)).map(({world,...meta})=>clone(meta));break;
        case 'operations.get':{const op=record.requests[p.requestId||p.operationId];data=op?{status:op.result.ok?'succeeded':'failed',...clone(op)}:{status:'unknown'};break;}
        case 'world.maps':data=[...navigation.values()].map(clone);break;
        default:fail('UNSUPPORTED_QUERY',`尚未实现查询：${name}`);
      }
      return {ok:true,revision:record.revision,data:clone(data)};
    }catch(e){return {ok:false,error:errorDTO(e)};}
  }

  async function command(input){return serially(async()=>{
    const requestId=input?.requestId;
    try{
      live();need(typeof requestId==='string'&&/^[a-zA-Z0-9_-]{1,150}$/.test(requestId),'INVALID_INPUT','requestId 必须是稳定且唯一的字母数字标识。');
      const signature=JSON.stringify({type:input.type,payload:input.payload||{},quoteId:input.quoteId,previewId:input.previewId});
      if(record.requests[requestId]){need(record.requests[requestId].signature===signature,'REQUEST_ID_REUSED','同一请求 ID 不能用于不同操作。');return clone(record.requests[requestId].result);}
      const next=clone(record),world=next.world,p=input.payload||{};
      need(p&&typeof p==='object'&&!Array.isArray(p),'INVALID_INPUT','操作参数格式不正确。');
      const data=handleCommand(next,input,p);
      const result={ok:true,requestId,revision:record.revision+1,data:clone(data)};
      next.requests[requestId]={signature,result};
      await persist(next);
      if(input.previewId)previews.delete(input.previewId);
      if(input.type==='saves.load'||input.type==='saves.import'){quotes.clear();previews.clear();movement=null;emit('worldReset',snapshot(w(),reasons()));}
      return result;
    }catch(e){return {ok:false,requestId,error:errorDTO(e)};}
  });}

  function handleCommand(next,input,p){
    const world=next.world;
    const item=()=>playerItem(world,p.inventoryRef);
    const station=input.type.startsWith('supplier.')||input.type==='boxes.unseal'||input.type==='opening.execute'?'store.counter':input.type.startsWith('market.')?'store.secondaryMarket':input.type.startsWith('retail.')?'store.retail':input.type==='inventory.discard'||input.type==='inventory.recover'?'store.trash':null;
    if(station&&navigation.size){const map=navigation.get(world.player.roomId),anchor=map?.anchors[station];need(anchor&&Math.hypot(world.player.x-anchor.x,world.player.y-anchor.y)<=(anchor.radius||24),'NOT_IN_RANGE','请先走到对应柜台或家具旁边。');}
    switch(input.type){
      case 'clock.setManualPause':need(typeof p.paused==='boolean','INVALID_INPUT','暂停开关不正确。');world.clock.manualPaused=p.paused;return {};
      case 'clock.setSpeed':need([1,2,4].includes(p.speed),'INVALID_INPUT','营业倍率只支持 1/2/4。');world.clock.speed=p.speed;return {};
      case 'business.open':need(world.clock.phase==='preparing','INVALID_STATE','当前不是营业准备阶段。');world.clock.phase='open';world.clock.minute=540;return {};
      case 'business.close':{
        need(['open','closing'].includes(world.clock.phase),'INVALID_STATE','今天已关闭或尚未开门。');need(!world.matches.some(m=>m.status!=='finished'),'MATCH_ACTIVE','请先完成或取消未结束的牌局。');
        const wages=managementEffects(world).wages,cost=world.rules.operatingCost+wages,paid=Math.min(cost,world.wallet.available);world.wallet.available-=paid;world.wallet.debt+=cost-paid;world.daily.operating=cost;world.daily.wages=wages;world.clock.phase='closed';world.reports.push({day:world.clock.day,...clone(world.daily)});saveArchive(next,'close');return {report:clone(world.daily)};
      }
      case 'business.nextDay':{
        need(world.clock.phase==='closed','INVALID_STATE','请先结算打烊。');
        for(const i of Object.values(world.items))if(i.ownerId==='player'&&i.location==='trash')delete world.items[i.inventoryRef];
        world.clock.day++;world.clock.minute=480;world.clock.phase='preparing';world.daily={goods:0,cogs:0,service:0,fees:0,matchNet:0,operating:0,purchases:0};
        for(const n of world.npcs){credit(n.wallet,world.rules.npcDailyIncome);note(world,'npcDailyIncome',{actorId:n.actorId,externalFunds:world.rules.npcDailyIncome});}
        updatePrices(world,buildCatalog(source,world.rules));world.products=publishProducts(buildCatalog(source,world.rules),world.rules,world.clock.day,world.prices);world.nextNpcMinute=540;
        for(const o of world.orders)if(o.status==='pending'&&o.dueAt<=world.clock.day*1440+480)o.status='arrived';
        if(world.management){world.management.nextRestockAt=world.clock.day*1440+480+world.management.config.restockIntervalMinutes;tickManagement(world,buildCatalog(source,world.rules));}
        saveArchive(next,'start');return {};
      }
      case 'supplier.placeOrder':{
        need(world.clock.phase!=='closed','SHOP_CLOSED','请在准备或营业时下单。');const q=lookup(quotes,input.quoteId);need(q.action==='purchase'&&q.productId===p.productId&&q.quantity===p.quantity&&q.unit===(p.unit||'pack'),'QUOTE_EXPIRED','采购参数与报价不一致。');
        const product=world.products.find(x=>x.productId===p.productId);need(product?.productVersion===q.productVersion,'QUOTE_EXPIRED','供货版本已变化。');
        const shortfall=Math.max(0,q.totalDebit-world.wallet.available);need(!shortfall||p.credit&&world.wallet.debt+shortfall<=world.rules.supplierCreditLimit,'INSUFFICIENT_FUNDS','游戏币或供应商信用额度不足。');
        world.wallet.available-=q.totalDebit-shortfall;world.wallet.debt+=shortfall;
        const order={orderId:serial(world,'order'),product:clone(product),productId:product.productId,unit:q.unit,quantity:q.quantity,unitCost:q.unitAmount,cost:q.totalDebit,status:'pending',dueAt:world.clock.day*1440+world.clock.minute+world.rules.deliveryMinutes};
        world.orders.push(order);world.daily.purchases+=order.cost;world.lifetime.ordered+=q.quantity*(q.unit==='box'?24:1);note(world,'orderPlaced',{orderId:order.orderId,amount:order.cost});return {orderId:order.orderId};
      }
      case 'supplier.receive':return receiveOrder(world,world.orders.find(o=>o.orderId===p.orderId));
      case 'boxes.unseal':return {inventoryRefs:(p.boxIds||[p.inventoryRef]).flatMap(ref=>{const i=playerItem(world,ref);need(!i.protected,'ITEM_LOCKED','卡盒受保护。');return unsealBox(world,i).map(p=>p.inventoryRef);})};
      case 'opening.execute':{const preview=lookup(previews,input.previewId,'opening');need(preview.refs.length,'OUT_OF_STOCK','没有可拆卡包。');const result=executeOpening(world,preview);return {operationId:input.requestId,...result};}
      case 'inventory.setProtection':{const i=item();need(!i.lock,'ITEM_LOCKED','被交易或比赛占用的物品不能改保护状态。');need(typeof p.protected==='boolean','INVALID_INPUT','保护开关不正确。');i.protected=p.protected;return {};}
      case 'inventory.discard':{const i=item();need(i.kind==='card'&&i.location==='collection'&&free(i),'ITEM_LOCKED','只能丢弃未保护、未占用的收藏卡。');i.location='trash';return {};}
      case 'inventory.recover':{const selected=p.all?owned(world).filter(i=>i.location==='trash'):[item()];for(const i of selected){need(i.location==='trash','INVALID_STATE','该卡不在垃圾桶。');i.location='collection';}return {quantity:selected.length};}
      case 'retail.list':{const i=item();need(['pack','box'].includes(i.kind)&&i.location==='stock'&&free(i),'INVALID_ITEM','正店只出售未锁定的密封包/盒。');const e=managementEffects(world);need(shelfUsed(world)+(i.kind==='box'?e.boxShelfUnits:1)<=e.shelfCapacity,'SHELF_FULL','零售货架空间不足，可升级货架。');i.location='retail';return {};}
      case 'retail.withdraw':{const i=item();need(i.location==='retail'&&!i.lock,'ITEM_LOCKED','不能撤下该商品。');i.location='stock';return {};}
      case 'retail.setPrice':{const i=item();need(i.location==='retail','INVALID_STATE','商品未在零售货架。');i.retailPrice=integer(p.amount,1,1000000);return {};}
      case 'market.listSurplus':return listSurplus(world,catalog,lookup(previews,input.previewId,'surplus'),p);
      case 'market.placeListing':{const i=item();return placeListing(world,catalog,i,integer(p.amount??referencePrice(world,catalog,i.cardKey),1,1000000));}
      case 'market.cancelListing':{const l=world.listings.find(l=>l.listingId===p.listingId&&l.ownerId==='player'&&l.status==='active');need(l,'NOT_FOUND','挂单不存在。');const i=playerItem(world,l.inventoryRef);i.location='collection';i.lock=null;l.status='cancelled';return {};}
      case 'market.acceptTrade':{const q=lookup(quotes,input.quoteId);need(q.listingId===p.listingId,'QUOTE_EXPIRED','交易与报价不一致。');const l=world.listings.find(l=>l.listingId===p.listingId);need(l?.unitAmount===q.unitAmount,'QUOTE_EXPIRED','单卡报价已变化。');return settleTrade(world,l,'player');}
      case 'room.reserve':{const t=world.tables.find(t=>t.tableId===p.tableId);need(t&&!t.matchId&&!t.reservation,'TABLE_BUSY','桌位不可预约。');t.reservation='player';return clone(t);}
      case 'room.cancelReservation':{const t=world.tables.find(t=>t.tableId===p.tableId);need(t?.reservation==='player'&&!t.matchId,'TABLE_BUSY','无法取消该预约。');t.reservation=null;return {};}
      case 'combat.register':{const m=registerMatch(world,catalog,lookup(previews,input.previewId,'combat'),p);return {...m,match:clone(m),note:'阵容与开桌费用已冻结。'};}
      case 'combat.start':case 'combat.continue':need(!matchById(world,p.matchId).background,'NPC_MATCH_CONTROLLED','NPC 牌局由后台引擎调度。');return beginMatch(world,p.matchId);
      case 'combat.surrender':need(!matchById(world,p.matchId).background,'NPC_MATCH_CONTROLLED','不能替 NPC 认输并刷战绩。');return surrender(world,p.matchId,p.scope);
      case 'combat.cancel':need(!matchById(world,p.matchId).background,'NPC_MATCH_CONTROLLED','请使用对战房的取消后台牌局操作。');return cancelPrepared(world,p.matchId);
      case 'room.cancelNpcMatch':return voidNpcMatch(world,p.matchId,'店主取消后台对局；不计战绩。');
      case 'upgrades.purchase':return purchaseUpgrade(world,p.upgradeId);
      case 'neighbors.act':return neighborAct(world,catalog,p);
      case 'tasks.claim':{const t=tasks.find(t=>t.taskId===p.taskId);need(t&&!world.tasks[t.taskId]&&world.lifetime[t.metric]>=t.target,'NOT_READY','任务尚未完成或已领取。');world.tasks[t.taskId]=true;income(world,t.reward);return {reward:t.reward};}
      case 'config.apply':{const value=p.value??JSON.parse(p.draft||'null');if(p.configId==='backend-management')return configureManagement(world,value);need(p.configId==='backend-rules','INVALID_INPUT','配置 ID 不正确。');validateRules(value);world.rules=clone(value);note(world,'configChanged',{ratingVersion:value.ratingVersion});return {productsEffective:'nextDay'};}
      case 'config.restoreDefault':if(p.configId==='backend-management'){need(managementConfig,'FEATURE_UNAVAILABLE','经营默认参数尚未加载。');return configureManagement(world,managementConfig);}need(!p.configId||p.configId==='backend-rules','INVALID_INPUT','配置 ID 不正确。');world.rules=clone(rules);return {};
      case 'saves.create':need(!world.matches.some(m=>m.status==='running'),'MATCH_ACTIVE','运行中的牌局不能存档。');saveArchive(next,'manual');return {archiveId:next.archives.at(-1).id};
      case 'saves.export':{const a=p.archiveId?next.archives.find(a=>a.id===p.archiveId):archive(world,'manual');need(a,'NOT_FOUND','档案不存在。');return {fileName:`card-shop-day-${a.day}.json`,mimeType:'application/json',content:JSON.stringify(a)};}
      case 'saves.load':case 'saves.import':{
        need(!world.matches.some(m=>m.status==='running'||m.stake&&m.status!=='finished'),'MATCH_ACTIVE','请先结束当前比赛。');
        const a=input.type==='saves.load'?next.archives.find(a=>a.id===p.archiveId):typeof p.content==='string'&&p.content.length<10000000?JSON.parse(p.content):null;
        need(a?.format==='noname-shop-world-save'&&a.version===2,'INVALID_SAVE','档案格式不支持。');validateWorld(a.world);validateRules(a.world.rules);
        for(const i of Object.values(a.world.items))need(['pack','box','card'].includes(i.kind)&&Number.isSafeInteger(i.cost)&&i.cost>=0&&(!i.cardKey||catalog.byKey.has(i.cardKey)),'INVALID_SAVE','库存数据不完整。');
        saveArchive(next,'before-load');next.world=clone(a.world);initialiseManagement(next.world,managementConfig);ensureRegulars(next.world);next.world.player.actorId='actor:owner';next.world.branchId=id('branch');next.world.pendingEngineEvents=[];for(const m of next.world.matches)if(m.status==='running')m.status='interrupted';return {worldId:next.world.worldId,branchId:next.world.branchId};
      }
      case 'world.changeRoom':{
        const map=navigation.get(world.player.roomId),door=map?.anchors[p.anchorId];need(door?.targetRoom&&door?.targetAnchor,'NOT_FOUND','房间出口不存在。');need(Math.hypot(world.player.x-door.x,world.player.y-door.y)<=(door.radius||24),'NOT_IN_RANGE','请先走到门口。');const nextMap=navigation.get(door.targetRoom),anchor=nextMap?.anchors[door.targetAnchor];need(anchor,'NAVIGATION_UNAVAILABLE','目标地图尚未就绪。');world.player={...world.player,roomId:nextMap.mapId,navVersion:nextMap.navVersion,x:anchor.x,y:anchor.y,moving:false};movement=null;return clone(world.player);
      }
      default:fail('UNSUPPORTED_COMMAND',`尚未实现操作：${input.type}`);
    }
  }

  async function advance(seconds){return serially(async()=>{
    if(!connected||disconnected||w().clock.manualPaused||pauses.size)return;
    const clockRunning=w().clock.phase==='open'||w().clock.phase==='preparing'&&w().clock.minute<540;
    if(!clockRunning&&!movement&&!w().matches.some(m=>m.background&&m.status!=='finished')&&!(w().pendingEngineEvents||[]).length)return;
    const next=clone(record),world=next.world,limit=world.clock.phase==='preparing'?540:1200;
    if(clockRunning)world.clock.minute=Math.min(limit,world.clock.minute+Math.min(1,Math.max(0,seconds))*world.rules.minutesPerSecond*world.clock.speed);
    for(const o of world.orders)if(o.status==='pending'&&o.dueAt<=world.clock.day*1440+world.clock.minute)o.status='arrived';
    for(const event of world.pendingEngineEvents||[]){const match=world.matches.find(m=>m.matchId===event.matchId);if(match?.status==='running'&&match.gameId===event.message.matchId)engineMessage(world,event.matchId,event.message);}world.pendingEngineEvents=[];
    for(const m of world.matches)if(m.needsRestartAfterEvents){if(m.status==='running')m.status='interrupted';delete m.needsRestartAfterEvents;}
    tickManagement(world,catalog);
    if(clockRunning&&world.clock.minute<1200)tickEconomy(world,catalog,{map:navigation.get('store'),seconds});
    tickNpcTables(world,catalog,navigation,seconds,{schedule:backgroundAvailable});
    const map=navigation.get(world.player.roomId);if(map){world.player.navVersion=map.navVersion;moveActor(map,world.player,movement,seconds);}
    if(world.clock.phase==='open'&&world.clock.minute>=1200){world.clock.phase='closing';note(world,'shopClosing');}
    await persist(next);
  });}
  return {
    async connect(p){need(p?.contractVersion===CONTRACT,'CONTRACT_MISMATCH','前后端契约版本不一致。');need(typeof p.clientId==='string','INVALID_INPUT','缺少会话 ID。');clientId=p.clientId;sessionId=id('session');connected=true;disconnected=false;return {contractVersion:CONTRACT,worldId:w().worldId,branchId:w().branchId,sessionId,revision:record.revision,currency:{code:'SHOP',label:'游戏币',minorUnit:1},capabilities:{clock:true,inventory:true,products:true,market:true,combat:true,wagering:false,saves:true,navigation:navigation.size>0,upgrades:!!w().management,neighbors:!!w().management,npcAutoBattles:backgroundAvailable},initialSnapshot:snapshot(w(),reasons())};},
    query,command,subscribe(listener){listeners.add(listener);publish();return()=>listeners.delete(listener);},
    pause:{async acquire(p){live();need(p?.ownerId&&p?.reason,'INVALID_INPUT','缺少暂停原因。');const lease={leaseId:id('pause'),ownerId:p.ownerId,reason:p.reason};pauses.set(lease.leaseId,lease);movement=null;publish();return clone(lease);},async release(leaseId){pauses.delete(leaseId);publish();}},
    world:{input(p){if(!connected||disconnected||p?.sessionId!==sessionId||!Number.isSafeInteger(p.inputSeq)||p.inputSeq<=lastInputSeq)return;lastInputSeq=p.inputSeq;movement=null;if(p.stop||pauses.size||w().clock.manualPaused)return;try{const map=navigation.get(w().player.roomId);need(map&&p.navVersion===map.navVersion&&p.roomId===map.mapId,'NAVIGATION_UNAVAILABLE','导航版本未就绪。');if(p.direction)need(['up','down','left','right'].includes(p.direction),'INVALID_INPUT','方向不合法。');movement=p.direction?{direction:p.direction}:p.destination?{path:pathfind(map,w().player,p.destination)}:null;}catch(e){emit('notification',{level:'error',...errorDTO(e)});}}},
    async disconnect(){disconnected=true;connected=false;movement=null;await queue;await repository.close?.();listeners.clear();},
    advance,
    async trustedEngineEvent(matchId,message){return serially(async()=>{const next=clone(record),m=matchById(next.world,matchId);if(m.background&&!backgroundRunning()){need(m.status==='running'&&m.gameId===message.matchId,'STALE_EVENT','过期的后台牌局事件。');const events=next.world.pendingEngineEvents||=[];if(!events.some(e=>e.matchId===matchId&&JSON.stringify(e.message)===JSON.stringify(message)))events.push({matchId,message:clone(message)});await persist(next);return {deferred:true};}const data=engineMessage(next.world,matchId,message);await persist(next);emit('battleStatusChanged',data);return data;});},
    backgroundState(){return backgroundState(w(),!backgroundRunning());},
    async startBackgroundMatch(matchId){return serially(async()=>{need(backgroundRunning(),'WORLD_PAUSED','经营世界已暂停。');const next=clone(record),m=matchById(next.world,matchId);need(m.background&&backgroundState(next.world,false).matches.find(x=>x.matchId===matchId)?.seated,'NOT_READY','NPC 还未入座。');const data=beginMatch(next.world,matchId);await persist(next);return data;});},
    async failBackgroundMatch(matchId,reason){return serially(async()=>{const next=clone(record);const data=voidNpcMatch(next.world,matchId,reason);await persist(next);emit('battleStatusChanged',data);return data;});},
    async interrupt(matchId){return serially(async()=>{const next=clone(record),m=matchById(next.world,matchId);if(m.status==='running'){m.status='interrupted';await persist(next);}});},
    inspect(){return clone(record);},
    async markLegacyReset(){return serially(async()=>{if(record.legacyResetDone)return;const next=clone(record);next.legacyResetDone=true;await persist(next);});}
  };
}
