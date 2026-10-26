// Native pixel data and shader math shared by the browser plug-in and batch exporter.
import {BAND_APPEARANCES} from '../../data/band-appearances.mjs';
export const BASE_PRESETS=[];
export const PRESETS=[...BAND_APPEARANCES];
const rgb=hex=>hex.replace('#','').match(/../g).map(n=>parseInt(n,16)/255);
const ramps={skin:['#ffe4d0','#c79288','#795c7d'],cream:['#fff1d5','#c6ae99','#796f83']};
export function colorize(d,colors){
  const [light,dark,shadow]=colors.map(rgb),black=rgb('#292538'),white=rgb('#fff7ef');
  for(let i=0;i<d.length;i+=4){if(!d[i+3])continue;const r=d[i]/255,g=d[i+1]/255,b=d[i+2]/255,v=(r+g+b)/3,w=Math.min(10*Math.max(Math.abs(r-g),Math.abs(b-g)),1);for(let k=0;k<3;k++)d[i+k]=255*Math.min(1,(dark[k]*r+light[k]*g+shadow[k]*b)*w+(black[k]*(1-v)+white[k]*v)*(1-w));}
  return d;
}
export function portraitLayers(c){return [
  ['hair/back/'+c.back+'.png',c.hair],['body/female01.png',ramps.skin],
  ['cloths/'+c.clothes+'_shadow.png',ramps.skin],['cloths/'+c.clothes+'_primary.png',c.cloth],
  ...(!['female03','female08','female09','female10'].includes(c.clothes)?[['cloths/'+c.clothes+'_secondary.png',c.secondary||ramps.cream]]:[]),
  ...(['female01','female02','female12'].includes(c.clothes)?[['cloths/'+c.clothes+'_details.png',c.band?c.cloth:c.hair]]:[]),
  ['mouth/'+c.mouth+'.png',ramps.skin],['nose/small02.png',ramps.skin],
  ['hair/base/'+c.base+'_shadow.png',ramps.skin],
  ...(!['female08','female09','male02'].includes(c.front)?[['hair/front/'+c.front+'_shadow.png',ramps.skin]]:[]),
  ['eyes/'+c.eyes+'.png',c.iris],['brows/neutral01.png',ramps.skin],
  ['hair/base/'+c.base+'.png',c.hair],['hair/front/'+c.front+'.png',c.hair]
];}
export function colorizeLayer(data,colors,c,file){
  const original=c.otherEye&&file.startsWith('eyes/')?new Uint8ClampedArray(data):null;
  colorize(data,colors);
  if(original){colorize(original,c.otherEye);for(let i=0;i<data.length;i+=4)if((i/4)%96>=48)data.set(original.subarray(i,i+4),i);}
  if(c.streak&&file.startsWith('hair/')&&!file.includes('_shadow')){const dye=rgb(c.streak).map(v=>Math.round(v*255));for(let i=0;i<data.length;i+=4){const x=(i/4)%96;if(x>=28&&x<=31&&data[i+3])data.set(dye,i);}}
  return data;
}
