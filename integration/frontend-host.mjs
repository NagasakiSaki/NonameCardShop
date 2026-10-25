import {createRuntime} from '../modules/backend/runtime.mjs';
import {browserRepository} from '../modules/backend/storage.mjs';
import {createBattleMount} from './host-battle.mjs';
import {createNpcEngine} from './npc-engine.mjs';
import {profileDatabase,profileRegistry} from '../modules/backend/profiles.mjs';
import {loadNarrativeContent,storyContentHashes} from './story-content.mjs';
import {loadStoryPack} from '../modules/narrative/content.mjs';
import {createRegistry} from '../modules/narrative/registry.mjs';

async function json(url){const r=await fetch(url,{cache:'no-store'});if(!r.ok)throw new Error(`无法读取 ${url}：${r.status}`);return r.json();}

export async function createHost({profileId='legacy',storyExtensions={}}={}){
  if(profileId!=='legacy'){const registry=profileRegistry();try{if(!await registry.get(profileId))throw Error('这份卡店存档不存在，请返回存档选择。');}finally{await registry.close();}}
  const [source,rules,managementConfig]=await Promise.all([json('/data/cards.json'),json('/data/backend-rules.json'),json('/data/backend-management.json')]);
  const maps=[];
  // These files belong to the frontend team. Absence is a capability, not a fake map.
  for(const name of ['store','battle-room']){const response=await fetch(`/assets/frontend/maps/${name}.json`);if(response.ok)maps.push(await response.json());else if(response.status!==404)throw new Error(`无法加载导航：${name}`);}
  const repository=browserRepository(globalThis.indexedDB,profileDatabase(profileId));
  let firstRead=await repository.read();
  const content=await loadNarrativeContent(json,{savedState:firstRead?.world?.narrative,savedStates:(firstRead?.archives||[]).map(a=>a.world?.narrative)});
  const storyPacks=[];
  for(const raw of content.packs){try{storyPacks.push(await loadStoryPack(raw,{registry:createRegistry(storyExtensions)}));}catch{content.diagnostics.push('一份剧情内容校验失败，未加载该版本。');}}
  const cachedRepository={...repository,async read(){if(firstRead!==undefined){const value=firstRead;firstRead=undefined;return value;}return repository.read();}};
  let modeCapabilities=[];
  try{const engine=await json('/api/runtime');if(engine.ready)modeCapabilities=(await json(new URL('/shop-integration/modes/capabilities.json',engine.engineOrigin))).items||[];}catch{}
  const runtime=await createRuntime({source,rules,modeCapabilities,repository:cachedRepository,maps,managementConfig,backgroundAvailable:true,storyPacks,storyExtensions,storyDiagnostics:content.diagnostics,storyActiveHashes:content.activeHashes});
  const knownStoryHashes=new Set(storyPacks.map(p=>p.contentHash));
  async function prepareStoryRestore(input){
    if(!['saves.load','saves.loadDay','saves.import'].includes(input?.type))return;
    let refs=runtime.storyReferences(input.payload?.archiveId);
    if(input.type==='saves.import'&&typeof input.payload?.content==='string'&&input.payload.content.length<10000000){try{refs=storyContentHashes(JSON.parse(input.payload.content).world?.narrative);}catch{}}
    const missing=refs.filter(h=>!knownStoryHashes.has(h));if(!missing.length)return;
    const historical=await loadNarrativeContent(json,{savedState:{sessions:Object.fromEntries(missing.map(h=>[h,{contentHash:h}]))}});
    for(const raw of historical.packs)if(!knownStoryHashes.has(raw.contentHash)){try{await runtime.installStoryPacks([raw]);knownStoryHashes.add(raw.contentHash);}catch{content.diagnostics.push('旧剧情内容未通过校验，相关进度将保留。');}}
  }
  // The historical one-time reset marker is retained for compatibility. Opening another
  // profile must never erase a legacy world's saves/backups elsewhere on this origin.
  if(!runtime.inspect().legacyResetDone)await runtime.markLegacyReset();
  const mount=createBattleMount(runtime);
  const npcEngine=createNpcEngine(runtime);
  let timer,last=performance.now(),backgroundLease=null,disconnectPromise=null,clockFailed=false;
  const onVisibility=async()=>{if(document.hidden&&!backgroundLease)backgroundLease=await runtime.pause.acquire({ownerId:'page-visibility',reason:'切换到后台'});else if(!document.hidden&&backgroundLease){await runtime.pause.release(backgroundLease.leaseId);backgroundLease=null;}last=performance.now();};
  const host={
    async connect(input){const result=await runtime.connect(input);if(!timer){timer=setInterval(()=>{if(clockFailed)return;const current=performance.now(),elapsed=Math.min(.25,(current-last)/1000);last=current;runtime.advance(elapsed).catch(async error=>{clockFailed=true;await runtime.pause.acquire({ownerId:'storage-error',reason:error.message});console.error('营业时钟暂停：',error);});},100);document.addEventListener('visibilitychange',onVisibility);if(document.hidden)await onVisibility();npcEngine.start();}return result;},
    async query(name,input){
      const result=await runtime.query(name,input);
      if(result.ok&&name==='catalog.detail'&&input?.includeCode){try{const card=source.cards.find(c=>c.id===result.data.generalId),records=await json(`/data/skills/${encodeURIComponent(card.pack)}.json`);result.data.skills=result.data.skills.map(s=>({...s,code:records.skills?.[s.key]?.code||null}));}catch{result.data.skillSourceAvailable=false;}}
      return result;
    },
    async command(input){await prepareStoryRestore(input);return runtime.command(input);},subscribe:listener=>runtime.subscribe(listener),pause:runtime.pause,world:runtime.world,battle:{mount,control:input=>mount.control(input)},
    disconnect(){return disconnectPromise??=(async()=>{clearInterval(timer);timer=null;document.removeEventListener('visibilitychange',onVisibility);await mount.disposeAll();await npcEngine.dispose();await runtime.disconnect();})();}
  };
  return host;
}
