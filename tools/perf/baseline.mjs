// tools/perf/baseline.mjs — 阶段 C 的 Node 侧性能基线（v2，修正计量口径）。
//
// v1 的问题（原证据保留在 docs/reviews/evidence/，不覆写）：
//   1. 误判“NPC 自动开桌失效”：正式链路是 runtime.advance → tickNpcTables（只推进/模拟）
//      → tickMatchQueue（schedule，负责入队、配对、registerNpcMatch、seatNpcMatch）。
//      v2 按这条队列链路测，不直接调开桌函数。
//   2. 存储口径混为一谈：分别记 inner.commit（内存克隆）、JSON.stringify（序列化）、
//      Buffer.byteLength（UTF-8 估算体积）；三者都不是磁盘/IndexedDB 落盘时间。
//   3. 营业夹具缺正式地图；advance 的参数是“秒”不是游戏分钟。v2 传真实地图，
//      按 minutesPerSecond × clock.speed 换算，并显式记录每步推进的游戏分钟。
//
// 场景：startup / queries / cards-1000 / cards-5000 / storage / day-rollover /
//       busy-normal / busy-stress / match-queue
// 用法：node tools/perf/baseline.mjs [--json <输出>] [--days 5] [--compare <基线.json>]
// 只读：不写玩家存档、不改 data/、不改 vendor/、不改运行时逻辑。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {createWorld} from '../../modules/backend/world.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
import {buildCatalog} from '../../modules/backend/catalog.mjs';
import {publishProducts,makeSealed} from '../../modules/backend/products.mjs';
import {validateMap} from '../../modules/backend/navigation.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const args=process.argv.slice(2);
const argOf=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const DAYS=Number(argOf('--days')||5);

const source=read('data/cards.json'),rules=read('data/backend-rules.json'),managementConfig=read('data/backend-management.json');
const catalog=buildCatalog(source,rules);
const products=publishProducts(catalog,rules,1);
const MAPS=['store','battle-room'].map(name=>validateMap(read(`assets/frontend/maps/${name}.json`)));

const now=()=>Number(process.hrtime.bigint())/1e6;
function stats(values){
  const list=values.filter(value=>typeof value==='number'&&Number.isFinite(value));
  if(!list.length)return null;
  const sorted=[...list].sort((a,b)=>a-b);
  const at=p=>sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
  return {count:list.length,mean:+(list.reduce((a,b)=>a+b,0)/list.length).toFixed(3),p50:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),max:+sorted[sorted.length-1].toFixed(3)};
}
const round=value=>Math.round(value*100)/100;
const heapMb=()=>Math.round(process.memoryUsage().heapUsed/1048576*10)/10;
const must=(result,label)=>{if(!result?.ok)throw Error(`${label} 失败：${JSON.stringify(result?.error||result)}`);return result;};

/** 统计型仓库：分开记内存克隆、序列化、UTF-8 估算体积。 */
function measuringRepository(initial=null){
  const inner=memoryRepository(initial);
  const commits=[];
  return {
    repository:{
      async read(){return inner.read();},
      async commit(next,expected){
        const cloneStart=now();await inner.commit(next,expected);const memoryMs=now()-cloneStart;
        const serializeStart=now();const json=JSON.stringify(next);const serializeMs=now()-serializeStart;
        commits.push({memoryMs,serializeMs,utf8Bytes:Buffer.byteLength(json,'utf8'),chars:json.length});
      },
      close(){inner.close?.();},
    },
    commits,
  };
}

function seedWorld({cards=0,shelf=0,seed=11,rulesPatch=null,npcDecks=false}={}){
  const localRules={...structuredClone(rules),...(rulesPatch||{})};
  const world=createWorld(localRules);
  world.seed=seed;
  world.products=publishProducts(catalog,localRules,1);
  for(let i=0;i<cards;i+=1){
    const card=catalog.cards[i%catalog.cards.length],ref=`perf:card:${i}`;
    world.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,printVersion:'perf',productId:card.pack,location:'collection',cost:0,protected:false,lock:null};
  }
  for(let i=0;i<shelf;i+=1){
    const product=products[i%products.length];
    const item=makeSealed(world,product,'pack',30+i%15);
    item.location='retail';
  }
  if(npcDecks){
    const picks=catalog.cards.filter(card=>card.currentRarity==='N');
    for(let n=0;n<localRules.maxNpcs;n+=1){
      const actorId='perf-npc-'+n;
      world.npcs.push({actorId,name:actorId,appearanceId:'rookie',wallet:{available:2000,reserved:0},roomId:'store',x:240,y:272,direction:'down',activity:'idle',moving:false,scavenger:n%3===0,presence:'offsite',nextMatchAt:0});
      for(let k=0;k<3;k+=1){
        const card=picks[(n*3+k)%picks.length],ref='perf:npc:'+n+':'+k;
        world.items[ref]={inventoryRef:ref,ownerId:actorId,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,printVersion:'perf',productId:card.pack,location:'collection',cost:0,protected:false,lock:null};
        world.circulation[card.cardKey]={firstDay:1,source:'perf'};
      }
    }
  }
  return {world,rules:localRules};
}

