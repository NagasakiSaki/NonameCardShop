import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {decodePng} from '../tools/frontend-art/png.mjs';
import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';

const manifest=JSON.parse(fs.readFileSync('assets/frontend/manifest.json'));
for(const [id,e]of Object.entries(manifest.characters)){
  assert(e.idleSheet,id+' missing dedicated idle');assert.equal(e.idleColumns,1);
  const idle=decodePng(fs.readFileSync('.'+e.idleSheet)),walk=decodePng(fs.readFileSync('.'+e.sheet));
  assert.deepEqual([idle.width,idle.height],[64,256]);
  for(const row of [0,1,2,3]){
    const pose=idle.rgba.subarray(row*64*64*4,(row+1)*64*64*4);assert(pose.some((v,i)=>i%4===3&&v));
    const walking=new Uint8Array(64*64*4);for(let y=0;y<64;y++)walking.set(walk.rgba.subarray(((row*64+y)*512)*4,((row*64+y)*512+64)*4),y*64*4);
    assert.notDeepEqual(Buffer.from(pose),Buffer.from(walking),id+': idle must not freeze walking column 0');
  }
}
const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/world-motion';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/data/backend-rules.json');await page.evaluate(async()=>{
    const [{createWorld},{browserRepository},{initialiseV7}]=await Promise.all([import('/modules/backend/world.mjs'),import('/modules/backend/storage.mjs'),import('/modules/backend/v7-policy.mjs')]);
    const rules=await fetch('/data/backend-rules.json').then(r=>r.json());const w=createWorld(rules);initialiseV7(w,rules,{fresh:true});w.clock.phase='open';w.clock.minute=540;w.nextNpcMinute=1e6;w.player.x=350;w.player.y=200;
    const stage=w.progression.stages[0];stage.status='cleared';w.progression.allies=[{allyId:stage.challengerId,personId:stage.personId,appearanceId:stage.appearanceId,name:stage.displayName,onDuty:true,defaultDuty:'attraction',assignedDuty:'attraction',rate:.1,recruitedAtDay:1}];
    w.npcs=[{actorId:'idle-partner',personId:stage.personId,allyId:stage.challengerId,name:stage.displayName,appearanceId:stage.appearanceId,wallet:{available:0},specialist:true,presence:'onsite',roomId:'store',x:270,y:130,direction:'left',moving:false,activity:'idle'}];
    const repo=browserRepository();await repo.commit({schemaVersion:2,revision:0,world:w,archives:[],requests:{},legacyResetDone:true},null);await repo.close();
  });
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);
  await page.waitForFunction(()=>__cardShopApp.getWorldScene()?.ready&&[...__cardShopApp.getWorldScene().actorView.sprites.values()].some(e=>e.sprite.anims.currentAnim?.key.startsWith('idle-')));
  // Test actual Phaser matrices at every fractional auto-zoom. Disable alignment
  // in the same isolated scene for the negative control, then reattach it.
  const evidence=await page.evaluate(async()=>{
    const {alignCameraPixels}=await import('/frontend/world/pixel-camera.mjs');const scene=__cardShopApp.getWorldScene(),cam=scene.cameras.main;
    const pause=await __cardShopApp.host.pause.acquire({ownerId:'motion-test',reason:'isolated camera measurement'});
    const samples=[];cam.removeBounds();
    const visibility=scene.children.list.map(o=>[o,o.visible]);
    for(const [o]of visibility)o.setVisible(!!o.floorBake);
    const measure=async(enabled,zoom)=>{
      cam.off('followupdate',alignCameraPixels);if(enabled)cam.on('followupdate',alignCameraPixels);
      cam.setZoom(zoom);const proxy={x:420,y:190};cam.startFollow(proxy,false,1,1);let i=0;const rows=[],patches=[],transforms=[];
      if(!enabled){scene.floorRasterZoom=zoom;for(const floor of scene.floorSprites)floor.setTexture(floor.floorBake.source).setScale(.25);}
      else scene.floorRasterZoom=null;
      const renderer=scene.game.renderer,original=renderer.batchSprite;let floorTransform;
      renderer.batchSprite=function(actor,...args){const result=original.call(this,actor,...args);if(actor.floorBake?.mapId==='store'){const m=this._tempMatrix1;floorTransform={a:m.a,d:m.d,x:m.e,y:m.f};}return result;};
      await new Promise(resolve=>{const step=()=>{const m=cam.matrix,x=m.tx-cam.scrollX*m.a-cam.scrollY*m.c,y=m.ty-cam.scrollX*m.b-cam.scrollY*m.d;rows.push({x,y,error:Math.max(Math.abs(x-Math.round(x)),Math.abs(y-Math.round(y)))});
        if(zoom===1.75&&i>=8){const sx=Math.round(x+300*zoom),sy=Math.round(y+100*zoom);patches.push(scene.game.canvas.getContext('2d').getImageData(sx,sy,32,32).data);transforms.push({...floorTransform,sx,sy,actualZoom:cam.zoom});}
        proxy.x+=.73;proxy.y+=.19;if(++i===35){scene.game.events.off('postrender',step);resolve();}};scene.game.events.on('postrender',step);});
      renderer.batchSprite=original;
      const rasterChanges=patches.slice(1).reduce((n,p)=>n+Number(p.some((v,i)=>v!==patches[0][i])),0);
      return {enabled,zoom,maxError:Math.max(...rows.slice(2).map(r=>r.error)),distinctPositions:new Set(rows.map(r=>r.x.toFixed(4))).size,rasterChanges,patches:patches.length,transforms};
    };
    samples.push(await measure(false,1.75));for(const zoom of [1,1.25,1.5,1.75,2,2.75,3])samples.push(await measure(true,zoom));
    for(const [o,visible]of visibility)o.setVisible(visible);
    cam.setBounds(0,0,Math.max(...scene.roomMaps.map(map=>(map.worldOffset?.x||0)+map.width*16)),320);cam.startFollow(scene.actorView.getSprite(__cardShopApp.getPlayer().actorId),false,.18,.18);await __cardShopApp.host.pause.release(pause.leaseId);
    return samples;
  });
  fs.writeFileSync(output+'/camera-pixel-phase.json',JSON.stringify(evidence,null,2));
  assert(evidence[0].maxError>.1,'negative control must reproduce subpixel background translation');
  assert(evidence[0].rasterChanges>0,'old uncached fractional floor rendering must reproduce changing texel samples');
  for(const sample of evidence.slice(1)){assert(sample.maxError<1e-4,JSON.stringify(sample));assert(sample.distinctPositions>3,'camera must actually move');}
  assert.equal(evidence.find(s=>s.enabled&&s.zoom===1.75).rasterChanges,0,'the same static world patch must retain identical raster pixels while the camera moves');
  // Check all four formal idle textures and resume approved walking frames.
  const poses=await page.evaluate(async()=>{
    const scene=__cardShopApp.getWorldScene(),sprite=scene.actorView.getSprite(__cardShopApp.getPlayer().actorId),id=__cardShopApp.getPlayer().appearanceId,rows=[];
    const lease=await __cardShopApp.host.pause.acquire({ownerId:'pose-test',reason:'idle checks'});
    for(const direction of ['down','left','up','right']){sprite.play('idle-'+id+'-'+direction,true);rows.push({direction,key:sprite.texture.key,frame:sprite.frame.name});}
    sprite.play('walk-'+id+'-left',true);rows.push({direction:'walk-left',key:sprite.texture.key});await __cardShopApp.host.pause.release(lease.leaseId);return rows;
  });
  for(const p of poses.slice(0,4))assert.match(p.key,/^char-idle-/);assert.match(poses[4].key,/^char-bd-/);
  await page.evaluate(()=>__cardShopApp.openPanel('allies'));await page.locator('select[aria-label$="工作"]').waitFor();assert.equal(await page.locator('select[aria-label$="工作"] option[value="duelist"]').count(),1);
  await page.locator('select[aria-label$="工作"]').selectOption('duelist');await page.waitForFunction(()=>document.querySelector('.partner-card')?.textContent.includes('当班 · 约战赚钱'));
  assert(await page.getByText(/常规本金 60 币/).isVisible());await page.screenshot({path:output+'/partner-duty.png'});await page.evaluate(()=>__cardShopApp.windows.closeAll());
  await page.screenshot({path:output+'/world-neutral-poses.png'});assert.deepEqual(errors,[]);fs.writeFileSync(output+'/camera-pixel-phase.json',JSON.stringify(evidence,null,2));
  await page.evaluate(()=>__cardShopApp.host.disconnect());console.log('PASS motion/idle: actual Phaser negative control + 7 zooms with integer shared screen translation, 25 distinct four-way neutral sheets, animation texture switching and partner earning UI.');
}finally{await browser?.close();await server.close();}
