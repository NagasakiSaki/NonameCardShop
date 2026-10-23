// Pure pixel operations, shared by the browser and Node exporter. No DOM or game state.
export const blank=(width,height)=>({width,height,data:new Uint8ClampedArray(width*height*4)});
export const rgb=hex=>hex.replace('#','').match(/../g).map(v=>parseInt(v,16));
export function blend(dst,src,ox=0,oy=0){for(let y=0;y<src.height;y++)for(let x=0;x<src.width;x++){
  const dx=x+ox,dy=y+oy;if(dx<0||dy<0||dx>=dst.width||dy>=dst.height)continue;
  const i=(y*src.width+x)*4,j=(dy*dst.width+dx)*4,a=src.data[i+3]/255,b=dst.data[j+3]/255,alpha=a+b*(1-a);if(!alpha)continue;
  for(let k=0;k<3;k++)dst.data[j+k]=(src.data[i+k]*a+dst.data[j+k]*b*(1-a))/alpha;dst.data[j+3]=alpha*255;
}}
export function recolor(source,palette){
  const out={width:source.width,height:source.height,data:new Uint8ClampedArray(source.data)},colors=palette.map(rgb);
  let min=255,max=0;for(let i=0;i<out.data.length;i+=4)if(out.data[i+3]){const v=(out.data[i]+out.data[i+1]+out.data[i+2])/3;min=Math.min(min,v);max=Math.max(max,v);}
  for(let i=0;i<out.data.length;i+=4)if(out.data[i+3]){const t=((out.data[i]+out.data[i+1]+out.data[i+2])/3-min)/Math.max(1,max-min),j=t<.5?2:1,k=t<.5?1:0,f=t<.5?t*2:(t-.5)*2;for(let n=0;n<3;n++)out.data[i+n]=Math.round(colors[j][n]*(1-f)+colors[k][n]*f);}
  return out;
}
export function painter(im,ox=0,oy=0){
  const put=(x,y,color)=>{x=Math.round(x+ox);y=Math.round(y+oy);if(x<0||y<0||x>=im.width||y>=im.height)return;im.data.set([...rgb(color),255],(y*im.width+x)*4);};
  const rect=(x,y,w,h,c)=>{for(let j=0;j<h;j++)for(let i=0;i<w;i++)put(x+i,y+j,c);};
  const line=(x0,y0,x1,y1,c)=>{const n=Math.max(Math.abs(x1-x0),Math.abs(y1-y0));for(let t=0;t<=n;t++)put(x0+(x1-x0)*t/Math.max(1,n),y0+(y1-y0)*t/Math.max(1,n),c);};
  const poly=(points,c)=>{const ys=points.map(p=>p[1]);for(let y=Math.min(...ys);y<=Math.max(...ys);y++){const hits=[];for(let i=0;i<points.length;i++){const a=points[i],b=points[(i+1)%points.length];if((a[1]<=y&&b[1]>y)||(b[1]<=y&&a[1]>y))hits.push(a[0]+(y-a[1])*(b[0]-a[0])/(b[1]-a[1]));}hits.sort((a,b)=>a-b);for(let i=0;i<hits.length;i+=2)for(let x=Math.ceil(hits[i]);x<hits[i+1];x++)put(x,y,c);}};
  return {put,rect,line,poly};
}
function ornament(draw,type,x,y,s,accent='#e6c97c'){
  const r=(a,b,w,h,c)=>draw.rect(x+a*s,y+b*s,w*s,h*s,c),l=(a,b,c,d,col)=>draw.line(x+a*s,y+b*s,x+c*s,y+d*s,col),dark='#303043',white='#fff6ec';
  if(type?.startsWith('flower')){for(const [a,b]of [[0,2],[2,0],[4,2],[2,4]])r(a,b,3,3,white);r(2,2,2,2,'#d8d6bc');r(6,6,3,3,white);r(7,7,1,1,'#d8d6bc');l(2,6,-1,10,'#a9b8ac');}
  else if(['ribbon','black-bows','red-ties'].includes(type)){const col=type==='black-bows'?dark:'#b94d68';draw.poly([[x,y],[x-4*s,y-2*s],[x-4*s,y+3*s]],col);draw.poly([[x,y],[x+4*s,y-2*s],[x+4*s,y+3*s]],col);r(-1,-1,2,3,accent);l(-1,2,-2,6,col);l(1,2,3,5,col);}
  else if(type==='beret'){draw.poly([[x-9*s,y+3*s],[x-10*s,y],[x-5*s,y-4*s],[x+3*s,y-5*s],[x+9*s,y-2*s],[x+8*s,y+3*s]],'#9c3149');l(-8,3,8,3,'#562d43');l(-5,-2,2,-4,'#cc5663');}
  else if(type?.startsWith('cat')){const col=type==='cat-pink'?'#e876a8':'#f4d95b';draw.poly([[x-8*s,y+3*s],[x-10*s,y-6*s],[x-3*s,y-2*s]],dark);l(-10,-6,-3,-2,col);l(-10,-6,-8,3,col);draw.poly([[x+8*s,y+3*s],[x+10*s,y-6*s],[x+3*s,y-2*s]],dark);l(10,-6,3,-2,col);l(10,-6,8,3,col);r(-10,4,3,5,col);r(8,4,3,5,col);}
  else if(type==='bear-blue'){for(const a of [-8,7]){r(a,-4,5,5,dark);r(a+1,-3,3,3,'#6ccbf8');}l(-8,0,8,0,'#62b9f0');}
  else if(type==='bunny'){draw.poly([[x-8*s,y+2*s],[x-8*s,y-10*s],[x-5*s,y-12*s],[x-3*s,y-10*s],[x-3*s,y+1*s]],white);l(-6,-9,-5,0,'#f3a0bd');draw.poly([[x+2*s,y],[x+5*s,y-8*s],[x+8*s,y-9*s],[x+9*s,y-6*s],[x+6*s,y+2*s]],white);l(6,-6,5,0,'#f3a0bd');l(-8,2,8,2,'#f38eae');}
  else if(type==='pearl-band'||type==='veil'){l(-9,2,-7,-1,white);l(-7,-1,7,-1,white);l(7,-1,9,2,white);if(type==='veil'){l(-10,3,-12,16,'#968bb9');l(10,3,12,16,'#968bb9');}}
  else if(type==='earrings'){r(-8,9,1,3,accent);r(8,9,1,3,accent);}
  else if(type==='cross-pins'||type==='star-clips'){l(-2,0,2,4,dark);l(2,0,-2,4,dark);l(-2,5,2,9,dark);l(2,5,-2,9,dark);if(type==='star-clips'){l(4,0,4,4,accent);l(2,2,6,2,accent);}}
  else if(type==='gold-pins'){l(-2,0,2,4,accent);l(2,0,-2,4,accent);l(-2,5,2,5,accent);}
  else if(type==='clip'){l(0,0,3,0,'#e8d4ed');l(1,2,4,2,'#94d4e3');}
}
export function portraitDetails(im,c){
  if(!c.band)return im;const d=painter(im);
  const central=['beret','cat-yellow','cat-pink','bear-blue','bunny','pearl-band','veil','earrings'].includes(c.accessory);
  const left=c.accessory==='flower-left';ornament(d,c.accessory,central?48:left?68:27,central?17:30,central?2:1,c.accent);
  if(c.accessory==='black-bows'||c.accessory==='red-ties')ornament(d,c.accessory,70,32,1,c.accent);
  // Clothes accents, drawn below the jaw so expressions remain editable.
  if(c.band==='millsage'){d.line(46,68,46,89,'#9babb5');d.line(50,68,50,89,'#d4dfe4');if(c.id==='bd-hotaru')d.poly([[46,69],[50,69],[52,84],[48,88],[45,83]],'#444954');}
  if(c.band==='avemujica'){d.line(31,80,38,94,'#c9ac6d');d.line(66,80,60,94,'#c9ac6d');for(let y=78;y<92;y+=4)d.rect(47,y,2,1,'#dac492');}
  if(c.id==='bd-shizuku'){d.line(32,73,42,94,'#e7dc7b');d.line(65,73,55,94,'#e7dc7b');}
  return im;
}
export function portraitHairExtensions(im,c){
  if(!c.band||!['twins','braids','long','wavy'].includes(c.walkStyle))return im;
  const d=painter(im),h=c.hair,twin=['twins','braids'].includes(c.walkStyle);
  for(const side of [-1,1]){const x=n=>48+n*side;
    d.poly([[x(18),29],[x(25),32],[x(twin?30:26),59],[x(twin?31:29),81],[x(35),94],[x(27),90],[x(23),67],[x(19),45]],h[2]);
    d.line(x(23),39,x(26),72,h[1]);d.line(x(26),72,x(31),88,h[1]);d.line(x(22),42,x(24),66,h[0]);
    if(c.walkStyle==='braids')for(let y=46;y<87;y+=7)d.line(x(23),y,x(28),y+3,h[0]);
  }
  return im;
}
export function walkLayerNames(c){return ['body','pants',c.band?'jacket':'shirt','shoes','head',c.band?(c.walkStyle?.includes('wavy')?'hair-curly':c.front==='female06'?'hair-bangs':c.walkStyle==='bob'?'hair':'hair-page'):c.walkHair];}
export function walkFaces(out,c,head){
  for(let row=1;row<4;row++)for(let col=0;col<8;col++){
    const fx=col*64,fy=row*64;let x0=64,x1=0,y0=64;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(head.data[((fy+y)*512+fx+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);}
    const d=painter(out,fx+Math.floor((x0+x1)/2),fy+y0),iris=c.iris,ink='#34303e';
    const eye=(x,p)=>{d.rect(x,12,2,3,'#f9f3e7');d.rect(x,13,2,2,p[1]);d.put(x,14,ink);d.put(x,12,p[0]);d.put(x+1,12,'#fffdf7');};
    if(row===2){if(c.walkStyle!=='asym-bob')eye(-4,iris);eye(3,c.otherEye||iris);d.put(0,15,'#b78376');d.line(-1,17,1,17,'#835964');}
    else {const right=row===3;eye(right?3:-4,right?(c.otherEye||iris):iris);d.put(right?6:-6,15,'#bb8a7d');d.line(right?3:-4,17,right?4:-3,17,'#835964');}
  }
  return out;
}
function walkCostume(d,c,row,col){
  const style=c.costume||'',front=row===2,side=row===1||row===3,w=side?5:7,ink='#343240',white='#f1f2ed',shade='#aab9c8',gold='#d9ba77',black='#30303c';
  const torso=(color)=>d.poly([[-w,19],[w,19],[w-1,27],[w,31],[-w,31],[-w+1,27]],color);
  const skirt=(color,length=6)=>{d.poly([[-w,30],[w,30],[w+2,30+length],[-w-2,30+length]],color);if(!side)for(let x=-w+2;x<w;x+=3)d.line(x,32,x+1,29+length,color===white?shade:'#62586b');};
  const open=(outer,inner)=>{torso(outer);if(front){d.rect(-3,21,6,9,inner);d.line(-4,21,-5,30,shade);d.line(4,21,5,30,shade);}};
  if(style.startsWith('mygo')){
    open(style==='mygo-black-coat'?black:white,black);
    if(front){d.line(-5,19,-2,22,shade);d.line(5,19,2,22,shade);d.rect(-8,19,3,3,'#8bc7cf');d.rect(6,19,3,3,'#8bc7cf');d.rect(3,24,2,2,gold);}
    if(style==='mygo-wrap-skirt'){skirt(black,5);d.line(w-1,32,w+1,34,'#8bc7cf');}
    if(style==='mygo-black-coat'){d.rect(-w-1,30,3,6,black);d.rect(w-1,30,3,6,black);if(front)d.line(3,31,3,37,'#80c9cd');}
    if(style==='mygo-waist-plaid'){skirt(black,8);d.poly([[-w-1,30],[0,31],[-2,38],[-w-3,37]],'#4e8582');if(!side){d.line(-w,33,-2,34,'#8ab2a4');d.line(-w+2,31,-w+1,37,'#8ab2a4');}}
    if(style==='mygo-offshoulder'){torso(black);if(front){d.rect(-7,19,3,4,'#ffe4d0');d.rect(5,19,3,4,'#ffe4d0');d.line(-5,30,6,30,gold);}}
  }else if(style.startsWith('mujica')){
    const red=['mujica-red-corset','mujica-red-skirt'].includes(style);torso(red?'#9d4256':black);
    if(front){d.line(-5,21,-3,29,gold);d.line(5,21,3,29,gold);for(let y=23;y<30;y+=3)d.put(0,y,gold);d.line(-4,19,0,21,white);d.line(4,19,0,21,white);d.line(-w,30,w,30,gold);}
    if(!['mujica-shorts','mujica-cape'].includes(style)){skirt(red?'#963e53':black,7);d.line(-w-1,36,w+1,36,gold);}
    if(style==='mujica-red-shoulders'){d.poly([[-10,19],[-6,18],[-5,23],[-10,24]],'#9d4256');d.poly([[6,18],[10,19],[10,24],[5,23]],'#9d4256');}
    if(style==='mujica-cape'){d.poly([[-10,18],[-3,18],[-1,25],[-10,26]],'#8e3549');d.line(-9,25,-2,23,gold);}
  }else if(style.startsWith('millsage')){
    torso(white);skirt(white,style==='millsage-crop'?11:style==='millsage-drape'?8:7);
    if(front){for(const x of [-4,3])d.line(x,22,x,35,shade);if(style==='millsage-tie')d.poly([[-1,21],[1,21],[2,28],[0,30],[-2,28]],'#444955');else d.put(3,21,'#99b4aa');}
    if(style==='millsage-crop'&&front)d.rect(-5,28,11,3,'#efc1ac');
    if(['millsage-ruffle','millsage-pleats','millsage-crop'].includes(style)){for(const x of [-9,7]){d.rect(x,20,3,3,white);d.line(x,23,x+2,23,shade);}}
  }else if(style.startsWith('mew')){
    if(style==='mew-yellow'){torso('#aad7e8');skirt('#e4c366');if(front){d.line(-4,20,0,22,white);d.line(4,20,0,22,white);d.rect(-5,29,11,3,'#e4c366');d.rect(-1,23,2,3,black);d.line(-w,36,w,36,black);}}
    else if(style==='mew-pink-check'){torso('#df91b4');skirt('#efb0c7');if(front){for(const x of [-4,1])d.line(x,22,x,27,white);d.line(-5,24,5,24,white);d.rect(-5,28,11,3,'#efc1ac');}d.line(-w,36,w,36,white);}
    else if(style==='mew-blue'){open(white,'#a5cfe5');skirt('#4e5e83',5);d.line(-w,34,w,34,'#94d4ef');}
    else if(style==='mew-purple-lace'){torso('#45364f');skirt('#8a77a3',8);d.line(-w,36,w,36,white);if(front)for(let y=23;y<30;y+=2){d.line(-2,y,2,y+1,gold);d.line(2,y,-2,y+1,gold);}}
    else {open('#c25d8b',black);d.rect(-w-1,30,3,6,'#c25d8b');d.rect(w-1,30,3,6,'#c25d8b');if(front)d.rect(-3,27,6,3,'#efc1ac');}
  }else if(style.startsWith('ikka')){
    if(style==='ikka-teal-plaid'){open('#55938f',black);if(front){d.line(-5,22,-5,33,'#a0b8a2');d.line(5,22,5,33,'#a0b8a2');d.line(-7,26,-4,26,'#a0b8a2');d.line(4,26,7,26,'#a0b8a2');}}
    else if(style==='ikka-purple-bomber'){open('#636486',white);if(front){d.line(-6,19,-3,21,'#dfd27f');d.line(6,19,3,21,'#dfd27f');d.line(-5,31,5,31,gold);d.put(-8,25,'#91bbd6');}}
    else if(style==='ikka-pinstripe'){open('#52697e',black);for(const x of [-5,5])d.line(x,21,x,34,'#90a4ac');}
    else if(style==='ikka-patchwork'){torso('#d887b6');skirt('#4a566e');if(front){d.rect(-5,28,11,3,'#efc1ac');d.line(-6,31,6,31,'#e4d27b');d.rect(3,33,3,4,'#60869b');}}
    else {torso('#999da2');skirt(black);if(front){d.line(-4,20,-1,29,'#e2d77e');d.line(4,20,1,29,'#e2d77e');d.rect(-9,25,2,6,'#bf7778');for(let y=25;y<32;y+=2)d.put(-9,y,white);}}
  }
}
export function composeWalk(c,sources){
  const out=blank(512,256),names=walkLayerNames(c);if(!c.band){for(const name of names)blend(out,sources[name]);return walkFaces(out,c,sources.head);}
  const [body,pants,shirt,shoes,head,hair]=names.map(n=>sources[n]);
  const legwear=recolor(pants,c.walkLegwear==='pants-white'?['#faf8f0','#ccd5dc','#8b9aa8']:['#596174','#303744','#202636']);
  const legPalette={white:['#f6f5ed','#d4dce4','#9baab9'],pink:['#f4aecb','#ce6b9d','#8d416f'],blue:['#abdcef','#65a8d4','#3b6a9b'],yellow:['#f4dc8b','#d6b45d','#907949']};
  if(legPalette[c.walkLegwear]){const dyed=recolor(pants,legPalette[c.walkLegwear]);for(let i=0;i<legwear.data.length;i+=4)if(Math.floor(i/4/512)%64>=53)legwear.data.set(dyed.data.subarray(i,i+4),i);}
  if(['bare','warmers','striped'].includes(c.walkLegwear))for(let i=0;i<legwear.data.length;i+=4){const y=Math.floor(i/4/512)%64;if(y>=53){if(c.walkLegwear==='bare'||c.walkLegwear==='warmers'&&y<56)legwear.data[i+3]=0;else if(c.walkLegwear==='striped'&&y%2===0&&legwear.data[i+3])legwear.data.set([228,232,225],i);}}
  blend(out,body);blend(out,legwear);blend(out,recolor(shirt,c.cloth));blend(out,recolor(shoes,c.shoePalette||['#57586b','#353645','#202636']));
  // Each overlay follows the source head's position in each frame, including the one-pixel walking bob.
  const anchors=[];for(let row=0;row<4;row++)for(let col=0;col<8;col++){
    const fx=col*64,fy=row*64;let x0=64,x1=0,y0=64,y1=0;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(head.data[((fy+y)*512+fx+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);y1=Math.max(y1,y);}
    const x=Math.floor((x0+x1)/2),y=y0,d=painter(out,fx+x,fy+y),h=c.hair,style=c.walkStyle,tail=c.walkTailLength??(['long','wavy','twins','braids'].includes(style)?32:style==='medium'||style==='wavy-medium'?23:0);
    anchors.push({row,col,fx,fy,x,y});
    if(['mygo-offshoulder','millsage-ruffle','millsage-crop','mew-yellow','mew-purple-lace'].includes(c.costume))for(let yy=y+18;yy<y+29;yy++)for(let xx=x-13;xx<=x+13;xx++)if(Math.abs(xx-x)>6){const i=((fy+yy)*512+fx+xx)*4;if(shirt.data[i+3])out.data.set(body.data.subarray(i,i+4),i);}
    walkCostume(d,c,row,col);
    if(tail){
      if(style==='twins'||style==='braids'){
        for(const side of [-1,1]){const wobble=style==='braids'?col%2:Math.floor(col/3)%2;d.poly([[side*7,1],[side*11,4],[side*(11+wobble),tail],[side*7,tail+3],[side*6,8]],h[2]);d.line(side*8,6,side*9,tail-1,h[1]);if(style==='braids')for(let yy=7;yy<tail;yy+=4)d.line(side*7,yy,side*10,yy+1,h[0]);}
      }else if(row===0){d.poly([[-8,3],[8,3],[9,tail-2],[5,tail+2],[-7,tail+1],[-10,tail-3]],h[2]);for(let xx=-6;xx<=6;xx+=3)d.line(xx,8,xx+(style.includes('wavy')?2:0),tail,h[1]);}
      else if(row===2){for(const side of [-1,1]){d.poly([[side*7,5],[side*10,7],[side*10,tail],[side*7,tail+2],[side*6,11]],h[2]);d.line(side*8,8,side*8,tail,h[1]);}}
      else {const side=row===1?1:-1;d.poly([[side*3,4],[side*9,6],[side*10,tail-1],[side*6,tail+3],[side*3,tail-2]],h[2]);d.line(side*6,8,side*7,tail,h[1]);}
    }
  }
  // ImageData width/height are prototype getters in browsers and disappear under object spread.
  const coloredHead={width:head.width,height:head.height,data:new Uint8ClampedArray(head.data)};
  for(let i=0;i<coloredHead.data.length;i+=4){const [r,g,b]=coloredHead.data.subarray(i,i+3),shade=r===108&&g===220&&b===231?0:r===79&&g===143&&b===186?1:r===24&&g===80&&b===111?2:-1;if(shade>=0){const palette=((i/4)%512)%64>=32?(c.otherEye||c.iris):c.iris;coloredHead.data.set(rgb(palette[shade]),i);}}
  blend(out,coloredHead);blend(out,recolor(hair,c.hair));
  for(const a of anchors){const d=painter(out,a.fx+a.x,a.fy+a.y),side=a.row===1?-1:a.row===3?1:0;
    if(c.walkStyle==='asym-bob'&&a.row===2){d.poly([[-7,2],[0,3],[-2,13],[-5,17],[-8,11]],c.hair[1]);d.line(-6,5,-4,13,c.hair[0]);}
    if(c.streak){const sx=side?side*-4:-5;d.line(sx,0,sx,7,c.streak);if(a.row===0)d.line(-4,8,-4,17,c.streak);}
    const central=['beret','cat-yellow','cat-pink','bear-blue','bunny','pearl-band','veil','earrings'].includes(c.accessory),flowerSide=c.accessory==='flower-left'?1:-1;
    // Back view gets the headgear, while face details stay exclusively on front/profile frames.
    if(['black-bows','red-ties'].includes(c.accessory)){if(a.row===0||a.row===2){ornament(d,c.accessory,-8,3,1,c.accent);ornament(d,c.accessory,8,3,1,c.accent);}else ornament(d,c.accessory,a.row===1?5:-5,3,1,c.accent);}
    else if(central||a.row!==0)ornament(d,c.accessory,central?0:flowerSide*6,central?-1:4,1,c.accent);
  }
  return walkFaces(out,c,head);
}
