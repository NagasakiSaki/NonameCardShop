import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/core4-ui';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];page.setDefaultTimeout(20000);
  page.on('pageerror',e=>{errors.push(e.message);console.log('PAGE ERROR',e.message);});page.on('dialog',d=>d.accept());
  page.on('console',m=>{if(m.type()==='error'&&m.text().includes('营业时钟'))console.log('CLOCK ERROR',m.text());});
  const q=(name,p={})=>page.evaluate(async({name,p})=>{const r=await __cardShopApp.query(name,p);if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{name,p});
  const c=(type,payload={})=>page.evaluate(async({type,payload})=>{const r=await __cardShopApp.command({requestId:'core4-ui-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;},{type,payload});
  const close=()=>page.evaluate(()=>__cardShopApp.windows.closeAll());
  async function until(predicate,ms=60000){const end=Date.now()+ms;while(!await predicate()){if(Date.now()>end)throw Error('等待实际业务状态超时');await page.waitForTimeout(80);}}
  async function go(id,panel,options={}){await page.evaluate(({id,panel,options})=>__cardShopApp.goToInteraction(id,panel,options),{id,panel,options});await page.locator('.facility-window').last().waitFor();}
  async function fit(label){
    const sizes=await page.evaluate(()=>{const win=__cardShopApp.windows.stack.at(-1).handle.element;return [...win.querySelectorAll('.f6-main,.f6-foot,.pbc-body,.pbc-detail,.fast07-picker__body,.fast07-skill-panel,.fast07-selected-slots')].filter(e=>e.getClientRects().length).map(e=>({class:e.className,w:e.clientWidth,sw:e.scrollWidth,h:e.clientHeight,sh:e.scrollHeight}));});
    await page.screenshot({path:out+'/'+label+'.png'});
    assert.ok(sizes.every(s=>s.sh<=s.h+2&&s.sw<=s.w+2),label+': '+JSON.stringify(sizes));assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),label+' page width');
  }
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
  assert.equal((await q('player.starterGift')).quantity,1);
  await go('store.counter','supplier');await page.locator('[data-purchase-root] .f6-tile').first().waitFor();
  const product=(await q('products.list',{limit:200})).items.find(p=>p.availability==='available');assert.ok(product.prices.pack.wholesale<=210);
  for(let i=0;i<3;i++)await page.locator('[data-purchase-root] .pbc-stepper button').last().click();
  await page.evaluate(()=>{const send=__cardShopApp.host.command;let lose=true;__cardShopApp.host.command=async request=>{const r=await send(request);if(lose&&request.type==='supplier.placeBasketOrder'&&r.ok){lose=false;throw Error('fixture response lost after commit');}return r;};});
  await page.getByRole('button',{name:'购买',exact:true}).click();await page.getByRole('button',{name:'查看结果',exact:true}).click();await page.locator('[data-purchase-receipt]').waitFor();
  assert.equal((await q('supplier.orders')).items[0].status,'received');assert.equal((await q('supplier.orders')).items.length,1);
  await fit('purchase-receipt');await page.getByRole('button',{name:'去仓库看看',exact:true}).click();await page.locator('[data-warehouse-root]').waitFor();assert.match(await page.locator('[data-warehouse-root]').innerText(),/开店赠礼/);await fit('warehouse');
  await close();await go('store.opening','opening');await page.getByRole('button',{name:'开一盒',exact:true}).click();await page.getByRole('button',{name:'确认开包',exact:true}).click();await page.locator('[data-opening-result]').waitFor();assert.equal((await q('inventory.list',{kind:'card'})).total,120);
  for(const size of [{width:1440,height:900},{width:1280,height:720},{width:406,height:1000}]){await page.setViewportSize(size);await page.waitForTimeout(120);await fit('opening-'+size.width);}
  await close();await go('store.opening','opening');await page.locator('[data-opening-result]').waitFor();assert.equal((await q('inventory.list',{kind:'card'})).total,120,'reopening results does not open more packs');
  await close();await page.setViewportSize({width:1440,height:900});await go('store.secondaryMarket','market',{tab:'collection'});await page.locator('[data-card-grid] [data-card]').first().waitFor();assert.ok(await page.locator('[data-card-grid] [data-card]').count()<=8);await fit('market');
  await page.getByRole('button',{name:'确认单卡上架',exact:true}).click();await until(async()=>(await q('market.list',{tab:'mine'})).total===1);
  await close();await go('store.trash','trash');await page.getByRole('button',{name:/选择收藏卡丢弃/}).click();await fit('trash');await close();
  await go('store.retail','supplier',{purchaseTab:'retail'});await page.locator('[data-facility-root="retail"] .f6-root').waitFor();await fit('retail');await close();
  await go('store.checkout','supplier',{interaction:'store.checkout'});await page.locator('[data-facility-root="checkout"] .f6-root').waitFor();assert.equal(await page.locator('[data-facility-root="retail"]').count(),0);await close();
  await c('business.open');
  async function seedEngineFixture(available=true){
    const archive=JSON.parse((await c('saves.export')).content),w=archive.world;w.rules.npcAutoBattles=false;w.nextNpcMinute=10000;
    w.npcs.push({actorId:'ui-engine-npc-'+crypto.randomUUID(),name:'牌友测试',appearanceId:'competitor',wallet:{available:1000},presence:available?'onsite':'offsite',roomId:'battle-room',x:376,y:120,activity:'idle',moving:false,direction:'down',visit:{elapsedSeconds:0,idleSeconds:90,issues:[]}});
    const npc=w.npcs.at(-1);for(const owner of ['player',npc.actorId])for(const id of owner==='player'?['caocao','liubei','sunquan']:['zhangliao','xuzhu','xiahoudun']){
      const cardKey='noname-1.11.6:'+id,ref='ui-'+owner+'-'+id;w.items[ref]={inventoryRef:ref,kind:'card',ownerId:owner,cardKey,printedRarity:'R',printVersion:'ui-test',location:'collection',cost:1,protected:false,lock:null};if(owner!=='player')w.circulation[cardKey]={day:w.clock.day,source:'isolated-ui-fixture'};
    }
    for(const n of w.npcs)if(n.actorId!==npc.actorId)n.nextMatchAt=10000;
    await c('saves.import',{content:JSON.stringify(archive)});await page.reload();await page.waitForFunction(()=>window.__cardShopReady===true);
  }
  async function selectTeam(mode,waitingOnly=false){
    await go('battleRoom.service','combat');await page.getByRole('button',{name:'选择武将 / 调整阵容',exact:true}).click();await page.locator('[data-card-ref]').first().waitFor();
    await page.getByRole('button',{name:mode==='bo3'?'BO3 单将决斗':'KOF 三将接力',exact:true}).click();
    for(const id of mode==='bo3'?['caocao']:['caocao','liubei','sunquan']){await page.getByPlaceholder('搜索武将姓名…').fill('noname-1.11.6:'+id);await page.locator('[data-card-ref="ui-player-'+id+'"]').click();}
    if(!(await q('player.favorites')).cardKeys.includes('noname-1.11.6:'+(mode==='bo3'?'caocao':'sunquan')))await page.locator('[data-card-ref="ui-player-'+(mode==='bo3'?'caocao':'sunquan')+'"] .fast07-card-tile__fav-btn').click();
    await until(async()=>(await q('player.favorites')).cardKeys.length>0);
    await page.getByPlaceholder('搜索武将姓名…').fill('');
    for(const size of [{width:1440,height:900},{width:1366,height:768},{width:1280,height:720},{width:1024,height:768},{width:406,height:1000}]){await page.setViewportSize(size);await page.waitForTimeout(120);await fit('picker-'+mode+'-'+size.width);}
    await page.setViewportSize({width:1440,height:900});await page.getByRole('button',{name:'确认出战阵容',exact:true}).click();
    assert.equal(await page.locator('#windows .window').count(),1,'picker closes once and preserves the parent');
    await page.getByRole('button',{name:'开始等待对手 (进入候战)',exact:true}).click();
    try{await page.waitForFunction(()=>__cardShopApp.windows.depth===0);}catch(error){console.log('LOBBY ERROR',await page.locator('#windows').innerText());throw error;}
    if(waitingOnly)return;
    try{await until(async()=>(await q('combat.queue')).playerMatch?.status==='prepared');}
    catch(error){console.log('QUEUE DIAGNOSTIC',JSON.stringify({queue:await q('combat.queue'),clock:(await q('shop.snapshot')).clock,people:await q('management.people'),room:await q('room.snapshot')}));throw error;}
    assert.equal((await q('shop.snapshot')).clock.pauseReasons.length,0,'prepared match does not freeze store exploration');
    await page.getByRole('button',{name:'继续牌局',exact:true}).click();await page.locator('#battle-mount iframe').waitFor();
    await until(async()=>{const m=(await q('room.snapshot')).matches.findLast(m=>!m.background);return m.status==='running'&&!!m.gameId&&m.lastReadyGameId===m.gameId;});
    const frame=await page.locator('#battle-mount iframe').elementHandle().then(h=>h.contentFrame());await frame.waitForURL(url=>url.searchParams.get('packer')==='1');await frame.waitForLoadState('domcontentloaded');
    try{await frame.evaluate(async()=>{window.__engine=await import('/noname.js');});}
    catch(error){console.log('ENGINE LOAD DIAGNOSTIC',JSON.stringify({frames:page.frames().map(f=>f.url()),room:await q('room.snapshot'),text:(await page.locator('#windows').innerText()).slice(0,1200)}));throw error;}
    await frame.waitForFunction(()=>window.__engine?.lib?.config&&__engine.game?.shopDuel&&__engine._status.imchoosing,null,{timeout:30000});await frame.evaluate(()=>__engine.lib.config.game_speed='vvfast');return frame;
  }
  async function kill(frame,side,checkpoint=false){
    await frame.evaluate(async({side,checkpoint})=>{
      const {game,ui,_status}=window.__engine;game.uiCheckpoint=null;
      const event=game.createEvent('core4UiBoundary',false);event.forceDie=true;event.setContent(async()=>{
        const team=game.shopDuel.teams[side],player=team.player;await player.discard(player.getCards('hejsx'));const cards=[game.createCard('sha','spade',7),game.createCard('shan','heart',2)];player.directgain(cards);const expected=cards.map(c=>c.cardid);await player.die();
        if(checkpoint){const record=()=>{game.uiCheckpoint={expected,hand:player.getCards('h').map(c=>c.cardid),index:team.index};game.pause();};if(game.shopDuel.scheduled){const anchor=game.shopDuel.boundaryAnchor,next=game.createEvent('core4UiCheckpoint',false,anchor);anchor.next.remove(next);anchor.after.push(next);next.forceDie=true;next.setContent(async()=>record());}else record();}
      });if(!_status.auto)ui.click.auto();game.resume();
    },{side,checkpoint});
    if(checkpoint){const result=await frame.waitForFunction(()=>__engine.game.uiCheckpoint,null,{timeout:20000}).then(h=>h.jsonValue());assert.equal(result.hand.length,4,'KOF successor draws four new cards');assert.ok(result.hand.every(id=>!result.expected.includes(id)),'old hand is discarded, never inherited');return result;}
  }
  await seedEngineFixture(false);await selectTeam('bo3',true);assert.ok((await q('combat.queue')).player);
  const player=()=>page.evaluate(()=>{const p=__cardShopApp.getPlayer();return {x:p.x,y:p.y};}),before=await player(),minuteWaiting=(await q('shop.snapshot')).clock.minute;
  await page.keyboard.down('ArrowDown');await page.waitForTimeout(500);await page.keyboard.up('ArrowDown');assert.ok(Math.hypot((await player()).x-before.x,(await player()).y-before.y)>5,'waiting does not capture movement');assert.ok((await q('shop.snapshot')).clock.minute>minuteWaiting);
  await page.getByRole('button',{name:'自动走动：关',exact:true}).click();await until(async()=>(await q('combat.queue')).player?.waitMode==='wander');await page.keyboard.down('ArrowLeft');await page.waitForTimeout(220);await page.keyboard.up('ArrowLeft');await until(async()=>(await q('combat.queue')).player?.waitMode==='manual');
  await page.getByRole('button',{name:'取消等待',exact:true}).click();await until(async()=>!(await q('combat.queue')).player);assert.equal((await q('inventory.list',{kind:'card'})).items.filter(i=>i.lock).length,0,'cancel releases player cards');
  await seedEngineFixture();let frame=await selectTeam('bo3');let startMinute=(await q('shop.snapshot')).clock.minute;
  await kill(frame,1);await page.getByRole('button',{name:'开始下一局',exact:true}).waitFor();assert.equal((await q('shop.snapshot')).clock.minute,startMinute);
  await page.getByRole('button',{name:'开始下一局',exact:true}).click();await until(async()=>{const m=(await q('room.snapshot')).matches.findLast(m=>!m.background);return m.status==='running'&&!!m.gameId&&m.lastReadyGameId===m.gameId;});
  frame=await page.locator('#battle-mount iframe').elementHandle().then(h=>h.contentFrame());await frame.evaluate(async()=>window.__engine=await import('/noname.js'));await frame.waitForFunction(()=>__engine._status.imchoosing);await kill(frame,1);
  await page.getByRole('heading',{name:'本场获胜',exact:true}).waitFor();assert.equal((await q('shop.snapshot')).clock.minute,startMinute+30);await page.getByRole('button',{name:'返回店铺',exact:true}).click();
  await seedEngineFixture();frame=await selectTeam('kof');startMinute=(await q('shop.snapshot')).clock.minute;
  assert.equal((await kill(frame,0,true)).index,1);assert.equal((await kill(frame,1,true)).index,1);assert.equal((await kill(frame,1,true)).index,2);await kill(frame,1);
  await page.getByRole('heading',{name:'本场获胜',exact:true}).waitFor();assert.equal((await q('shop.snapshot')).clock.minute,startMinute+30);assert.deepEqual(errors,[]);
  console.log('PASS CORE4 UI: real isolated procurement/lost-response receipt, gift-box opening, independent warehouse/retail/checkout/market/trash, bounded five-size picker/skills/favorites/multiple selection, real-engine BO3 and KOF controlled terminal fixtures, fresh four-card replacement and one-time thirty-minute settlement.');
}finally{await browser?.close();await server.close();}
