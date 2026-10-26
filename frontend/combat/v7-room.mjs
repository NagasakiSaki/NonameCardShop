import {openRoomPools} from './room-pools.mjs';
import {el,newRequestId} from '../ui/components.mjs';
import {fitPanel} from '../../frontend-next/services/panel-shell.mjs';
import {openCombat as openLegacy} from '../../frontend-next/screens/combat.mjs';
import {renderRosterGrid} from './roster-grid.mjs';
import {formatOptions,renderFormatPicker} from './format-picker.mjs';
import {buildSelectRoundIntent,roundSelectionRequirement} from './round-select.mjs';
import {seriesBanner,takeoverControlInfo,sideSwapNote} from './series-panel.mjs';

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
  return app.windows.open({id:'combat-v7',title:'对战房间',pauseReason:'准备牌局',width:'window--wide',render:async ctx=>{
    fitPanel(ctx);ctx.element.classList.add('v7-room');let disposed=false,busy=false,mounted=null,mountedGame=null,mounting=false,refreshing=false,menuOpen=false;
    const branch=idOf(app),active=()=>!disposed&&!ctx.handle.closed&&idOf(app)===branch;
    const message=el('p',{role:'status',class:'v7-message'}),root=el('div',{class:'v7-combat-body'}),battle=el('div',{class:'v7-battle',hidden:true}),head=el('div');ctx.body.append(message,root,battle);
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
      try{const handle=await app.host.battle.mount({container:battle,matchId:series.matchId});if(!active()){await handle.dispose();return;}mounted=handle;mountedGame=series.round.gameId;await reload();}
      catch(e){message.textContent=e.message;root.hidden=false;await reload();}finally{mounting=false;}
    }
    const preview=item=>app.openPanel('cardDetail',{cardKey:item.cardKey});
    async function favorite(item){const favorite=!item.favorite,r=await submit('player.setFavorite',{cardKey:item.cardKey,favorite});if(r?.ok){for(const c of items)if(c.cardKey===item.cardKey)c.favorite=favorite;paint();}}
    function grid(pool,max,onConfirm,label){
      const gridMount=el('div');root.append(gridMount);
      const favorites=new Set(pool.filter(c=>c.favorite).map(c=>c.key));
      function draw(){renderRosterGrid({mount:gridMount,items:pool,selected,max,page,favorites,pageSize:innerWidth<700||innerHeight<760?4:8,onToggle:item=>{
        if(item.__page!=null){page=item.__page;draw();return;}
        const found=selected.indexOf(item.key);if(found>=0)selected.splice(found,1);else if(selected.length<max&&!selected.some(ref=>pool.find(c=>c.key===ref)?.generalId===item.generalId))selected.push(item.key);else message.textContent='请先取消已选武将；同一阵营不能重复武将。';
        draw();confirm.disabled=selected.length!==max||!!room&&!room.readiness.enemy;
      },onPreview:preview,onToggleFavorite:favorite});}
      const confirm=button(label,onConfirm,selected.length!==max||!!room&&!room.readiness.enemy);root.append(confirm);draw();
    }
    async function loadReserve(){
      if(app.connection.capabilities?.battleRooms&&!room){const created=await submit('combat.room.create',{formatId,opponentId,tableId:options.tableId});if(!created?.ok)return;room=created.data;}
      const result=await ctx.query('combat.eligible',{formatId});if(!active())return;
      if(!result.ok){error(result);return;}const groups=new Map();for(const c of result.data.items){if(!groups.has(c.generalId))groups.set(c.generalId,[]);groups.get(c.generalId).push(c);}
      items=[...groups.values()].map(copies=>{const c=copies.find(c=>c.eligible)||copies[0];return {...c,key:c.inventoryRef,modeScore:c.modeScores?.[formatId],reasons:c.disabledReasons,quantity:{owned:copies.length,available:copies.filter(c=>c.eligible).length,locked:copies.filter(c=>c.disabledReasons.some(r=>r.code==='ITEM_LOCKED')).length}};});step='reserve';selected=[];page=0;paint();
    }
    function paint(){
      if(!active())return;root.hidden=false;root.replaceChildren();
      if(series?.unsupported){root.append(el('p',{text:series.message}));return;}
      if(pending){root.append(button('核对上次操作',async()=>{const r=await ctx.query('operations.get',{requestId:pending.requestId});if(!active())return;if(r.ok&&r.data.status==='succeeded'){pending=null;await reload();}else if(r.ok&&r.data.status==='failed'){pending=null;error(r.data.result);}else message.textContent='结果尚未确认，请保留本页并稍后核对。';}));}
      if(step==='format'){
        if(rooms.ok){const lobby=el('div',{class:'v7-room-list','data-room-list':'true'});root.append(el('div',{class:'v7-actions'},[el('h3',{text:'店内房间'}),button('刷新房间',async()=>{const r=await ctx.query('combat.rooms');if(active()&&r.ok){rooms.data=r.data;paint();}})]),lobby);for(const r of rooms.data.items)lobby.append(el('div',{class:'v7-actions'},[el('span',{text:(r.background?'顾客对局':'你的房间')+' · '+(r.formatLabel||r.formatId)+' · '+r.opponentName}),button('查看备战池',()=>openRoomPools(app,r))]));if(!rooms.data.items.length)lobby.append(el('p',{class:'small',text:'暂无房间。选择模式并创建，或使用原等待报名。'}));}
        if(app.snapshot().clock.phase!=='open')root.append(el('p',{text:'开门营业后即可约战，现在可以先查看赛制和调整桌费。'}));
        root.append(el('p',{class:'small',text:'创建房间后先公开对手的固定备战池，再确认你的武将。普通约战由对手付桌费，高手挑战免费。'}));const picker=el('div');root.append(picker);
        renderFormatPicker({mount:picker,options:formats,selectedId:formatId,onSelect:id=>{formatId=id;paint();}});
        const select=el('select',{'aria-label':'约战对手'}),actors=app.actors().filter(n=>!['actor:owner','player'].includes(n.actorId)&&!n.currentMatchId&&!n.currentRoomId&&(!n.specialist||n.allyId||challenges.ok&&n.actorId===challenges.data.activeChallenge?.actorId));
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
          const requirement=roundSelectionRequirement(series),pool=series.reserveItems.map(c=>({...c,key:c.inventoryRef,modeScore:c.modeScores?.[series.formatId],eligible:true,reasons:[],quantity:{owned:1,available:1}}));
          if(series.formatId==='kof'){for(let i=1;i<pool.length;i++){pool[i].eligible=false;pool[i].reasons=[{message:'接力顺序已按备战选择顺序确定'}];}if(!selected.length)selected.push(pool[0].key);root.append(el('p',{text:'KOF 接力顺序：'+pool.map(c=>c.name).join(' → ')}));}
          root.append(el('p',{class:'small',text:`选择本局上场的 ${requirement.picks} 名武将：第一个是你操作的主将${requirement.picks>1?'，第二个是 AI 队友':''}。`}));
          grid(pool,requirement.picks,async()=>{const intent=buildSelectRoundIntent({seriesView:series,selection:selected});const r=await submit(intent.type,intent.payload);if(r?.ok){series=r.data;selected=[];page=0;paint();}},'确认本局选将');
          root.append(button(series.round.index===1?'取消准备':'整场认输',async()=>{const r=await submit(series.round.index===1?'combat.cancel':'combat.surrender',{matchId:series.matchId});if(r?.ok){series=r.data;paint();}}));
        }else if(series.phase==='confirmed')root.append(button('开始本局',mountRound));
        else if(['live','mounting'].includes(series.phase)){
          root.append(button(mounted?'返回牌局':'载入牌局',()=>mounted?(root.hidden=true,battle.hidden=false):mountRound()));
          if(!mounted&&!mounting)message.textContent='牌局已准备好，点击载入继续。';
        }else if(series.phase==='interrupted')root.append(el('p',{text:(series.interrupt?.reason?series.interrupt.reason+'。':'')+'当前小局中断。重开会重新发牌，已完成的小局比分保留。'}),button('重开当前小局',async()=>{const r=await submit('combat.restartRound',{matchId:series.matchId});if(r?.ok){series=r.data;selected=[];paint();}}),button('放弃系列赛',async()=>{const r=await submit('combat.abandon',{matchId:series.matchId});if(r?.ok){series=r.data;paint();}}));
        else root.append(el('p',{text:series.officialResult?.result==='win'?series.challengeKind==='stage-challenge'?'挑战成功：新主题已解锁，伙伴已加入！':'你赢下了这场比赛。':series.officialResult?.result==='loss'?'本次未获胜。高手挑战可以再次交谈重试或改天再战。':'比赛已取消。'}),button('返回牌桌',()=>{series=null;room=null;step='format';selected=[];paint();}));
      }
      if(series&&['live','mounting','confirmed'].includes(series.phase))root.append(button('整场认输',async()=>{const r=await submit('combat.surrender',{matchId:series.matchId});if(r?.ok){await stopBattle();series=r.data;paint();}}));
      if(series?.cancellationOffer?.available)root.append(button('取消连续平局的比赛',async()=>{const r=await submit('combat.cancel',{matchId:series.matchId,reason:'draw-cancellation'});if(r?.ok){await stopBattle();series=r.data;paint();}}));
      paintControls();if(mounted&&!menuOpen)root.hidden=true;
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
    const challenges=await ctx.query('challenges.status');if(!room&&challenges.ok&&challenges.data.activeChallenge?.status==='accepted'&&options.opponentId===challenges.data.activeChallenge.actorId){formatId=challenges.data.activeChallenge.formatId;opponentId=challenges.data.activeChallenge.actorId;}
    if(step==='reserve')await loadReserve();else paint();
  }});
}

