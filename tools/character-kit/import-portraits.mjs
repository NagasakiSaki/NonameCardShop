// Install only reviewed portraits; walking sheets, identities and game saves are never modified.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {BAND_APPEARANCES} from '../../data/band-appearances.mjs';
import {encodePng} from '../frontend-art/png.mjs';
import {applyPortraitOverrides} from '../frontend-art/portrait-overrides.mjs';
const root=path.resolve(import.meta.dirname,'../..');
const require=createRequire(path.join(root,'.local/art-lab/tools/package.json'));
let PNG;try{({PNG}=require('pngjs'));}catch{throw Error('请先运行 npm run art:setup；仅导入时需要 pngjs。');}
const hash=b=>createHash('sha256').update(b).digest('hex');
function image(bytes,width,height){
 const im=PNG.sync.read(bytes);im.rgba=im.data;assert.deepEqual([im.width,im.height],[width,height]);
 let transparent=0,visible=0;const colors=new Set();
 for(let i=0;i<im.rgba.length;i+=4){const a=im.rgba[i+3];assert.ok(a===0||a===255,'人物图必须使用干净透明边');if(a){visible++;colors.add(Buffer.from(im.rgba.subarray(i,i+3)).toString('hex'));}else transparent++;}
 assert.ok(transparent>0&&visible>100,'人物图不能是纯色背景或空白');assert.ok(colors.size<=64,'当前接入档为 64 色');
 return {width,height,colors:colors.size,rgba:im.rgba};
}
export function importPortraits({candidate=path.join(root,'deliverables/2026-10-24/ART-03'),sourceDir,dryRun=false}={}){
 assert.ok(sourceDir,'需要 --source-dir 指定用户原图目录');
 candidate=path.resolve(candidate);sourceDir=path.resolve(sourceDir);
 const index=JSON.parse(fs.readFileSync(path.join(candidate,'sources-index.json'),'utf8'));
 const report=JSON.parse(fs.readFileSync(path.join(candidate,'results.json'),'utf8'));
 const files=new Map(report.final.files.map(f=>[f.file.replaceAll('\\','/'),f]));
 const expected=new Set(BAND_APPEARANCES.map(c=>c.id)),pending=[],characters={};
 assert.equal(index.characters.length,25);assert.equal(new Set(index.characters.map(c=>c.id)).size,25);
 for(const source of index.characters){
  assert.ok(expected.has(source.id),'未知角色 ID：'+source.id);assert.equal(path.basename(source.sourcePackFile),source.sourcePackFile,'原图文件名不能包含路径');
  assert.equal(source.localFile,`sources/${source.id}-official.png`,'候选原图必须位于该交付目录 sources 内');
  const original=fs.readFileSync(path.join(sourceDir,source.sourcePackFile)),inputHash=hash(original);
  assert.equal(inputHash,source.sourcePackSha256,'原图与候选版本不一致：'+source.id);
  assert.equal(hash(fs.readFileSync(path.join(candidate,source.localFile))),inputHash,'候选使用了另一份源图：'+source.id);
  const copy=(file,size)=>{
   const rel=`samples/${source.id}/${file}`,entry=files.get(rel);assert.ok(entry,'缺少最终记录：'+rel);
   const bytes=fs.readFileSync(path.join(candidate,rel));assert.equal(hash(bytes),entry.sha256,'成品哈希不一致：'+rel);
   assert.equal(entry.inputSha256,inputHash,'成品记录仍指向旧图源：'+rel);const {rgba,...stats}=image(bytes,...size);
   // Preserve every pixel while encoding with the project's filter-0 PNG format.
   const canonical=encodePng(...size,rgba),sha256=hash(canonical);
   const url=`/assets/frontend/portraits/${source.id}.${sha256.slice(0,10)}.png`;pending.push({url,bytes:canonical});return {url,sha256,candidateSha256:entry.sha256,...stats};
  };
  const portrait=copy('portrait-128x224-retouch-c64.png',[128,224]),avatar=copy('avatar-96.png',[96,96]);
  const sidecar=JSON.parse(fs.readFileSync(path.join(candidate,`samples/${source.id}/avatar-manifest.json`),'utf8'));
  characters[source.id]={name:source.officialName,band:source.band,sourceFile:source.sourcePackFile,sourceSha256:inputHash,sourceSize:[original.readUInt32BE(16),original.readUInt32BE(20)],portrait,avatar,headRectSource:sidecar.headRectSource,avatarCrop:sidecar.crops.find(c=>c.target===96),method:'retouch',palette:64};
 }
 const registry={version:1,artVersion:'pixel-shop-6-user-source-portraits',sourceOfTruth:'用户指定的全部角色基础全身立绘/PNG透明格式',sourceDirectory:sourceDir,characters};
 const manifestPath=path.join(root,'assets/frontend/manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath));
 // Every byte and all IDs are checked before the first filesystem mutation.
 applyPortraitOverrides(manifest,registry,{verifyFiles:false});
 if(!dryRun){for(const {url,bytes}of pending){const target=path.join(root,url.slice(1));fs.mkdirSync(path.dirname(target),{recursive:true});if(!fs.existsSync(target))fs.writeFileSync(target,bytes);else assert.equal(hash(fs.readFileSync(target)),hash(bytes));}
  fs.writeFileSync(path.join(root,'data/character-portraits.json'),JSON.stringify(registry,null,2)+'\n');
  fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 }
 return {characters:Object.keys(characters).length,assets:pending.length,dryRun};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),arg=n=>args.includes(n)?args[args.indexOf(n)+1]:undefined;
 console.log(JSON.stringify(importPortraits({candidate:arg('--candidate'),sourceDir:arg('--source-dir'),dryRun:args.includes('--dry-run')})));
}
