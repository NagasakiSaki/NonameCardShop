import {createRuntime} from '../modules/backend/runtime.mjs';
import {browserRepository,clearLegacyShopStorage} from '../modules/backend/storage.mjs';
import {createBattleMount} from './host-battle.mjs';

async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`无法读取 ${url}：${r.status}`);return r.json();}

export async function createHost(){
  const [source,rules]=await Promise.all([json('/data/cards.json'),json('/data/backend-rules.json')]);
  const maps=[];
  // These files belong to the frontend team. Absence is a capability, not a fake map.
  for(const name of ['store','battle-room']){const response=await fetch(`/assets/frontend/maps/${name}.json`);if(response.ok)maps.push(await response.json());else if(response.status!==404)throw new Error(`无法加载导航：${name}`);}
  const runtime=await createRuntime({source,rules,repository:browserRepository(),maps});
  if(!runtime.inspect().legacyResetDone){await clearLegacyShopStorage();await runtime.markLegacyReset();}
  const mount=createBattleMount(runtime);
  let timer,last=performance.now(),backgroundLease=null,disconnecting=false,clockFailed=false;
  const onVisibility=async()=>{if(document.hidden&&!backgroundLease)backgroundLease=await runtime.pause.acquire({ownerId:'page-visibility',reason:'切换到后台'});else if(!document.hidden&&backgroundLease){await runtime.pause.release(backgroundLease.leaseId);backgroundLease=null;}last=performance.now();};
  const host={
    async connect(input){const result=await runtime.connect(input);if(!timer){timer=setInterval(()=>{if(clockFailed)return;const current=performance.now(),elapsed=Math.min(.25,(current-last)/1000);last=current;runtime.advance(elapsed).catch(async error=>{clockFailed=true;await runtime.pause.acquire({ownerId:'storage-error',reason:error.message});console.error('营业时钟暂停：',error);});},250);document.addEventListener('visibilitychange',onVisibility);if(document.hidden)await onVisibility();}return result;},
    async query(name,input){
      const result=await runtime.query(name,input);
      if(result.ok&&name==='catalog.detail'&&input?.includeCode){try{const card=source.cards.find(c=>c.id===result.data.generalId),records=await json(`/data/skills/${encodeURIComponent(card.pack)}.json`);result.data.skills=result.data.skills.map(s=>({...s,code:records.skills?.[s.key]?.code||null}));}catch{result.data.skillSourceAvailable=false;}}
      return result;
    },
    command:input=>runtime.command(input),subscribe:listener=>runtime.subscribe(listener),pause:runtime.pause,world:runtime.world,battle:{mount},
    async disconnect(){if(disconnecting)return;disconnecting=true;clearInterval(timer);timer=null;document.removeEventListener('visibilitychange',onVisibility);mount.disposeAll();await runtime.disconnect();}
  };
  return host;
}