async function openWorld(options={}){
  const {world,rules:localRules}=seedWorld(options);
  const {repository,commits}=measuringRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true});
  const runtime=await createRuntime({source,rules:localRules,managementConfig,maps:MAPS,repository});
  await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'perf'});
  const intro=(await runtime.query('dialogue.offer')).data;
  if(intro?.choices?.some(choice=>choice.optionId==='begin'))must(await runtime.command({requestId:'perf-intro',type:'dialogue.respond',payload:{offerId:intro.offerId,optionId:'begin',proof:intro.proof}}),'dialogue.respond');
  if(runtime.inspect().world.clock.phase==='preparing')must(await runtime.command({requestId:'perf-open',type:'business.open',payload:{}}),'business.open');
  return {runtime,commits};
}

/** advance 的参数是秒；按 minutesPerSecond × clock.speed 换算成游戏分钟。 */
function secondsForGameMinutes(world,minutes){
  const perSecond=(world.rules.minutesPerSecond||2)*(world.clock.speed||1);
  return minutes/perSecond;
}

/** world.log 上限 1000 条；用 eventId 水位统计，溢出时显式标记可能少计。 */
function logMark(world){
  const log=world.log||[];
  return {maxId:log.length?log[log.length-1].eventId:null};
}
function countsSince(world,mark){
  const log=world.log||[];
  const counts={};
  for(const event of log){
    if(mark.maxId!==null&&Number(event.eventId)<=Number(mark.maxId))continue;
    counts[event.type]=(counts[event.type]||0)+1;
  }
  return {counts,capped:log.length>=1000};
}

async function rollDay(runtime,day,{gameMinutes=360,stepMinutes=30}={}){
  const world=()=>runtime.inspect().world;
  if(world().clock.phase==='preparing')must(await runtime.command({requestId:`d${day}-open0`,type:'business.open',payload:{}}),'business.open');
  const mark=logMark(world());
  const steps=[];let advanced=0;
  const peaks={onsite:0,shopping:0,playing:0};
  const t0=now();
  for(let minute=0;minute<gameMinutes;minute+=stepMinutes){
    if(world().clock.phase!=='open')break;
    const seconds=secondsForGameMinutes(world(),stepMinutes);
    const s0=now();await runtime.advance(seconds);steps.push(now()-s0);
    advanced+=stepMinutes;
    const snapshot=world();
    peaks.onsite=Math.max(peaks.onsite,snapshot.npcs.filter(npc=>npc.presence==='onsite').length);
    peaks.shopping=Math.max(peaks.shopping,snapshot.npcs.filter(npc=>['walking','opening','sorting','discarding','scavenging'].includes(npc.activity)).length);
    peaks.playing=Math.max(peaks.playing,snapshot.matches.filter(match=>match.status==='running').length);
  }
  // 打烊前必须让进行中的牌局结束（真实规则：MATCH_ACTIVE 会拒绝打烊）。
  let drainSteps=0;
  while(world().matches.some(match=>match.status!=='finished')&&drainSteps<120){
    const drainStart=now();await runtime.advance(secondsForGameMinutes(world(),5));steps.push(now()-drainStart);drainSteps+=1;
  }
  const tClose=now();
  if(['open','closing'].includes(world().clock.phase))must(await runtime.command({requestId:`d${day}-close`,type:'business.close',payload:{}}),'business.close');
  const closeMs=now()-tClose;
  const counted=countsSince(world(),mark);
  const tNext=now();
  if(world().clock.phase==='closed')must(await runtime.command({requestId:`d${day}-next`,type:'business.nextDay',payload:{}}),'business.nextDay');
  const nextMs=now()-tNext;
  if(world().clock.phase==='preparing')must(await runtime.command({requestId:`d${day}-open1`,type:'business.open',payload:{}}),'business.open');
  return {
    total:now()-t0,steps,closeMs,nextMs,gameMinutesAdvanced:advanced,drainSteps,
    counters:counted.counts,logCapped:counted.capped,peaks,
    business:{
      sales:counted.counts.packSaleCompleted||0,
      openings:counted.counts.customerPacksOpened||0,
      rejected:counted.counts.customerPurchaseRejected||0,
      arrivals:counted.counts.npcArrived||0,
      pathStalled:counted.counts.npcPathStalled||0,
      pathUnavailable:counted.counts.npcPathUnavailable||0,
    },
  };
}

