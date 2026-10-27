// Variable-height ROW virtualization. Card identity and transaction references stay in renderItem.
// Heights are measured from real CSS layout; changing columns invalidates the row cache.
export function virtualGrid({container,rows,renderItem,scroller,layout={}}){
  const top=document.createElement('div'),grid=document.createElement('div'),bottom=document.createElement('div');
  top.setAttribute('aria-hidden','true');bottom.setAttribute('aria-hidden','true');grid.className='pbc-card-grid';
  container.style.gap='0';container.style.overflowAnchor='none';container.dataset.renderMode='virtual';
  container.append(top,grid,bottom);
  const identity=JSON.stringify(rows.map(row=>row.id));
  if(layout.identity!==identity){layout.identity=identity;layout.heights={};layout.columns=0;layout.width=0;layout.estimate=270;}
  let disposed=false,raf=0,start=0,end=Math.min(rows.length,16),columns=layout.columns||4,gap=10,prefix=[];
  const valid=()=>!disposed&&container.isConnected;
  const origin=()=>container.getBoundingClientRect().top-scroller.getBoundingClientRect().top+scroller.scrollTop-scroller.clientTop;
  function offsets(){const count=Math.ceil(rows.length/columns);prefix=[0];for(let r=0;r<count;r++)prefix.push(prefix[r]+(layout.heights[r]??layout.estimate)+gap);}
  function findRow(offset){let low=0,high=prefix.length-2;while(low<high){const mid=Math.floor((low+high+1)/2);if(prefix[mid]<=offset)low=mid;else high=mid-1;}return Math.max(0,low);}
  function draw(first,last){
    const fragment=document.createDocumentFragment();for(let i=first;i<last;i++)fragment.append(renderItem(rows[i],i));
    grid.replaceChildren(fragment);start=first;end=last;
    container.dataset.renderedRows=String(end-start);container.dataset.startIndex=String(start);container.dataset.endIndex=String(end-1);
  }
  function spacers(){const first=Math.floor(start/columns),last=Math.ceil(end/columns),total=Math.max(0,prefix.at(-1)-gap);top.style.height=prefix[first]+'px';bottom.style.height=Math.max(0,total-(prefix[last]-gap))+'px';}
  function update(){
    raf=0;if(!valid())return;
    const style=getComputedStyle(grid),nextColumns=Math.max(1,style.gridTemplateColumns.split(' ').filter(Boolean).length),width=grid.getBoundingClientRect().width;
    if(width<=0||scroller.clientHeight<=0)return;
    const oldOffset=scroller.scrollTop-origin(),oldRow=prefix.length?findRow(Math.max(0,oldOffset)):0,anchorIndex=oldRow*columns,within=prefix.length?Math.max(0,oldOffset-prefix[oldRow]):0;
    const resized=nextColumns!==columns||Math.abs(width-(layout.width||0))>1;
    if(resized){columns=nextColumns;layout.columns=columns;layout.width=width;layout.heights={};}
    gap=parseFloat(style.rowGap)||0;offsets();
    if(resized&&oldOffset>0){scroller.scrollTop=origin()+prefix[Math.floor(anchorIndex/columns)]+within;}
    const offset=scroller.scrollTop-origin(),count=prefix.length-1;
    const first=Math.max(0,findRow(Math.max(0,offset))-2),last=Math.min(count,findRow(Math.max(0,offset+scroller.clientHeight))+3);
    const nextStart=first*columns,nextEnd=Math.min(rows.length,last*columns);
    if(nextStart!==start||nextEnd!==end)draw(nextStart,nextEnd);
    // All cards in a physical CSS row share its row height. No fixed height assumption.
    const measured={};for(const tile of grid.children){const r=Math.floor(Number(tile.dataset.rowIndex)/columns),height=tile.getBoundingClientRect().height;measured[r]=Math.max(measured[r]||0,height);}
    const anchor=findRow(Math.max(0,scroller.scrollTop-origin())),oldAnchor=prefix[anchor];let changed=false;
    for(const [row,height]of Object.entries(measured))if(height>0&&Math.abs((layout.heights[row]??layout.estimate)-height)>.5){layout.heights[row]=height;changed=true;}
    if(changed){
      // Only estimate unknown rows; preserve already measured variable-height rows.
      if(resized||!layout.measured){layout.estimate=Math.max(...Object.values(measured));layout.measured=true;}
      offsets();spacers();const adjustment=prefix[anchor]-oldAnchor;if(offset>0&&Math.abs(adjustment)>.5)scroller.scrollTop+=adjustment;
      schedule();
    }else spacers();
  }
  function schedule(){if(!disposed&&!raf)raf=requestAnimationFrame(update);}
  draw(0,end);offsets();spacers();
  scroller.addEventListener('scroll',schedule,{passive:true});
  const observer=new ResizeObserver(schedule);observer.observe(grid);observer.observe(scroller);schedule();
  return ()=>{disposed=true;if(raf)cancelAnimationFrame(raf);observer.disconnect();scroller.removeEventListener('scroll',schedule);};
}
