const path=require('node:path'),fs=require('node:fs'),assert=require('node:assert/strict');
const {_electron}=require('playwright');
const root=path.resolve(__dirname,'..'),out=path.resolve(root,process.env.CARD_SHOP_TEST_RESULTS||'.local/desktop-host');fs.mkdirSync(out,{recursive:true});
const packaged=process.env.CARD_SHOP_TEST_PACKAGED==='1';
(async()=>{
 const profile=fs.mkdtempSync(path.join(out,'profile-')),exportFile=path.join(out,'world-export.json');
 const env={...process.env,CARD_SHOP_DEVELOPMENT:'1',CARD_SHOP_TEST_MODE:'1',CARD_SHOP_TEST_PROFILE:profile,CARD_SHOP_TEST_PORT:'0',CARD_SHOP_TEST_ENGINE_PORT:'0'};delete env.ELECTRON_RUN_AS_NODE;
 const app=await _electron.launch({executablePath:path.join(root,packaged?'desktop/dist/win-unpacked/NonameCardShop.exe':'desktop/node_modules/electron/dist/electron.exe'),args:packaged?[]:[path.join(root,'desktop')],env,timeout:60000});let origin;
 try{
  const page=await app.firstWindow();origin=new URL(page.url()).origin;await page.locator('#start-menu').waitFor();await page.getByRole('textbox',{name:'新存档名称',exact:true}).fill('桌面审计隔离档');await page.getByRole('button',{name:'新建存档并开始',exact:true}).click();await page.waitForFunction(()=>window.__cardShopReady===true);
  await app.evaluate(({dialog},file)=>{globalThis.__auditDialogs=[];dialog.showSaveDialog=async()=>({canceled:false,filePath:file});dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async(...args)=>{__auditDialogs.push(args.at(-1));return {response:1};};},exportFile);
  const click=label=>app.evaluate(async({Menu},label)=>{const item=Menu.getApplicationMenu().items.find(i=>i.label==='存档').submenu.items.find(i=>i.label===label);await item.click();},label);
  const until=async fn=>{const end=Date.now()+10000;while(!await fn()){const errors=await app.evaluate(()=>__auditDialogs.filter(d=>d.type==='error'));if(errors.length)throw Error(JSON.stringify(errors));if(Date.now()>end)throw Error('native menu action timed out');await new Promise(r=>setTimeout(r,60));}};
  await click('导出存档…');await until(()=>fs.existsSync(exportFile));const saved=JSON.parse(fs.readFileSync(exportFile,'utf8'));assert.equal(saved.format,'noname-shop-world-save');assert.equal(saved.world.clock.phase,'preparing');
  await page.evaluate(()=>__cardShopApp.command({requestId:'desktop-test-open',type:'business.open',payload:{}}));await click('导入存档…');await page.waitForFunction(()=>__cardShopApp.snapshot().clock.phase==='preparing');
  const backups=fs.readdirSync(path.join(profile,'backups')).filter(f=>f.startsWith('before-import-'));assert.equal(backups.length,1);assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'backups',backups[0]),'utf8')).world.clock.phase,'open');
  await click('按天存档 / 读档');await page.getByRole('dialog',{name:'按天存档',exact:true}).waitFor();assert.equal(await page.evaluate(()=>typeof process),'undefined');
  assert.deepEqual(await app.evaluate(()=>__auditDialogs.filter(d=>d.type==='error')),[]);
 }finally{await app.close();}
 assert.equal(JSON.parse(fs.readFileSync(path.join(profile,'backups/latest.json'),'utf8')).format,'noname-shop-world-save');if(origin)await assert.rejects(fetch(origin));
 console.log('PASS desktop current Host: native menu export/import with backup, day archives, sandbox, exit backup and server shutdown; isolated profile only.');
})().catch(e=>{console.error(e);process.exitCode=1;});
