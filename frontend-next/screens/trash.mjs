import {el,clear,errorView,newRequestId,imgWithFallback} from '../../frontend/ui/components.mjs';
import {queryAll} from '../services/views.mjs';
import {performOperation,recoverOperation,retryOperation} from '../services/operations.mjs';
import {injectStyles} from '../components/management/shared.mjs';

export async function openTrash(app){
 injectStyles('trash-cards',`
 .pt-cards{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,190px),1fr));gap:14px;margin:16px 0}
 .pt-tile{background:#1d2728;border:1px solid #52605b;border-radius:10px;padding:12px;min-width:0}
 .pt-art{display:block;width:100%;height:220px;object-fit:contain;background:#111819;border-radius:6px}
 .pt-tile .card-tile__body{padding:8px 0;display:block}.pt-tile strong{display:block;margin:6px 0}
 .pt-tile .btn{min-height:40px;white-space:normal}.pt-tile details{margin-top:8px}.pt-tile summary{cursor:pointer}
 `);
 return app.windows.open({id:'trash',title:'共享垃圾桶与弃牌',subtitle:'按实物拾取 · 次日清空 · 卡面可查看技能',width:'window--wide',pauseReason:'查看垃圾桶',render:async ctx=>{
  ctx.handle.trashDispose?.();let disposed=false,rows=[],collection=[],tab='trash',page=0,working=false;
  const identity=app.snapshot().worldId+':'+app.snapshot().branchId,active=()=>!disposed&&!ctx.handle.closed&&identity===app.snapshot().worldId+':'+app.snapshot().branchId;
  const op=app.trashOperation??={};if(op.operation&&`${op.operation.worldId}:${op.operation.branchId}`!==identity)op.operation.status='stale';
  const status=el('p',{role:'status'}),recovery=el('div',{hidden:true}),list=el('div',{class:'pt-cards','data-trash-cards':'true'}),paging=el('div',{class:'toolbar'});
  const button=(text,onclick,disabled=false)=>el('button',{class:'btn',text,onclick,disabled:disabled||working});
  const search=el('input',{class:'input',type:'search',placeholder:'搜索卡名','aria-label':'搜索垃圾桶或收藏卡',oninput:()=>{page=0;render();}});
  const nav=el('div',{class:'toolbar'}),notice=el('p',{class:'note-card',text:'买家拆包后的弃牌和店长弃牌共用这个桶；拾取保留原实物，开始下一天会清空。交互窗口打开时顾客和世界暂停。'});
  ctx.body.append(notice,nav,search,status,recovery,list,paging);
  for(const [text,fn]of [['查询原操作',recoverOperation],['使用原号重试',retryOperation]])recovery.append(button(text,async()=>{const r=await fn(app,ctx,op);if(!active())return;status.textContent=r.ok?'原操作已确认。':r.error.message;await refresh();}));
  async function refresh(){if(!active())return;const [a,b]=await Promise.all([queryAll(ctx,'inventory.list',{location:'trash'}),queryAll(ctx,'inventory.list',{location:'collection',kind:'card'})]);if(!active())return;rows=a;collection=b;render();}
  async function command(type,payload){if(!active()||working)return;working=true;render();try{const r=await performOperation(app,ctx,op,{requestId:newRequestId('trash'),type,payload});if(active()){status.textContent=r.ok?(r.data.note||'已丢弃，今天可捡回。'):r.error.message;await refresh();}}catch(e){if(active())status.textContent=e.message;}finally{working=false;if(active())render();}}
  function render(){if(!active())return;clear(list);clear(nav);clear(paging);const near=app.isNearInteraction('store.trash');
   recovery.hidden=!['unknown','submitting'].includes(op.operation?.status);
   nav.append(button(`桶内卡牌（${rows.length} 张）`,()=>{tab='trash';page=0;render();}),button(`选择收藏卡丢弃（${collection.length} 张）`,()=>{tab='collection';page=0;render();}),button('全部捡回桶内卡牌',()=>command('inventory.recover',{all:true}),!near||rows.length===0));
   if(!near)nav.append(button('走到垃圾桶旁操作',()=>app.goToInteraction('store.trash','trash')));
   const groups=new Map();for(const c of (tab==='trash'?rows:collection).filter(c=>!search.value||c.name.includes(search.value))){const key=JSON.stringify([c.cardKey,c.printVersion,c.printedRarity]);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(c);}
   const all=[...groups.values()],pages=Math.max(1,Math.ceil(all.length/24));page=Math.min(page,pages-1);
   for(const copies of all.slice(page*24,page*24+24)){const c=copies[0],sources=[...new Set(copies.map(i=>i.discardedByName||'来源未记录'))];
    const tile=el('article',{class:'pt-tile'},[imgWithFallback(c.imageUrl,c.name,'pt-art'),el('div',{class:'card-tile__body'},[el('strong',{text:`${c.name} · ${c.printedRarity} ×${copies.length}`}),el('p',{class:'small',text:tab==='trash'?`弃牌来源：${sources.join('、')}`:`可丢弃 ${copies.filter(c=>c.available).length} 张；受保护/占用不可丢弃。`}),button('查看卡面与技能',()=>app.openPanel('cardDetail',{cardKey:c.cardKey}))])]);
    const details=el('details',{},[el('summary',{text:'选择实物副本'})]),buttons=el('div',{class:'toolbar'});let shown=0;
    const more=button('继续显示副本',append);function append(){for(const i of copies.slice(shown,shown+20)){const index=++shown;buttons.append(button(`${tab==='trash'?'捡回':'丢弃'}第 ${index} 张${i.protected?' · 已保护':i.locked?' · 已占用':''}`,()=>command(tab==='trash'?'inventory.recover':'inventory.discard',{inventoryRef:i.inventoryRef}),!near||!i.available));}more.hidden=shown>=copies.length;}
    append();details.append(buttons,more);tile.append(details);list.append(tile);
   }
   if(!all.length)list.append(el('p',{text:search.value?'没有匹配卡牌。':tab==='trash'?'桶里是空的。':'收藏里没有卡牌。'}));
   paging.append(button('上一页',()=>{page--;render();},page===0),el('span',{text:`第 ${page+1}/${pages} 页 · ${all.length} 种印刷卡`}),button('下一页',()=>{page++;render();},page+1>=pages));
  }
  const dispose=()=>{disposed=true;};ctx.handle.trashDispose=dispose;ctx.onCleanup(dispose);
  try{await refresh();}catch(e){if(active())ctx.body.append(errorView({message:e.message},()=>ctx.refresh()));}
 }});
}
