import {need,clone,serial} from '../backend/common.mjs';
import {ID,object} from './definition.mjs';
import {NARRATIVE_API,STATE_VERSION,METRICS,createRegistry,stableJSON,eventLeaves,metricValue} from './runtime-support.mjs';
import {initialiseNarrative,validateNarrative} from './state.mjs';

export function createNarrativeRuntime({packs=[],extensions={},diagnostics=[],currentHashes=null}={}){
  const registry=createRegistry(extensions),versions=new Map(),latest=new Map();
  const freeze=value=>{if(value&&typeof value==='object'){Object.values(value).forEach(freeze);Object.freeze(value);}return value;};
  function install(pack,activate=false){
    need(pack?.format==='card-shop-storypack/1'&&pack.apiVersion===NARRATIVE_API,'STORY_CONTENT_INVALID','剧情运行包不受支持。');
    const p=pack.payload,key=p.campaignId+'/'+p.contentRevision;
    need(!versions.has(key)||versions.get(key).contentHash===pack.contentHash,'STORY_REVISION_COLLISION','同一剧情版本不能对应不同内容。');
    const immutable=versions.get(key)||freeze(clone(pack));versions.set(key,immutable);if(activate)latest.set(p.campaignId,immutable);
  }
  for(const pack of packs)install(pack,currentHashes===null||currentHashes.includes(pack.contentHash));
  const findPack=s=>{const pack=versions.get(s.campaignId+'/'+s.contentRevision);return pack?.contentHash===s.contentHash?pack:null;};
  const definition=s=>findPack(s)?.payload.chapters.find(c=>c.chapterId===s.chapterId);
  const state=w=>{const n=w.narrative;need(n?.version===STATE_VERSION,'STORY_STATE_UNSUPPORTED','剧情进度版本不兼容，经营可以继续。');return n;};
  const context=(world,s)=>({world,state:state(world),session:s,campaignId:s.campaignId,defaults:Object.fromEntries((findPack(s)?.payload.flags||[]).map(f=>[f.flagId,f.default]))});
  const change=(w,s,target)=>{s.nodeId=target;s.cursorRevision++;delete s.wait;state(w).revision++;};
  function ready(world,s){
    const pack=findPack(s),chapter=definition(s);
    if(!pack||!chapter){if(s.status!=='suspended')state(world).revision++;s.status='suspended';s.reason='CONTENT_UNAVAILABLE';return null;}
    const node=chapter.nodes.find(n=>n.nodeId===s.nodeId);
    if(!node){if(s.status!=='suspended')state(world).revision++;s.status='suspended';s.reason='NODE_UNAVAILABLE';return null;}
    return {pack,node,chapter};
  }
  function effect(world,s,node,actionId=node.actionId,params=node.params){
    const n=state(world),descriptor=registry.actions[actionId];
    need(descriptor,'STORY_ACTION_UNAVAILABLE','此剧情动作尚未开放。');
    const key=s.sessionId+'|'+node.effectId,signature=stableJSON({actionId,params});
    if(Object.hasOwn(n.receipts,key)){need(n.receipts[key].signature===signature&&n.receipts[key].contentHash===s.contentHash,'STORY_EFFECT_CONFLICT','同一剧情效果的参数发生变化。');return {ok:true,data:clone(n.receipts[key].data)};}
    need(Object.keys(n.receipts).length<4096,'STORY_CAPACITY','剧情回执已达容量，进度已保留。');
    const flags=new Map(findPack(s).payload.flags.map(f=>[f.flagId,f]));
    need(!descriptor.validate(params,flags).length,'STORY_ACTION_INVALID','剧情动作参数不合法。');
    const savepoint=descriptor.handledErrors?.length?clone(world):null;let data;
    try{data=descriptor.run(context(world,s),clone(params));need(!data?.then&&stableJSON(data??null).length<=8000,'STORY_ACTION_CONTRACT','剧情动作必须在当前事务内同步完成。');}
    catch(error){
      if(!savepoint||!descriptor.handledErrors?.includes(error.code))throw error;
      for(const key of Object.keys(world))delete world[key];Object.assign(world,savepoint);
      return {ok:false,error:{code:error.code,message:error.message}};
    }
    n.receipts[key]={effectId:node.effectId,sessionId:s.sessionId,contentHash:s.contentHash,signature,data:clone(data??null),day:world.clock.day,minute:world.clock.minute};
    return {ok:true,data};
  }
  function drain(world,s){
    for(let steps=0;steps<128;steps++){
      const d=ready(world,s);if(!d)return;
      const {node}=d;
      if(['line','choice'].includes(node.type)){s.status='presenting';return;}
      if(node.type==='end'){
        if(node.result==='deferred'){change(world,s,node.resumeAt);s.status='deferred';}
        else {s.status='completed';state(world).completed[s.campaignId+'/'+s.chapterId]={sessionId:s.sessionId,contentRevision:s.contentRevision,contentHash:s.contentHash};state(world).revision++;}
        return;
      }
      if(node.type==='wait'){
        if(!s.wait){s.wait={nodeId:node.nodeId,historyPolicy:node.historyPolicy,baseline:Object.fromEntries([...METRICS].map(k=>[k,metricValue(world,k)])),events:eventLeaves(node.condition),matched:{}};s.cursorRevision++;state(world).revision++;}
        s.status='waiting';
        if(registry.test(node.condition,context(world,s))){change(world,s,node.onSatisfied);continue;}
        if(world.clock.phase==='closed'&&node.dayEndPolicy!=='continue'){change(world,s,node.onDeferred);continue;}
        return;
      }
      if(node.type==='action'){
        if(registry.actions[node.actionId]?.confirmationRequired&&!Object.hasOwn(state(world).receipts,s.sessionId+'|'+node.effectId)){s.status='presenting';return;}
        // Validation failures abort the entire fork; no partial economic change may commit.
        const outcome=effect(world,s,node);s=state(world).sessions[s.sessionId];change(world,s,outcome.ok?node.onSuccess:node.onFailure);continue;
      }
      const handler=registry.nodes[node.type];need(handler,'STORY_NODE_UNAVAILABLE','剧情节点尚未支持。');
      const result=handler.step(node,{...context(world,s),test:c=>registry.test(c,context(world,s))});
      if(result.boundary){s.status='presenting';return;}
      need(ID(result.target),'STORY_NODE_INVALID','剧情节点没有有效出口。');change(world,s,result.target);
    }
    need(false,'STORY_STEP_BUDGET','剧情执行步数超过上限，进度已保留。');
  }
  function observe(world){
    const n=world.narrative;if(n?.version!==STATE_VERSION||!n.enabled)return;
    for(const id of Object.keys(n.sessions)){const s=state(world).sessions[id];if(s.status==='waiting'){
      // Content failure is a suspended story, not a failed shop transaction.
      const d=ready(world,s);if(!d)continue;
      if(d.node.type!=='wait'){s.status='suspended';s.reason='WAIT_CURSOR_INVALID';state(world).revision++;continue;}
      const checkpoint=clone(world);
      try{if(registry.test(d.node.condition,context(world,s))||world.clock.phase==='closed'&&d.node.dayEndPolicy!=='continue')drain(world,s);}
      catch(error){for(const key of Object.keys(world))delete world[key];Object.assign(world,checkpoint);const restored=state(world).sessions[id];restored.status='suspended';restored.reason=error.code||'STORY_RUNTIME_ERROR';state(world).revision++;}
    }}
  }
  function ensureFlags(world,pack){
    const n=state(world);n.flags[pack.payload.campaignId]??={};
    for(const f of pack.payload.flags)if(!Object.hasOwn(n.flags[pack.payload.campaignId],f.flagId))n.flags[pack.payload.campaignId][f.flagId]=clone(f.default);
  }
  function view(world,sessionId){
    const n=world.narrative;
    if(n?.version!==STATE_VERSION)return {apiVersion:NARRATIVE_API,status:n?'unsupported':'unavailable',message:'剧情暂不可用，现有经营进度已保留。'};
    const s=n.sessions[sessionId||n.activeSessionId];
    if(!s)return {apiVersion:NARRATIVE_API,status:n.enabled?'idle':'disabled',session:null};
    const pack=findPack(s),chapter=definition(s),node=chapter?.nodes.find(x=>x.nodeId===s.nodeId);
    const status=!pack||!node?'suspended':s.status;
    const proof={worldId:world.worldId,branchId:world.branchId,sessionId:s.sessionId,nodeId:s.nodeId,cursorRevision:s.cursorRevision,contentHash:s.contentHash};
    const speaker=pack?.payload.characters.find(p=>p.personId===node?.speakerId);
    let confirmation=null;
    if(node?.type==='action'&&registry.actions[node.actionId]?.confirmationRequired){const message=registry.actions[node.actionId].describe(context(world,s),clone(node.params));need(typeof message==='string'&&message.length>0&&message.length<=8000,'STORY_ACTION_CONTRACT','剧情确认说明格式不正确。');confirmation={message};}
    return {apiVersion:NARRATIVE_API,status,proof,campaignId:s.campaignId,chapterId:s.chapterId,title:chapter?.chapterTitle||'待恢复的故事',nodeType:node?.type||null,
      text:pack?.payload.lines[node?.lineId]||'',speaker:speaker?{personId:speaker.personId,name:speaker.displayName,appearanceId:pack.payload.cast?.[speaker.personId]||null,binding:'contact'}:null,
      choices:node?.type==='choice'?node.choices.map(c=>({choiceId:c.choiceId,text:pack.payload.lines[c.lineId],available:!c.condition||registry.test(c.condition,context(world,s)),reason:c.lockedReason||'条件尚未满足'})):[],
      confirmation,
      wait:status==='waiting'?{message:'等待实际经营进展，关闭窗口后店铺会继续营业。'}:null,
      cue:node?.type==='cue'?{cueId:node.cueId,skippable:node.skippable}:null,
      presentation:node&&registry.nodes[node.type]?.present?clone(registry.nodes[node.type].present(node,context(world,s))):null,
      message:status==='suspended'?'所需故事版本或能力暂不可用，进度已保留，可以继续经营。':status==='completed'?'这段故事已完成。':null};
  }
  function available(world){
    const n=world.narrative,supported=n?.version===STATE_VERSION;
    const items=[];
    for(const pack of latest.values())for(const e of pack.payload.entries){
      const chapter=pack.payload.chapters.find(c=>c.chapterId===e.chapterId),key=pack.payload.campaignId+'/'+e.chapterId;
      const session=supported?n.sessions[n.sceneSessions[key]]:null;
      const condition=supported?registry.test(e.condition,{world,state:n,session:null,campaignId:pack.payload.campaignId,defaults:Object.fromEntries(pack.payload.flags.map(f=>[f.flagId,f.default]))}):false;
      const reason=!supported?'剧情进度版本不可用':!n.enabled?'需要先开启街角故事':n.completed[key]?'已经完成':session&&!findPack(session)?'所需旧剧情版本暂不可用':!session&&!condition?(e.lockedReason||'前置故事尚未完成'):null;
      items.push({campaignId:pack.payload.campaignId,chapterId:e.chapterId,title:chapter.chapterTitle,status:session?.status||'not-started',available:!reason,reason});
    }
    if(supported)for(const s of Object.values(n.sessions))if(s.status!=='completed'&&!items.some(i=>i.campaignId===s.campaignId&&i.chapterId===s.chapterId)){
      const chapter=definition(s),reason=!n.enabled?'需要先开启街角故事':!chapter?'所需旧剧情版本暂不可用':null;
      items.push({campaignId:s.campaignId,chapterId:s.chapterId,title:chapter?.chapterTitle||'待恢复的故事',status:s.status,available:!reason,reason});
    }
    return {apiVersion:NARRATIVE_API,enabled:supported&&n.enabled,contentAvailable:latest.size>0,diagnostics:clone(diagnostics),items,active:view(world),capabilities:{nodes:['line','choice','wait','action','end',...Object.keys(registry.nodes)],actions:Object.keys(registry.actions),predicates:Object.keys(registry.predicates)}};
  }
  function command(world,type,p){
    need(p.worldId===world.worldId&&p.branchId===world.branchId,'STALE_OPERATION','这段操作来自读档前的分支，请重新打开故事。');
    const n=state(world);
    if(type==='narrative.enable'){need(latest.size,'STORY_CONTENT_UNAVAILABLE','剧情内容尚未安装。');n.enabled=true;n.revision++;return available(world);}
    need(n.enabled,'STORY_DISABLED','请先开启街角故事。');
    if(type==='narrative.start'){
      need(!world.matches.some(m=>!m.background&&m.status==='running'),'MATCH_ACTIVE','请先完成当前玩家牌局。');
      const item=available(world).items.find(i=>i.campaignId===p.campaignId&&i.chapterId===p.chapterId);
      need(item?.available,'STORY_LOCKED',item?.reason||'故事不存在。');
      const active=n.sessions[n.activeSessionId];
      need(!active||active.status!=='presenting'||!findPack(active)||active.chapterId===p.chapterId&&active.campaignId===p.campaignId,'STORY_SESSION_ACTIVE','请先结束或暂缓当前对话。');
      const key=p.campaignId+'/'+p.chapterId;
      let s=n.sessions[n.sceneSessions[key]];
      const pack=s?findPack(s):latest.get(p.campaignId);need(pack,'STORY_CONTENT_UNAVAILABLE','所需剧情版本不可用。');ensureFlags(world,pack);
      if(!s){
        need(Object.keys(n.sessions).length<256,'STORY_CAPACITY','剧情会话已达容量。');
        const chapter=pack.payload.chapters.find(c=>c.chapterId===p.chapterId),sessionId=serial(world,'story');
        s={sessionId,campaignId:p.campaignId,chapterId:p.chapterId,contentRevision:pack.payload.contentRevision,contentHash:pack.contentHash,nodeId:chapter.entryNodeId,cursorRevision:0,status:'presenting'};
        n.sessions[sessionId]=s;n.sceneSessions[key]=sessionId;
      }
      n.activeSessionId=s.sessionId;n.revision++;drain(world,s);return view(world);
    }
    let s=n.sessions[p.sessionId];
    need(s&&s.sessionId===n.activeSessionId&&s.nodeId===p.nodeId&&s.cursorRevision===p.cursorRevision&&s.contentHash===p.contentHash,'STORY_STALE_CURSOR','故事已推进，请重新读取当前台词。');
    if(type==='narrative.defer'){if(s.status!=='waiting'&&s.status!=='suspended'&&s.status!=='completed')s.status='deferred';n.activeSessionId=null;n.revision++;return view(world,s.sessionId);}
    need(!['suspended','completed'].includes(s.status),'STORY_NOT_READY','此故事暂不能继续。');
    const d=ready(world,s);need(d,'STORY_CONTENT_UNAVAILABLE','所需剧情版本不可用。');
    const node=d.node;
    need(s.status==='presenting','STORY_NOT_READY','请先完成实际经营条件。');
    if(type==='narrative.choose'){
      need(node.type==='choice','STORY_INVALID_CHOICE','这里没有可选分支。');const c=node.choices.find(c=>c.choiceId===p.choiceId);need(c,'STORY_INVALID_CHOICE','选项不存在。');need(!c.condition||registry.test(c.condition,context(world,s)),'STORY_OPTION_LOCKED',c.lockedReason||'条件尚未满足。');change(world,s,c.target);
    }else if(type==='narrative.advance'){
      if(node.type==='line'||node.type==='cue')change(world,s,node.next);
      else if(node.type==='action'){
        need(registry.actions[node.actionId]?.confirmationRequired&&p.confirm===true,'CONFIRMATION_REQUIRED','请确认此剧情操作。');
        const outcome=effect(world,s,node);s=state(world).sessions[s.sessionId];change(world,s,outcome.ok?node.onSuccess:node.onFailure);
      }
      else if(node.type==='transition'){
        need(p.confirm===true,'CONFIRMATION_REQUIRED','请确认前往目标地点。');
        if(!registry.actions['world.travel'])change(world,s,node.onFailure);
        else {const outcome=effect(world,s,node,'world.travel',{routeId:node.routeId});s=state(world).sessions[s.sessionId];change(world,s,outcome.ok?node.onSuccess:node.onFailure);}
      }else {
        const handler=registry.nodes[node.type];need(typeof handler?.advance==='function','STORY_INVALID_ADVANCE','请先选择一个选项。');
        const result=handler.advance(node,{...context(world,s),test:c=>registry.test(c,context(world,s))},clone(p));
        need(ID(result?.target),'STORY_NODE_INVALID','扩展节点没有有效出口。');change(world,s,result.target);
      }
    }else need(false,'UNSUPPORTED_COMMAND','不支持的剧情操作。');
    drain(world,s);return view(world);
  }
  return {apiVersion:NARRATIVE_API,available,view,command,observe,install:pack=>install(pack,false),initialise:(w,fresh)=>initialiseNarrative(w,{enabled:fresh&&latest.size>0}),validate:validateNarrative,get contentAvailable(){return latest.size>0;}};
}
