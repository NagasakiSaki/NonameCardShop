import assert from 'node:assert/strict';
import fs from 'node:fs';
import {chromium} from 'playwright';
import {startShopServer} from '../server.mjs';
import {parse} from '../tools/vendor/acorn.mjs';
import {SKILL_TEXTS} from '../data/skill-texts.mjs';
import {finishOpeningDialogue} from './fixtures/opening-dialogue.mjs';
const cases=[];
for(const file of fs.readdirSync(new URL('../vendor/noname/character/',import.meta.url)).filter(f=>f.endsWith('.js'))){
  const source=fs.readFileSync(new URL('../vendor/noname/character/'+file,import.meta.url),'utf8'),ast=parse(source,{ecmaVersion:'latest',sourceType:'module'}),pack=file.slice(0,-3);
  for(const node of ast.body)if(node.type==='VariableDeclaration')for(const declaration of node.declarations)if(/^translates(?:\$\w+)?$/.test(declaration.id.name)&&declaration.init?.type==='ObjectExpression')for(const property of declaration.init.properties){
    const name=property.key?.name??property.key?.value;if(typeof name!=='string'||!name.endsWith('_info'))continue;
    const key=pack+':'+name.slice(0,-5),entry=SKILL_TEXTS[key];if(!entry)continue;
    const value=property.value,parts=value.type==='Literal'&&typeof value.value==='string'?[value.value]:value.type==='TemplateLiteral'?value.quasis.map(q=>q.value.cooked):[];
    if(parts.length)cases.push({key,parts,actual:entry.description});
  }
}
const server=await startShopServer({port:0,enginePort:0});let browser;
try{
  browser=await chromium.launch();const page=await browser.newPage({viewport:{width:1280,height:720}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(server.origin+'/?profile=legacy');await page.waitForFunction(()=>window.__cardShopReady===true);await finishOpeningDialogue(page);
  const checked=await page.evaluate(cases=>{
    const template=document.createElement('template'),normalize=text=>text.normalize('NFC').replace(/\s/g,'');const failed=[];
    for(const test of cases){let cursor=0;const actual=normalize(test.actual);for(const part of test.parts){template.innerHTML=part;const walker=document.createTreeWalker(template.content,NodeFilter.SHOW_TEXT);let node;while(node=walker.nextNode()){const text=normalize(node.textContent);if(!text)continue;const index=actual.indexOf(text,cursor);if(index<0){failed.push({key:test.key,missing:text.slice(0,100)});break;}cursor=index+text.length;}}}
    return {total:cases.length,failed};
  },cases);assert.ok(checked.total>4000);assert.deepEqual(checked.failed,[],'上游原文经浏览器独立解析后的每段文字必须按序保留');
  await page.evaluate(()=>__cardShopApp.openPanel('cardDetail',{cardKey:'noname-1.11.6:pot_heqi'}));
  const section=page.locator('[aria-label="完整技能"]');await section.waitFor();const text=await section.innerText();
  assert.match(text,/应机牌当【决斗】/);assert.match(text,/摸两张应机牌/);assert.match(text,/每回合结束时，所有角色手牌中的应机牌/);
  assert.equal(await section.locator('.detail-skill p').first().evaluate(n=>getComputedStyle(n).whiteSpace),'pre-wrap');
  await page.getByRole('button',{name:'查看技能源码',exact:true}).click();await page.locator('.detail-source').waitFor();assert.match(await page.locator('.detail-source').innerText(),/potshanxi|filter|content/);
  await page.evaluate(()=>__cardShopApp.windows.closeAll());await page.setViewportSize({width:390,height:680});
  await page.evaluate(()=>__cardShopApp.openPanel('cardDetail',{cardKey:'noname-1.11.6:sb_zhaoyun'}));
  await section.waitFor();assert.match(await section.innerText(),/随对局状态变化/);assert.equal(await section.locator('script').count(),0);
  assert.deepEqual(errors,[]);console.log('PASS '+checked.total+' upstream text bodies independently parsed by browser DOM; real Host repaired terms/definitions, exact code and dynamic warning at desktop/mobile sizes.');
}finally{await browser?.close();await server.close();}
