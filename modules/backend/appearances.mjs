import {BAND_APPEARANCES,BANDS} from '../../data/band-appearances.mjs';
export const CUSTOMER_APPEARANCES=BAND_APPEARANCES.map(c=>c.id);
export const DEFAULT_PLAYER_APPEARANCE='bd-anon';
export const PLAYER_SKINS=BAND_APPEARANCES.map(c=>({appearanceId:c.id,name:c.characterName,group:BANDS.find(b=>b.id===c.band).name}));
const available=new Set(CUSTOMER_APPEARANCES);
const retired={owner:'bd-anon',keeper:'bd-anon',rookie:'bd-tomori',novice:'bd-tomori',collector:'bd-anon',competitor:'bd-taki',competitive:'bd-taki',passerby:'bd-yuno',casual:'bd-yuno',regular:'bd-soyo',bigspender:'bd-sakiko',premium:'bd-sakiko'};
export function normaliseAppearance(id,fallback=DEFAULT_PLAYER_APPEARANCE){return available.has(id)?id:retired[id]||fallback;}
// Cosmetic only; migration consumes no RNG and changes no actor identity, wallet or inventory.
export function normaliseWorldAppearances(world){
 if(world.player)world.player.appearanceId=normaliseAppearance(world.player.appearanceId);
 for(const [index,npc]of (world.npcs||[]).entries())npc.appearanceId=normaliseAppearance(npc.appearanceId,CUSTOMER_APPEARANCES[(index*7)%CUSTOMER_APPEARANCES.length]);
 for(const regular of world.management?.config?.regulars||[])regular.appearanceId=normaliseAppearance(regular.appearanceId);
}