const queries=['shop.snapshot','inventory.list','catalog.list','market.list','combat.formats','combat.eligible','saves.days','ledger.daily'];
async function measureQueries(runtime,{iterations=25}={}){
  const out={};
  for(const name of queries){
    const input=name==='inventory.list'?{limit:200}:name==='catalog.list'?{limit:200}:name==='combat.eligible'?{formatId:'kof'}:{};
    const samples=[];
    for(let i=0;i<iterations;i+=1){
      const t0=now();must(await runtime.query(name,input),`query ${name}`);samples.push(now()-t0);
    }
    out[name]=stats(samples);
  }
  return out;
}

const report={
  version:2,generatedAt:new Date().toISOString(),days:DAYS,
  notes:{
    advance:'runtime.advance 的参数是秒；本报告按 minutesPerSecond × clock.speed 换算，并记录实际推进的游戏分钟。',
    storage:'memoryMs=内存克隆、serializeMs=JSON.stringify、utf8Bytes=Buffer.byteLength 估算；均非磁盘/IndexedDB 落盘时间。',
    counts:'业务计数来自 world.log（上限 1000 条）；logCapped=true 时可能少计。',
    npcMatches:'NPC 自动开桌走 runtime.advance → tickMatchQueue(schedule) → registerNpcMatch → seatNpcMatch；match-queue 场景只调 advance。',
  },
  environment:{node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()?.[0]?.model||'unknown',logicalCpus:os.cpus()?.length||null,totalMemoryMb:Math.round(os.totalmem()/1048576)},
  resources:{cards:catalog.cards.length,products:products.length,maps:MAPS.map(map=>map.mapId),rulesVersion:rules.version??null,ratingVersion:rules.ratingVersion??null},
  scenarios:{},
};

// ---- startup ----
{
  const tCatalog=now();buildCatalog(source,rules);const catalogMs=now()-tCatalog;
  const tRuntime=now();
  const runtime=await createRuntime({source,rules,managementConfig,maps:MAPS,repository:memoryRepository()});
  const runtimeMs=now()-tRuntime;
  const tConnect=now();await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'perf-startup'});const connectMs=now()-tConnect;
  const tSnapshot=now();must(await runtime.query('shop.snapshot'),'shop.snapshot');const snapshotMs=now()-tSnapshot;
  report.scenarios.startup={catalogBuildMs:round(catalogMs),runtimeCreateMs:round(runtimeMs),connectMs:round(connectMs),firstSnapshotMs:round(snapshotMs),note:'runtimeCreate 内部也会建目录；两段不可相加归因浏览器白屏',heapMb:heapMb()};
  await runtime.disconnect?.();
}

// ---- queries / cards-1000 / cards-5000 ----
for(const [name,cards]of [['queries',0],['cards-1000',1000],['cards-5000',5000]]){
  const {runtime}=await openWorld({cards,seed:21});
  const world=runtime.inspect().world;
  const items=Object.values(world.items).filter(item=>item.kind==='card');
  report.scenarios[name]={items:items.length,distinctCards:new Set(items.map(item=>item.cardKey)).size,queries:await measureQueries(runtime),heapMb:heapMb()};
  await runtime.disconnect?.();
}

