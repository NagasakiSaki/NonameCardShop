import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import {reserveCandidateDirectory,argument} from '../lib/candidate-output.mjs';
import {fileInventory,inventoryHash,sha256} from '../lib/file-inventory.mjs';
import {decodePng} from './png.mjs';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const out=reserveCandidateDirectory({root,output:argument(process.argv.slice(2),'out',`.local/art-reproduction-${new Date().toISOString().replace(/[:.]/g,'-')}`)});
const source=JSON.parse(fs.readFileSync(path.join(root,'assets/frontend/manifest.json')));
const sourceFiles=new Set(['assets/frontend/manifest.json','assets/frontend-next/products/manifest.json','assets/frontend/props/props.png']);
for(const c of Object.values(source.characters))sourceFiles.add((c.sourceSheet||c.sheet).replace(/^\//,''));
for(const item of fileInventory(path.join(root,'tools/frontend-art-bright')))if(item.path.endsWith('.mjs'))sourceFiles.add('tools/frontend-art-bright/'+item.path);
const inputs=[...sourceFiles].sort().map(file=>({path:file,sha256:sha256(fs.readFileSync(path.join(root,file)))}));
const formal=()=>({manifest:sha256(fs.readFileSync(path.join(root,'assets/frontend/manifest.json'))),assets:inventoryHash(fileInventory(path.join(root,'assets/frontend-bright-anime')))});
const before=formal(),runs=[];
for(const name of ['first','second']){
  const target=path.join(out,name),start=performance.now();
  const child=spawnSync(process.execPath,['tools/frontend-art-bright/build.mjs','--out',target],{cwd:root,encoding:'utf8',windowsHide:true});
  fs.writeFileSync(path.join(out,name+'.log'),child.stdout+(child.stderr||''));
  if(child.status!==0)throw Error('素材构建失败：'+name+'，见 '+out);
  const files=fileInventory(target,{normalize(file,bytes){if(file!=='build-stats.json')return bytes;const stats=JSON.parse(bytes);delete stats.elapsedMs;return JSON.stringify(stats);}});
  const characters=JSON.parse(fs.readFileSync(path.join(target,'manifest.characters.json'))).characters;
  assert.equal(characters.length,25);
  for(const c of characters){
    const original=source.characters[c.id];assert.ok(original,'未知角色 '+c.id);
    for(const key of ['frameWidth','frameHeight','columns','displayScale','anchorPx','directions','idleColumn','walkColumns'])assert.deepEqual(c[key],original[key],c.id+': '+key);
    const png=decodePng(fs.readFileSync(path.join(target,'characters',c.id+'.png')));
    assert.equal(png.width??png.w,original.frameWidth*original.columns);
    assert.equal(png.height??png.h,original.frameHeight*4);
  }
  const props=JSON.parse(fs.readFileSync(path.join(target,'manifest.props.json')));
  assert.equal(props.props.list.length,source.props.list.length);
  for(const old of source.props.list){const fresh=props.props.list.find(p=>p.prop===old.prop);assert.ok(fresh);assert.equal(old.w/source.props.artScale,fresh.w/props.props.artScale);assert.equal(old.h/source.props.artScale,fresh.h/props.props.artScale);assert.equal(old.footY,fresh.footY);assert.equal(old.occludes,fresh.occludes);}
  runs.push({name,elapsedMs:Math.round(performance.now()-start),hash:inventoryHash(files),files});
}
assert.deepEqual(runs[0].files,runs[1].files,'同输入两次构建必须得到相同内容');
assert.deepEqual(formal(),before,'复现检查不能改正式素材');
for(const input of inputs)assert.equal(sha256(fs.readFileSync(path.join(root,input.path))),input.sha256,'构建源必须只读：'+input.path);
const report={schema:1,node:process.version,platform:process.platform,arch:process.arch,parameters:{artScale:4,characters:25,buildRuns:2,normalizedFields:['build-stats.json:elapsedMs']},inputs,formalBefore:before,formalAfter:formal(),runs,passed:true,limitations:['同机器 Node PNG 编码复现；未在第二台机器复验','不运行 portrait-kit 的 Python 重绘，不改变已审核立绘/头像','不安装生成的候选素材，不代表画面风格审核通过']};
fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
console.log('素材双次复现、25 角色和设施几何、正式素材只读检查通过：'+path.join(out,'report.json'));
