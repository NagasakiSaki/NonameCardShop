// Editable native 128x224 pixel standing art. Costume geometry is independent of the 64x64 walk cycle.
// Facial/hair masks retain Viktor Hahn's credit; costume pixels and long-hair geometry are project additions.
import {blank,blend,painter,recolor} from './pixel-customization.mjs';
import {portraitLayers,colorizeLayer} from './appearance-data.mjs';
import {CHARACTER_AUDIT} from '../../data/character-audit.mjs';
const COSTUME_OWNERS=Object.fromEntries(Object.entries(CHARACTER_AUDIT).map(([id,c])=>[c.costume,id]));
const costumeId=c=>COSTUME_OWNERS[c.costume]||c.id.slice(3);
export const PORTRAIT_SIZE=[128,224];
const INK='#333140',SKIN='#ffe4d0',SKIN_SHADE='#c79288',WHITE='#faf8f1',WHITE_SHADE='#c4ccd6',BLACK='#2e2c39',GOLD='#dfbd77',RED='#9c4057',TEAL='#87cbd3';
function kit(im){
  const d=painter(im),poly=(p,c,edge=INK)=>{d.poly(p,c);if(edge)for(let i=0;i<p.length;i++)d.line(...p[i],...p[(i+1)%p.length],edge);};
  const ellipse=(x,y,rx,ry,c,edge)=>poly(Array.from({length:20},(_,i)=>[Math.round(x+Math.cos(i*Math.PI/10)*rx),Math.round(y+Math.sin(i*Math.PI/10)*ry)]),c,edge);
  const chain=(x0,y0,x1,y1,c)=>{d.line(x0,y0,x1,y1,c);const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let i=0;i<=n;i+=4)d.put(x0+(x1-x0)*i/n,y0+(y1-y0)*i/n,WHITE);};
  const pleats=(x,y,w,h,c,shade)=>{poly([[x+6,y],[x+w-6,y],[x+w,y+h],[x,y+h]],c);for(let n=8;n<w;n+=8)d.line(x+n,y+3,x+n+(n<w/2?-3:3),y+h-2,shade);d.line(x+2,y+h-2,x+w-2,y+h-2,c===BLACK?GOLD:WHITE);};
  const lace=(x,y,w,c=WHITE)=>{d.line(x,y,x+w,y,WHITE_SHADE);for(let n=0;n<w;n+=4){d.rect(x+n,y+1,3,2,c);d.put(x+n+1,y+3,c);}};
  const star=(x,y,c=GOLD)=>{d.line(x-2,y,x+2,y,c);d.line(x,y-2,x,y+2,c);d.put(x-1,y-1,c);d.put(x+1,y+1,c);};
  const buttons=(x,y,n,c=GOLD,step=7)=>{for(let i=0;i<n;i++){d.rect(x,y+i*step,2,2,c);d.put(x,y+i*step,WHITE);}};
  const plaid=(x,y,w,h,c)=>{for(let n=0;n<w;n+=7)d.rect(x+n,y,1,h,c);for(let n=0;n<h;n+=7)d.rect(x,y+n,w,1,c);};
  return {...d,poly,ellipse,chain,pleats,lace,star,buttons,plaid};
}
function baseBody(d,c){
  // Bare arms and neck remain available for off-shoulder/cropped clothing.
  d.poly([[56,64],[72,64],[74,82],[86,86],[82,111],[80,139],[48,139],[46,111],[42,86],[54,81]],SKIN,SKIN_SHADE);
  d.line(57,68,57,80,'#e3b09c');d.line(58,78,69,78,'#b98680');
  d.poly([[42,87],[47,95],[40,120],[36,145],[29,147],[31,122],[34,99]],SKIN,SKIN_SHADE);
  d.poly([[86,87],[93,99],[97,122],[99,145],[92,147],[87,121],[80,95]],SKIN,SKIN_SHADE);
  d.ellipse(32,147,4,7,SKIN,SKIN_SHADE);d.ellipse(96,147,4,7,SKIN,SKIN_SHADE);
  d.line(31,146,31,151,'#e6b49f');d.line(96,146,96,151,'#e6b49f');
  d.poly([[46,147],[61,148],[59,181],[57,211],[46,211],[44,181]],SKIN,SKIN_SHADE);
  d.poly([[67,148],[82,147],[84,181],[82,211],[71,211],[69,181]],SKIN,SKIN_SHADE);
  d.line(48,180,47,205,'#f2c9b5');d.line(74,182,74,206,'#f3cbb7');
  d.poly([[45,207],[58,207],[59,218],[43,218],[40,215]],BLACK);d.poly([[71,207],[83,207],[88,215],[85,218],[70,218]],BLACK);
  d.line(42,216,58,216,'#7b7688');d.line(71,216,86,216,'#7b7688');
}
function top(d,main,shade,options={}){
  const bottom=options.crop?115:136;
  d.poly([[44,85],[54,81],[64,85],[74,81],[84,85],[80,108],[83,bottom],[45,bottom],[48,108]],main);
  d.poly([[45,88],[50,92],[50,bottom-2],[45,bottom-1],[48,108]],shade,null);
  d.line(78,93,76,bottom-4,shade);d.line(53,bottom-3,76,bottom-3,shade);
}
function sleeves(d,color,shade,{open=false,puff=false,low=false}={}){
  const y=low?98:86;
  d.poly([[42,y],[47,y+9],[40,122],[37,143],[28,141],[30,119],[32,y+9]],color);
  d.poly([[86,y],[96,y+9],[98,119],[100,141],[91,143],[87,122],[81,y+9]],color);
  d.line(33,108,31,135,shade);d.line(94,108,97,136,shade);d.line(29,139,37,140,shade);d.line(91,140,99,139,shade);
  if(puff){d.ellipse(38,y+9,9,10,color,shade);d.ellipse(90,y+9,9,10,color,shade);}
  if(open){d.line(41,y+6,38,y+19,shade);d.line(87,y+6,90,y+19,shade);}
}
function shorts(d,color=BLACK){for(const x of [44,68]){d.poly([[x,133],[x+17,133],[x+18,153],[x,153]],color);d.line(x+2,151,x+16,151,'#5a5868');}d.line(63,139,64,152,INK);}
function skirt(d,color=BLACK,shade='#575163',length=34){d.pleats(36,134,56,length,color,shade);}
function openJacket(d,main,shade,length=143){
  sleeves(d,main,shade,{open:true});
  d.poly([[43,84],[54,80],[55,96],[51,length],[37,length-2],[41,110]],main);
  d.poly([[74,80],[85,84],[87,110],[91,length-2],[77,length],[73,96]],main);
  d.line(51,97,46,length-4,shade);d.line(77,97,82,length-4,shade);
  d.poly([[45,83],[55,82],[61,96],[52,92]],main,shade);d.poly([[73,82],[83,83],[76,94],[68,96]],main,shade);
}
function mygo(d,c){
  const id=costumeId(c);top(d,BLACK,'#44454e');shorts(d);
  if(id==='anon'){
    openJacket(d,'#383841','#202631',154);for(const x of [29,91]){d.line(x,136,x+7,137,GOLD);d.line(x,133,x+7,134,'#ad8c55');}
    d.poly([[38,137],[46,144],[43,184],[36,192],[29,180]],'#33333c','#202631');d.poly([[82,140],[89,144],[97,172],[88,179]],'#33333c','#202631');
    d.poly([[48,139],[59,137],[60,164],[56,170],[52,144]],TEAL,'#528d9e');d.line(39,89,43,105,'#535764');d.buttons(49,104,4,'#9b9fa8');
  }else if(id==='rana'){
    // Bare shoulders and low sleeves are an identifying costume feature, not a white uniform.
    d.poly([[54,79],[74,79],[80,96],[78,131],[49,131],[48,96]],BLACK);
    d.rect(54,77,20,7,BLACK);d.line(55,80,73,80,TEAL);
    sleeves(d,WHITE,WHITE_SHADE,{low:true});d.poly([[38,115],[45,111],[49,144],[39,146]],WHITE);d.poly([[83,111],[91,115],[89,146],[79,144]],WHITE);
    d.line(32,105,42,109,TEAL);d.line(85,109,96,105,TEAL);d.rect(47,132,34,4,GOLD);d.rect(63,132,6,4,INK);
  }else {
    if(id==='taki'){skirt(d,BLACK,'#4a4d59',26);d.poly([[79,138],[85,139],[88,158],[83,160]],TEAL,'#5d929d');}
    else if(id==='soyo')skirt(d,BLACK,'#464753',48);
    openJacket(d,'#edf0eb','#a4b6bf',id==='tomori'?137:132);
    d.poly([[35,88],[43,86],[43,94],[32,99]],TEAL,'#6fadb8');d.poly([[85,86],[93,88],[96,99],[86,94]],TEAL,'#6fadb8');
    d.line(43,99,42,125,'#d3dce0');d.line(83,99,85,126,'#d2dade');
    if(id==='tomori'){
      d.poly([[46,81],[57,76],[64,82],[72,76],[83,81],[80,91],[71,88],[64,93],[56,87],[47,91]],'#e1e6e3','#a2b2bd');
      d.rect(78,94,3,29,'#8f9daa');d.rect(77,108,5,6,GOLD);d.rect(45,117,9,8,'#b9d9de');d.rect(46,117,2,8,GOLD);d.rect(48,88,3,6,GOLD);
    }else if(id==='soyo'){
      d.poly([[49,81],[53,82],[65,131],[61,133]],GOLD,'#b29b61');
      d.poly([[43,125],[68,130],[59,165],[28,165],[34,143]],'#497b7a','#2f575b');d.plaid(37,136,18,26,'#70a1a0');d.poly([[57,127],[72,126],[79,140],[66,137]],'#426e73');d.line(58,132,72,148,'#91b2a3');
    }else {d.rect(71,99,10,6,'#45484f');d.rect(73,106,5,5,GOLD);d.line(55,92,55,127,'#6d8090');}
  }
  d.line(46,208,57,208,WHITE_SHADE);d.line(72,208,82,208,WHITE_SHADE);
}
function mujica(d,c){
  const id=costumeId(c),red=id==='nyamu'||id==='mutsumi';
  // Distinct red/black corsets share tailoring, while sleeve, cape and hem silhouettes differ.
  top(d,red?RED:BLACK,red?'#672b40':'#47434f');
  if(id==='umiri'){
    d.poly([[44,134],[62,134],[61,208],[46,208]],'#4b4854');d.poly([[66,134],[84,134],[82,208],[68,208]],'#4b4854');
    d.poly([[45,119],[56,127],[46,166],[34,159]],'#6c6472');d.poly([[82,119],[88,159],[75,166],[69,128]],'#787080');
    sleeves(d,'#d1c5ca','#9d8c9e');d.poly([[32,83],[55,77],[61,98],[37,110],[27,99]],RED);d.line(31,98,57,91,GOLD);
  }else {
    if(id==='uika')shorts(d);else skirt(d,id==='nyamu'?RED:'#3c303f',id==='nyamu'?'#713048':'#615064',id==='sakiko'?39:33);
    sleeves(d,id==='sakiko'?'#d0b8ba':'#cdbfc8','#9b899e',{puff:id==='uika'});
    if(id==='uika'){d.ellipse(38,90,10,9,BLACK);d.ellipse(90,90,10,9,BLACK);for(const x of [29,91])d.poly([[x,126],[x+9,125],[x+11,135],[x,138]],RED);d.poly([[38,136],[47,143],[43,179],[25,174],[31,153]],BLACK);d.poly([[33,151],[42,147],[39,171],[28,171]],RED);d.poly([[82,136],[93,145],[105,169],[88,177]],BLACK);d.line(27,174,41,178,GOLD);d.line(88,176,104,169,GOLD);}
    if(id==='sakiko'){d.ellipse(36,89,11,10,RED,'#6e2e42');d.ellipse(92,89,11,10,RED,'#6e2e42');d.poly([[33,145],[43,135],[55,152],[44,170],[26,163]],'#6c6274');d.poly([[83,135],[96,145],[101,163],[84,171],[73,152]],'#413444');}
    if(id==='mutsumi'){d.poly([[46,137],[82,137],[82,161],[64,174],[46,161]],RED);d.lace(47,160,34);d.poly([[34,136],[43,132],[49,156],[40,185],[23,176],[25,160]],BLACK);d.poly([[85,132],[95,136],[102,160],[105,176],[91,186],[79,156]],BLACK);d.line(25,175,40,184,GOLD);d.line(92,185,104,176,GOLD);}
    if(id==='nyamu'){d.poly([[32,142],[38,146],[35,178],[27,170]],'#5e4d62');d.poly([[90,146],[97,142],[103,170],[93,178]],'#5e4d62');d.rect(46,176,13,31,'#3f354b');d.rect(71,180,12,27,'#44374f');}
  }
  d.poly([[53,80],[64,87],[74,80],[78,91],[68,99],[59,98],[49,91]],'#eee7d9','#90828f');
  d.lace(51,87,25);d.rect(59,92,10,34,red?'#762e43':'#37333e');
  for(const s of [-1,1]){d.line(64+s*10,98,64+s*15,126,GOLD);d.line(64+s*15,126,64+s*7,135,GOLD);}
  d.buttons(63,101,4,GOLD,7);d.rect(45,128,38,5,id==='uika'?'#8a6755':'#3b303e');d.rect(59,128,10,5,GOLD);d.rect(62,129,4,3,'#6d5260');
  if(id!=='umiri'&&id!=='uika'){d.line(39,155,51,160,GOLD);d.line(77,160,89,155,GOLD);for(const x of [31,95])d.star(x,153);}
  d.rect(52,77,24,3,BLACK);d.ellipse(64,80,2,3,GOLD);d.line(48,211,56,211,GOLD);d.line(73,211,81,211,GOLD);
}
function millsage(d,c){
  const id=costumeId(c);skirt(d,'#edf1f2','#b5c3cf',id==='houka'?76:id==='natsume'?28:42);
  top(d,WHITE,WHITE_SHADE,{crop:id==='houka'});
  if(id==='hotaru'){
    sleeves(d,WHITE,WHITE_SHADE);d.poly([[50,83],[62,90],[58,99],[48,90]],WHITE,WHITE_SHADE);d.poly([[66,90],[78,83],[80,90],[70,99]],WHITE,WHITE_SHADE);
    d.poly([[61,92],[66,92],[70,122],[64,129],[59,122]],'#40464f');
    for(const x of [48,53,74,79])d.line(x,99,x,147,'#bccbd5');d.poly([[36,139],[42,136],[44,173],[31,162]],BLACK);d.poly([[86,136],[93,139],[99,163],[85,174]],BLACK);d.lace(47,148,35);
  }else if(id==='mahoro'){
    sleeves(d,WHITE,WHITE_SHADE,{puff:true});d.poly([[50,84],[57,88],[64,86],[71,88],[78,84],[79,93],[64,99],[49,93]],WHITE,WHITE_SHADE);d.lace(47,92,34);d.line(64,98,64,133,'#b3c3d1');d.buttons(63,102,4,'#a0b4c3');d.lace(39,174,50);
  }else if(id==='nagi'){
    d.poly([[39,91],[48,91],[52,98],[45,105],[35,100]],WHITE,WHITE_SHADE);d.poly([[80,91],[89,91],[94,100],[84,105],[77,98]],WHITE,WHITE_SHADE);d.lace(35,98,14);d.lace(79,98,14);
    d.line(55,86,55,126,'#d7e0e5');d.poly([[43,132],[51,133],[45,177],[34,169]],BLACK);d.poly([[77,133],[85,132],[95,169],[84,177]],BLACK);d.lace(40,174,47);
  }else if(id==='houka'){
    d.poly([[38,94],[48,91],[53,100],[48,108],[35,104]],WHITE,WHITE_SHADE);d.poly([[80,91],[90,94],[93,104],[80,108],[75,100]],WHITE,WHITE_SHADE);
    d.line(47,110,81,110,WHITE_SHADE);d.poly([[47,123],[81,123],[82,136],[44,136]],WHITE,WHITE_SHADE);d.line(49,123,64,129,'#a8bbc9');d.line(64,129,79,123,'#a8bbc9');d.poly([[63,151],[69,151],[75,209],[64,209]],SKIN,SKIN_SHADE);d.line(50,117,78,119,'#a6b6c2');
  }else {
    d.poly([[37,88],[47,87],[45,124],[28,157],[25,146]],'#d7e0e5','#aabac6');d.poly([[81,87],[91,90],[102,151],[94,155],[85,126]],'#e6ebec','#b9c6cf');d.line(42,100,32,146,WHITE);d.line(88,100,96,145,WHITE);d.lace(39,180,50);
  }
  if(id!=='hotaru'){d.rect(55,77,18,2,'#b4c2cb');d.star(74,91,'#aabec7');d.line(77,87,73,98,'#d6e0e5');}
  d.poly([[44,208],[58,208],[59,217],[43,217]],WHITE,WHITE_SHADE);d.poly([[70,208],[84,208],[87,217],[70,217]],WHITE,WHITE_SHADE);
}
function mew(d,c){
  const id=costumeId(c);
  if(id==='yuno'){
    shorts(d);top(d,BLACK,'#514052',{crop:true});d.rect(49,115,30,3,'#e9d9df');
    openJacket(d,'#d56895','#944268',155);d.poly([[35,91],[45,86],[48,102],[39,109]],'#dd79a6');d.poly([[82,86],[93,91],[95,108],[83,105]],'#e98cb2');d.buttons(85,121,4,'#9095b4',8);d.rect(38,137,8,9,'#a94871');
    for(const [x,s]of [[34,-1],[84,1]]){d.poly([[x,88],[x+9,87],[x+9,106],[x,107]],SKIN,SKIN_SHADE);for(let y=89;y<104;y+=5){d.line(x,y,x+9,y+5,BLACK);d.line(x+9,y,x,y+5,BLACK);}d.line(x,107,x+10,108,'#d56895');}
    d.rect(46,180,12,27,'#3f344d');d.rect(71,173,12,34,'#3c3347');d.rect(53,77,22,3,BLACK);
  }else if(id==='arale'){
    top(d,'#b5e1f0','#6eafcb',{crop:true});d.poly([[45,88],[53,84],[64,89],[75,84],[83,88],[80,97],[47,97]],WHITE,WHITE_SHADE);d.poly([[61,86],[68,86],[69,96],[64,101],[59,96]],BLACK);d.rect(61,87,7,2,GOLD);
    d.buttons(63,105,2,GOLD);d.rect(44,121,40,9,'#f1d373');d.rect(61,122,8,7,'#9f8358');skirt(d,'#f5d16b','#bd9951',30);d.poly([[40,139],[51,138],[58,156],[46,159]],WHITE);d.poly([[75,137],[88,147],[79,162],[68,157]],'#88cfe4');d.poly([[44,141],[50,141],[54,149],[48,151]],'#f0a260');d.plaid(43,145,8,8,WHITE);d.lace(39,162,50,'#5b4b52');
    d.rect(45,173,13,34,WHITE);d.rect(71,184,12,23,'#e8c769');d.rect(45,173,13,5,'#79bfd5');d.line(40,88,37,98,BLACK);d.line(88,88,92,98,BLACK);
  }else if(id==='nonoka'){
    top(d,'#f1a3bf','#bb6d97',{crop:true});d.rect(46,88,36,4,WHITE);d.buttons(54,99,2,GOLD,8);d.buttons(72,99,2,GOLD,8);skirt(d,'#f5b4cb','#c77fa4',36);d.poly([[42,139],[59,135],[65,167],[37,169]],WHITE,WHITE_SHADE);d.plaid(68,142,17,22,'#fce2e6');d.plaid(69,142,17,22,'#dc8daa');d.lace(39,171,50);d.rect(46,176,12,31,BLACK);d.rect(71,186,12,21,WHITE);d.rect(45,174,14,3,'#e495bd');d.rect(53,77,22,3,'#d680a6');
  }else if(id==='ritsu'){
    shorts(d,'#3d4971');top(d,WHITE,'#b9d4e4');sleeves(d,WHITE,'#a7c9db');d.poly([[50,85],[61,90],[57,100],[47,94]],WHITE,'#91b9d1');d.poly([[67,90],[78,85],[82,94],[71,100]],WHITE,'#91b9d1');d.line(64,98,64,133,'#5b97c3');d.poly([[35,92],[42,91],[40,112],[30,116]],'#6fbde7','#42799f');d.rect(91,122,8,18,'#60a9d7');d.poly([[44,133],[83,133],[88,157],[39,157]],'#56668d');d.line(42,154,85,154,'#99d2ef');d.rect(46,172,12,35,'#60b4e6');d.rect(71,182,12,25,WHITE);d.ellipse(64,83,3,3,'#b1d9e8');
  }else {
    skirt(d,'#8b7ca8','#554765',39);top(d,BLACK,'#554361');d.poly([[37,91],[47,90],[52,101],[42,107],[32,103]],'#b8abc9');d.poly([[81,90],[91,91],[97,103],[86,107],[76,101]],'#b8abc9');d.lace(36,100,14);d.lace(79,100,14);
    for(let y=105;y<131;y+=5){d.line(56,y,71,y+4,GOLD);d.line(71,y,56,y+4,GOLD);}d.lace(39,166,50);d.pleats(43,158,42,16,'#e8e2ed','#ad9bb9');d.rect(46,181,12,26,'#594b72');d.rect(71,181,12,26,'#594b72');d.star(79,149);d.star(40,145);d.star(64,88);d.poly([[58,90],[64,94],[57,100]],'#967faa');d.poly([[70,90],[64,94],[71,100]],'#967faa');
  }
}
function ikka(d,c){
  const id=costumeId(c);
  if(id==='miku'){
    top(d,BLACK,'#494650',{crop:true});d.rect(49,114,30,3,WHITE);openJacket(d,'#54918e','#35666d',151);
    for(const x of [39,79]){d.plaid(x,101,9,42,'#aac19d');d.plaid(x+2,100,7,43,'#36666f');}
    d.poly([[45,132],[62,132],[61,207],[45,207]],WHITE,WHITE_SHADE);d.poly([[66,132],[83,132],[84,207],[69,207]],WHITE,WHITE_SHADE);d.line(48,142,48,202,'#c1cdd5');d.line(78,141,79,204,'#c1cdd5');
  }else if(id==='raika'){
    shorts(d,'#404452');top(d,WHITE,'#c0c6d0',{crop:true});openJacket(d,'#666587','#3b415f',142);
    d.poly([[37,82],[50,80],[55,93],[45,92]],'#e5d685','#a99962');d.poly([[77,80],[90,84],[85,93],[72,93]],'#e5d685','#a99962');d.rect(43,130,42,5,'#5c5054');d.buttons(48,131,5,'#d0c9ac',0);for(let x=47;x<82;x+=6)d.rect(x,131,2,2,GOLD);
    for(const [x,y]of [[34,109],[39,120],[94,108]])d.star(x,y,'#95c3d2');d.rect(90,121,6,7,'#b5b3d2');d.plaid(91,122,4,5,'#59677c');d.rect(46,184,12,23,'#434353');d.rect(71,178,12,29,'#45465c');
  }else if(id==='yomogi'){
    shorts(d);top(d,BLACK,'#4b4c5a');openJacket(d,'#4c637a','#304354',149);
    for(const x of [40,44,48,78,82,86])d.line(x,98,x-1,145,'#8a9ca6');d.line(34,101,29,135,'#8097a6');d.line(94,102,98,135,'#8196a5');d.chain(69,112,86,138,'#b8bdc8');d.chain(64,83,74,94,'#c6c8d0');d.rect(46,182,12,25,BLACK);d.rect(71,175,12,32,BLACK);
  }else if(id==='chieri'){
    top(d,'#de91be','#a55e91',{crop:true});sleeves(d,'#dd8db9','#a26190');d.poly([[45,108],[53,111],[49,119],[42,117]],'#b1689b');d.poly([[74,112],[81,109],[86,116],[77,120]],'#c57eaa');skirt(d,'#494759','#2f3345',33);d.poly([[72,137],[85,137],[91,166],[72,166]],'#4d7993');d.rect(43,131,42,5,'#f0db80');d.rect(62,131,8,5,WHITE);d.chain(77,137,89,158,'#c3d0d5');d.plaid(48,140,14,18,'#727c8e');d.rect(30,130,8,10,'#637f94');d.rect(91,128,8,8,'#41404d');for(let y=130;y<138;y+=3)d.line(92,y,98,y,WHITE);d.rect(45,187,13,20,BLACK);d.rect(71,180,13,27,BLACK);
  }else {
    skirt(d,BLACK,'#514a5d',34);top(d,'#a3a4a7','#717883');sleeves(d,'#4c4b56','#252834');
    for(const x of [34,88])for(let y=94;y<111;y+=3){d.line(x,y,x+6,y+6,'#aeb0af');d.line(x+6,y,x,y+6,'#909997');}
    d.poly([[48,84],[52,84],[63,117],[59,120]],'#e6dc86','#b4a866');d.poly([[76,84],[80,84],[68,120],[64,117]],'#e6dc86','#b4a866');d.ellipse(64,117,5,5,'#c8bea0','#737579');d.line(64,122,64,134,'#e6dc86');
    d.rect(29,119,9,23,'#c77c7a');for(let y=119;y<141;y+=5)d.line(29,y,37,y+3,WHITE);d.line(54,133,76,133,WHITE_SHADE);d.rect(46,180,12,27,BLACK);d.rect(71,180,12,27,BLACK);
  }
  d.rect(53,77,22,3,BLACK);d.chain(55,83,63,91,'#bbbfc8');d.chain(63,91,73,83,'#bbbfc8');
}
function legwear(d,c){
  const id=costumeId(c),dark='#373340',grey='#6f737e';
  const legs=(y,left=SKIN,right=left)=>{d.poly([[45,y],[60,y],[58,208],[46,208]],left,left===SKIN?SKIN_SHADE:INK);d.poly([[69,y],[83,y],[83,208],[71,208]],right,right===SKIN?SKIN_SHADE:INK);};
  const sock=(x,y,color,edge=INK)=>d.poly([[x,y],[x+12,y],[x+12,209],[x,209]],color,edge);
  const stripes=(x,y,color,spacing=5)=>{for(let yy=y;yy<209;yy+=spacing)d.line(x,yy,x+11,yy+1,color);};
  const laces=(x,y,end=209,color=WHITE)=>{for(let yy=y;yy<end;yy+=5){d.line(x,yy,x+7,yy+4,color);d.line(x+7,yy,x,yy+4,color);}};
  const shoes=(color=dark,sole='#888798',laceColor)=>{d.poly([[45,208],[58,208],[59,219],[42,219],[40,216]],color);d.poly([[71,208],[84,208],[89,216],[87,219],[70,219]],color);d.line(41,219,59,219,sole);d.line(70,219,88,219,sole);if(laceColor){laces(48,208,216,laceColor);laces(74,208,216,laceColor);}};
  const net=(x,y,end=202)=>{for(let yy=y;yy<end;yy+=7){d.line(x,yy,x+11,yy+7,'#544c59');d.line(x+11,yy,x,yy+7,'#544c59');}};
  if(id==='tomori'){legs(154);sock(46,184,dark);sock(71,184,dark);shoes(WHITE,'#8d9ba9','#7bb8c9');d.rect(46,209,2,7,GOLD);d.rect(81,209,2,7,GOLD);}
  else if(id==='anon'){legs(156);sock(46,183,dark);sock(71,183,dark);shoes(dark,'#5c5868');d.line(47,188,57,188,'#8a858d');d.line(72,188,82,188,'#8a858d');}
  else if(id==='rana'){legs(135,dark);d.line(49,143,49,204,'#596170');d.line(78,143,80,204,TEAL);shoes(WHITE,'#9398a5',dark);}
  else if(id==='soyo'){legs(184);shoes(dark,'#746d74');for(const x of [48,74])laces(x,193,211,GOLD);}
  else if(id==='taki'){legs(162);shoes('#3d4b52',WHITE,GOLD);d.line(47,205,58,205,GOLD);d.line(72,205,83,205,GOLD);}
  else if(id==='uika'){legs(154,SKIN,'#8d838c');sock(46,177,dark);sock(71,157,dark);stripes(71,160,'#bdb6bf',6);shoes(dark,GOLD,'#99919a');}
  else if(id==='mutsumi'){legs(176,'#655563');sock(46,190,'#36353f');sock(71,190,'#36353f');shoes('#34323c','#71625c');d.line(48,192,49,212,'#8f7770');d.line(80,192,79,212,'#8f7770');}
  else if(id==='umiri'){legs(153,'#5b4e5a',dark);sock(46,176,'#59473f');sock(71,169,'#59473f');shoes('#5c493d',GOLD);d.line(49,179,49,212,'#a28a5d');d.line(79,173,79,212,'#a28a5d');}
  else if(id==='nyamu'){legs(169,'#bdadb7');d.rect(46,171,13,3,dark);d.rect(71,171,13,3,dark);for(const x of [48,74]){d.line(x,176,x+7,189,dark);d.line(x+7,176,x,189,dark);d.line(x+2,199,x+6,205,dark);}shoes('#ad3d51','#4d303e');}
  else if(id==='sakiko'){legs(176);for(const x of [48,74]){laces(x,192,213,dark);d.line(x+1,207,x+6,209,GOLD);}shoes(dark,GOLD);d.poly([[41,167],[87,167],[83,179],[48,181]],'#ded4bf','#9a8b84');d.lace(48,177,34,'#eae0ce');}
  else if(id==='arale'){legs(170);sock(46,187,'#eacb6a');sock(71,181,'#efcb6e');d.rect(46,174,12,5,'#f0a8ba');d.rect(71,177,12,4,WHITE);shoes(WHITE,'#8db4d0','#85c9dd');d.lace(39,162,51,WHITE);}
  else if(id==='nonoka'){legs(176);sock(46,191,'#f4d8e4');sock(71,183,'#e8b1ca');d.rect(46,177,12,3,WHITE);d.rect(71,178,12,3,WHITE);shoes('#eeadc8','#7cb8e1',WHITE);d.line(49,194,54,205,'#c880ac');d.line(75,188,80,205,'#c880ac');}
  else if(id==='ritsu'){legs(160,'#65b6e5');for(const x of [46,71]){d.poly([[x,185],[x+12,185],[x+13,203],[x+9,207],[x+1,203]],'#cce4ef','#6694b8');d.line(x+3,188,x+6,201,WHITE);}shoes('#93c6e6',WHITE,'#567fb7');}
  else if(id==='miyako'){legs(177);d.rect(46,202,12,6,'#ded1a0');d.rect(71,202,12,6,'#ded1a0');shoes('#898467','#b3ae83','#cdc8a3');d.star(82,200);}
  else if(id==='yuno'){legs(157);d.rect(71,172,12,3,'#b63f71');d.rect(71,178,12,3,'#b63f71');sock(46,184,'#cb3c75');sock(71,189,'#cf3f77');shoes('#d7447d','#4c314b');d.line(47,186,55,203,'#f2749b');d.line(73,192,80,204,'#f2749b');}
  else if(id==='nagi'){legs(179);sock(46,178,WHITE,WHITE_SHADE);sock(71,178,WHITE,WHITE_SHADE);laces(48,182,210,dark);shoes(WHITE,'#a0adb7');}
  else if(id==='mahoro'){legs(179);sock(46,194,WHITE,WHITE_SHADE);sock(71,194,WHITE,WHITE_SHADE);laces(48,182,209,dark);laces(74,182,209,dark);shoes(WHITE,WHITE_SHADE);}
  else if(id==='hotaru'){legs(176);sock(46,184,WHITE,WHITE_SHADE);sock(71,184,WHITE,WHITE_SHADE);laces(48,177,195,dark);laces(74,177,195,dark);shoes(WHITE,WHITE_SHADE);d.poly([[35,156],[39,156],[34,213],[17,218],[28,204]],'#6f727a','#555965');d.poly([[88,156],[94,156],[101,204],[113,218],[93,213]],'#6f727a','#555965');d.line(37,160,30,211,WHITE);d.line(91,160,98,211,WHITE);}
  else if(id==='houka'){shoes(WHITE,WHITE_SHADE);for(let y=169;y<205;y+=8){d.line(66,y,72,y+6,'#8a838b');d.line(72,y,66,y+6,'#8a838b');}}
  else if(id==='natsume'){legs(164);laces(49,166,184,dark);sock(46,200,WHITE,WHITE_SHADE);sock(71,198,WHITE,WHITE_SHADE);shoes(WHITE,WHITE_SHADE);}
  else if(id==='raika'){legs(154);sock(46,167,'#777d86');sock(71,176,dark);stripes(71,178,WHITE,5);shoes('#a4734e','#664b42',GOLD);}
  else if(id==='miku'){shoes(dark,'#5a5361','#b5a9a2');laces(75,182,205,dark);d.rect(73,179,9,3,'#e7cbc0');}
  else if(id==='yomogi'){legs(154);net(46,165,201);sock(71,184,dark);stripes(71,187,WHITE,5);shoes(dark,'#6b6773');}
  else if(id==='chieri'){legs(170);net(46,171,193);net(71,171,193);sock(46,192,'#4e7c93');sock(71,190,'#527d95');d.rect(46,192,12,5,'#d69cbd');d.rect(71,190,12,5,'#b95c6d');shoes('#4f758c','#777f9a','#bbbec6');}
  else if(id==='shizuku'){legs(170);sock(46,178,'#e8dfac');sock(71,180,dark);stripes(71,183,WHITE,5);d.line(47,179,57,195,'#a39b6a');d.line(57,179,47,195,'#a39b6a');shoes(WHITE,'#83818c',dark);}
}
function backHair(d,c){
  const h=c.hair,shape=c.hairShape||'',long=shape.includes('long')||shape==='soft-wave',twins=shape.includes('twintails')||shape==='braids',end=shape==='low-twintails'?113:shape==='braids'?136:143;
  if(long){d.poly([[41,32],[87,32],[92,78],[94,end-12],[88,end],[81,end-8],[76,82],[51,82],[47,end-6],[39,end],[34,end-10],[37,77]],h[2]);for(const [x,dir]of [[40,-1],[45,-1],[83,1],[88,1]])d.line(x,62,x+dir*3,end-12,h[1]);}
  if(twins){for(const side of [-1,1]){const x=n=>64+side*n;d.poly([[x(18),36],[x(26),33],[x(32),52],[x(34),end-14],[x(29),end],[x(24),end-7],[x(24),64]],h[2]);d.line(x(28),48,x(30),end-13,h[1]);d.line(x(26),48,x(27),end-15,h[0]);if(shape==='braids')for(let y=65;y<end-5;y+=7){d.line(x(25),y,x(32),y+3,h[0]);d.line(x(32),y+3,x(25),y+6,h[1]);}if(c.streak){d.line(x(31),end-32,x(32),end-12,c.streak);d.line(x(30),end-24,x(30),end-10,c.streak);}}}
}
function headAccessories(d,c){
  const type=c.accessory,light=c.hair[0],dark=c.hair[2];
  const bow=(x,y,color)=>{d.poly([[x,y],[x-6,y-3],[x-6,y+4]],color);d.poly([[x,y],[x+6,y-3],[x+6,y+4]],color);d.rect(x-1,y-1,3,4,'#62506b');d.line(x-2,y+3,x-5,y+13,color);d.line(x+2,y+3,x+5,y+13,color);};
  if(type?.startsWith('flower')){const x=type==='flower-left'?88:35,y=39;for(const [dx,dy]of [[0,-5],[4,-2],[3,4],[-3,4],[-5,-2]])d.ellipse(x+dx,y+dy,3,4,WHITE,'#a5b5ba');d.ellipse(x,y,2,2,'#c3ccb5');for(const [dx,dy]of [[5,10],[2,19]]){d.ellipse(x+dx,y+dy,3,3,WHITE,'#b3bfc4');d.put(x+dx,y+dy,'#a4b99d');}d.line(x+2,y+8,x+6,y+27,'#b5c5bd');}
  else if(type==='beret'){d.poly([[39,25],[37,19],[43,12],[58,8],[75,9],[85,16],[84,26]],'#a63a4b','#6e2b3d');d.line(41,26,83,26,'#392e3b');d.line(45,14,59,10,'#cc5964');d.ellipse(72,25,2,2,GOLD);}
  else if(type==='black-bows'){bow(38,37,BLACK);bow(90,37,BLACK);}
  else if(type==='red-ties'){bow(40,56,'#a54556');bow(89,56,'#a54556');}
  else if(type==='ribbon'){for(const x of [40,88]){d.rect(x,58,3,9,RED);d.poly([[x,65],[x+4,65],[x+6,73],[x+1,71]],RED);}}
  else if(type==='pearl-band'||type==='veil'){
    const points=[[39,33],[42,26],[48,21],[57,18],[70,18],[80,23],[86,32]];for(let i=0;i<points.length-1;i++)d.line(...points[i],...points[i+1],type==='veil'?'#f4f0eb':'#c7d5e9');
    for(const [x,y]of points)d.ellipse(x,y,1,1,WHITE);
    if(type==='veil'){d.poly([[38,30],[27,39],[36,42],[31,68],[41,79],[38,50]],'#766087','#493951');d.poly([[88,30],[101,39],[91,42],[98,68],[88,79],[91,50]],'#766087','#493951');d.star(93,59,GOLD);d.star(34,66,GOLD);}
  }else if(type?.startsWith('cat')){
    const color=type==='cat-pink'?'#ed85b0':'#edcf68';for(const side of [-1,1]){const x=n=>64+n*side;d.poly([[x(15),23],[x(23),6],[x(28),9],[x(27),31]],BLACK);d.poly([[x(18),23],[x(24),10],[x(25),25]],color,null);d.ellipse(x(26),38,5,8,color,'#40394c');d.ellipse(x(27),38,2,5,type==='cat-pink'?'#ca6598':'#d7b35a');}d.line(42,22,86,22,'#4a4053');
  }else if(type==='bear-blue'){
    for(const x of [42,86]){d.ellipse(x,19,7,8,'#343947','#1d2d3c');d.ellipse(x,19,4,5,'#57bbe9','#1b6d9f');d.ellipse(x,41,4,7,'#529fd6','#254c80');}d.line(44,18,83,18,'#529fd6');
  }else if(type==='bunny'){
    d.poly([[43,25],[39,10],[42,2],[47,3],[52,22]],WHITE,'#bc829e');d.poly([[47,22],[43,8],[45,5],[49,23]],'#ed9fb8',null);d.poly([[69,22],[77,6],[83,5],[85,10],[78,27]],WHITE,'#bc829e');d.line(78,9,74,22,'#ed9fb8');d.poly([[41,25],[82,25],[85,30],[42,31]],'#f0a6c3','#b16e96');d.plaid(45,26,33,4,WHITE);d.ellipse(66,27,3,2,'#e0689d');
  }else if(type==='cross-pins'||type==='star-clips'||type==='gold-pins'){
    const color=type==='gold-pins'?GOLD:BLACK,x=39;for(const y of [40,47]){d.line(x-3,y,x+4,y+4,color);d.line(x+4,y,x-3,y+4,color);}if(type==='star-clips'){d.star(88,35);d.star(88,46);}
  }else if(type==='clip'){d.line(40,38,46,37,'#cee6ec');d.line(41,42,47,41,'#e9e4f1');}
  if(type==='earrings'){for(const x of [41,87]){d.ellipse(x,59,1,3,GOLD);d.put(x,57,WHITE);}}
  if(c.id==='bd-miku'){for(const x of [41,87])d.ellipse(x,60,2,3,'#8c909d','#4f5563');}
}
export function renderStanding(c,sources){
  const im=blank(...PORTRAIT_SIZE),d=kit(im);const hairBack=blank(...PORTRAIT_SIZE);backHair(kit(hairBack),c);blend(im,hairBack,0,14);
  const back='hair/back/'+c.back+'.png',b={width:sources[back].width,height:sources[back].height,data:new Uint8ClampedArray(sources[back].data)};colorizeLayer(b.data,c.hair,c,back);blend(im,b,16,22);
  const body=blank(...PORTRAIT_SIZE),bodyDraw=kit(body),theme=c.costume?.split('-')[0]||c.band,renderers={mygo,mujica,millsage,mew,ikka};
  baseBody(bodyDraw,c);(renderers[theme]||mygo)(bodyDraw,c);legwear(bodyDraw,c);
  if(c.originalCloth&&c.cloth.some((v,i)=>v!==c.originalCloth[i])){
    const dyed=recolor(body,c.cloth),skin=new Set([SKIN,SKIN_SHADE,'#e3b09c','#b98680','#f2c9b5','#f3cbb7','#e6b49f'].map(hex=>hex.slice(1)));
    for(let y=83;y<175;y++)for(let x=0;x<body.width;x++){const i=(y*body.width+x)*4,key=Array.from(body.data.subarray(i,i+3)).map(v=>v.toString(16).padStart(2,'0')).join('');if(body.data[i+3]&&!skin.has(key)&&key!==INK.slice(1))body.data.set(dyed.data.subarray(i,i+3),i);}
  }
  blend(im,body);
  for(const [file,colors]of portraitLayers(c)){
    if(file===back||file.startsWith('cloths/'))continue;
    const src=sources[file],p={width:src.width,height:src.height,data:new Uint8ClampedArray(src.data)};colorizeLayer(p.data,colors,c,file);
    // The original body mask is used for the face/neck only; the costume below was redrawn above.
    if(file.startsWith('body/')||(c.hairShape?.includes('long')&&file.startsWith('hair/base/')))for(let y=60;y<p.height;y++)p.data.fill(0,y*p.width*4,(y+1)*p.width*4);
    blend(im,p,16+(96-p.width)/2,22+(96-p.height)/2);
  }
  const accessories=blank(...PORTRAIT_SIZE);headAccessories(kit(accessories),c);blend(im,accessories,0,14);return im;
}
export function standingAvatar(full){const out=blank(96,96);for(let y=0;y<96;y++)for(let x=0;x<96;x++){const i=((y+14)*full.width+x+16)*4;out.data.set(full.data.subarray(i,i+4),(y*96+x)*4);}return out;}
