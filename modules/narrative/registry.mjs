import {ID,METRICS,object,equal} from './definition.mjs';
export const NARRATIVE_API='card-shop-narrative/1';
export const STATE_VERSION=1;
export const EVENT_TYPES=new Set(['packSaleCompleted','secondaryTradeCompleted','cardsOpened','trashCardPickedUp','businessClosed','officialMatchSettled','npcSimulationSettled','taskRewardGranted']);
export const stableJSON=value=>JSON.stringify(value,(_,v)=>object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export const metricValue=(w,key)=>w.experience?.milestones?.[key]??w.lifetime?.[key]??0;
const fieldId=p=>object(p)&&ID(p.flagId);

export function createRegistry({actions={},predicates={},nodes={},eventTypes=[]}={}){
  const events=new Set([...EVENT_TYPES,...eventTypes]);
  const builtPredicates={
    'metric.atLeast':{version:1,validate:p=>object(p)&&METRICS.has(p.metric)&&Number.isSafeInteger(p.value)&&p.value>0?[]:['invalid metric threshold'],test:(ctx,p)=>metricValue(ctx.world,p.metric)-(ctx.session?.wait?.historyPolicy==='since-wait-entry'?(ctx.session.wait.baseline[p.metric]??0):0)>=p.value},
    'flag.equals':{version:1,validate:p=>fieldId(p)&&['string','boolean','number'].includes(typeof p.value)?[]:['invalid flag predicate'],test:(ctx,p)=>equal(ctx.state.flags[ctx.campaignId]?.[p.flagId]??ctx.defaults?.[p.flagId],p.value)},
    'chapter.completed':{version:1,validate:p=>object(p)&&ID(p.chapterId)?[]:['invalid chapter predicate'],test:(ctx,p)=>!!ctx.state.completed[ctx.campaignId+'/'+p.chapterId]},
    'world.phase':{version:1,validate:p=>['preparing','open','closing','closed'].includes(p?.value)?[]:['invalid phase'],test:(ctx,p)=>ctx.world.clock.phase===p.value},
    'world.dayAtLeast':{version:1,validate:p=>Number.isSafeInteger(p?.value)&&p.value>=1?[]:['invalid day'],test:(ctx,p)=>ctx.world.clock.day>=p.value},
    'event.occurred':{version:1,validate:p=>object(p)&&events.has(p.eventType)&&(!p.filter||object(p.filter)&&Object.entries(p.filter).length<=8&&Object.entries(p.filter).every(([k,v])=>['actorId','buyerId','matchId','result','simulated','background'].includes(k)&&['string','boolean','number'].includes(typeof v)))?[]:['invalid event predicate'],test:(ctx,p,c)=>!!ctx.session?.wait?.matched?.[stableJSON({params:p,sourcePolicy:c.sourcePolicy||'actual-business'})]},
  };
  const builtActions={
    'narrative.setFlag':{version:1,authorityEffects:[],validate:(p,flags)=>fieldId(p)&&flags.get(p.flagId)?.writableByStory===true&&flags.get(p.flagId).allowedValues.some(v=>equal(v,p.value))?[]:['protected/unknown flag or invalid value'],run:(ctx,p)=>{ctx.state.flags[ctx.campaignId][p.flagId]=structuredClone(p.value);return {flagId:p.flagId,value:p.value};}},
  };
  const builtNodes={
    branch:{version:1,boundary:false,validate(n,c){if(!Array.isArray(n.cases)||!n.cases.length||n.cases.length>32)c.error('invalid branch cases');for(const item of n.cases||[]){for(const s of c.condition(item.condition))c.error(s);c.ref(item.target,'branch');}c.ref(n.fallback,'fallback');},step(n,ctx){return {target:n.cases.find(c=>ctx.test(c.condition))?.target||n.fallback};}},
    cue:{version:1,boundary:true,validate(n,c){if(!ID(n.cueId)||typeof n.skippable!=='boolean')c.error('invalid cue');c.ref(n.next,'cue');},step(n){return {boundary:'cue'};}},
    transition:{version:1,boundary:true,validate(n,c){if(!ID(n.routeId)||!ID(n.effectId))c.error('invalid transition identity');c.ref(n.onSuccess,'success');c.ref(n.onFailure,'failure');},step(){return {boundary:'transition'};}},
  };
  const merge=(defaults,extras,kind)=>{
    const result={...defaults};for(const [key,value]of Object.entries(extras)){if(!ID(key)||Object.hasOwn(defaults,key))throw Error(`Duplicate/invalid ${kind} ${key}`);result[key]=value;}
    for(const [key,d]of Object.entries(result)){
      if(d.version!==1||typeof d.validate!=='function'||typeof d[kind==='predicate'?'test':kind==='action'?'run':'step']!=='function')throw Error(`Invalid ${kind} descriptor ${key}`);
      if(kind==='action'){
        if(!Array.isArray(d.authorityEffects))throw Error(`Action must declare authority effects: ${key}`);
        const confirmationRequired=d.confirmationRequired??d.authorityEffects.length>0;
        if(confirmationRequired&&typeof d.describe!=='function')throw Error(`Confirmed action needs player-facing description: ${key}`);
        result[key]=Object.freeze({...d,confirmationRequired});
      }else result[key]=Object.freeze({...d});
    }
    return Object.freeze(result);
  };
  const registry={actions:merge(builtActions,actions,'action'),predicates:merge(builtPredicates,predicates,'predicate'),nodes:merge(builtNodes,nodes,'node'),eventTypes:events};
  registry.validateCondition=condition=>{
    let count=0;const errors=[];
    const visit=(c,depth)=>{
      if(++count>128||depth>12||!object(c)){errors.push('invalid/oversized condition tree');return;}
      const operators=['all','any','not','predicateId'].filter(k=>Object.hasOwn(c,k));
      if(operators.length!==1){errors.push('condition requires exactly one operator');return;}
      if(c.all||c.any){const list=c.all||c.any;if(!Array.isArray(list)||!list.length||list.length>32){errors.push('invalid condition list');return;}for(const x of list)visit(x,depth+1);}
      else if(c.not)visit(c.not,depth+1);
      else {const d=registry.predicates[c.predicateId];if(!d)errors.push('unknown predicate '+c.predicateId);else errors.push(...d.validate(c.params));if(c.sourcePolicy!==undefined&&!['actual-business','actual-player'].includes(c.sourcePolicy))errors.push('unsupported event provenance');}
    };visit(condition,0);return errors;
  };
  registry.test=(c,ctx)=>c.all?c.all.every(x=>registry.test(x,ctx)):c.any?c.any.some(x=>registry.test(x,ctx)):c.not?!registry.test(c.not,ctx):registry.predicates[c.predicateId].test(ctx,c.params,c);
  return Object.freeze(registry);
}

export function eventLeaves(condition,results=[]){
  if(condition?.predicateId==='event.occurred')results.push({params:structuredClone(condition.params),sourcePolicy:condition.sourcePolicy||'actual-business'});
  for(const c of condition?.all||condition?.any||[])eventLeaves(c,results);
  if(condition?.not)eventLeaves(condition.not,results);
  return results;
}
