import {createArchivePolicy} from './archive-policy.mjs';
import {PRINT_EDITION_VERSION} from '../economy-v7/collation-policy.mjs';
import * as Rooms from './battle-rooms.mjs';
import * as Debt from './debt-challenge.mjs';
import {loanBalance,repayLoan} from './campaign-loan.mjs';
import {productContents} from './product-catalog.mjs';
import {reconcileMarket} from './market-policy.mjs';
import {reconcileManagementMarket} from './management.mjs';
import {initialiseRooms,activeRoom} from './room-state.mjs';
import {initialiseRating,RATED_FORMATS,MODE_LABELS} from './strength-modes.mjs';
import * as V7 from './operations-v7.mjs';
import {getFormat,buildRoundPlan} from '../combat-formats/index.mjs';
import {initialiseV7,isV7,assertSupply,replenishCustomer} from './v7-policy.mjs';
import {CONTRACT,RARITIES,clone,id,need,fail,integer,errorDTO,page,serial,debit,credit,sum} from './common.mjs';
import {validateRules,cardSummary,catalogList} from './catalog.mjs';
import {createCatalogProvider} from './catalog-cache.mjs';
import {publishProducts,productDTO,unsealBox} from './products.mjs';
import {createWorld,validateWorld,snapshot,note} from './world.mjs';
import {owned,free,playerItem,referencePrice,updatePrices,inventoryList,openingPreview,executeOpening,surplusPreview,listSurplus,placeListing,settleTrade,receiveOrder,tickEconomy,finishCustomerVisits,income,wallet} from './trading.mjs';
import {trashItems,discardCard,pickTrashCard,customerBehavior} from './trash.mjs';
import {eligible,combatPreview,registerMatch,beginMatch,engineMessage,matchById,surrender,cancelPrepared} from './matches.mjs';
import {validateMap,pathfind,moveActor,canStand} from './navigation.mjs';
import {initialiseManagement,configureManagement,validateManagement,managementEffects,shelfUsed,upgradesView,purchaseUpgrade,ensureRegulars,tickManagement,peopleView,neighborAct} from './management.mjs';
import {tickNpcTables,backgroundState} from './npc-tables.mjs';
import {tickPartnerActivities} from './partner-activities.mjs';
import {voidNpcMatch} from './matches.mjs';
import {inventoryView,cardDetailView,ledgerView,retailView,marketView,archiveMeta,sealedInventoryView,dayArchiveViews} from './views.mjs';
import {DEFAULT_DISTRIBUTION,productEnabled} from './distribution.mjs';
import {PLAYER_SKINS,normaliseWorldAppearances} from './appearances.mjs';
import {migrateCustomerIdentity} from './customer-identity.mjs';
import {basketQuote,placeBasketOrder} from './basket.mjs';
import {deliverImmediately} from './fulfillment.mjs';
import {grantStarterGift} from './starter-gift.mjs';
import {favoritesView,setFavorite,tableSettingsView,setTableFee} from './player-preferences.mjs';
import {playerQueue,queueView,joinQueue,leaveQueue,setWaitMode,tickMatchQueue,moveWaitingPlayer} from './match-queue.mjs';
import {activeTimeMatch,applyMatchTime} from './match-time.mjs';
import {migrateVisits,onSite} from './visits.mjs';
import {taskViews,initialiseDailyTasks,grantTaskRewards} from './tasks.mjs';
import {recordWalletChange,financeView} from './finance.mjs';
import {DEFAULT_STRENGTH_PRICING} from './supply-pricing.mjs';
import {initialiseExperience,configureExperience,validateExperienceConfig,experienceGuide,experienceEvents,scheduleExperienceEvent,experienceStories,experienceInsights} from './experience.mjs';
import {createNarrativeRuntime} from '../narrative/runtime.mjs';
import {loadStoryPack} from '../narrative/content.mjs';
import {createRegistry} from '../narrative/registry.mjs';


