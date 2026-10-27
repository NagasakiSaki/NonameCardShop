// Scroll setters precede virtual-grid's rAF window update. Wait for a genuinely
// visible logical row, rather than indexing the previous viewport's DOM nodes.
export async function visibleGridCard(page){
  await page.waitForFunction(()=>{
    const scroller=document.querySelector('.facility-window:not([hidden]) .window__body');if(!scroller)return false;
    const view=scroller.getBoundingClientRect();
    return [...document.querySelectorAll('[data-card-grid] [data-card]')].some(n=>{const r=n.getBoundingClientRect();return r.top>Math.max(150,view.top)&&r.bottom<Math.min(650,view.bottom);});
  },null,{timeout:15000});
  const index=await page.evaluate(()=>{
    const view=document.querySelector('.facility-window:not([hidden]) .window__body').getBoundingClientRect();
    return [...document.querySelectorAll('[data-card-grid] [data-card]')].find(n=>{const r=n.getBoundingClientRect();return r.top>Math.max(150,view.top)&&r.bottom<Math.min(650,view.bottom);}).dataset.rowIndex;
  });
  return page.locator('[data-card-grid] [data-card][data-row-index="'+index+'"]');
}
