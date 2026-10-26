import {el,newRequestId} from './components.mjs';

export function openStory(app,{presenters={}}={}){
  let ownedSession=null,ownedBranch=null,ownedWorld=null,autoClose=false,subscribed=false,pending=null,message='',page=0,textPage=0,lastNode='';
  const request=(type,payload)=>({requestId:newRequestId('story'),type,payload});
  const identity=()=>({worldId:app.snapshot().worldId,branchId:app.snapshot().branchId});
  return app.windows.open({id:'story',title:'街角故事',pauseReason:'阅读街角故事',width:'window--wide',
    async onClose(){
      if(autoClose||!ownedSession)return;
      // Query joins the Host queue: close cannot race a still-committing choice.
      const r=await app.query('narrative.session');
      if(r.ok&&r.data.proof?.sessionId===ownedSession&&r.data.proof.branchId===ownedBranch&&r.data.proof.worldId===ownedWorld&&r.data.status==='presenting')await app.command(request('narrative.defer',r.data.proof));
    },
    render:async ctx=>{
      if(!document.getElementById('story-styles'))document.head.append(el('style',{id:'story-styles',text:`
        .story-layout{display:grid;grid-template-columns:136px minmax(0,1fr);gap:16px;align-items:start;min-height:0}
        .story-portrait{width:128px;height:224px;object-fit:contain;image-rendering:pixelated;align-self:end}
        .story-text{white-space:pre-wrap;overflow-wrap:anywhere;font-size:16px;line-height:1.8;margin:8px 0 12px}
        .story-choices,.story-list{display:grid;gap:8px;min-width:0}.story-choices button,.story-list button{white-space:normal;text-align:left;min-height:40px;overflow-wrap:anywhere}
        .story-controls{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.story-status{font-size:13px;color:var(--text-muted,#bfb1cf)}
        @media(max-width:600px),(max-height:700px){.story-layout{grid-template-columns:80px minmax(0,1fr);gap:8px}.story-portrait{width:80px;height:140px}.story-text{font-size:14px;line-height:1.65;margin:4px 0 8px}.story-choices button{min-height:36px}}
      `}));
      if(!subscribed){subscribed=true;const off=app.host.subscribe(e=>{if(e.type==='narrativeUpdated'&&!ctx.handle.closed)void ctx.handle.refresh();});ctx.onCleanup(off);}
      const queried=await ctx.query('narrative.available');
      if(!queried.ok){ctx.body.append(el('p',{text:queried.error?.message||'故事暂不可用。'}));return;}
      const all=queried.data,active=all.active;
      if(!all.contentAvailable)ctx.body.append(el('p',{class:'story-status',text:(all.diagnostics||[]).join(' ')||'故事内容暂未安装，现有经营功能可以继续使用。'}));
      const button=(text,fn,disabled=false)=>el('button',{class:'btn',type:'button',text,disabled:disabled||!!pending,onclick:fn});
      const close=()=>{autoClose=true;ctx.handle.close();};
      async function act(type,payload){
        if(ctx.handle.closed)return;
        const input=pending||request(type,payload);
        if(pending){
          const check=await ctx.query('operations.get',{requestId:input.requestId});
          if(check.ok&&check.data.status==='succeeded'){pending=null;message='操作已完成。';await ctx.handle.refresh();return;}
          if(check.ok&&check.data.status==='stale'){pending=null;message='存档已切换，请重新打开故事。';await ctx.handle.refresh();return;}
        }
        const result=await ctx.submit(input);
        if(!result.ok){pending=result.error?.code==='RESULT_UNKNOWN'?input:null;message=result.error?.message||'暂时无法继续。';await ctx.handle.refresh();return;}
        pending=null;message='';
        if(result.data?.status==='waiting'){app.toast('info','故事待续','先去经营卡店，条件达成后“故事”入口会提示新进展。');close();return;}
        if(result.data?.status==='deferred'){close();return;}
        await ctx.handle.refresh();
      }
      const footer=[];
      if(pending)footer.push(el('button',{class:'btn btn--primary',text:'核对上次操作',onclick:()=>act()}));
      if(message)ctx.body.append(el('p',{role:'status',text:message}));
      if(all.apiVersion!=='card-shop-narrative/1'){ctx.body.append(el('p',{text:'此版本暂不能阅读故事，卡店仍可正常经营。'}));return;}
      if(!all.enabled){
        ctx.body.append(el('p',{text:active?.message||'开启《街角牌局》，从第一张收据认识街区里的牌友。现有库存和营业进度会保留。'}));
        footer.push(button('开启街角故事',()=>act('narrative.enable',identity()),!all.contentAvailable||active?.status==='unsupported'));
      }else if(active?.status==='presenting'){
        ownedSession=active.proof.sessionId;
        ownedBranch=active.proof.branchId;ownedWorld=active.proof.worldId;
        const nodeKey=active.proof.sessionId+'/'+active.proof.nodeId;if(nodeKey!==lastNode){lastNode=nodeKey;textPage=0;page=0;}
        ctx.titleNode.textContent=active.title;
        const chars=Array.from([active.text,active.confirmation?.message].filter(Boolean).join('\n\n')),chunk=innerWidth<600||innerHeight<700?80:180;
        const chunks=Array.from({length:Math.max(1,Math.ceil(chars.length/chunk))},(_,i)=>chars.slice(i*chunk,(i+1)*chunk).join(''));
        textPage=Math.min(textPage,chunks.length-1);
        const art=active.speaker&&(app.manifest.characters[active.speaker.appearanceId]||app.manifest.characters['bd-anon']);
        const portrait=art?el('img',{class:'story-portrait',src:art.portrait,alt:active.speaker.name}):el('div');
        const content=el('div',{},[el('strong',{text:active.speaker?.name||'街角故事'}),el('p',{class:'story-text',text:chunks[textPage]})]);
        ctx.body.append(el('div',{class:'story-layout'},[portrait,content]));
        if(textPage<chunks.length-1)footer.push(button('下一页',()=>{textPage++;ctx.handle.refresh();}));
        else if(active.nodeType==='choice'){
          const count=Math.ceil(active.choices.length/4);page=Math.min(page,count-1);
          content.append(el('div',{class:'story-choices'},active.choices.slice(page*4,page*4+4).map(c=>button(c.text,()=>act('narrative.choose',{...active.proof,choiceId:c.choiceId}),c.available===false))));
          if(count>1)footer.push(button('上一页',()=>{page--;ctx.handle.refresh();},page===0),el('span',{text:`${page+1}/${count}`}),button('下一页',()=>{page++;ctx.handle.refresh();},page===count-1));
        }else if(presenters[active.nodeType])presenters[active.nodeType]({app,ctx,view:active,content,footer,submit:act});
        else if(['line','cue','action','transition'].includes(active.nodeType))footer.push(button(active.nodeType==='transition'?'确认前往':active.nodeType==='action'?'确认':'继续',()=>act('narrative.advance',{...active.proof,...(['transition','action'].includes(active.nodeType)?{confirm:true}:{})})));
        else content.append(el('p',{text:'这段扩展演出需要更新界面，进度已保留，可以稍后再聊。'}));
        footer.push(button('稍后再聊',()=>act('narrative.defer',active.proof)));
      }else{
        ctx.titleNode.textContent='街角故事';
        if(active?.status==='waiting')ctx.body.append(el('p',{class:'story-status',text:active.wait.message}));
        if(active?.message)ctx.body.append(el('p',{text:active.message}));
        const count=Math.max(1,Math.ceil(all.items.length/4));page=Math.max(0,Math.min(page,count-1));
        ctx.body.append(el('div',{class:'story-list'},all.items.slice(page*4,page*4+4).map(item=>button(`${item.title}${item.status==='completed'?' · 已完成':item.status==='deferred'?' · 待续':item.status==='waiting'?' · 等待经营进展':''}${item.reason?'（'+item.reason+'）':''}`,()=>act('narrative.start',{...identity(),campaignId:item.campaignId,chapterId:item.chapterId}),!item.available))));
        if(count>1)footer.push(button('上一页',()=>{page--;ctx.handle.refresh();},page===0),el('span',{text:`${page+1}/${count}`}),button('下一页',()=>{page++;ctx.handle.refresh();},page===count-1));
        if(active?.status==='waiting')footer.push(button('前往货架',()=>{autoClose=true;app.goToInteraction('store.retail','supplier',{purchaseTab:'retail'});}));
      }
      footer.push(button('返回经营',()=>ctx.handle.close()));
      ctx.setFooter(el('div',{class:'story-controls'},footer));
    }
  });
}
