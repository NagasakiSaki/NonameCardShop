/* Locks reserve copies, not card definitions: duplicates remain tradable. */
ShopModules.register({id:'inventory',title:'收藏保护',version:1,defaults:()=>({locks:{},rosters:[],activeRoster:[]}),
  queries:{
    'inventory.available'({state,save},value,{cardId}){const reserved=Math.max(state.locks[cardId]||0,state.activeRoster.includes(cardId)?1:0);return Math.max(0,value-reserved);},
    'inventory.locked'({state},value,{cardId}){return Math.max(state.locks[cardId]||0,state.activeRoster.includes(cardId)?1:0);}
  },
  actions:{
    toggle({state,save,card,error,emit},{cardId}){if(!card(cardId))return error('武将不存在');if(state.locks[cardId])delete state.locks[cardId];else{if(!(save.collection[cardId]>0))return error('请先将一张卡放回背包');state.locks[cardId]=1;}emit('collectionLockChanged',{cardId,quantity:state.locks[cardId]||0});return {ok:true};},
    saveRoster({state,save,card,error},{name,ids}){if(!Array.isArray(ids)||ids.length!==3||new Set(ids).size!==3||!ids.every(id=>card(id)&&save.collection[id]>0))return error('请在背包中保留三名不同武将');if(typeof name!=='string'||!name.trim()||name.length>30)return error('阵容名称需为 1—30 字');const found=state.rosters.find(r=>r.name===name);if(found)found.ids=[...ids];else state.rosters.push({name,ids:[...ids]});state.rosters=state.rosters.slice(-10);return {ok:true};}
  }
});
