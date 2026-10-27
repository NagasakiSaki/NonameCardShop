// Query-only benchmark. Fixtures enter through a repository; no player storage.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import crypto from 'node:crypto';
import {performance} from 'node:perf_hooks';
import {createWorld} from '../../modules/backend/world.mjs';
import {createRuntime} from '../../modules/backend/runtime.mjs';
import {memoryRepository} from '../../modules/backend/storage.mjs';
import {buildCatalog} from '../../modules/backend/catalog.mjs';
import {eligible} from '../../modules/backend/matches.mjs';
import {referenceEligible} from './eligibility-reference.mjs';
import assert from 'node:assert/strict';

const read=file=>JSON.parse(fs.readFileSync(new URL('../../'+file,import.meta.url),'utf8'));
const source=read('data/cards.json'),rules=read('data/backend-rules.json'),catalog=buildCatalog(source,rules);
const hash=value=>crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex');
const stats=values=>{const a=[...values].sort((x,y)=>x-y);return {samples:a.length,p50:a[Math.floor((a.length-1)*.5)],p95:a[Math.floor((a.length-1)*.95)]};};
const measure=async fn=>{for(let i=0;i<5;i++)await fn();const samples=[];for(let i=0;i<30;i++){const start=performance.now();await fn();samples.push(performance.now()-start);}return stats(samples);};
const report={version:1,node:process.version,cpu:os.cpus()[0].model,sourceHash:hash(source),rulesHash:hash(rules),scenarios:[]};
for(const [copies,distinct]of [[1000,1000],[5000,2563],[5000,20]]){
  const world=createWorld(rules);
  world.seed=19;
  world.player.favoriteCardKeys=catalog.cards.slice(0,5).map(c=>c.cardKey);
  for(let i=0;i<copies;i++){
    const c=catalog.cards[i%distinct],ref='perf-eligible-'+i;
    world.items[ref]={inventoryRef:ref,kind:'card',ownerId:'player',cardKey:c.cardKey,printedRarity:c.issuanceRarity,location:'collection',protected:i%13===0,lock:i%17===0?'test-lock':null,cost:0};
  }
  const host=await createRuntime({source,rules,repository:memoryRepository({schemaVersion:2,revision:0,world,archives:[],requests:{},legacyResetDone:true})});
  try{
    await host.connect({contractVersion:'card-shop-ui/1.0',clientId:'perf-eligible'});
    const w=host.inspect().world;
    const sample=await host.query('combat.eligible',{formatId:'kof'});
    if(!sample.ok||sample.data.items.length!==copies)throw Error('Invalid eligibility fixture');
    const row={copies,distinct,signature:hash(sample.data),direct:await measure(()=>eligible(w,catalog)),host:{}};
    assert.deepEqual(eligible(w,catalog),referenceEligible(w,catalog));
    const paired={before:[],after:[],cloneBefore:[],cloneAfter:[]};
    for(let i=0;i<35;i++)for(const label of i%2?['after','before']:['before','after']){
      const fn=label==='after'?eligible:referenceEligible;
      let t=performance.now();const items=fn(w,catalog);const direct=performance.now()-t;
      t=performance.now();structuredClone({mode:'kof',slots:3,items:items.map(c=>({...c,reasons:c.disabledReasons}))});
      if(i>=5){paired[label].push(direct);paired[label==='after'?'cloneAfter':'cloneBefore'].push(performance.now()-t);}
    }
    row.paired=Object.fromEntries(Object.entries(paired).map(([label,samples])=>[label,stats(samples)]));
    for(const formatId of ['kof','doudizhu-bo3','versus2v2-bo3'])row.host[formatId]=await measure(async()=>{const r=await host.query('combat.eligible',{formatId});if(!r.ok)throw Error(JSON.stringify(r.error));});
    report.scenarios.push(row);
  }finally{await host.disconnect();}
}
const at=process.argv.indexOf('--json');
if(at>=0){const target=process.argv[at+1];if(!target||fs.existsSync(target))throw Error('Choose a new output file');fs.mkdirSync(path.dirname(path.resolve(target)),{recursive:true});fs.writeFileSync(target,JSON.stringify(report,null,2));}
console.log(JSON.stringify(report,null,2));
