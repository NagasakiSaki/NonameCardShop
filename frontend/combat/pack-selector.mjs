import {el} from '../ui/components.mjs';
import {renderRosterGrid} from './roster-grid.mjs';
import packaging from '../../assets/frontend-next/products/manifest.json' with {type:'json'};
export function scoreFor(item,formatId,role=null){return role&&Number.isFinite(item.roleScores?.[role])?item.roleScores[role]:item.modeScores?.[formatId]??item.modeScore;}
export function scoreSort(items){return [...items].sort((a,b)=>(Number.isFinite(b.modeScore)?b.modeScore:-Infinity)-(Number.isFinite(a.modeScore)?a.modeScore:-Infinity)||String(a.name).localeCompare(String(b.name),'zh')||String(a.key).localeCompare(String(b.key)));}
export function rosterPacks(items){
 const groups=new Map();for(const c of items){const id=c.themeId||'unknown';if(!groups.has(id))groups.set(id,{id,name:c.themeName||id,items:[]});groups.get(id).items.push(c);}
 return [...groups.values()].map(p=>({...p,available:p.items.filter(c=>c.eligible!==false).length})).sort((a,b)=>a.name.localeCompare(b.name,'zh'));
}
/** UI state belongs to the room draft, never the inventory or the match roster. */
export function renderPackSelector({mount,items,selected,max,state,onNavigate,onToggle,onPreview,onToggleFavorite}){
 const packs=rosterPacks(items),header=el('div',{class:'v7-actions v7-pack-breadcrumb'}),body=el('div');mount.replaceChildren(header,body);
 const tray=el('div',{class:'v7-picked-tray','aria-label':'跨卡包已选武将'});mount.prepend(tray);
 selected.forEach((key,index)=>{const c=items.find(c=>c.key===key);if(c)tray.append(el('button',{class:'btn btn--sm',text:`${index+1}. ${c.name} ×`,'aria-label':'取消已选 '+c.name,onclick:()=>onToggle(c)}));});
 if(state.pack==null){
  header.append(el('h3',{text:'按卡包选将'}),el('span',{class:'small',text:'进入卡包后按本模式分数降序；跨包选择保留。'}));
  const grid=el('div',{class:'v7-pack-grid','data-pack-selector':'true'});body.append(grid);
  const choices=[{id:'*',name:'全部武将',items,available:items.filter(c=>c.eligible!==false).length},{id:'favorites',name:'收藏武将',items:items.filter(c=>c.favorite),available:items.filter(c=>c.favorite&&c.eligible!==false).length},...packs];
  for(const p of choices){const picked=p.items.filter(c=>selected.includes(c.key)).length,art=packaging.products[p.id]?.pack;grid.append(el('button',{class:'v7-pack-card','data-roster-pack':p.id,onclick:()=>onNavigate(p.id)},[art?el('img',{src:art,alt:'',loading:'lazy'}):null,el('span',{text:p.name+'\n'+p.items.length+' 名 · 可用 '+p.available+(picked?' · 已选 '+picked:'')})]));}return;
 }
 const name=state.pack==='*'?'全部武将':state.pack==='favorites'?'收藏武将':packs.find(p=>p.id===state.pack)?.name||state.pack;
 header.append(el('button',{class:'btn',text:'返回卡包',onclick:()=>onNavigate(null)}),el('strong',{text:name+' · 本模式分数降序'}));
 const pool=scoreSort(items.filter(c=>state.pack==='*'||state.pack==='favorites'?state.pack==='*'||c.favorite:c.themeId===state.pack));
 if(!pool.length){body.append(el('p',{text:'这里没有已持有的武将。'}));return;}
 renderRosterGrid({mount:body,items:pool,selected,max,sortByScore:true,onToggle,onPreview,onToggleFavorite,caption:'本模式降序 · '+pool.length+' 名 · 已选 '+selected.length+'/'+max});
}
