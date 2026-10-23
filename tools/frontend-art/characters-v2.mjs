// 原生 48×64；外形参考乐队动画的发型与配色，经营身份独立配置。
import {Img,mix} from './pixkit.mjs';
export const FRAME_W=48,FRAME_H=64,ANCHOR=[24,60];
export const DIRECTIONS=['down','left','right','up'],WALK_COLUMNS=[0,1,2,1];
const ink='#262137',skin='#ffe0cb',shade='#dda993',white='#fff8ed';
export const CHARACTERS=[
  {id:'owner',name:'店长',role:'店主',hair:'#846055',hairLight:'#b48975',hairStyle:'short',top:'#477e77',accent:'#f4d186',accessory:'apron',traits:['卷袖衬衫','奶油围裙','铜钥匙'],skinTone:'fair'},
  {id:'rookie',name:'新手顾客',role:'新手玩家',hair:'#936348',hairLight:'#c38c61',hairStyle:'cat',top:'#b84c57',accent:'#f1c75d',accessory:'starter',reference:'户山香澄：猫耳感发束、棕发与星形饰物',traits:['猫耳发束','星形发夹','入门盒'],skinTone:'fair'},
  {id:'collector',name:'收藏顾客',role:'收藏家',hair:'#b5b4ce',hairLight:'#e1ddec',hairStyle:'long',top:'#65538d',accent:'#b9a0ef',accessory:'binder',reference:'凑友希那：银紫长发与深紫服装',traits:['银紫长发','紫色蝴蝶结','收藏册'],skinTone:'fair'},
  {id:'competitor',name:'竞技顾客',role:'竞技玩家',hair:'#38394a',hairLight:'#5e6072',hairStyle:'bob',top:'#3e485c',accent:'#e25b66',accessory:'deck',reference:'美竹兰：深色短发、红色挑染',traits:['红色挑染','格纹裙摆','竞技牌盒'],skinTone:'fair'},
  {id:'passerby',name:'休闲顾客',role:'休闲玩家',hair:'#a4bbc0',hairLight:'#d5e7df',hairStyle:'bob',top:'#c1a47d',accent:'#6da6a0',accessory:'bag',reference:'青叶摩卡：灰绿短发、宽松外套',traits:['灰绿短发','宽松连帽衫','斜挎包'],skinTone:'fair'},
  {id:'regular',name:'常来顾客',role:'熟客',hair:'#d883a4',hairLight:'#f2b1c7',hairStyle:'twin',top:'#fff1dc',accent:'#e48da4',accessory:'ribbon',reference:'丸山彩：粉色双马尾与粉白配色',traits:['粉色双马尾','白色针织衫','粉色蝴蝶结'],skinTone:'fair'},
  {id:'bigspender',name:'高预算顾客',role:'大客户',hair:'#d8b56c',hairLight:'#ffe3a0',hairStyle:'long',top:'#a04e65',accent:'#f2ca65',accessory:'case',reference:'弦卷心：金色长发与鲜明红金配色',traits:['金色长发','红色披肩','金扣收藏箱'],skinTone:'fair'},
];
function star(im,x,y,c){im.rect(x-1,y-3,3,7,c).rect(x-3,y-1,7,3,c).px(x-2,y-2,c).px(x+2,y-2,c);}
function hairBack(im,s,bob=0){
  const long=s.hairStyle==='long';
  im.ellipse(24,16+bob,13,13,s.hair);
  if(long){im.rect(12,16+bob,24,25,s.hair);im.rect(13,24+bob,2,18,mix(s.hair,ink,.22));im.rect(32,23+bob,3,17,mix(s.hair,ink,.25));}
  if(s.hairStyle==='twin')for(const x of [6,34]){im.ellipse(x+4,23+bob,4,10,s.hair).rect(x+1,22+bob,6,11,s.hair);im.rect(x+1,18+bob,6,2,s.accent);}
  if(s.hairStyle==='cat')for(const x of [13,29]){im.rect(x,4+bob,6,8,s.hair).rect(x+1,1+bob,3,7,s.hair);im.px(x+2,1+bob,s.hairLight);}
}
function actor(s,dir,col){
  const im=new Img(FRAME_W,FRAME_H),walk=col===1?0:col===0?-1:1,bob=walk?1:0,side=dir==='left'||dir==='right',back=dir==='up';
  // 清晰的发束、衣摆、双腿和手臂轮廓，走路时交替摆动。
  hairBack(im,s,bob);
  im.rect(17,46,6,11+walk,ink).rect(26,46,6,11-walk,ink);
  im.rect(16,55+walk,8,4,s.accent).rect(25,55-walk,8,4,s.accent);
  im.rect(16,58+walk,9,2,ink).rect(25,58-walk,9,2,ink);
  im.rect(14,30+bob,22,19,s.top).rect(14,33+bob,3,14,mix(s.top,white,.2)).rect(33,34+bob,3,14,mix(s.top,ink,.25));
  im.rect(16,46+bob,18,4,mix(s.top,ink,.18));
  im.rect(10,31+bob-walk,5,14,s.top).rect(34,31+bob+walk,5,14,s.top);
  im.rect(10,43+bob-walk,5,5,skin).rect(34,43+bob+walk,5,5,skin);
  im.rect(11,45+bob-walk,3,3,shade).rect(35,45+bob+walk,3,3,shade);
  im.rect(21,27+bob,7,5,shade);
  if(!back){
    im.ellipse(24,19+bob,10,11,skin).rect(15,17+bob,2,9,'#ffebd8').rect(32,19+bob,2,7,shade);
    if(side){im.rect(15,19+bob,4,4,white).rect(15,20+bob,2,3,s.accent).px(15,20+bob,ink).px(14,23+bob,shade).rect(16,27+bob,3,1,'#a56e78');}
    else{for(const x of [18,27]){im.rect(x,19+bob,5,5,white).rect(x+1,20+bob,3,4,s.accent).rect(x+1,21+bob,2,3,ink).px(x+1,20+bob,white).rect(x,18+bob,5,1,ink);}im.rect(22,27+bob,4,1,'#b77b83').px(24,25+bob,shade).rect(16,25+bob,3,1,'#edb2ad').rect(30,25+bob,3,1,'#edb2ad');}
  }
  im.ellipse(24,12+bob,12,8,s.hair);im.rect(12,11+bob,25,7,s.hair);
  im.rect(14,8+bob,7,2,s.hairLight).rect(17,6+bob,12,1,mix(s.hairLight,white,.2));
  for(const [x,y,h]of [[14,14,9],[18,14,5],[23,14,3],[28,14,6],[33,14,12]])im.rect(x,y+bob,3,h,s.hair);
  im.rect(13,18+bob,3,s.hairStyle==='long'?18:8,s.hair).rect(34,16+bob,3,s.hairStyle==='long'?21:10,s.hair);
  for(const x of [14,35])im.rect(x,18+bob,1,s.hairStyle==='long'?18:6,s.hairLight);
  if(back){im.ellipse(24,18+bob,11,12,s.hair);for(const x of [17,23,29])im.rect(x,10+bob,1,17,s.hairLight);if(s.hairStyle==='long')im.rect(15,26+bob,19,12,s.hair);}
  if(s.id==='competitor'){im.rect(14,9+bob,3,13,s.accent).rect(17,12+bob,1,7,'#ff9a9a');}
  if(s.id==='rookie')star(im,33,16+bob,s.accent);
  if(!back){
    // 领口、衣料褶皱与各类型独立的标志物。
    im.rect(20,31+bob,9,2,white).rect(23,33+bob,3,6,s.accent);
    im.rect(18,40+bob,1,7,mix(s.top,ink,.15)).rect(30,38+bob,1,8,mix(s.top,white,.2));
    if(s.accessory==='apron'){im.rect(18,34+bob,14,15,'#eee0be').rect(16,43+bob,18,8,'#eee0be').rect(22,41+bob,7,5,'#c2ad8f').rect(22,41+bob,7,1,'#fff1ce');im.rect(34,47,2,5,'#eac470');}
    if(s.accessory==='binder'||s.accessory==='case'){const color=s.accessory==='binder'?'#44355e':'#654155';im.rect(34,37+bob,10,15,color).rect(35,38+bob,8,1,s.accent).rect(37,35+bob,4,2,ink).rect(39,43+bob,2,2,s.accent);im.rect(35,40+bob,1,9,mix(color,white,.3));}
    if(s.accessory==='starter'||s.accessory==='deck'){im.rect(7,40+bob,10,12,s.accent).rect(8,41+bob,8,2,white).rect(9,45+bob,6,5,s.top).px(12,47+bob,white);}
    if(s.accessory==='bag'){im.rect(16,32+bob,2,15,ink).rect(13,43+bob,10,8,s.accent).rect(15,44+bob,7,1,white);}
    if(s.accessory==='ribbon'){im.rect(19,32+bob,4,3,s.accent).rect(26,32+bob,4,3,s.accent).rect(23,33+bob,3,6,s.accent);}
    if(s.id==='collector'){im.rect(19,33+bob,5,3,s.accent).rect(26,33+bob,5,3,s.accent);}
  }
  // 1 个原生像素的外轮廓，不用旧图放大冒充新细节。
  im.outline(ink);
  if(dir==='right'){const out=new Img(FRAME_W,FRAME_H);out.blit(im,0,0,{flipX:true});return out;}
  return im;
}
export function drawActorSheet(s){const out=new Img(FRAME_W*3,FRAME_H*4);DIRECTIONS.forEach((d,y)=>{for(let x=0;x<3;x++)out.blit(actor(s,d,x),x*FRAME_W,y*FRAME_H);});return out;}
export function drawPortrait(s){
  const im=new Img(128,128),head=actor(s,'down',1),crop=new Img(42,43);
  for(let y=0;y<43;y++)for(let x=0;x<42;x++){const i=(y*head.w+x+3)*4;crop.px(x,y,[...head.data.slice(i,i+4)]);}
  im.blit(crop.scale(3),1,0);return im;
}
