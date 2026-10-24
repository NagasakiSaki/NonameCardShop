// Real Host / disposable browser profile. Synthetic cards only exist in this session.
// node dev/perf-trade.mjs --output .local/perf-trade/before.json
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const option = (key, fallback) => process.argv[process.argv.indexOf(key) + 1] || fallback;
const output = path.resolve(process.argv.includes('--output') ? option('--output') : '.local/perf-trade/latest.json');
const files = ['frontend-next/components/workspace/collection.mjs', 'frontend-next/components/workspace/workspace.mjs', 'frontend-next/screens/workspace.mjs'];
const sources = () => Object.fromEntries(files.map(file => [file, createHash('sha256').update(fs.readFileSync(file)).digest('hex')]));
const report = {generatedAt:new Date().toISOString(), head:execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim(), sources:sources(), cpu:os.cpus()[0].model, viewport:{width:1440,height:900}, headless:true, rounds:[]};
const server = await startShopServer({port:0, enginePort:0});
let browser;
try {
  browser = await chromium.launch({headless:true, args:['--enable-precise-memory-info','--js-flags=--expose-gc']});
  report.browser = browser.version();
  const context = await browser.newContext({viewport:report.viewport, deviceScaleFactor:1});
  const page = await context.newPage();
  report.errors=[]; report.httpErrors=[];
  page.on('pageerror', e => report.errors.push(e.message));
  page.on('response', r => {if(r.status()>=400)report.httpErrors.push({url:new URL(r.url()).pathname,status:r.status()});});
  const query = (name,input={}) => page.evaluate(async({name,input})=>{const r=await __cardShopApp.query(name,input);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,input});
  const command = (type,payload={}) => page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({type,payload,requestId:'perf-'+crypto.randomUUID()});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true);
  await command('business.open');
  const cards=[];let cursor=0;
  while(cards.length<1000){const p=await query('catalog.list',{limit:200,cursor});cards.push(...p.items);if(!p.nextCursor)break;cursor=Number(p.nextCursor);}
  const product=(await query('products.list',{limit:1})).items[0];
  for(const count of [0,1000]){
    if(count){
      const archive=JSON.parse((await command('saves.export')).content);
      for(let i=0;i<count;i++){
        const c=cards[i],ref='perf:card:'+i;
        archive.world.items[ref]={inventoryRef:ref,kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:product.productVersion,ratingVersion:null,source:'synthetic',productId:product.productId,ownerId:'player',location:'collection',protected:false,lock:null,cost:0,sourcePack:null};
      }
      await command('saves.import',{content:JSON.stringify(archive)});
      await page.reload({waitUntil:'domcontentloaded'});await page.waitForFunction(()=>window.__cardShopReady===true);
    }
    for(let i=0;i<3;i++){
      const measured=await page.evaluate(async()=>{
        const app=__cardShopApp,t=performance.now();await app.openPanel('inventory',{});
        await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
        const paintedMs=+(performance.now()-t).toFixed(2),dom=document.getElementsByTagName('*').length,tiles=document.querySelectorAll('[data-card-grid] [data-card]').length;
        const close=performance.now();await app.windows.closeAll();
        return {paintedMs,dom,tiles,closeMs:+(performance.now()-close).toFixed(2),depth:app.windows.depth,pause:app.snapshot().clock.pauseReasons.length};
      });
      report.rounds.push({cards:count,...measured});await page.waitForTimeout(300);
    }
  }
  await page.evaluate(()=>__cardShopApp.openPanel('inventory',{}));
  fs.mkdirSync(path.dirname(output),{recursive:true});
  await page.screenshot({path:output.replace(/\.json$/, '')+'.png'});
  report.interactions=await page.evaluate(async name=>{
    const input=document.querySelector('[aria-label="搜索单卡"]'),samples=[];
    for(const value of [name,'不存在的卡牌测试词','']){
      input.focus();const t=performance.now();input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));
      await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
      samples.push({kind:'search',value,paintedMs:+(performance.now()-t).toFixed(2),tiles:document.querySelectorAll('[data-card-grid] [data-card]').length,focusRetained:document.activeElement===input});
    }
    const next=[...document.querySelectorAll('[aria-label="卡牌分页"] button')].find(b=>b.textContent==='下一页');
    if(next){const t=performance.now();next.click();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));samples.push({kind:'nextPage',paintedMs:+(performance.now()-t).toFixed(2),tiles:document.querySelectorAll('[data-card-grid] [data-card]').length});}
    return samples;
  },cards.at(-1).name);
  await page.evaluate(()=>__cardShopApp.windows.closeAll());
  report.codeChangedDuringSample=JSON.stringify(sources())!==JSON.stringify(report.sources);
  await context.close();
} finally {await browser?.close();await server.close();}
fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,JSON.stringify(report,null,2));
console.log(JSON.stringify(report,null,2));
