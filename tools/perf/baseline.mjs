// tools/perf/baseline.mjs — 阶段 C 的可复现性能基线（Node 侧）。
//
// 目的：先量再改。每个场景独立建世界、固定 seed、固定迭代次数，输出机器可读 JSON。
// 重要：runtime.inspect() 返回的是 clone，不能直接改它来造夹具；这里用 createWorld 造好世界
// 再通过 repository 初始记录注入，保证 1000/5000 张实物真的存在。
//
// 场景（普通与压力分开）：
//   startup      —— 建目录 / 建世界 / 建运行时 / 连接 / 首个快照
//   queries      —— 热查询耗时分布（空世界）
//   cards-1000   —— 1000 张实物时的库存/目录/市场查询
//   cards-5000   —— 5000 张实物（压力），与 1000 张同口径对比
//   busy-normal  —— 默认规则 + 1000 张实物 + 40 个货架包，连续营业日
//   busy-stress  —— 5000 张实物 + 200 个货架包 + 更密客流（压力场景，单独统计）
//   persist      —— 单次命令的序列化 + 写盘耗时与字节数
//   day-rollover —— 跨日命令耗时（1000 张实物）
//
// 用法：
//   node tools/perf/baseline.mjs [--json <输出>] [--days 10] [--compare <基线.json>]
// 只读：不写玩家存档、不改 data/、不改 vendor/。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {createWorld} from '../../modules/backend/world.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
import {buildCatalog} from '../../modules/backend/catalog.mjs';
import {publishProducts,makeSealed} from '../../modules/backend/products.mjs';
import {tickNpcTables} from '../../modules/backend/npc-tables.mjs';
import {validateMap} from '../../modules/backend/navigation.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const args=process.argv.slice(2);
const argOf=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const DAYS=Number(argOf('--days')||10);

const source=read('data/cards.json'),rules=read('data/backend-rules.json'),managementConfig=read('data/backend-management.json');
const catalog=buildCatalog(source,rules);
const products=publishProducts(catalog,rules,1);

const now=()=>Number(process.hrtime.bigint())/1e6;
function stats(values){
  if(!values.length)return null;
  const sorted=[...values].sort((a,b)=>a-b);
  const at=p=>sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
  return {count:values.length,mean:+(values.reduce((a,b)=>a+b,0)/values.length).toFixed(3),p50:+at(.5).toFixed(3),p95:+at(.95).toFixed(3),max:+sorted[sorted.length-1].toFixed(3)};
}
const round=value=>Math.round(value*100)/100;
const heapMb=()=>Math.round(process.memoryUsage().heapUsed/1048576*10)/10;
const must=(result,label)=>{if(!result?.ok)throw Error(`${label} 失败：${JSON.stringify(result?.error||result)}`);return result;};

/** 计数型仓库：统计写盘次数与序列化字节，不改变事务语义。 */
function countingRepository(initial=null){
  const inner=memoryRepository(initial);
  const writes=[];
  return {
    repository:{async read(){return inner.read();},async commit(next,expected){const t0=now();await inner.commit(next,expected);writes.push({ms:now()-t0,bytes:JSON.stringify(next).length});},close(){inner.close?.();}},
    writes,
  };
}

/** 造一个带实物/货架的世界，并作为 repository 初始记录注入。 */
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
    const item=makeSealed(world,product,'pack',80+i%40);
    item.location='retail';
  }
  // 顾客自带已在流通中的牌组，牌桌才会真的开；否则基线会漏掉比赛开销。
  if(npcDecks){
    const picks=catalog.cards.filter(card=>card.currentRarity==='N');
    for(let n=0;n<localRules.maxNpcs;n+=1){
      const actorId='perf-npc-'+n;
      world.npcs.push({actorId,name:actorId,appearanceId:'rookie',wallet:{available:2000,reserved:0},roomId:'store',x:240,y:272,direction:'down',activity:'idle',moving:false,scavenger:n%3===0,presence:'offsite'});
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
  const {repository,writes}=countingRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true});
  const runtime=await createRuntime({source,rules:localRules,managementConfig,repository});
  await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'perf'});
  const intro=(await runtime.query('dialogue.offer')).data;
  if(intro?.choices?.some(choice=>choice.optionId==='begin'))must(await runtime.command({requestId:'perf-intro',type:'dialogue.respond',payload:{offerId:intro.offerId,optionId:'begin',proof:intro.proof}}),'dialogue.respond');
  if(runtime.inspect().world.clock.phase==='preparing')must(await runtime.command({requestId:'perf-open',type:'business.open',payload:{}}),'business.open');
  return {runtime,writes,world:runtime.inspect().world};
}

