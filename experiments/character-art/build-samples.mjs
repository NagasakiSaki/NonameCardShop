// Reproducible native PNGs from licensed layers, without a browser or game save.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {PRESETS,portraitLayers,colorize} from './appearance-data.mjs';
const here=path.dirname(fileURLToPath(import.meta.url)),root=path.resolve(here,'../..');
const require=createRequire(path.join(root,'.local/art-lab/tools/package.json'));
let PNG;try{({PNG}=require('pngjs'));}catch{throw Error('先运行：npm install --prefix .local/art-lab/tools --ignore-scripts --no-audit --no-fund pngjs@7.0.0');}
const out=path.join(here,'generated');fs.mkdirSync(out,{recursive:true});
const blank=(w,h)=>({width:w,height:h,data:new Uint8ClampedArray(w*h*4)});
const read=file=>{const p=PNG.sync.read(fs.readFileSync(file));return {...p,data:new Uint8ClampedArray(p.data)};};
function blend(dst,src,ox=0,oy=0){for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
  const dx=x+ox,dy=y+oy;if(dx<0||dy<0||dx>=dst.width||dy>=dst.height)continue;
  const i=(y*src.width+x)*4,j=(dy*dst.width+dx)*4,a=src.data[i+3]/255,b=dst.data[j+3]/255,alpha=a+b*(1-a);if(!alpha)continue;
  for(let k=0;k<3;k++)dst.data[j+k]=(src.data[i+k]*a+dst.data[j+k]*b*(1-a))/alpha;dst.data[j+3]=alpha*255;
}}
const write=(name,im)=>fs.writeFileSync(path.join(out,name),PNG.sync.write({...im,data:Buffer.from(im.data)}));
function portrait(c){const im=blank(96,96);for(const [file,colors]of portraitLayers(c)){const p=read(path.join(here,'sources/portraits',file));colorize(p.data,colors);blend(im,p,(96-p.width)/2,(96-p.height)/2);}return im;}
const gallery=blank(96*3+32,112);
for(let i=0;i<gallery.data.length;i+=4)gallery.data.set([32,42,42,255],i);
for(const [index,c]of PRESETS.entries()){
  const p=portrait(c);write(c.id+'-portrait-96.png',p);blend(gallery,p,8+index*104,8);
  assert.ok(p.data.some((v,i)=>i%4===3&&v===0));assert.ok(p.data.some((v,i)=>i%4===3&&v===255));
  const closed=portrait({...c,eyes:'closed01'});assert.notDeepEqual(p.data,closed.data,'expression changes actual image pixels');
  const dyed=portrait({...c,hair:['#78d0ce','#398a9c','#29445e']});assert.notDeepEqual(p.data,dyed.data,'palette changes actual image pixels');
  const sheet=blank(512,256);for(const name of ['body','pants','shirt','shoes','head',c.walkHair])blend(sheet,read(path.join(here,'sources/lpc',name+'.png')));
  write(c.id+'-walk.png',sheet);
  const rows=Array.from({length:4},(_,y)=>Buffer.from(sheet.data.subarray(y*512*64*4,(y+1)*512*64*4)).toString('base64'));assert.equal(new Set(rows).size,4,'four genuinely different view directions');
  const p2=portrait(c);assert.deepEqual(p.data,p2.data,'deterministic export');
}
const zoom=4,large=blank(gallery.width*zoom,gallery.height*zoom);
for(let y=0;y<large.height;y++)for(let x=0;x<large.width;x++){const i=(Math.floor(y/zoom)*gallery.width+Math.floor(x/zoom))*4;large.data.set(gallery.data.subarray(i,i+4),(y*large.width+x)*4);}
write('portraits-comparison.png',large);
write('collector-closed-96.png',portrait({...PRESETS[1],eyes:'closed01'}));
fs.writeFileSync(path.join(out,'appearances.json'),JSON.stringify({prototypeOnly:true,presets:PRESETS,portraitSize:[96,96],walkFrame:[64,64],walkDirections:{up:0,left:1,down:2,right:3},sources:['../CREDITS.md']},null,2));
console.log('PASS: 3 transparent 96x96 portraits, expression/palette changes, 3 four-direction 8-frame sheets and deterministic code export. '+out);
