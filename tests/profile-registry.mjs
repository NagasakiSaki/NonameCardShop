// tests/profile-registry.mjs — 单个存档库打不开时，存档目录仍可用（OPT-08）。
//
// 场景：某个卡店的 IndexedDB 打不开（被别的页面占用、磁盘错误、结构损坏）。
// 修复前 list() 整体 reject，玩家连其他健康卡店都进不去。
// 现在只把这一条标成不可读，其他卡店照常列出，且不清理任何数据。
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';

const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();
  const page=await browser.newPage();
  await page.goto(server.origin+'/frontend/index.html?mode=mock');
  const result=await page.evaluate(async()=>{
    const {profileRegistry}=await import('/modules/backend/profiles.mjs');
    const {browserRepository}=await import('/modules/backend/storage.mjs');
    const registry=profileRegistry();
    const healthy=await registry.create('健康卡店'),broken=await registry.create('坏掉的卡店');
    // 给健康卡店写入一份可读世界头，证明它的数据在故障后仍然可读。
    const repo=browserRepository(indexedDB,'noname-card-shop-'+healthy.profileId);
    await repo.commit({revision:0,world:{worldId:'w-healthy',branchId:'b-healthy',clock:{day:3,minute:480,phase:'open'},wallet:{available:1234}},archives:[]},null);
    await repo.close();

    // 只让坏掉那间卡店的库打不开，其余照常走真实 IndexedDB。
    const failing={open(name,...rest){if(name==='noname-card-shop-'+broken.profileId)throw Error('模拟：存档库被占用或损坏');return indexedDB.open(name,...rest);}};
    const partial=profileRegistry(failing);
    let listError=null,rows=[],directFails=false;
    try{rows=await partial.list();}catch(error){listError=error.message;}
    // 对照：直接读这一间（不经过容错）确实会失败——证明失败是真的，容错发生在 list()。
    try{await partial.days(broken.profileId);}catch{directFails=true;}
    await partial.close();

    const byId=Object.fromEntries(rows.map(row=>[row.profileId,row]));
    const healthyRow=byId[healthy.profileId],brokenRow=byId[broken.profileId];
    // 坏掉的数据没有被删除：用正常注册表重新读，条目仍在。
    const after=await registry.get(broken.profileId);
    const relisted=await registry.list();

    // 检查真实菜单按钮；第三个参数是主按钮样式，不能拿它代替 disabled。
    const {showStartMenu}=await import('/frontend/ui/start-menu.mjs');
    const originalOpen=indexedDB.open;
    let starts=0,disposeMenu,menu;
    try{
      indexedDB.open=function(name,...rest){
        if(name==='noname-card-shop-'+broken.profileId)throw Error('模拟：存档读取失败');
        return originalOpen.call(this,name,...rest);
      };
      disposeMenu=await showStartMenu({onStart:()=>{starts+=1;}});
      const card=document.querySelector(`[data-profile-id="${broken.profileId}"]`);
      const buttons=[...card.querySelectorAll('button')];
      const resume=buttons.find(b=>b.textContent==='继续当前进度');
      const days=buttons.find(b=>b.textContent==='选择日期读档');
      menu={resumeDisabled:resume.disabled,daysDisabled:days.disabled};
      resume.click();
      await new Promise(resolve=>setTimeout(resolve,0));
      menu.starts=starts;
    }finally{disposeMenu?.();indexedDB.open=originalOpen;}

    // 数据库打开成功，但世界头的嵌套字段损坏，同样不能拖垮健康卡店。
    const malformed=await registry.create('结构损坏的卡店');
    const malformedRepo=browserRepository(indexedDB,'noname-card-shop-'+malformed.profileId);
    await malformedRepo.commit({revision:0,world:{worldId:'w-malformed'},archives:[]},null);
    await malformedRepo.close();
    let malformedError=null,malformedRows=[];
    try{malformedRows=await registry.list();}catch(error){malformedError=error.message;}
    const stillMalformed=browserRepository(indexedDB,'noname-card-shop-'+malformed.profileId);
    const storedMalformed=await stillMalformed.read();
    await stillMalformed.close();
    await registry.close();
    return {
      listError,
      directFails,
      rowCount:rows.length,
      healthy:{ok:healthyRow?.ok,phase:healthyRow?.phase,cash:healthyRow?.cash,day:healthyRow?.day,worldId:healthyRow?.worldId},
      broken:{ok:brokenRow?.ok,phase:brokenRow?.phase,unreadable:brokenRow?.unreadable,hasMessage:typeof brokenRow?.message==='string'&&brokenRow.message.length>0},
      stillExists:Boolean(after),
      relistedIds:relisted.map(row=>row.profileId).sort(),
      menu,
      malformedError,
      malformedRow:malformedRows.find(row=>row.profileId===malformed.profileId),
      healthyAfterMalformed:malformedRows.find(row=>row.profileId===healthy.profileId)?.worldId,
      malformedPreserved:storedMalformed?.world?.worldId==='w-malformed',
    };
  });

  assert.equal(result.listError,null,'单个存档损坏不能让整个目录失败');
  assert.equal(result.directFails,true,'对照：直接读取该库确实会失败，容错只发生在目录读取');
  assert.equal(result.rowCount,2);
  assert.deepEqual(result.healthy,{ok:true,phase:'open',cash:1234,day:3,worldId:'w-healthy'},'健康卡店必须照常可读');
  assert.deepEqual(result.broken,{ok:false,phase:'unreadable',unreadable:'STORAGE_ERROR',hasMessage:true},'坏掉的卡店应标为不可读并给出原因');
  assert.equal(result.stillExists,true,'不可读不等于删除，条目必须保留');
  assert.equal(result.relistedIds.length,2,'重新读取时两间卡店都还在');
  assert.deepEqual(result.menu,{resumeDisabled:true,daysDisabled:true,starts:0},'不可读存档的继续和读档按钮必须真正禁用，不能触发启动');
  assert.equal(result.malformedError,null,'世界头缺少 clock/wallet 不能让整个目录失败');
  assert.equal(result.malformedRow.ok,false,'结构损坏的世界头必须标为不可读');
  assert.equal(result.malformedRow.phase,'unreadable');
  assert.equal(result.healthyAfterMalformed,'w-healthy','结构损坏不能影响健康卡店');
  assert.equal(result.malformedPreserved,true,'只读核查不能重建或清除损坏的原数据');
  console.log('PASS 存档目录容错：单库打开失败或世界头损坏只隔离该条，健康卡店可读、原数据保留、真实菜单禁止启动及读档');
}finally{await browser?.close();await server.close();}
