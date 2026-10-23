// Formal Host views. Drafts contain UI choices only; all stock, copies and prices come from Host.
import {el,art,rarity,CardTile} from '../components/trade.mjs';
import {createSurface} from '../services/surface.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';
import {cardView,queryPage,draftFor} from '../services/views.mjs';

const TABS=[['buy','买卡'],['mine','我的出售'],['sell','出售收藏'],['bids','收购报价'],['history','行情记录']];
const FILTERS=[['all','全部持有'],['duplicate','重复卡'],['protected','已保护'],['listed','在售']];
const RARITIES=['SSR','SR','R','N'];
const pending=d=>['submitting','unknown'].includes(d.operation?.status);
const button=(text,onclick,props={})=>el('button',{class:'button',type:'button',text,onclick,...props});
const line=(label,text)=>el('div',{class:'holding-line'},[el('span',{text:label}),el('span',{text:String(text??'—')})]);

export function listingAmount(value){
  const text=String(value).trim(),amount=Number(text);
  if(!/^\d+$/.test(text)||!Number.isSafeInteger(amount)||amount<1||amount>1000000)throw Object.assign(new Error('售价须为 1～1,000,000 的整数游戏币。'),{code:'INVALID_INPUT'});
  return amount;
}

export function cardsQuery(tab,state,cursor){
  const input={search:state.search.trim()||undefined,rarity:state.rarity||undefined,cursor:cursor??undefined,limit:24};
  if(tab==='inventory')return {name:'inventory.list',input:{...input,grouped:true,filter:state.filter||'all',sort:state.sort||'score-desc'}};
  if(tab==='sell')return {name:'inventory.list',input:{...input,grouped:true,kind:'card',location:'collection'}};
  return {name:'market.list',input:{...input,tab}};
}

export function openCards(app,options={}){return openWorkspace(app,false,options);}
export function openCollection(app,options={}){return openWorkspace(app,true,options);}

