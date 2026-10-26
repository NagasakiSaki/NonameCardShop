import {el,art,rarityChip} from '../workspace/dom.mjs';
export function productAlbum(productId,actions,stock={}){
  const box=el('section',{'data-product-album':productId,class:'product-album'},[el('h3',{text:'出率与全武将卡册'}),el('p',{class:'f6-note',text:'正在读取供货卡池…'})]);
  Promise.resolve(actions.loadProduct?.({productId})).then(result=>{
    if(!box.isConnected)return;if(!result?.ok){box.replaceChildren(el('p',{text:result?.error?.message||'卡池暂时无法读取，请重新打开此页。'}));return;}
    const data=result.data,counts=stock.spec?.boxCounts||data.boxCounts,oldPrint=stock.productVersion&&stock.productVersion!==data.productVersion,total=Object.values(counts).reduce((a,b)=>a+b,0),table=el('table',{class:'album-rates'},[el('thead',{},[el('tr',{},['稀有度','每盒固定张数','单卡比例','每包平均','散包≥1张'].map(text=>el('th',{text})))])]);
    table.append(el('tbody',{},['SSR','SR','R','N'].map(r=>el('tr',{'data-rate-rarity':r},[el('td',{},[rarityChip(r)]),el('td',{text:String(counts[r]||0)}),el('td',{text:((counts[r]||0)/Math.max(1,total)*100).toFixed(1)+'%'}),el('td',{text:((counts[r]||0)/(stock.spec?.packsPerBox||data.packsPerBox)).toFixed(3)+' 张'}),el('td',{text:oldPrint?'原印刷版':Number.isFinite(data.packAtLeastOneProbabilities?.[r])?(data.packAtLeastOneProbabilities[r]*100).toFixed(1)+'%':'—'})]))));
    const grid=el('div',{class:'album-card-grid','data-product-cards':'true'});for(const card of data.items){
      const inspect=event=>{event?.preventDefault();event?.stopPropagation();actions.inspectCard?.({cardKey:card.cardKey});};
      grid.append(el('button',{type:'button',class:'album-card','data-card-key':card.cardKey,'aria-label':card.name+' 卡面与技能',onclick:inspect,oncontextmenu:inspect},[art(card.imageUrl,card.name),el('strong',{text:card.name}),rarityChip(card.currentRarity),el('small',{text:card.substitution?'补位武将':card.inPool?'本主题出货':'本主题 · 暂不出货'})]));
    }
    box.replaceChildren(el('h3',{text:'出率与全武将卡册'}),table,el('p',{class:'f6-note',text:(stock.spec?.guarantees||data.guarantees||[]).join('；')}),el('p',{class:'f6-note',text:oldPrint?'这组库存的张数按原印刷规格显示，下方为当前供货卡册；不预览已冻结的盒内内容。':'单卡比例是整盒配比；每包平均不是每包必出张数。散包出率表示独立散包至少出现一张的概率，卡盒按固定张数配盒。'}),el('h4',{text:'全部武将 '+data.items.length+' 名 · 右键查看技能'}),grid);
  }).catch(()=>{if(box.isConnected)box.replaceChildren(el('p',{text:'卡池读取失败，请重新打开此页。'}));});return box;
}
