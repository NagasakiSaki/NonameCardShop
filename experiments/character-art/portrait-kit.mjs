// Browser-side port of Viktor Hahn's layered portrait shader. Assets: CC-BY 4.0.
// No Host, engine, IndexedDB, save or game-clock dependencies.
import {colorize,portraitLayers} from './appearance-data.mjs';
export {PRESETS} from './appearance-data.mjs';
const cache=new Map();
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
export function loadImage(url){if(!cache.has(url))cache.set(url,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('素材加载失败：'+url));im.src=url;}));return cache.get(url);}
function tint(source,colors){
  const c=canvas(source.width,source.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
  colorize(d,colors);
  ctx.putImageData(im,0,0);return c;
}
export async function renderPortrait(config){
  const out=canvas(96,96),ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;
  const layers=portraitLayers(config);
  for(const [file,colors] of layers){const im=await loadImage('./sources/portraits/'+file),part=tint(im,colors);ctx.drawImage(part,(96-im.width)/2,(96-im.height)/2);}
  return out;
}
export async function renderWalkSheet(config){
  const out=canvas(512,256),ctx=out.getContext('2d');
  for(const id of ['body','pants','shirt','shoes','head',config.walkHair])ctx.drawImage(await loadImage('./sources/lpc/'+id+'.png'),0,0);
  return out;
}
export function saveCanvas(c,name){const a=document.createElement('a');a.download=name;a.href=c.toDataURL('image/png');a.click();}
export function saveJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.download=name;a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
