import fs from 'node:fs';
import assert from 'node:assert/strict';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
const server=await startShopServer({port:0,enginePort:0});const browser=await chromium.launch();
try{
 const page=await browser.newPage({viewport:{width:1440,height:950}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);
 await page.evaluate(()=>__cardShopApp.goToInteraction('store.counter','supplier',{tab:'order'}));
 await page.getByRole('button',{name:'加入购物篮',exact:false}).first().waitFor();
 await page.waitForFunction(()=>__cardShopApp.isNearInteraction('store.counter'));
 assert.ok((await page.locator('.product-tier').first().innerText()).includes('平均强度'));
 await page.evaluate(async()=>{const app=__cardShopApp,q=await app.host.query('products.quote',{productId:'yijiang',quantity:3,unit:'pack'});const r=await app.host.command({requestId:'ui-auto-task',type:'supplier.placeOrder',quoteId:q.data.quoteId,payload:{productId:'yijiang',quantity:3,unit:'pack'}});if(!r.ok)throw Error(JSON.stringify(r));});
 await page.locator('.live-ledger-ticker:not([hidden])').waitFor();
 await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.getByRole('button',{name:'任务',exact:true}).click();
 await page.getByText('每日营业任务',{exact:true}).waitFor();assert.equal(await page.getByRole('button',{name:'领取奖励',exact:true}).count(),0);
 await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.getByRole('button',{name:'收支流水',exact:true}).click();
 await page.getByRole('heading',{name:'实时收支流水',exact:true}).waitFor();assert.ok((await page.locator('.windows').innerText()).includes('每日任务：今日进货三包'));
 await page.screenshot({path:'.local/gameplay-finance.png',fullPage:true});await page.evaluate(()=>__cardShopApp.windows.closeAll());
 await page.evaluate(()=>__cardShopApp.goToInteraction('store.opening','opening'));await page.getByRole('heading',{name:'开包柜台',exact:true}).waitFor();
 assert.equal(await page.evaluate(()=>__cardShopApp.isNearInteraction('store.opening')),true);
 await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.screenshot({path:'.local/gameplay-store.png',fullPage:true});
 await page.setViewportSize({width:406,height:1000});await page.screenshot({path:'.local/gameplay-store-406.png',fullPage:true});
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true);const box=await page.locator('.live-ledger').boundingBox();assert.ok(box&&box.y>=90&&box.y+box.height<260,'mobile journal remains visible above the map');assert.deepEqual(errors,[]);
 console.log('PASS UI: strength labels, automatic rewards, live journal/ticker and HUD action, independent opening station navigation, 406px overflow, no page errors.');
}finally{await browser.close();await server.close();}
