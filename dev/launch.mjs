import {startDevelopmentServer} from './runtime.mjs';
import {openBrowser} from './process.mjs';
let runtime;
try{
  runtime=await startDevelopmentServer();
  console.log(`开发版：${runtime.origin}（引擎 ${runtime.engineOrigin}）\n修改界面自动刷新，当前对局结束后再刷新；Ctrl+C 退出。`);
  if(process.argv.includes('--open'))openBrowser(runtime.origin);
  let closing=false;const close=async()=>{if(closing)return;closing=true;await runtime.close();process.exit(0);};
  process.on('SIGINT',close);process.on('SIGTERM',close);
}catch(error){
  console.error(error.code==='EADDRINUSE'?'开发端口5190或5191已占用。已有开发版可直接打开 http://127.0.0.1:5190/；否则关闭占用程序后重试。':error.stack);
  process.exitCode=1;
}
