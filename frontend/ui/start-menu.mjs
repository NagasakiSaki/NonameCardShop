import {el} from './components.mjs';
import {profileRegistry} from '../../modules/backend/profiles.mjs';

/** Start/menu operations never connect a game Host or advance a world. */
export async function showStartMenu({onStart}={}){
  document.getElementById('start-menu')?.remove();const registry=profileRegistry(),root=el('section',{id:'start-menu',class:'start-menu','aria-label':'卡店存档管理'});document.body.append(root);
  let profiles=[],busy=false,message='',expanded=null,days=[],disposed=false;
  const button=(text,fn,primary=false,disabled=false)=>el('button',{class:'btn'+(primary?' btn--primary':''),type:'button',text,disabled:busy||disabled,onclick:()=>{if(!disabled)return run(fn);}});
  async function run(fn){if(busy||disposed)return;busy=true;try{await fn();}catch(e){message=e.message;}finally{busy=false;if(!disposed)render();}}
  async function load(){profiles=await registry.list();render();}
  function render(){
    if(disposed)return;root.replaceChildren();
    const content=el('div',{class:'start-menu__content'},[el('p',{class:'start-menu__eyebrow',text:'NONAME CARD SHOP'}),el('h1',{text:'无名小店'}),el('p',{class:'start-menu__intro',text:'选择一间卡店，继续经营；或新建一份独立进度。主菜单里的营业时间不会流动。'})]);
    const name=el('input',{class:'input',type:'text',maxlength:32,placeholder:'给新卡店起个名字','aria-label':'新存档名称'});
    content.append(el('form',{class:'start-menu__new',onsubmit:event=>{event.preventDefault();run(async()=>{const p=await registry.create(name.value);await onStart({profileId:p.profileId});});}},[name,el('button',{class:'btn btn--primary',type:'submit',text:'新建存档并开始',disabled:busy})]));
    if(message)content.append(el('p',{class:'start-menu__message',role:'status',text:message}));
    if(!profiles.length)content.append(el('p',{class:'start-menu__empty',text:'还没有卡店存档。新建后会从第 1 天 08:00 开始。'}));
    const list=el('div',{class:'start-menu__list'});
    for(const p of profiles){
      const unreadable=p.phase==='unreadable'||p.ok===false;
      const summary=unreadable?`存档读取失败（${p.unreadable||'STORAGE_ERROR'}）：${p.message||'无法读取这间卡店的数据。'}`
        :p.phase==='new'?'尚未开始经营'
        :`第 ${p.day} 天 · ${Math.floor(p.minute/60)}:${String(Math.floor(p.minute%60)).padStart(2,'0')} · ${(p.cash??0).toLocaleString('zh-CN')} 游戏币`;
      const card=el('article',{class:'start-menu__profile','data-profile-id':p.profileId},[el('h2',{text:p.name}),el('p',{text:summary})]);
      card.append(el('div',{class:'toolbar'},[
        button(p.phase==='new'?'开始经营':'继续当前进度',()=>onStart({profileId:p.profileId}),true,unreadable),
        button('选择日期读档',async()=>{expanded={id:p.profileId,kind:'days'};days=await registry.days(p.profileId);},false,unreadable),
        button('重命名',()=>{expanded={id:p.profileId,kind:'rename'};}),button('删除',()=>{expanded={id:p.profileId,kind:'delete'};})
      ]));
      if(unreadable)card.append(el('p',{class:'small muted',text:'这份存档暂时打不开，原数据仍保留。可以稍后重试；如有导出备份，可在另一间卡店导入恢复。'}));
      if(expanded?.id===p.profileId){
        if(expanded.kind==='days'){
          card.append(el('p',{class:'small muted',text:'日档会回到所选日期的 08:00 开店前；当天的采购、成交和比赛结果一起回退。继续当前进度则保留最近时刻。'}));
          if(!days.length)card.append(el('p',{text:'尚无日初档。可以先开始/继续经营；旧的即时备份不会被冒充为日初档。'}));
          for(const day of days)card.append(button(`读取第 ${day.day} 天开始 · 08:00`,()=>onStart({profileId:p.profileId,archiveId:day.archiveId})));
        }else if(expanded.kind==='rename'){
          const input=el('input',{class:'input',value:p.name,maxlength:32,'aria-label':'修改存档名称'});card.append(input,button('保存名称',async()=>{await registry.rename(p.profileId,input.value);expanded=null;await load();}));
        }else{
          card.append(el('p',{text:`确认删除“${p.name}”？会删除这间卡店的当前进度和所有日档，其他卡店保留。`}),button('确认删除此存档',async()=>{await registry.remove(p.profileId);expanded=null;message='已删除指定卡店存档。';await load();}),button('取消删除',()=>{expanded=null;}));
        }
      }
      list.append(card);
    }
    content.append(list,el('p',{class:'small muted',text:'存档保存在本浏览器、本地址。重要进度可进入游戏的存档页导出文件备份。'}));root.append(content);
  }
  try{await load();}catch(e){message='读取存档目录失败：'+e.message;render();}
  return ()=>{disposed=true;root.remove();void registry.close().catch(()=>{});};
}
