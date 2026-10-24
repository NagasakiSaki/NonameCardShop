import {el} from './components.mjs';
export function openMore(app){
  return app.windows.open({id:'more',title:'店铺菜单',pauseReason:'店铺菜单',render:ctx=>{
    const entries=[['guide','开店指引与熟客'],['customers','顾客与牌桌'],['report','营业日报'],['management','店铺经营'],['help','游戏手册'],['settings','设置']];
    const list=el('div',{class:'surface-actions',style:{display:'grid',gridTemplateColumns:'repeat(2,minmax(0,1fr))',gap:'12px'}});
    for(const [kind,label]of entries)if(!(app.mode==='mock'&&['guide','customers'].includes(kind)))list.append(el('button',{class:'btn',text:label,onclick:()=>{ctx.handle.close();app.openPanel(kind);}}));
    ctx.body.append(list);
  }});
}
