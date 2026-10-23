import {el,art,ProductTile} from '../components/trade.mjs';
import {createSurface} from '../services/surface.mjs';
import {draftFor,unwrap,queryAll,productView} from '../services/views.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';

const tabs=[['order','采购商品'],['orders','到货签收'],['stock','密封仓库'],['retail','零售货架']];
const waiting=draft=>['submitting','unknown'].includes(draft.operation?.status);
let images;
async function productImages(){if(!images)images=fetch('/assets/frontend-next/products/manifest.json').then(r=>{if(!r.ok)throw Error('包装图清单加载失败');return r.json();}).catch(()=>({products:{}}));return images;}

export async function openSupply(app,options={}){
  const draft=draftFor(app,'supply',{tab:'order',unit:'box',search:'',basket:[],quote:null,scroll:{}});
  if(tabs.some(([id])=>id===options.tab))draft.tab=options.tab;
  return app.windows.open({id:'supplier',title:'采购与库存',subtitle:'实时报价 · 整篮采购 · 收货不拆包',width:'window--trade',refreshOnReuse:true,pauseReason:'采购与库存',render:async ctx=>{
    const surface=await createSurface(ctx);if(!surface.active())return;
    let generation=0,data={products:[],sealed:[],orders:[],retail:{shelves:[]}},artManifest={products:{}},working=false,detail=null;
    const format=app.formatMoney,near=id=>!app.isNearInteraction||app.isNearInteraction(id);
    const station=()=>draft.tab==='retail'?'store.retail':'store.counter';
    const button=(text,onclick,primary=false,disabled=false)=>el('button',{class:'button'+(primary?' button--primary':''),onclick,disabled,text});
    const showError=r=>surface.setMessage('['+(r.error?.code||'ERROR')+'] '+(r.error?.message||'操作失败'),'error');
    function go(){app.goToInteraction(station(),'supplier',{tab:draft.tab});}
    function saveScroll(){const node=surface.root.querySelector('.catalog');if(node)draft.scroll[draft.tab]=node.scrollTop;}
    async function load(message){
      const turn=++generation;
      try{
        const [products,sealed,orders,retail,pictures]=await Promise.all([
          queryAll(ctx,'products.list'),ctx.query('inventory.sealedSummary').then(unwrap),queryAll(ctx,'supplier.orders'),ctx.query('retail.list').then(unwrap),productImages()
        ]);
        if(!surface.active()||turn!==generation)return;
        data={products,sealed:sealed.items,orders,retail};artManifest=pictures;
        const current=app.snapshot(),basis=draft.quoteBasis;
        if(draft.quote&&(!basis||basis.worldId!==current.worldId||basis.branchId!==current.branchId||basis.day!==current.clock.day)){draft.quote=null;draft.quoteBasis=null;message='供货日期或进度已变化，旧报价已清除；购物篮数量保留，请重新询价。';}
        render();surface.setMessage(message||'目录与库存已更新，所有数量与价格来自当前存档。',message?'success':'info');
      }catch(e){if(surface.active()&&turn===generation){surface.setMessage('['+(e.code||'LOAD_ERROR')+'] '+e.message,'error');surface.workspace.replaceChildren(el('div',{class:'surface-empty'},['数据尚未加载完成。',button('重新读取',()=>load())]));}}
    }
    function product(id){return data.products.find(p=>p.productId===id);}
    function view(row,unit){return productView(row,unit,artManifest,data.sealed,data.orders);}
    function change(productId,unit,quantity){
      if(waiting(draft)){surface.setMessage('请先确认上一笔操作结果，购物篮暂时保留。');return;}
      if(!Number.isSafeInteger(quantity)||quantity<0||quantity>20){surface.setMessage('每项数量应为 0～20 的整数。','error');renderBasket();return;}
      draft.basket=draft.basket.filter(l=>l.productId!==productId||l.unit!==unit);if(quantity)draft.basket.push({productId,unit,quantity});draft.quote=null;renderBasket();
    }
    function add(id){const row=data.products.map(p=>view(p,draft.unit)).find(p=>p.id===id);if(!row)return;const existing=draft.basket.find(l=>l.productId===row.productId&&l.unit===row.kind);change(row.productId,row.kind,(existing?.quantity||0)+1);}
    function operationBlock(){
      const op=draft.operation;if(!op||!['unknown','submitting'].includes(op.status))return null;
      return el('section',{class:'surface-card surface-wide'},[el('h3',{text:op.status==='submitting'?'正在确认操作…':'上次操作结果尚未确定'}),el('p',{class:'surface-meta',text:'操作号 '+op.request.requestId+'。保留原请求，避免再次扣款或签收。'}),el('div',{class:'surface-actions'},[button('查询原操作结果',()=>recover(false)),button('使用原操作号重试',()=>recover(true),false,op.status!=='unknown')])]);
    }
    async function apply(result){
      if(!result.ok){
        if(['QUOTE_EXPIRED','PREVIEW_EXPIRED','UNAVAILABLE_PRODUCT'].includes(result.error?.code)){draft.quote=null;draft.quoteBasis=null;if(surface.active())await load();}
        if(surface.active()){showError(result);render();}return;
      }
      const op=draft.operation;
      if(op&&draft.handledRequest!==op.request.requestId){
        draft.handledRequest=op.request.requestId;
        if(op.request.type==='supplier.placeBasketOrder'){draft.basket=[];draft.quote=null;}
      }
      try{await app.refreshSnapshot();}catch{if(surface.active())surface.setMessage('操作已成功，但经营摘要未能刷新。请刷新读取，不要重复提交。','error');}
      if(!surface.active())return;
      const text=op?.request.type==='supplier.placeBasketOrder'?`已创建 ${result.data.orderIds.length} 笔订单，现金 ${format(result.data.cashDebit)}，授信 ${format(result.data.creditDebit)}。关闭窗口后配送时间继续推进。`:op?.request.type==='boxes.unseal'?'卡盒已拆成原有密封包，内容保持不变。':result.data.note||'操作已完成，库存与单据已刷新。';
      await load(text);
    }
    async function run(request){
      if(working||waiting(draft)){surface.setMessage('请先确认上一笔操作结果。');return;}
      if(!near(station())){surface.setMessage('请先前往对应柜台；购物篮和筛选会保留。');return;}
      working=true;const pending=performOperation(app,ctx,draft,request);render();
      try{await apply(await pending);}finally{working=false;if(surface.active())render();}
    }
    async function recover(retry){if(working)return;working=true;try{await apply(await (retry?retryOperation(app,ctx,draft):recoverOperation(app,ctx,draft)));}finally{working=false;if(surface.active())render();}}
    function render(){
      if(!surface.active())return;saveScroll();
      surface.toolbar.replaceChildren(el('div',{class:'toolbar'},[
        el('div',{class:'segmented',role:'group','aria-label':'采购工作区'},tabs.map(([id,label])=>button(label,()=>{saveScroll();draft.tab=id;detail=null;render();},draft.tab===id))),
        el('span',{class:'muted',text:'可用 '+format(app.snapshot().wallet.available)+' · 当前存档'})
      ]));
      surface.workspace.replaceChildren();
      if(draft.tab==='order')renderProducts();else if(draft.tab==='orders')renderOrders();else if(draft.tab==='stock')renderStock();else renderRetail();
      const pending=operationBlock();if(pending)surface.workspace.prepend(pending);
      if(!near(station()))surface.workspace.prepend(el('section',{class:'surface-card surface-wide'},[el('p',{text:'现在可以查看。实际交付请到'+(draft.tab==='retail'?'零售货架':'采购柜台')+'操作。'}),button('前往柜台并恢复此页',go,true)]));
      surface.footer.replaceChildren(el('span',{text:'经营时间已暂停。配送与顾客活动会在关闭交互窗口后继续；采购不提前透露密封内容。'}));
      const node=surface.root.querySelector('.catalog');if(node)node.scrollTop=draft.scroll[draft.tab]||0;
    }
    function renderProducts(){
      const catalog=el('section',{class:'catalog','aria-label':'正式供应目录'}),sidebar=el('aside',{'data-supply-basket':'true'});
      catalog.append(el('div',{class:'toolbar'},[
        el('div',{class:'segmented',role:'group','aria-label':'商品单位'},[['box','密封卡盒'],['pack','独立散包']].map(([id,label])=>button(label,()=>{saveScroll();draft.unit=id;detail=null;render();},draft.unit===id))),
        el('div',{class:'filters'},[el('input',{type:'search',value:draft.search,placeholder:'搜索主题…','aria-label':'搜索供货主题',oninput:e=>{draft.search=e.target.value;paint();}})])
      ]));
      const grid=el('div',{class:'product-grid'});catalog.append(grid);surface.workspace.append(catalog,sidebar);
      function paint(){grid.replaceChildren(...data.products.filter(p=>!draft.search||p.themeName.includes(draft.search)).map(p=>ProductTile(view(p,draft.unit),{format,onAdd:add,onDetail:p=>{detail=p;renderBasket();}})));if(!grid.childNodes.length)grid.append(el('p',{class:'surface-empty',text:'没有符合筛选的在售主题。'}));}
      paint();renderBasket();
    }
    function renderBasket(){
      const target=surface.root.querySelector('[data-supply-basket]');if(!target)return;
      const box=el('section',{class:'basket','aria-label':'真实采购购物篮'});
      box.append(el('div',{class:'section-heading'},[el('span',{class:'eyebrow',text:'PURCHASE LIST'}),el('span',{class:'chip',text:draft.basket.reduce((n,l)=>n+l.quantity,0)+' 件'})]),el('h2',{text:'这次补些什么'}));
      for(const line of draft.basket){const p=product(line.productId),amount=p?.prices?.[line.unit]?.wholesale;
        box.append(el('div',{class:'basket-line','data-basket-product':line.productId,'data-basket-unit':line.unit},[
          el('strong',{text:(p?.themeName||line.productId)+' · '+(line.unit==='box'?'卡盒':'散包')}),el('small',{class:'muted',text:p?format(amount)+' / 件':'已停止供货，请移除此项'}),
          el('div',{class:'quantity-line'},[el('label',{class:'surface-field'},['数量 ',el('input',{type:'number',min:0,max:20,value:line.quantity,disabled:waiting(draft),'aria-label':line.productId+' '+line.unit+' 采购数量',onchange:e=>change(line.productId,line.unit,Number(e.target.value))})]),button('移除',()=>change(line.productId,line.unit,0),false,waiting(draft))])
        ]));
      }
      if(!draft.basket.length)box.append(el('div',{class:'empty-basket'},[el('p',{text:'先从左侧挑选商品'}),el('small',{class:'muted',text:'每项最多 20 件，包与盒分别计数。'})]));
      const valid=draft.basket.length>0&&draft.basket.every(l=>product(l.productId)?.availability==='available');
      const estimate=draft.basket.reduce((n,l)=>n+(product(l.productId)?.prices?.[l.unit]?.wholesale||0)*l.quantity,0);
      box.append(el('div',{class:'basket-total'},[el('span',{text:'目录合计（待询价）'}),el('strong',{text:format(estimate)})]));
      box.append(button('获取整篮报价',quoteBasket,false,!valid||working||waiting(draft)));
      if(draft.quote){const q=draft.quote,affordable=q.creditDebit<=q.supplierCreditAvailable;
        box.append(el('section',{class:'surface-card','data-basket-quote':'true'},[
          el('h3',{text:'已冻结整篮报价'}),el('p',{text:'应付 '+format(q.totalDebit)}),el('p',{class:'surface-meta',text:'预计现金 '+format(q.cashDebit)+' + 供应商授信 '+format(q.creditDebit)}),
          el('p',{class:'surface-meta',text:'可用授信 '+format(q.supplierCreditAvailable)+'；货款不足部分形成欠款，后续收入优先还款。'}),
          !affordable?el('p',{class:'error-text',text:'现金与授信不足，请减少数量后重新询价。'}):null,
          button('确认整篮采购',()=>run({type:'supplier.placeBasketOrder',quoteId:q.quoteId,payload:{}}),true,!affordable||working||waiting(draft)||!near('store.counter'))
        ]));
      }
      if(detail){const p=detail.raw;box.append(el('section',{class:'surface-card'},[
        el('h3',{text:detail.name}),el('p',{class:'surface-meta',text:'整盒固定张数 '+['N','R','SR','SSR'].map(r=>r+' '+p.boxCounts[r]).join(' / ')}),el('p',{class:'surface-meta',text:p.guarantees.join('；')}),
        p.substitutionSummary?el('p',{class:'surface-meta',text:p.substitutionSummary}):null,el('details',{},[el('summary',{text:'供货版本与评分依据'}),el('p',{class:'surface-meta',text:'商品 '+p.productVersion+'；价格 '+p.priceVersion+'；评分 '+p.ratingVersion})])
      ]));}
      target.replaceChildren(box);
    }
    async function quoteBasket(){
      if(working||waiting(draft))return;working=true;const signature=JSON.stringify(draft.basket),branch=app.snapshot().branchId;
      try{const q=await ctx.query('supplier.basketQuote',{lines:structuredClone(draft.basket)});if(!surface.active()||branch!==app.snapshot().branchId||signature!==JSON.stringify(draft.basket))return;if(!q.ok){showError(q);return;}draft.quote=q.data;const current=app.snapshot();draft.quoteBasis={worldId:current.worldId,branchId:current.branchId,day:current.clock.day};renderBasket();surface.setMessage('报价已冻结。核对现金与授信后确认，全部商品一次提交。');}catch(e){if(surface.active())surface.setMessage('报价未能读取：'+e.message,'error');}finally{working=false;if(surface.active())renderBasket();}
    }
    function renderOrders(){
      const arrived=data.orders.filter(o=>o.status==='arrived'),content=el('section',{class:'surface-list','aria-label':'正式采购订单'});
      content.append(el('div',{class:'toolbar'},[el('p',{class:'muted',text:'待签收 '+arrived.length+' 单 · 运输中 '+data.orders.filter(o=>o.status==='pending').length+' 单'}),button('一键签收已到货',()=>run({type:'supplier.receiveAll',payload:{}}),true,!arrived.length||working||waiting(draft)||!near('store.counter'))]));
      if(!data.orders.length)content.append(el('p',{class:'surface-empty',text:'还没有采购订单。先在商品目录加入购物篮。'}));
      for(const order of [...data.orders].reverse())content.append(el('article',{class:'receipt-card','data-order-id':order.orderId},[
        el('div',{class:'receipt-heading'},[el('h2',{text:order.themeName+' · '+(order.unit==='box'?'卡盒':'散包')+' ×'+order.quantity}),el('span',{class:'chip',text:{pending:'运输中',arrived:'已到货',received:'已签收'}[order.status]||order.status})]),
        el('p',{text:'已付货款 '+format(order.total)}),el('p',{class:'surface-meta',text:'订单 '+order.orderId}),
        order.status==='arrived'?button('签收本单',()=>run({type:'supplier.receive',payload:{orderId:order.orderId}}),true,working||waiting(draft)||!near('store.counter')):el('p',{class:'surface-meta',text:order.status==='received'?'密封商品已入仓；未重复扣款，未自动拆包。':'关闭窗口可让配送继续，到货后直接签收。'})
      ]));
      surface.workspace.append(content);
    }
    function renderStock(){
      const content=el('section',{class:'surface-list','aria-label':'真实密封仓库'});
      content.append(el('div',{class:'toolbar'},[el('p',{class:'muted',text:'包、整盒及历史版本分开保存；不重抽已制造内容。'}),button('一键开所有可用包',()=>app.goToInteraction('store.counter','opening',{all:true}),true)]));
      const grid=el('div',{class:'product-grid'});content.append(grid);
      for(const group of data.sealed){const image=artManifest.products[group.productId]||artManifest.products.standard;grid.append(el('article',{class:'product-tile'},[
        art(image?.[group.kind],group.name,'product-art product-art--'+group.kind),el('h3',{text:group.name+' · '+(group.kind==='box'?'整盒':'散包')}),
        el('p',{text:'仓库 ×'+group.warehouse+' · 可用 '+group.available+' · 在架 '+group.onShelf}),el('p',{class:'surface-meta',text:'保护 '+group.protected+' / 占用 '+group.locked+(group.retired?' · 停产旧库存':'')}),
        el('details',{},[el('summary',{text:'查看印刷版本'}),el('p',{class:'surface-meta',text:group.productVersion})]),
        el('div',{class:'surface-actions'},[
          button('前往柜台开本组',()=>app.goToInteraction('store.counter','opening',{inventoryRefs:group.inventoryRefs,productId:group.productId,includeBoxes:group.kind==='box'}),false,!group.available),
          group.kind==='box'?button('拆 1 盒取出密封包',()=>run({type:'boxes.unseal',payload:{inventoryRef:group.inventoryRefs[0]}}),false,!group.available||working||waiting(draft)||!near('store.counter')):null
        ])
      ]));}
      if(!data.sealed.length)grid.append(el('p',{class:'surface-empty',text:'仓库尚无密封商品。签收已到货订单后会显示在这里。'}));surface.workspace.append(content);
    }
    function renderRetail(){
      const content=el('section',{class:'surface-list','aria-label':'密封零售货架'}),shelves=data.retail.shelves;
      content.append(el('div',{class:'toolbar'},[el('p',{class:'muted',text:data.retail.note}),button('按容量一键补货',()=>run({type:'retail.listAll',payload:{inventoryRefs:shelves.flatMap(s=>s.stockRefs)}}),true,working||waiting(draft)||!near('store.retail'))]));
      const grid=el('div',{class:'product-grid'});content.append(grid);
      for(const shelf of shelves){const kind=shelf.kind==='sealed-box'?'box':'pack',image=artManifest.products[shelf.productId]||artManifest.products.standard,input=el('input',{type:'number',min:1,max:1000000,value:shelf.unitAmount,'aria-label':shelf.label+' 单件售价'});
        grid.append(el('article',{class:'product-tile'},[
          art(image?.[kind],shelf.label,'product-art product-art--'+kind),el('h3',{text:shelf.label+' · '+(kind==='box'?'整盒':'散包')}),el('p',{text:'在架 ×'+shelf.stock+' / 可补货 '+shelf.warehouse}),el('p',{class:'surface-meta',text:'当前首件售价 '+format(shelf.unitAmount)}),
          el('div',{class:'surface-actions'},[button('上架 1 件',()=>run({type:'retail.list',payload:{inventoryRef:shelf.stockRefs[0]}}),false,!shelf.stockRefs.length||working||waiting(draft)||!near('store.retail')),button('撤回 1 件',()=>run({type:'retail.withdraw',payload:{inventoryRef:shelf.inventoryRefs[0]}}),false,!shelf.inventoryRefs.length||working||waiting(draft)||!near('store.retail'))]),
          el('label',{class:'surface-field'},['首件售价 ',input]),button('更新首件售价',()=>{const amount=Number(input.value);if(!Number.isSafeInteger(amount)||amount<1||amount>1000000){surface.setMessage('售价须为 1～1000000 的整数游戏币。','error');return;}run({type:'retail.setPrice',payload:{inventoryRef:shelf.inventoryRefs[0],amount}});},false,!shelf.inventoryRefs.length||working||waiting(draft)||!near('store.retail')),
          el('p',{class:'surface-meta',text:'同组不同实物可能有不同标价；此按钮仅修改首件，不冒充全组改价。'})
        ]));
      }
      if(!shelves.length)grid.append(el('p',{class:'surface-empty',text:'没有可陈列的密封商品。先采购并签收；停产商品不重新上架。'}));surface.workspace.append(content);
    }
    const unsubscribe=app.host.subscribe(event=>{if(event.type==='worldReset'){generation++;draft.quote=null;detail=null;load('已切换存档分支，旧报价已清除，购物篮数量保留。');}});surface.onDispose(unsubscribe);
    surface.setMessage('正在读取真实供货、库存和订单…');await load();
  }});
}
