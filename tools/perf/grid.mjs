// Same logical endpoints for historical batched collection and current virtual grid.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startShopServer} from '../../server.mjs';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
import {buildCatalog} from '../../modules/backend/catalog.mjs';
import {sha256} from '../lib/file-inventory.mjs';
import {argument} from '../lib/candidate-output.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),args=process.argv.slice(2);
const count=Number(argument(args,'cards',1000)),rounds=Number(argument(args,'rounds',3)),baseline=argument(args,'baseline-ref',null),output=argument(args,'json',null);
if(!Number.isSafeInteger(count)||count<1||!Number.isSafeInteger(rounds)||rounds<1)throw Error('cards/rounds 必须为正整数');
if(output&&fs.existsSync(path.resolve(root,output)))throw Error('报告已存在，拒绝改写旧证据');
if(baseline&&!/^[a-f0-9]{7,40}$/i.test(baseline))throw Error('baseline-ref 必须是明确的提交 SHA');
const file='frontend-next/components/workspace/collection.mjs';
const served=baseline?execFileSync('git',['show',baseline+':'+file],{cwd:root,maxBuffer:2e6,encoding:'utf8'}):fs.readFileSync(path.join(root,file),'utf8');
const read=file=>JSON.parse(fs.readFileSync(path.join(root,file)));
const source=read('data/cards.json'),rules=read('data/backend-rules.json'),catalog=buildCatalog(source,rules);
const runtime=await createRuntime({source,rules,repository:memoryRepository()}),world=runtime.inspect().world;await runtime.disconnect();
world.clock.manualPaused=true;world.longTerm.loan.intro.status='acknowledged';world.dialogueOffer=null;
for(let i=0;i<count;i++){const card=catalog.cards[i%catalog.cards.length],ref='perf:card:'+i;world.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:card.cardKey,printedRarity:'SR',printVersion:'perf',productId:card.pack,location:'collection',cost:0,protected:false,lock:null};}
const archive={format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:1,minute:480,slot:'start',world};
const report={version:5,generatedAt:new Date().toISOString(),cards:count,mode:baseline?'historical-collection-only':'current',baselineRef:baseline,node:process.version,cpu:os.cpus()[0].model,logicalCpus:os.cpus().length,collectionHash:sha256(served),inputs:Object.fromEntries(['data/cards.json','data/backend-rules.json','frontend-next/components/workspace/styles.mjs','frontend-next/components/workspace/virtual-grid.mjs','frontend/ui/scroll-state.mjs'].map(f=>[f,sha256(fs.readFileSync(path.join(root,f)))])),rounds:[],limitations:['只替换基线 collection 模块，其余使用当前代码；不是历史整版重放','短时桌面样本，不是低端机/长时 FPS 保证','比较相同逻辑行的可达性；虚拟化不要求全量 DOM']};
const server=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(!baseline||req.url.split('?')[0]!=='/'+file)return false;res.writeHead(200,{'content-type':'text/javascript','cache-control':'no-store'});res.end(served);return true;}});let browser;
try{
  browser=await chromium.launch();report.browser=browser.version();const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
  const imported=await page.evaluate(content=>__cardShopApp.command({requestId:'perf-import',type:'saves.import',payload:{content}}),JSON.stringify(archive));if(!imported.ok)throw Error(JSON.stringify(imported));
  await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);
  for(let run=0;run<rounds;run++){
    if(run){await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);}
    const sample=await page.evaluate(async()=>{
      const frame=()=>new Promise(r=>requestAnimationFrame(r));
      const until=async(fn)=>{const end=performance.now()+30000;while(performance.now()<end){const value=fn();if(value)return value;await frame();}throw Error('性能终点未成立');};
      const t0=performance.now();__cardShopApp.openPanel('market',{tab:'collection'});
      const root=()=>document.querySelector('[data-card-grid]'),tile=index=>root()?.querySelector(`[data-row-index="${index}"]`);
      await until(()=>{const target=tile(1);if(!target||target.getBoundingClientRect().height<=0)return false;target.click();return tile(1)?.getAttribute('aria-pressed')==='true';});
      const firstInteractiveMs=performance.now()-t0,initialRows=root().querySelectorAll('[data-card]').length,total=Number(root().dataset.totalRows);
      const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');if(!scroller||scroller.scrollHeight<=scroller.clientHeight)throw Error('缺少真实滚动体');
      await until(()=>{scroller.scrollTop=scroller.scrollHeight;const target=tile(total-1);if(!target)return false;const a=target.getBoundingClientRect(),b=scroller.getBoundingClientRect();if(a.top<b.top||a.bottom>b.bottom+2)return false;if(target.getAttribute('aria-pressed')==='true')return true;target.click();return tile(total-1)?.getAttribute('aria-pressed')==='true';});
      const lastReachableMs=performance.now()-t0,lastRows=root().querySelectorAll('[data-card]').length;
      for(let i=0;i<4;i++){scroller.scrollTop=0;await frame();}
      const visible=()=>[...root().querySelectorAll('[data-card]')].find(t=>{const a=t.getBoundingClientRect(),b=scroller.getBoundingClientRect();return a.bottom>b.top+4&&a.top<b.bottom-4;})?.dataset.rowIndex;
      const before={top:scroller.scrollTop,key:visible(),rows:root().querySelectorAll('[data-card]').length,total:Number(root().dataset.totalRows)};
      if(before.top!==0||before.total!==total)throw Error('重复滚动起始状态不成立');
      const tasks=[],observer=new PerformanceObserver(list=>{for(const e of list.getEntries())tasks.push(e.duration);});observer.observe({entryTypes:['longtask']});
      const started=performance.now(),max=scroller.scrollHeight-scroller.clientHeight,intervals=[];let previous=started,frames=0,peakRows=before.rows;
      await new Promise(resolve=>{function step(time){intervals.push(time-previous);previous=time;frames++;scroller.scrollTop=Math.round(Math.min(1,(time-started)/1000)*max*.6);peakRows=Math.max(peakRows,root().querySelectorAll('[data-card]').length);if(time-started<1000)requestAnimationFrame(step);else resolve();}requestAnimationFrame(step);});
      await frame();await new Promise(r=>setTimeout(r,60));observer.disconnect();
      const after={top:scroller.scrollTop,key:visible(),rows:root().querySelectorAll('[data-card]').length,total:Number(root().dataset.totalRows)};
      if(after.top<=before.top||after.key===before.key||after.total!==total)throw Error('滚动位置/可见行/总数验证失败');
      const search=document.querySelector('input[aria-label="搜索单卡"]'),searchStart=performance.now();search.focus();search.value='曹';search.dispatchEvent(new Event('input',{bubbles:true}));
      await until(()=>{const rows=[...document.querySelectorAll('[data-card-grid] [data-card]')];return rows.length&&rows.every(t=>t.textContent.includes('曹'));});
      const searchMs=performance.now()-searchStart,focusKept=document.activeElement===search;if(!focusKept)throw Error('搜索焦点丢失');
      __cardShopApp.windows.closeAll();await frame();await frame();
      if(document.querySelector('[data-collection-root]')||__cardShopApp.windows.stack.length)throw Error('窗口未清理');
      return {firstInteractiveMs,lastReachableMs,initialRows,lastRows,total,scroll:{before,after,frames,intervals,peakRows,longtasks:tasks,longtaskMs:tasks.reduce((a,b)=>a+b,0)},searchMs,focusKept,domAfterClose:document.querySelectorAll('*').length};
    });
    const expected=new Set(Array.from({length:count},(_,i)=>catalog.cards[i%catalog.cards.length].cardKey)).size;
    if(sample.total!==expected)throw Error(`夹具总行数错误：${sample.total}/${expected}`);
    report.rounds.push(sample);
  }
  report.errors=errors;if(errors.length)throw Error(errors.join('\n'));report.passed=true;
}finally{await browser?.close();await server.close();}
if(output){const target=path.resolve(root,output);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
console.log(JSON.stringify({mode:report.mode,cards:count,rounds:report.rounds.map(r=>({interactiveMs:Math.round(r.firstInteractiveMs),lastMs:Math.round(r.lastReachableMs),initialRows:r.initialRows,lastRows:r.lastRows,frames:r.scroll.frames,longtaskMs:Math.round(r.scroll.longtaskMs),peakRows:r.scroll.peakRows})),passed:report.passed},null,2));
