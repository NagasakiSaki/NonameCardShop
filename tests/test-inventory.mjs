import fs from 'node:fs';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {groups,DEFAULT_GROUPS} from './groups.mjs';
import {taskChecks,selectChecks,registeredFiles} from './inventory.mjs';
assert.equal(Object.keys(taskChecks).length,22);
for(const [id,spec] of Object.entries(taskChecks)){
  for(const file of spec.files){assert.ok(registeredFiles.has(file),id+': '+file);assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)));}
  for(const file of spec.evidence)assert.ok(fs.existsSync(new URL('../'+file,import.meta.url)),file);
}
const all=selectChecks().scheduled;assert.equal(all.length,new Set(DEFAULT_GROUPS.flatMap(g=>groups[g])).size);assert.equal(all.length,new Set(all.map(c=>c.file)).size);
for(const c of all){assert.ok(c.evidence.length);assert.ok(['low','medium','high'].includes(c.estimatedCost));}
assert.ok(all.some(c=>c.file==='tests/workspace-virtualization.mjs'));assert.ok(all.some(c=>c.file==='tests/test-inventory.mjs'));
assert.deepEqual(selectChecks({task:'opt13'}).scheduled.map(c=>c.file).sort(),[...taskChecks['OPT-13'].files].sort());
assert.throws(()=>selectChecks({task:'OPT-99'}),/未知优化任务/);assert.throws(()=>selectChecks({selection:'unknown'}),/未知测试组/);
const rerun=selectChecks({failed:[{group:'engine',file:'tests/duel.cjs',passed:false},{group:'backend',file:'tests/backend.mjs',passed:true},{group:'engine',file:'tests/duel.cjs',passed:false}]}).scheduled;
assert.equal(rerun.length,1);assert.equal(rerun[0].group,'engine');assert.ok(rerun[0].evidence.includes('legacy-entry-not-current-gameplay'));
assert.equal(selectChecks({failed:[]}).scheduled.length,0);
assert.throws(()=>selectChecks({failed:[{file:'not-a-registered-check.mjs',passed:false}]}),/未登记/);
const natural=all.find(c=>c.file==='tests/native-modes-browser.mjs');assert.ok(natural.evidence.includes('native-ai-autoplay-natural'));assert.ok(natural.evidence.includes('native-controlled-death'));
const child=spawnSync(process.execPath,['tests/run.mjs','--task=OPT-18','--json-list'],{encoding:'utf8',windowsHide:true});assert.equal(child.status,0,child.stderr);const list=JSON.parse(child.stdout);assert.equal(list.scheduled.length,2);
const manual=spawnSync(process.execPath,['tests/run.mjs','--task=OPT-19'],{encoding:'utf8',windowsHide:true});assert.notEqual(manual.status,0);assert.match(manual.stderr,/没有执行测试/);
console.log('PASS test inventory: 22 task mappings, default dedup, evidence/cost tags, real alias failure rerun, manual-only task rejection and CLI listing.');
