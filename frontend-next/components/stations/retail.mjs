import {el,button,segmented,packaging,emptyState,chip} from '../workspace/dom.mjs';
import {paginate,pagerBar,createCapacity} from './common.mjs';
import {injectF6Styles} from './styles.mjs';
import {productAlbum} from './product-album.mjs';

export function mountRetail({root,view,actions,draft={},assets,format,notify=()=>{}}){
  let page=draft.page||0,tab=draft.tab||'stock',busy=false,disposed=false;
  const main=el('div',{class:'f6-main'}),foot=el('div',{class:'f6-foot'}),frame=el('section',{class:'f6-root','aria-label':'零售货架'},[main,foot]);root.replaceChildren(frame);injectF6Styles(frame);
  const capacity=createCapacity(frame,null,()=>paint());
  async function run(name,args){if(busy)return;busy=true;paint();try{const result=await actions[name](args);if(!disposed)notify(result.ok?'已更新货架。':result.error.message,result.ok?'success':'error');}finally{busy=false;paint();}}
  function paint(){
    if(disposed)return;main.replaceChildren();
    main.append(el('div',{class:'f6-scope__row'},[segmented([['stock','从仓库上架'],['shelf','货架与标价']],tab,id=>{tab=id;page=0;paint();}),chip('货架 '+view.retail.used+' / '+view.retail.capacity)]));
    const rows=view.retail.shelves.filter(row=>tab==='stock'?row.warehouse>0:row.stock>0),paging=paginate(rows,page,1);page=paging.page;
    const grid=el('div',{class:'f6-grid'});
    for(const row of paging.rows){
      const input=el('input',{class:'f6-select',type:'number',min:1,max:1000000,value:row.unitAmount,'aria-label':row.label+' 售价'}),kind=row.kind==='sealed-box'?'box':'pack';
      const art=packaging(assets,row.productId,kind,row.label);art.style.cssText='width:64px;height:72px';
      art.classList.add('f6-artframe');grid.append(el('article',{class:'f6-tile f6-product-detail'},[el('div',{class:'f6-tile__head'},[art,el('div',{},[el('strong',{text:row.label+' · '+(kind==='box'?'卡盒':'散包')}),el('p',{text:'仓库 '+row.warehouse+' · 在架 '+row.stock})])]),
        tab==='stock'?button('上架这组库存',()=>run('listRetail',{inventoryRefs:row.stockRefs}),{disabled:busy||view.pending||!view.atStation.retail}):el('div',{},[el('label',{},['首件售价 ',input]),el('div',{class:'pbc-actions'},[button('保存首件价格',()=>run('setRetailPrice',{inventoryRef:row.inventoryRefs[0],amount:Number(input.value)}),{disabled:busy||view.pending||!view.atStation.retail||!row.inventoryRefs.length}),button('撤下一件',()=>run('withdrawRetail',{inventoryRef:row.inventoryRefs[0]}),{disabled:busy||view.pending||!view.atStation.retail||!row.inventoryRefs.length})])])
      , productAlbum(row.productId,actions,row)]));
    }
    main.append(rows.length?grid:emptyState(tab==='stock'?'仓库没有待上架商品':'货架还没有商品','可以去进货，或把开店赠礼中的盒包装上货架。'));
    foot.replaceChildren(pagerBar({...paging,unit:'组',onPage:next=>{page=next;paint();}}));
  }
  paint();return {update(next){view=next;paint();},getDraft:()=>({tab,page}),dispose(){disposed=true;capacity.disconnect();root.replaceChildren();}};
}
export function mountCheckout({root,view,draft={}}){
  let page=draft.page||0,disposed=false;
  const main=el('div',{class:'f6-main'}),foot=el('div',{class:'f6-foot'}),frame=el('section',{class:'f6-root','aria-label':'顾客收银'},[main,foot]);root.replaceChildren(frame);injectF6Styles(frame);
  function paint(){if(disposed)return;main.replaceChildren(el('p',{text:'顾客会自动付款，无需逐单确认。当前结账：'+view.checkout.customers.map(c=>c.name).join('、')+(view.checkout.customers.length?'':'暂无')}));
    const paging=paginate(view.checkout.transactions,page,Number.MAX_SAFE_INTEGER);page=paging.page;
    for(const row of paging.rows)main.append(el('div',{class:'pbc-card'},[el('strong',{text:row.name+' · '+row.productName}),el('p',{text:(row.kind==='box'?'卡盒':'卡包')+' · 收入 '+row.amount+' 游戏币'})]));
    if(!paging.total)main.append(emptyState('还没有顾客买包','先将卡包或卡盒放上零售货架。'));
    foot.replaceChildren(pagerBar({...paging,unit:'笔',onPage:next=>{page=next;paint();}}));
  }
  paint();return {update(next){view=next;paint();},getDraft:()=>({page}),dispose(){disposed=true;root.replaceChildren();}};
}
