// Cosmetic identity migrations never change wallets, ownership, matches or business rules.
import {CUSTOMER_APPEARANCES} from './appearances.mjs';
export const INTERNATIONAL_NAMES=Object.freeze([
  'Maya Chen','Alex Rivera','Yuki Sato','Noah Bennett','Amara Okafor','Luca Rossi',
  'Sofia Silva','Min-jun Park','Leila Haddad','Arjun Mehta','Emma Laurent','Elias Berg',
  'Zoe Williams','Mateo Garcia','Amina Yusuf','Nina Ivanova','Owen Brooks','Rina Tanaka',
  'Camila Costa','Jonas Fischer','Anika Shah','Leo Martin','Ines Duarte','Kai Nguyen',
  'Eva Novak','Samira Nasser','Nico Moretti','Lin Zhou','Ada Mensah','Hana Kim'
]);
export const LEGACY_NAMES=['林知夏','沈梨','许遥','江弥','叶澄','陈若','白栀','杜桥','唐禾','宋言','陆冬','苏棠'];
export const CHINESE_NAMES=Object.freeze([...LEGACY_NAMES,'顾清禾','周予安','温以宁','夏明川','许星遥','林见鹿','程晚晴','陆景行','沈南星','姜听雨','宋知微','谢云舟','叶书宁','陈望舒','季星澜','方亦辰','苏沐晴','江时序']);
const REGULAR_NAMES={student:['小林 · 学生玩家','Yuki Sato · 学生玩家'],collector:['许先生 · 收藏家','Alex Rivera · 收藏家'],duelist:['阿岚 · 对战爱好者','Amara Okafor · 对战爱好者']};
const oldAppearance=new Set(['rookie','collector','competitor','passerby','regular','bigspender','novice','competitive','casual','premium']);
// Coprime stride spreads the five bands through a 12-customer shop without adding economy RNG draws.
export const customerAppearance=index=>CUSTOMER_APPEARANCES[(index*7)%CUSTOMER_APPEARANCES.length];
export function migrateCustomerIdentity(world){
  const configured=world.rules.customerBehavior?.names;
  if(configured?.every(s=>INTERNATIONAL_NAMES.includes(s)||LEGACY_NAMES.includes(s)))world.rules.customerBehavior.names=[...CHINESE_NAMES];
  for(const [i,npc]of world.npcs.entries()){
    const regular=REGULAR_NAMES[npc.regularId];if(regular&&npc.name===regular[1])npc.name=regular[0];
    else {const i=INTERNATIONAL_NAMES.indexOf(npc.name);if(i>=0)npc.name=CHINESE_NAMES[i];}
    if(!npc.appearancePackVersion){if(oldAppearance.has(npc.appearanceId))npc.appearanceId=customerAppearance(i);npc.appearancePackVersion=1;}
  }
  for(const r of world.management?.config?.regulars||[]){const pair=REGULAR_NAMES[r.id];if(pair&&r.name===pair[1])r.name=pair[0];}
}
