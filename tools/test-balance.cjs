/* Distribution, expected-value and conservation checks. Run against production rules. */
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),read=f=>JSON.parse(fs.readFileSync(path.join(root,f),'utf8'));
const B=require('../modules/balance.js'),{scoreVector,assess}=require('./power-model.cjs'),data=read('data/cards.json'),cfg=read('data/balance.json'),model=read('data/power-model.json'),prices=read('data/business.json').economy.cardPrices;
B.configure(cfg,data);B.setCatalog(data);
const zero={cards:0,damage:0,guard:0,heal:0,control:0,quality:0,cost:0,hpLoss:0,burst:0,carry:0};
assert.equal(scoreVector(zero,4,model),50);assert.equal(scoreVector({...zero,cards:1},4,model),60);
assert.equal(scoreVector({...zero,cards:2,hpLoss:1},4,model),54); // two cards for one HP is not +20 free points
assert.equal(scoreVector({...zero,cards:1,cost:1},4,model),50);
assert.equal(scoreVector({...zero,carry:1},4,model,true)-scoreVector({...zero,carry:1},4,model,false),3);
assert.equal(scoreVector(zero,105,model),scoreVector(zero,6,model));
const dummy={id:'test',hp:4,skills:[],group:'wei',name:'test'};
assert.equal(assess(dummy,{},model).score,assess({...dummy,title:'神话称号',group:'shen',name:'★test'}, {},model).score);
assert.equal(assess({...dummy,skills:[{id:'lord',key:'t',description:'主公技，你可以摸三张牌。'}]},{t:{code:'{}'}},model).score,50);
assert.ok(data.cards.find(c=>c.id==='diaochan').power.duel<60);
assert.ok(data.cards.find(c=>c.id==='zhangliao').power.duel<60);
assert.ok(data.cards.find(c=>c.id==='shen_caocao').rarity!=='UR');
assert.ok(data.cards.every(c=>Number.isFinite(c.power.score)&&c.power.components.length===c.skills.length));
assert.equal(new Set(data.cards.map(c=>c.id)).size,2563);
for(const r of B.ORDER)assert.ok(data.cards.some(c=>c.rarity===r));
const bad=structuredClone(cfg);bad.recipes.standard.slots[4].UR=.5;assert.ok(B.validate(bad,data).length);assert.throws(()=>B.configure(bad,data));
const malformed=structuredClone(cfg);malformed.packGrades.standard='missing';assert.ok(B.validate(malformed,data).length);
for(const bad of [null,{...cfg,packGrades:null},{...cfg,packGrades:{standard:'toString'}},{...cfg,recipes:{standard:null}},{...cfg,recipes:{standard:{name:'bad',slots:'not array'}}},{...cfg,recipes:{standard:{name:'bad',slots:[null,null,null,null,null]}}}])assert.ok(B.validate(bad,data).length);
let seed=20261023;const random=()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
const n=100000,results=[];
for(const pack of data.packs){
  const quote=B.quote(pack,prices),counts=Object.fromEntries(B.ORDER.map(r=>[r,0]));let value=0,square=0,legend=0,belowCost=0;const values=[];
  for(let i=0;i<n;i++){const pulls=B.draw(pack,random);assert.equal(pulls.length,5);assert.ok(pulls.some(p=>['R','SR','UR'].includes(p.rarity)));let v=0;for(const p of pulls){assert.equal(p.card.rarity,p.rarity);counts[p.rarity]++;v+=prices[p.rarity];}if(pulls.some(p=>p.rarity==='UR'))legend++;value+=v;square+=v*v;if(v<quote.wholesale)belowCost++;values.push(v);}
  const ev=value/n,sd=Math.sqrt(square/n-ev*ev),chance=legend/n;assert.ok(Math.abs(ev-quote.ev)<6*sd/Math.sqrt(n),`${pack.id} EV deviation`);
  assert.ok(Math.abs(chance-quote.legendChance)<6*Math.sqrt(quote.legendChance*(1-quote.legendChance)/n),`${pack.id} UR rate drift`);
  assert.ok(quote.retail>quote.ev&&quote.wholesale<=quote.retail&&quote.ev/quote.wholesale<=cfg.pricing.openingReturn+1e-8);
  assert.ok(quote.margin>=cfg.pricing.sealedMargin&&quote.margin<cfg.pricing.sealedMargin+.04);
  values.sort((a,b)=>a-b);results.push({id:pack.id,name:pack.name,grade:quote.grade,samples:n,legendChance:quote.legendChance,observedLegendChance:chance,expectedValue:quote.ev,observedValue:ev,standardDeviation:sd,p10:values[n*.1],median:values[n*.5],p90:values[n*.9],belowWholesaleChance:belowCost/n,wholesale:quote.wholesale,retail:quote.retail,referenceMargin:quote.margin,observedCardsPerPack:Object.fromEntries(B.ORDER.map(r=>[r,counts[r]/n]))});
}
// Repeating entries in a source changes only per-character shares, never rarity probability.
const source=data.packs.find(p=>p.id==='standard');assert.equal(B.pool(source,'SR').source,'同谱系补位');assert.ok(B.draw(source,()=>.001).every(p=>p.rarity!=='UR'));
const beforeOdds=B.probabilities(source);seed=123;const beforeDraws=Array.from({length:1000},()=>B.draw(source,random).map(p=>p.rarity));
const altered=structuredClone(data);altered.cards.push(...data.cards.filter(c=>c.rarity==='UR').map((c,i)=>({...c,id:'dup-'+i})));B.setCatalog(altered);assert.deepEqual(B.probabilities(source),beforeOdds);seed=123;assert.deepEqual(Array.from({length:1000},()=>B.draw(source,random).map(p=>p.rarity)),beforeDraws);B.setCatalog(data);
assert.equal(B.quote(data.packs.find(p=>p.id==='standard'),prices).ev,120.8);
// Live recipe modification changes the quote and the draws together.
const changed=structuredClone(cfg);changed.recipes.standard.slots[4]={R:.9,SR:.09,UR:.01};B.configure(changed,data);assert.ok(B.quote(data.packs.find(p=>p.id==='standard'),prices).ev<120.8);B.configure(cfg,data);
const resultsDir=process.env.CARD_SHOP_TEST_RESULTS||path.join(root,'test-results');fs.mkdirSync(resultsDir,{recursive:true});
fs.writeFileSync(path.join(resultsDir,'balance-simulation.json'),JSON.stringify({seed:20261023,samplesPerPack:n,totalPacks:n*data.packs.length,results},null,2)+'\n');
console.log(`PASS: scoring costs/format/lord/HP/labels, catalogue integrity, config rejection, ${n*data.packs.length} packs, rarity slots/guarantee/fallback, EV/rate confidence bounds, return/margin, live rule/quote parity.`);
