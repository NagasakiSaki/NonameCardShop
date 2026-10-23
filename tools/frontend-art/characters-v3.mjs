// 96×128 原生绘制。正面、侧面、背面独立造型，侧脸最后绘制眼睛与鼻尖。
import {Img,mix} from './pixkit.mjs';
import {CHARACTERS as DESIGNS} from './characters-v2.mjs';
export const FRAME_W=96,FRAME_H=128,ANCHOR=[48,120],DISPLAY_SCALE=.38,PORTRAIT_SIZE=256;
export const DIRECTIONS=['down','left','right','up'],WALK_COLUMNS=[0,1,2,1];
export const CHARACTERS=DESIGNS.map(s=>({...s,iris:({owner:'#6f9f80',rookie:'#b68b4e',collector:'#a188d5',competitor:'#bd5c72',passerby:'#79aaa3',regular:'#c47ca4',bigspender:'#75aeb7'})[s.id]}));
const INK='#292637',SKIN='#ffe0cd',SKIN_LIT='#ffeedb',SKIN_SHADE='#dba494',WHITE='#fff9f0';
function stroke(im,points,color,width=1){for(let j=1;j<points.length;j++){const a=points[j-1],b=points[j],n=Math.max(1,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])));for(let i=0;i<=n;i++)im.ellipse(a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n,width/2,width/2,color);}}
function oval(im,x,y,rx,ry,base,light=base){
  for(let yy=Math.floor(y-ry);yy<=y+ry;yy++)for(let xx=Math.floor(x-rx);xx<=x+rx;xx++){const dx=(xx-x)/rx,dy=(yy-y)/ry;if(dx*dx+dy*dy<=1)im.px(xx,yy,mix(base,light,Math.round(Math.max(0,1-(dx+1)/2)*4)/4*.32));}
}
function star(im,x,y,size,color){const p=[];for(let i=0;i<10;i++){const a=-Math.PI/2+i*Math.PI/5,r=i%2?size*.45:size;p.push([x+Math.cos(a)*r,y+Math.sin(a)*r]);}for(let yy=y-size;yy<=y+size;yy++)for(let xx=x-size;xx<=x+size;xx++){let inside=false;for(let i=0,j=p.length-1;i<p.length;j=i++)if((p[i][1]>yy)!==(p[j][1]>yy)&&xx<(p[j][0]-p[i][0])*(yy-p[i][1])/(p[j][1]-p[i][1])+p[i][0])inside=!inside;if(inside)im.px(xx,yy,color);}}
function ribbon(im,x,y,c){oval(im,x-5,y,5,3,c,WHITE);oval(im,x+5,y,5,3,c,WHITE);im.rect(x-1,y-2,3,5,mix(c,INK,.2));stroke(im,[[x-2,y+2],[x-4,y+9]],c,2);stroke(im,[[x+2,y+2],[x+4,y+8]],c,2);}
function hairMass(im,s,bob,side=false){
  const h=s.hair,l=s.hairLight,long=s.hairStyle==='long',cx=side?43:48;
  oval(im,cx,31+bob,side?20:24,25,h,l);
  if(long){oval(im,side?36:48,59+bob,side?14:24,28,h,l);im.rect(side?25:26,35+bob,side?22:44,37,h);}
  if(s.hairStyle==='twin')for(const x of side?[26]:[15,80]){oval(im,x,42+bob,9,23,h,l);oval(im,x-1,63+bob,7,12,h,l);ribbon(im,x,26+bob,s.accent);}
  if(s.hairStyle==='cat')for(const x of side?[37]:[30,61]){stroke(im,[[x-5,14+bob],[x,1+bob],[x+6,18+bob]],h,7);stroke(im,[[x-2,9+bob],[x,4+bob]],l,2);}
  // 多束头发的高光沿轮廓走向，避免整块同色几何体。
  for(let i=0;i<6;i++){const x=(side?26:29)+i*(side?5:7);stroke(im,[[x,16+bob],[x-2,29+bob],[x-1,46+bob]],i%2?mix(h,l,.45):mix(h,INK,.17));}
  if(long)for(let i=0;i<6;i++){const x=(side?27:29)+i*(side?3:7);stroke(im,[[x,38+bob],[x+1,57+bob],[x+(i%2?2:-1),79+bob]],i%2?mix(h,l,.4):mix(h,INK,.16));}
}
function eye(im,s,x,y,side=false){
  im.rect(x,y,side?6:8,7,WHITE);im.rect(x+2,y+1,4,6,s.iris);im.rect(x+3,y+2,2,4,INK);im.rect(x+2,y+1,2,2,WHITE);stroke(im,[[x-1,y],[x+2,y-1],[x+(side?6:8),y]],INK,1);im.px(x+7,y-1,INK);
}
function head(im,s,dir,bob){
  const side=dir==='right',back=dir==='up';oval(im,side?43:48,31+bob,side?20:24,25,s.hair,s.hairLight);
  if(back){
    oval(im,48,32+bob,23,25,s.hair,s.hairLight);for(let i=0;i<7;i++)stroke(im,[[29+i*6,17+bob],[28+i*6,34+bob],[30+i*6,52+bob]],i%2?mix(s.hair,s.hairLight,.5):mix(s.hair,INK,.18));
    if(s.hairStyle==='long')for(let i=0;i<7;i++)stroke(im,[[29+i*6,45+bob],[29+i*6,64+bob],[31+i*6,80+bob]],i%2?s.hairLight:mix(s.hair,INK,.15));
    return;
  }
  if(side){
    // 轮廓包含下巴、突出的鼻尖和一只可见的眼睛，躯干亦有独立的侧面宽度。
    oval(im,48,37+bob,17,22,SKIN,SKIN_LIT);im.rect(62,36+bob,6,5,SKIN);im.px(68,39+bob,SKIN_SHADE);
    oval(im,40,39+bob,4,6,SKIN_SHADE,SKIN);im.rect(40,38+bob,2,4,SKIN);
    oval(im,42,19+bob,21,12,s.hair,s.hairLight);im.rect(24,18+bob,14,34,s.hair);
    stroke(im,[[39,20+bob],[48,24+bob],[55,26+bob],[60,28+bob]],s.hair,6);
    stroke(im,[[29,18+bob],[28,33+bob],[30,49+bob]],s.hairLight,2);
    im.rect(29,43+bob,8,s.hairStyle==='long'?33:13,s.hair);
    if(s.id==='competitor')stroke(im,[[43,15+bob],[46,22+bob],[48,28+bob]],s.accent,4);
    if(s.id==='rookie')star(im,36,24+bob,5,s.accent);
    // 眼睛在发型之后绘制；不会再被正面鬓发覆盖。
    eye(im,s,56,32+bob,true);stroke(im,[[62,47+bob],[65,46+bob]],'#af7480');im.rect(59,43+bob,4,1,'#edb5b0');
    return;
  }
  oval(im,48,36+bob,20,23,SKIN,SKIN_LIT);oval(im,28,38+bob,3,5,SKIN_SHADE,SKIN);oval(im,68,38+bob,3,5,SKIN_SHADE,SKIN);
  oval(im,48,18+bob,24,13,s.hair,s.hairLight);
  const bangs=s.hairStyle==='bob'?[[30,23,6,18],[37,24,7,9],[46,24,7,5],[56,23,6,10],[64,21,5,29]]:[[27,23,6,24],[34,23,7,10],[42,23,7,7],[51,23,7,9],[60,22,6,14],[65,22,5,29]];
  for(const [x,y,w,h]of bangs){im.rect(x,y+bob,w,h,s.hair);stroke(im,[[x+1,y+bob],[x+1,y+h-2+bob]],mix(s.hair,s.hairLight,.45));}
  for(const [x,y,w]of [[31,13,10],[41,10,13],[56,13,9]])im.rect(x,y+bob,w,2,s.hairLight);
  if(s.id==='competitor'){stroke(im,[[31,16+bob],[33,27+bob],[34,38+bob]],s.accent,5);im.rect(34,19+bob,1,12,'#f69ca7');}
  if(s.id==='rookie')star(im,66,26+bob,6,s.accent);
  eye(im,s,34,34+bob);eye(im,s,54,34+bob);im.rect(35,45+bob,5,1,'#edb3ad');im.rect(58,45+bob,5,1,'#edb3ad');im.rect(48,44+bob,2,3,SKIN_SHADE);stroke(im,[[44,51+bob],[48,52+bob],[52,51+bob]],'#ab6f7a');
}
function body(im,s,dir,walk,bob){
  const side=dir==='right',back=dir==='up',top=s.top,dark=mix(top,INK,.3),light=mix(top,WHITE,.23),skirt=s.id!=='owner'&&s.id!=='passerby';
  const legs=side?[[44,walk],[49,-walk]]:[[35,walk],[53,-walk]];
  for(const [x,step]of legs){im.rect(x,99,9,19+step*3,back?'#4d485b':'#514858');im.rect(x+1,102,3,11,mix('#514858',WHITE,.16));im.rect(x-2,116+step*3,13,5,INK);im.rect(x-1,116+step*3,10,2,s.id==='owner'?'#ae9376':s.accent);}
  if(side){oval(im,46,78+bob,12,17,top,light);im.rect(36,71+bob,23,31,top);im.rect(36,81+bob,4,19,dark);im.rect(54,73+bob,4,24,light);}
  else{oval(im,48,77+bob,20,17,top,light);im.rect(29,71+bob,38,31,top);im.rect(30,80+bob,4,21,light);im.rect(63,78+bob,4,24,dark);}
  im.rect(side?43:42,56+bob,side?9:13,11,SKIN_SHADE);im.rect(side?44:43,57+bob,side?7:10,8,SKIN);
  // 身体的衣褶、裙摆、侧面手臂和脚步各自运动。
  if(skirt){im.rect(side?36:27,94+bob,side?24:42,10,dark);for(let x=side?39:31;x<(side?58:66);x+=6)stroke(im,[[x,95+bob],[x-1,103+bob]],light);}
  const arms=side?[[42,-walk],[50,walk]]:[[23,-walk],[67,walk]];
  for(const [x,step]of arms){oval(im,x+3,78+bob+step*2,5,12,top,light);im.rect(x,77+bob+step*2,7,19,top);im.rect(x,91+bob+step*3,7,9,SKIN);im.rect(x+1,96+bob+step*3,4,5,SKIN_SHADE);im.rect(x,88+bob+step*2,7,3,WHITE);}
  if(back){stroke(im,[[side?47:48,70+bob],[side?47:48,97+bob]],dark);if(s.accessory==='apron'){im.rect(31,81+bob,34,3,'#e4d1ad');ribbon(im,49,84+bob,'#e9d9b5');}return;}
  if(side){
    stroke(im,[[56,70+bob],[57,86+bob]],s.accent,2);
    if(s.accessory==='apron'){im.rect(54,73+bob,6,27,'#ecdebe');im.rect(48,89+bob,11,12,'#ecdebe');stroke(im,[[53,84+bob],[53,96+bob]],'#bdac8c');}
  }else{
    stroke(im,[[36,65+bob],[45,72+bob],[48,67+bob],[51,72+bob],[61,65+bob]],WHITE,2);
    for(const y of [77,84,91])im.rect(47,y+bob,2,2,s.accent);
    for(const x of [35,59])stroke(im,[[x,77+bob],[x-2,87+bob],[x-1,96+bob]],dark);
    if(s.accessory==='apron'){im.rect(37,72+bob,22,27,'#eee0bf');im.rect(32,91+bob,31,13,'#eee0bf');im.rect(42,84+bob,13,9,'#c8b494');im.rect(43,85+bob,11,1,WHITE);stroke(im,[[37,70+bob],[37,99+bob]],'#d5c5a4');im.rect(62,98+bob,2,8,'#d9b268');im.rect(64,101+bob,5,2,'#e9cb89');}
    if(s.accessory==='ribbon'||s.id==='collector')ribbon(im,48,72+bob,s.accent);
    if(s.id==='competitor'){for(let y=97;y<104;y+=3)im.rect(28,y+bob,39,1,s.accent);for(let x=31;x<65;x+=7)im.rect(x,95+bob,1,9,mix(s.accent,WHITE,.3));}
    if(s.id==='passerby'){stroke(im,[[33,67+bob],[42,77+bob],[58,98+bob]],INK,3);im.rect(39,72+bob,2,8,s.accent);}
    if(s.id==='bigspender'){stroke(im,[[29,68+bob],[36,80+bob],[60,80+bob],[67,68+bob]],s.accent,2);im.rect(31,81+bob,3,17,s.accent);im.rect(62,81+bob,3,17,s.accent);}
  }
  if(['binder','case','starter','deck','bag'].includes(s.accessory)){
    const x=side?54:(['starter','deck','bag'].includes(s.accessory)?15:68),y=84+bob+walk,color=['case','binder'].includes(s.accessory)?'#59435f':s.accent;
    im.rect(x,y,17,23,INK);im.rect(x+1,y+1,15,21,color);im.rect(x+2,y+2,13,2,mix(color,WHITE,.35));im.rect(x+7,y+9,4,3,'#e8ca7f');im.rect(x+3,y+5,1,14,mix(color,WHITE,.22));
    if(['case','binder'].includes(s.accessory))stroke(im,[[x+5,y],[x+5,y-4],[x+12,y-4],[x+12,y]],INK,2);
    else {im.rect(x+3,y+7,10,10,s.top);star(im,x+8,y+12,3,WHITE);}
  }
}
export function drawActorFrame(s,dir,col){
  const im=new Img(FRAME_W,FRAME_H),walk=col===1?0:col===0?-1:1,bob=walk?1:0,d=dir==='left'?'right':dir;
  // 长发从背后垂下，头部覆盖衣领；侧面与正面没有共用脸部矩形。
  hairMass(im,s,bob,d==='right');body(im,s,d,walk,bob);head(im,s,d,bob);im.outline(INK);
  if(dir==='left'){const mirrored=new Img(FRAME_W,FRAME_H);mirrored.blit(im,0,0,{flipX:true});return mirrored;}return im;
}
export function drawActorSheet(s){const out=new Img(FRAME_W*3,FRAME_H*4);DIRECTIONS.forEach((d,y)=>{for(let x=0;x<3;x++)out.blit(drawActorFrame(s,d,x),x*FRAME_W,y*FRAME_H);});return out;}
export function drawPortrait(s){
  const frame=drawActorFrame(s,'down',1),crop=new Img(80,84);for(let y=0;y<84;y++)for(let x=0;x<80;x++){const i=(y*FRAME_W+x+8)*4;crop.px(x,y,Array.from(frame.data.slice(i,i+4)));}const out=new Img(PORTRAIT_SIZE,PORTRAIT_SIZE);out.blit(crop.scale(3),8,2);return out;
}
