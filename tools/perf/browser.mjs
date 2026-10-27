// tools/perf/browser.mjs — 阶段 C 的浏览器侧基线（v2，正式入口 /?profile=legacy）。
//
// v1 的问题（原证据保留）：
//   1. 滚动测量选到了没有滚动范围的节点（scrollHeight === clientHeight、finalScrollTop 0），
//      62 帧不代表真实千卡滚动。v2 从收藏根节点向上找真正 overflow auto/scroll 且有范围的滚动体，
//      并断言 scrollTop 与可见行确实变化；找不到就标 valid:false，不以 0 当作通过。
//   2. 首屏把“空档首次进入”和“导入后重载”混在一起。v2 分开记冷启动与热重载。
//   3. 关闭后 DOM 回落不能证明没有监听器泄漏。v2 用 addInitScript 包住
//      addEventListener/removeEventListener 统计净增量，并记录 DOM/堆趋势。
//
// 用法：node tools/perf/browser.mjs [--json <输出>] [--cards 1000] [--rounds 8]
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
const ROUNDS=Number(argOf('--rounds')||8);

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
  fixture.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:card.cardKey,printedRarity:'SR',printVersion:'perf',productId:card.pack,location:'collection',cost:0,protected:false,lock:null};
}
const archive={format:'noname-shop-world-save',version:2,worldId:fixture.worldId,branchId:fixture.branchId,day:1,minute:480,slot:'start',world:fixture};

const report={version:2,generatedAt:new Date().toISOString(),cards:CARDS,rounds:ROUNDS,environment:{
  node:process.version,platform:`${process.platform}/${process.arch}`,cpu:os.cpus()?.[0]?.model||'unknown',logicalCpus:os.cpus()?.length||null,totalMemoryMb:Math.round(os.totalmem()/1048576),
},resources:{catalogCards:catalog.cards.length,fixtureItems:CARDS},scenarios:{}};

