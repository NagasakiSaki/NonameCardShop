import {nativeProfile} from './profiles.mjs';
import {validateRoundPlan,digestPlan,expectedIdentity,mapNativeResult} from './round-plan.mjs';
import {createAllyControl} from './ally-control.mjs';

// Replace only native character-selection entrypoints; native start, cards, skills,
// death processing and team victory remain in the installed mode.
export async function installNativeRound(context,raw,send){
  const plan=validateRoundPlan(raw),profile=nativeProfile(plan.formatId),planHash=await digestPlan(plan);
  const {lib,game,ui,get,_status}=context,identity=expectedIdentity(plan,planHash);
  const emit=(type,data={})=>send(type,{...data,...identity});
  let control=null;
  const check=(ok,text)=>{if(!ok){emit('error',{text});throw Error(text);}};
  lib.onload2.push(()=>{
    check(lib.version===profile.engineVersion,'原生适配内核版本不匹配。');
    const mode=lib.imported.mode[profile.engineMode];
    check(mode?.game&&typeof mode.game[profile.engineMode==='doudizhu'?'chooseCharacter':'chooseCharacterTwo']==='function'&&typeof mode.element?.player?.dieAfter==='function','原生模式入口发生变化。');
    // Free viewpoint changes can select an enemy; the scoped ally control below
    // is the supported path and keeps the player's faction fixed.
    mode.game.canReplaceViewpoint=()=>false;
    mode.game[profile.engineMode==='doudizhu'?'chooseCharacter':'chooseCharacterTwo']=function chooseShopNativeSeats(){
      lib.init.onfree();
      return game.createEvent('chooseShopNativeSeats',false).setContent(async()=>{
        check(game.players.length===plan.seats.length,'原生引擎实际座位数不正确。');
        const unavailable=plan.seats.filter(s=>!Object.hasOwn(lib.character,s.generalId)||lib.filter.characterDisabled(s.generalId));
        check(!unavailable.length,'以下武将未载入或被原生模式禁用：'+unavailable.map(s=>s.generalId).join('、'));
        const humanIndex=plan.seats.findIndex(s=>s.seatId===plan.controlledSeatId),ordered=[...plan.seats.slice(humanIndex),...plan.seats.slice(0,humanIndex)];
        let current=game.me;const bindings=[];
        for(const seat of ordered){bindings.push({seat,player:current});current=current.next;}
        if(new Set(bindings.map(b=>b.player)).size!==plan.seats.length)throw Error('原生座位环无效。');
        game.no_continue_game=true;delete _status.replacetwo;
        for(const {seat,player:p}of bindings){
          p._shopSeatId=seat.seatId;p._shopTeamId=seat.teamId;
          if(profile.engineMode==='doudizhu'){p.identity=seat.role==='landlord'?'zhu':'fan';p.isZhu=seat.role==='landlord';if(p.isZhu)game.zhu=p;}
          else {p.side=seat.teamId===plan.playerTeamId;p.identity=p.side?'friend':'enemy';p.isZhu=false;}
          p.init(seat.generalId);p.identityShown=true;p.ai.shown=1;
          if(profile.engineMode==='doudizhu')p.showIdentity();
          else {p.node.identity.firstChild.textContent=p.side?'友':'敌';p.node.identity.dataset.color=p.side+'zhu';}
        }
        if(profile.engineMode==='doudizhu'){
          if(!game.zhu.isInitFilter('noZhuHp')){game.zhu.maxHp++;game.zhu.hp++;game.zhu.update();}
        }else {
          const first=bindings.find(b=>b.seat.seatId===plan.firstSeatId)?.player||bindings[plan.seed%bindings.length].player;
          _status.firstAct=first.next.side===first.side?first.next:first;
          game.addGlobalSkill('versus_viewHandcard');
        }
        _status.characterlist=Object.keys(lib.character).filter(id=>!plan.seats.some(s=>s.generalId===id));
        ui.arena.classList.remove('choose-character','only_dialog');
        let ready=false,finalised=false;
        const snapshot=()=>bindings.map(({seat,player:p})=>({seatId:seat.seatId,teamId:seat.teamId,role:seat.role,controller:seat.controller,generalId:seat.generalId,currentGeneralId:p.name1,alive:p.isAlive(),hp:p.hp,maxHp:p.maxHp,handCount:p.countCards('h'),controlled:p.isUnderControl(true)}));
        control=createAllyControl({context,plan,bindings,emit,snapshot,isFinalised:()=>finalised});
        game.shopNative={plan,planHash,profileId:profile.id,bindings,snapshot,controlState:control.state};
        const announceReady=()=>{
          if(ready||finalised)return;
          check(game.me._shopSeatId===plan.controlledSeatId&&!bindings.some(({player:p})=>p!==game.me&&p.isUnderControl(true)),'原生模式错误地接管了AI席位。');
          ready=true;emit('ready',{formatId:plan.formatId,engineMode:profile.engineMode,nativeVariant:profile.nativeVariant,seats:snapshot(),firstSeatId:_status.currentPhase?._shopSeatId||game.zhu?._shopSeatId,rules:profile.rules});
        };
        // Some legitimate skills can finish a game during gameStart. Announce
        // valid seats before those skills, rather than rejecting an early win.
        lib.skill._shop_native_ready={trigger:{global:'gameStart'},forced:true,popup:false,silent:true,charlotte:true,forceDie:true,firstDo:true,priority:1000000000,async content(){announceReady();}};
        game.addGlobalSkill('_shop_native_ready');
        lib.skill._shop_native_control_boundary={trigger:{global:'phaseBefore'},forced:true,popup:false,silent:true,charlotte:true,forceDie:true,firstDo:true,priority:1000000,async content(){control.apply();}};
        game.addGlobalSkill('_shop_native_control_boundary');
        lib.skill._shop_native_progress={trigger:{global:['phaseBefore','useCardAfter','damageEnd','dieAfter']},forced:true,popup:false,silent:true,charlotte:true,forceDie:true,priority:-100000,
          async content(){
            if(finalised)return;
            if(!ready)announceReady();
            emit('playing',{round:game.roundNumber||0,seats:snapshot()});
          }};
        game.addGlobalSkill('_shop_native_progress');
        lib.onover.push(won=>{
          if(finalised)return;finalised=true;
          if(!ready){emit('error',{text:'原生对局未就绪就结束，未产生有效赛果。'});return;}
          const enemyTeam=plan.seats.find(s=>s.teamId!==plan.playerTeamId).teamId;
          const winningTeamId=typeof won==='boolean'?(won?plan.playerTeamId:enemyTeam):null;
          emit('result',mapNativeResult({resultId:plan.gameId+':result',winningTeamId,completed:true,simulated:false,seats:snapshot(),round:game.roundNumber||0},plan));
        });
      });
    };
  });
  return {plan,profile,planHash,requestControl:message=>control?.request(message)};
}
