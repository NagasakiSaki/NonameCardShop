import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {listingAmount,cardsQuery} from '../frontend-next/screens/cards.mjs';

for(const value of ['0','-1','1.1','1e2','Infinity','','1000001','abc'])assert.throws(()=>listingAmount(value),/整数游戏币/);
assert.equal(listingAmount(' 204 '),204);
assert.deepEqual(cardsQuery('sell',{search:' 燕 ',rarity:'SR'},'24'),{name:'inventory.list',input:{search:'燕',rarity:'SR',cursor:'24',limit:24,grouped:true,kind:'card',location:'collection'}});
assert.equal(cardsQuery('inventory',{search:'',rarity:'',filter:'protected',sort:'name'}).input.filter,'protected');

const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/trade-cards';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:900}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.origin+'/data/backend-rules.json');
  await page.evaluate(async()=>{
    document.body.replaceChildren();const mount=document.createElement('main');document.body.append(mount);
    const [{createWorld},{buildCatalog},{placeListing},{createRuntime},{memoryRepository},{createWindowManager},{openCards,openCollection}]=await Promise.all([
      import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs'),import('/modules/backend/trading.mjs'),import('/modules/backend/runtime.mjs'),
      import('/modules/backend/storage.mjs'),import('/frontend/ui/window-manager.mjs'),import('/frontend-next/screens/cards.mjs')
    ]);
    const [source,rules]=await Promise.all(['/data/cards.json','/data/backend-rules.json'].map(url=>fetch(url).then(r=>r.json())));
    rules.startingCash=50000;window.__marketFee=rules.marketFee;const catalog=buildCatalog(source,rules),world=createWorld(rules);world.clock.phase='open';world.clock.minute=540;
    const marketCards=catalog.activeCards.filter(c=>['SR','SSR'].includes(c.currentRarity));
    world.npcs.push({actorId:'test-npc',name:'Alex',appearanceId:'novice',wallet:{available:50000},roomId:'store',x:240,y:240,direction:'down',moving:false,activity:'idle'});
    for(let i=0;i<72;i++){
      const c=marketCards[i%32],ref='test-card-'+i;
      world.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:'test-v1',location:'collection',cost:10,protected:i===0,lock:null};
    }
    for(let i=0;i<4;i++){
      const c=marketCards[40+i],ref='test-npc-card-'+i;
      world.items[ref]={inventoryRef:ref,ownerId:'test-npc',kind:'card',cardKey:c.cardKey,printedRarity:c.currentRarity,printVersion:'test-v1',location:'collection',cost:10,protected:false,lock:null};
      placeListing(world,catalog,world.items[ref],50+i);
    }
    placeListing(world,catalog,world.items['test-card-1'],75);
    const raw=await createRuntime({source,rules,repository:memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true})});
    const connection=await raw.connect({contractVersion:'card-shop-ui/1.0',clientId:'cards-workspace-test'});let snapshot=connection.initialSnapshot;
    raw.subscribe(event=>{if(event.type==='snapshotUpdated'||event.type==='worldReset')snapshot=event.data;});
    const host={...raw,query:async(name,input)=>{const result=await raw.query(name,input);if(name==='inventory.list'&&window.__blockRead){window.__blockRead=false;await new Promise(resolve=>window.__releaseRead=resolve);}return result;},command:async request=>{const result=await raw.command(request);if(window.__loseReply){window.__loseReply=false;throw Error('isolated reply loss');}return result;}};
    const app={host,near:true,snapshot:()=>snapshot,formatMoney:n=>Number.isSafeInteger(n)?'¤'+n:'—',isNearInteraction:()=>app.near,
      openPanel:(kind,options)=>{window.__lastPanel={kind,options};},goToInteraction:(...args)=>{window.__lastTravel=args;},refreshSnapshot:async()=>{snapshot=(await raw.query('shop.snapshot')).data;}};
    app.windows=createWindowManager({host,mount});window.__cardsApp=app;window.__cardsOpen=()=>openCards(app);window.__collectionOpen=()=>openCollection(app);
    window.__cardsQuery=async(name,input={})=>{const r=await raw.query(name,input);if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
    window.__cardsCommand=async(type,payload={})=>{const r=await raw.command({requestId:'test-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
    await openCollection(app);
  });
  const query=(name,input={})=>page.evaluate(({name,input})=>__cardsQuery(name,input),{name,input});
  const command=(type,payload={})=>page.evaluate(({type,payload})=>__cardsCommand(type,payload),{type,payload});
  const active=()=>page.locator('[data-trade-workspace]').last();
  const wait=fn=>page.waitForFunction(fn,null,{timeout:12000});
  await wait(()=>document.querySelector('[data-trade-workspace]')?.shadowRoot.querySelectorAll('[data-card]').length===24);
  const total=(await query('inventory.list',{grouped:true})).total;assert.ok(total>24);
  await active().getByRole('button',{name:'加载更多',exact:true}).click();await wait(()=>document.querySelector('[data-trade-workspace]').shadowRoot.querySelectorAll('[data-card]').length>24);
  assert.equal(await active().locator('[data-card]').count(),total);
  await active().getByLabel('收藏状态筛选').selectOption('protected');await wait(()=>document.querySelector('[data-trade-workspace]').shadowRoot.querySelectorAll('[data-card]').length===1);
  assert.match(await active().evaluate(node=>node.shadowRoot.textContent),/受保护/);assert.equal(await active().getByRole('button',{name:'确认单卡上架',exact:true}).count(),0);
  await page.evaluate(()=>__cardsApp.windows.closeAll());await page.evaluate(()=>__collectionOpen());
  await active().getByLabel('收藏状态筛选').waitFor();assert.equal(await active().getByLabel('收藏状态筛选').inputValue(),'protected');
  await page.evaluate(()=>__cardsApp.windows.closeAll());await page.evaluate(()=>__cardsOpen());
  await active().getByRole('button',{name:'获取买入报价',exact:true}).waitFor();
  const balance=(await query('shop.snapshot')).wallet.available,buy=(await query('market.list',{tab:'buy'})).items[0];
  await active().getByRole('button',{name:'获取买入报价',exact:true}).click();await active().getByRole('button',{name:'确认买入',exact:true}).waitFor();
  assert.equal((await query('shop.snapshot')).wallet.available,balance,'quote must not buy a card');
  await page.evaluate(()=>window.__loseReply=true);await active().getByRole('button',{name:'确认买入',exact:true}).click();
  await active().getByRole('button',{name:'查询原操作结果',exact:true}).waitFor();const cashAfter=balance-buy.unitAmount+Math.floor(buy.unitAmount*await page.evaluate(()=>__marketFee));assert.equal((await query('shop.snapshot')).wallet.available,cashAfter);
  await active().getByRole('button',{name:'用原操作号重试',exact:true}).click();await active().getByRole('button',{name:'查询原操作结果',exact:true}).waitFor({state:'hidden'});
  assert.equal((await query('shop.snapshot')).wallet.available,cashAfter,'reply loss recovery must not buy twice');
  const quoteArchive=await command('saves.create');
  await active().getByRole('button',{name:'获取买入报价',exact:true}).click();await active().getByRole('button',{name:'确认买入',exact:true}).waitFor();
  await command('saves.load',{archiveId:quoteArchive.archiveId});await active().getByRole('button',{name:'确认买入',exact:true}).waitFor({state:'hidden'});
  assert.equal((await query('shop.snapshot')).wallet.available,cashAfter,'loading a branch must discard an unconfirmed quote');
  await active().getByRole('button',{name:'我的出售',exact:true}).click();await active().getByRole('button',{name:'撤回此挂单',exact:true}).click();await wait(()=>__cardsQuery('market.list',{tab:'mine'}).then(data=>data.total===0));
  await active().getByRole('button',{name:'出售收藏',exact:true}).click();await active().getByRole('button',{name:'确认单卡上架',exact:true}).waitFor();
  const targetRef=await active().getByLabel('待出售实物').inputValue();assert.notEqual(targetRef,'test-card-0','protected first copy must never be selected for listing');
  await active().getByLabel('单卡上架售价').fill('127');await active().getByRole('button',{name:'确认单卡上架',exact:true}).click();
  await wait(()=>__cardsQuery('market.list',{tab:'mine'}).then(data=>data.items.some(row=>row.unitAmount===127)));
  assert.equal((await query('market.list',{tab:'mine'})).items.find(row=>row.unitAmount===127).inventoryRef,targetRef);
  await active().getByRole('button',{name:'留一，其余上架',exact:true}).click();await active().getByRole('button',{name:'确认批量上架',exact:true}).waitFor();
  const expected=await query('inventory.surplusPreview');const listedBefore=(await query('market.list',{tab:'mine'})).total;
  assert.ok(expected.newListings>0);assert.match(await active().evaluate(node=>node.shadowRoot.textContent),/范围：全部收藏/);assert.equal((await query('market.list',{tab:'mine'})).total,listedBefore);
  const archive=await command('saves.create');await command('saves.load',{archiveId:archive.archiveId});
  await active().getByRole('button',{name:'确认批量上架',exact:true}).waitFor({state:'hidden'});
  await active().getByRole('button',{name:'留一，其余上架',exact:true}).click();await active().getByRole('button',{name:'确认批量上架',exact:true}).click();
  await wait(()=>__cardsQuery('market.list',{tab:'mine'}).then(data=>data.total>1));
  assert.equal((await query('market.list',{tab:'mine'})).total,listedBefore+expected.newListings);
  assert.equal((await query('inventory.list',{grouped:true,filter:'protected'})).items[0].protected,1);
  await active().getByRole('button',{name:'收购报价',exact:true}).click();await active().getByRole('button',{name:'行情记录',exact:true}).click();
  await wait(()=>document.querySelector('[data-trade-workspace]').shadowRoot.querySelectorAll('[data-card]').length>0);
  assert.match(await active().evaluate(node=>node.shadowRoot.textContent),/历史成交价不代表当前可买价格/);
  await page.setViewportSize({width:406,height:900});await page.evaluate(()=>__cardsApp.near=false);
  await active().getByRole('button',{name:'买卡',exact:true}).click();await active().getByRole('button',{name:'获取买入报价',exact:true}).waitFor();assert.equal(await active().getByRole('button',{name:'获取买入报价',exact:true}).isEnabled(),false);
  await active().getByRole('button',{name:'前往二级市场柜台',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>__lastTravel.slice(0,2)),['store.secondaryMarket','market']);assert.equal(await page.locator('[data-trade-workspace]').count(),0);
  await page.evaluate(()=>{window.__blockRead=true;return __collectionOpen();});await wait(()=>typeof __releaseRead==='function');
  await page.evaluate(async()=>{__cardsApp.windows.closeAll();__releaseRead();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await page.locator('[data-trade-workspace]').count(),0,'late reads must not recreate a closed workspace');
  await page.evaluate(()=>{__cardsApp.near=true;return __cardsOpen();});await active().getByRole('button',{name:'获取买入报价',exact:true}).waitFor();
  await page.screenshot({path:path.join(output,'formal-market.png'),fullPage:true});assert.deepEqual(errors,[]);
  await page.evaluate(()=>__cardsApp.host.disconnect());
  console.log('PASS formal cards: guarded integer price, paginated grouped collection, saved filters, protected-copy references, buy quote/confirm, original-ID retry after reply loss, listing/cancel, authoritative surplus preview, read-branch invalidation, real history, counter travel and closed-window cleanup.');
}finally{await browser?.close();await server.close();}