// ---- storage：分开记内存克隆 / 序列化 / UTF-8 体积 ----
{
  const {runtime,commits}=await openWorld({cards:1000,seed:31});
  const refs=Object.values(runtime.inspect().world.items).filter(item=>item.kind==='card').slice(0,60).map(item=>item.inventoryRef);
  for(const [index,ref]of refs.entries())must(await runtime.command({requestId:`perf-protect-${index}`,type:'inventory.setProtection',payload:{inventoryRef:ref,protected:index%2===0}}),'inventory.setProtection');
  const t0=now();must(await runtime.command({requestId:'perf-save',type:'saves.create',payload:{}}),'saves.create');const saveMs=now()-t0;
  report.scenarios.storage={
    commands:commits.length,
    memoryMs:stats(commits.map(row=>row.memoryMs)),
    serializeMs:stats(commits.map(row=>row.serializeMs)),
    utf8Bytes:stats(commits.map(row=>row.utf8Bytes)),
    saveCommandMs:round(saveMs),
    scope:'每次命令提交整个世界记录；日档另存为独立记录，未计入',
    caveat:'内存仓库；真实 IndexedDB 事务完成时间、写入对象范围与故障/并发行为需另测',
    heapMb:heapMb(),
  };
  await runtime.disconnect?.();
}

// ---- day-rollover ----
{
  const {runtime}=await openWorld({cards:1000,seed:41});
  const totals=[],closes=[],nexts=[];
  for(let day=0;day<5;day+=1){
    const rolled=await rollDay(runtime,day,{gameMinutes:0});
    totals.push(rolled.total);closes.push(rolled.closeMs);nexts.push(rolled.nextMs);
  }
  report.scenarios['day-rollover']={nextDayMs:stats(nexts),closeMs:stats(closes),loopMs:stats(totals),heapMb:heapMb()};
  await runtime.disconnect?.();
}

// ---- busy：普通与压力分开，记录输入与业务计数 ----
for(const [name,options]of [
  ['busy-normal',{cards:1000,shelf:40,seed:51,npcDecks:true}],
  ['busy-stress',{cards:5000,shelf:200,seed:52,npcDecks:true,rulesPatch:{npcIntervalMinutes:8}}],
]){
  const {runtime,commits}=await openWorld(options);
  const days=[],steps=[],heap=[];
  const totals={sales:0,openings:0,rejected:0,arrivals:0,pathStalled:0,pathUnavailable:0};
  const peaks={onsite:0,shopping:0,playing:0};
  let logCapped=false,gameMinutes=0,queuePeak=0;
  for(let day=0;day<DAYS;day+=1){
    const rolled=await rollDay(runtime,day,{gameMinutes:360,stepMinutes:30});
    days.push(rolled.total);steps.push(...rolled.steps);
    heap.push(heapMb());gameMinutes+=rolled.gameMinutesAdvanced;logCapped=logCapped||rolled.logCapped;
    for(const key of Object.keys(totals))totals[key]+=rolled.business[key]||0;
    for(const key of Object.keys(peaks))peaks[key]=Math.max(peaks[key],rolled.peaks[key]);
    queuePeak=Math.max(queuePeak,(runtime.inspect().world.matchQueue||[]).length);
  }
  const world=runtime.inspect().world;
  const cards=Object.values(world.items).filter(item=>item.kind==='card');
  report.scenarios[name]={
    days:DAYS,items:cards.length,distinctCards:new Set(cards.map(item=>item.cardKey)).size,
    shelf:options.shelf,maxNpcs:world.rules.maxNpcs,npcIntervalMinutes:world.rules.npcIntervalMinutes,
    gameMinutesPerDay:360,gameMinutesTotal:gameMinutes,
    npcProfiles:world.npcs.length,peaks,queuePeak,totals,logCapped,
    perDayMs:stats(days),perStepMs:stats(steps),
    memoryMs:stats(commits.map(row=>row.memoryMs)),serializeMs:stats(commits.map(row=>row.serializeMs)),
    heapMbStart:heap[0],heapMbEnd:heap.at(-1),heapMbPeak:Math.max(...heap),
  };
  await runtime.disconnect?.();
}

