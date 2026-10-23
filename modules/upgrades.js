(() => {
  const level=(state,id)=>state.levels[id]||0;
  ShopModules.register({id:'upgrades',title:'店铺与员工',version:1,file:'data/upgrades.json',defaults:()=>({levels:{},restockAt:0,restocked:0}),
    validate(c){const errors=[];if(c?.version!==1)errors.push('version 必须为 1');if(!Array.isArray(c.upgrades)||!c.upgrades.length)return [...errors,'upgrades 需要数组'];const ids=new Set();for(const u of c.upgrades){if(!u||!/^[a-z][a-z0-9_]*$/.test(u.id)||['constructor','prototype','__proto__'].includes(u.id)||ids.has(u.id)||typeof u.name!=='string'||!Array.isArray(u.costs)||!u.costs.length||!u.costs.every(n=>Number.isSafeInteger(n)&&n>0)||!['shelfCapacity','collector','tournament','cashier','stocker'].includes(u.effect)||!Number.isFinite(u.amount)||u.amount<0||!Number.isInteger(u.minDay)||u.minDay<1||u.dailyCost!==undefined&&(!Number.isSafeInteger(u.dailyCost)||u.dailyCost<0))errors.push('升级项格式不合法');else ids.add(u.id);}if(!Number.isInteger(c.restockIntervalMinutes)||c.restockIntervalMinutes<5||!Number.isInteger(c.restockTargetPerPack)||c.restockTargetPerPack<1||c.restockTargetPerPack>20||!Number.isInteger(c.warehouseReservePerPack)||c.warehouseReservePerPack<0||!(c.cashierCheckoutMilliseconds>=100&&c.cashierCheckoutMilliseconds<=3000)||!(c.showcaseBudgetMultiplier>=1&&c.showcaseBudgetMultiplier<=2))errors.push('员工参数不合法');return errors;},
    queries:{
      'shelf.capacity'({state,config},value){return value+config.upgrades.filter(u=>u.effect==='shelfCapacity').reduce((n,u)=>n+level(state,u.id)*u.amount,0);},
      'business.dailyCost'({state,config},value){return value+config.upgrades.reduce((sum,u)=>sum+level(state,u.id)*(u.dailyCost||0),0);},
      'customer.maxConcurrent'({state},value){return Math.min(8,value+(level(state,'cashier')?1:0));},
      'customer.checkoutMs'({state,config},value){return level(state,'cashier')?config.cashierCheckoutMilliseconds:value;},
      'customer.regularChance'({state},value){return Math.min(.9,value+(level(state,'showcase')?.1:0));},
      'customer.regularBudget'({state,config},value){return Math.round(value*(level(state,'showcase')?config.showcaseBudgetMultiplier:1));},
      'upgrades.level'({state},value,{id}){return level(state,id);}
    },
    actions:{buy({state,save,config,error,emit},{id}){const u=config.upgrades.find(u=>u.id===id),n=level(state,id);if(!u||n>=u.costs.length)return error('该设施已经满级');if(save.business.phase==='closed')return error('请开始下一天后采购');if(save.business.day<u.minDay)return error(`第 ${u.minDay} 天解锁`);const cost=u.costs[n];if(save.shop.cash<cost)return error('资金不足，升级不能赊购');save.shop.cash-=cost;state.levels[id]=n+1;emit('upgradePurchased',{upgradeId:id,level:n+1,amount:cost});return {ok:true,name:u.name};}},
    tick({save,state,config},minutes){if(!level(state,'stocker')||save.business.phase!=='open'||ShopBusiness.stamp(save)<state.restockAt)return;state.restockAt=ShopBusiness.stamp(save)+config.restockIntervalMinutes;for(const [id,n] of Object.entries(save.stock)){const amount=Math.min(Math.max(0,n-config.warehouseReservePerPack),Math.max(0,config.restockTargetPerPack-(save.packDisplay[id]||0)),Math.max(0,ShopBusiness.capacity(save)-ShopBusiness.shelfUsed(save)));if(amount>0&&ShopBusiness.movePacks(save,id,'stock','packDisplay',amount))state.restocked+=amount;}}
  });
})();
