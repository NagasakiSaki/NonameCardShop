import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const output=process.env.CARD_SHOP_TEST_RESULTS||'.local/trade-card-detail';fs.mkdirSync(output,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1366,height:950}}),errors=[];
  page.on('pageerror',error=>errors.push(error.message));
  await page.goto(server.origin+'/data/backend-rules.json');
  await page.evaluate(async()=>{
    document.body.replaceChildren();document.body.style.margin='0';const mount=document.createElement('main');document.body.append(mount);
    const [{createWorld},{buildCatalog},{createRuntime},{memoryRepository},{createWindowManager},{openCardDetail}]=await Promise.all([
      import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs'),import('/modules/backend/runtime.mjs'),import('/modules/backend/storage.mjs'),
      import('/frontend/ui/window-manager.mjs'),import('/frontend-next/screens/card-detail.mjs')
    ]);
    const [source,rules]=await Promise.all(['/data/cards.json','/data/backend-rules.json'].map(url=>fetch(url).then(r=>r.json())));
    const catalog=buildCatalog(source,rules),world=createWorld(rules),card=catalog.activeCards.find(c=>c.skills.length>0);world.clock.phase='open';world.clock.minute=540;
    for(let i=0;i<3;i++)world.items['detail-card-'+i]={inventoryRef:'detail-card-'+i,ownerId:'player',kind:'card',cardKey:card.cardKey,printedRarity:i===0?'SSR':'N',printVersion:'test-v1',location:'collection',cost:10,protected:false,lock:i===2?'test-match-lock':null};
    world.stats[card.cardKey+'|doudizhu-bo3']={wins:12,losses:3,draws:1};world.stats[card.cardKey+'|kof']={wins:2,losses:4,draws:0};
    const raw=await createRuntime({source,rules,repository:memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true})});
    const connection=await raw.connect({contractVersion:'card-shop-ui/1.0',clientId:'detail-workspace-test'});let snapshot=connection.initialSnapshot;
    raw.subscribe(event=>{if(event.type==='snapshotUpdated'||event.type==='worldReset')snapshot=event.data;});
    window.__sourceCalls=0;window.__mainCalls=0;window.__failSource=true;
    const host={...raw,query:async(name,input)=>{
      const result=await raw.query(name,input);
      if(name==='catalog.detail'&&result.ok){
        if(input.includeCode){
          window.__sourceCalls++;
          if(window.__failSource){window.__failSource=false;return {ok:false,error:{code:'SOURCE_UNAVAILABLE',message:'isolated source error'}};}
          if(window.__blockSource){window.__blockSource=false;await new Promise(resolve=>window.__releaseSource=resolve);}
          result.data.skills[0].code='function skill() {\n  // <img src=x onerror="window.__detailXss=1">\n  return true;\n}';
        }else{
          window.__mainCalls++;
          if(window.__blockMain){window.__blockMain=false;await new Promise(resolve=>window.__releaseMain=resolve);}
        }
        result.data.skills[0].description='<img src=x onerror="window.__detailXss=1"> 文字技能说明';
      }
      return result;
    },command:async request=>{const result=await raw.command(request);if(window.__loseReply){window.__loseReply=false;throw Error('isolated reply loss');}return result;}};
    const app={host,snapshot:()=>snapshot,formatMoney:n=>Number.isSafeInteger(n)?'¤'+n:'—',goToInteraction:(...args)=>{window.__detailTravel=args;}};
    app.windows=createWindowManager({host,mount});window.__detailApp=app;window.__detailOpen=()=>openCardDetail(app,{cardKey:card.cardKey});
    window.__detailQuery=async(name,input={})=>{const r=await raw.query(name,input);if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
    window.__detailCommand=async(type,payload={})=>{const r=await raw.command({requestId:'detail-'+crypto.randomUUID(),type,payload});if(!r.ok)throw Error(JSON.stringify(r));return r.data;};
    window.__detailCardKey=card.cardKey;
    app.windows.open({id:'test-parent',title:'收藏父窗口',render:ctx=>{ctx.body.textContent='isolated collection parent';}});
    await openCardDetail(app,{cardKey:card.cardKey});
  });
  const active=()=>page.locator('[data-trade-workspace]').last();
  const query=(name,input={})=>page.evaluate(({name,input})=>__detailQuery(name,input),{name,input});
  const command=(type,payload={})=>page.evaluate(({type,payload})=>__detailCommand(type,payload),{type,payload});
  const wait=fn=>page.waitForFunction(fn,null,{timeout:12000});
  await active().getByRole('button',{name:'查看技能源码',exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>__sourceCalls),0,'default detail must not fetch code');
  assert.equal(await active().locator('pre').count(),0);
  assert.equal((await query('shop.snapshot')).clock.pauseReasons.length,2,'nested detail must keep both pause leases');
  assert.equal(await active().locator('.detail-skill img').count(),0);assert.equal(await page.evaluate(()=>window.__detailXss),undefined);
  assert.match(await active().locator('.detail-skill').first().innerText(),/<img src=x/,'skill text must be displayed literally');
  assert.deepEqual(await active().locator('[data-mode="doudizhu-bo3"] td').allTextContents(),['16','12','3','1']);
  assert.deepEqual(await active().locator('[data-mode="kof"] td').allTextContents(),['6','2','4','0']);
  const hero=await active().locator('.hero-art').boundingBox();assert.ok(hero.width>=300&&hero.height>=400);
  await active().getByRole('button',{name:'查看技能源码',exact:true}).click();await active().getByRole('button',{name:'重试加载技能源码',exact:true}).waitFor();
  assert.match(await active().locator('[aria-label="技能源码"]').innerText(),/isolated source error/);
  await active().getByRole('button',{name:'重试加载技能源码',exact:true}).click();await active().locator('pre').waitFor();
  assert.match(await active().locator('pre').innerText(),/function skill\(\)/);assert.equal(await active().locator('pre img').count(),0);assert.equal(await page.evaluate(()=>window.__detailXss),undefined);
  assert.equal(await active().locator('pre').evaluate(node=>getComputedStyle(node).whiteSpace),'pre');
  const sourceCalls=await page.evaluate(()=>__sourceCalls);await active().getByRole('button',{name:'收起技能源码',exact:true}).click();await active().getByRole('button',{name:'查看技能源码',exact:true}).click();
  assert.equal(await page.evaluate(()=>__sourceCalls),sourceCalls,'showing cached source must not refetch');
  const copy=()=>active().locator('[data-copy-ref="detail-card-0"]');
  await page.evaluate(()=>window.__loseReply=true);await copy().getByRole('button',{name:'保护这张',exact:true}).click();
  await active().getByRole('button',{name:'查询原操作结果',exact:true}).waitFor();
  assert.equal((await query('catalog.detail',{cardKey:await page.evaluate(()=>__detailCardKey)})).copies.find(copy=>copy.inventoryRef==='detail-card-0').protected,true);
  await active().getByRole('button',{name:'查询原操作结果',exact:true}).click();await copy().getByRole('button',{name:'取消保护',exact:true}).waitFor();
  assert.equal(await copy().getByRole('button',{name:'在二级市场出售这张',exact:true}).isEnabled(),false);
  assert.equal(await active().locator('[data-copy-ref="detail-card-2"]').getByRole('button',{name:'保护这张',exact:true}).isEnabled(),false);
  await copy().getByRole('button',{name:'取消保护',exact:true}).click();await copy().getByRole('button',{name:'保护这张',exact:true}).waitFor();
  const archive=await command('saves.create');await command('saves.load',{archiveId:archive.archiveId});await active().getByRole('button',{name:'查看技能源码',exact:true}).waitFor();
  assert.equal(await active().locator('pre').count(),0,'world reset must clear old source');
  await page.evaluate(()=>window.__blockSource=true);await active().getByRole('button',{name:'查看技能源码',exact:true}).click();await wait(()=>typeof __releaseSource==='function');
  await command('saves.load',{archiveId:archive.archiveId});await active().getByRole('button',{name:'查看技能源码',exact:true}).waitFor();
  await page.evaluate(async()=>{__releaseSource();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await active().locator('pre').count(),0,'old branch source result must not reappear');
  await page.setViewportSize({width:406,height:900});const narrow=await active().locator('.hero-art').boundingBox();assert.ok(narrow.width<=406&&narrow.height>300);
  await page.screenshot({path:path.join(output,'detail-narrow.png'),fullPage:true});
  await copy().getByRole('button',{name:'在二级市场出售这张',exact:true}).click();
  assert.deepEqual(await page.evaluate(()=>__detailTravel),['store.secondaryMarket','market',{tab:'sell',inventoryRef:'detail-card-0'}]);
  assert.equal((await query('shop.snapshot')).clock.pauseReasons.length,1,'closing detail must retain the parent pause lease');
  await page.evaluate(()=>{window.__blockMain=true;return __detailOpen();});await wait(()=>typeof __releaseMain==='function');
  await page.evaluate(async()=>{__detailApp.windows.closeTop();__releaseMain();await new Promise(resolve=>setTimeout(resolve,0));});
  assert.equal(await page.locator('[data-trade-workspace]').count(),0,'late closed-window detail response must be ignored');
  assert.equal((await query('shop.snapshot')).clock.pauseReasons.length,1);
  assert.deepEqual(errors,[]);await page.evaluate(()=>__detailApp.host.disconnect());
  console.log('PASS card detail: original image size, lazy/retry/plain-text source, readable literal skills, real BO3/KOF stats, nested pause, protection and unknown-result recovery, locked copies, world-reset/late-source invalidation, actual sell reference and closed-window replies.');
}finally{await browser?.close();await server.close();}