/** 一次完整的日循环：确保开门 → 推进到打烊 → 结算 → 跨日。返回各段耗时。 */
async function rollDay(runtime,day,{advanceSteps=12,minutesPerStep=30}={}){
  const t0=now();
  if(runtime.inspect().world.clock.phase==='preparing')must(await runtime.command({requestId:`d${day}-open0`,type:'business.open',payload:{}}),'business.open');
  const advances=[];
  for(let step=0;step<advanceSteps;step+=1){
    if(runtime.inspect().world.clock.phase!=='open')break;
    const a0=now();await runtime.advance(minutesPerStep);advances.push(now()-a0);
  }
  const tClose=now();
  const phase=runtime.inspect().world.clock.phase;
  if(['open','closing'].includes(phase))must(await runtime.command({requestId:`d${day}-close`,type:'business.close',payload:{}}),'business.close');
  const closeMs=now()-tClose;
  const tNext=now();
  if(runtime.inspect().world.clock.phase==='closed')must(await runtime.command({requestId:`d${day}-next`,type:'business.nextDay',payload:{}}),'business.nextDay');
  const nextMs=now()-tNext;
  if(runtime.inspect().world.clock.phase==='preparing')must(await runtime.command({requestId:`d${day}-open1`,type:'business.open',payload:{}}),'business.open');
  return {total:now()-t0,advances,closeMs,nextMs};
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

const report={version:1,generatedAt:new Date().toISOString(),days:DAYS,environment:{
  node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()?.[0]?.model||'unknown',cores:os.cpus()?.length||null,totalMemoryMb:Math.round(os.totalmem()/1048576),
},scenarios:{}};

// ---- startup ----
{
  const tCatalog=now();buildCatalog(source,rules);const catalogMs=now()-tCatalog;
  const tRuntime=now();
  const runtime=await createRuntime({source,rules,managementConfig,repository:memoryRepository()});
  const runtimeMs=now()-tRuntime;
  const tConnect=now();await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'perf-startup'});const connectMs=now()-tConnect;
  const tSnapshot=now();must(await runtime.query('shop.snapshot'),'shop.snapshot');const snapshotMs=now()-tSnapshot;
  report.scenarios.startup={catalogBuild:round(catalogMs),runtimeCreate:round(runtimeMs),connect:round(connectMs),firstSnapshot:round(snapshotMs),heapMb:heapMb(),cards:catalog.cards.length};
  await runtime.disconnect?.();
}

// ---- queries / cards-1000 / cards-5000 ----
for(const [name,cards]of [['queries',0],['cards-1000',1000],['cards-5000',5000]]){
  const {runtime}=await openWorld({cards,seed:21});
  const inventory=runtime.inspect().world.items;
  report.scenarios[name]={cards:Object.values(inventory).filter(item=>item.kind==='card').length,queries:await measureQueries(runtime),heapMb:heapMb()};
  await runtime.disconnect?.();
}

// ---- persist：单次命令的写盘代价 ----
{
  const {runtime,writes}=await openWorld({cards:1000,seed:31});
  const refs=Object.values(runtime.inspect().world.items).filter(item=>item.kind==='card').slice(0,60).map(item=>item.inventoryRef);
  for(const [index,ref]of refs.entries())must(await runtime.command({requestId:`perf-protect-${index}`,type:'inventory.setProtection',payload:{inventoryRef:ref,protected:index%2===0}}),'inventory.setProtection');
  const t0=now();const saved=must(await runtime.command({requestId:'perf-save',type:'saves.create',payload:{}}),'saves.create');const saveMs=now()-t0;
  report.scenarios.persist={commands:writes.length,commitMs:stats(writes.map(write=>write.ms)),bytes:stats(writes.map(write=>write.bytes)),saveCommandMs:round(saveMs),archiveId:Boolean(saved.data?.archiveId),heapMb:heapMb()};
  await runtime.disconnect?.();
}

// ---- day-rollover ----
{
  const {runtime,writes}=await openWorld({cards:1000,seed:41});
  const totals=[],closes=[],nexts=[];
  for(let day=0;day<5;day+=1){
    const rolled=await rollDay(runtime,day,{advanceSteps:0});
    totals.push(rolled.total);closes.push(rolled.closeMs);nexts.push(rolled.nextMs);
  }
  report.scenarios['day-rollover']={nextDayMs:stats(nexts),closeMs:stats(closes),loopMs:stats(totals),commitMs:stats(writes.map(write=>write.ms)),heapMb:heapMb()};
  await runtime.disconnect?.();
}

