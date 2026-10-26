// Pure DOM views. All prices, counts and availability are supplied by the caller.
export function el(tag,props={},children=[]){const node=document.createElement(tag);for(const [key,value]of Object.entries(props)){if(value==null||value===false)continue;if(key==='text')node.textContent=value;else if(key==='class')node.className=value;else if(key.startsWith('on'))node.addEventListener(key.slice(2),value);else node.setAttribute(key,value===true?'':String(value));}for(const child of children.flat())if(child!=null)node.append(child instanceof Node?child:document.createTextNode(String(child)));return node;}
export const money=(amount,{minorUnit=100,symbol='¥'}={})=>symbol+(amount/minorUnit).toLocaleString('zh-CN',{minimumFractionDigits:0,maximumFractionDigits:2});
export function art(url,name,className=''){
  const frame=el('div',{class:'art-frame '+className}),image=el('img',{alt:name,loading:'lazy',decoding:'async'});
  const missing=()=>{frame.classList.add('art-frame--missing');frame.replaceChildren(el('span',{'aria-hidden':true,text:'◇'}),el('small',{text:name+' · 暂无卡图'}));};
  image.addEventListener('error',missing,{once:true});if(url){image.src=url;frame.append(image);}else missing();return frame;
}
export function rarity(value){return el('span',{class:'rarity rarity--'+value,text:value});}
export function CardTile(card,{selected=false,onSelect,format=money,selling=false,metaText,metadataLabel}={}){
  return el('button',{class:'card-tile'+(selected?' is-selected':''),'aria-pressed':selected?'true':'false','data-card':card.id,'data-card-key':card.cardKey,'aria-label':card.name+' '+card.rarity+' 查看详情',onclick:()=>onSelect?.(card.id)},[
    el('div',{class:'card-tile__image'},[art(card.artUrl,card.name,'card-art'),rarity(card.rarity),el('span',{class:'owned',text:'×'+card.ownedCount})]),
    el('div',{class:'card-tile__line'},[el('strong',{text:card.name}),el('span',{class:'price',text:Number.isSafeInteger(card.price)?format(card.price):'—'})]),
    el('div',{class:'card-tile__meta'},[el('span',{text:metadataLabel??card.faction??'单卡'}),el('span',{text:metaText??(selling?'可上架 '+card.availableCount+' 张':'在售 '+card.marketStock+' 张')})])
  ]);
}
export function ProductTile(product,{onAdd,onDetail,format=money}={}){
  const unavailable=product.available===false||product.stock!=null&&product.stock<=0;
  return el('article',{class:'product-tile','data-product':product.id},[
    el('button',{class:'product-visual','aria-label':product.name+' 商品信息',onclick:()=>onDetail?.(product)},[art(product.artUrl,product.name,'product-art product-art--'+product.kind),el('span',{class:'product-kind',text:product.kind==='box'?'密封卡盒':'独立散包'})]),
    el('strong',{class:'product-name',text:product.name}),
    product.subtitle?el('p',{class:'muted product-tier',text:product.subtitle}):null,
    el('p',{class:'muted product-spec',text:product.kind==='box'?`每盒 ${product.packsPerBox} 包 · 每包 ${product.cardsPerPack} 张`:`每包 ${product.cardsPerPack} 张`}),
    el('div',{class:'product-price'},[el('strong',{text:format(product.unitPrice)}),el('span',{class:'muted',text:' / '+(product.kind==='box'?'盒':'包')})]),
    el('p',{class:'muted compact',text:'建议售 '+format(product.suggestedRetail)}),
    el('p',{class:'muted compact',text:`仓库 ${product.warehouse} · 在架 ${product.onShelf} · 在途 ${product.inTransit}`}),
    el('div',{class:'product-foot'},[el('span',{class:'muted',text:product.stock==null?'持续供货':'供货 '+product.stock}),el('button',{class:'button button--small',disabled:unavailable,onclick:()=>onAdd?.(product.id),text:unavailable?'暂时缺货':'＋ 加入购物篮'})])
  ]);
}
export function CardDetailPanel(card,{format=money,onExpand,onBuy,onList,selling=false,canBuy=true,listed=0}={}){
  if(!card)return el('section',{class:'detail-panel empty'},[el('span',{class:'eyebrow',text:'CARD ARCHIVE'}),el('h2',{text:'选一张卡看看'}),el('p',{class:'muted',text:'卡面、技能和交易信息会留在这里。'})]);
  return el('section',{class:'detail-panel','aria-label':card.name+' 详情'},[
    el('div',{class:'section-heading'},[el('span',{class:'eyebrow',text:'CARD ARCHIVE'}),rarity(card.rarity)]),art(card.artUrl,card.name,'detail-art'),
    el('h2',{text:card.name}),el('p',{class:'muted compact',text:[card.faction,card.theme].filter(Boolean).join(' / ')}),
    el('div',{class:'detail-price'},[el('span',{class:'muted',text:selling?'演示挂单价':'演示购入价'}),el('strong',{text:format(card.price)})]),
    el('div',{class:'holding-line'},[el('span',{text:'持有 ×'+card.ownedCount}),el('span',{text:selling?'已上架 '+listed:'市场剩余 '+card.marketStock})]),
    el('button',{class:'button button--ghost full',onclick:()=>onExpand?.(card),text:'查看大图与完整技能 ↗'}),
    el('p',{class:'muted compact',text:selling?'可上架 '+card.availableCount+' 张；保留与占用数量由演示数据提供。':'确认后仅改变本页模拟数据，刷新恢复。'}),
    el('button',{class:'button button--primary full',disabled:selling?card.availableCount<1:!canBuy||card.marketStock<1,onclick:()=>selling?onList?.(card.id):onBuy?.(card.id),text:selling?'模拟上架 1 张':'模拟买入 1 张'})
  ]);
}
export function SupplierBasket(lines,{onChange,onSubmit,format=money,balance=Infinity}={}){
  const quantity=lines.reduce((n,l)=>n+l.quantity,0),total=lines.reduce((n,l)=>n+l.quantity*l.product.unitPrice,0);
  return el('section',{class:'basket','aria-label':'采购购物篮'},[
    el('div',{class:'section-heading'},[el('span',{class:'eyebrow',text:'PURCHASE LIST'}),el('span',{class:'chip',text:quantity+' 件'})]),el('h2',{text:'这次带回店里'}),
    el('div',{class:'basket-lines'},lines.length?lines.map(({product,quantity:q})=>el('div',{class:'basket-line','data-basket-line':product.id},[
      el('strong',{text:product.name}),el('small',{class:'muted',text:(product.kind==='box'?'卡盒':'散包')+' · '+format(product.unitPrice)+' / 件'}),
      el('div',{class:'quantity-line'},[el('div',{class:'stepper'},[
        el('button',{'aria-label':product.name+' 减少',onclick:()=>onChange?.(product.id,q-1),text:'−'}),
        el('input',{type:'number',min:0,max:product.stock,step:1,value:q,'aria-label':product.name+' 数量',onchange:e=>onChange?.(product.id,Number(e.target.value))}),
        el('button',{'aria-label':product.name+' 增加',disabled:q>=product.stock,onclick:()=>onChange?.(product.id,q+1),text:'＋'})]),el('span',{text:format(product.unitPrice*q)})])
    ])):[el('div',{class:'empty-basket'},[el('span',{'aria-hidden':true,text:'⌑'}),el('p',{text:'挑一些新货吧'}),el('small',{class:'muted',text:'商品图册会一直留在左侧。'})])]),
    el('div',{class:'basket-total'},[el('span',{text:'采购合计'}),el('strong',{'data-total':total,text:format(total)})]),
    total>balance?el('p',{class:'error-text',text:'演示余额不足，请减少数量。'}):null,
    el('button',{class:'button button--primary full',disabled:!quantity||total>balance,onclick:()=>onSubmit?.(),text:'模拟下单 · '+format(total)}),
    el('p',{class:'muted compact',text:'演示订单立即到货；签收时只加入本页模拟仓库。'})
  ]);
}
