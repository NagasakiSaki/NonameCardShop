// Model-independent, deterministic CLI. No game saves or browser session required.
import fs from 'node:fs';
import {writeFileAtomic} from '../../tools/frontend-art/atomic-file.mjs';
import path from 'node:path';
import {createRequire} from 'node:module';
import assert from 'node:assert/strict';
import {PRESETS,portraitLayers,colorizeLayer} from './appearance-data.mjs';
import {blank,blend,portraitDetails,portraitHairExtensions,composeWalk,walkLayerNames} from './pixel-customization.mjs';
import {encodePng} from '../../tools/frontend-art/png.mjs';
import {renderStanding,standingAvatar} from './standing-portrait.mjs';
const here=import.meta.dirname,root=path.resolve(here,'../..'),require=createRequire(path.join(root,'.local/art-lab/tools/package.json'));
let PNG;try{({PNG}=require('pngjs'));}catch{throw Error('先运行 npm run art:setup；仅构建需要 pngjs，运行游戏不需要。');}
const args=process.argv.slice(2),arg=name=>{if(!args.includes(name))return null;const value=args[args.indexOf(name)+1];assert.ok(value&&!value.startsWith('--'),name+' 缺少参数值');return value;};
if(args.includes('--help')){console.log('node experiments/character-art/build-samples.mjs [--id bd-tomori] [--config appearance.json] [--out directory] [--install]');process.exit(0);}
const out=path.resolve(arg('--out')||path.join(here,'generated'));fs.mkdirSync(out,{recursive:true});
const input=arg('--config')?JSON.parse(fs.readFileSync(path.resolve(arg('--config')),'utf8')):null;
if(input||arg('--id'))assert.ok(arg('--out')&&out!==path.join(here,'generated'),'单人或自定义导出必须指定独立 --out，不能覆盖完整人物包');
if(args.includes('--install'))assert.ok(!input&&!arg('--id')&&out===path.join(here,'generated'),'安装必须使用完整内置配置及默认输出目录');
let presets=input?(Array.isArray(input)?input:input.presets||[input.portrait||input]):PRESETS;
if(arg('--id'))presets=presets.filter(c=>c.id===arg('--id'));assert.ok(presets.length,'没有匹配的人物');
assert.equal(new Set(presets.map(c=>c.id)).size,presets.length,'角色 ID 重复');
for(const c of presets){assert.match(c.id,/^[a-z][a-z0-9-]{0,63}$/);for(const colors of [c.hair,c.cloth,c.iris])assert.ok(colors.length===3&&colors.every(s=>/^#[0-9a-f]{6}$/i.test(s)),'三阶调色板无效');for(const [file]of portraitLayers(c))assert.ok(!file.includes('..')&&fs.existsSync(path.join(here,'sources/portraits',file)),'缺少部件 '+file);for(const name of walkLayerNames(c))assert.ok(/^[a-z0-9-]+$/.test(name)&&fs.existsSync(path.join(here,'sources/lpc',name+'.png')),'缺少行走部件 '+name);}
const cache=new Map(),read=file=>{if(!cache.has(file)){const p=PNG.sync.read(fs.readFileSync(file));cache.set(file,{width:p.width,height:p.height,data:new Uint8ClampedArray(p.data)});}const p=cache.get(file);return {...p,data:new Uint8ClampedArray(p.data)};};
const write=(name,im)=>fs.writeFileSync(path.join(out,name),encodePng(im.width,im.height,im.data));
function portrait(c){if(c.band)return renderStanding(c,Object.fromEntries(portraitLayers(c).map(([file])=>[file,read(path.join(here,'sources/portraits',file))])));const im=blank(96,96);for(const [file,colors]of portraitLayers(c)){const p=read(path.join(here,'sources/portraits',file));colorizeLayer(p.data,colors,c,file);blend(im,p,(96-p.width)/2,(96-p.height)/2);if(file.startsWith('hair/back/'))portraitHairExtensions(im,c);}return portraitDetails(im,c);}
const rows=[],portraits=new Map(),standing=new Map();
for(const c of presets){
  const p=portrait(c),avatar=c.band?standingAvatar(p):p;write(c.id+'-portrait-96.png',avatar);portraits.set(c.id,avatar);if(c.band){write(c.id+'-standing-128x224.png',p);standing.set(c.id,p);}
  assert.ok(p.data.some((v,i)=>i%4===3&&v===0));assert.ok(p.data.some((v,i)=>i%4===3&&v===255));
  assert.notDeepEqual(p.data,portrait({...c,eyes:'closed01'}).data,'表情未改变');
  assert.notDeepEqual(p.data,portrait({...c,hair:['#78d0ce','#398a9c','#29445e']}).data,'改色未生效');
  if(c.band)assert.notDeepEqual(p.data,portrait({...c,cloth:['#78d0ce','#398a9c','#29445e']}).data,'服饰调色未生效');
  const sources=Object.fromEntries(walkLayerNames(c).map(name=>[name,read(path.join(here,'sources/lpc',name+'.png'))])),sheet=composeWalk(c,sources);write(c.id+'-walk.png',sheet);
  assert.equal(new Set(Array.from({length:4},(_,y)=>Buffer.from(sheet.data.subarray(y*512*64*4,(y+1)*512*64*4)).toString('base64'))).size,4,'四个朝向不能复用同一正面');
  assert.deepEqual(p.data,portrait(c).data,'导出必须确定');
  rows.push({...c,portrait:c.id+(c.band?'-standing-128x224.png':'-portrait-96.png'),avatar:c.id+'-portrait-96.png',portraitSize:c.band?[128,224]:[96,96],sheet:c.id+'-walk.png',frameWidth:64,frameHeight:64,columns:8,anchorPx:[32,61],directions:{up:0,left:1,down:2,right:3},idleColumn:0,walkColumns:[0,1,2,3,4,5,6,7],frameRate:9,displayScale:1});
}
function gallery(items,columns,scale=2){const native=blank(columns*104,Math.ceil(items.length/columns)*108);for(let i=0;i<native.data.length;i+=4)native.data.set([32,42,42,255],i);for(const [i,c]of items.entries())blend(native,portraits.get(c.id),4+(i%columns)*104,4+Math.floor(i/columns)*108);const im=blank(native.width*scale,native.height*scale);for(let y=0;y<im.height;y++)for(let x=0;x<im.width;x++){const n=(Math.floor(y/scale)*native.width+Math.floor(x/scale))*4;im.data.set(native.data.subarray(n,n+4),(y*im.width+x)*4);}return im;}
const bands=presets.filter(c=>c.band);if(bands.length)write('five-bands-portraits.png',gallery(bands,5));
for(const band of [...new Set(bands.map(c=>c.band))]){const items=bands.filter(c=>c.band===band),im=blank(136*items.length,240);for(let i=0;i<im.data.length;i+=4)im.data.set([32,42,42,255],i);items.forEach((c,i)=>blend(im,standing.get(c.id),i*136+4,8));write(band+'-standing-lineup.png',im);}
if(presets.length===PRESETS.length){write('portraits-comparison.png',gallery(presets.slice(0,3),3,4));write('collector-closed-96.png',portrait({...presets[1],eyes:'closed01'}));}
writeFileAtomic(path.join(out,'appearances.json'),JSON.stringify({version:3,avatarSize:[96,96],standingSize:[128,224],walkFrame:[64,64],walkDirections:{up:0,left:1,down:2,right:3},presets:rows,sources:['../CREDITS.md']},null,2));
fs.writeFileSync(path.join(out,'gallery.html'),'<!doctype html><meta charset="utf-8"><title>人物素材导出</title><style>body{background:#202a2a;color:#f2ede0;font:16px sans-serif;margin:24px}main{display:grid;grid-template-columns:repeat(auto-fit,minmax(144px,1fr));gap:12px}figure{margin:0;background:#2b3838;padding:12px}img{width:128px;height:224px;object-fit:contain;image-rendering:pixelated}small{display:block;color:#b8c7bf}</style><h1>人物像素外观 · 导出目录</h1><p>外观与职业、性格、资金无关。</p><main>'+[...rows.filter(c=>c.band),...rows.filter(c=>!c.band)].map(c=>`<figure><img src="${c.portrait}" alt="${c.name}"><figcaption>${c.name}<small>${c.band||'基础模板'} / ${c.id}</small></figcaption></figure>`).join('')+'</main>');
if(args.includes('--install')){
  assert.ok(!input&&!arg('--id')&&out===path.join(here,'generated'),'安装必须使用完整内置配置及默认输出目录');
  const {applyCharacterPack}=await import('../../tools/frontend-art/character-pack.mjs');
  const file=path.join(root,'assets/frontend/manifest.json'),manifest=JSON.parse(fs.readFileSync(file));applyCharacterPack(manifest);writeFileAtomic(file,JSON.stringify(manifest,null,2));
}
console.log(`PASS: ${rows.length} 套透明头像与四向八帧图集，表情/调色/确定性导出通过。输出 ${out}${args.includes('--install')?'；已接入游戏资源清单':''}`);