// ---- busy：普通与压力分开 ----
for(const [name,options]of [
  ['busy-normal',{cards:1000,shelf:40,seed:51,npcDecks:true}],
  ['busy-stress',{cards:5000,shelf:200,seed:52,npcDecks:true,rulesPatch:{npcIntervalMinutes:8,npcMatchIntervalMinutes:10}}],
]){
  const {runtime,writes}=await openWorld(options);
  const days=[],advances=[],heap=[];let npcPeak=0,matches=0;
  for(let day=0;day<DAYS;day+=1){
    const rolled=await rollDay(runtime,day);
    days.push(rolled.total);advances.push(...rolled.advances);
    heap.push(heapMb());
    const world=runtime.inspect().world;
    npcPeak=Math.max(npcPeak,world.npcs.length);
    matches=Math.max(matches,world.matches.length);
  }
  report.scenarios[name]={
    days:DAYS,cards:options.cards,shelf:options.shelf,npcMax:runtime.inspect().world.rules.maxNpcs,npcIntervalMinutes:runtime.inspect().world.rules.npcIntervalMinutes,
    npcPeak,matchesPeak:matches,perDayMs:stats(days),perAdvanceMs:stats(advances),
    commitMs:stats(writes.map(write=>write.ms)),heapMbStart:heap[0],heapMbEnd:heap.at(-1),heapMbPeak:Math.max(...heap),
  };
  await runtime.disconnect?.();
}

// ---- match-settle：牌桌注册与结算的真实开销 ----
// 注意：runtime.advance 调用 tickNpcTables 时固定 schedule:false，正式运行时不会自动开桌；
// 这里直接调用真实函数（schedule:true）测成本，不代表正式流程会自动发生。
{
  const {world}=seedWorld({cards:200,seed:61,npcDecks:true});
  world.clock.phase='open';world.clock.minute=540;world.nextNpcMinute=10000;
  const maps={};
  for(const name of ['store','battle-room']){const raw=read(`assets/frontend/maps/${name}.json`);maps[raw.mapId||name]=validateMap(raw);}
  const navigation={get:id=>maps[id]};
  for(const npc of world.npcs.slice(0,4)){npc.presence='onsite';npc.activity='idle';npc.trip=null;npc.nextMatchAt=0;npc.roomId='store';npc.x=240;npc.y=272;}
  const ticks=[];let registerMs=null,settleMs=null;
  for(let i=0;i<4000;i+=1){
    const before=world.matches.length;
    const t0=now();tickNpcTables(world,catalog,navigation,0.25);const elapsed=now()-t0;ticks.push(elapsed);
    if(registerMs===null&&world.matches.length>before)registerMs=elapsed;
    if(world.matches.some(match=>match.status==='finished')){settleMs=elapsed;break;}
  }
  const finished=world.matches.filter(match=>match.status==='finished');
  report.scenarios['match-settle']={registerMs:registerMs===null?null:round(registerMs),settleMs:settleMs===null?null:round(settleMs),tickMs:stats(ticks),matches:finished.length,settled:finished.filter(match=>match.simulation?.feePaid).length};
}

// ---- 输出 ----
const target=argOf('--json');
if(target){
  const file=path.resolve(root,target);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log(`已写入 ${path.relative(root,file)}`);
}
console.log(`环境：node ${process.version} · ${report.environment.cpu} · ${report.environment.cores} 核 · ${report.environment.totalMemoryMb}MB`);
for(const [name,data]of Object.entries(report.scenarios)){
  if(data.queries){
    const rows=Object.entries(data.queries).map(([query,row])=>`${query} ${row.p50}/${row.p95}ms`);
    console.log(`${name.padEnd(13)} 卡 ${String(data.cards).padStart(4)}  ${rows.join(' · ')}`);
  }else if(data.perDayMs){
    console.log(`${name.padEnd(13)} 每日 ${data.perDayMs.p50}/${data.perDayMs.p95}ms · 单步 ${data.perAdvanceMs.p50}/${data.perAdvanceMs.p95}ms · NPC 峰值 ${data.npcPeak} · 比赛峰值 ${data.matchesPeak} · 堆 ${data.heapMbStart}→${data.heapMbEnd}MB`);
  }else{
    console.log(`${name.padEnd(13)} ${JSON.stringify(data).slice(0,200)}`);
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
    for(const key of ['perDayMs','perAdvanceMs','commitMs','nextDayMs','closeMs']){
      if(scenario[key]&&before[key]){
        const delta=(scenario[key].p50-before[key].p50)/before[key].p50*100;
        lines.push(`${name}/${key}: ${before[key].p50} → ${scenario[key].p50}ms (${delta>=0?'+':''}${delta.toFixed(1)}%)`);
      }
    }
  }
  console.log('\n与基线对比：');
  for(const line of lines)console.log('  '+line);
}
