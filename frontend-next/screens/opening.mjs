import {CardTile,el,rarity} from '../components/trade.mjs';
import {createSurface} from '../services/surface.mjs';
import {draftFor,unwrap} from '../services/views.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';

const RARITIES=['SSR','SR','R','N'];
const branch=app=>JSON.stringify([app.snapshot().worldId,app.snapshot().branchId]);
const pending=draft=>['unknown','submitting'].includes(draft.operation?.status);
function clearWorld(draft,app){
  Object.assign(draft,{identity:branch(app),preview:null,result:null,operation:null,inventoryRefs:null,productId:null,revision:(draft.revision||0)+1});
}

export async function openOpening(app,options={}){
  const draft=draftFor(app,'opening',{identity:branch(app),quantity:5,includeBoxes:false,inventoryRefs:null,productId:null,preview:null,result:null,operation:null,revision:0});
  if(draft.identity!==branch(app))clearWorld(draft,app);
  const previewAll=!!options.all&&!pending(draft);
  if(!pending(draft)){
    if(previewAll){draft.inventoryRefs=null;draft.productId=null;draft.includeBoxes=false;draft.preview=null;draft.result=null;draft.operation=null;draft.revision++;}
    let changed=false;
    for(const key of ['inventoryRefs','productId','includeBoxes','quantity'])if(Object.hasOwn(options,key)){
      const value=structuredClone(options[key]);
      if(JSON.stringify(draft[key])!==JSON.stringify(value)){draft[key]=value;changed=true;}
    }
    if(changed){draft.preview=null;draft.result=null;draft.operation=null;draft.revision++;}
  }
  return app.windows.open({id:'opening',title:'开包柜台',subtitle:'先确认消耗范围，再揭晓卡牌；整盒余包保留',width:'window--trade',refreshOnReuse:true,pauseReason:'开包柜台',render:async ctx=>{
    const surface=await createSurface(ctx);if(!surface.active())return;
    let inventory=[],loading=false,querySerial=0;
    const active=()=>surface.active(),near=()=>app.isNearInteraction?.('store.opening')!==false;
    function message(error){if(active())surface.setMessage(error?.message||String(error),'error');}
    function scope(){return {...(Array.isArray(draft.inventoryRefs)?{inventoryRefs:[...draft.inventoryRefs]}:{}),...(draft.productId?{productId:draft.productId}:{}),includeBoxes:!!draft.includeBoxes};}
    function travel(){
      const preserved={...scope(),quantity:draft.quantity};
      ctx.handle.close();app.goToInteraction('store.opening','opening',preserved);
    }
    async function loadInventory(){
      const serial=++querySerial,identity=draft.identity;
      try{const data=unwrap(await ctx.query('inventory.sealedSummary',{}));if(!active()||identity!==draft.identity||serial!==querySerial)return;
        inventory=data.items;paint();
      }catch(e){if(active()&&identity===draft.identity&&serial===querySerial)message(e);}
    }
    function invalidate(){draft.preview=null;draft.operation=null;draft.revision++;if(active())surface.setMessage('');paint();}
    async function preview(all=false){
      if(loading||pending(draft))return;
      if(!all&&(!Number.isSafeInteger(draft.quantity)||draft.quantity<1||draft.quantity>10000)){message('开包数量应为 1 至 10000 的整数。');return;}
      const identity=draft.identity,revision=draft.revision;loading=true;paint();
      try{
        const result=unwrap(await ctx.query('opening.preview',{...scope(),...(!all?{quantity:draft.quantity}:{})}));
        if(identity!==draft.identity||revision!==draft.revision)return;
        draft.preview=result;draft.result=null;draft.operation=null;
        if(active())surface.setMessage(result.packs?'范围已确认；密封内容将在实际开包后显示。':'当前范围没有可拆卡包，请检查仓库、保护状态或包含整盒选项。');
      }catch(e){if(identity===draft.identity&&revision===draft.revision)message(e);}
      finally{loading=false;if(active())paint();}
    }
    function consumeResult(result,identity,revision){
      if(identity!==draft.identity||revision!==draft.revision)return;
      if(result.ok){
        if(!result.data?.opening||!Array.isArray(result.data.opening.results)){message('未收到完整开包结果，请保留操作号并查询。');return;}
        draft.result=result.data.opening;draft.preview=null;
        if(active())surface.setMessage('开包已写入收藏。关闭窗口不会退回或重新抽取。','success');
        Promise.resolve(app.refreshSnapshot?.()).catch(()=>{});if(active())void loadInventory();
      }else message(result.error);
    }
    async function execute(mode='new'){
      if(loading)return;
      if(mode!=='recover'&&!near()){travel();return;}
      const identity=draft.identity,revision=draft.revision;loading=true;
      const action=mode==='recover'?recoverOperation(app,ctx,draft):mode==='retry'?retryOperation(app,ctx,draft):performOperation(app,ctx,draft,{type:'opening.execute',previewId:draft.preview?.previewId,payload:{}});
      paint();
      try{consumeResult(await action,identity,revision);}catch(e){message(e);}
      finally{loading=false;if(active())paint();}
    }
    function button(text,onclick,{primary=false,disabled=false,...props}={}){
      return el('button',{class:'button'+(primary?' button--primary':''),type:'button',text,onclick,disabled:disabled||loading,...props});
    }
    function paint(){
      if(!active())return;
      surface.toolbar.replaceChildren(el('div',{class:'section-heading'},[el('span',{class:'eyebrow',text:'OPEN YOUR COLLECTION'}),el('span',{class:'chip',text:'已连接当前存档'})]));
      surface.workspace.replaceChildren();surface.footer.textContent='开包不收费，消耗已购入的实物卡包；确认时会核对保护与占用状态。';
      const controls=el('section',{class:'surface-card'},[el('h3',{text:'选择这次开包范围'})]);
      const packs=inventory.filter(i=>i.kind==='pack'),boxes=inventory.filter(i=>i.kind==='box');
      const sum=(rows,key)=>rows.reduce((n,row)=>n+(row[key]||0),0);
      controls.append(el('p',{class:'surface-meta','data-sealed-counts':'true',text:`仓库散包 ${sum(packs,'warehouse')} 包（可用 ${sum(packs,'available')}）；密封盒 ${sum(boxes,'warehouse')} 盒（可用 ${sum(boxes,'available')}）；货架上的商品不在开包范围。`}));
      const quantity=el('input',{type:'number',min:1,max:10000,step:1,value:draft.quantity,'aria-label':'开包数量',disabled:pending(draft)||loading,oninput:e=>{draft.quantity=Number(e.target.value);draft.preview=null;draft.revision++;surface.root.querySelector('[data-opening-preview]')?.remove();}});
      const include=el('input',{type:'checkbox','aria-label':'包含密封整盒',disabled:pending(draft)||loading,onchange:e=>{draft.includeBoxes=e.target.checked;invalidate();}});include.checked=!!draft.includeBoxes;
      controls.append(el('div',{class:'surface-field'},[el('label',{},['开包数量 ',quantity]),el('label',{},[include,' 包含密封整盒'])]));
      if(Array.isArray(draft.inventoryRefs)||draft.productId)controls.append(el('p',{class:'surface-meta',text:Array.isArray(draft.inventoryRefs)?`已限定 ${draft.inventoryRefs.length} 件仓库实物${draft.productId?'，并限定主题':''}。`:'已限定当前商品主题。'}),button('取消范围限定',()=>{draft.inventoryRefs=null;draft.productId=null;invalidate();},{disabled:pending(draft)}));
      controls.append(el('div',{class:'surface-actions'},[button('生成开包预览',()=>preview(false),{disabled:pending(draft)}),button('一键开所有包',()=>preview(true),{primary:true,disabled:pending(draft)}),button('刷新库存',()=>loadInventory())]));
      const main=el('section',{class:'surface-wide'});main.append(controls);surface.workspace.append(main);
      const op=draft.operation;
      if(pending(draft)){
        main.append(el('section',{class:'surface-card','data-opening-pending':'true'},[el('h3',{text:op.status==='submitting'?'正在确认开包':'开包结果尚未确认'}),el('p',{class:'surface-meta',text:`操作号：${op.request.requestId}。请查询原操作，或使用同一操作号重试。`}),el('div',{class:'surface-actions'},[button('查询开包结果',()=>execute('recover')),button('使用原操作号重试',()=>execute('retry'),{disabled:op.status!=='unknown'})])]));return;
      }
      if(draft.result){renderResult(main);return;}
      const p=draft.preview;
      if(p)main.append(el('section',{class:'surface-card','data-opening-preview':'true'},[el('h3',{text:'开包预览'}),el('p',{text:`消耗 ${p.packs} 包 · 将获得 ${p.cards} 张卡 · 涉及密封盒 ${p.boxes} 盒`}),el('p',{class:'surface-meta',text:`受保护或占用的仓库商品排除 ${p.excluded} 件。整盒只取本次所需包，余包保留。`}),el('div',{class:'surface-actions'},[button(near()?'确认开包':'前往开包柜台',()=>execute(),{primary:true,disabled:!p.packs}),button('取消本次预览',()=>{draft.preview=null;paint();})])]));
      else main.append(el('div',{class:'surface-empty',text:'先选择数量或“一键开所有包”生成消耗预览。这里不会提前显示密封卡牌。'}));
    }
    function renderResult(main){
      const result=draft.result,groups=new Map();
      for(const card of result.results){
        const printed=card.printedRarity||card.rarity,key=JSON.stringify([card.cardKey,printed]);
        if(!groups.has(key))groups.set(key,{id:key,cardKey:card.cardKey,name:card.name,rarity:printed,artUrl:card.imageUrl,ownedCount:0,newCount:0,price:null});
        const group=groups.get(key);group.ownedCount++;group.newCount+=card.isNew?1:0;
      }
      const summary=el('section',{class:'surface-card','data-opening-result':'true'},[el('h3',{text:`已开 ${result.packs} 包 · 收入 ${result.results.length} 张实物卡`}),el('div',{class:'surface-actions'},RARITIES.map(r=>el('span',{class:'chip'},[rarity(r),' × '+(result.byRarity?.[r]||0)])))]);
      summary.append(el('div',{class:'surface-actions'},[button('再开一批',()=>{draft.result=null;draft.preview=null;draft.operation=null;draft.revision++;surface.setMessage('');paint();void loadInventory();}),button('去二级市场上架重复牌',()=>{ctx.handle.close();app.goToInteraction('store.secondaryMarket','market',{tab:'sell'});},{primary:true})]));
      const grid=el('div',{class:'card-grid','data-opening-cards':'true'},[...groups.values()].map(card=>CardTile(card,{format:app.formatMoney,metaText:card.newCount?'本次新收录 · ×'+card.ownedCount:'本次重复 · ×'+card.ownedCount,onSelect:()=>app.openPanel('cardDetail',{cardKey:card.cardKey})})));
      main.append(summary,grid);
    }
    const unsubscribe=app.host.subscribe(event=>{
      if(event.type!=='worldReset')return;
      clearWorld(draft,app);inventory=[];loading=false;querySerial++;if(active()){surface.setMessage('已读取新的进度，旧预览和开包结果已清空。');paint();void loadInventory();}
    });surface.onDispose(unsubscribe);
    if(draft.operation?.status==='succeeded'&&!draft.result)consumeResult(draft.operation.result,draft.identity,draft.revision);
    paint();await loadInventory();if(previewAll&&active())await preview(true);
  }});
}
