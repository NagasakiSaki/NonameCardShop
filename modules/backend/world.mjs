import {validateV7} from './v7-policy.mjs';
import {id, clone, serial, need} from './common.mjs';
import {initialiseExperience,recordExperienceEvent,validateExperience,experienceSnapshot,FEEDBACK_REASONS} from './experience.mjs';
import {storefrontView} from './presentation.mjs';
import {validateNarrative,recordNarrativeEvent,narrativeSummary} from '../narrative/state.mjs';
export function createWorld(rules){
  const world={schemaVersion:2,customerVisitVersion:1,worldId:id('world'),branchId:id('branch'),revision:0,serial:0,seed:Math.floor(Math.random()*4294967296),rules:clone(rules),
    clock:{day:1,minute:480,phase:'preparing',speed:1,manualPaused:false},wallet:{available:rules.startingCash,debt:0,escrowLiability:0},
    player:{actorId:'actor:owner',appearanceId:'owner',roomId:'store',x:240,y:272,direction:'down',moving:false,activity:'idle',navVersion:null,favoriteCardKeys:[]},
    storeSettings:{tableFee:null,feeRevision:0},
    matchQueue:[],
    products:[],items:{},orders:[],listings:[],npcs:[],circulation:{},stats:{},matches:[],tables:[{tableId:'battleRoom.table.01',matchId:null},{tableId:'battleRoom.table.02',matchId:null}],
    daily:{goods:0,cogs:0,service:0,fees:0,matchNet:0,operating:0,purchases:0},reports:[],lifetime:{ordered:0,received:0,opened:0,sales:0,marketSales:0,matches:0},
    tasks:{},dailyTasks:{day:1,baseline:{},claimed:{}},cashJournal:[],log:[],nextNpcMinute:540,prices:{},configOverrides:{}};
  initialiseExperience(world,{fresh:true});return world;
}
export function note(world,type,data={}){const event={eventId:serial(world,'event'),type,day:world.clock.day,minute:world.clock.minute,...clone(data)};world.log.push(event);world.log=world.log.slice(-1000);recordExperienceEvent(world,event);recordNarrativeEvent(world,event);}
export function enterCirculation(w,cardKey,source,reference){if(!w.circulation[cardKey]){w.circulation[cardKey]={day:w.clock.day,source,reference};note(w,'cardEnteredCirculation',{cardKey,source,reference});}}
export function validateWorld(world){
  validateV7(world);
  if(world?.schemaVersion!==2||!world.worldId||!world.branchId||!world.items||!world.clock||!world.wallet||!Array.isArray(world.products))throw new Error('新版世界存档格式不完整，未覆盖原数据。');
  need(world.branchLineage===undefined||Array.isArray(world.branchLineage)&&world.branchLineage.length<=120&&world.branchLineage.every(id=>typeof id==='string'&&id.length<=150),'INVALID_SAVE','存档分支来源不合法。');
  need(world.cashJournal===undefined||Array.isArray(world.cashJournal)&&world.cashJournal.length<=300&&world.cashJournal.every(e=>e&&typeof e.label==='string'&&Number.isSafeInteger(e.amount)&&Number.isSafeInteger(e.debtDelta)&&Number.isSafeInteger(e.day)&&Number.isFinite(e.minute)),'INVALID_SAVE','收支流水数据不合法。');
  if(!Number.isSafeInteger(world.clock.day)||world.clock.day<1||!Number.isFinite(world.clock.minute)||world.clock.minute<0||world.clock.minute>=1440||!['preparing','open','closing','closed'].includes(world.clock.phase)||![1,2,4].includes(world.clock.speed))throw new Error('营业日期或时钟状态不合法。');
  if(!Number.isSafeInteger(world.wallet.available)||world.wallet.available<0||!Number.isSafeInteger(world.wallet.escrowLiability)||world.wallet.escrowLiability<0)throw new Error('资金账目不合法。');
  for(const key of ['orders','listings','npcs','matches','tables','reports','log'])need(Array.isArray(world[key]),'INVALID_SAVE',`世界缺少列表 ${key}。`);
  for(const key of ['items','circulation','stats','daily','lifetime','tasks','prices'])need(world[key]&&typeof world[key]==='object'&&!Array.isArray(world[key]),'INVALID_SAVE',`世界缺少对象 ${key}。`);
  need(Number.isSafeInteger(world.seed)&&world.seed>=0&&world.seed<=4294967295&&Number.isSafeInteger(world.serial)&&world.serial>=0,'INVALID_SAVE','存档随机源或实物序号不合法。');
  need(world.player&&typeof world.player.roomId==='string'&&Number.isFinite(world.player.x)&&Number.isFinite(world.player.y),'INVALID_SAVE','店长位置数据不完整。');
  need(world.player.favoriteCardKeys===undefined||Array.isArray(world.player.favoriteCardKeys)&&world.player.favoriteCardKeys.length<=20000&&new Set(world.player.favoriteCardKeys).size===world.player.favoriteCardKeys.length&&world.player.favoriteCardKeys.every(k=>typeof k==='string'&&k.length<=200),'INVALID_SAVE','收藏武将列表不合法。');
  need(world.storeSettings===undefined||world.storeSettings&&typeof world.storeSettings==='object'&&(world.storeSettings.tableFee===null||Number.isSafeInteger(world.storeSettings.tableFee)&&world.storeSettings.tableFee>=0&&world.storeSettings.tableFee<=1000)&&Number.isSafeInteger(world.storeSettings.feeRevision)&&world.storeSettings.feeRevision>=0,'INVALID_SAVE','桌费设置不合法。');
  need(world.matchQueue===undefined||Array.isArray(world.matchQueue)&&world.matchQueue.length<=1000&&new Set(world.matchQueue.map(q=>q.ownerId)).size===world.matchQueue.length&&new Set(world.matchQueue.map(q=>q.queueId)).size===world.matchQueue.length&&world.matchQueue.every(q=>q&&typeof q.queueId==='string'&&typeof q.ownerId==='string'&&['bo3','kof'].includes(q.mode)&&Array.isArray(q.inventoryRefs)&&q.inventoryRefs.length===(q.mode==='kof'?3:1)&&q.inventoryRefs.every(r=>typeof r==='string')&&Number.isSafeInteger(q.fee)&&q.fee>=0&&Number.isFinite(q.createdAt)&&Number.isFinite(q.expiresAt)&&q.expiresAt>q.createdAt&&['manual','wander'].includes(q.waitMode)),'INVALID_SAVE','等待比赛列表不合法。');
  for(const m of world.matches||[])need(m.timeSession===undefined||m.timeSession&&m.timeSession.minutes===30&&typeof m.timeSession.applied==='boolean'&&Number.isFinite(m.timeSession.startedAt?.minute)&&Number.isSafeInteger(m.timeSession.startedAt?.day),'INVALID_SAVE','比赛耗时记录不合法。');
  for(const key of ['goods','cogs','service','fees','operating','purchases'])need(Number.isSafeInteger(world.daily[key])&&world.daily[key]>=0,'INVALID_SAVE',`日账 ${key} 不合法。`);
  need(Number.isSafeInteger(world.daily.matchNet),'INVALID_SAVE','对局净额不合法。');
  for(const value of Object.values(world.prices))need(Number.isSafeInteger(value)&&value>0,'INVALID_SAVE','单卡参考价必须是正整数。');
  for(const value of Object.values(world.lifetime))need(Number.isSafeInteger(value)&&value>=0,'INVALID_SAVE','累计进度不合法。');
  for(const value of Object.values(world.stats))need(value&&['wins','losses','draws'].every(k=>Number.isSafeInteger(value[k])&&value[k]>=0),'INVALID_SAVE','战绩统计不合法。');
  if(!Number.isSafeInteger(world.wallet.debt)||world.wallet.debt<0)throw new Error('欠款数据不合法。');
  const owners=new Set(['player',...world.npcs.map(n=>n.actorId)]);
  for(const n of world.npcs)if(!Number.isSafeInteger(n.wallet?.available)||n.wallet.available<0)throw new Error('NPC 余额不合法。');
  for(const n of world.npcs)need(n.wallet.reserved===undefined||Number.isSafeInteger(n.wallet.reserved)&&n.wallet.reserved>=0&&n.wallet.reserved<=n.wallet.available,'INVALID_SAVE','NPC 预留桌费不合法。');
  for(const n of world.npcs)need(n.presence===undefined||['onsite','offsite'].includes(n.presence),'INVALID_SAVE','顾客在店状态不合法。');
  for(const n of world.npcs){
    if(n.trip)need(typeof n.trip.stage==='string'&&Array.isArray(n.trip.path)&&n.trip.path.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)),'INVALID_SAVE','顾客行程数据不合法。');
    if(n.visit)need(Number.isFinite(n.visit.elapsedSeconds)&&n.visit.elapsedSeconds>=0&&Number.isFinite(n.visit.idleSeconds)&&n.visit.idleSeconds>=0,'INVALID_SAVE','顾客访问计时不合法。');
    if(n.visit){
      need(n.visit.issues===undefined||Array.isArray(n.visit.issues)&&n.visit.issues.length<=8&&n.visit.issues.every(k=>Object.hasOwn(FEEDBACK_REASONS,k)),'INVALID_SAVE','顾客问题记录不合法。');
      need(n.visit.lastIssue===undefined||Object.hasOwn(FEEDBACK_REASONS,n.visit.lastIssue),'INVALID_SAVE','顾客最后反馈不合法。');
      for(const key of ['purchases','pickups','matches'])need(n.visit[key]===undefined||Number.isSafeInteger(n.visit[key])&&n.visit[key]>=0,'INVALID_SAVE','顾客访问结果计数不合法。');
    }
  }
  for(const [ref,i] of Object.entries(world.items)){
    const publicTrash=i?.ownerId==='public:trash'&&i.kind==='card'&&i.location==='trash'&&!i.lock&&!i.protected&&owners.has(i.trash?.discardedBy);
    if(i?.inventoryRef!==ref||!(owners.has(i.ownerId)||publicTrash)||!['pack','box','card'].includes(i.kind)||!Number.isSafeInteger(i.cost)||i.cost<0)throw new Error('库存实物或成本数据不合法。');
    if(i.kind==='card'&&(!i.cardKey||!['N','R','SR','SSR'].includes(i.printedRarity)))throw new Error('印刷卡数据不完整。');
    if(i.kind==='pack'&&(!Array.isArray(i.cards)||i.cards.length!==5)||i.kind==='box'&&(!Array.isArray(i.packets)||i.packets.length!==24||i.packets.some(p=>p.length!==5)))throw new Error('密封商品内容不完整。');
  }
  const escrow=world.matches.filter(m=>m.status!=='finished').reduce((n,m)=>n+m.stake*2+m.serviceHeld,0)+(world.management?.requests||[]).reduce((n,r)=>n+(r.fundsHeld||0),0);
  for(const r of world.management?.requests||[])if(!Number.isSafeInteger(r.fundsHeld)||r.fundsHeld<0||r.fundsHeld>0&&(r.status!=='accepted'||r.kind!=='purchase'||r.fundsHeld!==r.amount))throw new Error('街坊订单托管数据不合法。');
  if(escrow!==world.wallet.escrowLiability)throw new Error('托管余额与未结比赛不一致。');
  validateExperience(world);validateNarrative(world);return world;
}
export function snapshot(world,pauseReasons=[]){return {worldId:world.worldId,branchId:world.branchId,revision:world.revision,
  ...(world.narrative?{narrative:narrativeSummary(world)}:{}),
  starterGift:clone(world.starterGift||null),
  matchmaking:{player:clone((world.matchQueue||[]).find(q=>q.ownerId==='player')||null),waitingCount:(world.matchQueue||[]).length,match:clone(world.matches.filter(m=>!m.background&&m.status!=='finished').map(m=>({matchId:m.matchId,tableId:m.tableId,mode:m.mode,status:m.status,lineup:m.mine.map(c=>({name:c.name,cardKey:c.cardKey}))}))[0]||null)},
  clock:{...clone(world.clock),running:!world.clock.manualPaused&&!pauseReasons.length&&(world.clock.phase==='open'||world.clock.phase==='preparing'&&world.clock.minute<540),pauseReasons:[...(world.clock.manualPaused?[{code:'manual',label:'手动暂停'}]:[]),...pauseReasons]},
  wallet:{...clone(world.wallet),supplierCreditAvailable:Math.max(0,world.rules.supplierCreditLimit-world.wallet.debt)},daily:clone(world.daily),cashJournal:clone((world.cashJournal||[]).slice(-6).reverse()),experience:experienceSnapshot(world),storefront:storefrontView(world),actors:[world.player,...world.npcs.filter(n=>n.presence!=='offsite')].map(({wallet,trip,...actor})=>clone(actor)),allowedActions:world.clock.phase==='preparing'?['business.open']:['open','closing'].includes(world.clock.phase)?['business.close']:['business.nextDay']};}
