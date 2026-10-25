import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const out=process.env.CARD_SHOP_TEST_RESULTS||'.local/cv6-frontend';fs.mkdirSync(out,{recursive:true});
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  // Use installed Chrome when the optional Playwright download is absent.
  const bundled=fs.existsSync(chromium.executablePath());
  browser=await chromium.launch(bundled?{}:{channel:'chrome'});
  const page=await browser.newPage({viewport:{width:1440,height:900}}),errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/frontend/index.html');
  const result=await page.evaluate(async()=>{
    const {mount}=await import('/frontend-next/components/management/operations.mjs');
    const root=document.createElement('div');root.id='cv6-test-operations';document.body.append(root);
    const person=id=>({personId:id,name:id==='alice'?'林澄':'许遥',relation:0,dialog:'你好',pending:null});
    const widget=mount({root,view:{snapshot:{wallet:{available:100}},upgrades:{items:[]},people:{items:[],neighbors:[person('alice'),person('bella')]},orders:{items:[]},cards:[]},actions:{neighbor:async()=>({ok:true,data:{note:'已记录这次交谈'}})}});
    widget.setTab('neighbors');root.querySelector('article button').click();
    await new Promise(r=>setTimeout(r,0));
    const cards=[...root.querySelectorAll('article')];
    const feedback={first:cards[0].textContent,second:cards[1].textContent,font:getComputedStyle(cards[0].querySelector('h3')).fontSize};
    widget.dispose();root.remove();
    const {createFeedback}=await import('/frontend/feedback/index.mjs');
    const fb=createFeedback({storage:{getItem:()=>null,setItem(){}},audioExists:async()=>false});
    fb.applyPrefs({reducedMotion:true});
    const bar=document.querySelector('.cv615-subtitles');const hidden=getComputedStyle(bar).display==='none';
    fb.subtitles.show({speaker:'<img src=x>',text:'测试字幕'});
    const visible=getComputedStyle(bar).display!=='none',safe=!bar.querySelector('img')&&bar.textContent.includes('<img src=x>');
    fb.subtitles.hide();const hiddenAgain=getComputedStyle(bar).display==='none';
    fb.destroy();fb.onHostEvent({type:'notification',data:{message:'late'}});
    return {feedback,hidden,visible,safe,hiddenAgain,removed:!document.querySelector('.cv615-subtitles')};
  });
  assert(result.feedback.first.includes('操作反馈：已记录这次交谈'));
  assert(!result.feedback.second.includes('已记录这次交谈'));
  assert.equal(result.feedback.font,'15px');
  for(const key of ['hidden','visible','safe','hiddenAgain','removed'])assert(result[key],key);
  console.log('PASS: isolated browser component feedback attribution, subtitle visibility, text safety and disposal');
  // Verify the actual game still boots using a fresh browser context.
  await page.goto(server.origin+'/?profile=legacy');
  await page.waitForFunction(()=>window.__cardShopReady===true,{},{timeout:45000});
  const game=await page.evaluate(()=>{
    const app=window.__cardShopApp,s=app.getWorldScene();
    const player=s.actorView.sprites.get(app.getPlayer().actorId);
    return {background:s.cameras.main.backgroundColor.rgba,label:player?.label?.text,phase:app.snapshot().clock.phase};
  });
  assert.equal(game.background,'rgba(14,11,20,1)');
  assert(game.label?.startsWith('店长（你）'),JSON.stringify(game));
  assert.equal(errors.length,0,errors.join('\n'));
  await page.screenshot({path:path.join(out,'cv6-game-smoke.png')});
  fs.writeFileSync(path.join(out,'cv6-frontend.json'),JSON.stringify({fixture:result,game,evidence:['preview-fixture','browser-real'],errors},null,2));
  console.log('PASS: real game boot, player label and world background; no page errors');
}finally{await browser?.close();await server.close();}
