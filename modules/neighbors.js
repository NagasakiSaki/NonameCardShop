/* Persistent regulars, negotiated acquisition offers and dated customer orders. */
(() => {
  function relation(state,id) {return state.people[id] ||= {relationship:0,lastVisit:0,lastTalk:0,purchaseDay:0,purchasePoints:0,purchases:0,completed:0};}
  function updateDay(ctx) {
    const {save,state,config,catalog}=ctx;if(!catalog||state.generatedDay===save.business.day)return;
    const day=save.business.day;
    for(const order of state.orders)if(['offered','accepted'].includes(order.status)&&order.expiresDay<day){order.status=order.status==='accepted'?'expired':'dismissed';if(order.status==='expired'){const p=relation(state,order.regularId);p.relationship=Math.max(0,p.relationship-2);}}
    for(const offer of state.offers)if(offer.status==='offered'&&offer.expiresDay<day)offer.status='expired';
    state.orders=state.orders.filter(o=>o.expiresDay>=day-14);state.offers=state.offers.filter(o=>o.expiresDay>=day-7);
    config.regulars.forEach((regular,i)=>{
      relation(state,regular.id);
      const choose=(rarities,offset)=>{let pool=catalog.cards.filter(c=>rarities.includes(c.rarity)&&c.group===regular.group&&!c.isUnseen);if(!pool.length)pool=catalog.cards.filter(c=>rarities.includes(c.rarity));return pool[(day*17+i*11+offset)%pool.length];};
      if(i<config.ordersPerDay){const card=choose(config.orderRarities,0);if(card){const unitPrice=Math.max(1,Math.round(ShopBusiness.referenceCard(card,save)*regular.orderRate));state.orders.push({id:`request-${day}-${regular.id}`,regularId:regular.id,customer:regular.name,cardId:card.id,quantity:config.orderQuantity,amount:unitPrice*config.orderQuantity,status:'offered',createdDay:day,expiresDay:day+config.orderDurationDays-1});}}
      if(i<config.offersPerDay){const card=choose(config.offerRarities,5);if(card)state.offers.push({id:`offer-${day}-${regular.id}`,regularId:regular.id,customer:regular.name,cardId:card.id,quantity:1,amount:Math.max(1,Math.round(ShopBusiness.referenceCard(card,save)*regular.offerRate)),status:'offered',createdDay:day,expiresDay:day+config.offerDurationDays-1});}
    });state.generatedDay=day;
  }
  ShopModules.register({id:'neighbors',title:'街坊、收卡与委托',version:1,file:'data/neighbors.json',defaults:()=>({generatedDay:0,people:{},orders:[],offers:[]}),
    validate(c){const errors=[];if(c?.version!==1)errors.push('version 必须为 1');if(!(c.regularChance>=0&&c.regularChance<=1))errors.push('常客概率范围为 0—1');if(!Array.isArray(c.regulars)||!c.regulars.length||c.regulars.length>12)return [...errors,'常客需要 1—12 人'];const ids=new Set();for(const r of c.regulars){if(!r||!/^[a-z][a-z0-9_]*$/.test(r.id)||['constructor','prototype','__proto__'].includes(r.id)||ids.has(r.id)||typeof r.name!=='string'||!['budget','casual','collector'].includes(r.profile)||!['wei','shu','wu','qun','jin','shen'].includes(r.group)||!Number.isSafeInteger(r.budget)||r.budget<1||!(r.offerRate>0&&r.offerRate<=1)||!(r.orderRate>=1&&r.orderRate<=2)||!Array.isArray(r.dialogue)||!r.dialogue.length||!r.dialogue.every(t=>typeof t==='string')||!Number.isInteger(r.tint))errors.push('常客数据格式不合法');else ids.add(r.id);}for(const k of ['ordersPerDay','offersPerDay'])if(!Number.isInteger(c[k])||c[k]<0||c[k]>c.regulars.length)errors.push(`${k} 不能超过常客人数`);for(const k of ['orderDurationDays','offerDurationDays','orderQuantity','relationshipPerPurchase','maxPurchaseRelationshipPerDay','completionRelationship','dialogueRelationship'])if(!Number.isInteger(c[k])||c[k]<1||c[k]>30)errors.push(`${k} 范围为 1—30`);for(const k of ['offerRarities','orderRarities'])if(!Array.isArray(c[k])||!c[k].length||!c[k].every(r=>['C','U','R','SR','UR'].includes(r)))errors.push(`${k} 不合法`);return errors;},
    ready:updateDay,
    queries:{
      'customer.profile'(ctx,profile,{random}){
        const chance=ctx.value('customer.regularChance',ctx.config.regularChance),available=ctx.config.regulars.filter(r=>relation(ctx.state,r.id).lastVisit!==ctx.save.business.day);
        if(!available.length||random()>=chance)return profile;
        const r=available[Math.floor(random()*available.length)],base=ShopBusiness.config.customers.profiles.find(p=>p.id===r.profile)||profile;
        const p=relation(ctx.state,r.id),budget=ctx.value('customer.regularBudget',Math.round(r.budget*(1+p.relationship/200)));
        return {...base,id:`regular-${r.id}`,name:r.name,regularId:r.id,group:r.group,budget,tint:r.tint};
      },
      'customer.productScore'({state},score,{profile,kind,item}){return score+(profile.regularId&&kind==='card'&&item.group===profile.group?120:0);},
      'neighbors.completed'({state}){return state.orders.filter(o=>o.status==='completed').length+(state.archivedCompleted||0);}
    },
    actions:{
      talk(ctx,{regularId}){const {state,save,config,error,emit}=ctx,r=config.regulars.find(r=>r.id===regularId);if(!r)return error('没有这位常客');const p=relation(state,r.id);if(p.lastVisit!==save.business.day)return error('等这位街坊进店后再聊吧');const text=r.dialogue[Math.min(r.dialogue.length-1,Math.floor(p.relationship/10))];if(p.lastTalk!==save.business.day){p.lastTalk=save.business.day;p.relationship=Math.min(100,p.relationship+config.dialogueRelationship);emit('regularTalked',{regularId});}return {ok:true,text};},
      accept({state,save,error,emit},{id}){const order=state.orders.find(o=>o.id===id&&o.status==='offered');if(!order||order.expiresDay<save.business.day)return error('委托已过期或已处理');if(save.business.phase==='closed')return error('请明早再接单');order.status='accepted';emit('customerOrderAccepted',{orderId:id,regularId:order.regularId,cardId:order.cardId});return {ok:true};},
      decline({state,error,emit},{id}){const order=state.orders.find(o=>o.id===id&&o.status==='offered');if(!order)return error('委托已处理');order.status='declined';emit('customerOrderDeclined',{orderId:id});return {ok:true};},
      deliver(ctx,{id}){
        const {save,state,config,error,emit}=ctx,order=state.orders.find(o=>o.id===id&&o.status==='accepted');
        if(!order||order.expiresDay<save.business.day)return error('没有可交付的委托');if(save.business.phase!=='open')return error('请在营业时交付给顾客');
        if(ctx.value('inventory.available',save.collection[order.cardId]||0,{cardId:order.cardId})<order.quantity)return error('背包中可交易数量不足；收藏锁定的一张会保留');
        const result=ShopBusiness.checkout(save,{kind:'card',id:order.cardId,quantity:order.quantity,amount:order.amount,container:'collection',profile:{id:`regular-${order.regularId}`,name:order.customer,regularId:order.regularId},source:'customerOrder'});if(!result.ok)return result;
        order.status='completed';order.completedDay=save.business.day;const p=relation(state,order.regularId);p.completed++;p.relationship=Math.min(100,p.relationship+config.completionRelationship);
        emit('customerOrderCompleted',{orderId:id,regularId:order.regularId,cardId:order.cardId,quantity:order.quantity,amount:order.amount});return {ok:true,amount:order.amount};
      },
      buy({save,state,error,emit},{id}){const offer=state.offers.find(o=>o.id===id&&o.status==='offered');if(!offer||offer.expiresDay<save.business.day)return error('收卡申请已过期或已处理');if(save.business.phase==='closed')return error('请明早再收卡');if(save.shop.cash<offer.amount)return error('资金不足，单卡收购不支持赊购');save.shop.cash-=offer.amount;save.collection[offer.cardId]=(save.collection[offer.cardId]||0)+offer.quantity;offer.status='bought';emit('cardPurchased',{offerId:id,regularId:offer.regularId,cardId:offer.cardId,quantity:offer.quantity,amount:offer.amount});return {ok:true,amount:offer.amount};}
    },
    onEvent(ctx,event){const {state,save,config}=ctx;if(event.type==='dayStarted'){state.archivedCompleted=(state.archivedCompleted||0)+state.orders.filter(o=>o.status==='completed'&&o.expiresDay<save.business.day-14).length;updateDay(ctx);}if(event.type==='customerEntered'&&event.regularId)relation(state,event.regularId).lastVisit=save.business.day;if(event.type==='sale'&&event.regularId){const p=relation(state,event.regularId);if(p.purchaseDay!==save.business.day){p.purchaseDay=save.business.day;p.purchasePoints=0;}const points=Math.max(0,Math.min(config.relationshipPerPurchase,config.maxPurchaseRelationshipPerDay-p.purchasePoints));p.purchasePoints+=points;p.purchases++;p.relationship=Math.min(100,p.relationship+points);}}
  });
})();