const server=await startShopServer({port:0,enginePort:0});
let browser;
try{
  browser=await chromium.launch({args:['--enable-precise-memory-info'],...(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'})});
  report.environment.browser=browser.version();
  const page=await browser.newPage({viewport:{width:1440,height:900}});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  page.setDefaultTimeout(30000);
  // 监听器净增量：包住 addEventListener/removeEventListener，按 target 类型统计。
  await page.addInitScript(()=>{
    window.__listenerStats={add:0,remove:0,byType:{}};
    const add=EventTarget.prototype.addEventListener,remove=EventTarget.prototype.removeEventListener;
    EventTarget.prototype.addEventListener=function(type,...rest){window.__listenerStats.add+=1;window.__listenerStats.byType[type]=(window.__listenerStats.byType[type]||0)+1;return add.call(this,type,...rest);};
    EventTarget.prototype.removeEventListener=function(type,...rest){window.__listenerStats.remove+=1;return remove.call(this,type,...rest);};
  });

  // ---- 首屏：冷启动（空档）与热重载（存量档）分开 ----
  const coldStart=Date.now();
  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true);
  const coldMs=Date.now()-coldStart;
  const coldState=await page.evaluate(()=>({dom:document.getElementsByTagName('*').length,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null}));
  await page.evaluate(async content=>{
    const result=await __cardShopApp.command({requestId:'perf-import',type:'saves.import',payload:{content}});
    if(!result.ok)throw Error(JSON.stringify(result.error));
  },JSON.stringify(archive));
  await page.waitForTimeout(300);
  const warmStart=Date.now();
  await page.reload();
  await page.waitForFunction(()=>window.__cardShopReady===true);
  const warmMs=Date.now()-warmStart;
  const warmState=await page.evaluate(()=>({dom:document.getElementsByTagName('*').length,heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,listeners:{...window.__listenerStats}}));
  report.scenarios.boot={coldEmptyMs:coldMs,coldEmptyState:coldState,warmStockedMs:warmMs,warmStockedState:warmState};

  // 全局监听器：只有 window/document 上的残留才可能是真泄漏；节点上的监听器随节点回收。
  const cdp=await page.context().newCDPSession(page);
  const globalListeners=async()=>{
    const out={};
    for(const target of ['window','document']){
      const {result}=await cdp.send('Runtime.evaluate',{expression:target,objectGroup:'perf'});
      const listeners=await cdp.send('DOMDebugger.getEventListeners',{objectId:result.objectId});
      out[target]=listeners.listeners.length;
      await cdp.send('Runtime.releaseObject',{objectId:result.objectId});
    }
    return out;
  };
  const listenersBefore=await globalListeners();
  // ---- 窗口反复开关：耗时、DOM、堆、监听器净增量 ----
  const rounds=[];const listenerSamples=[];
  for(let i=0;i<ROUNDS;i+=1){
    const t0=Date.now();
    await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
    await page.locator('[data-collection-root] [data-card-grid] [data-card]').first().waitFor();
    const openMs=Date.now()-t0;
    const openState=await page.evaluate(()=>({
      dom:document.getElementsByTagName('*').length,
      heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,
      tiles:document.querySelectorAll('[data-collection-root] [data-card-grid] [data-card]').length,
      rows:document.querySelectorAll('[data-collection-root] [data-card-grid] [data-card]').length,
      listeners:{...window.__listenerStats},
    }));
    const t1=Date.now();
    await page.evaluate(()=>__cardShopApp.windows.closeAll());
    const closeMs=Date.now()-t1;
    const closedState=await page.evaluate(()=>({
      dom:document.getElementsByTagName('*').length,
      heap:performance.memory?Math.round(performance.memory.usedJSHeapSize/1048576*10)/10:null,
      stack:__cardShopApp.windows.stack.length,
      listeners:{...window.__listenerStats},
    }));
    rounds.push({openMs,closeMs,openDom:openState.dom,closedDom:closedState.dom,openHeap:openState.heap,closedHeap:closedState.heap,tiles:openState.tiles,stack:closedState.stack});
    listenerSamples.push({openAdd:openState.listeners.add,openRemove:openState.listeners.remove,closedAdd:closedState.listeners.add,closedRemove:closedState.listeners.remove});
  }
  const netListeners=rounds.map((_,index)=>{
    const sample=listenerSamples[index];
    return sample.closedAdd-sample.closedRemove;
  });
  const listenersAfter=await globalListeners();
  report.scenarios.windows={
    rounds:ROUNDS,
    openMs:statsOf(rounds.map(row=>row.openMs)),closeMs:statsOf(rounds.map(row=>row.closeMs)),
    domOpen:statsOf(rounds.map(row=>row.openDom)),domClosed:statsOf(rounds.map(row=>row.closedDom)),
    heapOpen:statsOf(rounds.filter(row=>row.openHeap!==null).map(row=>row.openHeap)),
    heapClosed:statsOf(rounds.filter(row=>row.closedHeap!==null).map(row=>row.closedHeap)),
    tiles:statsOf(rounds.map(row=>row.tiles)),
    netAddRemoveCalls:netListeners,
    listenerGrowth:netListeners.length>1?netListeners.at(-1)-netListeners[0]:0,
    stackLeak:rounds.some(row=>row.stack!==0),
    listenersBefore,listenersAfter,
    note:'netAddRemoveCalls 是 add/remove 调用次数差，节点销毁时监听器随节点回收、不会调用 remove，所以它不能单独证明泄漏；真正的泄漏看 listenersBefore/After（window/document 上的残留）。',
  };

  // ---- 滚动：找真正的滚动体，断言位置与可见行变化 ----
  await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));
  await page.locator('[data-collection-root] [data-card-grid] [data-card]').first().waitFor();
  const rowsInfo=await page.evaluate(()=>({
    tiles:document.querySelectorAll('[data-collection-root] [data-card-grid] [data-card]').length,
    items:__cardShopApp.snapshot().inventory?null:null,
  }));
  const scroll=await page.evaluate(async()=>{
    const rootNode=document.querySelector('[data-collection-root]');
    const chain=[];let node=rootNode,scroller=null;
    while(node&&node!==document.body){
      const style=getComputedStyle(node);
      chain.push({tag:node.tagName,cls:String(node.className||'').slice(0,40),overflowY:style.overflowY,scrollHeight:node.scrollHeight,clientHeight:node.clientHeight});
      if(!scroller&&/auto|scroll/.test(style.overflowY)&&node.scrollHeight>node.clientHeight+8)scroller=node;
      node=node.parentElement;
    }
    if(!scroller)return {valid:false,reason:'未找到有滚动范围的容器',chain};
    const visibleKey=()=>{
      const tiles=[...scroller.querySelectorAll('[data-card]')];
      const box=scroller.getBoundingClientRect();
      const hit=tiles.find(tile=>{const r=tile.getBoundingClientRect();return r.top>=box.top-2&&r.bottom<=box.bottom+2;});
      return hit?hit.getAttribute('data-card'):null;
    };
    const before={top:scroller.scrollTop,key:visibleKey(),scrollHeight:scroller.scrollHeight,clientHeight:scroller.clientHeight};
    const longtasks=[];
    const observer=new PerformanceObserver(list=>{for(const entry of list.getEntries())longtasks.push(Math.round(entry.duration));});
    try{observer.observe({entryTypes:['longtask']});}catch{}
    let frames=0;const t0=performance.now();
    await new Promise(resolve=>{
      const step=()=>{frames+=1;scroller.scrollTop+=Math.max(60,Math.round(scroller.scrollHeight/100));if(performance.now()-t0<1000)requestAnimationFrame(step);else resolve();};
      requestAnimationFrame(step);
    });
    const elapsed=performance.now()-t0;
    await new Promise(resolve=>setTimeout(resolve,60));
    observer.disconnect();
    const after={top:scroller.scrollTop,key:visibleKey()};
    return {
      valid:after.top>before.top&&after.key!==before.key,
      moved:after.top>before.top,visibleRowChanged:after.key!==before.key,
      beforeTop:before.top,afterTop:Math.round(after.top),scrollHeight:before.scrollHeight,clientHeight:before.clientHeight,
      frames,elapsedMs:Math.round(elapsed),longtasks,longtaskTotal:longtasks.reduce((a,b)=>a+b,0),
    };
  });
  report.scenarios.scroll={...scroll,displayedRows:rowsInfo.tiles};

  // ---- 搜索：输入 → 结果已应用 → 布局可用 ----
  const search=page.getByRole('searchbox',{name:'搜索单卡',exact:true});
  const inputs=[];
  for(const term of ['曹','曹操','关','张','刘']){
    const t0=Date.now();
    await search.fill(term);
    await page.waitForFunction(expected=>{
      const tiles=[...document.querySelectorAll('[data-collection-root] [data-card-grid] [data-card]')];
      if(!tiles.length)return false;
      const matches=tiles.every(tile=>{
        const card=tile.querySelector('[data-card-name],[data-name]');
        const text=(tile.textContent||'');
        return text.includes(expected);
      });
      return matches;
    },term,{timeout:8000}).catch(()=>null);
    const elapsed=Date.now()-t0;
    inputs.push({term,ms:elapsed,tiles:await page.locator('[data-collection-root] [data-card-grid] [data-card]').count(),focus:await search.evaluate(node=>node===document.activeElement)});
  }
  await search.fill('');
  await page.waitForTimeout(250);
  report.scenarios.search={
    samples:inputs.map(row=>row.ms),ms:statsOf(inputs.map(row=>row.ms)),
    focusKept:inputs.every(row=>row.focus),
    tilesPerTerm:inputs.map(row=>row.tiles),
    tilesAfterClear:await page.locator('[data-collection-root] [data-card-grid] [data-card]').count(),
    note:'等待条件是“可见行文本都包含关键词”，即筛选已应用且已渲染；不是固定延时',
  };

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
console.log(`环境：node ${process.version} · ${report.environment.cpu} · 逻辑处理器 ${report.environment.logicalCpus} · ${report.environment.browser}`);
console.log(`首屏：冷启动(空档) ${report.scenarios.boot.coldEmptyMs}ms · 热重载(存量档) ${report.scenarios.boot.warmStockedMs}ms · DOM ${report.scenarios.boot.warmStockedState.dom}`);
console.log(`窗口开关 ×${ROUNDS}：开 ${report.scenarios.windows.openMs.p50}ms / 关 ${report.scenarios.windows.closeMs.p50}ms · DOM 开 ${report.scenarios.windows.domOpen.p50} / 关 ${report.scenarios.windows.domClosed.p50} · 监听器净增 ${report.scenarios.windows.listenerGrowth} · 残留栈 ${report.scenarios.windows.stackLeak}`);
const scrollReport=report.scenarios.scroll;
console.log(scrollReport.valid
  ?`滚动 1s：有效 · ${scrollReport.frames} 帧 · scrollTop ${scrollReport.beforeTop}→${scrollReport.afterTop} · 可见行变化 ${scrollReport.visibleRowChanged} · 长任务 ${scrollReport.longtasks.length}/${scrollReport.longtaskTotal}ms`
  :`滚动：无效（${scrollReport.reason||'未移动或可见行未变化'}）`);
console.log(`搜索：${report.scenarios.search.ms.p50}/${report.scenarios.search.ms.p95}ms · 焦点保持 ${report.scenarios.search.focusKept} · 各词行数 ${report.scenarios.search.tilesPerTerm.join('/')}`);
if(report.errors.length)console.log('页面异常：',report.errors.slice(0,3));
