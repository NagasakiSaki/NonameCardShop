const {chromium,root,output,base,engineOrigin}=require("./helpers.cjs");
const assert=require('node:assert/strict'),fs=require('node:fs');
let testBrowser;
(async()=>{
 const browser=await chromium.launch({headless:true}).then(b=>(testBrowser=b,b)),page=await browser.newPage({viewport:{width:1450,height:1000}}),errors=[];
 page.on('pageerror',e=>{errors.push(e.stack);console.log('ERROR',e.stack)});page.on('dialog',d=>d.accept());
 page.on('response',r=>{if(r.status()>=400)console.log('HTTP',r.status(),r.url());});
 await page.goto(base+'/');await page.waitForFunction(()=>typeof DATA!=='undefined'&&DATA&&ShopGame.scene?.owner);
 await page.evaluate(()=>{for(const id of ['caocao','liubei','sunquan','zhangfei'])state.collection[id]=2;store.save(state);});
 async function launch(mode){await page.evaluate(mode=>{openBattleSetup(null,{mode});},mode);await page.locator('#battleGeneral').selectOption('caocao');await page.locator('#battleOpponent').selectOption('zhangliao');if(mode==='kof'){await page.locator('#battleGeneral2').selectOption('liubei');await page.locator('#battleGeneral3').selectOption('sunquan');await page.locator('#battleOpponent2').selectOption('guanyu');await page.locator('#battleOpponent3').selectOption('zhangfei');}const previous=await page.evaluate(()=>activeBattle?.gameId);await page.evaluate(()=>{window.__testRandom=Math.random;Math.random=()=>0.1;});await page.locator('#battleStart').click();const started=await waitEngine(previous);await page.evaluate(()=>{Math.random=window.__testRandom;});return started;}
 async function waitEngine(previous){await page.waitForFunction(old=>activeBattle?.started&&activeBattle.gameId!==old,previous||null,{timeout:60000});const frame=page.frames().find(f=>f.url().startsWith(engineOrigin+'/'));await frame.evaluate(async()=>{window.__engine=await import('/noname.js');});await frame.waitForFunction(()=>window.__engine?.game?.shopDuel&&window.__engine._status.imchoosing&&window.__engine._status.paused,null,{timeout:30000});await frame.evaluate(async()=>{const{lib}=await import('/noname.js');lib.config.game_speed='vvfast';});return frame;}
 async function fixture(frame,{side=1,hand=3,chain=false,final=false,attack=false}={}){
   await frame.evaluate(async opts=>{
     const{game,_status,lib,ui}=await import('/noname.js');game.shopFixture=null;
     const event=game.createEvent('shopTestFixture',false);event.forceDie=true;
     event.setContent(async()=>{
       const t=game.shopDuel.teams[opts.side],p=t.player,other=game.shopDuel.teams[1-opts.side].player;
       await p.discard(p.getCards('hejsx'));
       const cards=Array.from({length:opts.hand},(_,i)=>game.createCard(i%2?'sha':'shan',i%2?'spade':'heart',i+1));p.directgain(cards);const ids=cards.map(c=>c.cardid);const weapon=game.createCard('zhuge','club',1);p.directequip([weapon]);p.storage.shopOldMarker=99;p.addSkill('jizhi');p.link(true);p.turnOver(true);
       const oldName=p.name,otherState={hp:other.hp,hand:other.getCards('h').map(c=>c.cardid),equip:other.countCards('e')};
       if(opts.chain){lib.skill.shop_test_chain={trigger:{player:'die'},forced:true,forceDie:true,popup:false,async content(){await other.die();}};p.addSkill('shop_test_chain');}
       if(opts.attack){p.hp=1;p.update();const attackCard=game.createCard('sha','spade',7);game.me.directgain([attackCard]);await game.me.useCard(attackCard,p,false);}else await p.die();
       if(!opts.final){const record=()=>{game.shopFixture={oldName,name:p.name,hp:p.hp,hand:p.getCards('h').map(c=>c.cardid),expected:ids,equip:p.countCards('e'),oldMarker:p.storage.shopOldMarker,oldSkill:p.hasSkill('jizhi'),linked:p.isLinked(),turned:p.isTurnedOver(),otherBefore:otherState,otherAfter:{hp:other.hp,hand:other.getCards('h').map(c=>c.cardid),equip:other.countCards('e')},teams:game.shopDuel.teams.map(t=>({index:t.index,name:t.player.name,h:t.player.countCards('h')}))};game.pause();};if(game.shopDuel.scheduled){const anchor=game.shopDuel.boundaryAnchor,next=game.createEvent('shopTestCheckpoint',false,anchor);anchor.next.remove(next);anchor.after.push(next);next.forceDie=true;next.setContent(async()=>record());}else record();}
     });
     if(!_status.auto)ui.click.auto();game.resume();
   },{side,hand,chain,final,attack});
   if(!final){let handle;try{handle=await frame.waitForFunction(()=>window.__engine.game.shopFixture,null,{timeout:20000});}catch(e){console.log('STALLED',await frame.evaluate(()=>{const{game,_status}=window.__engine;const a=game.shopDuel.boundaryAnchor;return {event:_status.event.name,paused:_status.paused,auto:_status.auto,choosing:_status.imchoosing,pending:[...game.shopDuel.pending],scheduled:game.shopDuel.scheduled,anchor:a&&{name:a.name,finished:a.finished,next:a.next.map(e=>e.name),after:a.after.map(e=>e.name)},teams:game.shopDuel.teams.map(t=>({name:t.player.name,index:t.index,dead:t.player.isDead(),hand:t.player.countCards('h')}))}}));throw e;}return handle.jsonValue();}
   await page.waitForFunction(()=>activeBattle?.finished,null,{timeout:20000});
 }
 let frame=await launch('kof');let snap=await fixture(frame,{hand:3});console.log('FRESH HAND',snap);
 assert.equal(snap.hand.length,4);assert.ok(snap.hand.every(id=>!snap.expected.includes(id)));assert.equal(snap.name,'guanyu');assert.equal(snap.equip,0);assert.equal(snap.oldMarker,undefined);assert.equal(snap.oldSkill,false);assert.equal(snap.linked,false);assert.equal(snap.turned,false);assert.deepEqual(snap.otherAfter,snap.otherBefore);
 snap=await fixture(frame,{hand:0,attack:true});assert.equal(snap.name,'zhangfei');assert.equal(snap.hp,4);assert.equal(snap.hand.length,4);await fixture(frame,{hand:0,final:true});assert.equal(await page.evaluate(()=>currentMatch().result),'win');console.log('PASS KOF fresh four cards after 3/0 previous hand, cleanup, opponent continuity and third-general victory');
 await page.locator('#battleBack').click();frame=await launch('kof');snap=await fixture(frame,{side:0,hand:2,chain:true});console.log('CHAIN',snap.teams);assert.equal(snap.teams[0].index,1);assert.equal(snap.teams[1].index,1);assert.equal(snap.hand.length,4);assert.ok(snap.hand.every(id=>!snap.expected.includes(id)));
 snap=await fixture(frame,{side:0,hand:1,chain:true});assert.equal(snap.teams[0].index,2);assert.equal(snap.teams[1].index,2);await fixture(frame,{side:0,hand:0,chain:true,final:true});assert.equal(await page.evaluate(()=>currentMatch().result),'draw');console.log('PASS final simultaneous defeat is a draw');await page.locator('#battleBack').click();
 frame=await launch('bo3');const before=await page.evaluate(()=>state.business.lifetime.battlesWon);
 await fixture(frame,{hand:0,final:true});assert.equal(await page.evaluate(()=>currentMatch().wins),1);assert.equal(await page.evaluate(()=>state.business.lifetime.battlesWon),before);assert.equal(await page.locator('#battleNext').isVisible(),true);
 const previousGame=await page.evaluate(()=>activeBattle.gameId);await page.locator('#battleNext').click();frame=await waitEngine(previousGame);await fixture(frame,{hand:0,final:true});assert.equal(await page.evaluate(()=>currentMatch().wins),2);assert.equal(await page.evaluate(()=>currentMatch().status),'finished');assert.equal(await page.evaluate(()=>state.business.lifetime.battlesWon),before+1);
 await page.screenshot({path:output+'/bo3-v06.png'});console.log('PASS real BO3 engine 2:0 and one match-level win');
 assert.deepEqual(errors,[]);fs.writeFileSync(output+'/duel-v06-result.json',JSON.stringify({kofFreshFour:true,zeroOldHand:true,cleanup:true,opponentPreserved:true,thirdGeneralVictory:true,realShaDeathBoundary:true,chainDeathReplacement:true,simultaneousFinalDraw:true,bo3Engine:true,oneMatchReward:true,errors},null,2));await browser.close();console.log('ALL PASS');
})().catch(async e=>{console.error(e);await testBrowser?.close();process.exitCode=1;});
