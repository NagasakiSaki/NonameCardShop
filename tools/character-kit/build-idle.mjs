// Dedicated neutral poses, independent of the approved eight-frame walking sheets.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {PRESETS} from '../../experiments/character-art/appearance-data.mjs';
import {composeWalk,walkLayerNames} from '../../experiments/character-art/walk-refinement.mjs';
import {encodePng} from '../frontend-art/png.mjs';
import {writeFileAtomic} from '../frontend-art/atomic-file.mjs';
import {reserveCandidateDirectory,argument} from '../lib/candidate-output.mjs';

const root=fileURLToPath(new URL('../../',import.meta.url));
const {PNG}=createRequire(path.join(root,'.local/art-lab/tools/package.json'))('pngjs');
export function buildIdle(c){
  const sources={};
  for(const name of walkLayerNames(c)){
    const p=PNG.sync.read(fs.readFileSync(path.join(root,'experiments/character-art/sources/lpc-idle',name+'.png')));
    if(p.width!==192||p.height!==256)throw Error('Unexpected LPC idle geometry: '+name);
    const data=new Uint8ClampedArray(512*256*4);
    // LPC idle column 0 is the planted neutral pose. Repeat only for the existing
    // costume compositor; the exported idle sheet has ONE frame per direction.
    for(let y=0;y<256;y++)for(let col=0;col<8;col++)data.set(p.data.subarray(y*192*4,(y*192+64)*4),(y*512+col*64)*4);
    sources[name]={width:512,height:256,data};
  }
  const im=composeWalk(c,sources,'final',undefined,{idle:true});
  const rgba=new Uint8ClampedArray(64*256*4);
  for(let y=0;y<256;y++)rgba.set(im.data.subarray(y*512*4,(y*512+64)*4),y*64*4);
  return {width:64,height:256,rgba};
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const out=reserveCandidateDirectory({root,output:argument(process.argv.slice(2),'out','.local/idle-build-'+new Date().toISOString().replace(/[:.]/g,'-')),sources:[path.join(root,'experiments/character-art/sources/lpc-idle')]});
  const manifestFile=path.join(root,'assets/frontend/manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestFile));
  for(const c of PRESETS){
    const im=buildIdle(c),png=encodePng(im.width,im.height,im.rgba),name=c.id+'-idle.'+createHash('sha256').update(png).digest('hex').slice(0,10)+'.png';
    fs.writeFileSync(path.join(out,name),png);
    if(process.argv.includes('--install')){
      fs.copyFileSync(path.join(out,name),path.join(root,'assets/frontend/characters',name));
      Object.assign(manifest.characters[c.id],{idleSheet:'/assets/frontend/characters/'+name,idleColumns:1,idleColumn:0});
    }
  }
  if(process.argv.includes('--install'))writeFileAtomic(manifestFile,JSON.stringify(manifest,null,2)+'\n');
  console.log('Built 25 four-direction neutral sheets: '+out);
}
