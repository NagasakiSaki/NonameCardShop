// Presentation adapter over card-shop-ui/1.0. Never determines rarity, prices, or tradable copies.
export class ViewError extends Error {
  constructor(error){super(error?.message||'数据加载失败');this.code=error?.code||'VIEW_ERROR';this.retryable=!!error?.retryable;}
}
export function unwrap(result){if(!result?.ok)throw new ViewError(result?.error);return result.data;}
export async function queryPage(ctx,name,params={}){
  const data=unwrap(await ctx.query(name,params));
  if(Array.isArray(data))return {items:data,total:data.length,nextCursor:null};
  if(!data||!Array.isArray(data.items))throw new ViewError({code:'VIEW_CONTRACT',message:name+' 未返回有效列表'});
  return data;
}
export async function queryAll(ctx,name,params={}){
  const items=[],seen=new Set();let cursor;
  do{const data=await queryPage(ctx,name,{...params,limit:200,...(cursor?{cursor}:{})});items.push(...data.items);cursor=data.nextCursor;if(cursor){if(seen.has(cursor))throw new ViewError({code:'VIEW_CURSOR',message:'列表游标未推进，请刷新后重试'});seen.add(cursor);}}while(cursor);
  return items;
}
export function draftFor(app,key,initial){
  app.tradeDrafts??=new Map();if(!app.tradeDrafts.has(key))app.tradeDrafts.set(key,structuredClone(initial));
  const draft=app.tradeDrafts.get(key),op=draft.operation,current=app.snapshot();
  if(op&&(op.worldId!==current.worldId||op.branchId!==current.branchId))op.status='stale';
  return draft;
}
export function cardView(row,mode='inventory'){
  const inventory=mode==='sell'||mode==='inventory',amount=inventory?row.referencePrice?.amount:row.unitAmount;
  return {id:inventory?(row.inventoryRefs?JSON.stringify([row.cardKey,row.printVersion,row.printedRarity,row.location]):row.inventoryRef):row.listingId||row.bidId||row.eventId||row.seq||row.cardKey,
    cardKey:row.cardKey,name:row.name,artUrl:row.imageUrl,rarity:row.printedRarity||row.rarity||row.currentRarity,currentRarity:row.currentRarity,
    ownedCount:inventory?row.owned:row.holdings?.owned??0,availableCount:inventory?row.available:row.holdings?.available??0,
    price:Number.isSafeInteger(amount)?amount:null,marketStock:row.quantity??0,faction:row.group,theme:row.themeId,raw:row};
}
export function productView(row,unit,artManifest,sealed=[],orders=[]){
  const stock=sealed.filter(i=>i.productId===row.productId&&i.kind===unit),pending=orders.filter(o=>o.product?.productId===row.productId&&o.unit===unit&&o.status!=='received');
  const image=artManifest.products[row.productId]||artManifest.products.standard;
  return {id:JSON.stringify([row.productId,unit]),productId:row.productId,kind:unit,name:row.themeName+' · '+(unit==='box'?'密封盒':'散包'),artUrl:image?.[unit],unitPrice:row.prices?.[unit]?.wholesale,suggestedRetail:row.prices?.[unit]?.retail,
    packsPerBox:row.packsPerBox,cardsPerPack:row.cardsPerPack,available:row.availability==='available',stock:null,subtitle:row.priceTier?`${row.priceTier.label} · 主题平均强度 ${row.averageStrength}`:'',
    warehouse:stock.reduce((n,i)=>n+i.warehouse,0),onShelf:stock.reduce((n,i)=>n+i.onShelf,0),inTransit:pending.reduce((n,o)=>n+o.quantity,0),raw:row};
}
