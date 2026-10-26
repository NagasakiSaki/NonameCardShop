import fs from 'node:fs';
import assert from 'node:assert/strict';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {resourcePower} from '../modules/backend/resource-power.mjs';
import {publishProducts,makeSealed,unsealBox} from '../modules/backend/products.mjs';
import {createWorld} from '../modules/backend/world.mjs';
import {customerDecision} from '../modules/backend/trading.mjs';
import {applyMatchTime,activeTimeMatch} from '../modules/backend/match-time.mjs';

const source=JSON.parse(fs.readFileSync(new URL('../data/cards.json',import.meta.url))),rules=JSON.parse(fs.readFileSync(new URL('../data/backend-rules.json',import.meta.url)));
const c=buildCatalog(source,rules),products=publishProducts(c,rules,1);
assert.equal(products.filter(p=>p.availability==='available').length,1);
assert.deepEqual([...new Set(products.map(p=>p.prices.pack.retail))].sort((a,b)=>a-b),[210,360,510]);
for(const p of products){assert.ok(p.prices.pack.wholesale<p.prices.pack.retail);assert.ok([210,360,510].includes(p.prices.pack.retail),'explicit retail tier, not a reverse-margin approximation');assert.equal(Object.values(p.boxCounts).reduce((a,b)=>a+b),120);}
const card=vector=>({id:'resource-fixture',hp:4,power:{vector}}),score=vector=>resourcePower(card(vector),rules.scoring).score;
assert.equal(score({cards:1}),60);assert.equal(score({cards:2}),70,'stealing a card gains one and removes one');
assert.equal(score({damage:1}),70);assert.equal(score({hpLoss:1}),30);
assert.equal(score({cards:2,cost:2}),50,'replacing two cards does not create two net cards');
assert.equal(score({cards:2,hpLoss:1}),50,'active one-HP/two-card trade pays its HP cost');
assert.equal(score({carry:5,burst:5}),50,'no obsolete hand-inheritance or unexplained burst bonus');
assert.equal(resourcePower({...card({}),hp:5},rules.scoring).score,55,'one extra HP amortizes over four turns');
assert.ok(c.byId.get('clan_xunshuang').globalScore>c.byId.get('liubei').globalScore);
assert.equal(c.byId.get('clan_xunshuang').reviewStatus,'calibrated');
assert.equal(c.byId.get('liubei').power.provenance,'three-mode-rules-estimate');
assert.ok(c.cards.every(x=>Number.isFinite(x.globalScore)&&x.power.modeScores&&x.power.modeScores['versus2v2-bo3']>=0));
const legacyRules=structuredClone(rules);delete legacyRules.scoring.method;legacyRules.modeWeights={bo3:.5,kof:.5};const legacyCatalog=buildCatalog(source,legacyRules);
assert.equal(legacyCatalog.byId.get('liubei').power.modelVersion,undefined,'saved legacy scoring remains readable without opting into the new model');
const world=createWorld(rules);world.clock.phase='open';world.products=products;
const product=products.find(p=>p.prices.pack.retail===210),pack=makeSealed(world,product,'pack',product.prices.pack.wholesale);pack.location='retail';
const npc={actorId:'buyer',wallet:{available:rules.npcInitialWallet,buyerClass:'regular'}};assert.equal(customerDecision(world,c,npc).item.inventoryRef,pack.inventoryRef);
const box=makeSealed(world,product,'box',product.prices.box.wholesale),contents=structuredClone(box.packets),copies=unsealBox(world,box);assert.deepEqual(copies.map(p=>p.cards),contents);assert.equal(copies.reduce((n,p)=>n+p.cost,0),product.prices.box.wholesale);
// Old saved NPC time leases cannot keep freezing the shop or cause a delayed +30 jump.
world.matches.push({matchId:'old-npc',background:true,status:'running',timeSession:{minutes:30,applied:false,startedAt:{day:1,minute:540}}});const before=world.clock.minute;
assert.equal(activeTimeMatch(world),undefined);applyMatchTime(world,c,new Map());assert.equal(world.clock.minute,before);assert.equal(world.matches[0].timeSession.applied,true);
console.log('PASS resource balance: three price tiers, positive margins, card/HP/opportunity-cost units, reviewed clan anchors, no inheritance bonus, funded pack demand, fixed physical box contents and legacy NPC time-lease retirement.');