export async function createRuntime({source,rules,repository,maps=[],managementConfig=null,backgroundAvailable=false,now=()=>Date.now(),storyPacks=[],storyExtensions={},storyDiagnostics=[],storyActiveHashes=null,modeCapabilities=[]}){
  validateRules(rules);
  const catalogFor=createCatalogProvider(source);
  const verifiedPacks=await Promise.all(storyPacks.map(p=>loadStoryPack(p,{registry:createRegistry(storyExtensions)})));
  const narrative=createNarrativeRuntime({packs:verifiedPacks,extensions:storyExtensions,diagnostics:storyDiagnostics,currentHashes:storyActiveHashes});
  const navigation=new Map(maps.map(m=>[m.mapId,validateMap(m)]));
  const {archive,saveArchive}=createArchivePolicy({catalogFor,navigation,now});
  let catalog=catalogFor(rules),record=await repository.read();
  function upgradeDistribution(world){
    const expectedVersion=world.rules.operationsV7?PRINT_EDITION_VERSION:DEFAULT_DISTRIBUTION.version;
    if(!world.rules.distribution||world.products.some(p=>p.collationVersion!==expectedVersion)){
      world.rules.distribution??=clone(rules.distribution||DEFAULT_DISTRIBUTION);
      world.products=publishProducts(catalogFor(world.rules),world.rules,world.clock.day,world.prices,world);
      note(world,'distributionUpgraded',{version:expectedVersion,legacyContentsPreserved:true});
    }
    for(const item of Object.values(world.items))if(item.ownerId==='player'&&item.location==='retail'&&['pack','box'].includes(item.kind)&&!productEnabled(world.rules,item.productId))item.location='stock';
  }
  if(!record){const world=createWorld(rules);initialiseRooms(world);initialiseRating(world,rules);initialiseV7(world,rules,{fresh:true});if(narrative.contentAvailable)narrative.initialise(world,true);initialiseManagement(world,managementConfig);ensureRegulars(world);world.products=publishProducts(catalog,world.rules,1,world.prices,world);grantStarterGift(world);Debt.initialiseLongTerm(world);record={schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:false};record.archives.push(archive(world,'start'));await repository.commit(record,null);}
  upgradeDistribution(record.world);initialiseManagement(record.world,managementConfig);ensureRegulars(record.world);record.world.player.actorId='actor:owner';
  validateWorld(record.world);validateRules(record.world.rules);catalog=catalogFor(record.world.rules);
  for(const m of record.world.matches)if(m.status==='running'&&!m.simulated){
    if(m.background&&(record.world.pendingEngineEvents||[]).some(e=>e.matchId===m.matchId&&e.message.matchId===m.gameId))m.needsRestartAfterEvents=true;
    else m.status='interrupted';
  }
  const listeners=new Set(),pauses=new Map(),quotes=new Map(),previews=new Map(),engineProgress=new Map();
  let connected=false,clientId,sessionId,seq=0,queue=Promise.resolve(),disconnected=false,lastInputSeq=-1,movement=null;
  function normaliseActors(world){
    Debt.initialiseLongTerm(world);
    Debt.ensureLoanIntro(world);
    initialiseRooms(world);if(initialiseRating(world,rules))world.products=publishProducts(catalogFor(world.rules),world.rules,world.clock.day,world.prices,world);
    if(initialiseV7(world,rules))world.products=publishProducts(catalogFor(world.rules),world.rules,world.clock.day,world.prices,world);
    if(narrative.contentAvailable||world.narrative)narrative.initialise(world,false);
    initialiseExperience(world);
    if(world.gameplayRevision!==2){
      world.rules.npcSimulation=rules.npcSimulation!==false;world.rules.npcSimulationSeconds=rules.npcSimulationSeconds||18;
      world.rules.strengthPricing??=clone(DEFAULT_STRENGTH_PRICING);
      for(const m of world.matches)if(world.rules.npcSimulation!==false&&m.background&&!m.simulated&&m.status!=='finished')voidNpcMatch(world,m.matchId,'切换到 NPC 模拟对局，旧后台桌已取消并释放。');
      world.products=publishProducts(catalogFor(world.rules),world.rules,world.clock.day,world.prices,world);world.gameplayRevision=2;
    }
    initialiseDailyTasks(world);
    migrateVisits(world);
    migrateCustomerIdentity(world);
    normaliseWorldAppearances(world);
    reconcileMarket(world,catalog);
    reconcileManagementMarket(world,catalog);
    const occupied=new Set();
    for(const actor of [world.player,...world.npcs.filter(onSite)]){
      const oldName=/^顾客\s*(\d+)$/.exec(actor.name||'');if(oldName){const names=customerBehavior(world).names;actor.name=names[(Number(oldName[1])-1)%names.length];}
      const navigationChanged=actor.navVersion!==navigation.get(actor.roomId)?.navVersion;
      const map=navigation.get(actor.roomId);if(!map)continue;
      const key=(x,y)=>`${actor.roomId}:${Math.floor(x/16)}:${Math.floor(y/16)}`;
      if(!canStand(map,actor.x,actor.y)||occupied.has(key(actor.x,actor.y))){const points=[];for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){const p={x:x*16+8,y:y*16+8};if(canStand(map,p.x,p.y)&&!occupied.has(key(p.x,p.y)))points.push(p);}points.sort((a,b)=>Math.hypot(a.x-actor.x,a.y-actor.y)-Math.hypot(b.x-actor.x,b.y-actor.y));if(points[0])Object.assign(actor,points[0]);}
      occupied.add(key(actor.x,actor.y));actor.navVersion=map.navVersion;
      if(navigationChanged&&actor.trip?.path?.length){
        const goal=actor.trip.path.at(-1),fallback=map.anchors[actor.trip.stage==='discard'||actor.trip.stage==='scavenge'?'store.trash':'store.counter'];
        try{actor.trip.path=pathfind(map,actor,canStand(map,goal.x,goal.y)?goal:fallback||map.anchors['store.entry']);}
        catch{if(actor.trip.kind!=='match'){finishCustomerVisits(world,catalog);break;}}
      }
    }
  }
  normaliseActors(record.world);V7.restoreV7(record.world);Rooms.tickRooms(record.world,catalogFor(record.world.rules),modeCapabilities,{restore:true});catalog=catalogFor(record.world.rules);
  for(const operation of Object.values(record.requests)){operation.worldId??=record.world.worldId;operation.branchId??=record.world.branchId;}
  const serially=fn=>{const result=queue.then(fn);queue=result.catch(()=>{});return result;};
  const reasons=()=>[...[...pauses.values()].map(p=>({code:p.ownerId,label:p.reason})),...(activeTimeMatch(record.world)?[{code:'match-time',label:'店长对局中'}]:[])];
  const backgroundRunning=()=>connected&&!disconnected&&!record.world.clock.manualPaused&&!pauses.size&&!activeTimeMatch(record.world)&&['open','closing'].includes(record.world.clock.phase);
  const w=()=>record.world;
  // Archives and completed operation records are immutable; copy only mutable containers.
  const fork=()=>({...record,world:clone(record.world),archives:[...record.archives],requests:{...record.requests}});
  const emit=(type,data)=>{const event={contractVersion:CONTRACT,worldId:w().worldId,branchId:w().branchId,seq:++seq,revision:record.revision,type,data:clone(data)};for(const listener of listeners)try{listener(event);}catch{}};
  const publish=()=>{emit('snapshotUpdated',snapshot(w(),reasons()));emit('actorsUpdated',[w().player,...w().npcs.filter(onSite)].map(({wallet,trip,...actor})=>actor));};
  function live(){need(connected&&!disconnected,'NOT_CONNECTED','请先连接新版世界。');}
  function eventPlayers(world){const fee=managementEffects(world).tableFee;return world.npcs.filter(n=>!n.currentRoomId&&!n.currentMatchId&&n.wallet.available-(n.wallet.reserved||0)>=fee&&eligible(world,catalog,n.actorId).some(i=>i.eligible)).map(n=>({actorId:n.actorId,name:n.name}));}
  async function persist(next,operation='tick'){
    const narrativeRevision=record.world.narrative?.revision;
    applyMatchTime(next.world,catalog,navigation);
    Rooms.tickRooms(next.world,catalog,modeCapabilities);
    next.revision=record.revision+1;next.world.revision=next.revision;
    if(!['saves.load','saves.loadDay','saves.import'].includes(operation)){
      const oldIds=new Set(w().log.map(e=>e.eventId)),events=next.world.log.filter(e=>!oldIds.has(e.eventId));
      const names={packSaleCompleted:'顾客购买卡包/盒',secondaryTradeCompleted:'二级市场成交',npcSimulationSettled:'NPC 离桌付费',officialMatchSettled:'比赛结算',debtChallengeCleared:'牌局减免欠款',partnerWagerFunded:'伙伴约战托管',partnerWagerSettled:'伙伴约战结算',partnerWagerRefunded:'伙伴约战退款'};
      const lines=events.filter(e=>names[e.type]).map(e=>`${names[e.type]}${e.name?' · '+e.name:''}${e.names?' · '+e.names.join(' / '):''}${e.amount?' '+e.amount+' 币':''}${e.net!==undefined?` · 净胜负 ${e.net>=0?'+':''}${e.net} · 桌费 +${e.fee}`:''}`);
      recordWalletChange(next.world,w().wallet,{operation,campaignDebtDelta:loanBalance(next.world)-loanBalance(w()),...(lines.length?{label:lines.join('；')}:{})});
    }
    grantTaskRewards(next.world,(before,detail)=>recordWalletChange(next.world,before,detail));
    if(!['saves.load','saves.loadDay','saves.import'].includes(operation)){
      const before=clone(next.world.wallet);narrative.observe(next.world);
      recordWalletChange(next.world,before,{operation:'narrative',label:'故事进展'});
    }
    validateWorld(next.world);const rulesChanged=JSON.stringify(next.world.rules)!==JSON.stringify(w().rules);await repository.commit(next,record.revision);record=next;if(rulesChanged)catalog=catalogFor(w().rules);publish();
    if(narrativeRevision!==w().narrative?.revision)emit('narrativeUpdated',narrative.view(w()));
  }
  function token(map,value){const tokenId=id('token');map.set(tokenId,{...clone(value),worldId:w().worldId,branchId:w().branchId,day:w().clock.day});return tokenId;}
  function lookup(map,tokenId,kind){const value=map.get(tokenId);need(value&&value.worldId===w().worldId&&value.branchId===w().branchId&&value.day===w().clock.day&&(!kind||value.kind===kind),'PREVIEW_EXPIRED','预览或报价已过期，请重新确认。');return value;}
  function quote(input){
    const quantity=integer(input.quantity??1,1,20),unit=input.unit||'pack',direction=input.action||'purchase';
    let values,priceVersion,productVersion,extra={};
    if(input.listingId){const listing=w().listings.find(l=>l.listingId===input.listingId&&l.status==='active');need(listing,'OUT_OF_STOCK','挂单已售出或撤回。');need(quantity===1,'INVALID_INPUT','实体卡挂单每笔一张。');values={unitAmount:listing.unitAmount,feeAmount:0,totalDebit:listing.unitAmount,totalCredit:0};priceVersion=`listing:${listing.listingId}:${listing.unitAmount}`;extra={listingId:listing.listingId,ownerId:listing.ownerId};}
    else {assertSupply(w(),input.productId);need(['pack','box'].includes(unit),'INVALID_INPUT','商品单位不正确。');need(productEnabled(w().rules,input.productId),'UNAVAILABLE_PRODUCT','该卡包已停止发行。');const product=w().products.find(p=>p.productId===input.productId);need(product?.availability==='available','UNAVAILABLE_PRODUCT',product?.unavailableReason||'商品不存在。');values={unitAmount:product.prices[unit][direction==='purchase'?'wholesale':'retail'],feeAmount:0};values.totalDebit=values.unitAmount*quantity;values.totalCredit=0;priceVersion=product.priceVersion;productVersion=product.productVersion;extra={productId:product.productId,unit,action:direction};}
    const value={quantity,...values,subtotal:values.unitAmount*quantity,priceVersion,productVersion,validUntil:{day:w().clock.day,minute:1200},explanation:['报价按当前供货/挂单版本冻结；确认前库存变化需重新报价。'],...(!input.listingId?{availableCash:w().wallet.available,supplierCreditAvailable:Math.max(0,w().rules.supplierCreditLimit-w().wallet.debt),creditExplanation:'仅对货款不足部分记供应商欠款；后续收入自动先还欠款，不会直接增加可用游戏币。'}:{}),...extra};
    return {...value,quoteId:token(quotes,value)};
  }
  function stats(cardKey,mode='kof'){const s=w().stats[`${cardKey}|${mode}`]||{wins:0,losses:0,draws:0};const games=s.wins+s.losses+s.draws;return {...s,cardKey,mode,games,winRate:games?(s.wins+.5*s.draws)/games:null,insufficientSamples:games<20,label:(MODE_LABELS[mode]||mode)+(mode==='kof'?' 出场队伍胜率':' 整场胜率')};}
  function currentProgress(m){const value=engineProgress.get(m.matchId);return value?.gameId===m.gameId?value:null;}
  function npcTableNote(m){if(!m?.background)return null;if(m.simulated)return !backgroundRunning()?'NPC 模拟对局已暂停；关闭交互窗口并解除其他暂停后继续。':m.status==='running'?`NPC 模拟对局 · ${Math.max(0,Math.ceil(m.simulation.durationSeconds-m.simulation.elapsedSeconds))} 秒后结算，结束后自动离桌付费。`:'NPC 正在自动入座；使用实际流通卡阵容进行模拟。';const progress=currentProgress(m);const labels={loading:'准备牌局',phase:'回合进行中',phaseBefore:'回合开始',phaseUse:'出牌阶段',useCard:'出牌结算',useCardAfter:'出牌完成',phaseDraw:'摸牌',phaseDiscard:'弃牌',phaseJudge:'判定',damage:'伤害结算',damageEnd:'伤害结算完成',dying:'濒死结算',die:'阵亡结算',shopRelayBoundary:'接力换将',gain:'手牌结算',lose:'手牌结算'};return !backgroundRunning()?'NPC 对局因交互或暂停而暂停，关闭窗口后继续。':progress?`${m.mode.toUpperCase()} ${m.wins}:${m.losses}，第 ${progress.round} 轮 · ${progress.choosing?'思考应对':labels[progress.phase]||'技能与牌面结算'}，已运行 ${progress.activeSeconds} 秒`:'NPC 正在入座或载入原版引擎。';}
  async function query(name,p={}){
    try{live();await queue;
      let data;
      switch(name){
        case 'combat.rooms':data=Rooms.queryRooms(w(),catalog);break;
        case 'combat.room':data=Rooms.queryRooms(w(),catalog,p);break;
        case 'combat.formats':data=V7.formatsView(modeCapabilities);break;
        case 'combat.series':data=V7.seriesView(w(),p.matchId);break;
        case 'combat.roundPlan':{const m=matchById(w(),p.matchId);need(m.series,'INVALID_STATE','该比赛没有原生计划。');const r=buildRoundPlan(m.series);need(r.ok,r.error?.code,r.error?.message);data=r.data.plan;break;}
        case 'dialogue.offer':data=V7.dialogueView(w());break;
        case 'longTerm.status':data=Debt.longTermView(w());break;
        case 'progression.status':case 'challenges.status':case 'allies.list':data=V7.progressionQuery(w(),name);break;
        case 'narrative.available':data=narrative.available(w());break;
        case 'narrative.session':data=narrative.view(w(),p.sessionId);break;
        case 'shop.snapshot':data=snapshot(w(),reasons());break;
        case 'player.skins':data={items:PLAYER_SKINS.map(s=>({...s,selected:s.appearanceId===w().player.appearanceId})),current:w().player.appearanceId};break;
        case 'player.favorites':data=favoritesView(w());break;
        case 'player.starterGift':data=clone(w().starterGift||null);break;
        case 'room.settings':data=tableSettingsView(w());break;
        case 'combat.queue':data=queueView(w());break;
        case 'catalog.list':data=catalogList(catalog,p);break;
        case 'catalog.detail':{const c=catalog.byKey.get(p.cardKey);need(c,'NOT_FOUND','卡牌不存在。');data=cardDetailView(w(),catalog,c,RATED_FORMATS.map(mode=>stats(c.cardKey,mode)));break;}
        case 'inventory.list':data=p.grouped?inventoryView(w(),catalog,p):inventoryList(w(),catalog,p);break;
        case 'inventory.sealedSummary':data=sealedInventoryView(w());break;
        case 'products.list':data=page(w().products.filter(x=>productEnabled(w().rules,x.productId)&&(!p.themeId||x.themeId===p.themeId)).map(productDTO),p);break;
        case 'products.contents':data=productContents(w(),catalog,p);break;
        case 'products.quote':case 'market.quote':data=quote(p);break;
        case 'supplier.basketQuote':{const value=basketQuote(w(),p);data={...value,quoteId:token(quotes,value)};break;}
        case 'supplier.orders':data=page(w().orders.filter(o=>!p.status||o.status===p.status).map(({product,...o})=>({...clone(o),themeName:product.name,productVersion:product.productVersion,total:o.cost,product:productDTO(product)})),p);break;
        case 'retail.list':data=retailView(w());break;
        case 'checkout.status':data={customers:w().npcs.filter(n=>onSite(n)&&n.trip?.stage==='checkout').map(n=>({actorId:n.actorId,name:n.name})),transactions:w().log.filter(e=>e.type==='packSaleCompleted').slice(-40).reverse().map(e=>({...clone(e),name:w().npcs.find(n=>n.actorId===e.buyerId)?.name||'顾客',productName:w().products.find(p=>p.productId===e.productId)?.name||e.productId}))};break;
        case 'opening.preview':{const value=openingPreview(w(),p);data={...value,previewId:token(previews,value)};break;}
        case 'inventory.surplusPreview':{const value=surplusPreview(w(),catalog,p);data={...value,previewId:token(previews,value)};break;}
        case 'market.list':data=marketView(w(),catalog,p);break;
        case 'cardStats.summary':data=stats(p.cardKey,p.mode);break;
        case 'room.snapshot':data={roomId:'battle-room',tables:w().tables.map((t,i)=>{const m=w().matches.find(m=>m.matchId===t.matchId);return {...clone(t),label:`${i+1} 号牌桌`,status:m?(m.status==='running'?'in-progress':'waiting'):t.reservation?'reserved':'idle',mode:m?.mode||null,seated:m?(getFormat(m.mode)?.seats||2):0,maxSeats:m?(getFormat(m.mode)?.seats||2):4,stake:{base:w().rules.baseStake,final:m?.stake||0},fee:managementEffects(w()).tableFee,rakeRate:w().rules.rake,note:npcTableNote(m)};}),matches:clone(w().matches),tableFee:managementEffects(w()).tableFee,rake:w().rules.rake,wageringEnabled:w().rules.wageringEnabled,note:'NPC 使用实际持有的流通卡；当前开放无赌注比赛。'};break;
        case 'room.diagnostics':data={paused:!backgroundRunning(),pauseReasons:reasons(),items:w().matches.filter(m=>m.background).slice(-20).map(m=>({matchId:m.matchId,gameId:m.gameId,status:m.status,mode:m.mode,bout:m.bout,wins:m.wins,losses:m.losses,result:m.result||null,error:m.error||null,progress:clone(currentProgress(m))}))};break;
        case 'combat.eligible':data={mode:p.formatId||p.mode||'kof',slots:getFormat(p.formatId||p.mode||'kof')?.reservePerSide||1,items:V7.eligibleV7(w(),catalog,p.ownerId||'player',p.formatId||p.mode||'kof',modeCapabilities).map(i=>({...i,reasons:i.disabledReasons}))};break;
        case 'combat.preview':{const value=combatPreview(w(),catalog,p);data={...value,previewId:token(previews,value),lineup:value.mine,fee:0,opponentFee:value.tableFee,noStake:value.stakeAmount===0,balance:w().wallet.available,rules:['实体副本锁定至整场结束','店主免自身开桌费；对手支付桌费','玩家参赛免该桌抽水','当前只开放无赌注比赛'],stakeProposal:{proposalId:value.stakeProposalId,multiplier:value.multiplier,base:w().rules.baseStake,final:value.stakeAmount,reason:value.explanation}};break;}
        case 'tasks.list':data=taskViews(w());break;
        case 'ledger.live':data=financeView(w());break;
        case 'management.insights':data=experienceInsights(w(),catalog,p.day??w().clock.day);break;
        case 'experience.guide':data=experienceGuide(w());break;
        case 'experience.events':data=experienceEvents(w(),eventPlayers(w()));break;
        case 'experience.stories':data=experienceStories(w(),catalog,p);break;
        case 'ledger.daily':{const report=p.day&&p.day!==w().clock.day?w().reports.find(r=>r.day===p.day):null;need(!p.day||p.day===w().clock.day||report,'NOT_FOUND','该日没有已结日报。');data=ledgerView(w(),catalog,report);break;}
        case 'management.people':data=peopleView(w(),catalog);break;
        case 'management.upgrades':data=upgradesView(w());break;
        case 'management.orders':data={items:[...w().orders.filter(o=>o.status!=='received').map(o=>({...clone(o),themeName:o.product.name,productVersion:o.product.productVersion,total:o.cost})),...(w().management?.requests||[]).filter(r=>['offered','accepted'].includes(r.status)).map(r=>({...clone(r),unit:'card',themeName:catalog.byKey.get(r.cardKey)?.name,productVersion:'单卡二级市场',total:r.amount}))]};break;
        case 'config.list':data={items:[{configId:'backend-rules',label:'全局评分、供货与经营',editable:true,text:JSON.stringify({...w().rules,customerBehavior:customerBehavior(w())},null,2)},{configId:'backend-experience',label:'经营引导、交流会与本店记录',editable:true,text:JSON.stringify(w().experience.config,null,2)},...(w().management?[{configId:'backend-management',label:'设施、员工与街坊',editable:true,text:JSON.stringify(w().management.config,null,2)}]:[])],permissions:{canEdit:true,role:'owner'}};break;
        case 'config.validate':{const value=p.value??JSON.parse(p.draft||'null');if(p.configId==='backend-experience')validateExperienceConfig(value);else if(p.configId==='backend-management')validateManagement(value);else {need(p.configId==='backend-rules','INVALID_INPUT','配置 ID 不正确。');validateRules(value);}data={valid:true,parsed:value,warnings:[]};break;}
        case 'saves.list':data=record.archives.filter(a=>(!p.day||a.day===p.day)&&(!p.branchId||a.branchId===p.branchId)).map(archiveMeta);break;
        case 'saves.days':data={items:dayArchiveViews(record.archives,w().branchId,w().branchLineage),note:'每条日档恢复到当天 08:00 开店前；不恢复到手动备份的时刻。'};break;
        case 'operations.get':{const op=record.requests[p.requestId||p.operationId];data=op?(op.worldId===w().worldId&&op.branchId===w().branchId?{status:op.result.ok?'succeeded':'failed',...clone(op)}:{status:'stale',worldId:op.worldId,branchId:op.branchId}):{status:'unknown'};break;}
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
      if(record.requests[requestId]){const op=record.requests[requestId];need(op.worldId===w().worldId&&op.branchId===w().branchId,'STALE_OPERATION','此操作属于读档前的世界或分支，请刷新界面后重新操作。');need(op.signature===signature,'REQUEST_ID_REUSED','同一请求 ID 不能用于不同操作。');return clone(op.result);}
      const next=fork(),world=next.world,p=input.payload||{};
      need(p&&typeof p==='object'&&!Array.isArray(p),'INVALID_INPUT','操作参数格式不正确。');
      const data=handleCommand(next,input,p);
      const result={ok:true,requestId,revision:record.revision+1,data:clone(data)};
      next.requests[requestId]={signature,result,worldId:next.world.worldId,branchId:next.world.branchId};
      await persist(next,input.type);
      if(input.previewId)previews.delete(input.previewId);
      if(['saves.load','saves.loadDay','saves.import'].includes(input.type)){quotes.clear();previews.clear();engineProgress.clear();movement=null;emit('worldReset',snapshot(w(),reasons()));}
      return result;
    }catch(e){return {ok:false,requestId,error:errorDTO(e)};}
  });}

  function handleCommand(next,input,p){
    const world=next.world;
    if(['combat.prepareSeries','combat.register','combat.joinQueue'].includes(input.type))need(!activeRoom(world),'MATCH_ACTIVE','请先返回或取消已创建的对战房间。');
    if(input.type.startsWith('narrative.'))return narrative.command(world,input.type,p);
    if(world.clock.phase==='closed'&&(input.type==='market.acceptTrade'||input.type==='neighbors.act'&&['accept','deliver','buy'].includes(p.action)))fail('SHOP_CLOSED','今天已结算，请开始下一天后交易。');
    const item=()=>playerItem(world,p.inventoryRef);
    if(input.type==='combat.joinQueue'&&navigation.size){
      const map=navigation.get(world.player.roomId),anchors=[map?.anchors['battleRoom.service'],p.tableId&&map?.anchors[p.tableId]].filter(Boolean);
      need(anchors.some(a=>Math.hypot(world.player.x-a.x,world.player.y-a.y)<=(a.radius||24)),'NOT_IN_RANGE','请先走到报名台或选中的牌桌旁。');
    }
    const station=input.type==='opening.execute'?'store.opening':input.type.startsWith('supplier.')||input.type==='boxes.unseal'?'store.counter':input.type.startsWith('market.')?'store.secondaryMarket':input.type.startsWith('retail.')?'store.retail':input.type==='inventory.discard'||input.type==='inventory.recover'?'store.trash':input.type==='neighbors.act'&&['buy','deliver'].includes(p.action)?'store.secondaryMarket':null;
    if(station&&navigation.size){const map=navigation.get(world.player.roomId),anchor=map?.anchors[station];need(anchor&&Math.hypot(world.player.x-anchor.x,world.player.y-anchor.y)<=(anchor.radius||24),'NOT_IN_RANGE','请先走到对应柜台或家具旁边。');}
    switch(input.type){
      case 'combat.room.create':return Rooms.createRoom(world,catalog,p,navigation,modeCapabilities);
      case 'combat.room.prepare':return Rooms.prepareRoom(world,catalog,p,navigation,modeCapabilities);
      case 'combat.room.cancel':return Rooms.cancelRoom(world,catalog,p);
      case 'actors.interact':case 'challenges.offer':return V7.interactV7(world,p,navigation);
      case 'dialogue.respond':case 'challenges.reply':return V7.respondV7(world,p,navigation);
      case 'challenges.rematch':return V7.afterChallengeLoss(world,p,navigation,{rematch:true});
      case 'challenges.defer':return V7.afterChallengeLoss(world,p,navigation);
      case 'allies.assign':return V7.assignV7(world,catalog,p);
      case 'debt.repay':{V7.checkProof(world,p.proof);const result=repayLoan(world,p);note(world,'campaignLoanRepaid',result);return result;}
      case 'combat.prepareSeries':return V7.prepareV7(world,catalog,p,navigation,modeCapabilities);
      case 'combat.selectRound':return V7.selectV7(world,p);
      case 'combat.restartRound':case 'combat.abandon':return V7.lifecycleV7(world,catalog,input.type,p);
      case 'clock.setManualPause':need(typeof p.paused==='boolean','INVALID_INPUT','暂停开关不正确。');world.clock.manualPaused=p.paused;return {};
      case 'player.setSkin':need(PLAYER_SKINS.some(s=>s.appearanceId===p.appearanceId),'INVALID_INPUT','没有这个店长外观。');world.player.appearanceId=p.appearanceId;note(world,'playerSkinChanged',{appearanceId:p.appearanceId});return {appearanceId:p.appearanceId};
      case 'player.setFavorite':return setFavorite(world,catalog,p);
      case 'room.setTableFee':return setTableFee(world,p);
      case 'clock.setSpeed':need([1,2,4].includes(p.speed),'INVALID_INPUT','营业倍率只支持 1/2/4。');world.clock.speed=p.speed;return {};
      case 'experience.setGuideSkipped':need(typeof p.skipped==='boolean','INVALID_INPUT','引导开关不正确。');world.experience.guide.skipped=p.skipped;return {skipped:p.skipped};
      case 'experience.scheduleEvent':{need(p.eventId===world.experience.config.event.id,'INVALID_INPUT','活动 ID 不正确。');const event=scheduleExperienceEvent(world,eventPlayers(world));note(world,'communityEventScheduled',{eventId:event.eventId,actorIds:event.actorIds});return {event};}
      case 'business.open':need(world.clock.phase==='preparing','INVALID_STATE','当前不是营业准备阶段。');world.clock.phase='open';world.clock.minute=540;return {};
      case 'business.close':{
        need(['open','closing'].includes(world.clock.phase),'INVALID_STATE','今天已关闭或尚未开门。');need(!world.matches.some(m=>m.status!=='finished'),'MATCH_ACTIVE','请先完成或取消未结束的牌局。');
        for(const entry of [...(world.matchQueue||[])])leaveQueue(world,entry.ownerId,'business-closed');
        Rooms.tickRooms(world,catalog,modeCapabilities,{close:true});finishCustomerVisits(world,catalog);V7.endV7Day(world);Debt.endDebtDay(world);
        const wages=managementEffects(world).wages,cost=world.rules.operatingCost+wages,paid=Math.min(cost,world.wallet.available);world.wallet.available-=paid;world.wallet.debt+=cost-paid;world.daily.operating=cost;world.daily.wages=wages;world.clock.phase='closed';note(world,'businessClosed');const ledger=ledgerView(world,catalog);world.reports.push({day:world.clock.day,...clone(world.daily),walletAtClose:clone(world.wallet),unsoldValuationAtClose:ledger.unsoldValuation});saveArchive(next,'close');return {report:clone(world.daily)};
      }
      case 'business.nextDay':{
        need(world.clock.phase==='closed','INVALID_STATE','请先结算打烊。');
        const cleared=Object.values(world.items).filter(i=>i.location==='trash');for(const i of cleared)delete world.items[i.inventoryRef];note(world,'trashCleared',{quantity:cleared.length});
        world.clock.day++;world.clock.minute=480;world.clock.phase='preparing';world.daily={goods:0,cogs:0,service:0,fees:0,matchNet:0,operating:0,purchases:0};
        initialiseExperience(world);
        initialiseDailyTasks(world);
        for(const n of world.npcs){if(isV7(world)){const result=replenishCustomer(world,n);if(result?.supplementedAmount)note(world,'npcDailyIncome',{actorId:n.actorId,externalFunds:result.supplementedAmount});}else{credit(n.wallet,world.rules.npcDailyIncome);note(world,'npcDailyIncome',{actorId:n.actorId,externalFunds:world.rules.npcDailyIncome});}}
        updatePrices(world,catalogFor(world.rules));world.products=publishProducts(catalogFor(world.rules),world.rules,world.clock.day,world.prices,world);world.nextNpcMinute=540;
        for(const o of world.orders)if(o.status==='pending'&&o.dueAt<=world.clock.day*1440+480)o.status='arrived';
        if(world.management){world.management.nextRestockAt=world.clock.day*1440+480+world.management.config.restockIntervalMinutes;tickManagement(world,catalogFor(world.rules));}
        saveArchive(next,'start');return {};
      }
      case 'supplier.placeBasketOrder':{
        need(Object.keys(p).length===0,'INVALID_INPUT','购物篮下单仅使用冻结报价，payload 应为空对象。');
        return placeBasketOrder(world,lookup(quotes,input.quoteId,'supplier-basket'));
      }
      case 'supplier.placeOrder':{
        need(world.clock.phase!=='closed','SHOP_CLOSED','请在准备或营业时下单。');const q=lookup(quotes,input.quoteId);need(q.action==='purchase'&&q.productId===p.productId&&q.quantity===p.quantity&&q.unit===(p.unit||'pack'),'QUOTE_EXPIRED','采购参数与报价不一致。');
        assertSupply(world,p.productId);const product=world.products.find(x=>x.productId===p.productId);need(productEnabled(world.rules,p.productId),'UNAVAILABLE_PRODUCT','该卡包已停止发行。');need(product?.productVersion===q.productVersion&&product?.priceVersion===q.priceVersion&&product?.prices[q.unit]?.wholesale===q.unitAmount,'QUOTE_EXPIRED','供货版本或价格已变化。');
        const shortfall=Math.max(0,q.totalDebit-world.wallet.available);need(!shortfall||p.credit&&world.wallet.debt+shortfall<=world.rules.supplierCreditLimit,'INSUFFICIENT_FUNDS','游戏币或供应商信用额度不足。');
        world.wallet.available-=q.totalDebit-shortfall;world.wallet.debt+=shortfall;
        const order={orderId:serial(world,'order'),product:clone(product),productId:product.productId,unit:q.unit,quantity:q.quantity,unitCost:q.unitAmount,cost:q.totalDebit,status:'pending',dueAt:world.clock.day*1440+world.clock.minute+world.rules.deliveryMinutes};
        world.orders.push(order);world.daily.purchases+=order.cost;world.lifetime.ordered+=q.quantity*(q.unit==='box'?24:1);note(world,'orderPlaced',{orderId:order.orderId,amount:order.cost});const delivered=deliverImmediately(world,order);return {orderId:order.orderId,fulfillment:'received',...delivered};
      }
      case 'supplier.receive':return receiveOrder(world,world.orders.find(o=>o.orderId===p.orderId));
      case 'supplier.receiveAll':{const arrived=world.orders.filter(o=>o.status==='arrived'),results=arrived.map(o=>receiveOrder(world,o));return {orders:arrived.length,inventoryRefs:results.flatMap(r=>r.inventoryRefs),stock:{packs:sum(results.map(r=>r.stock.packs))}};}
      case 'boxes.unseal':return {inventoryRefs:(p.boxIds||[p.inventoryRef]).flatMap(ref=>{const i=playerItem(world,ref);need(!i.protected,'ITEM_LOCKED','卡盒受保护。');return unsealBox(world,i).map(p=>p.inventoryRef);})};
      case 'opening.execute':{const preview=lookup(previews,input.previewId,'opening');need(preview.refs.length,'OUT_OF_STOCK','没有可拆卡包。');const result=executeOpening(world,preview,catalog);return {operationId:input.requestId,...result};}
      case 'inventory.setProtection':{const i=item();need(!i.lock,'ITEM_LOCKED','被交易或比赛占用的物品不能改保护状态。');need(typeof p.protected==='boolean','INVALID_INPUT','保护开关不正确。');i.protected=p.protected;return {};}
      case 'inventory.discard':{discardCard(world,item(),'player');return {};}
      case 'inventory.recover':{const selected=p.all?trashItems(world):[world.items[p.inventoryRef]];for(const i of selected)pickTrashCard(world,i,'player');return {quantity:selected.length,recovered:selected.length,note:`已拾取 ${selected.length} 张实物卡，拾取的卡种已登记流通。`};}
      case 'retail.list':{const i=item();need(productEnabled(world.rules,i.productId),'PRODUCT_UNAVAILABLE','该主题已停产，不再上架。');need(['pack','box'].includes(i.kind)&&i.location==='stock'&&free(i),'INVALID_ITEM','正店只出售未锁定的密封包/盒。');const e=managementEffects(world);need(shelfUsed(world)+(i.kind==='box'?e.boxShelfUnits:1)<=e.shelfCapacity,'SHELF_FULL','零售货架空间不足，可升级货架。');i.location='retail';note(world,'retailItemsListed',{quantity:1});return {};}
      case 'retail.listAll':{
        need(Array.isArray(p.inventoryRefs)&&p.inventoryRefs.length<=10000&&p.inventoryRefs.every(r=>typeof r==='string'),'INVALID_INPUT','请选择待补货的库存实物。');
        const items=[...new Set(p.inventoryRefs)].map(ref=>playerItem(world,ref)),e=managementEffects(world);let used=shelfUsed(world),listed=0;
        for(const i of items){const units=i.kind==='box'?e.boxShelfUnits:1;if(productEnabled(world.rules,i.productId)&&['pack','box'].includes(i.kind)&&i.location==='stock'&&free(i)&&used+units<=e.shelfCapacity){i.location='retail';used+=units;listed++;}}
        if(listed)note(world,'retailItemsListed',{quantity:listed});return {listed,remaining:items.length-listed,note:`已补货 ${listed} 件；货架满或受保护的商品保留在仓库。`};
      }
      case 'retail.withdraw':{const i=item();need(i.location==='retail'&&!i.lock,'ITEM_LOCKED','不能撤下该商品。');i.location='stock';return {withdrawn:1};}
      case 'retail.setPrice':{const i=item();need(i.location==='retail','INVALID_STATE','商品未在零售货架。');i.retailPrice=integer(p.amount,1,1000000);return {unitAmount:i.retailPrice};}
      case 'market.listSurplus':return listSurplus(world,catalog,lookup(previews,input.previewId,'surplus'),p);
      case 'market.placeListing':{const i=item();return placeListing(world,catalog,i,integer(p.amount??referencePrice(world,catalog,i.cardKey),1,1000000));}
      case 'market.cancelListing':{const l=world.listings.find(l=>l.listingId===p.listingId&&l.ownerId==='player'&&l.status==='active');need(l,'NOT_FOUND','挂单不存在。');const i=playerItem(world,l.inventoryRef);i.location='collection';i.lock=null;l.status='cancelled';return {};}
      case 'market.acceptTrade':{const q=lookup(quotes,input.quoteId);need(q.listingId===p.listingId,'QUOTE_EXPIRED','交易与报价不一致。');const l=world.listings.find(l=>l.listingId===p.listingId);need(l?.unitAmount===q.unitAmount,'QUOTE_EXPIRED','单卡报价已变化。');return settleTrade(world,l,'player');}
      case 'room.reserve':{const t=world.tables.find(t=>t.tableId===p.tableId);need(t&&!t.matchId&&!t.reservation,'TABLE_BUSY','桌位不可预约。');t.reservation='player';return clone(t);}
      case 'room.cancelReservation':{const t=world.tables.find(t=>t.tableId===p.tableId);need(t?.reservation==='player'&&!t.matchId,'TABLE_BUSY','无法取消该预约。');t.reservation=null;return {};}
      case 'combat.joinQueue':return joinQueue(world,catalog,p);
      case 'combat.leaveQueue':return leaveQueue(world);
      case 'combat.setWaitMode':return setWaitMode(world,p);
      case 'combat.register':{const m=registerMatch(world,catalog,lookup(previews,input.previewId,'combat'),p);return {...m,match:clone(m),note:'阵容与开桌费用已冻结。'};}
      case 'combat.start':case 'combat.continue':if(matchById(world,p.matchId).series)return V7.startV7(world,p);need(!matchById(world,p.matchId).background,'NPC_MATCH_CONTROLLED','NPC 牌局由后台引擎调度。');return beginMatch(world,p.matchId);
      case 'combat.surrender':if(matchById(world,p.matchId).series)return V7.lifecycleV7(world,catalog,input.type,p);need(!matchById(world,p.matchId).background,'NPC_MATCH_CONTROLLED','不能替 NPC 认输并刷战绩。');return surrender(world,p.matchId,p.scope);
      case 'combat.cancel':if(matchById(world,p.matchId).series)return V7.lifecycleV7(world,catalog,input.type,p);need(!matchById(world,p.matchId).background,'NPC_MATCH_CONTROLLED','请使用对战房的取消后台牌局操作。');return cancelPrepared(world,p.matchId);
      case 'room.cancelNpcMatch':return voidNpcMatch(world,p.matchId,'店主取消后台对局；不计战绩。');
      case 'upgrades.purchase':return purchaseUpgrade(world,p.upgradeId);
      case 'neighbors.act':return neighborAct(world,catalog,p);
      case 'tasks.claim':{const t=taskViews(world).find(t=>t.taskId===p.taskId);need(t?.completed,'NOT_READY','任务尚未完成。');return {reward:0,autoClaim:true,note:'完成任务会自动入账，无需再次领取。'};}
      case 'config.apply':{const value=p.value??JSON.parse(p.draft||'null');if(p.configId==='backend-experience')return configureExperience(world,value);if(p.configId==='backend-management')return configureManagement(world,value);need(p.configId==='backend-rules','INVALID_INPUT','配置 ID 不正确。');validateRules(value);world.rules=clone(value);upgradeDistribution(world);note(world,'configChanged',{ratingVersion:value.ratingVersion});return {productsEffective:'nextDay'};}
      case 'config.restoreDefault':if(p.configId==='backend-experience')return configureExperience(world);if(p.configId==='backend-management'){need(managementConfig,'FEATURE_UNAVAILABLE','经营默认参数尚未加载。');return configureManagement(world,managementConfig);}need(!p.configId||p.configId==='backend-rules','INVALID_INPUT','配置 ID 不正确。');world.rules=clone(rules);upgradeDistribution(world);return {};
      case 'saves.create':need(!world.matches.some(m=>!m.background&&m.status==='running'),'MATCH_ACTIVE','请先关闭玩家牌局视图或完成当前小局后存档。');saveArchive(next,'manual');return {archiveId:next.archives.at(-1).id};
      case 'saves.export':{need(p.archiveId||!world.matches.some(m=>!m.background&&m.status==='running'),'MATCH_ACTIVE','请先关闭玩家牌局视图或完成当前小局后导出。');const a=p.archiveId?next.archives.find(a=>a.id===p.archiveId):archive(world,'manual');need(a,'NOT_FOUND','档案不存在。');return {fileName:`card-shop-day-${a.day}.json`,mimeType:'application/json',content:JSON.stringify(a)};}
      case 'saves.loadDay':case 'saves.load':case 'saves.import':{
        need(!world.matches.some(m=>!m.background&&m.status==='running'||m.stake&&m.status!=='finished'),'MATCH_ACTIVE','请先关闭玩家牌局视图或结束当前比赛。');
        const a=input.type!=='saves.import'?next.archives.find(a=>a.id===p.archiveId):typeof p.content==='string'&&p.content.length<10000000?JSON.parse(p.content):null;
        if(input.type==='saves.loadDay')need(a?.slot==='start'&&a.minute===480&&a.world?.clock.minute===480&&a.world?.clock.phase==='preparing','NOT_DAY_START','请选择对应日期的日初档；即时备份不能冒充当天开始。');
        need(a?.format==='noname-shop-world-save'&&a.version===2,'INVALID_SAVE','档案格式不支持。');validateWorld(a.world);validateRules(a.world.rules);
        for(const i of Object.values(a.world.items))need(['pack','box','card'].includes(i.kind)&&Number.isSafeInteger(i.cost)&&i.cost>=0&&(!i.cardKey||catalog.byKey.has(i.cardKey)),'INVALID_SAVE','库存数据不完整。');
        saveArchive(next,'before-load');next.world=clone(a.world);upgradeDistribution(next.world);initialiseManagement(next.world,managementConfig);ensureRegulars(next.world);next.world.player.actorId='actor:owner';normaliseActors(next.world);next.world.branchLineage=[next.world.branchId,...(next.world.branchLineage||[])].slice(0,120);next.world.branchId=id('branch');V7.restoreV7(next.world);Rooms.tickRooms(next.world,catalogFor(next.world.rules),modeCapabilities,{restore:true});next.world.pendingEngineEvents=[];for(const m of next.world.matches)if(m.status==='running'&&!m.simulated)m.status='interrupted';if(input.type==='saves.loadDay')saveArchive(next,'start');return {worldId:next.world.worldId,branchId:next.world.branchId};
      }
      case 'world.changeRoom':{
        const map=navigation.get(world.player.roomId),door=map?.anchors[p.anchorId];need(door?.targetRoom&&door?.targetAnchor,'NOT_FOUND','房间出口不存在。');need(Math.hypot(world.player.x-door.x,world.player.y-door.y)<=(door.radius||24),'NOT_IN_RANGE','请先走到门口。');const nextMap=navigation.get(door.targetRoom);let anchor=door.targetSpawn||nextMap?.anchors[door.targetAnchor];
        if(nextMap&&door.seamlessEdge){need(door.seamlessEdge==='east'?world.player.x>=map.width*16-6:world.player.x<=6,'NOT_IN_RANGE','请继续走过房间通道。');anchor={x:door.seamlessEdge==='east'?0:nextMap.width*16-.01,y:world.player.y};}
        need(nextMap&&anchor&&canStand(nextMap,anchor.x,anchor.y),'NAVIGATION_UNAVAILABLE','目标地图尚未就绪。');world.player={...world.player,roomId:nextMap.mapId,navVersion:nextMap.navVersion,x:anchor.x,y:anchor.y,moving:false};movement=null;return clone(world.player);
      }
      default:fail('UNSUPPORTED_COMMAND',`尚未实现操作：${input.type}`);
    }
  }

  async function advance(seconds){return serially(async()=>{
    if(!connected||disconnected||w().clock.manualPaused||pauses.size)return;
    const timed=activeTimeMatch(w());
    if(timed)return;
    const clockRunning=w().clock.phase==='open'||w().clock.phase==='preparing'&&w().clock.minute<540;
    if(!clockRunning&&!movement&&!w().matches.some(m=>m.background&&m.status!=='finished')&&!(w().clock.phase==='closing'&&w().npcs.some(onSite))&&!(w().pendingEngineEvents||[]).length)return;
    const next=fork(),world=next.world,limit=world.clock.phase==='preparing'?540:1200;
    if(clockRunning)world.clock.minute=Math.min(limit,world.clock.minute+Math.min(1,Math.max(0,seconds))*world.rules.minutesPerSecond*world.clock.speed);
    for(const o of world.orders)if(o.status==='pending'&&o.dueAt<=world.clock.day*1440+world.clock.minute)o.status='arrived';
    for(const event of world.pendingEngineEvents||[]){const match=world.matches.find(m=>m.matchId===event.matchId);if(match?.status==='running'&&match.gameId===event.message.matchId)engineMessage(world,event.matchId,event.message);}world.pendingEngineEvents=[];
    for(const m of world.matches)if(m.needsRestartAfterEvents){if(m.status==='running')m.status='interrupted';delete m.needsRestartAfterEvents;}
    tickManagement(world,catalog);
    if(world.clock.phase==='open'&&world.clock.minute>=1200){world.clock.phase='closing';note(world,'shopClosing');}
    if(clockRunning||world.clock.phase==='closing')tickEconomy(world,catalog,{map:navigation.get('store'),seconds});
    V7.tickV7(world,catalog,navigation,seconds);
    Debt.tickDebt(world,navigation,seconds);
    tickPartnerActivities(world,catalog,navigation);
    tickNpcTables(world,catalog,navigation,seconds,{schedule:false});
    Rooms.tickRooms(world,catalog,modeCapabilities);
    tickMatchQueue(world,catalog,navigation,{schedule:world.rules.npcSimulation!==false||backgroundAvailable});
    const map=navigation.get(world.player.roomId);if(map){world.player.navVersion=map.navVersion;const waiting=playerQueue(world);if(movement&&waiting){waiting.waitMode='manual';delete waiting.wanderTrip;}if(movement||!moveWaitingPlayer(world,navigation,seconds))moveActor(map,world.player,movement,seconds);}
    await persist(next);
  });}
  return {
    async connect(p){need(p?.contractVersion===CONTRACT,'CONTRACT_MISMATCH','前后端契约版本不一致。');need(typeof p.clientId==='string','INVALID_INPUT','缺少会话 ID。');clientId=p.clientId;sessionId=id('session');connected=true;disconnected=false;return {contractVersion:CONTRACT,worldId:w().worldId,branchId:w().branchId,sessionId,revision:record.revision,currency:{code:'SHOP',label:'游戏币',minorUnit:1},capabilities:{battleRooms:true,operationsV7:isV7(w()),nativeModes:true,narrative:narrative.contentAvailable||!!w().narrative,clock:true,inventory:true,products:true,market:true,combat:true,wagering:false,saves:true,navigation:navigation.size>0,upgrades:!!w().management,neighbors:!!w().management,npcAutoBattles:w().rules.npcSimulation!==false||backgroundAvailable},initialSnapshot:snapshot(w(),reasons())};},
    query,command,subscribe(listener){listeners.add(listener);publish();return()=>listeners.delete(listener);},
    pause:{async acquire(p){live();need(p?.ownerId&&p?.reason,'INVALID_INPUT','缺少暂停原因。');const lease={leaseId:id('pause'),ownerId:p.ownerId,reason:p.reason};pauses.set(lease.leaseId,lease);movement=null;publish();return clone(lease);},async release(leaseId){pauses.delete(leaseId);publish();}},
    world:{input(p){
      if(!connected||disconnected||p?.sessionId!==sessionId||!Number.isSafeInteger(p.inputSeq)||p.inputSeq<=lastInputSeq)return;
      lastInputSeq=p.inputSeq;movement=null;if(p.stop||pauses.size||w().clock.manualPaused||activeTimeMatch(w()))return;
      try{const map=navigation.get(w().player.roomId);need(map&&p.navVersion===map.navVersion&&p.roomId===map.mapId,'NAVIGATION_UNAVAILABLE','导航版本未就绪。');
        if(p.direction)need(['up','down','left','right'].includes(p.direction),'INVALID_INPUT','方向不合法。');
        if(p.vector)need(Number.isFinite(p.vector.x)&&Number.isFinite(p.vector.y)&&Math.abs(p.vector.x)<=1&&Math.abs(p.vector.y)<=1,'INVALID_INPUT','移动向量不合法。');
        movement=p.vector?{vector:{x:p.vector.x,y:p.vector.y}}:p.direction?{direction:p.direction}:p.destination?{path:pathfind(map,w().player,p.destination)}:null;
      }catch(e){emit('notification',{level:'error',...errorDTO(e)});}
    }},
    async disconnect(){disconnected=true;connected=false;movement=null;await queue;await repository.close?.();listeners.clear();},
    advance,
    async installStoryPacks(packs){return serially(async()=>{for(const raw of packs)narrative.install(await loadStoryPack(raw,{registry:createRegistry(storyExtensions)}));});},
    storyReferences(archiveId){return Object.values(record.archives.find(a=>a.id===archiveId)?.world?.narrative?.sessions||{}).map(s=>s?.contentHash).filter(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h));},
    async trustedEngineEvent(matchId,message){return serially(async()=>{const next=fork(),m=matchById(next.world,matchId);if(m.background&&!backgroundRunning()){need(m.status==='running'&&m.gameId===message.matchId,'STALE_EVENT','过期的后台牌局事件。');const events=next.world.pendingEngineEvents||=[];if(!events.some(e=>e.matchId===matchId&&JSON.stringify(e.message)===JSON.stringify(message)))events.push({matchId,message:clone(message)});await persist(next);return {deferred:true};}const data=m.series?V7.trustedV7(next.world,catalog,matchId,message):engineMessage(next.world,matchId,message);await persist(next);emit('battleStatusChanged',data);return data;});},
    backgroundState(){return backgroundState(w(),!backgroundRunning());},
    reportBackgroundProgress(matchId,progress){const m=w().matches.find(m=>m.matchId===matchId);if(!m||m.status!=='running'||m.gameId!==progress.gameId)return;for(const key of engineProgress.keys())if(key!==matchId)engineProgress.delete(key);engineProgress.set(matchId,clone(progress));},
    async startBackgroundMatch(matchId){return serially(async()=>{need(backgroundRunning(),'WORLD_PAUSED','经营世界已暂停。');const next=fork(),m=matchById(next.world,matchId);need(m.background&&backgroundState(next.world,false).matches.find(x=>x.matchId===matchId)?.seated,'NOT_READY','NPC 还未入座。');const data=beginMatch(next.world,matchId);await persist(next);return data;});},
    async failBackgroundMatch(matchId,reason){return serially(async()=>{const next=fork();if(matchById(next.world,matchId).status==='finished')return clone(matchById(next.world,matchId));const data=voidNpcMatch(next.world,matchId,reason);await persist(next);emit('battleStatusChanged',data);emit('notification',{level:'error',message:'NPC 牌局技术中断，不计正常战绩：'+data.error});return data;});},
    async interrupt(matchId,reason,code=null){return serially(async()=>{const next=fork(),m=matchById(next.world,matchId);if(m.status==='running'&&!m.simulated){if(m.series)V7.interruptV7(next.world,m,reason,code);else m.status='interrupted';if(reason)m.error=String(reason).slice(0,300);if(code)m.errorCode=String(code).slice(0,60);await persist(next);emit('battleStatusChanged',clone(m));}});},
    inspect(){return clone(record);},
    async markLegacyReset(){return serially(async()=>{if(record.legacyResetDone)return;const next=fork();next.legacyResetDone=true;await persist(next);});}
  };
}
