const {_electron,root,output}=require("./helpers.cjs");
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const packaged=process.env.CARD_SHOP_TEST_PACKAGED==='1';
const exe=path.join(root,packaged?'desktop/dist/win-unpacked/NonameCardShop.exe':'desktop/node_modules/electron/dist/electron.exe');
const profile=path.join(output,'desktop-test-profile-v071');
let app,testPorts={};
async function launch(){const env={...process.env,CARD_SHOP_TEST_MODE:'1',CARD_SHOP_TEST_PROFILE:profile,CARD_SHOP_DEVELOPMENT:'0',...testPorts};delete env.ELECTRON_RUN_AS_NODE;return _electron.launch({executablePath:exe,args:packaged?[]:[path.join(root,'desktop')],cwd:path.dirname(exe),env,timeout:60000});}
(async()=>{
 app=await launch();let page=await app.firstWindow();const errors=[];page.on('pageerror',e=>{errors.push(e.stack);console.log(e.stack)});
 page.on('dialog',d=>d.accept());await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&ShopGame.scene?.owner,null,{timeout:60000});console.log('Desktop catalogue ready');
 assert.equal(await page.evaluate(()=>typeof require),'undefined');assert.equal(await page.evaluate(()=>typeof process),'undefined');
 assert.equal(await page.evaluate(()=>DATA.cards.length),2563);assert.equal(await page.evaluate(()=>ShopBusiness.config.economy.cardPrices.UR),480);
 await page.evaluate(()=>{state.business.paused=true;state.collection={caocao:3,liubei:1,sunquan:1};state.stock={standard:2};state.shop.cash=4321;state.modules.combat.data.active=null;state.modules.inventory.data.activeRoster=[];store.save(state);});
 const runtime=await page.evaluate(()=>fetch('/api/runtime').then(r=>r.json()));assert.equal(runtime.ready,true);assert.ok(runtime.engineOrigin.startsWith('http://127.0.0.1:'));const origin=new URL(page.url()).origin;testPorts={CARD_SHOP_TEST_PORT:new URL(origin).port,CARD_SHOP_TEST_ENGINE_PORT:new URL(runtime.engineOrigin).port};
 await page.evaluate(()=>{openCardDetails(byId.get('caocao'));});await page.locator('.skill-code summary').first().click();await page.waitForFunction(()=>document.querySelector('.skill-code')?.dataset.loaded==='true');assert.match(await page.locator('.skill-code').first().innerText(),/damageEnd|damage/);await page.locator('#detailClose').click();
 await page.evaluate(()=>openBattleSetup('caocao',{mode:'bo3',opponent:'zhangfei'}));const navigation=page.waitForEvent('framenavigated',{predicate:f=>f.url().startsWith(runtime.engineOrigin+'/'),timeout:30000});await page.locator('#battleStart').click();
 const frame=await navigation;assert.ok(frame);
 let engineReady=false;for(let i=0;i<6&&!engineReady;i++){try{await frame.waitForLoadState('domcontentloaded');await frame.evaluate(async()=>{window.__engine=await import('/noname.js')});await frame.waitForFunction(()=>window.__engine?.game.players?.length===2&&window.__engine?.game.shopDuel,null,{timeout:15000});engineReady=true;}catch(e){if(i===5)throw e;}}
 assert.equal(await frame.evaluate(()=>window.__engine.game.me.name),'caocao');
 await page.screenshot({path:output+'/desktop-battle-v071.png'});
 await page.locator('#battleBack').click();console.log('Desktop source original engine loaded');
 // Native import/export menu handlers, using test-selected file paths.
 const exportFile=path.join(output,'desktop-export-v071.json');
 if(fs.existsSync(exportFile))fs.unlinkSync(exportFile);
 await app.evaluate(({dialog,Menu},file)=>{dialog.showSaveDialog=async()=>({canceled:false,filePath:file});Menu.getApplicationMenu().items[0].submenu.items.find(i=>i.label==='导出存档…').click();},exportFile);
 for(let i=0;i<40&&!fs.existsSync(exportFile);i++)await new Promise(r=>setTimeout(r,100));assert.equal(JSON.parse(fs.readFileSync(exportFile)).save.shop.cash,4321);
 const incoming=JSON.parse(fs.readFileSync(exportFile));incoming.save.shop.cash=4567;const importFile=path.join(output,'desktop-import-v071.json');fs.writeFileSync(importFile,JSON.stringify(incoming));
 const reloaded=page.waitForEvent('framenavigated',{predicate:f=>f===page.mainFrame()});await app.evaluate(({dialog,Menu},file)=>{dialog.showOpenDialog=async()=>({canceled:false,filePaths:[file]});dialog.showMessageBox=async()=>({response:1});Menu.getApplicationMenu().items[0].submenu.items.find(i=>i.label==='导入存档…').click();},importFile);await reloaded;
 await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&state.shop.cash===4567);await page.evaluate(()=>{state.business.paused=true;store.save(state)});
 await page.locator('#managementBtn').click();await page.locator('[data-manage-tab=balance]').click();await page.screenshot({path:output+'/desktop-economy-v071.png'});
 await app.close();assert.ok(fs.existsSync(path.join(profile,'backups/latest.json')));assert.ok(fs.readdirSync(path.join(profile,'backups')).some(n=>n.startsWith('before-import-')));
 await assert.rejects(fetch(origin+'/api/runtime'));
 app=await launch();page=await app.firstWindow();await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&ShopGame.scene?.owner);assert.equal(await page.evaluate(()=>state.shop.cash),4567);assert.equal(await page.evaluate(()=>state.collection.caocao),3);
 await app.close();assert.deepEqual(errors,[]);fs.writeFileSync(path.join(output,'desktop-test-v071-result.json'),JSON.stringify({executable:exe,packaged,boot:true,bundledCatalogue:true,sandbox:true,skillCode:true,engineBattle:true,saveExport:true,saveImport:true,automaticBackup:true,restartPersistence:true,serverCleanup:true,errors},null,2));console.log(`PASS: ${packaged?'packaged EXE':'desktop source'} boot/catalogue/sandbox/skills/real engine battle/native save export/import/backup/restart/service cleanup.`);
})().catch(async e=>{console.error(e);await app?.close().catch(()=>{});process.exitCode=1;});
