import {need,clone} from '../backend/common.mjs';
import {ID,object} from './definition.mjs';
import {STATE_VERSION,stableJSON} from './registry.mjs';

export function initialiseNarrative(world,{enabled=false}={}){
  if(!world.narrative)world.narrative={version:STATE_VERSION,enabled,revision:0,eventSequence:0,flags:{},completed:{},sessions:{},sceneSessions:{},activeSessionId:null,receipts:{}};
  return world.narrative;
}
export function validateNarrative(world){
  const n=world.narrative;if(n===undefined)return;
  need(object(n)&&Number.isSafeInteger(n.version)&&n.version>=1&&stableJSON(n).length<=2*1024*1024,'INVALID_SAVE','剧情存档格式或大小不正确。');
  // Preserve a future version opaquely. Its progress cannot be interpreted or reset here.
  if(n.version!==STATE_VERSION)return;
  need(typeof n.enabled==='boolean'&&[n.revision,n.eventSequence].every(x=>Number.isSafeInteger(x)&&x>=0),'INVALID_SAVE','剧情版本或计数不合法。');
  for(const [key,limit]of Object.entries({flags:64,completed:512,sessions:256,sceneSessions:256,receipts:4096}))need(object(n[key])&&Object.keys(n[key]).length<=limit,'INVALID_SAVE','剧情记录容量不合法：'+key);
  need(n.activeSessionId===null||ID(n.activeSessionId)&&Object.hasOwn(n.sessions,n.activeSessionId),'INVALID_SAVE','剧情活动会话不存在。');
  for(const [campaign,flags]of Object.entries(n.flags))need(ID(campaign)&&object(flags)&&Object.keys(flags).length<=512&&Object.entries(flags).every(([key,value])=>ID(key)&&(['boolean'].includes(typeof value)||typeof value==='string'&&value.length<=2000||Number.isSafeInteger(value))),'INVALID_SAVE','剧情旗标不合法。');
  for(const [id,s]of Object.entries(n.sessions)){
    need(ID(id)&&s.sessionId===id&&[s.campaignId,s.contentRevision,s.chapterId,s.nodeId].every(ID)&&/^[a-f0-9]{64}$/.test(s.contentHash)&&Number.isSafeInteger(s.cursorRevision)&&s.cursorRevision>=0&&['presenting','waiting','deferred','completed','suspended'].includes(s.status),'INVALID_SAVE','剧情会话游标不合法。');
    if(s.status==='waiting')need(object(s.wait),'INVALID_SAVE','剧情等待游标缺失。');
    if(s.wait){
      need(s.wait.nodeId===s.nodeId&&['since-wait-entry','include-prior-actual-business'].includes(s.wait.historyPolicy)&&object(s.wait.baseline)&&Object.values(s.wait.baseline).every(v=>Number.isSafeInteger(v)&&v>=0)&&object(s.wait.matched)&&Object.keys(s.wait.matched).length<=128&&Array.isArray(s.wait.events)&&s.wait.events.length<=128,'INVALID_SAVE','剧情等待游标不合法。');
      need(s.wait.events.every(e=>object(e)&&object(e.params)&&ID(e.params.eventType)&&(!e.params.filter||object(e.params.filter)&&Object.entries(e.params.filter).length<=8&&Object.entries(e.params.filter).every(([k,v])=>['actorId','buyerId','matchId','result','simulated','background'].includes(k)&&['string','boolean','number'].includes(typeof v)))&&['actual-business','actual-player'].includes(e.sourcePolicy)),'INVALID_SAVE','剧情事件等待描述不合法。');
      need(Object.values(s.wait.matched).every(e=>object(e)&&typeof e.eventId==='string'&&typeof e.sourceBranchId==='string'&&typeof e.worldId==='string'&&Number.isSafeInteger(e.sequence)&&e.sequence>0),'INVALID_SAVE','剧情等待回执不合法。');
    }
  }
  for(const [key,id]of Object.entries(n.sceneSessions))need(key.length<=301&&ID(id)&&Object.hasOwn(n.sessions,id),'INVALID_SAVE','剧情场景索引不合法。');
  for(const r of Object.values(n.completed))need(object(r)&&ID(r.sessionId)&&n.sessions[r.sessionId]?.status==='completed','INVALID_SAVE','已完成剧情索引不合法。');
  for(const [key,r]of Object.entries(n.receipts))need(object(r)&&key.length<=350&&ID(r.effectId)&&ID(r.sessionId)&&Object.hasOwn(n.sessions,r.sessionId)&&typeof r.signature==='string'&&r.signature.length<=16000&&/^[a-f0-9]{64}$/.test(r.contentHash),'INVALID_SAVE','剧情效果回执不合法。');
}

/** Observe actual domain events inside the same world fork, before log truncation. */
export function recordNarrativeEvent(world,event){
  const state=world.narrative;
  if(state?.version!==STATE_VERSION||!state.enabled)return;
  state.eventSequence++;
  for(const s of Object.values(state.sessions)){
    if(s.status!=='waiting'||!s.wait)continue;
    for(const descriptor of s.wait.events){
      if(descriptor.params.eventType!==event.type||Object.entries(descriptor.params.filter||{}).some(([key,value])=>event[key]!==value))continue;
      if(descriptor.sourcePolicy==='actual-player'){
        const match=world.matches.find(m=>m.matchId===event.matchId);
        if(event.type!=='officialMatchSettled'||!match||match.background||match.simulated||match.status!=='finished'||match.result==='cancelled')continue;
      }
      const key=stableJSON({params:descriptor.params,sourcePolicy:descriptor.sourcePolicy});
      s.wait.matched[key]??={eventId:event.eventId,worldId:world.worldId,sourceBranchId:world.branchId,sequence:state.eventSequence,day:world.clock.day,minute:world.clock.minute};
    }
  }
}
export function narrativeSummary(world){
  const n=world.narrative;if(!n)return null;
  if(n.version!==STATE_VERSION)return {enabled:false,status:'unsupported',message:'此剧情进度需要更新版本，经营可以继续。'};
  const s=n.sessions[n.activeSessionId];
  return {enabled:n.enabled,status:s?.status||'idle',sessionId:s?.sessionId||null,revision:n.revision,readyCount:Object.values(n.sessions).filter(s=>s.status==='presenting').length,completed:Object.keys(n.completed).length};
}