export function openAllies(app){ensureV7Styles();return app.windows.open({id:'allies-v7',title:'经营伙伴',pauseReason:'安排伙伴工作',render:async ctx=>{
  let disposed=false;ctx.onCleanup(()=>{disposed=true;});
  const result=await ctx.query('allies.list');if(disposed)return;if(!result.ok){ctx.body.append(el('p',{text:result.error.message}));return;}
  const view=result.data;ctx.body.append(el('p',{text:`当前值班 ${view.slots.used}/${view.slots.max} · 引客 +${Math.round(view.effects.attractionRate*100)}% · 收银用时 −${Math.round(view.effects.checkoutReductionRate*100)}% · 进货优惠 ${Math.round(view.effects.wholesaleDiscountRate*100)}%`}));
  if(!view.allies.length)ctx.body.append(el('p',{text:'第 3 天起会有高手来访。赢下整场挑战后，她会成为经营伙伴。'}));
  for(const ally of view.allies){const select=el('select',{'aria-label':ally.name+'工作'});for(const [value,text]of [['','休息'],['attraction','招呼顾客'],['checkout','协助收银'],['wholesale','联系供货']])select.append(el('option',{value,text}));select.value=ally.onDuty?ally.assignedDuty||ally.defaultDuty:'';
    select.onchange=async()=>{select.disabled=true;const r=await ctx.submit({requestId:newRequestId('ally-duty'),type:'allies.assign',payload:{allyId:ally.allyId,dutyId:select.value||null}});if(!disposed){if(!r.ok)app.toast('error','安排未完成',r.error.message);await ctx.handle.refresh();}};
    ctx.body.append(el('div',{class:'v7-actions'},[el('img',{src:app.manifest.characters[ally.appearanceId]?.portrait,alt:ally.name,style:{width:'52px',height:'72px',objectFit:'contain'}}),el('strong',{text:ally.name}),select]));}
}});}