// ---- match-queue：只调 advance，走正式队列链路 ----
{
  const {world}=seedWorld({cards:0,seed:61,npcDecks:false});
  world.clock.phase='open';world.clock.minute=540;world.nextNpcMinute=10000;
  const picks=catalog.cards.filter(card=>card.currentRarity==='N');
  for(const [n,actorId]of ['perf-q-a','perf-q-b'].entries()){
    world.npcs.push({actorId,name:actorId,appearanceId:'rookie',wallet:{available:1000,reserved:0},roomId:'store',x:240,y:272,direction:'down',activity:'idle',moving:false,scavenger:false,presence:'onsite',nextMatchAt:0});
    for(let k=0;k<3;k+=1){
      const card=picks[n*3+k],ref=actorId+':'+k;
      world.items[ref]={inventoryRef:ref,ownerId:actorId,kind:'card',cardKey:card.cardKey,printedRarity:card.currentRarity,printVersion:'perf',productId:card.pack,location:'collection',cost:0,protected:false,lock:null};
      world.circulation[card.cardKey]={firstDay:1,source:'perf'};
    }
  }
  const {repository}=measuringRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true});
  const runtime=await createRuntime({source,rules,managementConfig,maps:MAPS,repository});
  await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'perf-match'});
  const ticks=[];let registerTickMs=null,settleTickMs=null,queuePeak=0;
  for(let i=0;i<6000;i+=1){
    const before=runtime.inspect().world.matches.some(match=>match.background);
    const t0=now();await runtime.advance(.25);const elapsed=now()-t0;ticks.push(elapsed);
    const after=runtime.inspect().world;
    queuePeak=Math.max(queuePeak,(after.matchQueue||[]).length);
    if(!before&&after.matches.some(match=>match.background)&&registerTickMs===null)registerTickMs=elapsed;
    if(after.matches.some(match=>match.background&&match.status==='finished')){settleTickMs=elapsed;break;}
  }
  const final=runtime.inspect().world;
  const background=final.matches.filter(match=>match.background);
  report.scenarios['match-queue']={
    queueMatched:background.length,
    settled:background.filter(match=>match.status==='finished').length,
    feePaid:background.map(match=>match.simulation?.feePaid??null),
    serviceIncome:final.daily.service,
    registerTickMs:registerTickMs===null?null:round(registerTickMs),
    settleTickMs:settleTickMs===null?null:round(settleTickMs),
    tickMs:stats(ticks),queuePeak,
    gameMinutes:Math.round(ticks.length*0.25*(final.rules.minutesPerSecond||2)),
  };
  await runtime.disconnect?.();
}

const target=argOf('--json');
if(target){
  const file=path.resolve(root,target);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log(`已写入 ${path.relative(root,file)}`);
}
console.log(`环境：node ${process.version} · ${report.environment.cpu} · 逻辑处理器 ${report.environment.logicalCpus}`);
for(const [name,data]of Object.entries(report.scenarios)){
  if(data.queries){
    const rows=Object.entries(data.queries).map(([query,row])=>`${query} ${row.p50}/${row.p95}ms`);
    console.log(`${name.padEnd(13)} 实物 ${String(data.items).padStart(4)} 卡种 ${String(data.distinctCards).padStart(4)}  ${rows.join(' · ')}`);
  }else if(data.perDayMs){
    console.log(`${name.padEnd(13)} 每日 ${data.perDayMs.p50}/${data.perDayMs.p95}ms · 单步 ${data.perStepMs.p50}/${data.perStepMs.p95}ms · 在场峰值 ${data.peaks.onsite} 购物峰值 ${data.peaks.shopping} 比赛峰值 ${data.peaks.playing} · 成交 ${data.totals.sales} 拆包 ${data.totals.openings} 队列峰值 ${data.queuePeak}`);
  }else if(data.memoryMs){
    console.log(`${name.padEnd(13)} 内存克隆 ${data.memoryMs.p50}ms · 序列化 ${data.serializeMs.p50}ms · UTF-8 ${data.utf8Bytes.p50}B`);
  }else{
    console.log(`${name.padEnd(13)} ${JSON.stringify(data).slice(0,240)}`);
  }
}

const compare=argOf('--compare');
if(compare){
  const base=JSON.parse(fs.readFileSync(path.resolve(root,compare),'utf8'));
  const lines=[];
  for(const [name,scenario]of Object.entries(report.scenarios)){
    const before=base.scenarios?.[name];if(!before)continue;
    if(scenario.queries&&before.queries)for(const [query,row]of Object.entries(scenario.queries)){
      const old=before.queries[query];if(!old)continue;
      const delta=(row.p50-old.p50)/old.p50*100;
      lines.push(`${name}/${query}: ${old.p50} → ${row.p50}ms (${delta>=0?'+':''}${delta.toFixed(1)}%)`);
    }
    for(const key of ['perDayMs','perStepMs','memoryMs','serializeMs','nextDayMs','closeMs']){
      if(scenario[key]&&before[key]){
        const delta=(scenario[key].p50-before[key].p50)/before[key].p50*100;
        lines.push(`${name}/${key}: ${before[key].p50} → ${scenario[key].p50}ms (${delta>=0?'+':''}${delta.toFixed(1)}%)`);
      }
    }
  }
  console.log('\n与基线对比：');
  for(const line of lines)console.log('  '+line);
}
