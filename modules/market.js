/* Calendar news changes demand/prices, never sealed contents or combat strength. */
(() => {
  const matches=(rule,kind,item)=>rule.kind===kind&&(!rule.group||rule.group===item.group)&&(!rule.rarity||rule.rarity===item.rarity)&&(!rule.rarities||rule.rarities.includes(item.rarity))&&(!rule.packId||rule.packId===(kind==='card'?item.pack:item.id))&&(!rule.cardIds||rule.cardIds.includes(item.id));
  const active=({save,state,config})=>[...config.calendar.filter(e=>e.weekday===((save.business.day-1)%7+1)),...state.temporary.filter(e=>e.fromDay<=save.business.day&&e.toDay>=save.business.day)];
  const factor=(ctx,kind,item,field)=>Math.max(ctx.config.minMultiplier,Math.min(ctx.config.maxMultiplier,active(ctx).filter(r=>matches(r,kind,item)).reduce((value,r)=>value*(r[field]||1),1)));
  ShopModules.register({id:'market',title:'行情与日历',version:1,file:'data/market.json',
    defaults:()=>({temporary:[],news:[]}),
    validate(c,catalog){const errors=[];if(c?.version!==1)errors.push('version 必须为 1');if(!(c.minMultiplier>=.2&&c.minMultiplier<=1&&c.maxMultiplier>=1&&c.maxMultiplier<=3))errors.push('行情上下限不合法');if(!Number.isInteger(c.tournamentDays)||c.tournamentDays<1||c.tournamentDays>7||!(c.tournamentMultiplier>=1&&c.tournamentMultiplier<=1.5))errors.push('赛事行情参数不合法');if(!Array.isArray(c.calendar)||c.calendar.length>50)return [...errors,'calendar 需要数组，最多 50 条'];const ids=new Set();for(const e of c.calendar){if(!e||typeof e.id!=='string'||ids.has(e.id)||typeof e.title!=='string'||!Number.isInteger(e.weekday)||e.weekday<1||e.weekday>7||!['card','pack'].includes(e.kind)||!(e.price>=.5&&e.price<=2)||!(e.demand>=.5&&e.demand<=3))errors.push('日历事件格式不合法');else ids.add(e.id);if(catalog&&e?.packId&&!catalog.packs.some(p=>p.id===e.packId))errors.push('事件引用了未知卡包');}return errors;},
    queries:{
      'card.price'(ctx,value,{card}){return Math.max(1,Math.round(value*factor(ctx,'card',card,'price')));},
      'pack.price'(ctx,value,{pack}){return Math.max(1,Math.round(value*factor(ctx,'pack',pack,'price')));},
      'customer.productScore'(ctx,value,{kind,item}){return value*factor(ctx,kind,item,'demand');},
      'market.active'(ctx){return active(ctx);},
      'market.factor'(ctx,value,{kind,item}){return factor(ctx,kind,item,'price');}
    },
    onEvent(ctx,event){
      const {state,save,config}=ctx;
      if(event.type==='matchFinished'&&event.ranked&&event.result==='win'&&Array.isArray(event.roster)){
        const id=`champion-${event.matchId}`;if(state.temporary.some(e=>e.id===id))return;
        state.temporary.push({id,title:'店赛冠军阵容受到关注',description:'参赛武将未来两天更受欢迎。',kind:'card',cardIds:event.roster,price:config.tournamentMultiplier,demand:1.5,fromDay:save.business.day+1,toDay:save.business.day+config.tournamentDays});
      }
      if(event.type==='dayStarted'){state.temporary=state.temporary.filter(e=>e.toDay>=save.business.day);state.news.push({day:save.business.day,titles:active(ctx).map(e=>e.title)});state.news=state.news.slice(-30);}
    }
  });
})();
