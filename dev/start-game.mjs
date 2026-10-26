import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root,openBrowser} from './process.mjs';
import {inspectService,ownedServicePid,runningNodeProcesses} from './service-health.mjs';

const origin='http://127.0.0.1:5190',engineOrigin='http://127.0.0.1:5191';
async function gameReady(){
  return (await inspectService({origin,engineOrigin})).kind==='ready';
}
try{
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||major===22&&minor<12)throw Error('请先安装 Node.js 22.12 或更新版本。');
  const existing=await inspectService({origin,engineOrigin});
  if(existing.kind==='stale'){
    const pid=ownedServicePid(existing.status,runningNodeProcesses());
    if(!pid)throw Error('检测到旧开发服务，但无法确认其属于本项目。请关闭原开发启动窗口后重试；不会自动终止其他程序。');
    console.log('正在更新已运行的旧游戏服务：'+existing.reason+'。浏览器中的存档保留。');
    process.kill(pid,'SIGTERM');
    const deadline=Date.now()+5000;while(Date.now()<deadline){if((await inspectService({origin,engineOrigin})).kind==='missing')break;await new Promise(resolve=>setTimeout(resolve,150));}
  }else if(existing.kind==='foreign')throw Error('5190 端口被其他服务占用，请关闭占用程序后重试。');
  if(existing.kind!=='ready'){
    fs.mkdirSync(path.join(root,'.local'),{recursive:true});
    const logPath=path.join(root,'.local','game-start.log'),log=fs.openSync(logPath,'a');
    let child,spawnError;
    try{child=spawn(process.execPath,[path.join(root,'dev','launch.mjs')],{cwd:root,detached:true,windowsHide:true,stdio:['ignore',log,log]});}
    finally{fs.closeSync(log);}
    child.on('error',error=>{spawnError=error;});child.unref();
    const deadline=Date.now()+20000;let ready=false;
    while(Date.now()<deadline){
      if(await gameReady()){ready=true;break;}
      if(spawnError)throw spawnError;
      if(child.exitCode!==null)break;
      await new Promise(resolve=>setTimeout(resolve,250));
    }
    if(!ready){child.kill();throw Error(`游戏服务未能启动，请检查 5190/5191 端口是否被其他程序占用。日志：${logPath}`);}
  }
  if(!process.argv.includes('--no-open'))openBrowser(origin+'/frontend/index.html');
  console.log(`游戏已就绪：${origin}/frontend/index.html\n再次双击会核对服务版本；代码更新后会替换本项目的旧服务。启动窗口关闭后，游戏仍可继续运行。`);
}catch(error){console.error(error.message);process.exitCode=1;}
