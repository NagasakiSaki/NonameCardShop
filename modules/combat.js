/* Match-level state machine. The engine owns card resolution, this owns series scores. */
(() => {
  function finish(ctx,result){
    const {save,state,emit}=ctx,m=state.active;if(m.status==='finished')return;
    m.status='finished';m.result=result;m.finishedDay=save.business.day;save.modules.inventory.data.activeRoster=[];
    state.history.push(ShopModules.clone(m));state.history=state.history.slice(-60);
    emit('matchFinished',{matchId:m.id,mode:m.mode,result,ranked:m.ranked,roster:m.roster,regularId:m.regularId});
    if(result==='win'){ShopBusiness.bump(save,'battlesWon');emit('battleWon',{matchId:m.id,mode:m.mode,general:m.roster[0],opponent:m.opponentRoster[0],ranked:m.ranked});}
  }
  const legal=(ctx,id)=>ctx.config.legalIds.includes(id)&&!!ctx.card(id);
  const family=(ctx,id)=>ctx.config.familyOverrides[id]||ctx.card(id)?.name||id;
  ShopModules.register({id:'combat',title:'对战赛制',version:1,file:'data/combat.json',defaults:()=>({active:null,history:[]}),
    validate(c,catalog){const errors=[];if(c?.version!==1)errors.push('version 必须为 1');if(!['kof','bo3'].includes(c.defaultMode)||c.bo3Wins!==2||!Number.isInteger(c.initialHand)||c.initialHand<1||c.initialHand>8||!Number.isInteger(c.firstDrawPenalty)||c.firstDrawPenalty<0||c.firstDrawPenalty>2)errors.push('赛制或起手参数不合法');if(!Array.isArray(c.legalIds)||c.legalIds.length<3||new Set(c.legalIds).size!==c.legalIds.length||catalog&&!c.legalIds.every(id=>catalog.cards.some(c=>c.id===id)))errors.push('合法将池至少包含三位存在且不同的武将');if(!Array.isArray(c.defaultOpponentKof)||c.defaultOpponentKof.length!==3||new Set(c.defaultOpponentKof).size!==3||!c.defaultOpponentKof.every(id=>c.legalIds?.includes(id)))errors.push('默认 KOF 对手需要三位合法武将');if(typeof c.allowMirrorAcrossSides!=='boolean'||!c.familyOverrides||typeof c.familyOverrides!=='object'||Array.isArray(c.familyOverrides)||!Object.values(c.familyOverrides).every(x=>typeof x==='string'))errors.push('同名与镜像规则格式不合法');return errors;},
    ready({state}){if(state.active?.status==='running')state.active.status='interrupted';},
    queries:{'combat.active'({state}){return state.active;}},
    actions:{
      create(ctx,{id,mode,roster,opponentRoster,first,ranked=false,regularId=null}){
        const {state,save,error,config}=ctx;if(state.active&&state.active.status!=='finished')return error('还有未结束的比赛，请继续或退赛');
        const n=mode==='kof'?3:mode==='bo3'?1:0;
        if(!n||typeof id!=='string'||!id||state.history.some(m=>m.id===id)||![0,1].includes(first))return error('比赛参数不合法');
        if(!Array.isArray(roster)||roster.length!==n||!roster.every(id=>legal(ctx,id)&&save.collection[id]>0)||new Set(roster.map(id=>family(ctx,id))).size!==n)return error('请选择背包中持有的不同人物，且属于合法单挑将池');
        if(!Array.isArray(opponentRoster)||opponentRoster.length!==n||!opponentRoster.every(id=>legal(ctx,id))||new Set(opponentRoster.map(id=>family(ctx,id))).size!==n)return error('AI 阵容不合法');
        if(!config.allowMirrorAcrossSides&&opponentRoster.some(id=>roster.some(p=>family(ctx,p)===family(ctx,id))))return error('本赛制不允许双方同名武将');
        if(ranked&&mode!=='kof')return error('本期店赛使用 KOF');
        state.active={id,mode,roster:[...roster],opponentRoster:[...opponentRoster],first,ranked:!!ranked,regularId,status:'prepared',wins:0,losses:0,bout:1,attempt:0,gameId:null,roundResults:[],rules:{initialHand:config.initialHand,firstDrawPenalty:config.firstDrawPenalty,bo3Wins:config.bo3Wins},createdDay:save.business.day,progress:{mine:0,enemy:0},defeated:{mine:[],enemy:[]}};
        save.modules.inventory.data.activeRoster=[...roster];return {ok:true,match:state.active};
      },
      begin(ctx,{gameId}){const {state,error,emit}=ctx,m=state.active;if(!m||!['prepared','awaitingNext','interrupted'].includes(m.status)||typeof gameId!=='string'||!gameId||m.roundResults.some(r=>r.gameId===gameId))return error('比赛不能开始或局编号重复');m.gameId=gameId;m.attempt++;m.status='running';m.progress={mine:0,enemy:0};m.defeated={mine:[],enemy:[]};emit('boutStarted',{matchId:m.id,gameId,mode:m.mode,bout:m.bout});return {ok:true,match:m};},
      defeated({state,error,emit},{gameId,side,index,general}){const m=state.active;if(!m||m.status!=='running'||m.gameId!==gameId||!['mine','enemy'].includes(side)||!Number.isInteger(index)||m[side==='mine'?'roster':'opponentRoster'][index]!==general)return error('击破事件不合法');if(m.defeated[side].includes(index))return {ok:true,duplicate:true};m.defeated[side].push(index);emit('generalDefeated',{matchId:m.id,gameId,side,index,general,mode:m.mode});return {ok:true};},
      progress({state,error,emit},{gameId,side,index,oldGeneral,newGeneral,inherited}){const m=state.active;if(!m||m.gameId!==gameId||m.status!=='running'||m.mode!=='kof'||!['mine','enemy'].includes(side)||!Number.isInteger(index)||index<1||index>2||!Number.isInteger(inherited)||inherited<0||inherited>10000)return error('换将进度不合法');if(index<=m.progress[side])return {ok:true,duplicate:true};if(index!==m.progress[side]+1||m[side==='mine'?'roster':'opponentRoster'][index]!==newGeneral)return error('换将顺序不合法');m.progress[side]=index;emit('generalReplaced',{matchId:m.id,gameId,side,index,oldGeneral,newGeneral,inherited});return {ok:true};},
      result(ctx,{gameId,result,round=0}){const {state,error,emit}=ctx,m=state.active;if(!m||m.status!=='running'||m.gameId!==gameId||!['win','loss','draw'].includes(result)||m.roundResults.some(r=>r.gameId===gameId))return error('过期或重复的对局结果');m.roundResults.push({gameId,result,round,bout:m.bout});emit('boutFinished',{matchId:m.id,gameId,mode:m.mode,result,bout:m.bout});if(m.mode==='kof'){finish(ctx,result);return {ok:true,finished:true};}if(result==='win')m.wins++;if(result==='loss')m.losses++;if(m.wins>=m.rules.bo3Wins||m.losses>=m.rules.bo3Wins){finish(ctx,m.wins>=m.rules.bo3Wins?'win':'loss');return {ok:true,finished:true};}if(result!=='draw'){m.bout++;m.first=1-m.first;}m.status='awaitingNext';return {ok:true,finished:false};},
      interrupt({state,error}){if(!state.active||state.active.status==='finished')return error('没有进行中的比赛');state.active.status='interrupted';return {ok:true};},
      withdraw(ctx){if(!ctx.state.active||ctx.state.active.status==='finished')return ctx.error('没有进行中的比赛');finish(ctx,'loss');return {ok:true,finished:true};}
    }
  });
})();
