// Browser-side port of Viktor Hahn's layered portrait shader. Assets: CC-BY 4.0.
// No Host, engine, IndexedDB, save or game-clock dependencies.
import {colorizeLayer,portraitLayers} from './appearance-data.mjs';
import {portraitDetails,portraitHairExtensions,composeWalk,walkLayerNames} from './pixel-customization.mjs';
export {PRESETS} from './appearance-data.mjs';
const cache=new Map();
const canvas=(w,h)=>Object.assign(document.createElement('canvas'),{width:w,height:h});
export function loadImage(url){if(!cache.has(url))cache.set(url,new Promise((resolve,reject)=>{const im=new Image();im.onload=()=>resolve(im);im.onerror=()=>reject(Error('素材加载失败：'+url));im.src=url;}));return cache.get(url);}
function tint(source,colors,config,file){
  const c=canvas(source.width,source.height),ctx=c.getContext('2d',{willReadFrequently:true});ctx.drawImage(source,0,0);const im=ctx.getImageData(0,0,c.width,c.height),d=im.data;
  colorizeLayer(d,colors,config,file);
  ctx.putImageData(im,0,0);return c;
}
export async function renderPortrait(config){
  const out=canvas(96,96),ctx=out.getContext('2d');ctx.imageSmoothingEnabled=false;
  const layers=portraitLayers(config);
  for(const [file,colors] of layers){const im=await loadImage('./sources/portraits/'+file),part=tint(im,colors,config,file);ctx.drawImage(part,(96-im.width)/2,(96-im.height)/2);if(file.startsWith('hair/back/')){const data=ctx.getImageData(0,0,96,96);portraitHairExtensions(data,config);ctx.putImageData(data,0,0);}}
  const data=ctx.getImageData(0,0,96,96);portraitDetails(data,config);ctx.putImageData(data,0,0);
  return out;
}
export async function renderWalkSheet(config){
  const out=canvas(512,256),ctx=out.getContext('2d'),sources={};
  for(const id of walkLayerNames(config)){const im=await loadImage('./sources/lpc/'+id+'.png'),part=canvas(im.width,im.height),pctx=part.getContext('2d');pctx.drawImage(im,0,0);sources[id]=pctx.getImageData(0,0,im.width,im.height);}
  const result=composeWalk(config,sources);ctx.putImageData(new ImageData(result.data,result.width,result.height),0,0);
  return out;
}
export function saveCanvas(c,name){const a=document.createElement('a');a.download=name;a.href=c.toDataURL('image/png');a.click();}
export function saveJSON(value,name){const url=URL.createObjectURL(new Blob([JSON.stringify(value,null,2)],{type:'application/json'})),a=document.createElement('a');a.download=name;a.href=url;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);}
