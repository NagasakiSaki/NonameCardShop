/* Browser adapter: the combat model owns scores; isolated noname owns card resolution. */
let activeBattle=null,engineRuntime=null,battleLoadTimer=null,battleReturnFocus=null,setupRegular=null,battleLaunchPending=false;
const BATTLE_HISTORY_KEY='noname-packer-battles-v1';
function battleHistory(){try{const value=JSON.parse(localStorage.getItem(BATTLE_HISTORY_KEY));return Array.isArray(value)?value:[];}catch{return [];}}
const currentMatch=()=>state.modules.combat.data.active;
function combatCommand(command,payload){const result=ShopModules.dispatch(state,`combat.${command}`,payload);if(result.ok)store.save(state);return result;}
async function getEngineRuntime(){let response;try{response=await fetch('/api/runtime',{signal:AbortSignal.timeout(6000)});}catch{throw new Error('连接不到本地对战服务。请启动游戏目录中的 start.cmd，等待服务就绪后再试。');}if(!response.ok)throw new Error('对局服务响应异常，请重新运行 start.cmd');const runtime=await response.json();if(!runtime.ready)throw new Error('原版引擎文件尚未准备完成');if(runtime.integrationVersion!==2)throw new Error('当前后台服务版本较旧，请关闭旧服务并重新运行 start.cmd，然后刷新页面。');engineRuntime=runtime;return runtime;}
function battleSelects(prefix){return [$(prefix),$(prefix+'2'),$(prefix+'3')];}
function setBattleMode(){
  const mode=$('#battleMode').value;document.querySelectorAll('.kof-field').forEach(el=>el.hidden=mode!=='kof');
  const owned=DATA.cards.filter(c=>state.collection[c.id]&&ShopModules.get('combat').config.legalIds.includes(c.id));
  $('#battleStart').disabled=owned.length<(mode==='kof'?3:1);$('#battleRanked').disabled=mode!=='kof';if(mode!=='kof')$('#battleRanked').checked=false;
  $('#battleRulesNote').textContent=mode==='kof'?'登记三名不同人物并锁定顺序。新将满体力、只继承剩余手牌；对手与牌堆延续。不消耗收藏。':'整场固定一名武将，先赢两局；每局满血、重新发牌与洗牌，有胜负后轮换先手。平局不计分并重赛。';
  if(owned.length<(mode==='kof'?3:1)&&owned.length)$('#battleRulesNote').textContent+=' 背包需保留三名合法武将；目前可以先玩 BO3。';
}
function openBattleSetup(preselectedId,options={}){
  if(!DATA)return;for(const id of ['shopPanel','managementPanel','taskBoard'])if($('#'+id)?.open)$('#'+id).close();if(!$('#overlay').hidden)closeOverlay();
  const cfg=ShopModules.get('combat').config,owned=DATA.cards.filter(c=>state.collection[c.id]&&cfg.legalIds.includes(c.id)).sort((a,b)=>a.name.localeCompare(b.name,'zh'));
  battleSelects('#battleGeneral').forEach((select,i)=>{select.replaceChildren();owned.forEach(c=>select.add(new Option(`${c.name} · ${RARITY[c.rarity].label}`,c.id)));if(owned.length)select.value=owned[i%owned.length].id;});
  if(owned.some(c=>c.id===preselectedId))$('#battleGeneral').value=preselectedId;
  const legal=cfg.legalIds.map(id=>byId.get(id));battleSelects('#battleOpponent').forEach((select,i)=>{select.replaceChildren();legal.forEach(c=>select.add(new Option(c.name,c.id)));select.value=cfg.defaultOpponentKof[i];});
  if(options.opponent&&cfg.legalIds.includes(options.opponent))$('#battleOpponent').value=options.opponent;
  setupRegular=options.regularId||null;$('#battleMode').value=options.mode||cfg.defaultMode;$('#battleRanked').checked=!!options.ranked;
  const saved=$('#savedRosters');saved.replaceChildren(new Option('载入阵容…',''));state.modules.inventory.data.rosters.forEach((r,i)=>saved.add(new Option(r.name,String(i))));
  $('#battleEmpty').hidden=owned.length>0;$('#battleForm').hidden=!owned.length;setBattleMode();
  const last=state.modules.combat.data.history.at(-1);$('#battleLast').textContent=last?`上次比赛：${last.mode==='kof'?'KOF':'BO3'} · ${{win:'获胜',loss:'落败',draw:'平局'}[last.result]}${last.mode==='bo3'?` · ${last.wins}:${last.losses}`:''}`:'';
  const pending=currentMatch(),root=$('#battleResume');root.replaceChildren();
  if(pending&&pending.status!=='finished'){
    const p=document.createElement('p');p.textContent=`未结束：${pending.mode==='kof'?'KOF 三将接力':`BO3 ${pending.wins}:${pending.losses}`} · ${pending.status==='awaitingNext'?'等待下一局':'上次对局已中断，可从本局开头继续'}`;
    const resume=document.createElement('button');resume.className='btn';resume.textContent='继续已登记比赛';resume.onclick=()=>startCurrentBout();
    const abandon=document.createElement('button');abandon.className='btn plain';abandon.textContent='退赛并清除登记';abandon.onclick=()=>{if(confirm('退赛判整场落败，已支付报名费不退。')){combatCommand('withdraw');openBattleSetup(preselectedId,options);}};
    root.append(p,resume,abandon);$('#battleStart').disabled=true;
  }
  if(!$('#battleSetup').open)$('#battleSetup').showModal();
}
async function launchBattle(general=null,opponent=null){
  if(!general)return launchClassic();
  const mode=$('#battleMode').value,n=mode==='kof'?3:1,roster=battleSelects('#battleGeneral').slice(0,n).map(s=>s.value),opponentRoster=battleSelects('#battleOpponent').slice(0,n).map(s=>s.value),ranked=$('#battleRanked').checked;
  const id=crypto.randomUUID(),commands=[{command:'combat.create',payload:{id,mode,roster,opponentRoster,ranked,first:Math.random()<.5?0:1,regularId:setupRegular}}];
  if(ranked){commands[0].payload.opponentRoster=[...ShopModules.get('tournaments').config.opponentRoster];commands.push({command:'tournaments.register',payload:{matchId:id,roster}});}
  const result=ShopModules.batch(state,commands);if(!result.ok){$('#battleLast').textContent=result.error;return;}store.save(state);await startCurrentBout();
}
function showBattle(url,title){
  battleReturnFocus=document.activeElement;if($('#battleSetup').open)$('#battleSetup').close();$('#battleHeading').textContent=title;$('#battleStatus').textContent='正在载入原版引擎…';$('#battleScreen').hidden=false;document.body.classList.add('in-battle');$('#battleFrame').src=url.href;$('#battleNext').hidden=true;$('#battleBack').focus();
  clearTimeout(battleLoadTimer);battleLoadTimer=setTimeout(()=>{if(activeBattle&&!activeBattle.started)$('#battleStatus').textContent='载入时间较长，可以返回小店后继续已登记比赛。';},45000);
}
async function startCurrentBout(){
  const m=currentMatch();if(!m||m.status==='finished'||battleLaunchPending)return;battleLaunchPending=true;$('#battleStart').disabled=true;$('#battleNext').disabled=true;
  try{
    const runtime=await getEngineRuntime(),gameId=crypto.randomUUID(),result=combatCommand('begin',{gameId});if(!result.ok)throw new Error(result.error);
    const current=currentMatch(),url=new URL(runtime.engineOrigin);for(const [key,value] of Object.entries({packer:1,match:gameId,parentOrigin:location.origin,general:current.roster[0],opponent:current.opponentRoster[0],duelMode:current.mode,roster:JSON.stringify(current.roster),opponentRoster:JSON.stringify(current.opponentRoster),first:current.first,initialHand:current.rules.initialHand,firstDrawPenalty:current.rules.firstDrawPenalty}))url.searchParams.set(key,String(value));
    activeBattle={matchId:current.id,gameId,general:current.roster[0],opponent:current.opponentRoster[0],started:false,finished:false,classic:false};
    showBattle(url,current.mode==='kof'?`KOF · ${current.roster.map(id=>byId.get(id).name).join(' → ')}`:`BO3 · ${byId.get(current.roster[0]).name} vs ${byId.get(current.opponentRoster[0]).name} · ${current.wins}:${current.losses}`);
    $('#battleRestart').textContent=current.mode==='kof'?'认输整场':'认输本局';$('#battleRestart').disabled=false;
  }catch(error){if(currentMatch()?.status==='running')combatCommand('interrupt');$('#battleLast').textContent=error.message;}
  finally{battleLaunchPending=false;$('#battleStart').disabled=false;$('#battleNext').disabled=false;}
}
async function launchClassic(){try{const runtime=await getEngineRuntime(),gameId=crypto.randomUUID(),url=new URL(runtime.engineOrigin);url.searchParams.set('packer','1');url.searchParams.set('match',gameId);url.searchParams.set('parentOrigin',location.origin);activeBattle={gameId,matchId:gameId,classic:true,started:false,finished:false};showBattle(url,'无名杀 · 原版模式大厅');$('#battleRestart').textContent='重新打开大厅';$('#battleRestart').disabled=false;}catch(e){$('#battleLast').textContent=e.message;}}
function updateBattleResult(result,round=0){
  if(!activeBattle||activeBattle.finished)return;
  const out=combatCommand('result',{gameId:activeBattle.gameId,result,round});if(!out.ok)return;activeBattle.finished=true;clearTimeout(battleLoadTimer);
  const m=currentMatch(),label={win:'获胜',loss:'落败',draw:'平局'}[result];
  $('#battleHeading').textContent=m.mode==='bo3'?`BO3 · ${m.wins}:${m.losses}`:'KOF · 三将接力';
  $('#battleStatus').textContent=m.status==='finished'?`整场${{win:'获胜',loss:'落败',draw:'平局'}[m.result]}${m.ranked?' · 店赛奖励已结算':''}`:`本局${label} · 比分 ${m.wins}:${m.losses}${result==='draw'?' · 平局重赛':''}`;
  $('#battleNext').hidden=m.status!=='awaitingNext';$('#battleNext').textContent=result==='draw'?'平局重赛':'开始下一局';$('#battleRestart').disabled=true;
  const history=battleHistory();history.push({matchId:m.id,gameId:activeBattle.gameId,general:m.roster[0],opponent:m.opponentRoster[0],mode:m.mode,result,round,playedAt:new Date().toISOString()});localStorage.setItem(BATTLE_HISTORY_KEY,JSON.stringify(history.slice(-100)));
}
function leaveBattle(){
  if(activeBattle&&!activeBattle.classic&&!activeBattle.finished){if(activeBattle.started){if(!confirm('退出正在进行的比赛将判整场退赛。是否返回小店？'))return;combatCommand('withdraw');}else combatCommand('interrupt');}
  else if(activeBattle?.classic&&activeBattle.started&&!activeBattle.finished&&!confirm('退出原版对局并返回小店？'))return;
  clearTimeout(battleLoadTimer);activeBattle=null;$('#battleFrame').src='about:blank';$('#battleScreen').hidden=true;document.body.classList.remove('in-battle');if(battleReturnFocus?.isConnected)battleReturnFocus.focus();
}
window.addEventListener('message',event=>{
  const message=event.data;if(!activeBattle||event.origin!==engineRuntime?.engineOrigin||event.source!==$('#battleFrame').contentWindow||message?.channel!=='noname-packer'||message.matchId!==activeBattle.gameId)return;
  if(message.type==='loading')$('#battleStatus').textContent=message.text;
  if(message.type==='error')$('#battleStatus').textContent=/failed to fetch|fetch dynamically imported module|networkerror/i.test(message.text||'')?'引擎资源连接失败。请确认 start.cmd 仍在运行，刷新页面后继续已登记比赛。':`引擎提示：${message.text}`;
  if(message.type==='restart-request'){$('#battleRestart').click();return;}
  if(message.type==='ready'||message.type==='playing'){
    activeBattle.started=true;clearTimeout(battleLoadTimer);if(!activeBattle.finished){$('#battleRestart').disabled=false;const m=currentMatch();$('#battleStatus').textContent=activeBattle.classic?'原版模式 · 可在引擎菜单中设置':m.mode==='kof'?`先锋 / 中坚 / 大将 · 我方 ${m.progress.mine+1}/3 · 对方 ${m.progress.enemy+1}/3 · 第 ${message.round||1} 轮`:`比分 ${m.wins}:${m.losses} · 第 ${m.bout} 局 · 第 ${message.round||1} 轮`;}
  }
  if(message.type==='replacement'&&!activeBattle.classic)combatCommand('progress',{gameId:activeBattle.gameId,side:message.side,index:message.index,oldGeneral:message.oldGeneral,newGeneral:message.newGeneral,inherited:message.inherited});
  if(message.type==='defeated'&&!activeBattle.classic)combatCommand('defeated',{gameId:activeBattle.gameId,side:message.side,index:message.index,general:message.general});
  if(message.type==='result'&&['win','loss','draw'].includes(message.result)){
    if(activeBattle.classic){activeBattle.finished=true;$('#battleStatus').textContent='原版对局已结束';}else updateBattleResult(message.result,message.round);
  }
});
$('#battleBtn').onclick=()=>openBattleSetup();$('#battleSetupClose').onclick=()=>$('#battleSetup').close();$('#battleMode').onchange=setBattleMode;
$('#battleGetCards').onclick=()=>{$('#battleSetup').close();ManagementUI.show('orders');};
$('#battleForm').onsubmit=event=>{event.preventDefault();launchBattle($('#battleGeneral').value,$('#battleOpponent').value);};
$('#classicBattle').onclick=()=>launchClassic();$('#battleBack').onclick=leaveBattle;$('#battleNext').onclick=()=>startCurrentBout();
$('#battleRestart').onclick=()=>{if(!activeBattle)return;if(activeBattle.classic){launchClassic();return;}if(!activeBattle.started||activeBattle.finished)return;if(confirm('确认认输本局？BO3 会保留比分，KOF 将结束整场。')){updateBattleResult('loss',0);$('#battleFrame').src='about:blank';}};
$('#saveRoster').onclick=()=>{const ids=battleSelects('#battleGeneral').map(s=>s.value),result=ShopModules.dispatch(state,'inventory.saveRoster',{name:$('#rosterName').value.trim(),ids});if(!result.ok){$('#battleLast').textContent=result.error;return;}store.save(state);const select=$('#savedRosters');select.replaceChildren(new Option('载入阵容…',''));state.modules.inventory.data.rosters.forEach((r,i)=>select.add(new Option(r.name,String(i))));$('#battleLast').textContent='阵容已保存；登记比赛时会再次检查持有与赛制合法性。';};
$('#savedRosters').onchange=()=>{const r=state.modules.inventory.data.rosters[Number($('#savedRosters').value)];if($('#savedRosters').value===''||!r)return;battleSelects('#battleGeneral').forEach((select,i)=>select.value=r.ids[i]);$('#rosterName').value=r.name;};
