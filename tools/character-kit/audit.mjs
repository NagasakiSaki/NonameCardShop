// Read-only art inventory. Does not touch game state or remove historical hashes.
import fs from 'node:fs';
import path from 'node:path';
import {ROOT,outputDirectory,writeOutput} from './core.mjs';
import {readPngSize,decodePng} from '../frontend-art/png.mjs';
import {BAND_APPEARANCES,BANDS} from '../../data/band-appearances.mjs';
const args=process.argv.slice(2),json=args.includes('--json');
try{
  if(args.some((v,i)=>!['--out','--json','--overwrite'].includes(v)&&args[i-1]!=='--out'))throw new Error('只接受 --out <directory>、--overwrite、--json');
  const directory=args[args.indexOf('--out')+1];if(!args.includes('--out')||!directory||directory.startsWith('--'))throw new Error('缺少 --out <directory>');
  const out=outputDirectory(directory,args.includes('--overwrite')),manifest=JSON.parse(fs.readFileSync(path.join(ROOT,'assets/frontend/manifest.json'))),references=JSON.parse(fs.readFileSync(path.join(ROOT,'data/character-reference-audit.json'))),checks=[],warnings=[],used=new Set();
  const check=(name,target,ok,detail='')=>checks.push({name,target,ok,detail});
  for(const [id,c]of Object.entries(manifest.characters))for(const [kind,url]of Object.entries({sheet:c.sheet,portrait:c.portrait,avatar:c.avatar||c.portrait})){
    const target=typeof url==='string'&&/^\/assets\/frontend\/[a-z0-9/._-]+\.png$/i.test(url)?path.resolve(ROOT,'.'+url):null;
    if(!target||!target.startsWith(ROOT+path.sep)||!fs.existsSync(target)){check('path',id+'/'+kind,false,'无效或缺失：'+url);continue;}
    const real=fs.realpathSync(target);if(!real.startsWith(fs.realpathSync(ROOT)+path.sep)){check('path',id+'/'+kind,false,'真实路径越出工程');continue;}
    used.add(url.slice(1));check('path',id+'/'+kind,true,url);
    try{
      const bytes=fs.readFileSync(target),size=readPngSize(bytes);
      const portraitSize=c.portraitSize||(c.columns===8?[96,96]:[256,256]);
      const expected=kind==='sheet'?[c.frameWidth*(c.columns||3),c.frameHeight*(1+Math.max(...Object.values(c.directions)))]:kind==='avatar'&&c.avatar?[96,96]:portraitSize;
      check('size',id+'/'+kind,size.width===expected[0]&&size.height===expected[1],`${size.width}×${size.height}; expected ${expected.join('×')}`);
      check('rgba',id+'/'+kind,size.colorType===6&&size.bitDepth===8,'RGBA8');
      try{const p=decodePng(bytes);let transparent=false,opaque=false;for(let n=3;n<p.rgba.length;n+=4){transparent ||= p.rgba[n]===0;opaque ||= p.rgba[n]===255;}check('transparency',id+'/'+kind,transparent&&opaque,'同时含透明底和实心像素');}catch(e){warnings.push({target:id+'/'+kind,message:'未解码透明度：'+e.message});}
    }catch(e){check('png',id+'/'+kind,false,e.message);}
  }
  const ids=BAND_APPEARANCES.map(c=>c.id);check('unique-id','five-bands',new Set(ids).size===25,'25 个稳定 ID');
  for(const band of BANDS)check('band-count',band.id,BAND_APPEARANCES.filter(c=>c.band===band.id).length===5,'每团 5 人');
  for(const c of BAND_APPEARANCES){const ref=references.characters.find(r=>r.id===c.id);check('official-name',c.id,!!ref&&ref.officialName===c.officialName&&c.name===c.officialName.replaceAll(' ',''),c.officialName);check('reference',c.id,!!ref&&ref.page===c.reference&&ref.image.startsWith('https://bang-dream.com/')&&/^[a-f0-9]{64}$/.test(ref.sha256),'官方完整人物图元数据；不发网络请求');check('manifest',c.id,!!manifest.characters[c.id],'正式清单包含外观');}
  for(const file of ['CREDITS.md','sources/portraits/LICENSE.txt','sources/portraits/CODE-LICENSE.txt','sources/lpc/credits.txt','sources/lpc/hair-credits.txt','sources/lpc/clothing-credits.txt'])check('attribution',file,fs.existsSync(path.join(ROOT,'experiments/character-art',file)),'保留署名/许可文件');
  const historical=[];for(const dir of ['assets/frontend/characters','assets/frontend/portraits'])for(const name of fs.readdirSync(path.join(ROOT,dir)))if(/\.[a-f0-9]{10}\.png$/.test(name)&&!used.has(dir+'/'+name))historical.push(dir+'/'+name);
  const failures=checks.filter(c=>!c.ok),report={tool:'character-kit',kind:'asset-audit',baseScope:'QA-01',checkedAt:new Date().toISOString(),summary:{checks:checks.length,passed:checks.length-failures.length,failed:failures.length,warnings:warnings.length,characters:Object.keys(manifest.characters).length},checks,warnings,historicalUnreferenced:historical,limits:['未验证像不像/美感','未重新下载官方参考图验证远程可用性','未修改或检查玩家存档','未删除历史哈希资源']};
  const md='# QA-01 素材检查报告\n\n'+JSON.stringify(report.summary)+'\n\n'+(failures.length?failures.map(c=>'- '+c.target+' / '+c.name+'：'+c.detail).join('\n'):'未发现缺图、尺寸、姓名或署名文件问题。')+'\n\n历史未引用哈希：'+historical.length+' 个；可能仍被旧页面引用，保留。\n\n限制：'+report.limits.join('；')+'。\n';
  writeOutput(out,new Map([['report.json',JSON.stringify(report,null,2)+'\n'],['report.md',md],['character-kit-output.json',JSON.stringify({tool:'character-kit',kind:'asset-audit'})]]),args.includes('--overwrite'));
  if(json)console.log(JSON.stringify({ok:!failures.length,out,...report.summary}));else console.log(md);if(failures.length)process.exitCode=1;
}catch(e){process.exitCode=2;console.log(JSON.stringify({ok:false,error:{code:e.code||'AUDIT_ERROR',message:e.message}}));}
