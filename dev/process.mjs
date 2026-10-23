import {spawn} from 'node:child_process';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
export function run(command,args=[],options={}){
  return new Promise((resolve,reject)=>{
    const child=spawn(command,args,{cwd:root,stdio:'inherit',windowsHide:true,...options});
    child.once('error',reject);child.once('exit',(code,signal)=>code===0?resolve():reject(new Error(`${command} 退出：${code??signal}`)));
  });
}
export const npm=(args,options={})=>run(process.execPath,[process.env.npm_execpath||path.join(path.dirname(process.execPath),'node_modules/npm/bin/npm-cli.js'),...args],options);
export function openBrowser(url){
  const child=process.platform==='win32'?spawn('rundll32.exe',['url.dll,FileProtocolHandler',url],{detached:true,stdio:'ignore',windowsHide:true}):spawn(process.platform==='darwin'?'open':'xdg-open',[url],{detached:true,stdio:'ignore'});
  child.on('error',error=>console.error(`请手动打开 ${url}：${error.message}`));child.unref();
}
