import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {compileStoryPack} from '../../modules/narrative/content.mjs';
const repo=fileURLToPath(new URL('../../',import.meta.url));
export async function buildStoryProject({root=path.join(repo,'content/story/corner_card_shop'),out=path.join(repo,'data/story')}={}){
  root=path.resolve(root);out=path.resolve(out);
  const read=rel=>{
    if(typeof rel!=='string'||path.isAbsolute(rel)||rel.split(/[\\/]/).includes('..'))throw Error('Invalid story source path');
    const p=path.resolve(root,rel),actual=fs.realpathSync(p),r=path.relative(fs.realpathSync(root),actual);
    if(r.startsWith('..')||path.isAbsolute(r)||fs.statSync(p).size>2*1024*1024)throw Error('Story source outside project or too large');
    return JSON.parse(fs.readFileSync(p,'utf8'));
  };
  const project=read('project.json'),runtime=read('runtime.json'),people=read(project.characters).characters,flags=read(project.flags).flags,lines=read(project.text).lines;
  const cast=runtime.cast,art=JSON.parse(fs.readFileSync(path.join(repo,'assets/frontend/manifest.json'),'utf8')).characters;
  const bindings=cast;
  if(Object.keys(bindings).some(id=>!people.some(p=>p.personId===id)))throw Error('Unknown person in appearance bindings');
  for(const id of Object.values(bindings))if(!art[id])throw Error('Missing appearance '+id);
  const payload={schemaVersion:1,campaignId:project.campaignId,contentRevision:runtime.contentRevision,defaultLocale:'zh-CN',
    characters:people.map(({personId,displayName})=>({personId,displayName})),
    flags:flags.map(({flagId,type,default:value,allowedValues,writableByStory})=>({flagId,type,default:value,allowedValues,writableByStory})),
    lines,cast:bindings,entries:runtime.entries,...(runtime.requires?{requires:runtime.requires}:{}),chapters:project.chapters.map(read).map(c=>({...c,contentRevision:runtime.contentRevision}))};
  const pack=await compileStoryPack(payload),name=payload.campaignId+'.'+pack.contentHash.slice(0,16)+'.storypack.json';
  const indexPath=path.join(out,'index.json'),old=fs.existsSync(indexPath)?JSON.parse(fs.readFileSync(indexPath,'utf8')):{packs:[]};
  if((old.active||(old.current?[old.current]:[])).some(file=>!old.packs.includes(file)))throw Error('Invalid active story version reference');
  for(const file of old.packs||[]){
    if(!/^[a-zA-Z0-9_.-]+\.storypack\.json$/.test(file))throw Error('Invalid archived story path');
    const previous=JSON.parse(fs.readFileSync(path.join(out,file),'utf8'));
    if(previous.payload.campaignId===payload.campaignId&&previous.payload.contentRevision===payload.contentRevision&&previous.contentHash!==pack.contentHash)throw Error('Content revision is immutable. Bump runtime.json contentRevision before publishing changes.');
  }
  fs.mkdirSync(out,{recursive:true});
  fs.writeFileSync(path.join(out,name),JSON.stringify(pack,null,2)+'\n');
  const active=(old.active||(old.current?[old.current]:[])).filter(file=>JSON.parse(fs.readFileSync(path.join(out,file),'utf8')).payload.campaignId!==payload.campaignId);
  const index={format:'card-shop-story-index/1',packs:[...new Set([...(old.packs||[]).filter(p=>p!==name),name])],active:[...active,name],current:name};
  fs.writeFileSync(indexPath,JSON.stringify(index,null,2)+'\n');
  return {file:name,contentHash:pack.contentHash,chapters:payload.chapters.length,nodes:payload.chapters.reduce((n,c)=>n+c.nodes.length,0)};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url))buildStoryProject().then(r=>console.log(JSON.stringify(r,null,2))).catch(e=>{console.error(e.message);process.exitCode=1;});
