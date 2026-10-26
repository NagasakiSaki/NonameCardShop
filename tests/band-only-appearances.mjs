import assert from 'node:assert/strict';
import fs from 'node:fs';
import {PLAYER_SKINS,CUSTOMER_APPEARANCES,DEFAULT_PLAYER_APPEARANCE,normaliseWorldAppearances} from '../modules/backend/appearances.mjs';
import {createRuntime} from '../modules/backend/runtime.mjs';
import {memoryRepository} from '../modules/backend/storage.mjs';
const json=p=>JSON.parse(fs.readFileSync(p,'utf8')),manifest=json('assets/frontend/manifest.json'),rules=json('data/backend-rules.json'),source=json('data/cards.json');
const ids=new Set(CUSTOMER_APPEARANCES);assert.equal(ids.size,25);assert.equal(PLAYER_SKINS.length,25);assert.deepEqual(Object.keys(manifest.characters).sort(),[...ids].sort());
for(const entry of Object.values(manifest.characters))for(const file of [entry.sheet,entry.portrait,entry.avatar].filter(Boolean))assert(fs.existsSync(file.slice(1)),file);
for(const folder of ['assets/frontend/characters','assets/frontend/portraits','assets/frontend-bright-anime/characters'])assert(fs.readdirSync(folder).every(f=>!/^((owner|rookie|collector|competitor|passerby|regular|bigspender)([.-]|$))/.test(f)),folder);
const world={player:{actorId:'actor:owner',appearanceId:'owner'},wallet:{available:1234},items:{card:{ownerId:'npc:0',cost:97}},matches:[{matchId:'existing',status:'finished',result:'win'}],npcs:['rookie','collector','competitor','passerby','regular','bigspender','bd-soyo','obsolete'].map((appearanceId,i)=>({actorId:'npc:'+i,appearanceId,presence:'offsite',appearancePackVersion:1,wallet:{available:20+i}})),management:{config:{regulars:[{id:'student',appearanceId:'rookie'}]}}};
const project=w=>{const copy=structuredClone(w);delete copy.player.appearanceId;for(const n of copy.npcs)delete n.appearanceId;for(const n of copy.management.config.regulars)delete n.appearanceId;return copy;},before=project(world);
normaliseWorldAppearances(world);assert.deepEqual(project(world),before);assert.equal(world.player.appearanceId,DEFAULT_PLAYER_APPEARANCE);assert(world.npcs.every(n=>ids.has(n.appearanceId)));assert.equal(world.npcs[6].appearanceId,'bd-soyo');const once=structuredClone(world);normaliseWorldAppearances(world);assert.deepEqual(world,once);
const runtime=await createRuntime({source,rules,repository:memoryRepository()});
try{
 await runtime.connect({contractVersion:'card-shop-ui/1.0',clientId:'band-only-test'});
 const legacy=structuredClone(runtime.inspect().world);legacy.player.appearanceId='owner';legacy.wallet.available=13579;legacy.npcs.push({actorId:'old-model-npc',name:'既有顾客',appearanceId:'collector',appearancePackVersion:1,presence:'offsite',roomId:'store',x:240,y:272,direction:'down',wallet:{available:417}});
 const archive={format:'noname-shop-world-save',version:2,worldId:legacy.worldId,branchId:legacy.branchId,day:legacy.clock.day,minute:legacy.clock.minute,slot:'backup',world:legacy};
 const loaded=await runtime.command({requestId:'band-only-import',type:'saves.import',payload:{content:JSON.stringify(archive)}});assert(loaded.ok,JSON.stringify(loaded));
 const current=runtime.inspect().world;assert.equal(current.player.appearanceId,'bd-anon');assert.equal(current.wallet.available,13579);assert.equal(current.npcs.find(n=>n.actorId==='old-model-npc').wallet.available,417);assert(current.npcs.every(n=>ids.has(n.appearanceId)));
 const rejected=await runtime.command({requestId:'retired-skin',type:'player.setSkin',payload:{appearanceId:'owner'}});assert.equal(rejected.ok,false);assert.equal(rejected.error.code,'INVALID_INPUT');
}finally{await runtime.disconnect();}
console.log('PASS 25-character registry and files; retired models removed; load migration preserves identities, wallets, items and results; retired skins rejected');
