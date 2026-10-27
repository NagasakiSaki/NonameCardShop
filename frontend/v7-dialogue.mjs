import {createDialogueOverlay} from './dialogue/dialogue-overlay.mjs';
import {createPresentation,advanceText} from './dialogue/dialogue-presenter.mjs';
import {newRequestId,el} from './ui/components.mjs';

// One presentation owns one Host lease. Polls are read-only; mutations always have a stable request id.
export function installWorldDialogue(app,{stopMovement}){
  if(!document.getElementById('v7-dialogue-style'))document.head.append(el('link',{id:'v7-dialogue-style',rel:'stylesheet',href:'/frontend/dialogue/dialogue-styles.css'}));
  let lease=null,opening=false,disposed=false,busy=false,offer=null,presentation=null,pending=null,epoch=0,reading=false,lastScene='';
  const identity=()=>app.snapshot().worldId+':'+app.snapshot().branchId;
  const overlay=createDialogueOverlay({mount:document.body,getPortraitSrc:id=>app.manifest.characters[id]?.portrait,onIntent:intent=>void act(intent)});
  async function close(){epoch++;overlay.close();offer=null;presentation=null;pending=null;document.body.removeAttribute('data-v7-input-lock');const old=lease;lease=null;if(old)await app.host.pause.release(old.leaseId);app.resumeAfterDialogue?.();}
  async function show(next){
    if(disposed||opening||app.windows.depth)return;opening=true;const generation=epoch,branch=identity();
    try{
      stopMovement();const acquired=await app.host.pause.acquire({ownerId:'world-dialogue',reason:'与角色交谈'});
      if(disposed||generation!==epoch||identity()!==branch||app.windows.depth){await app.host.pause.release(acquired.leaseId);return;}
      lease=acquired;offer=next;presentation=createPresentation(next,{charsPerPage:innerWidth<600?55:95});
      document.body.dataset.v7InputLock='true';overlay.present(presentation);
    }finally{opening=false;}
  }
  async function commit(input){
    pending??=input;
    let result;
    try{result=await app.command(pending);}catch{result={ok:false,error:{code:'RESULT_UNKNOWN',message:'尚未确认操作结果，请再点一次原选项核对。'}};}
    if(result.ok||result.error?.code!=='RESULT_UNKNOWN')pending=null;
    return result;
  }
  async function act(intent){
    if(!offer||busy)return;
    if(intent.type==='advance'){advanceText(presentation);overlay.present(presentation);return;}
    busy=true;const branch=identity(),current=offer;
    try{
      const option=intent.type==='dismiss'?(current.kind==='stage-challenge'?'tomorrow':'close'):intent.optionId;
      let type='dialogue.respond',payload={offerId:current.offerId,optionId:option,proof:current.proof};
      if(current.source==='narrative'){
        type=option==='close'?'narrative.defer':current.nodeType==='choice'?'narrative.choose':'narrative.advance';
        payload={...current.proof,...(type==='narrative.choose'?{choiceId:option}:{}),...(current.confirmation?{confirm:true}:{})};
      }
      const result=await commit({requestId:newRequestId('world-dialogue'),type,payload});
      if(disposed||identity()!==branch){await close();return;}
      if(!result.ok){app.toast('error','对话未完成',result.error.message);if(result.error.code!=='RESULT_UNKNOWN')await close();return;}
      const data=result.data;await close();
      if(data?.gift)app.toast('success','高手赠礼',data.gift.name+' ×1 已放入仓库，明天继续切磋。');
      if(data?.openCombat)app.goToInteraction('battleRoom.service','combat',{opponentId:data.opponentId});
      else if(data?.openGoals)app.openPanel('allies',{tab:'future'});
      else if(data?.openAllies)app.openPanel('allies');
      else if(current.source==='narrative'&&data?.status==='presenting')await show(storyOffer(data));
    }finally{busy=false;}
  }
  const storyOffer=s=>({source:'narrative',offerId:s.proof.sessionId+':'+s.proof.nodeId,proof:s.proof,nodeType:s.nodeType,confirmation:s.confirmation,speakerName:s.speaker?.name||'街角故事',appearanceId:app.manifest.characters[s.speaker?.appearanceId]?s.speaker.appearanceId:'bd-anon',text:[s.text,s.confirmation?.message].filter(Boolean).join('\n'),choices:s.nodeType==='choice'?s.choices.map(c=>({...c,optionId:c.choiceId})):[{optionId:'advance',text:s.confirmation?'确认':'继续'}]});
  async function poll(){
    if(disposed||reading||opening||busy)return;
    if(offer){if(offer.proof.worldId!==app.snapshot().worldId||offer.proof.branchId!==app.snapshot().branchId)await close();return;}
    if(app.windows.depth)return;reading=true;
    try{
      const result=await app.query('dialogue.offer');if(disposed)return;
      if(result.ok&&result.data){await show(result.data);return;}
      if(!app.connection.capabilities?.narrative)return;
      const story=await app.query('narrative.session');if(disposed)return;
      if(story.ok&&story.data?.status==='presenting'){await show(storyOffer(story.data));return;}
      // Entering the open shop is a scene trigger. Existing compiled content supplies all text/conditions.
      const snapshot=app.snapshot(),scene=identity()+':'+snapshot.clock.day+':'+snapshot.clock.phase;
      if(snapshot.clock.phase==='open'&&app.getPlayer()?.roomId==='store'&&lastScene!==scene){
        lastScene=scene;const available=await app.query('narrative.available');if(disposed||app.windows.depth)return;
        const entry=available.ok&&available.data.enabled&&available.data.items.find(i=>i.available&&i.status==='not-started');
        if(entry){const started=await app.command({requestId:newRequestId('scene-story'),type:'narrative.start',payload:{worldId:snapshot.worldId,branchId:snapshot.branchId,campaignId:entry.campaignId,chapterId:entry.chapterId}});if(started.ok&&started.data?.status==='presenting')await show(storyOffer(started.data));}
      }
    }catch(error){console.warn('世界对话暂不可用：',error.message);}finally{reading=false;}
  }
  const timer=setInterval(()=>void poll(),400);
  return {get blocked(){return opening||!!offer;},async interact(actorId){
    if(disposed||busy||offer)return;stopMovement();
    const r=await app.command({requestId:newRequestId('actor-talk'),type:'actors.interact',payload:{actorId}});
    if(!r.ok){app.toast('info','暂时无法交谈',r.error.message);return;}
    if(r.data.openCombat)app.goToInteraction('battleRoom.service','combat',{opponentId:r.data.opponentId});else if(r.data.offer)await show(r.data.offer);
  },dispose(){disposed=true;clearInterval(timer);void close();overlay.destroy();}};
}
