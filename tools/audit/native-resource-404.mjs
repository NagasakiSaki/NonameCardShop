// tools/audit/native-resource-404.mjs — 原生对局资源 404 归集（诊断，不是通过/失败断言）。
//
// 交接核查 C-04：真实原生对局出现过资源 404，但没有分类。这个脚本只做三件事：
//   1. 记录原生挂载期间所有 >=400 响应与请求失败（URL 去重、带 resourceType 与触发场景）；
//   2. 按“阻断 / 可选”分类：脚本、文档、fetch/xhr 失败会阻断；图片、音频缺失属于可选资源；
//   3. 落一份 JSON，供后续按武将/模式判断是否需要补源。
// 不吞异常、不通过删模式消除日志，也不把结果当作“已修复”。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startShopServer} from '../../server.mjs';

const here=path.dirname(fileURLToPath(import.meta.url));
const projectRoot=path.resolve(here,'..','..');

const BLOCKING_TYPES=new Set(['script','document','xhr','fetch','stylesheet','manifest','other']);
const OPTIONAL_TYPES=new Set(['image','media','font','texttrack']);

function classify(resourceType){
  if(BLOCKING_TYPES.has(resourceType))return 'blocking';
  if(OPTIONAL_TYPES.has(resourceType))return 'optional';
  return 'unknown';
}

function relative(url,origins){
  for(const [name,origin] of Object.entries(origins))if(url.startsWith(origin))return name+':'+url.slice(origin.length);
  return url;
}

export async function captureNativeResourceErrors({scenarios=['landlord'],playSeconds=20,outDir=null}={}){
  const server=await startShopServer({port:0,enginePort:0});
  const origins={app:server.origin,engine:server.engineOrigin};
  const records=new Map();
  const dialogNotices=[];
  let browser=null;
  let currentScenario='setup';
  const record=(entry)=>{
    const key=entry.path+'|'+entry.status+'|'+entry.resourceType+'|'+(entry.failure||'');
    const existing=records.get(key);
    if(existing){existing.count+=1;if(!existing.scenarios.includes(entry.scenario))existing.scenarios.push(entry.scenario);return;}
    records.set(key,{...entry,count:1,scenarios:[entry.scenario]});
  };
  const attachResponseListener=(page)=>{
    const listener=response=>{
      const status=response.status();
      if(status<400)return;
      const request=response.request();
      record({path:relative(response.url(),origins),url:response.url(),status,resourceType:request.resourceType(),
        method:request.method(),scenario:currentScenario,classification:classify(request.resourceType()),phase:'play'});
    };
    page.on('response',listener);
    return listener;
  };
  try{
    browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
    const page=await browser.newPage({viewport:{width:1440,height:1000}});
    // 原生引擎 entry.js 首次在某个 engine origin 上会 confirm 一次 GPLv3 声明，
    // 把许可写进该 origin 的 localStorage。随机端口意味着每次都是“首次”，
    // 不处理 dialog 会让载入卡满 60 秒再报 ENGINE_TIMEOUT（不是资源缺失）。
    page.on('dialog',async dialog=>{dialogNotices.push({type:dialog.type(),message:dialog.message().split('\n')[0].slice(0,120)});await dialog.accept();});
    // 只挂 requestfailed：原生引擎会加载上万个脚本，逐条 response 事件会把 CDP 通道压垮，
    // 反而让 60 秒挂载超时。>=400 的响应在就绪后再挂（见下），覆盖对局中的资源缺失。
    page.on('requestfailed',request=>{
      const failure=request.failure()?.errorText||'unknown';
      // ERR_ABORTED 通常是拆帧/切局导致的中断，不是资源缺失；单独归类，避免误判成阻断。
      const classification=failure.includes('ERR_ABORTED')?'aborted':classify(request.resourceType());
      record({path:relative(request.url(),origins),url:request.url(),status:0,resourceType:request.resourceType(),
        method:request.method(),scenario:currentScenario,failure,classification,phase:'load'});
    });
    await page.goto(server.origin+'/experiments/native-modes/index.html');
    await page.waitForFunction(()=>window.nativeHarness,null,{timeout:30000});
    for(const scenario of scenarios){
      currentScenario=scenario;
      const startedAt=Date.now();
      await page.evaluate(name=>nativeHarness.start(name),scenario);
      await page.waitForFunction(()=>nativeHarness.events.some(event=>event.type==='ready'||event.type==='error'),null,{timeout:90000});
      const state=await page.evaluate(()=>nativeHarness.events.find(event=>event.type==='ready'||event.type==='error'));
      if(state?.type!=='ready'){record({path:'harness',url:'harness',status:0,resourceType:'harness',method:'-',scenario,
        failure:state?.message||'not ready',classification:'blocking',phase:'load'});}
      else if(process.env.NATIVE_404_VERBOSE)console.log(`  ready ${scenario} in ${Math.round((Date.now()-startedAt)/1000)}s`);
      const frame=page.frames().find(candidate=>candidate.url().startsWith(server.engineOrigin+'/'));
      const detach=attachResponseListener(page);
      if(frame)await frame.evaluate(async()=>{const {lib,ui,_status}=await import('/noname.js');lib.config.game_speed='vvfast';lib.config.animation=false;if(!_status.auto)ui.click.auto('forced');}).catch(()=>{});
      await page.waitForTimeout(playSeconds*1000);
      page.off('response',detach);
      await page.evaluate(()=>nativeHarness.mount?.dispose()).catch(()=>{});
    }
  }finally{
    await browser?.close();
    await server.close();
  }
  const rows=[...records.values()].sort((a,b)=>b.count-a.count||a.path.localeCompare(b.path));
  const countOf=kind=>rows.filter(row=>row.classification===kind).length;
  const report={
    version:1,generatedAt:new Date().toISOString(),
    evidenceType:'natural-native-run-resource-capture',
    note:'记录原生挂载与短时对局期间的资源错误；不代表全武将全技能自然对局已覆盖。ERR_ABORTED 归为 aborted（拆帧中断），不算缺失资源。',
    scenarios,
    engineDialogs:dialogNotices,
    totals:{distinct:rows.length,
      blocking:countOf('blocking'),optional:countOf('optional'),aborted:countOf('aborted'),unknown:countOf('unknown'),
      occurrences:rows.reduce((sum,row)=>sum+row.count,0)},
    rows,
  };
  if(outDir){
    fs.mkdirSync(outDir,{recursive:true});
    fs.writeFileSync(path.join(outDir,'native-resource-404.json'),JSON.stringify(report,null,2));
  }
  return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const outIndex=process.argv.indexOf('--out');
  const outDir=outIndex>0?path.resolve(process.argv[outIndex+1]):path.join(projectRoot,'.local/native-404');
  const scenarioIndex=process.argv.indexOf('--scenarios');
  const scenarios=scenarioIndex>0?process.argv[scenarioIndex+1].split(',').map(name=>name.trim()).filter(Boolean):['landlord','versus'];
  const report=await captureNativeResourceErrors({scenarios,outDir});
  console.log(`去重 ${report.totals.distinct} 条，阻断 ${report.totals.blocking}，可选 ${report.totals.optional}，总出现 ${report.totals.occurrences} 次`);
  for(const row of report.rows.slice(0,40))console.log(`  [${row.classification}] ${row.status} ${row.resourceType} ${row.path} x${row.count} (${row.scenarios.join(',')})`);
  console.log(`报告：${path.relative(projectRoot,path.join(outDir,'native-resource-404.json'))}`);
}
