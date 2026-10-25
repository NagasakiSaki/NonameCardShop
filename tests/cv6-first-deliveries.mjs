import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
import {normalizeRel,classifyZone,safeWrite,safeMkdir} from '../tools/cv6/src/lib/fs-safe.mjs';
import {createSandbox} from '../tools/cv6/src/lib/sandbox.mjs';
import {materializeInto} from '../tools/cv6/src/lib/integrate.mjs';
import {materializePatches,parsePatch,matchEntry} from '../tools/cv6/src/lib/patch.mjs';
import {checkPackage} from '../tools/cv6/src/lib/check.mjs';
import {makeRepo,writeGoodPackage,overwriteManifest} from '../tools/cv6/tests/fixtures.mjs';
import {validateProject,validateChapter,previewScenario} from '../tools/story/validate.mjs';
import {readProgression,validateProgression} from '../tools/story/validate-progression.mjs';
import {dailyMetrics} from '../tools/qa/first-week.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),out=path.join(root,'.local/cv6-regression');
fs.mkdirSync(out,{recursive:true});const repo=makeRepo(out,'boundary'),pkg=writeGoodPackage(repo);
for(const value of ['Assets/a.json','DATA/a.json','Vendor/a.json'])assert.equal(classifyZone(value).kind,'readonly');
for(const value of ['a:stream','a./x','a /x','con.txt','x/../y'])assert.throws(()=>normalizeRel(value));
overwriteManifest(pkg,{files:[{...pkg.manifest.files[0],target:'.git/config'}]});
assert(checkPackage({repoRoot:repo,packageDir:pkg.dir}).errors.some(e=>e.code==='E_TARGET_FORBIDDEN'));
const sandbox=createSandbox({repoRoot:repo,packageDir:pkg.dir,name:'safe'}).dir;
assert(!fs.lstatSync(path.join(sandbox,'.local')).isSymbolicLink());
assert.throws(()=>createSandbox({repoRoot:repo,packageDir:pkg.dir,name:'../outside'}));
assert.throws(()=>createSandbox({repoRoot:repo,packageDir:pkg.dir,name:'shared',linkDirs:['.local']}));
assert.throws(()=>createSandbox({repoRoot:repo,packageDir:pkg.dir,name:'private',sourceDirs:['.git']}));
const linked=path.join(sandbox,'assets');
assert.throws(()=>safeMkdir(sandbox,linked));
assert.throws(()=>materializePatches(sandbox,[{target:'assets/new.json',content:'bad'}]));
const manifest={files:[{candidate:'src/candidate.mjs',target:'assets/evil.json'}]};
assert.equal(materializeInto(sandbox,pkg.dir,manifest).written.length,0);
assert.throws(()=>materializeInto(sandbox,pkg.dir,manifest,{allowReadonly:['assets']}));
const hardTarget=path.join(sandbox,'hard.txt'),original=path.join(out,'original-'+Date.now()+'.txt');
fs.writeFileSync(original,'untouched');fs.linkSync(original,hardTarget);
assert.throws(()=>safeWrite(sandbox,hardTarget,'bad'));assert.equal(fs.readFileSync(original,'utf8'),'untouched');
const malformedPatch=parsePatch('--- a/a.txt\n+++ b/a.txt\n@@ -1,9 +1,9 @@\n-old\n+new\n').entries[0];
assert(!matchEntry(malformedPatch,'old\n').ok,'inconsistent hunk counts must fail');
const many=Array.from({length:60},(_,i)=>({type:'+',text:String(i)}));
assert(matchEntry({isNew:false,hunks:[{oldStart:2,oldCount:1,newCount:61,lines:[{type:'-',text:'b'},{type:'+',text:'B'},...many]},{oldStart:4,oldCount:1,newCount:1,lines:[{type:'-',text:'d'},{type:'+',text:'D'}]}]},'a\nb\nc\nd\n').result.endsWith('c\nD\n'));
console.log('PASS: write isolation, forbidden targets, shared state and linked-file regressions');

const storyRoot=path.join(root,'content/story/corner_card_shop');
const read=rel=>JSON.parse(fs.readFileSync(path.join(storyRoot,rel),'utf8'));
const context={characters:new Map(read('characters.json').characters.map(c=>[c.personId,c])),flags:new Map(read('flags.json').flags.map(f=>[f.flagId,f])),lines:read('text/zh-CN.json').lines};
const metricContract=fs.readFileSync(path.join(root,'contracts/shop-experience.d.ts'),'utf8').match(/export type ExperienceMetric = ([^;]+);/)[1];
const metricNames=[...metricContract.matchAll(/'([^']+)'/g)].map(m=>m[1]);
const {METRICS}=await import('../tools/story/validate.mjs');assert.deepEqual([...METRICS].sort(),metricNames.sort());
const chapter=read('chapters/chapter_01.story.json');assert(validateProject(storyRoot).ok);
for(const change of [
 s=>s.nodes[0].next='missing',
 s=>s.nodes[0].speakerId='not_a_person',
 s=>s.nodes.find(n=>n.type==='action').params.value='invalid-flag-value',
 s=>s.nodes.find(n=>n.type==='action').params={flagId:'campaignCompleted',value:true},
 s=>s.nodes.find(n=>n.type==='choice').choices.push({...s.nodes.find(n=>n.type==='choice').choices[0]}),
 s=>s.nodes.find(n=>n.type==='wait').onDeferred='missing',
 s=>s.nodes.find(n=>n.type==='wait').historyPolicy=null,
 s=>s.nodes[0].type='executeJS',
 s=>{s.nodes[0].next=s.nodes[0].nodeId;},
 s=>s.nodes.push({nodeId:'orphan',type:'end',result:'scene-completed',resumeAt:null}),
]){const bad=structuredClone(chapter);change(bad);assert(validateChapter(bad,context).length>0);}
const fixture=read('tests/scenario-tests.json').scenarios[0],before=JSON.stringify(fixture);
assert.equal(previewScenario(chapter,fixture,context.flags).evidenceType,'preview-fixture');assert.equal(JSON.stringify(fixture),before);
const configs=readProgression();assert(validateProgression(configs).ok);
const bad=structuredClone(configs);bad.assessments.assessments[0].allowSimulated=undefined;assert(!validateProgression(bad).ok);
const malformed=structuredClone(configs);malformed.quests.quests[0].goals[0].target=-1;assert(!validateProgression(malformed).ok);
console.log('PASS: 60-node source, five executed previews, negative story/content cases');

const summary=dailyMetrics({clock:{day:2,minute:1200},wallet:{available:110,debt:0},daily:{goods:100,cogs:70}},
 {products:[{sold:1}],cash:{opening:100,taskRewards:60,taskCash:60,procurementCash:70},visits:{arrived:4,departed:3,outcomes:{purchased:1,unconverted:2},issueVisits:[{code:'out-of-stock',count:2}]}},
 {revenue:{total:100},cost:{costOfGoods:70,rent:10,wages:0},netProfit:20});
assert.equal(summary.taskRewards,60);assert.equal(summary.goodsMargin,30);assert.equal(summary.operatingProfit,20);assert.equal(summary.cashChange,10);assert.equal(summary.soldUnits,1);assert.equal(summary.stockoutVisits,2);
console.log('PASS: daily cash, margin, rewards, unit and visit accounting stay distinct');
