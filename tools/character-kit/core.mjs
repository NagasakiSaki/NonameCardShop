import fs from 'node:fs';
import path from 'node:path';
import {PRESETS,portraitLayers} from '../../experiments/character-art/appearance-data.mjs';
import {walkLayerNames,blank,blend} from '../../experiments/character-art/pixel-customization.mjs';
import {BANDS} from '../../data/band-appearances.mjs';
import {CHARACTER_AUDIT} from '../../data/character-audit.mjs';
import {readPngSize,decodePng,encodePng} from '../frontend-art/png.mjs';

export const VERSION='1.0.0';
export const ROOT=path.resolve(import.meta.dirname,'../..');
const ART=path.join(ROOT,'experiments/character-art');
const slug=/^[a-z][a-z0-9-]{0,63}$/;
const part=/^[a-zA-Z0-9-]+$/;
const color=/^#[0-9a-f]{6}$/i;
const palettes=['hair','cloth','iris','secondary','otherEye','originalCloth','shoePalette'];
const protectedOutput=/^(assets|data|frontend|frontend-next|modules|vendor|experiments|tests|contracts|docs|tools|integration|desktop|dev|node_modules|\.git)([\\/]|$)/i;
const costumes=new Set(Object.values(CHARACTER_AUDIT).map(c=>c.costume));
const inside=(parent,file)=>{const rel=path.relative(parent,file);return rel!==''&&!rel.startsWith('..'+path.sep)&&rel!=='..'&&!path.isAbsolute(rel);};
export class KitError extends Error {
  constructor(code,message,details=[]){super(message);this.code=code;this.details=details;}
}
function asset(relative){
  const absolute=path.resolve(ART,relative);
  return inside(ART,absolute)&&fs.existsSync(absolute)&&fs.statSync(absolute).isFile()&&inside(fs.realpathSync(ART),fs.realpathSync(absolute));
}
export function listParts(){
  const files=[];
  const visit=dir=>{for(const entry of fs.readdirSync(path.join(ART,dir),{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))){
    const file=dir+'/'+entry.name;
    if(entry.isDirectory())visit(file);
    else if(entry.isFile()&&entry.name.endsWith('.png')){const size=readPngSize(fs.readFileSync(path.join(ART,file)));files.push({file,...size,license:dir.startsWith('sources/lpc')?'OGA-BY-3.0':'CC-BY-4.0'});}
  }};
  visit('sources/portraits');visit('sources/lpc');
  return {version:VERSION,parts:files,templates:PRESETS.map(c=>structuredClone(c)),sizes:{standing:[128,224],avatar:[96,96],walkFrame:[64,64],walkSheet:[512,256]},credits:'experiments/character-art/CREDITS.md',schema:'tools/character-kit/config.schema.json'};
}
function configurations(input){
  if(Array.isArray(input))return {items:input,prefix:''};
  if(input&&typeof input==='object'){
    if(Object.hasOwn(input,'presets'))return {items:input.presets,prefix:'/presets'};
    if(Object.hasOwn(input,'portrait'))return {items:[input.portrait],prefix:'/portrait',single:true};
    return {items:[input],prefix:'',single:true};
  }
  return {items:null,prefix:''};
}
export function validateConfig(input){
  const errors=[],warnings=[],ids=new Set();
  const add=(field,code,message)=>errors.push({path:field||'/',code,message});
  const {items,prefix,single}=configurations(input);
  if(!Array.isArray(items)||!items.length){add(prefix,'CONFIG_SHAPE','需要人物对象、非空数组、{presets:[...]} 或 {portrait:{...}}');return {valid:false,count:0,errors,warnings};}
  if(items.length>256){add(prefix,'CONFIG_LIMIT','一次最多校验 256 个配置');return {valid:false,count:items.length,errors,warnings};}
  items.forEach((c,index)=>{
    const at=prefix+(single?'':'/'+index),field=key=>at+'/'+key;
    if(!c||typeof c!=='object'||Array.isArray(c)){add(at,'CONFIG_OBJECT','人物配置必须是对象，不能使用 PNG 路径');return;}
    if(typeof c.id!=='string'||!slug.test(c.id))add(field('id'),'ID_FORMAT','ID 必须以小写字母开头，仅含小写字母、数字和连字符，最长 64');
    else if(ids.has(c.id))add(field('id'),'DUPLICATE_ID','同一输入中 ID 重复');else ids.add(c.id);
    let partsValid=true;
    for(const key of ['base','front','back','clothes','eyes','mouth'])if(typeof c[key]!=='string'||!part.test(c[key])){partsValid=false;add(field(key),'PART_NAME','需要不含路径分隔符的部件名');}
    if(!c.band&&(typeof c.walkHair!=='string'||!part.test(c.walkHair))){partsValid=false;add(field('walkHair'),'PART_NAME','基础配置需要现存的行走发型部件名');}
    if(c.walkStyle!==undefined&&typeof c.walkStyle!=='string'){partsValid=false;add(field('walkStyle'),'FIELD_TYPE','行走发型必须是字符串');}
    for(const key of palettes){
      if(c[key]===undefined&&!['hair','cloth','iris'].includes(key))continue;
      if(!Array.isArray(c[key])||c[key].length!==3||!c[key].every(v=>typeof v==='string'&&color.test(v)))add(field(key),'PALETTE','需要恰好 3 个 #RRGGBB 颜色（亮、中、暗）');
    }
    for(const key of ['streak','accent'])if(c[key]!=null&&(typeof c[key]!=='string'||!color.test(c[key])))add(field(key),'COLOR','需要 #RRGGBB 颜色');
    if(c.band!=null){
      if(!BANDS.some(b=>b.id===c.band))add(field('band'),'BAND','当前完整立绘只支持五个已有团的绘制主题');
      if(!costumes.has(c.costume))add(field('costume'),'COSTUME','复制现有完整立绘时保留已注册 costume，未知款式需扩展核心绘制器');
    }
    if(c.walkTailLength!==undefined&&(!Number.isInteger(c.walkTailLength)||c.walkTailLength<0||c.walkTailLength>40))add(field('walkTailLength'),'RANGE','发尾长度必须是 0～40 的整数');
    if(partsValid){
      const lookup={base:'hair/base/',front:'hair/front/',back:'hair/back/',clothes:'cloths/',eyes:'eyes/',mouth:'mouth/'};
      for(const [file]of portraitLayers(c))if(!asset('sources/portraits/'+file)){
        const key=Object.keys(lookup).find(k=>file.startsWith(lookup[k]))||'base';
        add(field(key),'MISSING_PART','缺少头像部件：'+file);
      }
      for(const name of walkLayerNames(c))if(typeof name!=='string'||!part.test(name)||!asset('sources/lpc/'+name+'.png'))add(field('walkHair'),'MISSING_PART','缺少行走部件：'+name);
    }
    if(c.band&&!c.originalCloth)warnings.push({path:field('originalCloth'),code:'NO_DYE_BASELINE',message:'未保留 originalCloth，服装换色无法可靠对照原版基准'});
  });
  return {valid:errors.length===0,count:items.length,errors,warnings};
}
export function readConfig(file){
  if(!file)throw new KitError('ARGUMENT','缺少 --config <file>');
  const absolute=path.resolve(file),stat=fs.statSync(absolute);
  if(!stat.isFile()||stat.size>2*1024*1024)throw new KitError('CONFIG_SIZE','配置必须是小于 2 MB 的普通 JSON 文件');
  try{return JSON.parse(fs.readFileSync(absolute,'utf8').replace(/^\uFEFF/,''));}catch{throw new KitError('CONFIG_JSON','配置不是有效 JSON');}
}
// Only explicit project outputs, never the game assets, source, history, or personal directories.
export function outputDirectory(value,overwrite=false){
  if(!value)throw new KitError('ARGUMENT','缺少 --out <directory>');
  const out=path.resolve(value),relative=path.relative(ROOT,out);
  if(!inside(ROOT,out)||protectedOutput.test(relative))throw new KitError('OUTPUT_PATH','输出目录必须在工程内，且不能是正式资源、源码、文档或 .git 目录');
  let ancestor=out;while(!fs.existsSync(ancestor))ancestor=path.dirname(ancestor);
  const actual=fs.realpathSync(ancestor),actualRoot=fs.realpathSync(ROOT);
  if(!inside(actualRoot,actual)&&actual!==actualRoot)throw new KitError('OUTPUT_PATH','输出路径的实际位置越出工程');
  if(protectedOutput.test(path.relative(actualRoot,actual)))throw new KitError('OUTPUT_PATH','输出路径实际指向受保护的工程目录');
  if(fs.existsSync(out)){
    if(!fs.statSync(out).isDirectory())throw new KitError('OUTPUT_EXISTS','输出路径不是目录');
    if(!overwrite)throw new KitError('OUTPUT_EXISTS','目录已存在；请选新目录，或对本工具生成的目录使用 --overwrite');
    const marker=path.join(out,'character-kit-output.json');
    if(!fs.existsSync(marker)||JSON.parse(fs.readFileSync(marker)).tool!=='character-kit')throw new KitError('OUTPUT_UNOWNED','仅允许覆盖本工具生成且带标记的输出目录');
  }
  return out;
}
export function writeOutput(out,files,overwrite=false){
  // Check every collision before writing, including symbolic links; never recursively delete.
  for(const name of files.keys()){
    if(!/^[a-z0-9-]+\.(png|json|html|md)$/.test(name))throw new KitError('OUTPUT_FILE','无效的输出文件名');
    const dest=path.join(out,name);
    if(fs.existsSync(dest)||fs.existsSync(out)&&fs.readdirSync(out).includes(name)){
      const stat=fs.lstatSync(dest);
      if(!overwrite||stat.isSymbolicLink()||!stat.isFile())throw new KitError('OUTPUT_COLLISION','不可覆盖：'+name);
    }
  }
  fs.mkdirSync(out,{recursive:true});
  for(const [name,bytes]of files)fs.writeFileSync(path.join(out,name),bytes);
  return [...files.keys()].map(n=>path.join(out,n));
}
const html=s=>String(s).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('>','&gt;').replaceAll('"','&quot;');
export function contactSheet(value,{overwrite=false}={}){
  const out=outputDirectory(value,overwrite),registry=JSON.parse(fs.readFileSync(path.join(ART,'generated/appearances.json'),'utf8'));
  const files=new Map(),groups=[];
  for(const band of [...BANDS,{id:'base',name:'基础模板'}]){
    const entries=registry.presets.filter(c=>(c.band||'base')===band.id),columns=Math.min(5,entries.length);
    if(!columns)continue;
    const image=blank(columns*136,Math.ceil(entries.length/columns)*240);
    for(let i=0;i<image.data.length;i+=4)image.data.set([32,42,42,255],i);
    entries.forEach((c,index)=>{
      if(typeof c.portrait!=='string'||!/^[a-z0-9-]+\.png$/.test(c.portrait))throw new KitError('SOURCE_PATH','图册只能使用生成目录中的原生人物 PNG');
      const p=decodePng(fs.readFileSync(path.join(ART,'generated',c.portrait))),expected=c.band?[128,224]:[96,96];
      if(p.width!==expected[0]||p.height!==expected[1])throw new KitError('SOURCE_SIZE','人物 PNG 尺寸错误：'+c.id);
      blend(image,{width:p.width,height:p.height,data:p.rgba},(index%columns)*136+4+(128-p.width)/2,Math.floor(index/columns)*240+8);
    });
    const file=band.id+'-standing.png';files.set(file,encodePng(image.width,image.height,image.data));groups.push({id:band.id,name:band.name,file,width:image.width,height:image.height,characters:entries.map(c=>({id:c.id,name:c.officialName||c.name}))});
  }
  const report={tool:'character-kit',version:VERSION,kind:'contact-sheet',groups,credits:'experiments/character-art/CREDITS.md'};
  files.set('character-kit-output.json',JSON.stringify(report,null,2)+'\n');
  files.set('index.html','<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>人物核对图册</title><style>body{background:#202a2a;color:#f2ede0;font:16px system-ui;margin:24px}figure{margin:24px 0;overflow-x:auto}img{image-rendering:pixelated;display:block}li{margin:6px 0}</style><h1>人物核对图册</h1><p>原生完整立绘；排列与下方姓名列表一致。只读取现成 PNG，未修改正式资源。</p>'+groups.map(g=>'<section><h2>'+html(g.name)+'</h2><figure><img src="'+g.file+'" width="'+g.width+'" height="'+g.height+'" alt="'+html(g.name)+'人物图册"></figure><ol>'+g.characters.map(c=>'<li>'+html(c.name)+' · '+html(c.id)+'</li>').join('')+'</ol></section>').join('')+'<p>素材许可见工程 experiments/character-art/CREDITS.md。</p></html>');
  return {out,groups:groups.length,characters:registry.presets.length,files:writeOutput(out,files,overwrite)};
}
