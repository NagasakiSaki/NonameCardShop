/* Inventory average costs follow physical stock, independently of UI containers. */
window.ShopLedger = (() => {
  const blankDay = () => ({sales:0,cogs:0,unknownCostUnits:0,writeOff:0,unknownWriteOffUnits:0,operating:0,investment:0,acquisitions:0,tournamentFees:0,tournamentRewards:0});
  const owned = (save,kind,id) => kind==='box' ? (window.ShopBoxes?.lots(save).some(b=>b.id===id&&b.status==='sealed')?1:0) : kind==='pack' ? (save.stock[id]||0)+(save.packDisplay[id]||0) : ['collection','display','trash'].reduce((s,k)=>s+(save[k][id]||0),0);
  function acquire(save,kind,id,quantity,cost) {
    const state=save.modules.ledger.data,book=state[kind],entry=book[id]||{quantity:0,cost:0};
    entry.quantity+=quantity;entry.cost=entry.cost===null||cost===null?null:entry.cost+cost;book[id]=entry;
  }
  function take(save,kind,id,quantity) {
    const book=save.modules.ledger.data[kind],entry=book[id];
    if(!entry||entry.quantity<quantity){delete book[id];return null;}
    const cost=entry.cost===null?null:entry.cost/entry.quantity*quantity;entry.quantity-=quantity;
    if(!entry.quantity)delete book[id];else if(cost!==null)entry.cost-=cost;
    return cost;
  }
  function sync(save,free=false) {
    for(const kind of ['card','pack','box']){
      const ids=new Set(Object.keys(save.modules.ledger.data[kind]));
      for(const container of kind==='card'?['collection','display','trash']:kind==='pack'?['stock','packDisplay']:[])Object.keys(save[container]).forEach(id=>ids.add(id));
      if(kind==='box')for(const b of window.ShopBoxes?.lots(save)||[])if(b.status==='sealed')ids.add(b.id);
      for(const id of ids){const quantity=owned(save,kind,id),old=save.modules.ledger.data[kind][id]?.quantity||0;
        if(quantity>old)acquire(save,kind,id,quantity-old,free?0:null);else if(quantity<old)take(save,kind,id,old-quantity);}
    }
  }
  const stateOf=save=>save.modules.ledger.data;
  ShopModules.register({id:'ledger',title:'库存成本',version:1,defaults:()=>({day:0,card:{},pack:{},box:{},daily:blankDay(),history:[],pending:[]}),
    migrate(old){return {day:old?.day||0,card:old?.card||{},pack:old?.pack||{},box:old?.box||{},daily:{...blankDay(),...(old?.daily||{})},history:old?.history||[],pending:old?.pending||[]};},
    ready({save,state}){sync(save);if(state.day!==save.business.day){const legacy=!state.day;state.day=save.business.day;state.daily=blankDay();if(legacy){state.daily.sales=save.business.daily.revenue;state.daily.unknownCostUnits=save.business.daily.soldCards+save.business.daily.soldPacks;}}},
    queries:{'ledger.summary'({state},fallback){return {...state.daily,goodsMargin:state.daily.sales-state.daily.cogs,knownProfit:state.daily.sales-state.daily.cogs-state.daily.operating,hasUnknownCosts:state.daily.unknownCostUnits>0,inventoryKnownValue:[...Object.values(state.card),...Object.values(state.pack),...Object.values(state.box)].reduce((s,e)=>s+(e.cost||0),0)};}},
    onEvent({save,state},event){
      if(event.type==='goodsReceived'&&event.kind!=='box'){acquire(save,'pack',event.packId,event.quantity,event.cost??null);state.daily.acquisitions+=event.cost||0;}
      if(event.type==='boxesReceived'){for(const id of event.boxIds)acquire(save,'box',id,1,event.cost/event.quantity);state.daily.acquisitions+=event.cost;}
      if(event.type==='boxUnsealed'){const cost=take(save,'box',event.boxId,1);acquire(save,'pack',event.packId,event.quantity,cost);}
      if(event.type==='cardPurchased'){acquire(save,'card',event.cardId,event.quantity,event.amount);state.daily.acquisitions+=event.amount;}
      if(event.type==='packOpened')state.pending.push({packId:event.packId,cost:take(save,'pack',event.packId,1)});
      if(event.type==='cardsOpened'){
        const index=state.pending.findIndex(p=>p.packId===event.packId),pending=index>=0?state.pending.splice(index,1)[0]:{cost:null};
        const cards=event.cards.map(id=>ShopModules.catalog.cards.find(c=>c.id===id));
        const weights=cards.map((c,i)=>ShopBusiness.config.economy.cardPrices[event.pulls?.[i]?.rarity||c.rarity]),total=weights.reduce((a,b)=>a+b,0);
        cards.forEach((card,i)=>acquire(save,'card',card.id,1,pending.cost===null?null:pending.cost*weights[i]/total));
      }
      if(event.type==='sale'){
        const n=event.quantity||1,cost=take(save,event.kind,event.id,n);state.daily.sales+=event.amount;
        if(cost===null)state.daily.unknownCostUnits+=n;else state.daily.cogs+=cost;
      }
      if(event.type==='upgradePurchased')state.daily.investment+=event.amount;
      if(event.type==='tournamentRegistered')state.daily.tournamentFees+=event.amount;
      if(event.type==='tournamentRewarded')state.daily.tournamentRewards+=event.amount;
      if(event.type==='taskClaimed')sync(save,true);
      if(event.type==='dayClosed')state.daily.operating=event.operatingCost??ShopBusiness.config.economy.operatingCost;
      if(event.type==='dayStarted'){
        for(const [id,n] of Object.entries(event.clearedCards||{})){const cost=take(save,'card',id,n);if(cost===null)state.daily.unknownWriteOffUnits+=n;else state.daily.writeOff+=cost;}
        state.history.push({day:state.day,...state.daily});state.history=state.history.slice(-30);state.day=event.day;state.daily=blankDay();
      }
    }
  });
  return {acquire,take,sync,stateOf};
})();
