import {mountPurchase} from '../components/stations/purchase.mjs';
import {mountWarehouse} from '../components/stations/warehouse.mjs';
import {mountOpening} from '../components/stations/opening.mjs';
import {mountRetail,mountCheckout} from '../components/stations/retail.mjs';
import {fitPanel} from '../services/panel-shell.mjs';
import {queryAll,unwrap} from '../services/views.mjs';
import {performOperation,recoverOperation} from '../services/operations.mjs';
import {el,newRequestId,errorView} from '../../frontend/ui/components.mjs';

const CONFIG={purchase:{title:'进货',mount:mountPurchase},warehouse:{title:'仓库',mount:mountWarehouse},opening:{title:'拆包台',mount:mountOpening},retail:{title:'零售货架',mount:mountRetail},checkout:{title:'顾客收银',mount:mountCheckout}};
const fail=(code,message)=>({ok:false,error:{code,message,retryable:false}});
const identity=app=>app.snapshot().worldId+':'+app.snapshot().branchId;
function openingData(data){
  if(!data?.opening)return data;
  const groups=new Map();
  for(const card of data.opening.results){const key=JSON.stringify([card.cardKey,card.printVersion,card.printedRarity]);if(!groups.has(key))groups.set(key,{...card,copies:0,inventoryRefs:[]});const row=groups.get(key);row.copies++;row.inventoryRefs.push(card.inventoryRef);row.isNew||=card.isNew;}
  return {...data,opening:{...data.opening,results:[...groups.values()]}};
}
const receipt=data=>data?.fulfillment==='received'?{...data,lines:data.orders||data.lines||[]}:openingData(data);
export function openStation(app,kind,options={}){
  const config=CONFIG[kind],id='station-'+kind;
  return app.windows.open({id,title:config.title,width:'window--wide',pauseReason:config.title,render:async ctx=>{
    ctx.handle.stationDispose?.();fitPanel(ctx);let disposed=false,controller;
    const branch=identity(app),active=()=>!disposed&&!ctx.handle.closed&&branch===identity(app);
    const state=app.stationDrafts??={},saved=state[kind],draft=saved?.identity===branch?saved.draft:{};
    const op=(app.stationOperations??={})[kind]??=( {} );
    if(op.operation&&`${op.operation.worldId}:${op.operation.branchId}`!==branch)op.operation.status='stale';
    const root=el('div',{'data-facility-root':kind}),message=el('div',{role:'status'});ctx.body.append(message,root);
    const notify=(text,type)=>{if(active()){message.textContent=text;message.style.color=type==='error'?'#efb9a9':'';}};
    let view;
    async function refresh(){
      const [products,sealed,gift,retail,checkout,orders]=await Promise.all([queryAll(ctx,'products.list'),ctx.query('inventory.sealedSummary'),ctx.query('player.starterGift'),ctx.query('retail.list'),ctx.query('checkout.status'),queryAll(ctx,'supplier.orders')]);if(!active())return;
      const snapshot=app.snapshot();view={worldId:snapshot.worldId,branchId:snapshot.branchId,clock:snapshot.clock,wallet:snapshot.wallet,products,sealed:unwrap(sealed).items,retail:unwrap(retail),checkout:unwrap(checkout),legacyArrived:orders.filter(o=>o.status==='arrived').length,legacyPending:orders.filter(o=>o.status==='pending').length,pending:['unknown','submitting'].includes(op.operation?.status),atStation:{counter:app.isNearInteraction('store.counter'),opening:app.isNearInteraction('store.opening'),retail:app.isNearInteraction('store.retail')},newcomerGift:gift.ok&&gift.data?.status==='granted'?{title:'开店赠礼',note:gift.data.name+' · '+gift.data.quantity+(gift.data.unit==='box'?'盒':'包')+'，已放入仓库'}:null};controller?.update(view);return view;
    }
    async function commit(request){
      if(!active())return fail('STALE_OPERATION','进度已变化，请重新打开窗口。');
      const result=await performOperation(app,ctx,op,request);
      if(active()){
        await refresh().catch(()=>{});
        if(!result.ok&&op.operation?.status==='unknown'){
          message.replaceChildren(el('span',{text:'正在确认上次操作。'}),el('button',{
            class:'btn btn--sm',text:'查看上次结果',onclick:async()=>{
              const found=await recoverOperation(app,ctx,op);
              if(active()){message.textContent=found.ok?'操作已确认。':found.error.message;await refresh().catch(()=>{});}
            },
          }));
        }
      }
      return result.ok?{...result,data:receipt(result.data)}:result;
    }
    const actions={
      async purchase({lines,requestId}){
        const quote=await ctx.query('supplier.basketQuote',{lines});if(!quote.ok||!active())return quote.ok?fail('STALE_OPERATION','窗口已关闭。'):quote;
        const changed=quote.data.lines.some(line=>view.products.find(p=>p.productId===line.productId)?.prices?.[line.unit]?.wholesale!==line.unitAmount);
        if(changed){await refresh();return fail('QUOTE_EXPIRED','价格已更新，请核对后再购买。');}
        return commit({requestId,type:'supplier.placeBasketOrder',quoteId:quote.data.quoteId,payload:{}});
      },
      async openPacks({scope,requestId}){
        let input;
        if(scope.mode==='all')input={includeBoxes:!!scope.includeBoxes};
        else if(scope.mode==='box')input={inventoryRefs:scope.inventoryRefs.slice(0,scope.boxQuantity),includeBoxes:true,quantity:scope.boxQuantity*24};
        else input={inventoryRefs:scope.inventoryRefs,includeBoxes:false,quantity:scope.quantity};
        const preview=await ctx.query('opening.preview',input);if(!preview.ok||!active())return preview.ok?fail('STALE_OPERATION','窗口已关闭。'):preview;
        if(input.quantity&&preview.data.packs!==input.quantity)return fail('OUT_OF_STOCK','可用库存已变化，请重新选择数量。');
        return commit({requestId,type:'opening.execute',previewId:preview.data.previewId,payload:{}});
      },
      async checkLastOperation({requestId}){
        const result=op.operation?.request.requestId===requestId?await recoverOperation(app,ctx,op):await ctx.query('operations.get',{requestId});if(active())await refresh().catch(()=>{});
        if(result.ok&&result.data?.result){const inner=result.data.result;return {...result,data:{...result.data,result:inner.ok?{...inner,data:receipt(inner.data)}:inner}};}
        return result.ok?{...result,data:receipt(result.data)}:result;
      },
      goToWarehouse(){ctx.handle.close();app.openPanel('warehouse');return {ok:true};},
      goToOpening(scope){ctx.handle.close();app.goToInteraction('store.opening','opening',scope);return {ok:true};},
      goToRetail(scope){ctx.handle.close();app.goToInteraction('store.retail','supplier',{purchaseTab:'retail',...scope});return {ok:true};},
      listRetail:p=>commit({requestId:newRequestId('shelf'),type:'retail.listAll',payload:p}),
      setRetailPrice:p=>commit({requestId:newRequestId('shelf-price'),type:'retail.setPrice',payload:p}),
      withdrawRetail:p=>commit({requestId:newRequestId('shelf-withdraw'),type:'retail.withdraw',payload:p}),
      receiveLegacy:async()=>{const result=await commit({requestId:newRequestId('old-order'),type:'supplier.receiveAll',payload:{}});notify(result.ok?'旧订单已入库，没有再次扣款。':result.error.message,result.ok?'success':'error');return result;},
    };
    try{
      const [next,art]=await Promise.all([refresh(),fetch('/assets/frontend-next/products/manifest.json').then(r=>{if(!r.ok)throw Error('包装图读取失败');return r.json();})]);if(!active())return;
      if(kind==='opening'&&!saved&&view.sealed.some(g=>g.kind==='box'&&g.available)&&!view.sealed.some(g=>g.kind==='pack'&&g.available))draft.mode='box';
      if(kind==='opening'&&options.productId){const group=view.sealed.find(g=>g.productId===options.productId&&(!options.kind||g.kind===options.kind));if(group){draft.mode=group.kind==='box'?'box':'pack';draft.productId=group.groupId;}}
      controller=config.mount({root,view:next,actions,draft,layout:{pageSizes:{wide:4,mid:4,narrow:2}},format:app.formatMoney,assets:{productImage:(id,unit)=>art.products[id]?.[unit]||art.products.standard?.[unit]},notify});
    }catch(error){if(active())root.replaceChildren(errorView({code:error.code||'VIEW_ERROR',message:error.message}));}
    function dispose(){if(disposed)return;if(controller){state[kind]={identity:branch,draft:controller.getDraft()};controller.dispose();}disposed=true;}
    ctx.handle.stationDispose=dispose;ctx.onCleanup(dispose);
  }});
}
export const openPurchase=(app,options={})=>openStation(app,'purchase',options);
export const openWarehouse=(app,options={})=>openStation(app,'warehouse',options);
export const openOpening=(app,options={})=>openStation(app,'opening',options);
export const openSupply=(app,options={})=>openStation(app,options.interaction==='store.checkout'?'checkout':options.tab==='retail'||options.purchaseTab==='retail'?'retail':'purchase',options);
