// Validate future content proposals against existing metric names; never activate rewards/fees.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {METRICS} from './validate.mjs';
export function validateProgression(configs) {
  const errors=[],warnings=[],ids=new Set(),rewards=new Set();
  const integer=(v,min=0)=>Number.isSafeInteger(v)&&v>=min&&v<=1000000;
  const identity=(id,label)=>{if(typeof id!=='string'||!id||ids.has(id))errors.push(`invalid/duplicate ${label}: ${id}`);ids.add(id);};
  const metric=(key,target)=>{if(!METRICS.has(key)||!integer(target,1))errors.push(`invalid goal ${key}: ${target}`);};
  const reward=r=>{
    if(!r)return;
    if(!integer(r.cash??0)||!integer(r.reputation??0)||!r.onceOffKey||rewards.has(r.onceOffKey))errors.push('invalid/duplicate reward');
    rewards.add(r.onceOffKey);
  };
  for(const q of configs.progression.qualificationLevels){identity(String(q.level),'qualification');for(const [key,target]of Object.entries(q.requiredMetrics))metric(key,target);}
  for(const q of configs.quests.quests){identity(q.questId,'quest');if(!q.goals?.length)errors.push('quest has no goals');for(const g of q.goals||[])metric(g.metric,g.target);reward(q.reward);}
  for(const a of configs.assessments.assessments){identity(a.assessmentId,'assessment');if(a.allowSimulated!==false)errors.push('formal assessment must explicitly forbid simulation');reward(a.onPassReward);}
  for(const e of configs.events.events){
    identity(e.eventId,'event');
    if(!integer(e.requiredPlayers,2)||!integer(e.matchesRequired,1)||!integer(e.entryFee)||!integer(e.tableRequirement,1))errors.push('invalid event participants/fees/tables');
    if(e.requiredPlayers!==2)warnings.push(`${e.eventId}: requires future multi-player event contract`);
  }
  warnings.push('Proposal data only: does not activate progression, qualifications, rewards, fees or tournaments.');
  return {ok:!errors.length,errors,warnings};
}
export function readProgression(root=fileURLToPath(new URL('../../docs/proposals/progression-v6/',import.meta.url))){
  return Object.fromEntries(['progression','quests','assessments','events'].map(name=>[name,JSON.parse(fs.readFileSync(path.join(root,name+'.json'),'utf8'))]));
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const r=validateProgression(readProgression());console.log(JSON.stringify(r,null,2));process.exitCode=r.ok?0:1;
}
