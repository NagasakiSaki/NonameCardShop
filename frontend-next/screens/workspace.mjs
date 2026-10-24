// Formal binding for PLAY-B components. No Mock or candidate-directory runtime dependencies.
import {mountTradeWorkspace} from '../components/workspace/workspace.mjs';
import {el,clear,errorView,newRequestId} from '../../frontend/ui/components.mjs';
import {queryAll,unwrap} from '../services/views.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';

const ACTIONS={placeBasketOrder:'supplier.placeBasketOrder',receiveAll:'supplier.receiveAll',receiveOrder:'supplier.receive',unsealBox:'boxes.unseal',retailList:'retail.list',retailWithdraw:'retail.withdraw',retailSetPrice:'retail.setPrice',retailListAll:'retail.listAll',openingExecute:'opening.execute',listSurplus:'market.listSurplus',marketAccept:'market.acceptTrade',placeListing:'market.placeListing',cancelListing:'market.cancelListing',setProtection:'inventory.setProtection'};
const failure=(code,message)=>({ok:false,error:{code,message,retryable:false}});
const branch=app=>`${app.snapshot().worldId}:${app.snapshot().branchId}`;
export async function openTradeWorkspace(app,options={}){
  const existing=app.windows.stack.find(item=>item.id==='trade-workspace')?.handle;
  if(existing){existing.focus();existing.chooseTradeSection?.(options);return existing;}
  return app.windows.open({id:'trade-workspace',title:'卡店交易台',subtitle:'采购 · 仓库 · 开包 · 收藏与市场',width:'window--wide',pauseReason:'卡店交易',render:async ctx=>{
    ctx.handle.tradeDispose?.();clear(ctx.body);let disposed=false,controller=null,loading=null,currentView=null;
    const root=el('div',{class:'pbc-root','data-live-trade':'true',style:{minWidth:'0'}}),message=el('div',{role:'status','aria-live':'polite'}),stations=el('nav',{class:'surface-actions',style:{display:'flex',gap:'8px',flexWrap:'wrap',margin:'0 0 12px'},'aria-label':'前往交易设施'});
    for(const [label,id,panel,scope]of [['进货 / 收货柜台','store.counter','supplier',{}],['零售货架','store.retail','supplier',{purchaseTab:'retail'}],['拆包工作台','store.opening','opening',{}],['二级市场','store.secondaryMarket','market',{}]])stations.append(el('button',{class:'btn btn--sm',text:label,onclick:()=>app.goToInteraction(id,panel,scope)}));
    ctx.body.append(stations,message,root);
    const identity=branch(app),active=()=>!disposed&&!ctx.handle.closed&&identity===branch(app);
    let saved=app.playTradeDraft;
    if(saved?.identity!==identity)saved=null;
    const draft=saved?.state||{};
    if(saved&&saved.day!==app.snapshot().clock.day){if(draft.purchase){draft.purchase.quote=null;draft.purchase.quoteBasis=null;}if(draft.unbox){draft.unbox.preview=null;draft.unbox.surplus=null;}if(draft.collection)draft.collection.quote=null;}
    const operation=app.playTradeOperation??={};
    if(operation.operation&&`${operation.operation.worldId}:${operation.operation.branchId}`!==identity)operation.operation.status='stale';
    const query=(name,p={})=>active()?ctx.query(name,p):Promise.resolve(failure('STALE_OPERATION','窗口已关闭或世界已切换，请重新打开。'));
    async function refresh(){
      if(!active())return;
      if(loading)return loading;
      loading=(async()=>{
        const requests=[queryAll(ctx,'products.list'),queryAll(ctx,'supplier.orders'),query('inventory.sealedSummary'),query('retail.list'),queryAll(ctx,'inventory.list',{grouped:true}),...['buy','mine','bids','history'].map(tab=>queryAll(ctx,'market.list',{tab})),query('management.people')];
        const [products,orders,sealedResult,retailResult,inventory,buy,mine,bids,history,peopleResult]=await Promise.all(requests);
        const sealed=unwrap(sealedResult),retail=unwrap(retailResult);if(!active())return;
        const s=app.snapshot(),people=peopleResult.ok?peopleResult.data:null;
        currentView={worldId:s.worldId,branchId:s.branchId,clock:s.clock,wallet:{...s.wallet},atStation:{counter:app.isNearInteraction('store.counter'),opening:app.isNearInteraction('store.opening'),market:app.isNearInteraction('store.secondaryMarket'),retail:app.isNearInteraction('store.retail')},products,sealed:sealed.items,orders,retail,retailCapacity:retail,inventory,market:{buy,mine,bids:bids.map(row=>({...row,personId:row.personId||people?.neighbors.find(n=>n.personId===row.personId||n.pending?.orderId===row.orderId)?.personId})),history}};
        controller?.update(currentView);message.textContent='';return currentView;
      })().catch(error=>{if(active()){message.textContent=error.message;message.style.color='#efb9a9';}throw error;}).finally(()=>{loading=null;});return loading;
    }
    async function commit(name,args={}){
      if(!active())return failure('STALE_OPERATION','窗口已关闭或进度已切换。');
      const {requestId,quoteId,previewId,...payload}=args;
      const request={type:ACTIONS[name],payload,requestId:requestId||newRequestId('trade')};
      if(quoteId)request.quoteId=quoteId;if(previewId)request.previewId=previewId;
      const result=await performOperation(app,ctx,operation,request);
      if(active()){try{await refresh();}catch{/* The transaction result is authoritative even if a read fails. */}}
      return result;
    }
    const actions=Object.fromEntries(Object.keys(ACTIONS).map(name=>[name,args=>commit(name,args)]));
    Object.assign(actions,{
      quoteBasket:p=>query('supplier.basketQuote',p),openingPreview:p=>query('opening.preview',p),surplusPreview:()=>query('inventory.surplusPreview'),marketQuote:p=>query('market.quote',{...p,quantity:1}),cardDetail:p=>query('catalog.detail',p),
      async queryOperation({requestId}){if(operation.operation?.request.requestId===requestId)await recoverOperation(app,ctx,operation);const result=await query('operations.get',{requestId});if(active())await refresh().catch(()=>{});return result;},
      async retryOperation({requestId}){if(operation.operation?.request.requestId!==requestId)return failure('NO_OPERATION','找不到原始提交参数，请先查询原操作。');const result=await retryOperation(app,ctx,operation);if(active())await refresh().catch(()=>{});return result;},
      refresh:()=>refresh().catch(()=>null),
      goUnbox:scope=>{app.goToInteraction('store.opening','opening',scope);return {ok:true};},
      openMarket:({tab='collection'}={})=>{app.goToInteraction('store.secondaryMarket','market',{tab:tab==='sell'?'collection':tab});return {ok:true};},
      openNeighborOrders:()=>{app.goToInteraction('store.secondaryMarket','management',{tab:'neighbors'});return {ok:true};},
      openCardDetail:({cardKey})=>app.openPanel('cardDetail',{cardKey}),
    });
    function choose(next={}){if(!controller)return;controller.setSection(next.section||'collection');if(next.tab)controller.setTab(next.tab);if(next.purchaseTab)controller.setPurchaseTab(next.purchaseTab);if(next.cardKey)controller.selectCard(next.cardKey);if(next.inventoryRefs?.length||next.productId)controller.setOpeningScope(next);}
    ctx.handle.chooseTradeSection=choose;
    let productArt;
    try{
      const artResponse=await fetch('/assets/frontend-next/products/manifest.json');if(!artResponse.ok)throw Error('包装素材清单读取失败');productArt=await artResponse.json();
      const view=await refresh();if(!view||!active())return;
      controller=mountTradeWorkspace({root,view,actions,draft,initialSection:options.section||'collection',format:app.formatMoney,assets:{productImage:(id,kind)=>productArt.products[id]?.[kind]||productArt.products.standard?.[kind],portrait:personId=>app.manifest.characters[{'student':'bd-tomori','collector':'bd-anon','duelist':'bd-rana'}[personId]]?.avatar}});
      // Restore results/drafts only within the same authoritative world branch.
      choose(options);
      const pending=operation.operation;
      if(pending&&['unknown','submitting'].includes(pending.status)){
        const warning=el('section',{class:'surface-message',text:'上次操作结果尚未确认；请查询原操作，避免重复提交。'});
        const check=el('button',{class:'btn',text:'查询上次操作',onclick:async()=>{const result=await recoverOperation(app,ctx,operation);if(!active())return;warning.textContent=result.ok?'已找回原操作结果。':result.error.message;await refresh().catch(()=>{});}});warning.append(check);ctx.body.prepend(warning);
      }
    }catch(error){if(active()){clear(root);root.append(errorView({code:error.code||'VIEW_ERROR',message:error.message},()=>ctx.refresh()));}}
    function dispose(){if(disposed)return;if(controller){app.playTradeDraft={identity,day:app.snapshot().clock.day,state:controller.getDraft()};controller.dispose();}disposed=true;}
    ctx.handle.tradeDispose=dispose;ctx.onCleanup(dispose);
  }});
}
export const openSupply=(app,o={})=>openTradeWorkspace(app,{...o,section:'purchase'});
export const openOpening=(app,o={})=>openTradeWorkspace(app,{...o,section:'unbox'});
export const openCollection=(app,o={})=>openTradeWorkspace(app,{...o,section:'collection',tab:'collection'});
export const openCards=(app,o={})=>openTradeWorkspace(app,{...o,section:'collection',tab:o.tab||'buy'});
