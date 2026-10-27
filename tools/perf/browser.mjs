// tools/perf/browser.mjs — 阶段 C 的浏览器侧基线（正式入口 /?profile=legacy）。
//
// 量的是 Node 侧量不到的部分：首屏、DOM 数、窗口反复开关、千卡滚动、搜索输入延迟、
// 长任务与堆趋势。场景用 1000 张实物的固定夹具，seed 与步骤固定，可重复。
//
// 用法：node tools/perf/browser.mjs [--json <输出>] [--cards 1000] [--rounds 10]
// 只读：只在临时服务器 origin 上写测试存档，不触碰真实玩家存档。
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startShopServer} from '../../server.mjs';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
import {buildCatalog} from '../../modules/backend/catalog.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const root=path.resolve(here,'..','..');
const read=p=>JSON.parse(fs.readFileSync(path.join(root,p),'utf8'));
const args=process.argv.slice(2);
const argOf=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const CARDS=Number(argOf('--cards')||1000);
const ROUNDS=Number(argOf('--rounds')||10);

const source=read('data/cards.json'),rules=read('data/backend-rules.json');
const catalog=buildCatalog(source,rules);
const runtime=await createRuntime({source,rules,repository:memoryRepository()});
const fixture=runtime.inspect().world;
fixture.clock.manualPaused=true;
fixture.longTerm.loan.intro.status='acknowledged';
fixture.dialogueOffer=null;
fixture.player.roomId='store';fixture.player.x=376;fixture.player.y=104;fixture.player.moving=false;
for(const npc of fixture.npcs.filter(entry=>entry.debtCollector)){npc.presence='offsite';npc.trip=null;}
for(let i=0;i<CARDS;i+=1){
  const card=catalog.cards[i%catalog.cards.length],ref='perf:card:'+i;
  fixture.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:card.cardKey,printedRarity:card.rarity==='SSR'?'SSR':'SR',printVersion:'perf',productId:card.pack,location:'collection',cost:0,protected:false,lock:null};
}
const archive={format:'noname-shop-world-save',version:2,worldId:fixture.worldId,branchId:fixture.branchId,day:1,minute:480,slot:'start',world:fixture};

const report={version:1,generatedAt:new Date().toISOString(),cards:CARDS,rounds:ROUNDS,environment:{
  node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()?.[0]?.model||'unknown',cores:os.cpus()?.length||null,totalMemoryMb:Math.round(os.totalmem()/1048576),
},scenarios:{}};

