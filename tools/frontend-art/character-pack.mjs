// Shared by the art CLI and original asset builder: rebuilding cannot drop this pack.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {applyPortraitOverrides} from './portrait-overrides.mjs';
import {buildIdle} from '../character-kit/build-idle.mjs';
import {encodePng} from './png.mjs';
const root=path.resolve(import.meta.dirname,'../..'),generated=path.join(root,'experiments/character-art/generated');
export function applyCharacterPack(manifest){
  const {presets}=JSON.parse(fs.readFileSync(path.join(generated,'appearances.json'),'utf8'));
  const registryFile=path.join(root,'data/character-portraits.json'),registry=fs.existsSync(registryFile)?JSON.parse(fs.readFileSync(registryFile,'utf8')):null;
  const selected=presets.filter(c=>c.band&&c.id.startsWith('bd-'));
  manifest.characters={};
  for(const c of selected){const id=c.id;
    const save=(folder,file,bytes=fs.readFileSync(path.join(generated,file)),suffix='')=>{const hash=createHash('sha256').update(bytes).digest('hex').slice(0,10),url='/assets/frontend/'+folder+'/'+id+suffix+'.'+hash+'.png',target=path.join(root,url.slice(1));if(!fs.existsSync(target))fs.writeFileSync(target,bytes);return url;};
    const override=registry?.characters[id],sheet=save('characters',c.sheet),portrait=override?.portrait.url||save('portraits',c.portrait),avatar=override?.avatar.url||save('portraits',c.avatar||c.portrait);
    const idle=buildIdle(c),idleSheet=save('characters',null,encodePng(idle.width,idle.height,idle.rgba),'-idle');
    manifest.characters[id]={sheet,idleSheet,idleColumns:1,portrait,avatar,portraitSize:c.portraitSize||[96,96],frameWidth:64,frameHeight:64,columns:8,displayScale:1,anchorPx:[32,61],directions:{up:0,left:1,down:2,right:3},idleColumn:0,walkColumns:[0,1,2,3,4,5,6,7],frameRate:9,displayName:c.characterName||'店长',role:c.id==='keeper'?'店主':'顾客',appearanceReference:c.reference||null,band:c.band||null};
  }
  manifest.artVersion='pixel-shop-5-standing-audit';manifest.characterOrder=selected.map(c=>c.id);
  manifest.characterCredits='/experiments/character-art/CREDITS.md';return applyPortraitOverrides(manifest,registry);
}
