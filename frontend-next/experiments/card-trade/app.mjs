import {el,art,money,rarity,CardTile,ProductTile,CardDetailPanel,SupplierBasket} from '../../components/trade.mjs';
import {cards as fixtureCards,products as fixtureProducts,initialBalance} from '../../mock/trade-fixtures.mjs';
// In-memory sandbox. No Host, fetch, storage, clock, or economy writes.
const state={screen:'market',marketMode:'buy',kind:'box',search:'',rarity:'all',selected:fixtureCards[0].id,cards:structuredClone(fixtureCards),products:structuredClone(fixtureProducts),balance:initialBalance,basket:new Map(),orders:[],warehouse:new Map(),listed:new Map()};
const $=s=>document.querySelector(s),workspace=$('#workspace'),toolbar=$('#toolbar'),dialog=$('#card-dialog');
let noticeTimer;
function notice(message){$('#notice').textContent=message;$('#notice').hidden=false;clearTimeout(noticeTimer);noticeTimer=setTimeout(()=>$('#notice').hidden=true,4200);}
function segment(values,current,onChange,label){return el('div',{class:'segmented',role:'group','aria-label':label},values.map(([value,text])=>el('button',{class:value===current?'is-active':'','aria-pressed':value===current?'true':'false',onclick:()=>onChange(value),text})));}
function updateBalance(){$('#balance').textContent=money(state.balance);$('#pending-count').textContent=state.orders.filter(o=>o.status==='arrived').length;}
function setScreen(screen){state.screen=screen;render();}
function selectCard(id){state.selected=id;for(const b of document.querySelectorAll('[data-card]')){b.classList.toggle('is-selected',b.dataset.card===id);b.setAttribute('aria-pressed',String(b.dataset.card===id));}renderDetails();if(matchMedia('(max-width:640px)').matches)openCard(state.cards.find(c=>c.id===id));}
function buyCard(id){const c=state.cards.find(c=>c.id===id);if(c.marketStock<1||state.balance<c.price){notice('演示余额或市场库存不足。');return;}state.balance-=c.price;c.marketStock--;if(c.ownedCount>0)c.availableCount++;c.ownedCount++;dialog.close();renderMarket();updateBalance();notice('已模拟买入 '+c.name+' ×1；未改变正式存档。');}
function listCard(id){const c=state.cards.find(c=>c.id===id);if(c.availableCount<1)return;c.availableCount--;state.listed.set(id,(state.listed.get(id)||0)+1);dialog.close();renderMarket();notice('已模拟上架 '+c.name+' ×1；挂单尚未成交，不计收入。');}
function listSurplus(){let total=0;for(const c of state.cards){const n=c.availableCount;total+=n;if(n){state.listed.set(c.id,(state.listed.get(c.id)||0)+n);c.availableCount=0;}}renderMarket();notice(total?'已模拟上架 '+total+' 张可售重复牌；保留/占用牌已排除。':'没有可上架的重复牌。');}
function detailOptions(){return {selling:state.marketMode==='sell',onExpand:openCard,onBuy:buyCard,onList:listCard};}
function renderDetails(){const target=$('#detail-slot');if(!target)return;const c=state.cards.find(c=>c.id===state.selected);target.replaceChildren(CardDetailPanel(c,{...detailOptions(),canBuy:!!c&&state.balance>=c.price,listed:state.listed.get(c?.id)||0}));}
function renderMarket(){
  const scroll=$('.catalog')?.scrollTop||0;
  toolbar.replaceChildren(el('div',{class:'toolbar'},[
    segment([['buy','市场购卡'],['sell','我的收藏 / 上架']],state.marketMode,v=>{state.marketMode=v;renderMarket();},'市场模式'),
    el('div',{class:'filters'},[el('input',{type:'search',placeholder:'搜索武将或技能…','aria-label':'搜索单卡',value:state.search,oninput:e=>{state.search=e.target.value;renderCardGrid();}}),
      el('select',{'aria-label':'稀有度筛选',onchange:e=>{state.rarity=e.target.value;renderCardGrid();}},[['all','全部稀有度'],['SSR','SSR'],['SR','SR'],['R','R'],['N','N']].map(([value,text])=>el('option',{value,selected:value===state.rarity,text})))])
  ]));
  workspace.replaceChildren(el('section',{class:'catalog','aria-label':'单卡目录'},[el('div',{class:'catalog-label'},[el('span',{id:'result-count'}),state.marketMode==='sell'?el('button',{class:'quick-action',onclick:listSurplus,text:'保留 1 张，其余模拟上架'}):el('span',{text:'卡面浏览 · 点选查看技能'})]),el('div',{class:'card-grid',id:'card-grid'})]),el('aside',{id:'detail-slot'}));
  renderCardGrid();renderDetails();$('.catalog').scrollTop=scroll;
}
function renderCardGrid(){
  const q=state.search.trim().toLocaleLowerCase(),selling=state.marketMode==='sell';
  const visible=state.cards.filter(c=>(!selling||c.ownedCount>0)&&(state.rarity==='all'||c.rarity===state.rarity)&&(!q||[c.name,...c.skills.map(s=>s.name)].join(' ').toLocaleLowerCase().includes(q)));
  $('#result-count').textContent=visible.length+' 种卡牌'+(selling?' · 模拟收藏':' · 本地卡面');
  $('#card-grid').replaceChildren(...(visible.length?visible.map(c=>CardTile(c,{selected:c.id===state.selected,onSelect:selectCard,selling})):[el('p',{class:'muted empty',text:'没有符合筛选的卡牌，试试其他名称或稀有度。'})]));
}
function openCard(c){
  const selling=state.marketMode==='sell';
  $('#dialog-body').replaceChildren(el('div',{class:'dialog-content'},[art(c.artUrl,c.name,'dialog-art'),el('div',{class:'dialog-copy'},[
    rarity(c.rarity),el('h2',{id:'dialog-title',text:c.name}),el('p',{class:'muted',text:c.faction+' / '+c.theme+' · 持有 ×'+c.ownedCount+' · '+money(c.price)}),
    ...c.skills.map(s=>el('section',{class:'skill'},[el('h3',{text:s.name}),el('p',{text:s.description})])),
    el('p',{class:'muted compact',text:'技能摘自现有卡库。稀有度、金额和数量仅为界面演示，不代表正式卡牌分级。'}),
    el('button',{class:'button button--primary full',disabled:selling?c.availableCount<1:c.marketStock<1||state.balance<c.price,onclick:()=>selling?listCard(c.id):buyCard(c.id),text:selling?'模拟上架 1 张':'模拟买入 1 张 · '+money(c.price)})
  ])]));
  if(!dialog.open)dialog.showModal();
}
function lines(){return [...state.basket].map(([id,quantity])=>({product:state.products.find(p=>p.id===id),quantity}));}
function mobileCheckout(){
  const bar=$('#mobile-checkout'),items=lines(),total=items.reduce((n,l)=>n+l.quantity*l.product.unitPrice,0),visible=state.screen==='supplier'&&items.length>0;
  bar.hidden=!visible;document.body.classList.toggle('has-mobile-checkout',visible);
  bar.replaceChildren(el('button',{class:'mobile-checkout__total',onclick:()=>$('#basket-slot')?.scrollIntoView({block:'start'}),text:'合计 '+money(total)+' · 看明细 ↑'}),el('button',{class:'button button--primary',disabled:!visible||total>state.balance,onclick:placeOrder,text:'模拟下单'}));
}
function changeQuantity(id,value){const p=state.products.find(p=>p.id===id);if(!Number.isInteger(value)||value<0||value>p.stock){notice('数量应为 0～'+p.stock+' 的整数。');renderBasket();return;}if(value)state.basket.set(id,value);else state.basket.delete(id);renderBasket();}
function addProduct(id){const p=state.products.find(p=>p.id===id),q=(state.basket.get(id)||0)+1;if(q>p.stock){notice('已达到演示供货库存。');return;}changeQuantity(id,q);notice('购物篮：'+p.name+' ×'+q);}
function renderBasket(){
  $('#basket-slot')?.replaceChildren(SupplierBasket(lines(),{onChange:changeQuantity,onSubmit:placeOrder,balance:state.balance}));
  const jump=$('#basket-jump');if(jump)jump.textContent='购物篮 · '+[...state.basket.values()].reduce((a,b)=>a+b,0)+' 件 ↓';
  mobileCheckout();
}
function placeOrder(){
  const orderLines=lines();if(!orderLines.length)return;const total=orderLines.reduce((n,l)=>n+l.quantity*l.product.unitPrice,0);if(total>state.balance)return;
  // Snapshot receipt values: later quantity edits cannot alter a paid sample order.
  const order={id:'DEMO-'+String(state.orders.length+1).padStart(3,'0'),status:'arrived',total,lines:orderLines.map(l=>({id:l.product.id,name:l.product.name,kind:l.product.kind,quantity:l.quantity,unitPrice:l.product.unitPrice}))};
  for(const l of orderLines)l.product.stock-=l.quantity;state.balance-=total;state.basket.clear();state.orders.unshift(order);renderSupplier();updateBalance();notice(order.id+' 模拟已到货，前往“收货仓库”即可签收。');
}
function openProduct(p){
  $('#dialog-body').replaceChildren(el('div',{class:'dialog-content'},[art(p.artUrl,p.name,'dialog-art product-art'),el('div',{class:'dialog-copy'},[el('p',{class:'eyebrow',text:p.kind==='box'?'SEALED BOX':'BOOSTER PACK'}),el('h2',{id:'dialog-title',text:p.name}),el('p',{class:'muted',text:p.subtitle}),el('p',{class:'skill',text:'采购 '+money(p.unitPrice)+' / '+(p.kind==='box'?'盒':'包')+'；演示建议售价 '+money(p.suggestedRetail)}),el('p',{text:`模拟仓库 ${p.warehouse} · 在架 ${p.onShelf} · 在途 ${p.inTransit}`}),el('p',{class:'muted',text:'每盒 '+p.packsPerBox+' 包，每包 '+p.cardsPerPack+' 张。此页只展示商品单位，不展示或提前生成密封内容。'}),el('button',{class:'button button--primary full',disabled:p.stock<1,onclick:()=>{addProduct(p.id);dialog.close();},text:'加入模拟购物篮'})])]));if(!dialog.open)dialog.showModal();
}
function renderSupplier(){
  const scroll=$('.catalog')?.scrollTop||0;
  toolbar.replaceChildren(el('div',{class:'toolbar'},[segment([['box','密封卡盒'],['pack','独立散包']],state.kind,v=>{state.kind=v;renderSupplier();},'采购单位'),el('button',{class:'button button--small',id:'basket-jump',onclick:()=>$('#basket-slot').scrollIntoView({block:'start',behavior:matchMedia('(prefers-reduced-motion:reduce)').matches?'instant':'smooth'}),text:'购物篮 ↓'})]));
  workspace.replaceChildren(el('section',{class:'catalog','aria-label':'商品目录'},[el('div',{class:'catalog-label'},[el('span',{text:'6 个在售主题 · 模拟供货'}),el('button',{class:'quick-action',onclick:()=>setScreen('receipts'),text:'待签收 '+state.orders.filter(o=>o.status==='arrived').length+' 单 ↗'})]),el('div',{class:'product-grid'},state.products.filter(p=>p.kind===state.kind).map(p=>ProductTile(p,{onAdd:addProduct,onDetail:openProduct})))]),el('aside',{id:'basket-slot'}));renderBasket();$('.catalog').scrollTop=scroll;
}
function receive(id){const order=state.orders.find(o=>o.id===id);if(!order||order.status!=='arrived')return;for(const l of order.lines)state.warehouse.set(l.id,(state.warehouse.get(l.id)||0)+l.quantity);order.status='received';renderReceipts();updateBalance();notice(id+' 已模拟签收；没有再次扣款，也没有拆开卡盒。');}
function renderReceipts(){
  toolbar.replaceChildren(el('div',{class:'toolbar'},[el('span',{class:'muted',text:'已付款 '+state.orders.length+' 单 · 待签收 '+state.orders.filter(o=>o.status==='arrived').length+' 单'}),el('button',{class:'button button--small',onclick:()=>setScreen('supplier'),text:'继续采购 ↗'})]));
  const content=state.orders.length?[
    ...state.orders.map(o=>el('article',{class:'receipt-card','data-order':o.id},[
      el('div',{class:'receipt-heading'},[el('div',{},[el('h2',{text:o.id}),el('small',{class:'muted',text:'演示已付款 · 合计 '+money(o.total)})]),el('span',{class:'chip',text:o.status==='received'?'已签收':'已到货 / 待签收'})]),
      el('ul',{},o.lines.map(l=>el('li',{},[el('span',{text:l.name+' ×'+l.quantity}),el('span',{text:money(l.unitPrice*l.quantity)})]))),
      o.status==='arrived'?el('button',{class:'button button--primary',onclick:()=>receive(o.id),text:'模拟签收本单'}):el('p',{class:'muted',text:'密封商品已加入本页模拟仓库。签收不拆包，不再次收费。'})
    ])),el('div',{class:'receipt-summary',text:'本页新增仓库：'+[...state.warehouse.values()].reduce((a,b)=>a+b,0)+' 件密封商品'})
  ]:[el('div',{class:'empty receipt-card'},[el('p',{class:'eyebrow',text:'RECEIVING DESK'}),el('h2',{text:'货单还空着'}),el('p',{class:'muted',text:'去采购台挑选商品，模拟下单后在这里直接签收。'}),el('button',{class:'button button--primary',onclick:()=>setScreen('supplier'),text:'前往采购台'})])];
  workspace.replaceChildren(el('section',{class:'receipt-panel','aria-label':'模拟收货单'},content));
}
function render(){
  const info={market:['THE SECONDARY MARKET','每张卡，都值得看清。','只在二级市场交易单卡'],supplier:['THE SUPPLIER CATALOG','给货架，添一点新鲜。','卡盒与散包分开 · 购物篮集中结算'],receipts:['THE RECEIVING DESK','新货到了，一眼点清。','已付款订单直接签收 · 不自动拆包']}[state.screen];
  $('#page-kicker').textContent=info[0];$('#page-title').textContent=info[1];$('#footer-note').textContent=info[2];for(const b of document.querySelectorAll('[data-screen]')){b.classList.toggle('is-active',b.dataset.screen===state.screen);b.setAttribute('aria-current',b.dataset.screen===state.screen?'page':'false');}
  ({market:renderMarket,supplier:renderSupplier,receipts:renderReceipts}[state.screen])();updateBalance();mobileCheckout();
}
document.querySelectorAll('[data-screen]').forEach(b=>b.addEventListener('click',()=>setScreen(b.dataset.screen)));
$('#dialog-close').addEventListener('click',()=>dialog.close());dialog.addEventListener('click',e=>{if(e.target===dialog){const r=dialog.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)dialog.close();}});
render();
