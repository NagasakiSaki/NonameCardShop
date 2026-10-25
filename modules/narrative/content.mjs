import {ID,object,validateChapter} from './definition.mjs';
import {NARRATIVE_API,stableJSON,createRegistry} from './registry.mjs';
export async function contentHash(payload){return [...new Uint8Array(await globalThis.crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJSON(payload))))].map(x=>x.toString(16).padStart(2,'0')).join('');}

export async function compileStoryPack(payload,{registry=createRegistry()}={}){
  if(!object(payload)||!ID(payload.campaignId)||!ID(payload.contentRevision)||payload.schemaVersion!==1)throw Error('Invalid story pack identity/version');
  if(stableJSON(payload).length>2*1024*1024)throw Error('Story pack too large');
  const map=(list,key)=>{if(!Array.isArray(list)||list.length>512)throw Error('Invalid story directory');const m=new Map();for(const d of list){if(!ID(d[key])||m.has(d[key]))throw Error('Duplicate/invalid '+key);m.set(d[key],d);}return m;};
  const people=map(payload.characters,'personId'),flags=map(payload.flags,'flagId'),chapters=map(payload.chapters,'chapterId');
  if(!object(payload.lines)||Object.keys(payload.lines).length>20000||Object.entries(payload.lines).some(([id,text])=>!ID(id)||typeof text!=='string'||text.length>8000))throw Error('Invalid localized lines');
  for(const f of flags.values())if(!Array.isArray(f.allowedValues)||f.allowedValues.length>128||!f.allowedValues.some(v=>stableJSON(v)===stableJSON(f.default))||f.allowedValues.some(v=>!['string','boolean','number'].includes(typeof v)))throw Error('Invalid flag definition');
  const errors=[];
  const versions={actions:registry.actions,predicates:registry.predicates,nodes:{...Object.fromEntries(['line','choice','wait','action','end'].map(n=>[n,{version:1}])),...registry.nodes}};
  for(const [kind,requirements]of Object.entries(payload.requires||{})){
    if(!versions[kind]||!object(requirements)){errors.push('Unknown capability declaration');continue;}
    for(const [id,version]of Object.entries(requirements))if(versions[kind][id]?.version!==version)errors.push(`Missing ${kind} capability ${id}@${version}`);
  }
  for(const p of people.values())if(typeof p.displayName!=='string'||!p.displayName||p.displayName.length>100)errors.push('Invalid person display name');
  const checkReferences=c=>{
    if(c?.predicateId==='flag.equals'&&(!flags.has(c.params.flagId)||!flags.get(c.params.flagId).allowedValues.some(v=>stableJSON(v)===stableJSON(c.params.value))))errors.push('Unknown flag predicate value');
    if(c?.predicateId==='chapter.completed'&&!chapters.has(c.params.chapterId))errors.push('Unknown chapter predicate');
    for(const x of c?.all||c?.any||[])checkReferences(x);if(c?.not)checkReferences(c.not);
  };
  for(const c of chapters.values()){
    if(c.campaignId!==payload.campaignId||c.contentRevision!==payload.contentRevision)errors.push('Mixed content identities');
    errors.push(...validateChapter(c,{characters:people,flags,lines:payload.lines,registry}));
    for(const n of c.nodes){if(n.type==='action'&&stableJSON({actionId:n.actionId,params:n.params}).length>16000)errors.push('Action parameters exceed receipt capacity');if(n.condition)checkReferences(n.condition);for(const item of n.cases||[])checkReferences(item.condition);for(const choice of n.choices||[])if(choice.condition)checkReferences(choice.condition);}
  }
  const entries=map(payload.entries,'chapterId');
  for(const e of entries.values()){
    if(!chapters.has(e.chapterId))errors.push('Missing entry chapter');
    errors.push(...registry.validateCondition(e.condition));
    checkReferences(e.condition);
  }
  for(const [personId,appearanceId]of Object.entries(payload.cast||{}))if(!people.has(personId)||!ID(appearanceId))errors.push('Invalid character appearance binding');
  if(errors.length)throw Error(errors.slice(0,10).join('; '));
  const raw=structuredClone(payload),hash=await contentHash(raw);
  return {format:'card-shop-storypack/1',apiVersion:NARRATIVE_API,contentHash:hash,payload:raw};
}

export async function loadStoryPack(raw,options){
  if(raw?.format!=='card-shop-storypack/1'||raw.apiVersion!==NARRATIVE_API)throw Error('Unsupported story runtime package');
  const verified=await compileStoryPack(raw.payload,options);
  if(verified.contentHash!==raw.contentHash)throw Error('Story package content hash mismatch');
  return verified;
}
