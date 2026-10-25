import {nativeProfile,NATIVE_PROTOCOL} from './profiles.mjs';
const id=s=>typeof s==='string'&&/^[a-zA-Z0-9_.:-]{1,150}$/.test(s)&&!['__proto__','constructor','prototype'].includes(s);
const requireValue=(ok,message)=>{if(!ok)throw Object.assign(Error(message),{code:'INVALID_ROUND_PLAN'});};
export const stableJSON=value=>JSON.stringify(value,(_,v)=>v&&typeof v==='object'&&!Array.isArray(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,v[k]])):v);
export async function digestPlan(plan){return [...new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(stableJSON(plan))))].map(x=>x.toString(16).padStart(2,'0')).join('');}
export function validateRoundPlan(raw){
  requireValue(raw&&JSON.stringify(raw).length<=24000&&raw.version===1,'对局计划格式不正确。');
  const profile=nativeProfile(raw.formatId);requireValue(profile,'此原生赛制尚未适配。');
  requireValue(raw.engineMode===profile.engineMode&&raw.nativeVariant===profile.nativeVariant&&raw.profileId===profile.id,'原生模式或规则版本不匹配。');
  for(const key of ['worldId','branchId','matchId','gameId','roundId','reserveDigest','playerTeamId','controlledSeatId'])requireValue(id(raw[key]),'对局身份不合法：'+key);
  requireValue(Number.isSafeInteger(raw.seed)&&raw.seed>=0&&raw.seed<=0xffffffff,'对局种子不合法。');
  requireValue(Array.isArray(raw.seats)&&raw.seats.length===profile.seats,'原生模式座位数不正确。');
  const seats=raw.seats.map(s=>{
    requireValue(s&&['seatId','teamId','generalId'].every(k=>id(s[k]))&&['human','ai'].includes(s.controller),'座位身份或控制类型不合法。');
    requireValue((id(s.sourceRef)?1:0)+(id(s.loanRef)?1:0)===1,'每个席位必须有唯一持卡或合法借用引用。');
    return {seatId:s.seatId,teamId:s.teamId,role:s.role,controller:s.controller,generalId:s.generalId,...(s.sourceRef?{sourceRef:s.sourceRef}:{loanRef:s.loanRef})};
  });
  requireValue(new Set(seats.map(s=>s.seatId)).size===seats.length,'座位重复。');
  const teams=[...new Set(seats.map(s=>s.teamId))],humans=seats.filter(s=>s.controller==='human');
  requireValue(teams.length===2&&teams.includes(raw.playerTeamId)&&humans.length===1&&humans[0].seatId===raw.controlledSeatId&&humans[0].teamId===raw.playerTeamId,'玩家控制席位不正确。');
  for(const team of teams){const members=seats.filter(s=>s.teamId===team);requireValue(new Set(members.map(s=>s.generalId)).size===members.length,'同一阵营不可重复武将。');}
  requireValue(new Set(seats.map(s=>s.sourceRef||s.loanRef)).size===seats.length,'同一参赛副本不能占多个座位。');
  if(profile.engineMode==='doudizhu'){
    const landlords=seats.filter(s=>s.role==='landlord'),farmers=seats.filter(s=>s.role==='farmer');
    requireValue(landlords.length===1&&farmers.length===2&&farmers[0].teamId===farmers[1].teamId&&landlords[0].teamId!==farmers[0].teamId,'斗地主必须是一名地主对两名农民。');
  }else requireValue(seats.every(s=>s.role==='teammate')&&teams.every(t=>seats.filter(s=>s.teamId===t).length===2),'2v2双方必须各有两个席位。');
  if(raw.firstSeatId!==undefined)requireValue(seats.some(s=>s.seatId===raw.firstSeatId),'先手席位不存在。');
  if(raw.controlPolicy!==undefined)requireValue(['optional-ally','ai-only'].includes(raw.controlPolicy),'队友控制策略不合法。');
  return {version:1,...Object.fromEntries(['worldId','branchId','matchId','gameId','roundId','formatId','engineMode','nativeVariant','profileId','seed','reserveDigest','playerTeamId','controlledSeatId'].map(k=>[k,raw[k]])),...(raw.firstSeatId?{firstSeatId:raw.firstSeatId}:{}),...(raw.controlPolicy?{controlPolicy:raw.controlPolicy}:{}),seats};
}
export function expectedIdentity(plan,planHash){return {protocol:NATIVE_PROTOCOL,worldId:plan.worldId,branchId:plan.branchId,matchId:plan.matchId,gameId:plan.gameId,roundId:plan.roundId,profileId:plan.profileId,reserveDigest:plan.reserveDigest,planHash};}
export function mapNativeResult(event,plan){
  const teams=[...new Set(plan.seats.map(s=>s.teamId))];
  requireValue(event.completed===true&&event.simulated===false&&(event.winningTeamId===null||teams.includes(event.winningTeamId)),'原生赛果的阵营不合法。');
  return {...event,result:event.winningTeamId===null?'draw':event.winningTeamId===plan.playerTeamId?'win':'loss'};
}
