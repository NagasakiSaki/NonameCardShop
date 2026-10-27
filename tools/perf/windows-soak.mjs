// Complement to operations-soak: paused, isolated UI lifecycle loop, not a throughput benchmark.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startShopServer} from '../../server.mjs';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
import {buildCatalog} from '../../modules/backend/catalog.mjs';
import {argument} from '../lib/candidate-output.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),args=process.argv.slice(2),seconds=Number(argument(args,'seconds',600)),json=argument(args,'json',null);
if(!Number.isFinite(seconds)||seconds<0)throw Error('seconds 必须非负');if(json&&fs.existsSync(path.resolve(root,json)))throw Error('报告已存在');
const read=f=>JSON.parse(fs.readFileSync(path.join(root,f))),source=read('data/cards.json'),rules=read('data/backend-rules.json'),catalog=buildCatalog(source,rules);
const temporary=await createRuntime({source,rules,repository:memoryRepository()}),world=temporary.inspect().world;await temporary.disconnect();
world.clock.manualPaused=true;world.longTerm.loan.intro.status='acknowledged';world.dialogueOffer=null;
for(let i=0;i<5000;i++){const c=catalog.cards[i%catalog.cards.length],ref='ui-soak:'+i;world.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:c.cardKey,printedRarity:'SR',printVersion:'ui-soak',productId:c.pack,location:'collection',cost:0,protected:false,lock:null};}
const archive={format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:1,minute:480,slot:'start',world};
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
  const imported=await page.evaluate(content=>__cardShopApp.command({requestId:'ui-soak-import',type:'saves.import',payload:{content}}),JSON.stringify(archive));if(!imported.ok)throw Error(JSON.stringify(imported));
  await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);await page.waitForFunction(()=>__cardShopApp.getWorldScene()?.ready);const cdp=await page.context().newCDPSession(page);
  const expectedPauses=await page.evaluate(()=>__cardShopApp.snapshot().clock.pauseReasons);if(!Array.isArray(expectedPauses))throw Error('快照缺少暂停原因');
  async function metrics(){await cdp.send('HeapProfiler.collectGarbage');const heap=await cdp.send('Runtime.getHeapUsage'),listeners={};for(const expression of ['window','document']){const object=await cdp.send('Runtime.evaluate',{expression}),result=await cdp.send('DOMDebugger.getEventListeners',{objectId:object.result.objectId});listeners[expression]=result.listeners.length;await cdp.send('Runtime.releaseObject',{objectId:object.result.objectId});}return {heapUsed:heap.usedSize,listeners,...await page.evaluate(()=>{const nodes=[...document.querySelectorAll('*')];return {dom:nodes.length,persistentDom:nodes.filter(n=>!n.closest('#toasts')).length};})};}
  let cycles=0,peakRows=0,baseline=null,next=0;const checkpoints=[],start=performance.now();
  while(performance.now()-start<seconds*1000||cycles<2){
    const tick=performance.now();await page.evaluate(()=>__cardShopApp.openPanel('market',{tab:'collection'}));await page.locator('[data-card-grid] [data-card]').first().waitFor();
    const sample=await page.evaluate(async()=>{const b=document.querySelector('.facility-window:not([hidden]) .window__body');let peak=0;for(const fraction of [0,.25,.5,.75,1]){b.scrollTop=(b.scrollHeight-b.clientHeight)*fraction;await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));peak=Math.max(peak,document.querySelectorAll('[data-card-grid] [data-card]').length);}const bounds=b.getBoundingClientRect(),tile=[...document.querySelectorAll('[data-card-grid] [data-card]')].find(t=>{const r=t.getBoundingClientRect();return r.top>bounds.top+4&&r.bottom<bounds.bottom-4;});return {peak,index:tile?.dataset.rowIndex};});
    peakRows=Math.max(peakRows,sample.peak);if(sample.peak>=120||sample.index===undefined)throw Error('虚拟范围失控或没有可见卡');
    await page.locator('[data-card-grid] [data-row-index="'+sample.index+'"]').click({button:'right'});await page.locator('[aria-label="完整技能"]').waitFor();
    await page.keyboard.press('Escape');await page.locator('[aria-label="完整技能"]').waitFor({state:'detached'});
    await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.waitForFunction(()=>!document.querySelector('[data-collection-root]')&&__cardShopApp.windows.stack.length===0);
    await page.waitForFunction(expected=>{const actual=__cardShopApp.snapshot().clock.pauseReasons;return Array.isArray(actual)&&JSON.stringify([...actual].sort())===JSON.stringify([...expected].sort());},expectedPauses,{timeout:5000});
    cycles++;if(cycles===2)baseline=await metrics();
    if(performance.now()-start>=next){const point={elapsedMs:performance.now()-start,cycles,peakRows,...await metrics()};checkpoints.push(point);console.log('UI SOAK '+JSON.stringify(point));next+=30000;}
    const wait=1500-(performance.now()-tick);if(wait>0)await new Promise(r=>setTimeout(r,wait));
  }
  const final=await metrics();if(JSON.stringify(final.listeners)!==JSON.stringify(baseline.listeners))throw Error('window/document 监听器增长');if(final.persistentDom>baseline.persistentDom+10)throw Error('关窗后的持久 DOM 增长：'+JSON.stringify({baseline,final}));if(errors.length)throw Error(errors.join('\n'));
  const report={schema:1,requestedSeconds:seconds,elapsedMs:performance.now()-start,cards:5000,cycles,peakRows,baseline,final,checkpoints,errors,passed:true,node:process.version,browser:browser.version(),limitations:['隔离 5000 实物的暂停世界，循环开关/滚动/右键详情；不是玩家对局或营业吞吐','强制GC只用于前后堆/全局监听器诊断，不能据此给出自然FPS承诺','堆保留包括图片/模块/草稿缓存；报告趋势，不以固定字节增量冒充泄漏证明']};
  if(json){const target=path.resolve(root,json);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({passed:true,seconds:Math.round(report.elapsedMs/1000),cycles,peakRows,baseline,final,report:json},null,2));
}finally{await browser?.close();await server.close();}
