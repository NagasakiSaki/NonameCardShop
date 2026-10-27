import {openRoomPools} from './room-pools.mjs';
import {el,newRequestId} from '../ui/components.mjs';
import {fitPanel} from '../../frontend-next/services/panel-shell.mjs';
import {openCombat as openLegacy} from '../../frontend-next/screens/combat.mjs';
import {renderPackSelector,scoreFor} from './pack-selector.mjs';
import {formatOptions,renderFormatPicker} from './format-picker.mjs';
import {buildSelectRoundIntent,roundSelectionRequirement} from './round-select.mjs';
import {seriesBanner,takeoverControlInfo,sideSwapNote} from './series-panel.mjs';
import {classifyMountError,mountErrorAction} from './mount-errors.mjs';

export function ensureV7Styles(){if(!document.getElementById('v7-room-style'))document.head.append(el('link',{id:'v7-room-style',rel:'stylesheet',href:'/frontend/combat/v7-room.css'}));}
const idOf=app=>app.snapshot().worldId+':'+app.snapshot().branchId;
export async function openCombat(app,options={}){
  if(!app.connection.capabilities?.operationsV7)return openLegacy(app,options);
  ensureV7Styles();
  const [existing,queue,rooms]=await Promise.all([app.query('combat.series'),app.query('combat.queue'),app.query('combat.rooms')]);
  let room=rooms.ok?rooms.data.active:null;if(options.roomId){const r=await app.query('combat.room',{roomId:options.roomId});if(r.ok)room=r.data;}
  if(room?.background)return openRoomPools(app,room);if(room?.legacy&&!room.series)return openLegacy(app,options);
  if(queue.ok&&queue.data.playerMatch&&!existing.data)return openLegacy(app,options);
  let series=room?.series||(existing.ok?existing.data:null),formatId=room?.formatId||'kof',selected=[],page=0,items=[],formats=[],opponentId=room?.opponentId||options.opponentId||null,step=series?'series':room?'reserve':'format',pending=null;
  const pickerStates={reserve:{pack:null,scroll:{}},round:{pack:null,scroll:{}}};let roundPickerId=null;
  return app.windows.open({id:'combat-v7',title:'对战房间',pauseReason:'准备牌局',width:'window--wide',render:async ctx=>{
    fitPanel(ctx);ctx.element.classList.add('v7-room');let disposed=false,busy=false,mounted=null,mountedGame=null,mounting=false,refreshing=false,menuOpen=false,mountIssue=null;
    const branch=idOf(app),active=()=>!disposed&&!ctx.handle.closed&&idOf(app)===branch;
    const message=el('p',{role:'status',class:'v7-message'}),root=el('div',{class:'v7-combat-body'}),battle=el('div',{class:'v7-battle',hidden:true}),head=el('div'),choiceBar=el('div',{class:'v7-choice-bar','data-choice-bar':'true'});ctx.body.append(message,root,battle);ctx.foot.append(choiceBar);
    const button=(text,fn,disabled=false)=>el('button',{class:'btn btn--sm',text,disabled:disabled||busy,onclick:fn});
    const error=r=>{message.textContent=r.error?.message||'暂时无法继续。';};
    async function submit(type,payload={}){
      if(!active()||busy)return null;busy=true;
      const input=pending||{requestId:newRequestId('combat-v7'),type,payload};pending=input;
      try{const result=await ctx.submit(input);if(!active())return null;if(result.ok||result.error?.code!=='RESULT_UNKNOWN')pending=null;if(!result.ok)error(result);else message.textContent='';return result;}
      finally{busy=false;}
    }
    async function stopBattle(){const current=mounted;mounted=null;mountedGame=null;menuOpen=false;if(current)await current.dispose();battle.replaceChildren();battle.hidden=true;}
    async function reload(){
      if(!active()||refreshing)return;refreshing=true;
      try{if(room){const r=await ctx.query('combat.room',{roomId:room.roomId});if(!active())return;if(r.ok){const changed=r.data.revision!==room.revision;room=r.data;if(!room.matchId&&!series){if(changed)paint();return;}}}
        const result=await ctx.query('combat.series',{matchId:series?.matchId});if(!active())return;if(result.ok&&result.data){const next=result.data;if(series?.round?.gameId!==next.round?.gameId||!['live','mounting'].includes(next.phase)){await stopBattle();}series=next;step='series';paint();}}
      finally{refreshing=false;}
    }
    async function mountRound(){
      if(!active()||mounting||mounted)return;mounting=true;battle.hidden=false;root.hidden=true;
      try{const handle=await app.host.battle.mount({container:battle,matchId:series.matchId});if(!active()){await handle.dispose();return;}mounted=handle;mountedGame=series.round.gameId;mountIssue=null;await reload();}
      catch(e){
        // 技术中断（超时/连不上）与不兼容/状态问题分开：只有前者给“重试载入”。
        mountIssue=classifyMountError(e);
        message.textContent=mountIssue.kind==='cancelled'?'':mountIssue.title+'：'+mountIssue.detail;
        battle.replaceChildren();battle.hidden=true;root.hidden=false;
        await reload();paint();
      }finally{mounting=false;}
    }
    const preview=item=>app.openPanel('cardDetail',{cardKey:item.cardKey});
    async function favorite(item){const favorite=!item.favorite,r=await submit('player.setFavorite',{cardKey:item.cardKey,favorite});if(r?.ok){for(const c of items)if(c.cardKey===item.cardKey)c.favorite=favorite;for(const c of series?.reserveItems||[])if(c.cardKey===item.cardKey)c.favorite=favorite;paint();}}
    function grid(pool,max,onConfirm,label,scope='reserve'){
      const gridMount=el('div');root.append(gridMount);
      const state=pickerStates[scope];
      function draw(){const scroll=ctx.body.scrollTop;renderPackSelector({mount:gridMount,items:pool,selected,max,state,onNavigate:id=>{state.scroll[state.pack??'home']=ctx.body.scrollTop;state.pack=id;draw();ctx.body.scrollTop=state.scroll[id??'home']||0;},onToggle:item=>{
        const found=selected.indexOf(item.key);if(found>=0)selected.splice(found,1);else if(selected.length<max&&!selected.some(ref=>pool.find(c=>c.key===ref)?.generalId===item.generalId))selected.push(item.key);else message.textContent='请先取消已选武将；同一阵营不能重复武将。';
        draw();updateSummary();confirm.disabled=selected.length!==max||!!room&&!room.readiness.enemy;
      },onPreview:preview,onToggleFavorite:favorite});ctx.body.scrollTop=scroll;}
      const summary=el('span',{class:'small','aria-live':'polite'}),confirm=button(label,async()=>{confirm.disabled=true;try{await onConfirm();}finally{if(active()&&confirm.isConnected)confirm.disabled=selected.length!==max||!!room&&!room.readiness.enemy;}},selected.length!==max||!!room&&!room.readiness.enemy);
      const updateSummary=()=>summary.textContent=`已选 ${selected.length}/${max}：`+(selected.map(ref=>pool.find(c=>c.key===ref)?.name||ref).join(' → ')||'请点击卡面选择');
      choiceBar.append(summary,confirm);updateSummary();draw();gridMount.addEventListener('click',updateSummary);gridMount.addEventListener('keydown',updateSummary);
    }
    async function loadReserve(){
      if(app.connection.capabilities?.battleRooms&&!room){const created=await submit('combat.room.create',{formatId,opponentId,tableId:options.tableId});if(!created?.ok)return;room=created.data;}
      const result=await ctx.query('combat.eligible',{formatId});if(!active())return;
      if(!result.ok){error(result);return;}const groups=new Map();for(const c of result.data.items){if(!groups.has(c.generalId))groups.set(c.generalId,[]);groups.get(c.generalId).push(c);}
      items=[...groups.values()].map(copies=>{const c=copies.find(c=>c.eligible)||copies[0];return {...c,key:c.inventoryRef,modeScore:c.modeScores?.[formatId],reasons:c.disabledReasons,quantity:{owned:copies.length,available:copies.filter(c=>c.eligible).length,locked:copies.filter(c=>c.disabledReasons.some(r=>r.code==='ITEM_LOCKED')).length}};});step='reserve';selected=[];page=0;pickerStates.reserve.pack=null;pickerStates.reserve.scroll={};paint();
    }
    function paint(){
      if(!active())return;const savedScroll=ctx.body.scrollTop;root.hidden=false;root.replaceChildren();choiceBar.replaceChildren();
      if(series?.unsupported){root.append(el('p',{text:series.message}));return;}
      if(pending){root.append(button('核对上次操作',async()=>{const r=await ctx.query('operations.get',{requestId:pending.requestId});if(!active())return;if(r.ok&&r.data.status==='succeeded'){pending=null;await reload();}else if(r.ok&&r.data.status==='failed'){pending=null;error(r.data.result);}else message.textContent='结果尚未确认，请保留本页并稍后核对。';}));}
      if(step==='format'){
        if(rooms.ok){const lobby=el('div',{class:'v7-room-list','data-room-list':'true'});root.append(el('div',{class:'v7-actions'},[el('h3',{text:'店内房间'}),button('刷新房间',async()=>{const r=await ctx.query('combat.rooms');if(active()&&r.ok){rooms.data=r.data;paint();}})]),lobby);for(const r of rooms.data.items)lobby.append(el('div',{class:'v7-actions'},[el('span',{text:(r.background?'顾客对局':'你的房间')+' · '+(r.formatLabel||r.formatId)+' · '+r.opponentName}),button('查看备战池',()=>openRoomPools(app,r))]));if(!rooms.data.items.length)lobby.append(el('p',{class:'small',text:'暂无房间。选择模式并创建，或使用原等待报名。'}));}
        if(app.snapshot().clock.phase!=='open')root.append(el('p',{text:'开门营业后即可约战，现在可以先查看赛制和调整桌费。'}));
        root.append(el('p',{class:'small',text:'创建房间后先公开对手的固定备战池，再确认你的武将。普通约战由对手付桌费，高手挑战免费。'}));const picker=el('div');root.append(picker);
        renderFormatPicker({mount:picker,options:formats,selectedId:formatId,onSelect:id=>{formatId=id;paint();}});
        const select=el('select',{'aria-label':'约战对手'}),actors=app.actors().filter(n=>!['actor:owner','player'].includes(n.actorId)&&!n.currentMatchId&&!n.currentRoomId&&(!n.specialist||n.allyId||challenges.ok&&n.actorId===challenges.data.activeChallenge?.actorId||longTerm.ok&&longTerm.data.debt?.status==='accepted'&&n.actorId===longTerm.data.debt.actorId));
        select.append(el('option',{value:'',text:'自动寻找持卡足够的对手'}));for(const n of actors)select.append(el('option',{value:n.actorId,text:n.name+(n.specialist?' · 高手':'')}));select.value=opponentId||'';select.onchange=()=>{opponentId=select.value||null;message.textContent='';paint();};
        if(opponentId&&opponentId===challenges.data?.activeChallenge?.actorId&&challenges.data?.activeChallenge?.status==='accepted')root.append(el('p',{class:'small',text:'本次为高手挑战，可自由选择三种赛制；赢下整场即可解锁供货。'}));
        root.append(el('div',{class:'v7-actions'},[select,button('创建房间并选将',loadReserve,app.snapshot().clock.phase!=='open')]));
        root.append(el('div',{class:'v7-actions'},[button('开桌费与等待报名',()=>{ctx.handle.close();openLegacy(app,options);}),button('经营伙伴',()=>{ctx.handle.close();app.openPanel('allies');})]));
      }else if(step==='reserve'){
        const format=formats.find(f=>f.formatId===formatId);roomHeader();root.append(el('h3',{text:format.label+' · 选择 '+format.reservePerSide+' 名备战武将'}));
        if(!room)root.append(button('返回选择赛制',()=>{step='format';paint();}));else root.append(button('取消房间 / 更换模式',async()=>{const r=await submit('combat.room.cancel',{roomId:room.roomId,expectedRevision:room.revision,proof:room.proof});if(r?.ok){room=null;series=null;room=null;step='format';selected=[];paint();}}),button('收起房间，继续经营',()=>ctx.handle.close()));
        grid(items,format.reservePerSide,async()=>{const r=room?await submit('combat.room.prepare',{roomId:room.roomId,reserveRefs:[...selected],expectedRevision:room.revision,proof:room.proof}):await submit('combat.prepareSeries',{formatId,reserveRefs:[...selected],tableId:options.tableId,opponentId});if(r?.ok){if(room){room=r.data;series=room.series;}else series=r.data;step='series';selected=[];page=0;paint();}},'确认整场备战');
      }else if(series){
        roomHeader();const banner=seriesBanner(series),role=sideSwapNote({...series,roles:series.round.roles});
        root.append(el('h3',{text:`${series.opponentName||'牌友'} · ${banner.scoreLabel} · ${banner.phaseLabel}`}),role?el('p',{text:role}):el('span'));
        if(series.phase==='selecting'){
          const requirement=roundSelectionRequirement(series);if(roundPickerId!==series.round.roundId){roundPickerId=series.round.roundId;pickerStates.round.pack=null;pickerStates.round.scroll={};}const pool=series.reserveItems.map(c=>({...c,key:c.inventoryRef,modeScore:scoreFor(c,series.formatId,requirement.myRole),eligible:true,reasons:[],quantity:{owned:1,available:1}}));
          if(series.formatId==='kof'){for(let i=1;i<pool.length;i++){pool[i].eligible=false;pool[i].reasons=[{message:'接力顺序已按备战选择顺序确定'}];}if(!selected.length)selected.push(pool[0].key);root.append(el('p',{text:'KOF 接力顺序：'+pool.map(c=>c.name).join(' → ')}));}
          root.append(el('p',{class:'small',text:`选择本局上场的 ${requirement.picks} 名武将：第一个是你操作的主将${requirement.picks>1?'，第二个是 AI 队友':''}。`}));
          grid(pool,requirement.picks,async()=>{const intent=buildSelectRoundIntent({seriesView:series,selection:selected});const r=await submit(intent.type,intent.payload);if(r?.ok){series=r.data;selected=[];page=0;paint();}},'确认本局选将','round');
          root.append(button(series.round.index===1?'取消准备':'整场认输',async()=>{const r=await submit(series.round.index===1?'combat.cancel':'combat.surrender',{matchId:series.matchId});if(r?.ok){series=r.data;paint();}}));
        }else if(series.phase==='confirmed'){
          const names=(series.round.seats||[]).filter(s=>s.teamId==='mine').map(s=>(s.controller==='human'?'主将（你）':'AI 队友')+'：'+(series.reserveItems.find(c=>c.generalId===s.generalId)?.name||s.generalId)).join('；');
          root.append(el('p',{'data-roster-locked':'true',text:'本局阵容已锁定。'+names}));choiceBar.append(el('span',{text:'阵容已锁定，点击开始进入牌局。'}),button('开始本局',mountRound));
        }
        else if(['live','mounting'].includes(series.phase)){
          root.append(button(mounted?'返回牌局':'载入牌局',()=>mounted?(root.hidden=true,battle.hidden=false):mountRound()));
          if(!mounted&&!mounting)message.textContent='牌局已准备好，点击载入继续。';
        }else if(series.phase==='interrupted'){
          // 异步中断（引擎超时/报错/赛果冲突）不会走 mount 的 catch，只会把 code 落在这里；
          // 所以按 code 给出与同步失败一致的标题和说明，而不是只显示一行 reason。
          const interrupted=series.interrupt||{};
          const info=interrupted.code?classifyMountError({code:interrupted.code,message:interrupted.reason})
            :{title:'牌局已中断',kind:'unknown',detail:interrupted.reason||''};
          const hint=info.kind==='technical'?'这是技术中断：可以重开当前小局继续，阵容与比分保留，不会重复扣费。'
            :info.kind==='conflict'?'同一小局收到不同赛果，已停止结算；重开不会记为胜利，也不会抹掉已结算小局。'
            :'这一局无法继续，可以重开当前小局或放弃系列赛。';
          root.append(el('div',{class:'note-card',dataset:{v7Interrupt:interrupted.code||'unknown'}},[
            el('p',{class:'note-card__title',text:info.title}),
            el('p',{class:'small',text:(interrupted.reason?interrupted.reason+'。':'')+hint}),
          ]),button('重开当前小局',async()=>{const r=await submit('combat.restartRound',{matchId:series.matchId});if(r?.ok){series=r.data;selected=[];paint();}}),button('放弃系列赛',async()=>{const r=await submit('combat.abandon',{matchId:series.matchId});if(r?.ok){series=r.data;paint();}}));
        }
        else root.append(el('p',{text:series.officialResult?.result==='win'?series.challengeKind==='stage-challenge'?'挑战成功：新主题已解锁，伙伴已加入！':series.challengeKind==='debt-challenge'?`获胜！本期抵扣 ${series.debtRelief||0} 币借款。请在经营目标中查看剩余还款，完成首期约定后再开启下一阶段。`:'你赢下了这场比赛。':series.officialResult?.result==='loss'?'本次未获胜。高手挑战可以再次交谈重试或改天再战。':'比赛已取消。'}),button('返回牌桌',()=>{series=null;room=null;step='format';selected=[];paint();}));
      }
      if(series?.phase==='finished'&&['stage-challenge','debt-challenge'].includes(series.challengeKind)&&series.officialResult?.result==='loss'){
        const lostMatch=series.matchId;
        choiceBar.append(button('再战一局（重新选将）',async()=>{const r=await submit('challenges.rematch',{matchId:lostMatch});if(r?.ok){opponentId=r.data.opponentId;series=null;room=null;selected=[];step='format';paint();}}),button('明日再战',async()=>{const r=await submit('challenges.defer',{matchId:lostMatch});if(r?.ok){if(r.data.gift)app.toast('success','高手赠礼',r.data.gift.name+' ×1 已放入仓库');ctx.handle.close();}}));
      }
      if(series&&['live','mounting','confirmed'].includes(series.phase))root.append(button('整场认输',async()=>{const r=await submit('combat.surrender',{matchId:series.matchId});if(r?.ok){await stopBattle();series=r.data;paint();}}));
      if(series?.cancellationOffer?.available)root.append(button('取消连续平局的比赛',async()=>{const r=await submit('combat.cancel',{matchId:series.matchId,reason:'draw-cancellation'});if(r?.ok){await stopBattle();series=r.data;paint();}}));
      if(mountIssue&&['live','mounting','confirmed'].includes(series?.phase)){
        const action=mountErrorAction(mountIssue),box=el('div',{class:'note-card',dataset:{v7MountIssue:mountIssue.kind}},[
          el('p',{class:'note-card__title',text:mountIssue.title}),
          el('p',{class:'small',text:mountIssue.detail}),
          el('p',{class:'small muted',text:mountIssue.retryable?'这是技术中断：阵容与比分保留，重试不会重复扣费或改判。':'重试不会改变结果，请按上面的提示处理。'}),
        ]);
        if(action?.id==='retry')box.append(el('div',{class:'toolbar'},[button(action.label,()=>{mountIssue=null;paint();void mountRound();})]));
        root.append(box);
      }
      ctx.body.scrollTop=savedScroll;paintControls();if(mounted&&!menuOpen)root.hidden=true;
    }
    function roomHeader(){if(!room)return;const end=room.expiresAt%1440,until=Number.isFinite(end)?String(Math.floor(end/60)).padStart(2,'0')+':'+String(Math.floor(end%60)).padStart(2,'0'):null;const header=el('div',{class:'v7-room-summary','data-combat-room':room.roomId},[el('strong',{text:(room.roomLabel||'房间')+' · '+room.formatLabel+' · '+room.opponentName}),el('span',{class:'small',text:'我方'+(room.readiness.mine?'已确认':'待确认')+' · 对手'+(room.readiness.enemy?'已准备':'等待入房')+' · 备战池 '+room.pools.enemy.length+'/'+room.capacity+' · 桌费 '+app.formatMoney(room.tableFee)+(room.kind!=='friendly'?'（免费）':'（对手整场一次）')}),button('查看对方备战池',()=>openRoomPools(app,room),!room.pools.enemy.length)]);if(!room.readiness.enemy)header.append(el('p',{text:room.waitReason||'等待持卡足够且空闲的顾客入房；可以收起窗口继续经营。'}));if(until&&!room.matchId)header.append(el('span',{class:'small',text:'待开局房间保留至 '+until+'，或打烊时关闭'}));root.append(header);}
    function paintControls(){
      head.replaceChildren();if(!series)return;
      if(mounted){if(room)head.append(button('对方备战池',()=>openRoomPools(app,room)));head.append(button('比赛选项',()=>{menuOpen=!menuOpen;root.hidden=!menuOpen;battle.hidden=false;}));}
      const report=series.control,seats=report?.seats||[],primary=series.round.seatSkeleton.find(s=>s.controller==='human'),ally=series.round.seatSkeleton.find(s=>s.teamId==='mine'&&s.controller==='ai');
      if(!ally||!mounted)return;
      const primaryAlive=seats.find(s=>s.seatId===primary?.seatId)?.alive!==false,allyAlive=seats.find(s=>s.seatId===ally.seatId)?.alive!==false,controlled=report?.control?.activeSeatId||seats.find(s=>s.controlled)?.seatId||primary.seatId;
      const info=takeoverControlInfo(series,{myMainAlive:primaryAlive,allyAlive,control:{controller:controlled===ally.seatId?'human':'ai',pendingSeatId:report?.control?.pendingSeatId}});
      head.append(el('span',{class:'small',text:info.statusText}),button('接管队友',()=>control('takeover',ally.seatId),!info.canTakeover),button('交还 AI',()=>control('release'),!info.canRelease||!primaryAlive));
    }
    async function control(action,seatId){try{await app.host.battle.control({matchId:series.matchId,action,seatId,requestId:newRequestId('ally-control')});}catch(e){message.textContent=e.message;}}
    ctx.foot.prepend(head);
    const poll=setInterval(()=>{if(room&&!series&&active())void reload();},1000);
    const off=app.host.subscribe(event=>{if(event.type==='battleStatusChanged'&&active())void reload();if(event.type==='worldReset')ctx.handle.close();});
    ctx.onCleanup(()=>{disposed=true;clearInterval(poll);off();void stopBattle();});
    const listed=await ctx.query('combat.formats');if(!active())return;if(!listed.ok){error(listed);return;}formats=formatOptions(listed.data);
    const [challenges,longTerm]=await Promise.all([ctx.query('challenges.status'),ctx.query('longTerm.status')]);if(!active())return;if(!room&&challenges.ok&&challenges.data.activeChallenge?.status==='accepted'&&options.opponentId===challenges.data.activeChallenge.actorId){formatId=challenges.data.activeChallenge.formatId;opponentId=challenges.data.activeChallenge.actorId;}
    if(step==='reserve')await loadReserve();else paint();
  }});
}

export {openAllies} from '../ui/partners.mjs';
