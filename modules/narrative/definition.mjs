// Shared, browser-safe authoring definitions. No filesystem or Host imports.
export const METRICS = new Set(['ordered','received','opened','sales','marketSales','shelved','daysClosed','regularTalks','upgrades','communityEvents']);
export const ID = s => typeof s === 'string' && /^[a-zA-Z0-9_.-]{1,150}$/.test(s) && !['__proto__','prototype','constructor'].includes(s);
export const object = s => s && typeof s === 'object' && !Array.isArray(s);
const types = new Set(['line','choice','wait','action','end']);
export const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function validateChapter(story, {characters,flags,lines,registry=null}) {
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
    if (!types.has(n.type)) {
      const extension=registry?.nodes?.[n.type];
      if(!extension){error(n.nodeId,`unsupported authoring node ${n.type}; no silent fallback`);continue;}
      extension.validate(n,{ref,text,error:s=>error(n.nodeId,s),condition:c=>registry.validateCondition(c)});continue;
    }
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
        if(c.condition){if(registry){for(const issue of registry.validateCondition(c.condition))error(n.nodeId,issue);}else error(n.nodeId,'conditional choice needs a registered predicate contract');}
      }
    }
    if (n.type==='wait') {
      if (n.pausePolicy!=='release-modal') error(n.nodeId,'wait must release its modal lease');
      if(n.dayEndPolicy!==undefined&&!['continue','defer'].includes(n.dayEndPolicy))error(n.nodeId,'invalid day-end policy');
      const c=n.condition;
      if(registry){for(const issue of registry.validateCondition(c))error(n.nodeId,issue);}
      else if (c?.predicateId!=='metric.atLeast' || c.sourcePolicy!=='actual-business' || !METRICS.has(c.params?.metric) || !Number.isSafeInteger(c.params?.value) || c.params.value<1) error(n.nodeId,'unsupported or invalid metric predicate');
      if (!['include-prior-actual-business','since-wait-entry'].includes(n.historyPolicy)) error(n.nodeId,'wait needs explicit history policy');
      ref(n.onSatisfied,'satisfied'); ref(n.onDeferred,'deferred');
    }
    if (n.type==='action') {
      if (!ID(n.effectId) || effects.has(n.effectId)) error(n.nodeId,'invalid/duplicate effect');
      effects.add(n.effectId);
      const f=flags.get(n.params?.flagId);
      if(registry?.actions?.[n.actionId]){for(const issue of registry.actions[n.actionId].validate(n.params,flags))error(n.nodeId,issue);}
      else if (n.actionId!=='narrative.setFlag' || !f || f.writableByStory!==true || !f.allowedValues.some(v=>equal(v,n.params?.value))) error(n.nodeId,'unknown/protected action/flag or invalid flag value');
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
  const exits=new Set([...nodes.values()].filter(n=>['end','wait'].includes(n.type)||registry?.nodes?.[n.type]?.boundary).map(n=>n.nodeId));
  let changed=true;
  while(changed){changed=false;for(const [id,targets]of edges)if(!exits.has(id)&&targets.some(t=>exits.has(t))){exits.add(id);changed=true;}}
  for (const id of nodes.keys()) if(!exits.has(id))error(id,'no terminating/yielding path');
  return errors;
}
