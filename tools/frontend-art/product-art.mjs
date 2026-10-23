// Original pixel packaging; a visual label only, never a promise about sealed contents.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {blank,painter} from '../../experiments/character-art/pixel-customization.mjs';
import {encodePng} from './png.mjs';
import {productEnabled} from '../../modules/backend/distribution.mjs';
export function packageImage(kind,light,dark){
  const image=blank(kind==='pack'?64:96,96),d=painter(image),ink='#252d32',gold='#ddc68f',paper='#f0e7cf';
  if(kind==='pack'){
    d.poly([[6,2],[58,2],[56,12],[58,90],[54,95],[8,95],[5,89],[8,12]],ink);d.rect(8,5,48,87,dark);d.rect(10,14,44,68,light);
    d.poly([[10,18],[54,42],[54,76],[10,52]],dark);d.rect(8,5,48,8,gold);d.rect(8,83,48,8,gold);
    for(let x=10;x<56;x+=3){d.line(x,5,x,10,paper);d.line(x,87,x,91,dark);}
    d.line(12,17,51,17,gold);d.line(12,78,51,78,gold);d.poly([[32,25],[47,34],[47,60],[32,69],[17,60],[17,34]],ink);d.poly([[32,28],[44,35],[44,58],[32,65],[20,58],[20,35]],gold);
    d.poly([[32,33],[39,38],[37,53],[32,59],[27,53],[25,38]],dark);d.line(25,41,39,49,paper);d.line(39,41,25,49,paper);d.line(32,35,32,57,gold);d.rect(27,71,10,3,paper);
  }else{
    d.poly([[7,29],[36,9],[88,23],[59,43]],ink);d.poly([[7,29],[59,43],[59,88],[7,72]],ink);d.poly([[59,43],[88,23],[88,68],[59,88]],ink);
    d.poly([[10,30],[36,13],[84,25],[58,40]],light);d.poly([[10,33],[56,46],[56,83],[10,70]],dark);d.poly([[61,46],[84,29],[84,66],[61,83]],light);
    d.line(13,37,54,49,gold);d.line(13,66,54,78,gold);d.line(65,48,80,39,gold);d.line(65,74,80,65,gold);d.poly([[27,43],[43,48],[43,69],[27,64]],gold);d.poly([[30,48],[40,51],[40,63],[30,60]],dark);d.line(30,51,40,59,paper);d.line(40,54,30,58,paper);
    d.line(26,21,71,33,gold);d.line(29,18,74,30,gold);d.line(73,40,73,72,dark);d.rect(17,71,29,3,paper);
  }
  return image;
}
export function buildProductArt(){
  const root=path.resolve(import.meta.dirname,'../..'),out=path.join(root,'assets/frontend-next/products');fs.mkdirSync(out,{recursive:true});
  const source=JSON.parse(fs.readFileSync(path.join(root,'data/cards.json'))),rules=JSON.parse(fs.readFileSync(path.join(root,'data/backend-rules.json'))),products={};
  const colors=[['#6faaa5','#2f575d'],['#ab8273','#5b393d'],['#9192b1','#474464'],['#c6aa68','#6c5333'],['#7d9b74','#3e5945'],['#869bbd','#3f5679']];
  for(const theme of source.packs.filter(p=>productEnabled(rules,p.id))){
    const index=[...theme.id].reduce((n,c)=>n+c.charCodeAt(0),0)%colors.length;products[theme.id]={};
    for(const kind of ['pack','box']){const image=packageImage(kind,...colors[index]),bytes=encodePng(image.width,image.height,image.data),hash=createHash('sha256').update(bytes).digest('hex').slice(0,10),file=theme.id+'-'+kind+'.'+hash+'.png';fs.writeFileSync(path.join(out,file),bytes);products[theme.id][kind]='/assets/frontend-next/products/'+file;}
  }
  fs.writeFileSync(path.join(out,'manifest.json'),JSON.stringify({version:1,source:'Original code-drawn packaging; GPL-3.0 project artwork',nativeSizes:{pack:[64,96],box:[96,96]},products},null,2)+'\n');
  return {themes:Object.keys(products).length,out};
}
if(process.argv[1]&&path.resolve(process.argv[1])===path.resolve(import.meta.filename))console.log(JSON.stringify(buildProductArt()));
