import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root} from '../dev/process.mjs';
import {startShopServer} from '../server.mjs';
const groups={unit:['tools/test-business.cjs','tools/test-modules.cjs','tools/test-balance.cjs','tests/server.mjs','tests/boxes.cjs'],ui:['tests/economy.cjs','tests/management.cjs','tests/boxes-ui.cjs','tests/saves-ui.cjs'],engine:['tests/duel.cjs'],dev:['tests/development.mjs'],desktop:['tests/desktop.cjs','tests/desktop-development.cjs'],history:['tests/saves-ui.cjs'],backend:['tests/backend.mjs','tests/backend-browser.mjs'],release:['tests/desktop.cjs']};
const selection=process.argv[2]||'all';if(selection!=='all'&&!groups[selection])throw new Error(`未知测试组：${selection}`);
const output=path.join(root,'test-results',new Date().toISOString().replace(/[:.]/g,'-')+`-${process.pid}`);fs.mkdirSync(output,{recursive:true});
const results=[],summary={selection,output,startedAt:new Date().toISOString(),results};let runtime;
try{
  if(['all','ui','engine','history'].includes(selection))runtime=await startShopServer({port:0,enginePort:0});
  for(const [group,files] of Object.entries(groups)){
    if(selection==='all'&&['release','history'].includes(group))continue;
    if(selection!=='all'&&selection!==group)continue;
    for(const file of files){
      console.log(`\n运行 ${group} / ${file}`);const start=Date.now();
      const result=await new Promise(resolve=>{
        const child=spawn(process.execPath,[file],{cwd:root,env:{...process.env,CARD_SHOP_TEST_RESULTS:output,CARD_SHOP_TEST_PACKAGED:group==='release'?'1':'0',CARD_SHOP_TEST_BASE:runtime?.origin||'',CARD_SHOP_TEST_ENGINE:runtime?.engineOrigin||''},stdio:['ignore','pipe','pipe'],windowsHide:true});
        const log=fs.createWriteStream(path.join(output,path.basename(file)+'.log'));let settled=false;
        child.stdout.on('data',data=>{process.stdout.write(data);log.write(data);});child.stderr.on('data',data=>{process.stderr.write(data);log.write(data);});
        const timer=setTimeout(()=>{console.error(`${file} 超时，终止测试进程及其浏览器。`);if(process.platform==='win32')spawn('taskkill',['/PID',String(child.pid),'/T','/F'],{windowsHide:true,stdio:'ignore'});else child.kill('SIGKILL');},480000);timer.unref();
        const done=(code,error)=>{if(settled)return;settled=true;clearTimeout(timer);log.end();resolve({group,file,passed:code===0&&!error,code,error:error?.message,seconds:Math.round((Date.now()-start)/100)/10});};
        child.once('error',error=>done(null,error));child.once('exit',code=>done(code));
      });results.push(result);
      if(!result.passed)throw new Error(`测试失败：${file}。日志：${output}`);
    }
  }
}catch(error){summary.error=error.message;console.error(error.message);process.exitCode=1;}
finally{
  await runtime?.close();summary.finishedAt=new Date().toISOString();summary.passed=!summary.error;
  fs.writeFileSync(path.join(output,'summary.json'),JSON.stringify(summary,null,2));fs.writeFileSync(path.join(root,'test-results/latest.json'),JSON.stringify(summary,null,2));
  console.log(`\n${summary.passed?'全部通过':'存在失败'}：${results.filter(r=>r.passed).length}/${results.length}；报告 ${output}`);
}
