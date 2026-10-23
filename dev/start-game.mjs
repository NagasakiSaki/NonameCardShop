import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root,openBrowser} from './process.mjs';

const origin='http://127.0.0.1:5190',engineOrigin='http://127.0.0.1:5191';
async function gameReady(){
  try{
    const [status,runtime]=await Promise.all(['/__dev/status','/api/runtime'].map(async route=>{
      const response=await fetch(origin+route,{signal:AbortSignal.timeout(1000)});
      return response.ok?response.json():null;
    }));
    if(status?.application!=='noname-card-shop-development'||runtime?.ready!==true||runtime.engineOrigin!==engineOrigin)return false;
    const engine=await fetch(engineOrigin+'/noname/entry.js',{signal:AbortSignal.timeout(1000)});
    await engine.body?.cancel();return engine.ok;
  }catch{return false;}
}
try{
  const [major,minor]=process.versions.node.split('.').map(Number);
  if(major<22||major===22&&minor<12)throw Error('请先安装 Node.js 22.12 或更新版本。');
  if(!await gameReady()){
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
  console.log(`游戏已就绪：${origin}/frontend/index.html\n再次双击会复用已启动的服务。启动窗口关闭后，游戏仍可继续运行。`);
}catch(error){console.error(error.message);process.exitCode=1;}