async function openWorkspace(app,collection,options){
  const draft=draftFor(app,collection?'collection':'market',{tab:collection?'inventory':'buy',tabs:{},operation:null});
  if(!collection&&TABS.some(([id])=>id===options.tab))draft.tab=options.tab;
  if(collection)draft.tab='inventory';
  return app.windows.open({
    id:collection?'inventory':'market',title:collection?'背包与收藏':'二级市场',width:'window--trade',refreshOnReuse:true,
    subtitle:collection?'实物收藏 · 印刷稀有度与全局强度分开显示':'卡面浏览 · 真实挂单 · 确认后才交易',pauseReason:collection?'查看收藏':'二级市场',
    render:async ctx=>{
      const surface=await createSurface(ctx);if(!surface.active())return;
      let rows=[],cursor=null,total=0,loading=false,requestVersion=0,quoteVersion=0,actionBusy=false,preview=null,quote=null,searchTimer;
      let selectedDetail=null;
      const filter=()=>draft.tabs[draft.tab]??=( {search:'',rarity:'',filter:'all',sort:'score-desc',selected:null,scroll:0,loaded:24,amounts:{},refs:{}} );
      filter();
      if(options.inventoryRef&&draft.tab==='sell')filter().preferredRef=options.inventoryRef;
      surface.root.append(el('style',{text:'.toolbar{flex-wrap:wrap}.segmented{flex-wrap:wrap}.filters{flex-wrap:wrap}.field{display:grid;gap:6px}.field input,.field select{padding:10px;min-width:0;max-width:100%;background:var(--bg);border:1px solid var(--line);border-radius:4px;color:var(--ink)}.surface-footer{display:flex;gap:8px;flex-wrap:wrap;align-items:center}.surface-footer p{flex-basis:100%}'}));
      const catalog=el('section',{class:'catalog','aria-label':collection?'收藏卡牌目录':'二级市场卡牌目录'});
      const count=el('div',{class:'catalog-label'}),grid=el('div',{class:'card-grid'}),pager=el('div',{class:'catalog-label'}),aside=el('aside',{'aria-label':'选中卡牌与交易确认'});
      catalog.append(count,grid,pager);surface.workspace.replaceChildren(catalog,aside);
      catalog.addEventListener('scroll',()=>{filter().scroll=catalog.scrollTop;},{passive:true});
      surface.onDispose(()=>{++requestVersion;++quoteVersion;clearTimeout(searchTimer);});
      const near=()=>!app.isNearInteraction||app.isNearInteraction('store.secondaryMarket');
      const usable=()=>surface.active()&&!pending(draft)&&!actionBusy&&ctx.canSubmit();
      const transactionAllowed=()=>usable()&&near();
      const fail=error=>{if(surface.active())surface.setMessage((error.code?error.code+' · ':'')+(error.message||String(error)),'error');};
      const view=row=>cardView(row,draft.tab);
      const selected=()=>rows.find(row=>view(row).id===filter().selected);
      const invalidate=()=>{++quoteVersion;quote=null;preview=null;selectedDetail=null;};
      const go=()=>{ctx.handle.close();app.goToInteraction('store.secondaryMarket','market',{tab:collection?'sell':draft.tab,inventoryRef:filter().selected});};

      function controls(){
        const result=[];
        if(pending(draft)){
          result.push(el('p',{class:'muted compact',text:draft.operation.status==='submitting'?'交易正在提交，请稍候。':'结果尚未确定。先查询原操作，或用同一操作号重试，避免重复交易。'}));
          if(draft.operation.status==='unknown'){
            result.push(button('查询原操作结果',()=>recover(false),{disabled:actionBusy}),button('用原操作号重试',()=>recover(true),{disabled:actionBusy}));
          }
        }
        return result;
      }

      function renderFooter(){
        surface.footer.replaceChildren(...controls(),button('刷新数据',()=>reload(false),{disabled:loading||actionBusy}),
          button(collection?'前往二级市场':'查看收藏',()=>collection?app.openPanel('market',{tab:'sell'}):app.openPanel('inventory')),
          button('关闭',()=>ctx.handle.close(),{class:'button button--ghost'}));
      }

      function renderToolbar(){
        const state=filter(),nodes=[];
        if(!collection)nodes.push(el('div',{class:'segmented',role:'group','aria-label':'市场分页'},TABS.map(([id,label])=>button(label,()=>{
          if(id===draft.tab)return;
          filter().scroll=catalog.scrollTop;draft.tab=id;filter();invalidate();renderToolbar();reload(false);
        },{'aria-pressed':String(id===draft.tab),class:id===draft.tab?'is-active':''}))));
        const gradeFilter=['bids','history'].includes(draft.tab)?'全局强度分级':'印刷稀有度';
        const filters=el('div',{class:'filters'},[
          el('input',{type:'search','aria-label':'搜索单卡',placeholder:'搜索武将名称',value:state.search,oninput:e=>{
            state.search=e.target.value;clearTimeout(searchTimer);searchTimer=setTimeout(()=>{searchTimer=null;reload(true);},220);
          }}),
          el('select',{'aria-label':gradeFilter+'筛选',onchange:e=>{state.rarity=e.target.value;reload(true);}},[
            el('option',{value:'',selected:!state.rarity,text:'全部'+gradeFilter}),...RARITIES.map(r=>el('option',{value:r,selected:state.rarity===r,text:r}))
          ])
        ]);
        if(collection){
          filters.append(el('select',{'aria-label':'收藏状态筛选',onchange:e=>{state.filter=e.target.value;reload(true);}},FILTERS.map(([id,label])=>el('option',{value:id,selected:state.filter===id,text:label}))),
            el('select',{'aria-label':'收藏排序',onchange:e=>{state.sort=e.target.value;reload(true);}},[['score-desc','评分从高到低'],['score-asc','评分从低到高'],['owned-desc','持有数量'],['name','名称']].map(([id,label])=>el('option',{value:id,selected:state.sort===id,text:label}))));
        }
        nodes.push(filters);surface.toolbar.replaceChildren(el('div',{class:'toolbar'},nodes));
      }

      function renderGrid(){
        count.replaceChildren(el('span',{text:`已加载 ${rows.length} / ${total} ${collection?'条收藏记录':'条实物记录'}`}));
        if(draft.tab==='sell')count.append(button('留一，其余上架',getSurplus,{class:'quick-action',disabled:actionBusy||pending(draft)}));
        grid.replaceChildren(...rows.map(row=>{
          const c=view(row),raw=c.raw||row;
          const meta=draft.tab==='history'?`${raw.direction==='sell'?'卖出':'买入'} · 第 ${raw.day??'—'} 天`:
            draft.tab==='bids'?`${raw.buyer||'街坊求购'} · ${raw.status==='accepted'?'待交付':'待接单'}`:
            draft.tab==='buy'?raw.sellerName||'NPC 寄售':draft.tab==='mine'?'本店挂单':`可用 ${c.availableCount} / 持有 ${c.ownedCount}`;
          return CardTile(c,{format:app.formatMoney,selected:c.id===filter().selected,selling:['sell','inventory'].includes(draft.tab),
            metadataLabel:`全局 ${c.currentRarity||'—'}`,metaText:meta,onSelect:()=>select(row)});
        }));
        if(!rows.length)grid.append(el('p',{class:'muted empty',text:loading?'正在读取真实卡牌…':'没有符合筛选的卡牌。换个筛选，或先去进货开包。'}));
        pager.replaceChildren(...(cursor?[button(loading?'正在加载…':'加载更多',()=>loadMore(),{disabled:loading})]:[]));
        renderDetails();renderFooter();
      }

      function select(row){
        invalidate();filter().selected=view(row).id;renderGrid();
        if(draft.tab==='sell')loadDetail(row);
        if(matchMedia('(max-width:640px)').matches)aside.scrollIntoView({block:'start',behavior:'auto'});
      }

      async function loadDetail(row){
        const version=quoteVersion,c=view(row);
        try{
          const result=await ctx.query('catalog.detail',{cardKey:c.cardKey});
          if(!surface.active()||version!==quoteVersion||filter().selected!==c.id)return;
          if(!result.ok)throw result.error;
          selectedDetail=result.data;renderDetails();
        }catch(error){fail(error);}
      }

      function renderDetails(){
        const row=selected(),c=row&&view(row),state=filter();
        const panel=el('section',{class:'detail-panel'});
        if(!collection&&!near())panel.append(el('p',{class:'muted compact',text:'可远程查看行情；买卖和上架需到二级市场柜台。'}),button('前往二级市场柜台',go,{class:'button button--primary'}));
        if(!c){panel.append(el('p',{class:'eyebrow',text:collection?'CARD COLLECTION':'SECONDARY MARKET'}),el('h2',{text:'点选一张卡'}),el('p',{class:'muted',text:'查看卡面、持有数量和真实价格，再决定下一步。'}));}
        else{
          const raw=c.raw||row;
          panel.append(el('div',{class:'section-heading'},[el('span',{class:'eyebrow',text:'CARD ARCHIVE'}),rarity(c.rarity)]),art(c.artUrl,c.name,'detail-art'),el('h2',{text:c.name}),
            ...(!['bids','history'].includes(draft.tab)?[line('印刷稀有度',c.rarity)]:[]),line('全局强度分级',c.currentRarity||'—'),line('持有 / 可用',`${c.ownedCount} / ${c.availableCount}`),
            line(['sell','inventory'].includes(draft.tab)?'参考行情':'挂单 / 成交单价',app.formatMoney(c.price)),
            button('查看大图与完整技能',()=>app.openPanel('cardDetail',{cardKey:c.cardKey}),{class:'button button--ghost full'}));
          if(collection){
            panel.append(line('受保护',raw.protected||0),line('交易 / 比赛锁定',raw.locked||0),line('已在售',raw.listed||0),el('p',{class:'muted compact',text:'本页只查看收藏。保护、单张实物和技能源码在完整详情中查看；出售请到二级市场。'}));
          }else if(draft.tab==='buy'){
            if(quote&&quote.listingId===raw.listingId){
              panel.append(el('h3',{text:'确认买入报价'}),line('单价',app.formatMoney(quote.unitAmount)),line('手续费',app.formatMoney(quote.feeAmount)),line('应付合计',app.formatMoney(quote.totalDebit)),
                el('p',{class:'muted compact',text:(quote.explanation||[]).join(' · ')}),button('确认买入',()=>run({type:'market.acceptTrade',quoteId:quote.quoteId,payload:{listingId:raw.listingId,quantity:1}}),{class:'button button--primary full',disabled:!transactionAllowed()}),
                button('取消报价',()=>{quote=null;renderDetails();},{class:'button button--ghost'}));
            }else panel.append(button('获取买入报价',()=>getQuote(row),{class:'button button--primary full',disabled:!transactionAllowed()}));
          }else if(draft.tab==='mine'){
            panel.append(el('p',{class:'muted compact',text:'挂单尚未成交，不计入现金。撤单后实物返回收藏。'}),button('撤回此挂单',()=>run({type:'market.cancelListing',payload:{listingId:raw.listingId}}),{class:'button button--primary full',disabled:!transactionAllowed()}));
          }else if(draft.tab==='sell'){
            const refs=raw.availableRefs||[];
            const ref=refs.includes(state.refs[c.id])?state.refs[c.id]:refs[0];
            const available=!!ref&&(selectedDetail?.copies?.find(copy=>copy.inventoryRef===ref)?.available??c.availableCount>0);
            const previous=state.amounts[c.id],suggested=selectedDetail?.referencePrice?.amount??c.price;
            const amount=el('input',{type:'number',min:1,max:1000000,step:1,'aria-label':'单卡上架售价',value:previous??suggested,oninput:e=>{state.amounts[c.id]=e.target.value;}});
            panel.append(el('p',{class:'muted compact',text:`${c.ownedCount} 张持有，${c.availableCount} 张可上架；${available?'请选择未保护、未锁定的实物':'当前印刷版本没有可出售副本'}。`}),
              ...(refs.length?[el('label',{class:'field'},[el('span',{text:'待出售实物'}),el('select',{'aria-label':'待出售实物',onchange:e=>{state.refs[c.id]=e.target.value;renderDetails();}},refs.map(r=>el('option',{value:r,selected:r===ref,text:r})))])]:[]),
              el('label',{class:'field'},[el('span',{text:'挂单售价（整数游戏币）'}),amount]),
              button('确认单卡上架',()=>{try{const value=listingAmount(amount.value);run({type:'market.placeListing',payload:{inventoryRef:ref,amount:value}});}catch(error){fail(error);}},{class:'button button--primary full',disabled:!available||!transactionAllowed()}),
              el('p',{class:'muted compact',text:'上架会占用这个实物副本；真正成交后才产生收入。'}));
          }else if(draft.tab==='bids'){
            panel.append(line('买家',raw.buyer||'街坊'),line('订单状态',raw.status==='accepted'?'已接单，等待交付':'待接受'),el('p',{class:'muted compact',text:'这里只展示真实求购。接单和交付由街坊订单窗口处理。'}),button('打开街坊订单',()=>app.openPanel('management',{tab:'people'})));
          }else if(draft.tab==='history'){
            const minute=Math.floor(raw.at??0);panel.append(line('成交方向',raw.direction==='sell'?'卖出':'买入'),line('成交数量',raw.quantity??1),line('成交时间',`第 ${raw.day??'—'} 天 ${Math.floor(minute/60)}:${String(minute%60).padStart(2,'0')}`),el('p',{class:'muted compact',text:'当前存档保留的真实成交记录；历史成交价不代表当前可买价格。'}));
          }
        }
        if(preview){
          panel.append(el('h3',{text:'留一上架预览'}),el('p',{class:'muted compact',text:'范围：全部收藏，按印刷版本分别保留；本页搜索不限制此操作。尚未提交。'}),line('每种印刷版至少保留',preview.keep),line('本次新增挂单',preview.newListings),line('已在售',preview.alreadyListed),line('保护 / 锁定排除',preview.lockedExcluded),line('预计挂牌费',app.formatMoney(preview.estimatedFee)),
            el('p',{class:'muted compact',text:'受保护或占用副本会计入保留。确认时会重新核对保留数量与可售库存。'}),
            button('确认批量上架',()=>run({type:'market.listSurplus',previewId:preview.previewId,payload:{}}),{class:'button button--primary full',disabled:!preview.newListings||!transactionAllowed()}),
            button('取消批量预览',()=>{preview=null;renderDetails();},{class:'button button--ghost'}));
        }
        aside.replaceChildren(panel);
      }

      async function loadMore(version=requestVersion){
        if(loading||!surface.active())return false;
        loading=true;renderGrid();const tab=draft.tab,state=filter();
        const request=cardsQuery(tab,state,cursor);
        try{
          const data=await queryPage(ctx,request.name,request.input);
          if(!surface.active()||version!==requestVersion)return false;
          const previousCursor=cursor;
          rows.push(...data.items);total=data.total??rows.length;cursor=data.nextCursor??null;state.loaded=Math.max(state.loaded,rows.length);
          if(cursor&&cursor===previousCursor){cursor=null;throw Object.assign(new Error('列表游标未推进，请刷新后重试。'),{code:'VIEW_CURSOR'});}
          if(state.preferredRef){const target=rows.find(row=>row.inventoryRefs?.includes(state.preferredRef));if(target){state.selected=view(target).id;state.refs[state.selected]=state.preferredRef;delete state.preferredRef;}}
          if(!rows.some(row=>view(row).id===state.selected))state.selected=rows.length?view(rows[0]).id:null;
          return true;
        }catch(error){if(version===requestVersion)fail(error);return false;}
        finally{if(surface.active()&&version===requestVersion){loading=false;renderGrid();}}
      }

      async function reload(reset){
        const version=++requestVersion;invalidate();const state=filter(),scroll=reset?0:state.scroll,target=reset?24:state.loaded;
        if(reset){state.scroll=0;state.loaded=24;state.selected=null;}
        rows=[];cursor=null;total=0;loading=false;await loadMore(version);
        while(surface.active()&&version===requestVersion&&cursor&&(rows.length<target||state.preferredRef)&&!loading)if(!await loadMore(version))break;
        if(surface.active()&&version===requestVersion){catalog.scrollTop=scroll;if(draft.tab==='sell'&&selected())loadDetail(selected());}
      }

      async function getQuote(row){
        if(!transactionAllowed())return;
        const version=++quoteVersion;actionBusy=true;renderDetails();renderFooter();
        try{
          const result=await ctx.query('market.quote',{listingId:row.listingId,quantity:1,direction:'buy'});
          if(!surface.active()||version!==quoteVersion)return;
          if(!result.ok)throw result.error;quote=result.data;
        }catch(error){if(version===quoteVersion)fail(error);}
        finally{if(surface.active()){actionBusy=false;renderDetails();renderFooter();}}
      }

      async function getSurplus(){
        if(actionBusy||pending(draft))return;
        // Flush a pending search before creating a global preview; its delayed reload
        // must not remove the user's confirmation while they are trying to click it.
        if(searchTimer){clearTimeout(searchTimer);searchTimer=null;await reload(true);}
        if(!surface.active()||actionBusy||pending(draft))return;
        const version=++quoteVersion;actionBusy=true;renderGrid();
        try{
          const result=await ctx.query('inventory.surplusPreview',{});
          if(!surface.active()||version!==quoteVersion)return;
          if(!result.ok)throw result.error;quote=null;preview=result.data;
        }catch(error){if(version===quoteVersion)fail(error);}
        finally{if(surface.active()){actionBusy=false;renderGrid();}}
      }

      async function finishOperation(result){
        if(!surface.active())return;
        actionBusy=false;
        if(result?.ok){surface.setMessage('操作已完成，卡牌与库存已更新。挂单成交后才产生收入。','success');invalidate();await reload(false);}
        else if(result?.error){fail(result.error);if(['PREVIEW_EXPIRED','QUOTE_EXPIRED','OUT_OF_STOCK','ITEM_LOCKED'].includes(result.error.code)){invalidate();await reload(false);}}
        renderGrid();
      }

      async function run(request){
        if(!transactionAllowed())return;
        actionBusy=true;renderGrid();
        try{await finishOperation(await performOperation(app,ctx,draft,request));}
        catch(error){actionBusy=false;fail(error);if(surface.active())renderGrid();}
      }

      async function recover(retry){
        if(actionBusy||draft.operation?.status!=='unknown')return;
        actionBusy=true;renderGrid();
        try{await finishOperation(await (retry?retryOperation(app,ctx,draft):recoverOperation(app,ctx,draft)));}
        catch(error){actionBusy=false;fail(error);if(surface.active())renderGrid();}
      }

      const off=app.host.subscribe(event=>{
        if(event.type!=='worldReset'||!surface.active())return;
        invalidate();for(const state of Object.values(draft.tabs))state.selected=null;
        surface.setMessage('已切换存档；旧报价、预览和实物选择已清除。请重新确认。');reload(false);
      });
      surface.onDispose(off);renderToolbar();renderFooter();await reload(false);
    }
  });
}
