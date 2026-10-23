/* Physical booster lots. Contents are manufactured once; containers never reroll them. */
window.ShopBoxes=(()=>{
  const clone=x=>JSON.parse(JSON.stringify(x)),data=s=>s.modules?.boxes?.data,lots=s=>data(s)?.lots||[];
  const find=(s,id)=>lots(s).find(b=>b.id===id);
  const randomFor=seed=>()=>{seed=(Math.imul(1664525,seed)+1013904223)>>>0;return seed/4294967296;};
  const active=b=>b.status==='sealed'||b.status==='unsealed';
  function tracked(save,packId,location){return lots(save).filter(b=>b.packId===packId&&b.status==='unsealed').flatMap(b=>b.packets.filter(p=>p.location===location).map(packet=>({box:b,packet})));}
  function loose(save,packId,location='stock'){return Math.max(0,(save[location][packId]||0)-tracked(save,packId,location).length);}
  function selection(save,packId,location,n=1,boxId){
    const entries=tracked(save,packId,location).filter(p=>!boxId||p.box.id===boxId),untracked=boxId?0:Math.min(n,loose(save,packId,location));
    return entries.length+untracked>=n?{untracked,entries:entries.slice(0,n-untracked)}:null;
  }
  function peek(save,packId,boxId){
    const picked=selection(save,packId,'stock',1,boxId);if(!picked)return {ok:false,error:'指定卡盒没有可拆卡包。'};
    const entry=picked.entries[0];if(!entry)return {ok:true,pulls:null};
    const catalog=ShopModules.catalog;
    const pulls=entry.packet.cards.map(p=>{const card=catalog.cards.find(c=>c.id===p.cardId);if(!card)throw new Error(`盒内卡牌数据缺失：${p.cardId}`);return {card:{...card,rarity:p.rarity},rarity:p.rarity,source:p.source};});
    return {ok:true,pulls,boxId:entry.box.id};
  }
  function moveTracked(save,packId,from,to,n,boxId){
    const picked=selection(save,packId,from,n,boxId);if(!picked)return false;
    for(const {packet,box} of picked.entries){packet.location=to;if(!box.packets.some(p=>['stock','packDisplay'].includes(p.location)))box.status='exhausted';}
    return true;
  }
  function shelfUsed(save){return lots(save).filter(b=>b.status==='sealed'&&b.location==='display').reduce((n,b)=>n+b.spec.shelfUnits,0);}
  function retail(save,box){const pack=ShopModules.catalog.packs.find(p=>p.id===box.packId),base=ShopBalance.quoteBox(pack,ShopBusiness.config.economy.cardPrices,box.spec).retail;return Math.round(ShopModules.value('pack.price',save,base,{pack})*save.business.pricing.packs);}
  function order(save,pack,quantity,useCredit=false){
    const spec=pack&&ShopBalance.boxSpec(pack);if(!data(save)||!spec)return {ok:false,error:'当前主题尚未配置整盒配额。'};
    if(save.business.phase==='closed')return {ok:false,error:'今天已结算，请先进入下一天。'};
    if(!Number.isInteger(quantity)||quantity<1||quantity>Math.min(5,ShopBusiness.config.supplier.maxOrderQuantity))return {ok:false,error:'每笔整盒订购数量为1—5盒。'};
    const quote=ShopBalance.quoteBox(pack,ShopBusiness.config.economy.cardPrices,spec),cost=quote.wholesale*quantity,shortfall=Math.max(0,cost-save.shop.cash);
    if(shortfall&&(!useCredit||shortfall+save.business.debt>ShopBusiness.config.economy.supplierCreditLimit))return {ok:false,error:'资金不足，可减少整盒数量或使用额度内赊购。'};
    const item={id:`order-${save.business.day}-${save.business.eventSerial+1}`,kind:'box',packId:pack.id,quantity,packQuantity:quantity*spec.packs,unitCost:quote.wholesale,cost,boxSpec:clone(spec),seed:Math.floor(Math.random()*4294967296),orderedAt:ShopBusiness.stamp(save),dueAt:ShopBusiness.stamp(save)+ShopBusiness.config.supplier.deliveryMinutes,status:'pending'};
    save.shop.cash-=cost-shortfall;save.business.debt+=shortfall;save.orders.push(item);
    save.orders=save.orders.filter(o=>o.status!=='received').concat(save.orders.filter(o=>o.status==='received').slice(-50));
    ShopBusiness.bump(save,'ordersPlaced');ShopBusiness.bump(save,'purchasedPacks',item.packQuantity);ShopBusiness.bump(save,'purchaseExpense',cost);
    ShopBusiness.emit(save,'orderPlaced',{kind:'box',packId:pack.id,quantity:item.packQuantity,boxes:quantity,amount:cost,credit:shortfall});return {ok:true,order:item};
  }
  function receive(save,item){
    const pack=ShopModules.catalog.packs.find(p=>p.id===item.packId);if(!pack||!item.boxSpec||!data(save))return {ok:false,error:'卡盒订单数据不完整，未签收。'};
    // Build every box before committing any inventory or status change.
    const manufactured=Array.from({length:item.quantity},(_,i)=>({id:`box-${item.id}-${i+1}`,packId:item.packId,spec:clone(item.boxSpec),status:'sealed',location:'stock',cost:item.unitCost,
      packets:ShopBalance.manufacture(pack,item.boxSpec,randomFor((item.seed+Math.imul(i+1,2654435761))>>>0)).map(cards=>({location:'stock',cards}))}));
    if(manufactured.some(b=>find(save,b.id)))return {ok:false,error:'这批卡盒已经入库，不能重复签收。'};
    item.status='received';item.receivedAt=ShopBusiness.stamp(save);data(save).lots.push(...manufactured);
    ShopBusiness.bump(save,'receivedPacks',item.packQuantity);
    ShopBusiness.emit(save,'boxesReceived',{orderId:item.id,packId:item.packId,quantity:item.quantity,packQuantity:item.packQuantity,cost:item.cost,boxIds:manufactured.map(b=>b.id)});
    ShopBusiness.emit(save,'goodsReceived',{kind:'box',orderId:item.id,packId:item.packId,quantity:item.packQuantity,boxes:item.quantity,cost:item.cost});
    return {ok:true,quantity:item.quantity,unit:'box',packQuantity:item.packQuantity};
  }
  function unseal(save,id){
    const box=find(save,id);if(!box||box.status!=='sealed'||box.location!=='stock')return {ok:false,error:'只能拆开仓库中的完整封盒。'};
    if(save.business.phase==='closed')return {ok:false,error:'请明早再拆盒。'};
    box.status='unsealed';save.stock[box.packId]=(save.stock[box.packId]||0)+box.spec.packs;
    ShopBusiness.emit(save,'boxUnsealed',{boxId:id,packId:box.packId,quantity:box.spec.packs});return {ok:true,quantity:box.spec.packs};
  }
  function moveBox(save,id,to){
    const box=find(save,id);if(!box||box.status!=='sealed'||!['stock','display'].includes(to)||box.location===to)return {ok:false,error:'该完整卡盒不可移动。'};
    if(save.business.phase==='closed'||to==='display'&&ShopBusiness.shelfUsed(save)+box.spec.shelfUnits>ShopBusiness.capacity(save))return {ok:false,error:'货架空间不足或今天已打烊。'};
    box.location=to;if(to==='display')ShopBusiness.bump(save,'listedUnits',box.spec.shelfUnits);
    ShopBusiness.emit(save,to==='display'?'stockListed':'stockWithdrawn',{kind:'box',boxId:id,packId:box.packId,quantity:1,packQuantity:box.spec.packs});return {ok:true};
  }
  function products(save,profile){return lots(save).filter(b=>b.status==='sealed'&&b.location==='display'&&retail(save,b)<=profile.budget&&save.business.pricing.packs<=profile.maxMarkup).map(b=>({kind:'box',id:b.id,price:retail(save,b),score:profile.preference==='pack'?110:15}));}
  function sell(save,id,profile){
    const box=find(save,id);if(save.business.phase!=='open'||!box||box.status!=='sealed'||box.location!=='display')return {ok:false,error:'未营业或该卡盒已售完。'};
    const amount=retail(save,box);if(profile&&(amount>profile.budget||save.business.pricing.packs>profile.maxMarkup))return {ok:false,error:'顾客预算或价格承受度不足。'};
    const pack=ShopModules.catalog.packs.find(p=>p.id===box.packId);box.status='sold';box.location='sold';box.packets.forEach(p=>p.location='sold');
    ShopBusiness.addCash(save,amount);save.shop.revenue+=amount;save.shop.sold++;ShopBusiness.bump(save,'revenue',amount);ShopBusiness.bump(save,'soldPacks',box.spec.packs);ShopBusiness.bump(save,'served');save.business.reputation=Math.min(100,save.business.reputation+.5);
    const item={...pack,name:pack.name+' · 完整卡盒'};save.receipts.push({name:item.name,id,kind:'box',amount,quantity:1,day:save.business.day,minute:save.business.minute,customer:profile?.name||'顾客'});save.receipts=save.receipts.slice(-50);
    ShopBusiness.emit(save,'sale',{kind:'box',id,packId:pack.id,amount,quantity:1,packQuantity:box.spec.packs,source:'shelf',customerId:profile?.id,regularId:profile?.regularId});return {ok:true,item,amount};
  }
  function ready(save){
    const ids=new Set(),cardIds=new Set(ShopModules.catalog.cards.map(c=>c.id));
    for(const box of lots(save)){
      if(!box||ids.has(box.id)||!['sealed','unsealed','sold','exhausted'].includes(box.status)||!ShopModules.catalog.packs.some(p=>p.id===box.packId)||!Array.isArray(box.packets)||box.packets.length!==box.spec?.packs)throw new Error('卡盒存档损坏，未重新生成内容。');ids.add(box.id);
      const counts=Object.fromEntries(ShopBalance.ORDER.map(r=>[r,0]));
      for(const packet of box.packets){if(!['stock','packDisplay','opened','sold'].includes(packet.location)||!Array.isArray(packet.cards)||packet.cards.length!==5)throw new Error('盒内卡包记录不完整。');for(const p of packet.cards){if(!Object.hasOwn(counts,p.rarity)||!cardIds.has(p.cardId))throw new Error('盒内卡牌记录不合法。');counts[p.rarity]++;}if(!packet.cards.some(p=>['R','SR','UR'].includes(p.rarity)))throw new Error('盒内卡包缺少小保底。');}
      if(ShopBalance.ORDER.some(r=>counts[r]!==box.spec.counts[r]))throw new Error('盒内固定稀有度配额不一致。');
      if(box.status==='sealed'&&(!['stock','display'].includes(box.location)||box.packets.some(p=>p.location!=='stock')))throw new Error('封盒状态不合法。');
    }
    for(const location of ['stock','packDisplay'])for(const pack of ShopModules.catalog.packs)if(tracked(save,pack.id,location).length>(save[location][pack.id]||0))throw new Error('盒内余包与库存数量不一致，未覆盖存档。');
  }
  ShopModules.register({id:'boxes',title:'实体卡盒',version:1,requires:['balance','ledger'],defaults:()=>({lots:[]}),
    migrate(old){if(old&&(!Array.isArray(old.lots)))throw new Error('卡盒存档格式不合法。');return {lots:old?.lots||[]};},
    ready({save}){ready(save);},
    queries:{'customer.profile'({save},profile,{random}){const c=ShopBalance.config.boxCustomer||{chance:.12,budget:9500};if(!lots(save).some(b=>b.status==='sealed'&&b.location==='display')||random()>=c.chance)return profile;const next={...profile,id:'box_buyer',name:'整盒采购客',budget:c.budget,preference:'pack'};delete next.regularId;return next;}},
    actions:{unseal({save},{boxId}){return unseal(save,boxId);},move({save},{boxId,to}){return moveBox(save,boxId,to);}},
    onEvent({state},event){if(['sale','cardsOpened'].includes(event.type)){const finished=state.lots.filter(b=>!active(b));const keep=new Set(finished.slice(-20).map(b=>b.id));state.lots=state.lots.filter(b=>active(b)||keep.has(b.id));}}
  });
  return {lots,find,tracked,loose,peek,moveTracked,shelfUsed,retail,order,receive,unseal,moveBox,products,sell,ready};
})();
