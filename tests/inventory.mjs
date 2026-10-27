import fs from 'node:fs';
import {groups,DEFAULT_GROUPS} from './groups.mjs';
import {taskChecks} from './check-map.mjs';
export {taskChecks};
export const registeredFiles=new Set(Object.values(groups).flat());
export function checkMetadata(file,group){
  const text=fs.readFileSync(new URL('../'+file,import.meta.url),'utf8'),browser=/from ['"]playwright|require\(['"]playwright/.test(text);
  const tasks=Object.entries(taskChecks).filter(([,spec])=>spec.files.includes(file)).map(([id])=>id);
  const evidence=browser?['browser-controlled']:['component-or-host-fixture'];
  let estimatedCost=browser?'medium':'low';
  if(file==='tests/native-modes-browser.mjs'){evidence.push('native-startup','native-controlled-death','native-ai-autoplay-natural');estimatedCost='high';}
  if(['tests/native-modes-series.mjs','tests/duel.cjs','tests/native-legacy-regression.mjs'].includes(file)){evidence.push('native-controlled-fixture');estimatedCost='high';}
  if(file==='tests/npc-natural-browser.mjs'){evidence.push('historical-npc-engine-path','native-ai-autoplay-natural');estimatedCost='high';}
  if(file==='tests/candidate-tools.mjs')evidence.push('filesystem-isolated','no-engine-execution');
  if(file==='tests/portrait-sources.mjs')evidence.push('asset-hashes-and-dimensions');
  if(file==='tests/contract-samples.mjs')evidence.push('runtime-dto-not-dts-compilation');
  if(['legacy','engine'].includes(group))evidence.push('legacy-entry-not-current-gameplay');
  if(file==='tests/desktop-host.cjs')evidence.push('desktop-test-user-directory');
  return {tasks,evidence,estimatedCost};
}
export function selectChecks({selection='all',task,failed}={}){
  if(selection!=='all'&&!groups[selection])throw Error('未知测试组：'+selection);
  if(task){task=task.toUpperCase().replace(/^OPT-?(\d+)$/,'OPT-$1');if(!taskChecks[task])throw Error('未知优化任务：'+task);}
  const scheduled=[],seen=new Set();
  function add(group,file){if(!registeredFiles.has(file))throw Error('测试未登记：'+file);if(seen.has(file))return;if(task&&!taskChecks[task].files.includes(file))return;seen.add(file);scheduled.push({group,file,...checkMetadata(file,group)});}
  // A failed alias/engine check must not disappear just because it is outside default all.
  if(failed&&selection==='all'&&!task){for(const result of failed)if(!result.passed)add(result.group,result.file);}
  else{for(const group of selection==='all'?(task?Object.keys(groups):DEFAULT_GROUPS):[selection])for(const file of groups[group])add(group,file);if(failed){const files=new Set(failed.filter(r=>!r.passed).map(r=>r.file));for(let i=scheduled.length-1;i>=0;i--)if(!files.has(scheduled[i].file))scheduled.splice(i,1);}}
  return {task,scheduled,requirements:task?taskChecks[task]:null};
}
