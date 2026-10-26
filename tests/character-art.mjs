// Face-loss regression: check visible facial features, responsive rendering, and the art-tool path.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {chromium} from 'playwright';
import {decodePng} from '../tools/frontend-art/png.mjs';
import {PRESETS} from '../experiments/character-art/appearance-data.mjs';
import {BAND_APPEARANCES} from '../data/band-appearances.mjs';
import {worldSceneZoom} from '../frontend/scenes/world-scene.mjs';
import {startShopServer} from '../server.mjs';
const root='experiments/character-art/generated/',out='.local/character-art/screenshots';fs.mkdirSync(out,{recursive:true});
const read=name=>decodePng(fs.readFileSync(root+name));
for(const c of PRESETS){
  const sheet=read(c.id+'-walk.png');
  if(c.band){const portrait=read(c.id+'-standing-128x224.png'),avatar=read(c.id+'-portrait-96.png');assert.deepEqual([portrait.width,portrait.height],[128,224]);assert.deepEqual([avatar.width,avatar.height],[96,96]);}
  for(let row=1;row<4;row++)for(let col=0;col<8;col++){
    let mouth=0,highlight=0,skin=0,duplicateEye=0;for(let y=27;y<40;y++)for(let x=20;x<44;x++){const i=((row*64+y)*512+col*64+x)*4,[r,g,b,a]=sheet.rgba.subarray(i,i+4);if(a===255&&r===131&&g===89&&b===100)mouth++;if(a===255&&r===255&&g===(c.walkCostume?255:253)&&b===(c.walkCostume?255:247))highlight++;if(a===255&&r===237&&g===197&&b===168)skin++;if(a===255&&r===255&&g===253&&b===247)duplicateEye++;}
    // Refined profiles retain LPC's baked mouth; require visible skin/eye highlights rather than the removed overlay mouth color.
    assert.ok((c.walkCostume&&row!==2?skin>0:mouth>0)&&highlight>0,`${c.id}: row ${row}, frame ${col} lost its face`);
    if(c.walkCostume)assert.equal(duplicateEye,0,`${c.id}: old overlay eye system returned`);
  }
}
assert.equal(new Set(BAND_APPEARANCES.map(c=>c.officialName)).size,25);assert.ok(BAND_APPEARANCES.some(c=>c.characterName==='千石ユノ'));assert.ok(BAND_APPEARANCES.some(c=>c.characterName==='梅里ちえり'));assert.equal(worldSceneZoom(360,300),1);
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});const page=await browser.newPage({viewport:{width:406,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/experiments/character-art/index.html');await page.waitForFunction(()=>window.artLab?.ready===true);
  for(const c of PRESETS){const browserHash=await page.evaluate(async id=>{const canvas=artLab.sheets.get(id),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(v=>v.toString(16).padStart(2,'0')).join('');},c.id);assert.equal(browserHash,createHash('sha256').update(read(c.id+'-walk.png').rgba).digest('hex'),c.id+': browser walk layers differ from the exported PNG');}
  assert.equal(await page.evaluate(()=>artLab.player.direction),'down');assert.ok((await page.locator('#shop').boundingBox()).width>=480);
  assert.ok(await page.locator('.conversation').isVisible(),'narrow panels must retain the character portrait');
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'the map must scroll locally, not widen the entire page');
  await page.keyboard.down('w');await page.waitForFunction(()=>artLab.player.direction==='up');await page.keyboard.up('w');await page.locator('.roster-card[data-id="bd-tomori"]').click();await page.waitForFunction(()=>document.querySelector('#motion-status').textContent.includes('正面'));assert.equal(await page.evaluate(()=>artLab.player.direction),'down');
  await page.locator('[data-tab="editor"]').click();await page.locator('[data-scale="1"]').click();const size=await page.locator('#large-portrait canvas').boundingBox();assert.deepEqual([size.width,size.height],[128,224]);
  await page.setViewportSize({width:1280,height:900});
  for(const c of BAND_APPEARANCES){await page.locator('#preset').selectOption(c.id);await page.waitForFunction(id=>JSON.parse(document.querySelector('#config').textContent).id===id,c.id);assert.equal(await page.locator('#large-portrait canvas').getAttribute('height'),'224');const browserHash=await page.evaluate(async()=>{const canvas=document.querySelector('#large-portrait canvas'),pixels=canvas.getContext('2d').getImageData(0,0,canvas.width,canvas.height).data;return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',pixels))).map(v=>v.toString(16).padStart(2,'0')).join('');});assert.equal(browserHash,createHash('sha256').update(read(c.id+'-standing-128x224.png').rgba).digest('hex'),c.id+': browser portrait differs from the exported PNG');}
  await page.locator('#preset').selectOption('bd-sakiko');await page.waitForFunction(()=>JSON.parse(document.querySelector('#config').textContent).id==='bd-sakiko');await page.locator('[data-scale="2"]').click();await page.locator('#editor').screenshot({path:out+'/refined-standing-editor.png'});
  await page.locator('[data-tab="walk"]').click();await page.locator('#band-filter').selectOption('mygo');await page.locator('.roster-card[data-id="bd-tomori"]').click();await page.waitForFunction(()=>artLab.player.direction==='down');await page.locator('.scene-layout').screenshot({path:out+'/refined-walk-preview.png'});
  assert.deepEqual(errors,[]);console.log('PASS art: 600 front/profile animation frames retain eyes and mouths; 25 full-body portraits and avatars; official names; native pixel scale; narrow-panel portraits, front-facing selection, editor sizing; exact browser/CLI pixel hashes for all 25 walk sheets and 25 standing portraits.');
}finally{await browser?.close();await server.close();}
