import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {startShopServer} from '../server.mjs';
import {lightingForMinute} from '../frontend/world/lighting-view.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),source=json('data/cards.json'),rules=json('data/backend-rules.json'),catalog=buildCatalog(source,rules),manifest=json('assets/frontend/manifest.json');
assert.equal(manifest.props.list.length,76);assert.equal(manifest.props.cellSize,384);assert.equal(manifest.props.artScale,4);assert.equal(manifest.tileset.frameSize,64);
assert(lightingForMinute(600).dark<=.02);assert(lightingForMinute(1260).dark<=.60);assert.deepEqual(lightingForMinute(-180),lightingForMinute(1260));
const runtime=await createRuntime({source,rules,repository:memoryRepository()}),base=structuredClone(runtime.inspect().world);
base.longTerm.loan.intro.status='acknowledged';base.dialogueOffer=null;for(const n of base.npcs.filter(n=>n.debtCollector)){n.presence='offsite';n.trip=null;}
base.clock.phase='open';base.clock.minute=600;base.clock.manualPaused=true;base.wallet.available=50000;
const map=json('assets/frontend/maps/store.json'),counter=map.interactions.find(i=>i.id==='store.counter');Object.assign(base.player,{roomId:'store',...(counter.stand||counter.anchor)});
for(const [i,id]of ['caocao','liubei','sunquan'].entries()){const card=catalog.byId.get(id);base.items['bright-card-'+i]={inventoryRef:'bright-card-'+i,kind:'card',cardKey:card.cardKey,ownerId:'player',printedRarity:card.currentRarity,location:'collection',lock:null,protected:false,cost:100};}
const archive=world=>({format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:world.clock.day,minute:world.clock.minute,slot:'backup',world});
const server=await startShopServer({port:0,enginePort:0}),out=process.env.CARD_SHOP_TEST_RESULTS||'.local/bright-integration/formal';fs.mkdirSync(out,{recursive:true});let browser;
try{
 browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.on('pageerror',e=>errors.push(e.message));page.on('dialog',d=>d.accept());
 await page.goto(server.origin+'/frontend/index.html');await page.locator('.start-menu__new').waitFor();await page.screenshot({animations:'disabled',path:out+'/start-menu.png'});
 const light=async locator=>{const rgb=await locator.evaluate(e=>{const s=getComputedStyle(e),value=s.backgroundColor==='rgba(0, 0, 0, 0)'?s.backgroundImage:s.backgroundColor;return value.match(/rgba?\(([^)]+)/)?.[1].split(',').slice(0,3).map(Number);});assert(rgb&&rgb.every(v=>v>180),JSON.stringify(rgb));};await light(page.locator('.start-menu'));
 await page.goto(server.origin+'/frontend/index.html?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
 const restore=async world=>{const result=await page.evaluate(async content=>__cardShopApp.command({requestId:'bright-import-'+crypto.randomUUID(),type:'saves.import',payload:{content}}),JSON.stringify(archive(world)));assert(result.ok,JSON.stringify(result));await page.waitForFunction(()=>__cardShopApp.getWorldScene()?.ready);await page.waitForTimeout(160);await page.evaluate(()=>document.getElementById('toasts')?.replaceChildren());};
 await restore(base);await page.waitForFunction(()=>__cardShopApp.getWorldScene().actorView.getSprite('actor:owner'));
 const shape=await page.evaluate(()=>{const s=__cardShopApp.getWorldScene();return {props:s.propSprites.length,atlas:s.textures.get('props').getSourceImage().width,night:s.lights[0].ambient.dark,shadow:s.actorView.sprites.get('actor:owner').shadow.displayWidth};});assert.equal(shape.atlas,3072);assert(shape.props>=20);assert(shape.night<=.02);assert.equal(shape.shadow,21);
 await page.locator('.note-card').first().waitFor();await page.screenshot({animations:'disabled',path:out+'/store-day.png'});const night=structuredClone(base);night.clock.minute=1260;await restore(night);assert((await page.evaluate(()=>__cardShopApp.getWorldScene().lights[0].ambient.dark))<=.6);await page.screenshot({animations:'disabled',path:out+'/store-night.png'});await restore(base);
 for(const panel of ['inventory','tasks','report','saves','settings','customers','allies','trash']){
  await page.evaluate(panel=>__cardShopApp.openPanel(panel),panel);const dialog=page.locator('.window').last();await dialog.waitFor();await light(dialog);await page.waitForTimeout(90);const accent=dialog.locator('.pc-card--accent').first();if(await accent.count())await light(accent);await page.screenshot({animations:'disabled',path:out+'/'+panel+'.png'});await page.evaluate(()=>__cardShopApp.windows.closeAll());
 }
 await page.evaluate(cardKey=>__cardShopApp.openPanel('cardDetail',{cardKey}),base.items['bright-card-0'].cardKey);const detail=page.getByRole('dialog',{name:'卡牌详情',exact:true});await detail.getByText('全局综合分',{exact:true}).waitFor();await detail.locator('.hero-art').waitFor();await light(detail.locator('[data-trade-workspace]'));await page.screenshot({animations:'disabled',path:out+'/card-detail.png'});await page.evaluate(()=>__cardShopApp.windows.closeAll());
 await page.evaluate(async()=>{const [{createDialogueOverlay},{createPresentation}]=await Promise.all([import('/frontend/dialogue/dialogue-overlay.mjs'),import('/frontend/dialogue/dialogue-presenter.mjs')]);if(!document.getElementById('v7-dialogue-style')){const link=document.createElement('link');link.id='v7-dialogue-style';link.rel='stylesheet';link.href='/frontend/dialogue/dialogue-styles.css';document.head.append(link);}const ui=createDialogueOverlay({mount:document.body,getPortraitSrc:id=>__cardShopApp.manifest.characters[id]?.portrait,onIntent:()=>{}});ui.present(createPresentation({offerId:'bright-preview',speakerName:'高松灯',appearanceId:'bd-tomori',roleLabel:'高手',kind:'talk',text:'欢迎来到卡店。要一起打牌吗？',choices:[{optionId:'accept',text:'接受挑战'},{optionId:'tomorrow',text:'明天再来'}]},{charsPerPage:95}));window.brightDialogueTest=ui;});
 await page.locator('.v7-dialogue.is-open').waitFor();await light(page.locator('.v7-dialogue.is-open'));await page.screenshot({animations:'disabled',path:out+'/dialogue.png'});await page.evaluate(()=>window.brightDialogueTest.close());
 await page.setViewportSize({width:390,height:680});await page.evaluate(()=>__cardShopApp.openPanel('saves'));await page.getByRole('dialog',{name:'按天存档',exact:true}).waitFor();await page.screenshot({animations:'disabled',path:out+'/saves-mobile.png'});
 assert.deepEqual(errors,[]);console.log('PASS bright real-Host world, night lighting, original movement sheets, management/save/collection pages and Shadow DOM detail theme');
}finally{await browser?.close();await server.close();await runtime.disconnect();}
