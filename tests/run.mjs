import fs from 'node:fs';
import path from 'node:path';
import {spawn} from 'node:child_process';
import {root} from '../dev/process.mjs';
import {startShopServer} from '../server.mjs';
const groups={unit:['tools/test-business.cjs','tools/test-modules.cjs','tools/test-balance.cjs','tests/server.mjs','tests/boxes.cjs'],ui:['tests/frontend-integration.mjs'],frontend:['tests/frontend-integration.mjs'],legacy:['tests/economy.cjs','tests/management.cjs','tests/boxes-ui.cjs','tests/saves-ui.cjs'],engine:['tests/duel.cjs'],dev:['tests/frontend-development.mjs'],desktop:['tests/desktop.cjs','tests/desktop-development.cjs'],history:['tests/frontend-integration.mjs'],backend:['tests/backend.mjs','tests/backend-views.mjs','tests/backend-browser.mjs','tests/backend-management.mjs','tests/npc-engine-browser.mjs'],release:['tests/desktop.cjs']};
groups.roomsAndStrength=['tests/rooms-and-strength.mjs','tests/resource-balance.mjs','tests/backend-views.mjs','tests/operations-v7.mjs','tests/operations-v7-mount.mjs','tests/operations-v7-browser.mjs','tests/day-starts.mjs','tests/customer-visits.mjs','tests/native-modes-unit.mjs','tests/backend.mjs'];
groups.operationsV7=['tests/operations-v7.mjs','tests/operations-v7-mount.mjs','tests/operations-v7-browser.mjs','tests/day-starts.mjs','tests/customer-visits.mjs','tests/native-modes-unit.mjs','tests/backend.mjs'];
groups.roomsAndStrength.push('tests/room-format-selection-browser.mjs');groups.operationsV7.push('tests/room-format-selection-browser.mjs');
groups.roomsAndStrength.push('tests/three-formats.mjs');groups.operationsV7.push('tests/three-formats.mjs');
groups.dev.push('tests/service-health.mjs');groups.roomsAndStrength.push('tests/service-health.mjs');
groups.roomsAndStrength.push('tests/scroll-and-album-browser.mjs');
groups.frontend.push('tests/bright-frontend-browser.mjs');
groups.frontend.push('tests/band-only-appearances.mjs');
groups.nativeModes=['tests/native-modes-unit.mjs','tests/native-modes-browser.mjs','tests/native-modes-series.mjs','tests/native-legacy-regression.mjs'];
groups.audit=['tests/backend-edge-cases.mjs','tests/battle-lifecycle.mjs','tests/storage-archives-browser.mjs'];groups.backend.push('tests/customer-identity.mjs','tests/customer-trash.mjs','tests/distribution-skins.mjs',...groups.audit);groups.frontend.push('tests/character-art.mjs','tests/customer-trash-browser.mjs','tests/frontend-movement.mjs','tests/frontend-skins.mjs','tests/frontend/assets.mjs');
groups.dev.push('tests/character-kit/cli.mjs');groups.frontend.push('tests/frontend-next/card-trade.mjs');
groups.trading=['tests/basket.mjs','tests/trade-cards.mjs','tests/trade-opening.mjs','tests/trade-card-detail.mjs','tests/trade-formal.mjs'];
groups.backend.push('tests/basket.mjs');groups.frontend.push(...groups.trading.slice(1));
groups.ui.push(...groups.trading.slice(1));
groups.backend.push('tests/customer-visits.mjs');groups.frontend.push('tests/profile-menu.mjs');groups.ui.push('tests/profile-menu.mjs');groups.history.push('tests/profile-menu.mjs');
groups.frontend.push('tests/gameplay-ui.mjs');groups.ui.push('tests/gameplay-ui.mjs');
groups.frontend.push('tests/portrait-sources.mjs','tests/portrait-preview.mjs');groups.ui.push('tests/portrait-preview.mjs');
groups.npc=['tests/customer-visits.mjs','tests/gameplay-adjustments.mjs'];
groups.npcNatural=['tests/npc-natural-browser.mjs'];
groups.backend.push('tests/day-starts.mjs','tests/gameplay-adjustments.mjs');groups.history.push('tests/day-starts.mjs');
groups.backend.push('tests/shop-experience.mjs');groups.npc.push('tests/shop-experience.mjs');
groups.frontend.push('tests/playability-integration.mjs');groups.ui.push('tests/playability-integration.mjs');groups.trading.push('tests/playability-integration.mjs');
// Current desktop/root UI use the Host world; the older desktop scripts are historical legacy coverage.
groups.desktop=['tests/desktop-host.cjs'];groups.release=['tests/desktop-host.cjs'];
groups.frontend.push('tests/high-quality-pass.mjs');groups.ui.push('tests/high-quality-pass.mjs');
groups.frontend.push('tests/trade-workspace-pagination.mjs');groups.ui.push('tests/trade-workspace-pagination.mjs');groups.trading.push('tests/trade-workspace-pagination.mjs');
groups.core4=['tests/core4-foundations.mjs','tests/core4-matchmaking.mjs','tests/core4-economy.mjs','tests/resource-balance.mjs','tests/core4-ui.mjs'];
groups.cv6=['tools/cv6/tests/run-tests.mjs','tests/cv6-first-deliveries.mjs','tests/feedback/feedback.test.mjs','tests/cv6-frontend.mjs','tests/customer-demand.mjs'];
groups.backend.push('tests/customer-demand.mjs');
groups.narrative=['tests/narrative-runtime.mjs','tests/narrative-browser.mjs'];
groups.backend.push('tests/narrative-runtime.mjs');groups.frontend.push('tests/narrative-browser.mjs');
groups.backend.push(...groups.core4.slice(0,-1));groups.frontend.push('tests/core4-ui.mjs');groups.ui.push('tests/core4-ui.mjs');
groups.longTerm=['tests/campaign-loan.mjs','tests/long-term-operations.mjs','tests/long-term-browser.mjs'];
groups.backend.push(...groups.longTerm.slice(0,2));groups.frontend.push(groups.longTerm[2]);
const selection=process.argv[2]||'all';if(selection!=='all'&&!groups[selection])throw new Error(`未知测试组：${selection}`);
const output=path.join(root,'test-results',new Date().toISOString().replace(/[:.]/g,'-')+`-${process.pid}`);fs.mkdirSync(output,{recursive:true});
const results=[],summary={selection,output,startedAt:new Date().toISOString(),results};let runtime;
try{
  if(['legacy','engine'].includes(selection))runtime=await startShopServer({port:0,enginePort:0,interceptRequest(req,res){if(!['/','/index.html'].includes(req.url.split('?')[0]))return false;res.writeHead(200,{'content-type':'text/html; charset=utf-8'});res.end(fs.readFileSync(path.join(root,'legacy.html')));return true;}});
  for(const [group,files] of Object.entries(groups)){
    if(selection==='all'&&!['unit','backend','frontend','dev'].includes(group))continue;
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
