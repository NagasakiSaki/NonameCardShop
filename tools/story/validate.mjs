// Authoring validation and pure fixture preview, never a Host runtime or qualification source.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

export const METRICS = new Set(['ordered','received','opened','sales','marketSales','shelved','daysClosed','regularTalks','upgrades','communityEvents']);
const ID = s => typeof s === 'string' && /^[a-zA-Z0-9_.-]{1,150}$/.test(s) && !['__proto__','prototype','constructor'].includes(s);
const object = s => s && typeof s === 'object' && !Array.isArray(s);
const types = new Set(['line','choice','wait','action','end']);
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function validateChapter(story, {characters,flags,lines}) {
  const errors=[], edges=new Map(), nodes=new Map(), effects=new Set(), choices=new Set();
  const error=(id,s)=>errors.push(`${story.chapterId || '?'}:${id}: ${s}`);
  if (!ID(story.chapterId) || !ID(story.sceneId) || !ID(story.campaignId) || story.schemaVersion!==1) error('header','invalid authoring identity/version');
  if (!Array.isArray(story.nodes) || !story.nodes.length || story.nodes.length>10000) return [...errors,'nodes must be a nonempty bounded array'];
  for (const n of story.nodes) {
    if (!object(n) || !ID(n.nodeId) || nodes.has(n.nodeId)) { error(n?.nodeId,'invalid or duplicate node'); continue; }
    nodes.set(n.nodeId,n); edges.set(n.nodeId,[]);
  }
  if (!nodes.has(story.entryNodeId)) error('entry','missing entry node');
  for (const n of nodes.values()) {
    const ref=(target,label)=>{
      if (!nodes.has(target)) error(n.nodeId,`missing ${label} target: ${target}`);
      else edges.get(n.nodeId).push(target);
    };
    const text=id=>{if (!ID(id) || typeof lines[id]!=='string' || !lines[id].trim()) error(n.nodeId,`missing text ${id}`);};
    if (!types.has(n.type)) { error(n.nodeId,`unsupported authoring node ${n.type}; no silent fallback`); continue; }
    if (['line','choice'].includes(n.type)) text(n.lineId);
    if (n.type==='line') {
      if (n.speakerId!=null && !characters.has(n.speakerId)) error(n.nodeId,'unknown speaker');
      ref(n.next,'next');
    }
    if (n.type==='choice') {
      if (!Array.isArray(n.choices) || !n.choices.length) error(n.nodeId,'empty choices');
      else for (const c of n.choices) {
        if (!ID(c.choiceId) || choices.has(c.choiceId)) error(n.nodeId,'invalid/duplicate choice ID');
        choices.add(c.choiceId); text(c.lineId); ref(c.target,'choice');
      }
    }
    if (n.type==='wait') {
      if (n.pausePolicy!=='release-modal') error(n.nodeId,'wait must release its modal lease');
      const c=n.condition;
      if (c?.predicateId!=='metric.atLeast' || c.sourcePolicy!=='actual-business' || !METRICS.has(c.params?.metric) || !Number.isSafeInteger(c.params?.value) || c.params.value<1) error(n.nodeId,'unsupported or invalid metric predicate');
      if (!['include-prior-actual-business','since-wait-entry'].includes(n.historyPolicy)) error(n.nodeId,'wait needs explicit history policy');
      ref(n.onSatisfied,'satisfied'); ref(n.onDeferred,'deferred');
    }
    if (n.type==='action') {
      if (!ID(n.effectId) || effects.has(n.effectId)) error(n.nodeId,'invalid/duplicate effect');
      effects.add(n.effectId);
      const f=flags.get(n.params?.flagId);
      if (n.actionId!=='narrative.setFlag' || !f || f.writableByStory!==true || !f.allowedValues.some(v=>equal(v,n.params?.value))) error(n.nodeId,'unknown/protected action/flag or invalid flag value');
      ref(n.onSuccess,'success'); ref(n.onFailure,'failure');
    }
    if (n.type==='end') {
      if (!['scene-completed','deferred'].includes(n.result)) error(n.nodeId,'unknown end result');
      if (n.result==='deferred') ref(n.resumeAt,'resume');
      else if (n.resumeAt!=null) error(n.nodeId,'completed scene cannot auto-resume');
    }
  }
  const seen=new Set(), visit=id=>{if(seen.has(id)||!nodes.has(id))return;seen.add(id);for(const next of edges.get(id))visit(next);};
  visit(story.entryNodeId);
  for (const id of nodes.keys()) if(!seen.has(id))error(id,'unreachable from entry');
  // A static cycle is acceptable only when it can reach an end or a yielding wait.
  const exits=new Set([...nodes.values()].filter(n=>['end','wait'].includes(n.type)).map(n=>n.nodeId));
  let changed=true;
  while(changed){changed=false;for(const [id,targets]of edges)if(!exits.has(id)&&targets.some(t=>exits.has(t))){exits.add(id);changed=true;}}
  for (const id of nodes.keys()) if(!exits.has(id))error(id,'no terminating/yielding path');
  return errors;
}

export function previewScenario(story, scenario, flagDefs) {
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
      if(!c)throw Error(`preview needs a valid choice at ${id}`);id=c.target;continue;
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
    errors.push(...validateChapter(s,{characters,flags,lines:text}));
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
