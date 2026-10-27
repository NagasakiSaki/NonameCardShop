// Isolated REAL IndexedDB operation loop. --seconds 600 is opt-in, never a default test.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';
import {startShopServer} from '../../server.mjs';
import {argument} from '../lib/candidate-output.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),args=process.argv.slice(2);
const seconds=Number(argument(args,'seconds',600)),cards=Number(argument(args,'cards',1000)),tickMs=Number(argument(args,'tick-ms',500)),json=argument(args,'json',null);
if(!Number.isFinite(seconds)||seconds<0||!Number.isSafeInteger(cards)||cards<0)throw Error('seconds/cards 参数不正确');
if(json&&fs.existsSync(path.resolve(root,json)))throw Error('报告已存在，拒绝覆盖');
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const context=await browser.newContext(),page=await context.newPage();await page.exposeFunction('__soakCheckpoint',point=>console.log('SOAK '+JSON.stringify(point)));await page.goto(server.origin+'/data/backend-rules.json');
  const report=await page.evaluate(async({seconds,cards,tickMs})=>{
    const [{createRuntime},{memoryRepository,browserRepository},{validateMap,canStand},{validateWorld},{buildCatalog}]=await Promise.all([
      import('/modules/backend/runtime.mjs'),import('/modules/backend/storage.mjs'),import('/modules/backend/navigation.mjs'),import('/modules/backend/world.mjs'),import('/modules/backend/catalog.mjs')]);
    const [source,rules,...rawMaps]=await Promise.all(['/data/cards.json','/data/backend-rules.json','/assets/frontend/maps/store.json','/assets/frontend/maps/battle-room.json'].map(f=>fetch(f).then(r=>r.json()))),maps=rawMaps.map(validateMap),store=maps[0],catalog=buildCatalog(source,rules);
    const fixture=await createRuntime({source,rules,repository:memoryRepository()}),record=fixture.inspect();await fixture.disconnect();
    record.world.wallet.available=1000000;record.world.clock.speed=4;record.world.longTerm.loan.intro.status='acknowledged';record.world.dialogueOffer=null;record.world.seed=71231;
    Object.assign(record.world.player,{roomId:'store',...store.anchors['store.counter'],moving:false});
    for(let i=0;i<cards;i++){const c=catalog.cards[i%catalog.cards.length],ref='soak:card:'+i;record.world.items[ref]={inventoryRef:ref,ownerId:'player',kind:'card',cardKey:c.cardKey,printedRarity:'SR',printVersion:'soak',productId:c.pack,location:'collection',cost:0,protected:false,lock:null};}
    const database='operations-soak-'+crypto.randomUUID(),commits=[],counts={},perDay={},checkpoints=[],closedDays=[],reconnectNormalizations=[];
    const inner=browserRepository(indexedDB,database);await inner.commit(record,null);
    const repository={read:()=>inner.read(),close:()=>inner.close(),async commit(next,expected){const start=performance.now();await inner.commit(next,expected);commits.push(performance.now()-start);}};
    let host=await createRuntime({source,rules,maps,repository}),connection=await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'operations-soak'}),sequence=0,inputSeq=0;const seenEvents=new Set();
    const must=(r,label)=>{if(!r?.ok)throw Error(label+': '+JSON.stringify(r));return r.data;},q=async(name,p={})=>must(await host.query(name,p),name),cmd=async(type,payload={},extra={})=>must(await host.command({requestId:'soak-'+ ++sequence,type,payload,...extra}),type);
    function inspect(){const state=host.inspect().world;validateWorld(state);for(const event of state.log||[])if(!seenEvents.has(event.eventId)){seenEvents.add(event.eventId);counts[event.type]=(counts[event.type]||0)+1;if(event.type==='packSaleCompleted')perDay[event.day]=(perDay[event.day]||0)+event.amount;}return state;}
    async function moveTo(id){const anchor=store.anchors[id],target=[anchor,...[-16,16].flatMap(d=>[{x:anchor.x+d,y:anchor.y},{x:anchor.x,y:anchor.y+d}])].find(p=>canStand(store,p.x,p.y));if(!target)throw Error('站位不可达 '+id);
      host.world.input({sessionId:connection.sessionId,inputSeq:++inputSeq,roomId:'store',navVersion:store.navVersion,destination:{x:target.x,y:target.y}});
      for(let step=0;step<200;step++){const p=host.inspect().world.player;if(Math.hypot(p.x-target.x,p.y-target.y)<2){host.world.input({sessionId:connection.sessionId,inputSeq:++inputSeq,stop:true});return;}await host.advance(.5);inspect();}throw Error('走到柜台超时 '+id);
    }
    async function prepare(){await moveTo('store.counter');const product=(await q('products.list',{limit:200})).items.find(p=>p.availability==='available');if(!product)throw Error('无已解锁卡包');const quote=await q('products.quote',{productId:product.productId,unit:'pack',quantity:20});await cmd('supplier.placeOrder',{productId:product.productId,unit:'pack',quantity:20},{quoteId:quote.quoteId});inspect();
      await moveTo('store.retail');const refs=Object.values(host.inspect().world.items).filter(i=>i.ownerId==='player'&&i.kind==='pack'&&i.location==='stock').map(i=>i.inventoryRef);await cmd('retail.listAll',{inventoryRefs:refs});await cmd('business.open');inspect();}
    await prepare();
    // Separate foreground sample BEFORE any deliberately overlapping functional checks.
    const sampleStart=commits.length;for(let i=0;i<30;i++)await cmd('player.setFavorite',{cardKey:catalog.cards[0].cardKey,favorite:i%2===0});
    const foregroundCommits=commits.slice(sampleStart),utf8Estimate=new TextEncoder().encode(JSON.stringify(await inner.read())).length;
    const start=performance.now();let steps=0,nextCheckpoint=0;
    while(performance.now()-start<seconds*1000){
      const tick=performance.now();await host.advance(.5);steps++;let w=inspect();
      if(w.clock.phase==='closing'&&!w.matches.some(m=>m.status!=='finished')){
        const closed=await cmd('business.close');if((closed.report.sealedSales||0)!==(perDay[w.clock.day]||0))throw Error('销售账不符 '+w.clock.day);
        const present=host.inspect().world.npcs.filter(n=>!n.specialist&&!n.allyId&&n.presence!=='offsite');if(present.length)throw Error('打烊未清场：'+JSON.stringify(present.map(n=>({id:n.actorId,presence:n.presence,activity:n.activity,match:n.currentMatchId,room:n.currentRoomId,specialist:n.specialist,role:n.role,championId:n.championId}))));
        closedDays.push({day:w.clock.day,sales:perDay[w.clock.day]||0,report:closed.report});await cmd('business.nextDay');w=inspect();if(Object.values(w.items).some(i=>i.location==='trash'))throw Error('跨日垃圾未清空');await prepare();w=inspect();
      }
      if(performance.now()-start>=nextCheckpoint){const point={elapsedMs:performance.now()-start,day:w.clock.day,minute:w.clock.minute,phase:w.clock.phase,steps,items:Object.keys(w.items).length,onsite:w.npcs.filter(n=>n.presence==='onsite').length,commits:commits.length,sales:counts.packSaleCompleted||0,openings:counts.customerPacksOpened||0};checkpoints.push(point);await __soakCheckpoint(point);nextCheckpoint+=30000;}
      // Reconnect periodically through the same real database and compare the complete record.
      if(steps%150===0){const before=host.inspect();await host.disconnect();host=await createRuntime({source,rules,maps,repository});connection=await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'operations-soak-reconnect'});inputSeq=0;
        const changes=[];function compare(a,b,p=''){if(JSON.stringify(a)===JSON.stringify(b))return;if(a&&b&&typeof a==='object'&&typeof b==='object'){for(const key of new Set([...Object.keys(a),...Object.keys(b)]))compare(a[key],b[key],p+'.'+key);}else changes.push({path:p,before:a,after:b});}compare(before,host.inspect());
        const presentation=changes.filter(c=>/^\.world\.npcs\.\d+\.(x|y|navVersion|appearancePackVersion)$/.test(c.path));reconnectNormalizations.push(...presentation);
        const businessChanges=changes.filter(c=>!presentation.includes(c));if(businessChanges.length)throw Error('重连业务状态发生变化：'+JSON.stringify(businessChanges.slice(0,20)));}
      const wait=tickMs-(performance.now()-tick);if(wait>0)await new Promise(r=>setTimeout(r,wait));
    }
    const elapsedMs=performance.now()-start,final=inspect(),beforeLoad=structuredClone(final);
    const days=(await q('saves.days')).items;if(!days.length)throw Error('缺少日初档');const selected=days.at(-1),entry=host.inspect().archives.find(a=>a.id===selected.id);
    await cmd('saves.loadDay',{archiveId:selected.id});const rewound=host.inspect().world;
    if(rewound.clock.day!==selected.day||rewound.clock.minute!==480||rewound.clock.phase!=='preparing'||rewound.wallet.available!==entry.world.wallet.available||JSON.stringify(rewound.items)!==JSON.stringify(entry.world.items))throw Error('日初整世界回退失败');
    await host.disconnect();
    const stats=list=>{const s=[...list].sort((a,b)=>a-b);return {count:s.length,p50:s[Math.floor(s.length*.5)],p95:s[Math.floor(s.length*.95)],max:s.at(-1)};};
    if(seconds>=600&&(!closedDays.length||(counts.packSaleCompleted||0)<10||(counts.customerPacksOpened||0)<10))throw Error('长跑夹具没有形成真实成交/拆包负载');
    return {schema:1,requestedSeconds:seconds,elapsedMs,cards,fixture:{startingCash:1000000,speed:4,seed:71231,defaultCustomerBudgets:true,defaultTraffic:true,procurement:'20 packs per day through Host',maps:maps.map(m=>m.mapId)},steps,counts,closedDays,checkpoints,reconnectNormalizations,foregroundIndexedDBCommitMs:stats(foregroundCommits),allCommitMs:stats(commits),serializedUtf8Estimate:utf8Estimate,notDiskBytes:true,final:{day:beforeLoad.clock.day,items:Object.keys(beforeLoad.items).length,wallet:beforeLoad.wallet},dayStartRewind:true,passed:true,limitations:['仅真实浏览器 IndexedDB transaction complete，不是 fsync 或物理落盘指标','长期阶段是功能稳定性压力测试，可与回归并行；其耗时不作无竞争性能基线','NPC重连可校正坐标/导航版本/外观版本，这些差异单列，其他业务字段逐项相等','不进行玩家真实对局或高手胜负，相关路径由独立原生回归覆盖','不访问玩家 origin/存档；使用随机端口、新浏览器上下文、新数据库']};
  },{seconds,cards,tickMs});
  report.browser=browser.version();report.node=process.version;
  if(json){const file=path.resolve(root,json);fs.mkdirSync(path.dirname(file),{recursive:true});fs.writeFileSync(file,JSON.stringify(report,null,2)+'\n');}
  console.log(JSON.stringify({passed:report.passed,seconds:Math.round(report.elapsedMs/1000),days:report.closedDays.length,sales:report.counts.packSaleCompleted,openings:report.counts.customerPacksOpened,foregroundIndexedDBCommitMs:report.foregroundIndexedDBCommitMs,report:json},null,2));
}finally{await browser?.close();await server.close();}