const server=await startShopServer({port:0,enginePort:0});
let browser;
try{
  browser=await chromium.launch({args:['--enable-precise-memory-info'],...(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'})});
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(30000);

  // ---- 首屏 ----
  const boots=[];
  for(let i=0;i<3;i+=1){
    const t0=Date.now();
    await page.goto(server.origin+'/?profile=legacy');
    await page.waitForFunction(()=>window.__cardShopReady===true);
    boots.push(Date.now()-t0);
    if(i===0){
      await page.evaluate(async content=>{
        const result=await __cardShopApp.command({requestId:'perf-import',type:'saves.import',payload:{content}});
        if(!result.ok)throw Error(JSON.stringify(result.error));
      },JSON.stringify(archive));
      await page.waitForTimeout(400);
    }
  }
  const firstPaint=await page.evaluate(()=>({
    domNodes:document.getElementsByTagName('*').length,
    readyState:document.readyState,
    heapMb:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,
    canvas:document.querySelectorAll('canvas').length,
  }));
  report.scenarios.boot={runsMs:boots,medianMs:boots.slice().sort((a,b)=>a-b)[1],...firstPaint};

  // ---- 窗口反复开关 ----
  const openClose=[];
  const heapAfter=[];
  for(let i=0;i<ROUNDS;i+=1){
    const t0=Date.now();
    await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
    await page.locator('[data-collection-root] [data-card-grid] [data-card]').first().waitFor();
    const openMs=Date.now()-t0;
    const mid=await page.evaluate(()=>({dom:document.getElementsByTagName('*').length,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null}));
    const t1=Date.now();
    await page.evaluate(()=>__cardShopApp.windows.closeAll());
    const closeMs=Date.now()-t1;
    const after=await page.evaluate(()=>({dom:document.getElementsByTagName('*').length,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,stack:__cardShopApp.windows.stack.length}));
    openClose.push({openMs,closeMs,...mid,closedDom:after.dom,closedHeap:after.heap,stack:after.stack});
    heapAfter.push(after.heap);
  }
  report.scenarios.windows={
    rounds:ROUNDS,
    openMs:statsOf(openClose.map(row=>row.openMs)),closeMs:statsOf(openClose.map(row=>row.closeMs)),
    domOpen:statsOf(openClose.map(row=>row.dom)),domClosed:statsOf(openClose.map(row=>row.closedDom)),
    heapOpen:statsOf(openClose.filter(row=>row.heap!==null).map(row=>row.heap)),
    heapTrend:heapAfter,
    stackLeak:openClose.some(row=>row.stack!==0),
  };

  // ---- 千卡滚动 + 长任务 ----
  await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
  await page.locator('[data-collection-root] [data-card-grid] [data-card]').first().waitFor();
  const scroll=await page.evaluate(async()=>{
    const longtasks=[];
    const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longtasks.push(Math.round(entry.duration));});
    try{observer.observe({entryTypes:['longtask']});}catch{}
    const host=document.querySelector('[data-collection-root]');
    const scroller=[...host.querySelectorAll('*')].find(node=>node.scrollHeight>node.clientHeight+50)||host;
    const before={scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight,scrollTop:scroller.scrollTop};
    let frames=0;
    const t0=performance.now();
    await new Promise(resolve=>{
      const step=()=>{frames+=1;scroller.scrollTop+=Math.max(40,Math.round(scroller.scrollHeight/120));if(performance.now()-t0<1000)requestAnimationFrame(step);else resolve();};
      requestAnimationFrame(step);
    });
    const elapsed=performance.now()-t0;
    observer.disconnect();
    return {frames,elapsedMs:Math.round(elapsed),longtasks,longtaskTotal:longtasks.reduce((a,b)=>a+b,0),scrollHeight:before.scrollHeight,clientHeight:before.clientHeight,finalScrollTop:scroller.scrollTop};
  });
  report.scenarios.scroll=scroll;

  // ---- 搜索输入延迟 ----
  const search=page.getByRole('searchbox',{name:'搜索单卡',exact:true});
  const inputs=[];
  for(const term of ['曹','曹操','关','张','刘','孙','赵','马','黄','周']){
    const t0=Date.now();
    await search.fill(term);
    await page.waitForTimeout(0);
    await page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
    inputs.push({term,ms:Date.now()-t0,tiles:await page.locator('[data-collection-root] [data-card-grid] [data-card]').count(),focus:await search.evaluate(node=>node===document.activeElement)});
  }
  await search.fill('');
  await page.waitForTimeout(200);
  report.scenarios.search={samples:inputs.map(row=>row.ms),ms:statsOf(inputs.map(row=>row.ms)),focusKept:inputs.every(row=>row.focus),tilesAfterClear:await page.locator('[data-collection-root] [data-card-grid] [data-card]').count()};

  report.errors=errors;
}finally{
  await browser?.close();
  await server.close();
}

function statsOf(values){
  const list=values.filter(value=>typeof value==='number'&&Number.isFinite(value));
  if(!list.length)return null;
  const sorted=[...list].sort((a,b)=>a-b);
  const at=p=>sorted[Math.min(sorted.length-1,Math.floor(p*(sorted.length-1)))];
  return {count:list.length,mean:+(list.reduce((a,b)=>a+b,0)/list.length).toFixed(2),p50:+at(.5).toFixed(2),p95:+at(.95).toFixed(2),max:+sorted[sorted.length-1].toFixed(2)};
}

const target=argOf('--json');
if(target){
  const file=path.resolve(root,target);
  fs.mkdirSync(path.dirname(file),{recursive:true});
  fs.writeFileSync(file,JSON.stringify(report,null,2));
  console.log(`已写入 ${path.relative(root,file)}`);
}
console.log(`环境：node ${process.version} · ${report.environment.cpu} · 卡 ${CARDS}`);
console.log(`首屏 ${report.scenarios.boot.medianMs}ms · DOM ${report.scenarios.boot.domNodes} · 堆 ${report.scenarios.boot.heapMb}MB`);
console.log(`窗口开关 ×${ROUNDS}：开 ${report.scenarios.windows.openMs.p50}ms / 关 ${report.scenarios.windows.closeMs.p50}ms · DOM 开 ${report.scenarios.windows.domOpen.p50} / 关 ${report.scenarios.windows.domClosed.p50} · 残留栈 ${report.scenarios.windows.stackLeak}`);
console.log(`滚动 1s：${report.scenarios.scroll.frames} 帧 · 长任务 ${report.scenarios.scroll.longtasks.length} 个 / ${report.scenarios.scroll.longtaskTotal}ms`);
console.log(`搜索：${report.scenarios.search.ms.p50}/${report.scenarios.search.ms.p95}ms · 焦点保持 ${report.scenarios.search.focusKept} · 清空后 ${report.scenarios.search.tilesAfterClear} 行`);
if(report.errors.length)console.log('页面异常：',report.errors.slice(0,3));
