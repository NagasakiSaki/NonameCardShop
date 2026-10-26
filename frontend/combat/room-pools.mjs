import {fitPanel} from '../../frontend-next/services/panel-shell.mjs';
import {el} from '../ui/components.mjs';
import {renderRosterGrid} from './roster-grid.mjs';

/** Shared inspection window, read-only even while a game or a reserve draft exists. */
export function openRoomPools(app,room,{side='enemy'}={}){
  let page=0,current=side;
  return app.windows.open({id:'room-pools-'+room.roomId,title:'房间备战池',pauseReason:'查看双方备战池',width:'window--wide',render:ctx=>{
    fitPanel(ctx);const tabs=el('div',{class:'v7-actions'}),body=el('div',{class:'opponent-pool','data-room-pools':'true'});ctx.body.append(tabs,body);
    function paint(){
      tabs.replaceChildren();for(const [key,name]of [['mine','我方'],['enemy',room.opponentName||'对手']])tabs.append(el('button',{class:'btn btn--sm'+(current===key?' btn--primary':''),text:`${name}备战池 (${room.pools[key].length})`,onclick:()=>{current=key;page=0;paint();}}));
      const cards=room.pools[current].map(c=>({...c,modeScore:c.modeScores?.[room.formatId],quantity:{owned:1,available:1},favorite:false}));
      if(!cards.length){body.replaceChildren(el('p',{text:current==='mine'?'你的备战池尚未确认。':'对手尚未入房。'}));return;}
      renderRosterGrid({mount:body,items:cards,selected:[],max:cards.length,page,readOnly:true,pageSize:innerWidth<700||innerHeight<760?4:8,caption:'本房间固定备战池 · 卡面与技能均可查看',onToggle:item=>{if(item.__page!=null){page=item.__page;paint();}},onToggleFavorite:()=>{},onPreview:item=>app.openPanel('cardDetail',{cardKey:item.cardKey})});
      body.append(el('p',{class:'small',text:'整场从该池逐局选将；借用卡不属于店铺库存。全局分为三种模式等权平均。'}));
    }
    paint();
  }});
}
