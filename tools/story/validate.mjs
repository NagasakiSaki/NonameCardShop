// Authoring validation and pure fixture preview, never a Host runtime or qualification source.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

import {METRICS,ID,object,equal,validateChapter} from '../../modules/narrative/definition.mjs';
import {createRegistry} from '../../modules/narrative/registry.mjs';
export {METRICS,validateChapter} from '../../modules/narrative/definition.mjs';

export function previewScenario(story, scenario, flagDefs) {
  const registry=createRegistry();
  const nodes=new Map(story.nodes.map(n=>[n.nodeId,n])), flags=Object.fromEntries([...flagDefs].map(([id,f])=>[id,f.default]));
  for(const [key,value]of Object.entries(scenario.initialState?.flags||{})){
    if(!ID(key)||!flagDefs.get(key)?.allowedValues.some(v=>equal(v,value)))throw Error(`invalid fixture flag ${key}`);
    flags[key]=structuredClone(value);
  }
  const trace=[]; let id=story.entryNodeId, choiceIndex=0;
  const result=(endResult,resumeAt=null)=>({evidenceType:'preview-fixture',endResult,resumeAt,flags,trace,choicesConsumed:choiceIndex});
  for (let step=0;step<1000;step++) {
    const n=nodes.get(id); if(!n)throw Error(`preview missing node ${id}`); trace.push(id);
    if(n.type==='line'){id=n.next;continue;}
    if(n.type==='choice'){
      const input=scenario.choiceInputs?.[choiceIndex++];
      const c=input?.nodeId===id?n.choices.find(c=>c.choiceId===input.choiceId):null;
      if(!c)throw Error(`preview needs a valid choice at ${id}`);
      const ctx={world:{lifetime:scenario.initialState?.business||{},clock:{day:scenario.initialState?.day||1,phase:scenario.initialState?.phase||'preparing'}},state:{flags:{[story.campaignId]:flags},completed:{}},campaignId:story.campaignId};
      if(c.condition&&!registry.test(c.condition,ctx))throw Error('preview choice is locked');id=c.target;continue;
    }
    if(n.type==='wait'){
      const value=scenario.initialState?.business?.[n.condition.params.metric]??0;
      if(n.historyPolicy==='since-wait-entry')throw Error('future-event waits require runtime integration; fixture cannot certify them');
      if(value>=n.condition.params.value){id=n.onSatisfied;continue;}
      if(scenario.triggerEvent==='day_closed_without_sale'){id=n.onDeferred;continue;}
      return result('waiting',id);
    }
    if(n.type==='action'){
      if(n.actionId!=='narrative.setFlag')throw Error('preview refuses unknown business effect');
      const definition=flagDefs.get(n.params?.flagId);
      if(definition?.writableByStory!==true||!definition.allowedValues.some(v=>equal(v,n.params.value)))throw Error('preview refuses protected flag');
      if(scenario.failEffects?.includes(n.effectId))id=n.onFailure;
      else {flags[n.params.flagId]=structuredClone(n.params.value);id=n.onSuccess;}
      continue;
    }
    if(n.type==='end')return result(n.result,n.resumeAt);
    throw Error(`unsupported preview node ${n.type}`);
  }
  throw Error('preview step budget exhausted');
}

export function validateProject(root) {
  root=path.resolve(root);
  const read=rel=>{
    if(typeof rel!=='string'||rel.includes('\\')||rel.includes(':'))throw Error('invalid project path');
    const p=path.resolve(root,rel),real=fs.realpathSync(p),inside=p=>{const v=path.relative(root,p);return v&&!v.startsWith('..')&&!path.isAbsolute(v);};
    if(!inside(p)||!inside(real)||fs.statSync(p).size>2*1024*1024)throw Error('project input outside root or too large');
    return JSON.parse(fs.readFileSync(p,'utf8'));
  };
  const project=read('project.json'), errors=[],warnings=[];
  if(project.format!=='card-shop-story-authoring/1'||project.runtimeContract!==null)errors.push('project is an authoring source, not an activated runtime package');
  const people=read(project.characters).characters, defs=read(project.flags).flags, text=read(project.text).lines;
  const map=(list,key,label)=>{
    const m=new Map();for(const f of list){if(!ID(f[key])||m.has(f[key]))errors.push(`invalid/duplicate ${label}`);m.set(f[key],f);}return m;
  };
  const characters=map(people,'personId','person'),flags=map(defs,'flagId','flag');
  for(const f of defs)if(!Array.isArray(f.allowedValues)||!f.allowedValues.some(v=>equal(v,f.default)))errors.push(`invalid flag default ${f.flagId}`);
  if(!Array.isArray(project.chapters)||project.chapters.length>128)throw Error('invalid chapter list');
  const stories=project.chapters.map(read),chapterIds=new Set(),sceneIds=new Set();
  for(const s of stories){
    if(s.campaignId!==project.campaignId||chapterIds.has(s.chapterId)||sceneIds.has(s.sceneId))errors.push(`inconsistent chapter identity ${s.chapterId}`);
    chapterIds.add(s.chapterId);sceneIds.add(s.sceneId);
    errors.push(...validateChapter(s,{characters,flags,lines:text,registry:createRegistry()}));
  }
  const cases=read(project.scenarios).scenarios, results=[],scenarioIds=new Set();
  for(const s of cases){
    try{
      if(!ID(s.scenarioId)||scenarioIds.has(s.scenarioId))throw Error('invalid/duplicate scenario ID');scenarioIds.add(s.scenarioId);
      const story=stories.find(c=>c.chapterId===s.chapterId);if(!story)throw Error('missing chapter');
      const result=previewScenario(story,s,flags),expected=s.expectedResult;
      if(result.endResult!==expected.endResult||('resumeAt'in expected&&!equal(result.resumeAt,expected.resumeAt))||Object.entries(expected.flags||{}).some(([k,v])=>!equal(result.flags[k],v))||result.choicesConsumed!==(s.choiceInputs||[]).length)throw Error('scenario result mismatch');
      results.push({scenarioId:s.scenarioId,passed:true,evidenceType:result.evidenceType});
    }catch(e){errors.push(`${s.scenarioId}: ${e.message}`);results.push({scenarioId:s.scenarioId,passed:false});}
  }
  warnings.push('Text fixture previews do not prove real sales, NPC placement, rewards, saves or engine qualification.');
  return {ok:!errors.length,format:project.format,chapters:stories.length,nodes:stories.reduce((s,c)=>s+c.nodes.length,0),scenarios:results,errors,warnings};
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  try{const report=validateProject(process.argv[2]||fileURLToPath(new URL('../../content/story/corner_card_shop',import.meta.url)));console.log(JSON.stringify(report,null,2));process.exitCode=report.ok?0:1;}
  catch(e){console.error(e.message);process.exitCode=1;}
}
