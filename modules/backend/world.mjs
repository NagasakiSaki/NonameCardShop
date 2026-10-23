import {id, clone, serial} from './common.mjs';
export function createWorld(rules){
  const world={schemaVersion:2,worldId:id('world'),branchId:id('branch'),revision:0,serial:0,seed:Math.floor(Math.random()*4294967296),rules:clone(rules),
    clock:{day:1,minute:480,phase:'preparing',speed:1,manualPaused:false},wallet:{available:rules.startingCash,debt:0,escrowLiability:0},
    player:{actorId:'player',appearanceId:'owner',roomId:'store',x:240,y:272,direction:'down',moving:false,activity:'idle',navVersion:null},
    products:[],items:{},orders:[],listings:[],npcs:[],circulation:{},stats:{},matches:[],tables:[{tableId:'battleRoom.table.01',matchId:null},{tableId:'battleRoom.table.02',matchId:null}],
    daily:{goods:0,cogs:0,service:0,fees:0,matchNet:0,operating:0,purchases:0},reports:[],lifetime:{ordered:0,received:0,opened:0,sales:0,marketSales:0,matches:0},
    tasks:{},log:[],nextNpcMinute:540,prices:{},configOverrides:{}};
  return world;
}
export function note(world,type,data={}){world.log.push({eventId:serial(world,'event'),type,day:world.clock.day,minute:world.clock.minute,...clone(data)});world.log=world.log.slice(-1000);}
export function validateWorld(world){
  if(world?.schemaVersion!==2||!world.worldId||!world.branchId||!world.items||!world.clock||!world.wallet||!Array.isArray(world.products))throw new Error('新版世界存档格式不完整，未覆盖原数据。');
  if(!Number.isSafeInteger(world.wallet.available)||world.wallet.available<0||!Number.isSafeInteger(world.wallet.escrowLiability)||world.wallet.escrowLiability<0)throw new Error('资金账目不合法。');
  for(const key of ['orders','listings','npcs','matches'])if(!Array.isArray(world[key]))throw new Error(`世界缺少 ${key}。`);
  if(!Number.isSafeInteger(world.wallet.debt)||world.wallet.debt<0)throw new Error('欠款数据不合法。');
  const owners=new Set(['player',...world.npcs.map(n=>n.actorId)]);
  for(const n of world.npcs)if(!Number.isSafeInteger(n.wallet?.available)||n.wallet.available<0)throw new Error('NPC 余额不合法。');
  for(const [ref,i] of Object.entries(world.items)){
    if(i?.inventoryRef!==ref||!owners.has(i.ownerId)||!['pack','box','card'].includes(i.kind)||!Number.isSafeInteger(i.cost)||i.cost<0)throw new Error('库存实物或成本数据不合法。');
    if(i.kind==='card'&&(!i.cardKey||!['N','R','SR','SSR'].includes(i.printedRarity)))throw new Error('印刷卡数据不完整。');
    if(i.kind==='pack'&&(!Array.isArray(i.cards)||i.cards.length!==5)||i.kind==='box'&&(!Array.isArray(i.packets)||i.packets.length!==24||i.packets.some(p=>p.length!==5)))throw new Error('密封商品内容不完整。');
  }
  const escrow=world.matches.filter(m=>m.status!=='finished').reduce((n,m)=>n+m.stake*2+m.serviceHeld,0);
  if(escrow!==world.wallet.escrowLiability)throw new Error('托管余额与未结比赛不一致。');
  return world;
}
export function snapshot(world,pauseReasons=[]){return {worldId:world.worldId,branchId:world.branchId,revision:world.revision,
  clock:{...clone(world.clock),running:!world.clock.manualPaused&&!pauseReasons.length&&(world.clock.phase==='open'||world.clock.phase==='preparing'&&world.clock.minute<540),pauseReasons:[...(world.clock.manualPaused?[{code:'manual',label:'手动暂停'}]:[]),...pauseReasons]},
  wallet:clone(world.wallet),daily:clone(world.daily),allowedActions:world.clock.phase==='preparing'?['business.open']:world.clock.phase==='open'?['business.close']:['business.nextDay']};}
