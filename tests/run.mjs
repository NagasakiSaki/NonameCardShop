import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root} from '../dev/process.mjs';
import {startShopServer} from '../server.mjs';
import {selectChecks} from './inventory.mjs';
const args=process.argv.slice(2),selection=args.find(a=>!a.startsWith('--'))||'all',keepGoing=args.includes('--keep-going');
const failedFrom=args.find(a=>a.startsWith('--failed-from='));
const previous=failedFrom?JSON.parse(fs.readFileSync(path.resolve(root,failedFrom.slice('--failed-from='.length)),'utf8')):null;
if(previous&&!Array.isArray(previous.results))throw Error('失败补跑报告缺少 results 数组，拒绝回退到全套执行。');
const {task,scheduled,requirements}=selectChecks({selection,task:args.find(a=>a.startsWith('--task='))?.slice(7),failed:previous?.results});
if(args.includes('--list')||args.includes('--json-list')){console.log(args.includes('--json-list')?JSON.stringify({selection,task,requirements,scheduled},null,2):scheduled.map(({group,file,evidence,estimatedCost})=>`${group}: ${file}${args.includes('--details')?' ['+estimatedCost+'; '+evidence.join(', ')+']':''}`).join('\n')+`\n共 ${scheduled.length} 个独立测试`+(requirements?'\n人工/测量要求：'+JSON.stringify(requirements):''));process.exit(0);}
if(task&&!scheduled.length&&!previous)throw Error(`${task} 没有执行测试，请查看 --task=${task} --list 中的测量/人工验收要求。`);
const output=path.join(root,'test-results',new Date().toISOString().replace(/[:.]/g,'-')+`-${process.pid}`);fs.mkdirSync(output,{recursive:true});
const results=[],summary={selection,task,requirements,rerunFrom:failedFrom?.slice('--failed-from='.length)||null,output,startedAt:new Date().toISOString(),results};let runtime;
try{
  if(scheduled.some(check=>['legacy','engine'].includes(check.group)))runtime=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(!['/','/index.html'].includes(req.url.split('?')[0]))return false;res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(root,'legacy.html')));return true;}});
  for(const {group,file,...metadata} of scheduled){
      console.log(`\n运行 ${group} / ${file}`);const start=Date.now();
      const result=await new Promise(resolve=>{
        const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,CARD_SHOP_TEST_RESULTS:output,CARD_SHOP_TEST_PACKAGED:group==='release'?'1':'0',CARD_SHOP_TEST_BASE:runtime?.origin||'',CARD_SHOP_TEST_ENGINE:runtime?.engineOrigin||''},stdio:['ignore','pipe','pipe'],windowsHide:true});
        const log=fs.createWriteStream(path.join(output,file.replaceAll('/','_')+'.log'));let settled=false;
        child.stdout.on('data',data=>{process.stdout.write(data);log.write(data);});child.stderr.on('data',data=>{process.stderr.write(data);log.write(data);});
        const timer=setTimeout(()=>{console.error(`${file} 超时，终止测试进程及其浏览器。`);if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');},480000);timer.unref();
        const done=(code,error)=>{if(settled)return;settled=true;clearTimeout(timer);log.end();resolve({group,file,passed:code===0&&!error,code,error:error?.message,seconds:Math.round((Date.now()-start)/100)/10});};
        child.once('error',error=>done(null,error));child.once('exit',code=>done(code));
      });results.push({...result,...metadata});
      if(!result.passed&&!keepGoing)throw new Error(`测试失败：${file}。日志：${output}`);
  }
  if(results.some(r=>!r.passed))throw new Error(`${results.filter(r=>!r.passed).length} 个测试失败；完整结果：${output}`);
}catch(error){summary.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  await runtime?.close();summary.finishedAt=new Date().toISOString();summary.passed=!summary.error;
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(root,'test-results/latest.json'),JSON.stringify(summary,null,2));
  console.log(`\n${summary.passed?'全部通过':'存在失败'}：${results.filter(r=>r.passed).length}/${results.length}；报告 ${output}`);
}
