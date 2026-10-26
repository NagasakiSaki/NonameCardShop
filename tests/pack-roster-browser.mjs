import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
const j=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=j('data/cards.json'),rules=j('data/backend-rules.json'),catalog=buildCatalog(source,rules),native=j('data/v7/native-eligibility.json');
const r=await createRuntime({source,rules,repository:memoryRepository()});await r.connect({contractVersion:'card-shop-ui/1.0',clientId:'pack-roster-fixture'});let seq=0;
const cmd=async(type,payload={})=>{const v=await r.command({requestId:'pack-fixture-'+ ++seq,type,payload});assert(v.ok,JSON.stringify(v));return v.data;};
const intro=(await r.query('dialogue.offer')).data;await cmd('dialogue.respond',{offerId:intro.offerId,optionId:'begin',proof:intro.proof});await cmd('business.open');await cmd('business.close');await cmd('business.nextDay');await cmd('business.open');await r.advance(.1);
const offer=(await r.query('dialogue.offer')).data;await cmd('dialogue.respond',{offerId:offer.offerId,optionId:'accept',proof:offer.proof});
const world=r.inspect().world;await r.disconnect();world.clock.manualPaused=true;
const point=j('assets/frontend/maps/battle-room.json').interactions.find(i=>i.id==='battleRoom.service').stand;Object.assign(world.player,{roomId:'battle-room',...point});
for(const pack of ['refresh','yijiang']){const cards=catalog.cards.filter(c=>c.pack===pack&&!rules.compatibilityBlocks[c.generalId]&&Object.values(native.formats).every(f=>!f.blocked[c.generalId])).slice(0,24);assert.equal(cards.length,24);for(const c of cards){const ref='roster-'+c.generalId;world.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:c.cardKey,printedRarity:c.issuanceRarity,productId:pack,location:'collection',protected:false,lock:null,cost:0};}}
const low=catalog.cards.filter(c=>world.items['roster-'+c.generalId]&&c.pack==='refresh').sort((a,b)=>a.power.modeScores['doudizhu-bo3']-b.power.modeScores['doudizhu-bo3'])[0];world.player.favoriteCardKeys=[low.cardKey];
const archive={format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:world.clock.day,minute:world.clock.minute,slot:'backup',world};
const server=await startShopServer({port:0,enginePort:0}),out='.local/pack-roster-browser';fs.mkdirSync(out,{recursive:true});let browser;
try{
 browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());page.setDefaultTimeout(20000);
 await page.goto(server.origin+'/frontend/index.html?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
 const command=(type,payload={})=>page.evaluate(async({type,payload})=>{const x=await __cardShopApp.command({requestId:'pack-ui-'+crypto.randomUUID(),type,payload});if(!x.ok)throw Error(JSON.stringify(x));return x.data;},{type,payload});
 const query=(name,p={})=>page.evaluate(async({name,p})=>{const x=await __cardShopApp.query(name,p);if(!x.ok)throw Error(JSON.stringify(x));return x.data;},{name,p});
 await command('saves.import',{content:JSON.stringify(archive)});await page.waitForFunction(()=>__cardShopApp.getWorldScene()?.ready);await page.evaluate(()=>__cardShopApp.openPanel('combat',{opponentId:__cardShopApp.actors().find(n=>n.specialist&&!n.allyId&&!n.debtCollector).actorId}));
 const room=page.locator('.v7-room');await room.locator('[data-format-id="doudizhu-bo3"]').click();await room.getByRole('button',{name:'创建房间并选将',exact:true}).click();await room.locator('[data-pack-selector]').waitFor();assert.equal(await room.locator('[data-roster-key]').count(),0);await page.screenshot({path:out+'/pack-entrances.png',animations:'disabled'});
 const picks=[];
 async function enter(id){await room.locator('[data-roster-pack="'+id+'"]').click();await room.locator('[data-roster-key]').first().waitFor();}
 async function verifyDescending(){const values=await room.locator('[data-roster-key]').evaluateAll(rows=>rows.map(row=>Number(row.textContent.match(/本模式 ([\d.]+)/)[1])));assert.deepEqual(values,[...values].sort((a,b)=>b-a));}
 await enter('refresh');await verifyDescending();const first=await room.locator('[data-roster-key]').first().getAttribute('data-card-key');assert.notEqual(first,low.cardKey,'a low-scored favorite must not jump ahead');
 const body=room.locator('.window__body');const target=room.locator('[data-roster-key]').nth(12);await target.scrollIntoViewIfNeeded();const scroll=await body.evaluate(e=>e.scrollTop);assert(scroll>100);picks.push(await target.getAttribute('data-roster-key'));await target.click();assert(Math.abs((await body.evaluate(e=>e.scrollTop))-scroll)<=2,'selecting must preserve scroll');
 await room.getByRole('button',{name:'返回卡包',exact:true}).click();assert.equal(await room.locator('.v7-picked-tray button').count(),1);await enter('yijiang');await verifyDescending();
 for(let i=0;i<4;i++){const c=room.locator('[data-roster-key]').nth(i);picks.push(await c.getAttribute('data-roster-key'));await c.click();}
 assert.equal(await room.locator('.v7-picked-tray button').count(),5);const remembered=await room.locator('[data-roster-key]').first().getAttribute('data-roster-key');
 await room.locator('[data-roster-key]').first().click({button:'right'});const detail=page.getByRole('dialog',{name:'卡牌详情',exact:true});await detail.getByText('查看两回合收益明细',{exact:true}).click();await detail.getByText('两轮牌差',{exact:true}).waitFor();await page.screenshot({path:out+'/yield-detail.png',animations:'disabled'});await detail.getByRole('button',{name:'关闭 (Esc)',exact:true}).click();assert.equal(await room.locator('[data-roster-key]').first().getAttribute('data-roster-key'),remembered);assert.equal(await room.locator('.v7-picked-tray button').count(),5);
 await page.screenshot({path:out+'/cross-pack-selected.png',animations:'disabled'});await page.setViewportSize({width:640,height:800});const confirm=room.getByRole('button',{name:'确认整场备战',exact:true});assert(await confirm.isEnabled());assert(await confirm.evaluate(e=>{const b=e.getBoundingClientRect();return b.bottom<=innerHeight&&b.right<=innerWidth;}));await confirm.click();
 await room.getByRole('button',{name:'确认本局选将',exact:true}).waitFor();await enter('*');await verifyDescending();const series=await query('combat.series'),role=series.round.roles.mine;
 for(const c of series.reserveItems){const tile=room.locator('[data-roster-key="'+c.inventoryRef+'"]');const text=await tile.textContent();assert(text.includes('本模式 '+c.roleScores[role].toFixed(1)));}
 const count=role==='farmer'?2:1;for(let i=0;i<count;i++)await room.locator('[data-roster-key]').nth(i).click();await room.getByRole('button',{name:'确认本局选将',exact:true}).click();await room.locator('[data-roster-locked]').waitFor();await room.getByRole('button',{name:'整场认输',exact:true}).click();
 assert.deepEqual(errors,[]);console.log('PASS pack entrances, strict mode scores, cross-pack reserve, scroll preservation, right-click yield details, narrow-screen confirmation and identity-specific round picks');
}finally{await browser?.close();await server.close();}
