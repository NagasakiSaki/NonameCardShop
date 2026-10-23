// Shared by the art CLI and original asset builder: rebuilding cannot drop this pack.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),generated=path.join(root,'experiments/character-art/generated');
export function applyCharacterPack(manifest){
  const {presets}=JSON.parse(fs.readFileSync(path.join(generated,'appearances.json'),'utf8'));
  const selected=presets.filter(c=>c.band||c.id==='keeper');
  for(const c of selected){const id=c.id==='keeper'?'owner':c.id;
    const save=(folder,file)=>{const bytes=fs.readFileSync(path.join(generated,file)),hash=createHash('sha256').update(bytes).digest('hex').slice(0,10),url='/assets/frontend/'+folder+'/'+id+'.'+hash+'.png',target=path.join(root,url.slice(1));if(!fs.existsSync(target))fs.writeFileSync(target,bytes);return url;};
    const sheet=save('characters',c.sheet),portrait=save('portraits',c.portrait),avatar=save('portraits',c.avatar||c.portrait);
    manifest.characters[id]={sheet,portrait,avatar,portraitSize:c.portraitSize||[96,96],frameWidth:64,frameHeight:64,columns:8,displayScale:1,anchorPx:[32,61],directions:{up:0,left:1,down:2,right:3},idleColumn:0,walkColumns:[0,1,2,3,4,5,6,7],frameRate:9,displayName:c.characterName||'店长',role:c.id==='keeper'?'店主':'顾客',appearanceReference:c.reference||null,band:c.band||null};
  }
  manifest.artVersion='pixel-shop-5-standing-audit';manifest.characterOrder=['owner',...selected.filter(c=>c.band).map(c=>c.id),...Object.keys(manifest.characters).filter(id=>id!=='owner'&&!id.startsWith('bd-'))];
  manifest.characterCredits='/experiments/character-art/CREDITS.md';return manifest;
}
