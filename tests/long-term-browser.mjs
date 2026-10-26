import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json'),managementConfig=json('data/backend-management.json'),catalog=buildCatalog(source,rules);
const runtime=await createRuntime({source,rules,managementConfig,repository:memoryRepository()});let seq=0;
await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'long-term-browser-fixture'});
const cmd=async(type,payload={})=>{const r=await runtime.command({requestId:'fixture-'+ ++seq,type,payload});assert(r.ok,JSON.stringify(r));return r.data;};
const intro=(await runtime.query('dialogue.offer')).data;await cmd('dialogue.respond',{offerId:intro.offerId,optionId:'begin',proof:intro.proof});
await cmd('business.open');await cmd('business.close');await cmd('business.nextDay');await cmd('business.open');await runtime.advance(.1);
const offered=(await runtime.query('dialogue.offer')).data;await cmd('dialogue.respond',{offerId:offered.offerId,optionId:'accept',proof:offered.proof});
const base=runtime.inspect().world;await runtime.disconnect();base.clock.manualPaused=true;
const battleMap=json('assets/frontend/maps/battle-room.json'),service=battleMap.interactions.find(i=>i.id==='battleRoom.service');Object.assign(base.player,{roomId:'battle-room',...(service.stand||service.anchor)});
for(const [i,id]of ['caocao','liubei','sunquan','ganning','zhaoyun','machao','diaochan','huatuo'].entries()){const c=catalog.byId.get(id),ref='long-ui-'+i;base.items[ref]={inventoryRef:ref,kind:'card',ownerId:'player',cardKey:c.cardKey,printedRarity:c.currentRarity,productId:c.pack,location:'collection',protected:false,lock:null,cost:0};}
const archive=world=>({format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:world.clock.day,minute:world.clock.minute,slot:'backup',world});
const server=await startShopServer({port:0,enginePort:0}),out='.local/long-term-browser';fs.mkdirSync(out,{recursive:true});let browser;
try{
 browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(20000);
 await page.goto(server.origin+'/frontend/index.html?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
 const c=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({requestId:'long-ui-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
 const q=name=>page.evaluate(async name=>{const r=await __cardShopApp.query(name);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},name);
 const restore=async world=>{await c('saves.import',{content:JSON.stringify(archive(world))});await page.waitForFunction(()=>__cardShopApp.getWorldScene()?.ready);};
 const close=()=>page.evaluate(()=>__cardShopApp.windows.closeAll());
 const prologue=page.getByRole('dialog',{name:'场景对话',exact:true});await prologue.waitFor();assert.equal((await q('dialogue.offer')).speakerName,'海玲');assert.equal((await q('longTerm.status')).loan.principal,20000);await page.screenshot({animations:'disabled',path:out+'/loan-prologue.png'});for(let n=0;n<10&&await prologue.getByRole('button',{name:'继续 ▸',exact:true}).count();n++)await prologue.getByRole('button',{name:'继续 ▸',exact:true}).click();await prologue.getByRole('button',{name:'记住约定，开始经营',exact:true}).click();
 await restore(base);assert.equal(await page.locator('#hud-actions button').count(),4);
 await page.locator('[data-action="more"]').click();let menu=page.getByRole('dialog',{name:'店铺菜单',exact:true});await menu.getByRole('button',{name:'经营',exact:true}).waitFor();
 await menu.getByRole('button',{name:'2倍速',exact:true}).click();await page.waitForFunction(()=>__cardShopApp.snapshot().clock.speed===2);
 await menu.getByRole('button',{name:'记录与设置',exact:true}).click();await menu.getByRole('button',{name:'存档管理',exact:true}).waitFor();await menu.getByRole('button',{name:'返回分类',exact:true}).click();await close();
 await page.locator('[data-action="allies"]').click();let allies=page.getByRole('dialog',{name:'高手伙伴与挑战',exact:true});await allies.getByRole('button',{name:'高手来访',exact:true}).click();await allies.locator('.partner-stage').first().waitFor();assert.equal(await allies.locator('.partner-stage').count(),15);await page.screenshot({animations:'disabled',path:out+'/challenge-progress.png'});await close();
 await page.evaluate(()=>__cardShopApp.openPanel('combat',{opponentId:__cardShopApp.actors().find(n=>n.specialist&&!n.allyId).actorId}));
 const room=page.locator('.v7-room');await room.getByRole('button',{name:'创建房间并选将',exact:true}).click();
 for(let i=0;i<3;i++)await room.locator(`[data-roster-key="long-ui-${i}"]`).click();await room.getByRole('button',{name:'确认整场备战',exact:true}).click();await room.getByRole('button',{name:'确认本局选将',exact:true}).click();await room.getByRole('button',{name:'整场认输',exact:true}).click();
 await room.getByRole('button',{name:'再战一局（重新选将）',exact:true}).waitFor();await page.screenshot({animations:'disabled',path:out+'/loss-options.png'});
 const previous=(await q('combat.rooms')).items.at(-1)?.matchId;await room.getByRole('button',{name:'再战一局（重新选将）',exact:true}).click();await room.getByRole('button',{name:'创建房间并选将',exact:true}).click();
 for(let i=0;i<3;i++)await room.locator(`[data-roster-key="long-ui-${i}"]`).click();await room.getByRole('button',{name:'确认整场备战',exact:true}).click();assert.notEqual((await q('combat.series')).matchId,previous);await room.getByRole('button',{name:'确认本局选将',exact:true}).click();await room.getByRole('button',{name:'整场认输',exact:true}).click();await room.getByRole('button',{name:'明日再战',exact:true}).click();await page.waitForFunction(()=>!document.querySelector('.v7-room'));assert.equal((await q('progression.status')).currentStage.dueDay,3);
 // A recruited roster is a UI-only fixture; authoritative assignment still uses the Host command.
 const roster=structuredClone(base);roster.progression.currentInvite=null;roster.progression.activeChallenge=null;
 roster.progression.allies=roster.progression.stages.slice(0,2).map((s,i)=>({allyId:s.challengerId,personId:s.personId,name:s.displayName,appearanceId:s.appearanceId,defaultDuty:s.defaultAllyDuty,assignedDuty:i===0?s.defaultAllyDuty:null,rate:s.allyRate,onDuty:i===0,recruitedAtDay:2}));await restore(roster);
 await page.locator('[data-action="allies"]').click();allies=page.getByRole('dialog',{name:'高手伙伴与挑战',exact:true});await allies.locator('.partner-card').first().waitFor();assert.equal(await allies.locator('.partner-card').count(),2);
 await allies.locator('select').nth(1).selectOption('checkout');await page.waitForFunction(async()=>(await __cardShopApp.query('allies.list')).data.slots.used===2);await page.screenshot({animations:'disabled',path:out+'/partners.png'});await close();
 // Review is a real dialogue, not an external story page; no debt is fabricated.
 const debtWorld=structuredClone(base);debtWorld.clock.day=7;debtWorld.progression.activeChallenge=null;debtWorld.progression.currentInvite=null;debtWorld.wallet.debt=10000;debtWorld.wallet.available=8000;debtWorld.longTerm.debtChallenge.status='onsite';
 debtWorld.npcs=debtWorld.npcs.filter(n=>!n.debtCollector);debtWorld.npcs.push({actorId:'specialist:creditor',name:'海玲',appearanceId:'bd-umiri',debtCollector:true,specialist:true,presence:'onsite',roomId:'battle-room',x:debtWorld.player.x,y:debtWorld.player.y+25,direction:'up',moving:false,wallet:{available:0}});debtWorld.dialogueOffer={kind:'debt-challenge',offerId:'debt-ui-offer',actorId:'specialist:creditor'};await restore(debtWorld);
 await page.getByRole('dialog',{name:'场景对话',exact:true}).waitFor();for(let n=0;n<8&&await page.getByRole('button',{name:'继续 ▸',exact:true}).count();n++)await page.getByRole('button',{name:'继续 ▸',exact:true}).click();await page.getByRole('button',{name:'打一场，争取减免',exact:true}).waitFor();await page.screenshot({animations:'disabled',path:out+'/debt-review.png'});await page.getByRole('button',{name:'明天再谈',exact:true}).click();assert.equal((await q('longTerm.status')).debt.nextVisitDay,8);
 await page.locator('#hud-wallet').getByRole('button').click();const goals=page.getByRole('dialog',{name:'高手伙伴与挑战',exact:true});await goals.getByRole('spinbutton',{name:'本次还款金额'}).fill('1000');await goals.getByRole('button',{name:'支付本次还款',exact:true}).click();await page.waitForFunction(async()=>(await __cardShopApp.query('longTerm.status')).data.loan.paid===1000);assert.equal((await q('shop.snapshot')).wallet.debt,10000);assert.equal((await q('longTerm.status')).loan.currentGoal.remaining,4000);await page.screenshot({animations:'disabled',path:out+'/loan-goals.png'});
 await close();await page.setViewportSize({width:640,height:800});await page.locator('[data-action="more"]').click();menu=page.getByRole('dialog',{name:'店铺菜单',exact:true});await menu.getByRole('button',{name:'人物与挑战',exact:true}).waitFor();assert(await menu.evaluate(e=>e.getBoundingClientRect().right<=innerWidth));
 assert.deepEqual(errors,[]);console.log('PASS four-button HUD, categorized menu and speed, challenge schedule, fresh rematch, postpone, partner assignment, opening lender story, milestone payment and narrow layout');
}finally{await browser?.close();await server.close();}
