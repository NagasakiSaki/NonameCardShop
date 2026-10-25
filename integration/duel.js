/* Supported preload adapter; vendor rules/files remain unchanged on disk. */
export function installCollectionDuel(context, options, notify) {
  const {lib,game,ui,get,_status}=context;
  lib.onload2.push(()=>{
    const identity=lib.imported.mode.identity;
    identity.game.checkResult=function(){};
    identity.element.player.dieAfter=function(){};
    identity.element.player.dieAfter2=function(){};
    identity.game.chooseCharacter=function chooseShopRoster(){
      lib.init.onfree();
      return game.createEvent('chooseCharacter',false).setContent(async()=>{
        const {roster,opponentRoster,mode,first,initialHand,firstDrawPenalty}=options;
        if(game.players.length!==2)throw new Error('赛制需要双方各一名角色');
        if(![...roster,...opponentRoster].every(id=>lib.character[id]))throw new Error('阵容中有武将未能载入');
        const enemy=game.players.find(p=>p!==game.me),teams=[{player:game.me,ids:roster,index:0,hand:[],side:'mine'},{player:enemy,ids:opponentRoster,index:0,hand:[],side:'enemy'}];
        game.zhu=game.me;game.fan=enemy;
        game.me.identity='zhu';enemy.identity='fan';
        for(const team of teams){const p=team.player;p.isZhu=false;p.init(team.ids[0]);p.identityShown=true;p.ai.shown=1;p.setIdentity();p._shopGeneration=0;}
        const firstPlayer=teams[first].player;_status.firstAct2=firstPlayer;
        _status.characterlist=Object.keys(lib.character).filter(id=>![...roster,...opponentRoster].includes(id));
        ui.arena.classList.remove('choose-character','only_dialog');game.no_continue_game=true;
        // Exposed engine-side state is for replay/debugging, never shop inventory.
        game.shopDuel={mode,teams,pending:new Set(),scheduled:false,firstDrawDone:false,finalised:false};
        const nativeGameDraw=game.gameDraw.bind(game);
        game.gameDraw=(player)=>nativeGameDraw(player,initialHand);
        function anchorFor(event){let current=event,anchor=event;while(current?.parent){current=current.parent;if(['useCard','damage','loseHp','dying','die'].includes(current.name))anchor=current;if(['phase','phaseLoop','game'].includes(current.name))break;}return anchor;}
        function scheduleReplacement(event){
          const duel=game.shopDuel;if(duel.scheduled||duel.finalised)return;duel.scheduled=true;
          const anchor=anchorFor(event),next=game.createEvent('shopRelayBoundary',false,anchor);anchor.next.remove(next);anchor.after.push(next);next.forceDie=true;
          duel.boundaryAnchor=anchor;
          next.setContent(async()=>{
            duel.scheduled=false;const dead=teams.filter(t=>t.player.isDead());
            if(!dead.length)return;
            const eliminated=teams.filter(t=>t.player.isDead()&&(mode!=='kof'||t.index+1>=t.ids.length));
            if(eliminated.length){duel.finalised=true;for(const t of dead)for(const card of t.hand)ui.discardPile.appendChild(card);game.over(eliminated.length===2?undefined:eliminated[0].side!=='mine');return;}
            // Mark all returning seats alive before revive(), whose seat walk assumes an alive neighbour.
            for(const t of dead){t.player.classList.remove('dead');game.players.add(t.player);game.dead.remove(t.player);}
            for(const t of dead){
              const p=t.player,oldGeneral=p.name;t.hand=[];t.index++;
              p.revive(null,false);p.uninit();p.init(t.ids[t.index]);p.isZhu=false;p.identity=t.side==='mine'?'zhu':'fan';p.identityShown=true;p.ai.shown=1;p.setIdentity();p._shopGeneration=t.index;
              await p.draw(4);p.update();
              game.addVideo('reinit',p,[p.name,p.node.identity.dataset.color]);game.log(p,'接替',get.translation(oldGeneral),'登场，重新摸四张牌');
              notify('replacement',{side:t.side,index:t.index,oldGeneral,newGeneral:p.name,inherited:0,drawn:4,handPolicy:'fresh-four'});
              game.triggerEnter(p);
              if(_status.roundStart===p||!_status.roundStart?.isAlive())_status.roundStart=firstPlayer;
            }
            duel.pending.clear();
          });
        }
        const originalDie=lib.element.content.die;
        if(!Array.isArray(originalDie)||originalDie.length!==6)throw new Error('引擎死亡流程版本不匹配，已停止启动自定义赛制');
        lib.element.content.die=async(event,trigger,player)=>{
          const team=teams.find(t=>t.player===player);
          await originalDie[0](event,trigger,player);await originalDie[1](event,trigger,player);await originalDie[2](event,trigger,player);
          if(team&&player.isDead()&&!event.reserveOut){
            notify('defeated',{side:team.side,index:team.index,general:player.name});
            // The native death steps discard the old general's cards. Never reserve them for a successor.
            const phase=event.getParent('phase');if(phase?.name==='phase'&&phase.player===player)phase.finish();
            game.shopDuel.pending.add(team.side);
          }
          await originalDie[3](event,trigger,player);await originalDie[4](event,trigger,player);await originalDie[5](event,trigger,player);
          if(team&&player.isDead()&&!event.reserveOut)scheduleReplacement(event);
        };
        lib.skill._shop_first_draw={trigger:{global:'phaseDrawBegin2'},forced:true,popup:false,silent:true,charlotte:true,priority:1000,
          filter(event){return !game.shopDuel.firstDrawDone&&event.player===firstPlayer;},
          async content(event,trigger){game.shopDuel.firstDrawDone=true;if(!trigger.numFixed)trigger.num=Math.max(0,trigger.num-firstDrawPenalty);}};
        lib.skill._packer_bridge={trigger:{global:['phaseBefore','useCardAfter','damageEnd']},forced:true,popup:false,silent:true,charlotte:true,priority:-10000,
          async content(event,trigger){notify('playing',{round:game.roundNumber||1,phase:trigger.name,players:teams.map(t=>({name:t.player.name,hp:t.player.hp,maxHp:t.player.maxHp,hand:t.player.countCards('h'),index:t.index,side:t.side}))});}};
        game.addGlobalSkill('_shop_first_draw');game.addGlobalSkill('_packer_bridge');
        notify('ready',{general:roster[0],opponent:opponentRoster[0],mode,engine:lib.version});
        if(options.background){_status.auto=true;game.pause2();}
      });
    };
  });
}
