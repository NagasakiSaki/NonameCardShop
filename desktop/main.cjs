const {app,BrowserWindow,Menu,dialog,shell}=require('electron');
const fs=require('node:fs'),path=require('node:path'),{pathToFileURL}=require('node:url');
const testMode=process.env.CARD_SHOP_TEST_MODE==='1';
const development=!app.isPackaged&&process.env.CARD_SHOP_DEVELOPMENT==='1';
const gameRoot=app.isPackaged?path.join(process.resourcesPath,'game'):path.resolve(__dirname,'..');
const profile=testMode?process.env.CARD_SHOP_TEST_PROFILE:development?path.join(gameRoot,'.local/desktop-dev'):path.join(app.getPath('appData'),'NonameCardShop');
if(!profile)throw new Error('缺少桌面存档目录');fs.mkdirSync(profile,{recursive:true});app.setPath('userData',profile);
app.setName('无名卡店');app.setAppUserModelId('org.noname.cardshop');
let win,runtime,quitting=false,quitReady=false,backupTimer;
const log=(message)=>{try{fs.appendFileSync(path.join(profile,'desktop.log'),`${new Date().toISOString()} ${message}\n`);}catch{}};
const timeout=(p,ms)=>Promise.race([p,new Promise((_,reject)=>{const t=setTimeout(()=>reject(new Error('操作超时')),ms);t.unref();})]);
async function readSave(){if(!win||win.isDestroyed()||win.webContents.isDestroyed())return null;return timeout(win.webContents.executeJavaScript(`(()=>{if(typeof state==='undefined'||typeof DATA==='undefined'||!DATA)return null;store.save(state);return localStorage.getItem('noname-packer-v1');})()`),3000);}
async function backup(name='latest.json') {const raw=await readSave();if(!raw)return;const folder=path.join(profile,'backups');fs.mkdirSync(folder,{recursive:true});const temp=path.join(folder,name+'.tmp'),target=path.join(folder,name);fs.writeFileSync(temp,JSON.stringify({format:'noname-shop-save',version:1,savedAt:new Date().toISOString(),save:JSON.parse(raw)},null,2));fs.renameSync(temp,target);}
async function reportError(error){log(error.stack||String(error));await dialog.showMessageBox(win&&!win.isDestroyed()?win:undefined,{type:'error',title:'无名卡店',message:error.message||String(error),detail:`日志与自动备份位置：${profile}`});}
async function exportSave(){try{const raw=await readSave();if(!raw)throw new Error('游戏尚未载入，请稍后重试');const choice=await dialog.showSaveDialog(win,{title:'导出店铺存档',defaultPath:'无名卡店-存档.json',filters:[{name:'游戏存档',extensions:['json']}]});if(choice.canceled)return;fs.writeFileSync(choice.filePath,JSON.stringify({format:'noname-shop-save',version:1,savedAt:new Date().toISOString(),save:JSON.parse(raw)},null,2));}catch(error){await reportError(error);}}
async function importSave(){try{
  const choice=await dialog.showOpenDialog(win,{title:'导入试玩版或桌面版存档',properties:['openFile'],filters:[{name:'游戏存档',extensions:['json']}]});if(choice.canceled)return;
  const file=choice.filePaths[0];if(fs.statSync(file).size>20*1024*1024)throw new Error('存档文件超过20MB，未导入');
  const parsed=JSON.parse(fs.readFileSync(file,'utf8').replace(/^\uFEFF/,''));
  if(parsed.format&&(parsed.format!=='noname-shop-save'||parsed.version!==1))throw new Error('不支持的存档格式或版本，未导入');
  const save=parsed.format?parsed.save:parsed;if(!save||typeof save!=='object'||!save.collection||!save.shop)throw new Error('文件中没有有效的店铺存档，未导入');
  const checked=await win.webContents.executeJavaScript(`(()=>{if(typeof DATA==='undefined'||!DATA)throw new Error('游戏尚未载入');ShopModel.normalise(${JSON.stringify(save)});return true;})()`);if(!checked)return;
  const confirm=await dialog.showMessageBox(win,{type:'question',title:'导入店铺存档',message:'用所选存档替换当前桌面版进度？',detail:'当前进度会先保存到自动备份目录。原试玩版浏览器中的存档不受影响。',buttons:['取消','备份并导入'],defaultId:0,cancelId:0});if(confirm.response!==1)return;
  await backup(`before-import-${Date.now()}.json`);
  await win.webContents.executeJavaScript(`(()=>{const next=ShopModel.normalise(${JSON.stringify(save)});ShopModules.ready(next);localStorage.setItem('noname-packer-before-desktop-import-v1',localStorage.getItem('noname-packer-v1')||'null');state=next;store.save(state);location.reload();})()`);
}catch(error){await reportError(error);}}
function installMenu(){Menu.setApplicationMenu(Menu.buildFromTemplate([
  {label:'存档',submenu:[{label:'导入存档…',click:()=>importSave()},{label:'导出存档…',click:()=>exportSave()},{type:'separator'},{label:'打开存档与备份目录',click:()=>shell.openPath(profile)},{type:'separator'},{label:'退出',accelerator:'Alt+F4',click:()=>app.quit()}]},
  {label:'显示',submenu:[{role:'reload',label:'重新载入'},...(development?[{label:'重启桌面开发进程',click:()=>{app.relaunch();app.quit();}},{role:'toggleDevTools',label:'开发者工具'}]:[]),{role:'togglefullscreen',label:'全屏',accelerator:'F11'},{role:'resetzoom',label:'恢复缩放'},{role:'zoomin',label:'放大'},{role:'zoomout',label:'缩小'}]},
  {label:'帮助',submenu:[{label:'操作与版本',click:()=>dialog.showMessageBox(win,{type:'info',title:'无名卡店',message:`无名卡店 ${app.getVersion()} · Windows x64`,detail:'WASD/方向键移动，E交互，B背包，F11全屏。\n本程序自带页面运行环境与无名杀v1.11.6引擎，无需安装Node.js。\n试玩版存档可在游戏「库存账本」导出，再从桌面菜单「存档」导入。\n自由软件许可证及源码说明见安装目录 resources/game。'})}]}
]));}
if(!app.requestSingleInstanceLock()){app.quit();}else{
app.on('second-instance',()=>{if(win){if(win.isMinimized())win.restore();win.show();win.focus();}});
app.on('before-quit',event=>{if(quitReady)return;event.preventDefault();if(quitting)return;quitting=true;clearInterval(backupTimer);(async()=>{try{await backup();win?.webContents.session.flushStorageData();}catch(error){log(`退出备份：${error.message}`);}try{await runtime?.close();}finally{quitReady=true;app.quit();}})();});
app.on('window-all-closed',()=>app.quit());
app.whenReady().then(async()=>{
  const port=testMode?Number(process.env.CARD_SHOP_TEST_PORT||0):development?5192:51740,enginePort=testMode?Number(process.env.CARD_SHOP_TEST_ENGINE_PORT||0):development?5193:51741;
  if(development){const {startDevelopmentServer}=await import(pathToFileURL(path.join(gameRoot,'dev/runtime.mjs')).href);runtime=await startDevelopmentServer({port,enginePort});}
  else{const {startShopServer}=await import(pathToFileURL(path.join(gameRoot,'server.mjs')).href);runtime=await startShopServer({port,enginePort});}
  log(`启动 ${app.getVersion()} ${runtime.origin} / ${runtime.engineOrigin}`);
  win=new BrowserWindow({title:'无名卡店',width:1440,height:960,minWidth:1040,minHeight:720,show:false,backgroundColor:'#10271e',icon:path.join(__dirname,'build/icon.ico'),webPreferences:{nodeIntegration:false,contextIsolation:true,sandbox:true,webSecurity:true,backgroundThrottling:true}});
  win.on('close',event=>{if(!quitReady){event.preventDefault();app.quit();}});
  win.webContents.on('render-process-gone',(_,details)=>{log(`页面进程退出：${JSON.stringify(details)}`);});
  const permitted=url=>{try{return [runtime.origin,runtime.engineOrigin].includes(new URL(url).origin);}catch{return false;}};
  win.webContents.on('will-navigate',(event,url)=>{if(!permitted(url))event.preventDefault();});
  win.webContents.setWindowOpenHandler(({url})=>{if(/^https?:\/\//.test(url)&&!permitted(url))shell.openExternal(url).catch(error=>log(error.message));return {action:'deny'};});
  win.webContents.session.setPermissionRequestHandler((contents,permission,callback)=>callback(permission==='clipboard-sanitized-write'&&permitted(contents.getURL())));
  installMenu();win.once('ready-to-show',()=>win.show());await win.loadURL(runtime.origin+'/?desktop=1');
  backupTimer=setInterval(()=>backup().catch(error=>log(`自动备份：${error.message}`)),30000);backupTimer.unref();
}).catch(async error=>{await reportError(new Error(error.code==='EADDRINUSE'?`桌面版专用端口${development?'5192或5193':'51740或51741'}被其他程序占用。请关闭占用程序后重新打开。`:error.message));quitReady=true;await runtime?.close();app.quit();});
}
