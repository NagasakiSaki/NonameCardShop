/** Local versioned packages only; content loading failure must not prevent running the shop. */
export function storyContentHashes(state){return Object.values(state?.sessions||{}).map(s=>s?.contentHash).filter(h=>typeof h==='string'&&/^[a-f0-9]{64}$/.test(h));}
export async function loadNarrativeContent(read,{savedState=null,savedStates=[]}={}){
  const diagnostics=[],packs=[],activeHashes=[];
  try{
    const index=await read('/data/story/index.json');
    if(index.format!=='card-shop-story-index/1'||!Array.isArray(index.packs)||index.packs.length>1024||index.packs.some(n=>typeof n!=='string'||!/^[a-zA-Z0-9_.-]+\.storypack\.json$/.test(n)))throw Error('剧情索引格式不受支持');
    const active=index.active||[index.current];
    if(!Array.isArray(active)||active.some(n=>!index.packs.includes(n)))throw Error('剧情索引缺少当前版本');
    const refs=[savedState,...savedStates].flatMap(storyContentHashes);
    const wanted=[...index.packs.filter(n=>!active.includes(n)&&refs.some(h=>n.includes('.'+h.slice(0,16)+'.'))),...active];
    for(const file of wanted){try{const pack=await read('/data/story/'+encodeURIComponent(file));packs.push(pack);if(active.includes(file))activeHashes.push(pack.contentHash);}catch{diagnostics.push('一份剧情内容暂不可用，相关进度将保留。');}}
  }catch{diagnostics.push('剧情内容暂不可用，经营可以继续。');}
  return {packs,diagnostics,activeHashes};
}
