import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root} from '../dev/process.mjs';
import {startShopServer} from '../server.mjs';
import {groups,DEFAULT_GROUPS} from './groups.mjs';
const args=process.argv.slice(2),selection=args.find(a=>!a.startsWith('--'))||'all',keepGoing=args.includes('--keep-going');
if(selection!=='all'&&!groups[selection])throw new Error(`未知测试组：${selection}`);
const scheduled=[],seen=new Set();
for(const group of selection==='all'?DEFAULT_GROUPS:[selection])for(const file of groups[group])if(!seen.has(file)){scheduled.push({group,file});seen.add(file);}
const failedFrom=args.find(a=>a.startsWith('--failed-from='));
if(failedFrom){const previous=JSON.parse(fs.readFileSync(path.resolve(root,failedFrom.slice('--failed-from='.length)),'utf8')),failed=new Set(previous.results.filter(r=>!r.passed).map(r=>r.file));for(let i=scheduled.length-1;i>=0;i--)if(!failed.has(scheduled[i].file))scheduled.splice(i,1);}
if(args.includes('--list')){console.log(scheduled.map(({group,file})=>`${group}: ${file}`).join('\n')+`\n共 ${scheduled.length} 个独立测试`);process.exit(0);}
const output=path.join(root,'test-results',new Date().toISOString().replace(/[:.]/g,'-')+`-${process.pid}`);fs.mkdirSync(output,{recursive:true});
const results=[],summary={selection,output,startedAt:new Date().toISOString(),results};let runtime;
try{
  if(['legacy','engine'].includes(selection))runtime=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(!['/','/index.html'].includes(req.url.split('?')[0]))return false;res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(root,'legacy.html')));return true;}});
  for(const {group,file} of scheduled){
      console.log(`\n运行 ${group} / ${file}`);const start=Date.now();
      const result=await new Promise(resolve=>{
        const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,CARD_SHOP_TEST_RESULTS:output,CARD_SHOP_TEST_PACKAGED:group==='release'?'1':'0',CARD_SHOP_TEST_BASE:runtime?.origin||'',CARD_SHOP_TEST_ENGINE:runtime?.engineOrigin||''},stdio:['ignore','pipe','pipe'],windowsHide:true});
        const log=fs.createWriteStream(path.join(output,file.replaceAll('/','_')+'.log'));let settled=false;
        child.stdout.on('data',data=>{process.stdout.write(data);log.write(data);});child.stderr.on('data',data=>{process.stderr.write(data);log.write(data);});
        const timer=setTimeout(()=>{console.error(`${file} 超时，终止测试进程及其浏览器。`);if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');},480000);timer.unref();
        const done=(code,error)=>{if(settled)return;settled=true;clearTimeout(timer);log.end();resolve({group,file,passed:code===0&&!error,code,error:error?.message,seconds:Math.round((Date.now()-start)/100)/10});};
        child.once('error',error=>done(null,error));child.once('exit',code=>done(code));
      });results.push(result);
      if(!result.passed&&!keepGoing)throw new Error(`测试失败：${file}。日志：${output}`);
  }
  if(results.some(r=>!r.passed))throw new Error(`${results.filter(r=>!r.passed).length} 个测试失败；完整结果：${output}`);
}catch(error){summary.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  await runtime?.close();summary.finishedAt=new Date().toISOString();summary.passed=!summary.error;
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(root,'test-results/latest.json'),JSON.stringify(summary,null,2));
  console.log(`\n${summary.passed?'全部通过':'存在失败'}：${results.filter(r=>r.passed).length}/${results.length}；报告 ${output}`);
}
