// Original code-drawn sample packaging. Generates only this experiment's assets and Mock fixtures.
import fs from 'node:fs';
import path from 'node:path';
import {encodePng} from '../../../tools/frontend-art/png.mjs';
import {blank,painter} from '../../../experiments/character-art/pixel-customization.mjs';
const root=path.resolve(import.meta.dirname,'../../..'),out=path.join(import.meta.dirname,'assets');fs.mkdirSync(out,{recursive:true});
const db=JSON.parse(fs.readFileSync(path.join(root,'data/cards.json')));
const ids=['caocao','guanyu','liubei','sunquan','zhaoyun','diaochan','lvbu','shen_guanyu','zhangfei','machao','huangyueying','shen_caocao'];
const tiers=['R','R','N','SR','R','SR','SR','SSR','R','N','R','SSR'],prices=[2800,1800,1200,8600,2400,6800,7200,28500,2200,1600,3200,32000],owned=[3,1,8,2,4,0,2,1,5,1,2,0],available=[2,0,7,1,2,0,1,0,4,0,1,0];
const cards=ids.map((id,i)=>{const c=db.cards.find(c=>c.id===id);if(!c)throw Error('Missing card '+id);return {id,name:c.name,artUrl:'/img/'+c.img,rarity:tiers[i],ownedCount:owned[i],availableCount:available[i],price:prices[i],marketStock:[6,3,12,2,7,4,3,1,5,8,4,2][i],faction:{wei:'魏',shu:'蜀',wu:'吴',qun:'群',shen:'神'}[c.group]||c.group,theme:db.packs.find(p=>p.id===c.pack)?.name||c.pack,skills:c.skills.map(s=>({name:s.name,description:s.description}))};});
const themes=[
  ['standard','标准','初遇群英','#6faaa5','#2f575d',2400],['refresh','界限突破','锋芒再起','#ab8273','#5b393d',3100],
  ['shenhua','神话再临','风林火山','#9192b1','#474464',3600],['extra','神将','璀璨神域','#c6aa68','#6c5333',4800],
  ['yijiang','一将成名','名将列传','#7d9b74','#3e5945',3300],['mobile','移动版','掌上战歌','#869bbd','#3f5679',3900]
];
const products=[];
for(const [id,name,subtitle,light,dark,packPrice]of themes)for(const kind of ['pack','box']){
  const image=blank(kind==='pack'?64:96,96),d=painter(image),ink='#252d32',gold='#ddc68f',paper='#f0e7cf';
  if(kind==='pack'){
    d.poly([[6,2],[58,2],[56,12],[58,90],[54,95],[8,95],[5,89],[8,12]],ink);d.rect(8,5,48,87,dark);d.rect(10,14,44,68,light);
    d.poly([[10,18],[54,42],[54,76],[10,52]],dark);d.rect(8,5,48,8,gold);d.rect(8,83,48,8,gold);
    for(let x=10;x<56;x+=3){d.line(x,5,x,10,paper);d.line(x,87,x,91,dark);}
    d.line(12,17,51,17,gold);d.line(12,78,51,78,gold);
    d.poly([[32,25],[47,34],[47,60],[32,69],[17,60],[17,34]],ink);d.poly([[32,28],[44,35],[44,58],[32,65],[20,58],[20,35]],gold);
    d.poly([[32,33],[39,38],[37,53],[32,59],[27,53],[25,38]],dark);d.line(25,41,39,49,paper);d.line(39,41,25,49,paper);d.line(32,35,32,57,gold);d.rect(27,71,10,3,paper);
  }else{
    d.poly([[7,29],[36,9],[88,23],[59,43]],ink);d.poly([[7,29],[59,43],[59,88],[7,72]],ink);d.poly([[59,43],[88,23],[88,68],[59,88]],ink);
    d.poly([[10,30],[36,13],[84,25],[58,40]],light);d.poly([[10,33],[56,46],[56,83],[10,70]],dark);d.poly([[61,46],[84,29],[84,66],[61,83]],light);
    d.line(13,37,54,49,gold);d.line(13,66,54,78,gold);d.line(65,48,80,39,gold);d.line(65,74,80,65,gold);
    d.poly([[27,43],[43,48],[43,69],[27,64]],gold);d.poly([[30,48],[40,51],[40,63],[30,60]],dark);d.line(30,51,40,59,paper);d.line(40,54,30,58,paper);
    d.line(26,21,71,33,gold);d.line(29,18,74,30,gold);d.line(73,40,73,72,dark);d.rect(17,71,29,3,paper);
  }
  const file=id+'-'+kind+'.png';fs.writeFileSync(path.join(out,file),encodePng(image.width,image.height,image.data));
  products.push({id:id+'-'+kind,theme:id,name:name+' · '+(kind==='box'?'密封盒':'散包'),subtitle,kind,artUrl:'/frontend-next/experiments/card-trade/assets/'+file,unitPrice:kind==='pack'?packPrice:packPrice*22,stock:kind==='box'?12:48,packsPerBox:24,cardsPerPack:5,suggestedRetail:kind==='pack'?Math.round(packPrice*1.4):Math.round(packPrice*22*1.4),warehouse:kind==='box'?2:8,onShelf:kind==='box'?1:6,inTransit:0});
}
fs.mkdirSync(path.join(root,'frontend-next/mock'),{recursive:true});
fs.writeFileSync(path.join(root,'frontend-next/mock/trade-fixtures.mjs'),'// Mock only: not a v2 DTO or global rarity model. Amounts are integer cents.\n// Artwork and skill descriptions come from the existing card database; rarity, prices and holdings are invented UI fixtures.\nexport const cards = '+JSON.stringify(cards,null,2)+';\nexport const products = '+JSON.stringify(products,null,2)+';\nexport const initialBalance = 5620000;\n');
console.log(`Generated ${products.length} original pixel packages and ${cards.length} local card fixtures. Production data unchanged.`);
