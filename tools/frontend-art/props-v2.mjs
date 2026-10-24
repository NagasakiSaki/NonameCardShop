import {FACILITIES,paintFacility} from './facilities.mjs';
// 二倍原生采样的设施和装饰；地图仍使用 16 像素导航单位。
import {Img,mix,hash2} from './pixkit.mjs';
export const ART_SCALE=2,PROP_CELL=192;
export const TILES=['floor_wood_a','floor_wood_b','floor_tile','floor_carpet','wall_top','wall_base','wall_window','wall_door','wall_shadow','floor_rug_edge','floor_stone','floor_stone_b','wall_door_side','corner_nw','corner_ne','corner_sw','corner_se'];
export const PROPS=['counter_retail','counter_service','shelf','display_packs','display_boxes','trash','table','chair','lamp','sign','plant','rug','register','case_stack','door_mat','kiosk','bench','board','poster','sofa','tea','trophy','clock','speaker'];
const meta=(w,h,blocks=[],occludes=true)=>({w,h,footY:h,blocks,occludes});
export const PROP_META={
  counter_retail:meta(96,48,[[0,24,96,24]]),counter_service:meta(96,48,[[0,24,96,24]]),
  shelf:meta(64,56,[[0,40,64,16]]),display_packs:meta(64,48,[[0,28,64,20]]),display_boxes:meta(64,48,[[0,28,64,20]]),
  trash:meta(24,32,[[4,12,16,20]]),table:meta(64,48,[[0,16,64,32]]),chair:meta(20,24,[[4,12,12,12]]),
  lamp:meta(16,40,[],false),sign:meta(64,20,[],false),plant:meta(24,40,[[4,28,16,12]]),rug:meta(96,64,[],false),
  register:meta(24,24,[],false),case_stack:meta(32,32,[[0,16,32,16]]),door_mat:meta(32,24,[],false),
  kiosk:meta(80,64,[[0,44,80,20]]),bench:meta(64,32,[[0,16,64,16]]),board:meta(40,48,[[4,40,32,8]]),
  poster:meta(32,40,[],false),sofa:meta(96,40,[[0,16,96,24]]),tea:meta(32,32,[[0,16,32,16]]),
  trophy:meta(24,32,[[4,24,16,8]]),clock:meta(24,24,[],false),speaker:meta(24,40,[[0,24,24,16]])
};
const P={ink:'#303345',wood:'#806651',edge:'#c3a27a',cream:'#f3e8cd',gold:'#e5bd72',teal:'#568883',blue:'#5c7490',rose:'#b87880',purple:'#807293',glass:'#91c4c6'};
function kit(c){return {
  r:(x,y,w,h,color)=>c.rect(Math.round(x*2),Math.round(y*2),Math.round(w*2),Math.round(h*2),color),
  e:(x,y,rx,ry,color)=>c.ellipse(x*2,y*2,rx*2,ry*2,color),
  d:(x,y,color)=>c.px(Math.round(x*2),Math.round(y*2),color),
};}
function panel(k,x,y,w,h,c){k.r(x,y,w,h,P.ink);k.r(x+1,y+1,w-2,h-2,c);k.r(x+2,y+1,w-4,.5,mix(c,'#fff5d8',.35));k.r(x+w-2,y+2,1,h-3,mix(c,P.ink,.25));}
function pack(k,x,y,c,w=6,h=10){panel(k,x,y,w,h,c);k.r(x+1,y+1,w-2,1,P.gold);k.r(x+1,y+h-2,w-2,.5,P.cream);k.r(x+w/2-1,y+3,2,3,P.cream);k.d(x+w/2,y+4,P.gold);}
function wood(k,x,y,w,h,c=P.wood){panel(k,x,y,w,h,c);for(let yy=y+3;yy<y+h-2;yy+=4){k.r(x+2,yy,w-4,.5,mix(c,P.ink,.12));for(let xx=x+4;xx<x+w-4;xx+=13)k.r(xx,yy+1,6,.5,mix(c,P.edge,.18));}}
for(const f of FACILITIES){PROPS.push(f.id);const {id,...meta}=f;PROP_META[f.id]=meta;}
function prop(name){
  if(name.startsWith('pa_'))return paintFacility(name);
  const c=new Img(PROP_CELL,PROP_CELL),k=kit(c),m=PROP_META[name];
  // 接触阴影有低对比软边，避免家具像贴纸悬浮。
  if(m.blocks.length){k.e(m.w/2,m.h-2,m.w/2-1,3,[35,30,40,45]);}
  if(name==='counter_service'||name==='counter_retail'){
    wood(k,0,16,96,30);k.r(2,18,92,3,P.edge);k.r(2,40,92,3,'#5d5148');
    for(const x of [5,36,67]){panel(k,x,24,25,15,'#967963');k.r(x+10,26,6,1,P.gold);}
    panel(k,0,9,96,12,'#d7c6a4');k.r(2,10,92,2,'#f5e9d1');k.r(4,13,88,5,'#739a99');
    panel(k,61,0,22,13,'#465364');k.r(64,2,15,6,'#9ed4c2');k.r(65,3,9,.5,P.cream);k.r(68,12,10,2,P.ink);
    panel(k,8,5,29,12,name==='counter_service'?P.teal:P.rose);for(let i=0;i<3;i++)pack(k,11+i*8,6,['#c96976','#798fa7','#b5a368'][i],6,9);
    k.r(42,11,13,5,'#f2e5c7');k.r(44,12,9,.5,P.wood);
  }else if(name==='shelf'){
    wood(k,0,0,64,54,'#87735c');k.r(4,4,56,45,'#433d3f');
    for(let row=0;row<3;row++){const y=5+row*15;for(let col=0;col<7;col++)pack(k,6+col*7.5,y,['#a45e76','#5e8b9c','#b99a68','#83859b'][(row+col)%4],6,11);k.r(3,y+12,58,3,P.edge);k.r(7,y+13,8,1,P.cream);}
    k.r(2,52,5,3,P.ink);k.r(57,52,5,3,P.ink);
  }else if(name==='display_packs'||name==='display_boxes'){
    wood(k,0,24,64,22);panel(k,2,0,60,27,name==='display_packs'?'#507a80':'#7e6986');
    for(let r=0;r<2;r++)for(let i=0;i<6;i++)pack(k,5+i*9,3+r*11,['#c56876','#c3a264','#749fa8','#8e85ad'][i%4],7,10);
    k.r(3,25,58,3,P.gold);panel(k,5,33,24,7,P.cream);k.r(8,35,16,.5,P.wood);k.r(8,37,9,.5,P.wood);k.r(34,32,23,10,'#64546d');k.r(37,34,17,2,P.gold);
  }else if(name==='kiosk'){
    wood(k,0,38,80,25);panel(k,2,3,76,40,'#415b6b');panel(k,7,7,66,28,'#84b9ba');
    for(let i=0;i<6;i++)pack(k,11+i*10,11,['#8d729e','#cba26c','#779ba7'][i%3],8,18);
    k.r(7,36,66,3,P.gold);panel(k,48,43,24,9,'#364758');k.r(51,45,17,3,'#a9d9c6');
    k.r(9,48,28,1,P.edge);k.r(9,54,23,1,P.edge);
  }else if(name==='trash'){
    panel(k,3,6,19,24,'#6e9a8e');k.r(4,8,16,2,'#abcfba');k.r(7,10,11,7,'#253e42');k.r(0,4,24,4,'#b1ccbb');
    k.r(6,19,12,7,'#ddedcc');k.r(10,20,3,2,P.teal);k.r(8,22,7,1,P.teal);k.r(12,24,3,1,P.teal);k.r(4,29,17,2,P.ink);
  }else if(name==='table'){
    k.r(5,31,5,15,P.wood);k.r(54,31,5,15,P.wood);wood(k,0,6,64,28);panel(k,3,8,58,22,'#496e69');k.r(5,10,54,18,'#567b73');k.r(31,11,.5,16,'#b9c4a1');
    for(const [x,y]of [[10,12],[41,18]]){pack(k,x,y,'#3e465c',8,12);pack(k,x+9,y,'#bfa267',8,12);}k.r(26,15,7,5,P.cream);k.d(29,17,P.gold);
  }else if(name==='chair'){
    wood(k,2,0,16,22);panel(k,3,2,14,12,P.rose);k.r(2,15,17,4,'#b37e80');k.r(3,19,3,5,P.wood);k.r(15,19,3,5,P.wood);
  }else if(name==='sofa'||name==='bench'){
    const w=m.w;panel(k,0,6,w,m.h-8,'#506a72');panel(k,3,2,w-6,18,'#708e92');
    for(let x=6;x<w-6;x+=24){panel(k,x,7,21,12,'#7d9a9c');panel(k,x,20,21,10,'#92a9a6');}k.r(0,16,5,17,'#4b666f');k.r(w-5,16,5,17,'#4b666f');
    k.r(5,m.h-3,6,3,P.wood);k.r(w-11,m.h-3,6,3,P.wood);
  }else if(name==='plant'){
    panel(k,5,27,15,12,'#b18a70');k.r(4,27,17,3,'#d4ae84');k.r(11,9,2,20,'#496755');
    for(const [x,y,rx,ry]of [[7,19,6,5],[17,16,6,6],[10,10,7,7],[17,6,5,5]]){k.e(x,y,rx,ry,'#476b5c');k.e(x-1,y-1,rx-1,ry-1,'#779477');k.r(x,y-2,.5,5,'#b1ba8a');}
  }else if(name==='poster'){
    wood(k,0,0,32,39,'#685a57');panel(k,2,2,28,34,'#e4d7bf');k.r(4,4,24,16,P.purple);k.r(8,8,5,12,P.gold);k.r(17,6,7,14,P.rose);k.r(6,23,20,2,P.ink);k.r(8,28,16,1,P.wood);k.r(11,32,10,1,P.wood);
  }else if(name==='board'){
    wood(k,0,0,40,43);panel(k,3,3,34,34,'#4f706c');for(const [x,y]of [[7,7],[23,9],[9,23]]){panel(k,x,y,11,12,P.cream);k.r(x+2,y+3,7,.5,P.rose);k.r(x+2,y+6,6,.5,P.wood);}k.r(5,42,3,6,P.wood);k.r(32,42,3,6,P.wood);
  }else if(name==='sign'){
    panel(k,0,0,64,18,'#3b5965');k.r(3,3,58,.5,P.gold);k.r(3,14,58,.5,P.gold);for(let x=9;x<58;x+=12)pack(k,x,5,P.rose,7,7);
  }else if(name==='rug'||name==='door_mat'){
    panel(k,0,0,m.w,m.h,'#7d666c');k.r(2,2,m.w-4,m.h-4,'#b5a28b');k.r(4,4,m.w-8,m.h-8,'#668a87');
    for(let y=7;y<m.h-5;y+=4)for(let x=6;x<m.w-5;x+=4)k.d(x,y,'#8caaa0');
  }else if(name==='lamp'){
    k.e(8,38,7,2,P.ink);k.r(7,9,2,28,'#8f8a80');panel(k,1,2,14,10,'#e9c783');k.r(3,3,10,5,'#fff1c3');
  }else if(name==='register'){
    panel(k,0,4,24,15,'#3f4a5b');panel(k,3,0,19,12,'#2d3e4c');k.r(5,2,15,7,'#9bcebc');k.r(1,18,22,5,'#b8b8ad');
  }else if(name==='tea'){
    wood(k,0,10,32,20);panel(k,2,6,28,11,'#c5ad85');k.e(11,10,5,4,P.cream);k.e(11,9,3,2,'#9b674a');k.r(20,7,7,6,'#a1b5ad');k.r(22,4,3,3,P.cream);
  }else if(name==='trophy'){
    k.r(5,24,15,6,P.wood);k.r(10,14,5,11,P.gold);panel(k,4,3,17,12,P.gold);k.r(7,4,11,6,'#ffe5a3');k.r(1,5,3,7,P.gold);k.r(21,5,3,7,P.gold);
  }else if(name==='clock'){
    k.e(12,12,11,11,P.wood);k.e(12,12,9,9,P.cream);k.r(11,5,1,8,P.ink);k.r(12,12,5,1,P.ink);for(const [x,y]of [[11,3],[3,11],[20,11],[11,20]])k.r(x,y,2,2,P.gold);
  }else if(name==='speaker'){
    panel(k,0,0,24,38,'#354555');for(const [y,r]of [[11,6],[27,8]]){k.e(12,y,r,r,'#212b3c');k.e(12,y,r-2,r-2,'#5b6572');k.e(12,y,2,2,P.ink);}
  }else if(name==='case_stack'){
    for(const [x,y]of [[2,16],[9,5]]){panel(k,x,y,23,15,'#80768e');k.r(x+2,y+2,19,1,P.gold);k.r(x+9,y+6,5,2,P.cream);}
  }
  return c;
}
export function buildProps(){const sheet=new Img(PROP_CELL*4,PROP_CELL*Math.ceil(PROPS.length/4));PROPS.forEach((name,i)=>sheet.blit(prop(name),(i%4)*PROP_CELL,Math.floor(i/4)*PROP_CELL));return sheet;}
export function buildTileset(){
  const sheet=new Img(32*8,32*Math.ceil(TILES.length/8));
  TILES.forEach((name,i)=>{
    const t=new Img(32,32),k=kit(t),wall=name.includes('wall')||name.includes('corner');
    for(let y=0;y<32;y++)for(let x=0;x<32;x++){
      let color=wall?'#e1d6bc':name.includes('carpet')?'#688780':name.includes('stone')||name==='floor_tile'?'#aaa997':'#a18c75';
      const n=hash2(x,y,i+7);color=mix(color,n>.5?'#fff4d8':'#534d4d',wall?.015:.035);
      if(!wall&&name.includes('wood')){if(y===15||y===31)color='#8a7766';if((y<16?x===8:x===24))color='#93806d';if(y===0||y===16)color='#b3a18a';}
      t.px(x,y,color);
    }
    if(wall){k.r(0,12,16,4,'#667c78');k.r(0,12,16,.5,'#b3c0a6');if(name==='wall_base'){k.r(0,0,16,16,'#657b76');k.r(0,1,16,1,'#8ea495');k.r(0,14,16,2,'#405853');}if(name==='wall_window'){panel(k,1,1,14,11,'#8aafa9');k.r(2,2,12,8,'#bbd7cb');k.r(8,1,1,10,P.cream);k.r(1,7,14,.5,P.cream);k.r(3,3,3,1,'#e8f0d5');}}
    sheet.blit(t,(i%8)*32,Math.floor(i/8)*32);
  });return sheet;
}
export {buildGlow,buildBlobShadow} from './props.mjs';
