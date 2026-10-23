/* Registration, settlement and champion demand are separate from engine rules. */
(() => {
  function settle(ctx,{matchId,result}){const {save,state,error,emit}=ctx,entry=state.entries.find(e=>e.matchId===matchId&&e.status==='registered');if(!entry||state.settled.includes(matchId)||!['win','loss','draw'].includes(result))return error('比赛未登记或已经结算');entry.status='finished';entry.result=result;state.settled.push(matchId);state.settled=state.settled.slice(-200);const win=result==='win',cash=win?entry.rewards.winCash:entry.rewards.lossCash,reputation=win?entry.rewards.winReputation:entry.rewards.lossReputation;ShopBusiness.addCash(save,cash,'tournament');save.business.reputation=Math.min(100,save.business.reputation+reputation);emit('tournamentRewarded',{matchId,result,amount:cash,reputation});return {ok:true,amount:cash};}
ShopModules.register({id:'tournaments',title:'店赛活动',version:1,file:'data/tournaments.json',defaults:()=>({entries:[],settled:[]}),
  validate(c,catalog){const errors=[];if(c?.version!==1)errors.push('version 必须为 1');if(typeof c.name!=='string'||!c.name.length||!Number.isInteger(c.weekday)||c.weekday<1||c.weekday>7||!Number.isInteger(c.minDay)||c.minDay<1)errors.push('赛事名称或日期不合法');for(const k of ['entryFee','winCash','lossCash','winReputation','lossReputation'])if(!Number.isSafeInteger(c[k])||c[k]<0||c[k]>100000)errors.push(`${k} 不合法`);if(!Array.isArray(c.opponentRoster)||c.opponentRoster.length!==3||new Set(c.opponentRoster).size!==3||catalog&&!c.opponentRoster.every(id=>catalog.cards.some(c=>c.id===id)))errors.push('对手需要三位存在的不同武将');if(!['table'].includes(c.requiredUpgrade))errors.push('需要有效的赛事设施');return errors;},
  actions:{
    register(ctx,{matchId,roster}){const {save,state,config,error,emit}=ctx,day=save.business.day;
      if(typeof matchId!=='string'||!matchId||state.entries.some(e=>e.matchId===matchId))return error('比赛登记重复');
      if(save.business.phase!=='open')return error('请在营业时举办比赛');if(day<config.minDay||(day-1)%7+1!==config.weekday)return error(`每周第 ${config.weekday} 天举办，首次为第 ${config.minDay} 天`);
      if(!ctx.value('upgrades.level',0,{id:config.requiredUpgrade}))return error('先购买店赛牌桌');
      if(state.entries.some(e=>e.day===day))return error('今天的周赛已经报名或结束');
      if(!Array.isArray(roster)||roster.length!==3||new Set(roster).size!==3||!roster.every(id=>ctx.card(id)&&save.collection[id]>0))return error('需要三名已拥有的武将');
      if(save.shop.cash<config.entryFee)return error('报名资金不足');save.shop.cash-=config.entryFee;
      const entry={matchId,day,roster:[...roster],status:'registered',entryFee:config.entryFee,rewards:{winCash:config.winCash,lossCash:config.lossCash,winReputation:config.winReputation,lossReputation:config.lossReputation}};
      state.entries.push(entry);state.entries=state.entries.slice(-60);emit('tournamentRegistered',{matchId,amount:config.entryFee});return {ok:true,entry};
    },
    settle
  },
  onEvent(ctx,event){if(event.type==='matchFinished'&&event.ranked)settle(ctx,{matchId:event.matchId,result:event.result});}
});
})();
