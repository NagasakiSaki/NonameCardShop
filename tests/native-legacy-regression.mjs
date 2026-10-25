import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch(fs.existsSync(chromium.executablePath())?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:1000}});page.on('dialog',d=>d.accept());
  await page.goto(server.origin+'/experiments/native-modes/index.html');
  for(const mode of ['bo3','kof']){
    const roster=mode==='kof'?['caocao','liubei','sunquan']:['caocao'],opponentRoster=mode==='kof'?['guanyu','zhangfei','zhangliao']:['guanyu'];
    const url=new URL('/',server.engineOrigin);for(const [k,v]of Object.entries({packer:1,match:'legacy-regression-'+mode,parentOrigin:server.origin,general:roster[0],opponent:opponentRoster[0],duelMode:mode,roster:JSON.stringify(roster),opponentRoster:JSON.stringify(opponentRoster),initialHand:4,firstDrawPenalty:1}))url.searchParams.set(k,v);
    await page.evaluate(({url,origin})=>{window.legacyEvents=[];window.onmessage=e=>{if(e.origin===origin&&e.data?.channel==='noname-packer')legacyEvents.push(e.data);};const f=document.createElement('iframe');f.src=url;document.querySelector('#arena').replaceChildren(f);},{url:url.href,origin:server.engineOrigin});
    await page.waitForFunction(()=>legacyEvents.some(e=>e.type==='ready'||e.type==='error'),null,{timeout:60000});
    assert.equal(await page.evaluate(()=>legacyEvents.find(e=>e.type==='ready'||e.type==='error').type),'ready');
    const frame=page.frames().find(f=>f.url().startsWith(server.engineOrigin+'/'));
    await frame.evaluate(async()=>{window.__legacy=await import('/noname.js');});
    await frame.waitForFunction(()=>__legacy._status.imchoosing&&__legacy._status.paused,null,{timeout:20000});
    if(mode==='kof'){
      await frame.evaluate(()=>{const {game,ui,_status}=__legacy;const e=game.createEvent('shopLegacyDeathFixture',false);e.forceDie=true;e.setContent(async()=>{await game.shopDuel.teams[1].player.die();});if(!_status.auto)ui.click.auto();game.resume();});
      await page.waitForFunction(()=>legacyEvents.some(e=>e.type==='replacement'),null,{timeout:25000});
      const replacement=await page.evaluate(()=>legacyEvents.find(e=>e.type==='replacement'));assert.equal(replacement.drawn,4);assert.equal(replacement.inherited,0);assert.equal(replacement.newGeneral,'zhangfei');
    }
    await page.evaluate(()=>document.querySelector('#arena').replaceChildren());console.log('PASS original native preload route',mode,mode==='kof'?'fresh-four replacement':'two-seat ready');
  }
}finally{await browser?.close();await server.close();}
