// PLAY-A walk candidate module (A1). Verbatim copy of the accepted ART-02 R3 rework
// (deliverables/2026-10-24/ART-02/src/pixel-customization.art02.mjs, itself a drop-in
// replacement for experiments/character-art/pixel-customization.mjs @ c623cd7d), renamed into
// this package so later fixes never mutate the original pixel core in place. Byte-identical
// output against ART-02 R3 is asserted by verify-walks.mjs before any further change is made.
// Carried-over behaviour (see ART-02 R3 delivery doc):
//  1. walkFaces no longer paints a second pair of 2x3 eyes over the LPC head's baked eyes.
//     The baked pair (mirrored outline/lid/glint design) is the single eye system, iris-recolored
//     per walking direction so heterochromia maps to the physically visible eye.
//  2. Per-direction/per-frame arm masks derived from the source layers (bob-aligned median
//     deviation of the garment/body shading = the moving sleeve/hand track, plus pixels outside
//     the always-covered torso silhouette; legs excluded via pants/shoes alpha). Compositing:
//     far arm (source art, behind) -> torso clothes (full baseline length) -> near arm/sleeve/
//     hand re-blended from the base -> head -> front/back hair -> accessories -> face polish.
//     Side-view long hair tails draw behind the torso clothes instead of over the swing zone.
//  3. mygo-offshoulder strips the animated shirt sleeves properly (bare arms) instead of the
//     old "restore body pixels" patch; the other exposed-shoulder styles keep baseline behavior.
//  4. composeWalk(c, sources, stage, diag): stage 'bare' | 'clothes' | 'final' | 'diagnostic'
//     (default 'final'); diag collects the per-frame mask/phase info for review tooling.
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
// The LPC head ships one baked, mirrored eye pair per facing (outline + lid + white glints +
// 3-shade iris); the iris cyan trio is recolored per character. Direction picks the visible
// physical eye: front = viewer-left/right split; walking screen-left shows the character's
// left eye (the front view's viewer-right eye), walking screen-right the character's right.
export function headIrisRecolor(head,c){
  // ImageData width/height are prototype getters in browsers and disappear under object spread.
  const out={width:head.width,height:head.height,data:new Uint8ClampedArray(head.data)};
  for(let i=0;i<out.data.length;i+=4){const [r,g,b]=out.data.subarray(i,i+3),shade=r===108&&g===220&&b===231?0:r===79&&g===143&&b===186?1:r===24&&g===80&&b===111?2:-1;if(shade<0)continue;
    const px=i/4,x=px%512,row=Math.floor(px/512/64);
    const palette=c.otherEye?(row===1?c.otherEye:row===2&&x%64>=32?c.otherEye:c.iris):c.iris;
    out.data.set(rgb(palette[shade]),i);
  }
  return out;
}
// Face polish on top of the baked features: the baked pair is the single eye system, so only
// the front nose tip and mouth line are added (the baked front face has neither in the centre).
export function walkFaces(out,c,head){
  for(let col=0;col<8;col++){
    const fx=col*64,fy=2*64;let x0=64,x1=0,y0=64;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(head.data[((fy+y)*512+fx+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);}
    const d=painter(out,fx+Math.floor((x0+x1)/2),fy+y0);
    d.put(0,15,'#b78376');d.line(-1,17,1,17,'#835964');
  }
  return out;
}
// Stage costume geometry, same shapes as baseline but anchored to the frame's garment centre at
// the body top (the head and body bob together, so placement is a pure y-translation of the
// old head-anchored offsets). composeWalk re-blends arm pixels over this pass afterwards.
function walkCostume(d,c,row){
  const style=c.costume||'',front=row===2,side=row===1||row===3,w=side?5:7,yb=row===2?2:3,ink='#343240',white='#f1f2ed',shade='#aab9c8',gold='#d9ba77',black='#30303c';
  const y=n=>yb+n-19;
  // Full-length chest piece for every direction: coat/skirt length is preserved, and the moving
  // sleeve/arm pixels of the garment/body layers are re-blended over this pass by composeWalk
  // (nearArm mask), so the front-swinging arm stays visible without shortening the garment.
  const torso=(color)=>d.poly([[-w,y(19)],[w,y(19)],[w-1,y(27)],[w,y(31)],[-w,y(31)],[-w+1,y(27)]],color);
  const skirt=(color,length=6)=>{d.poly([[-w,y(30)],[w,y(30)],[w+2,y(30)+length],[-w-2,y(30)+length]],color);if(!side)for(let x=-w+2;x<w;x+=3)d.line(x,y(32),x+1,y(29)+length,color===white?shade:'#62586b');};
  const open=(outer,inner)=>{torso(outer);if(front){d.rect(-3,y(21),6,9,inner);d.line(-4,y(21),-5,y(30),shade);d.line(4,y(21),5,y(30),shade);}};
  if(style.startsWith('mygo')){
    open(style==='mygo-black-coat'?black:white,black);
    if(front){d.line(-5,y(19),-2,y(22),shade);d.line(5,y(19),2,y(22),shade);d.rect(-8,y(19),3,3,'#8bc7cf');d.rect(6,y(19),3,3,'#8bc7cf');d.rect(3,y(24),2,2,gold);}
    if(style==='mygo-wrap-skirt'){skirt(black,5);d.line(w-1,y(32),w+1,y(34),'#8bc7cf');}
    if(style==='mygo-black-coat'){if(!side){d.rect(-w-1,y(30),3,6,black);d.rect(w-1,y(30),3,6,black);}if(front)d.line(3,y(31),3,y(37),'#80c9cd');}
    if(style==='mygo-waist-plaid'){skirt(black,8);d.poly([[-w-1,y(30)],[0,y(31)],[-2,y(38)],[-w-3,y(37)]],'#4e8582');if(!side){d.line(-w,y(33),-2,y(34),'#8ab2a4');d.line(-w+2,y(31),-w+1,y(37),'#8ab2a4');}}
    if(style==='mygo-offshoulder'){
      torso(black);
      // White-cyan jacket slipped off the shoulders; arms pass in front of it.
      if(front){d.line(-5,y(30),6,y(30),gold);for(const s of [-1,1]){d.rect(s*6-1,y(19),3,3,'#f3f5ef');d.rect(s*6-1,y(22),3,2,'#8bc7cf');}}
      else if(row===0){d.rect(-2,y(19),5,2,'#f3f5ef');d.rect(-2,y(21),5,2,'#8bc7cf');}
      else {d.rect(-1,y(19),3,3,'#f3f5ef');d.rect(-1,y(22),3,2,'#8bc7cf');}
    }
  }else if(style.startsWith('mujica')){
    const red=['mujica-red-corset','mujica-red-skirt'].includes(style);torso(red?'#9d4256':black);
    if(front){d.line(-5,y(21),-3,y(29),gold);d.line(5,y(21),3,y(29),gold);for(let yy=y(23);yy<y(30);yy+=3)d.put(0,yy,gold);d.line(-4,y(19),0,y(21),white);d.line(4,y(19),0,y(21),white);d.line(-w,y(30),w,y(30),gold);}
    if(!['mujica-shorts','mujica-cape'].includes(style)){skirt(red?'#963e53':black,7);d.line(-w-1,y(36),w+1,y(36),gold);}
    if(style==='mujica-red-shoulders'){d.poly([[-10,y(19)],[-6,y(18)],[-5,y(23)],[-10,y(24)]],'#9d4256');d.poly([[6,y(18)],[10,y(19)],[10,y(24)],[5,y(23)]],'#9d4256');}
    if(style==='mujica-cape'){d.poly([[-10,y(18)],[-3,y(18)],[-1,y(25)],[-10,y(26)]],'#8e3549');d.line(-9,y(25),-2,y(23),gold);}
  }else if(style.startsWith('millsage')){
    torso(white);skirt(white,style==='millsage-crop'?11:style==='millsage-drape'?8:7);
    if(front){for(const x of [-4,3])d.line(x,y(22),x,y(35),shade);if(style==='millsage-tie')d.poly([[-1,y(21)],[1,y(21)],[2,y(28)],[0,y(30)],[-2,y(28)]],'#444955');else d.put(3,y(21),'#99b4aa');}
    if(style==='millsage-crop'&&front)d.rect(-5,y(28),11,3,'#efc1ac');
    if(['millsage-ruffle','millsage-pleats','millsage-crop'].includes(style)){for(const x of [-9,7]){d.rect(x,y(20),3,3,white);d.line(x,y(23),x+2,y(23),shade);}}
  }else if(style.startsWith('mew')){
    if(style==='mew-yellow'){torso('#aad7e8');skirt('#e4c366');if(front){d.line(-4,y(20),0,y(22),white);d.line(4,y(20),0,y(22),white);d.rect(-5,y(29),11,3,'#e4c366');d.rect(-1,y(23),2,3,black);d.line(-w,y(36),w,y(36),black);}}
    else if(style==='mew-pink-check'){torso('#df91b4');skirt('#efb0c7');if(front){for(const x of [-4,1])d.line(x,y(22),x,y(27),white);d.line(-5,y(24),5,y(24),white);d.rect(-5,y(28),11,3,'#efc1ac');}d.line(-w,y(36),w,y(36),white);}
    else if(style==='mew-blue'){open(white,'#a5cfe5');skirt('#4e5e83',5);d.line(-w,y(34),w,y(34),'#94d4ef');}
    else if(style==='mew-purple-lace'){torso('#45364f');skirt('#8a77a3',8);d.line(-w,y(36),w,y(36),white);if(front)for(let yy=y(23);yy<y(30);yy+=2){d.line(-2,yy,2,yy+1,gold);d.line(2,yy,-2,yy+1,gold);}}
    else {open('#c25d8b',black);if(!side){d.rect(-w-1,y(30),3,6,'#c25d8b');d.rect(w-1,y(30),3,6,'#c25d8b');}if(front)d.rect(-3,y(27),6,3,'#efc1ac');}
  }else if(style==='ref-college'){
    // Tomori reference redesign: blue-and-white varsity jacket (torso white via the main cloth
    // ramp, animated sleeves remapped blue by sleevePalette), white shirt V, gold trim,
    // grey-olive pleated skirt, bare legs, white-pink shoes.
    open('#f2f2ec','#f8f8f8');
    if(front){d.line(-5,y(19),-2,y(22),shade);d.line(5,y(19),2,y(22),shade);d.rect(-1,y(23),2,2,gold);d.rect(-1,y(27),2,2,gold);d.rect(-2,y(19),4,2,'#54789f');}
    skirt('#84887b',7);
    if(front)for(const x of [-4,3])d.line(x,y(32),x+1,y(29)+7,'#6a6e62');
  }else if(style==='ref-bluedress'){
    // Rana reference redesign: bright blue off-shoulder dress with white neckline trim, black
    // choker, dark-red guitar strap across the chest, long blue skirt, fishnet legs, white shoes.
    torso('#6890b8');
    if(front){d.rect(-4,y(19),9,2,'#eef0ea');d.line(-4,y(23),4,y(27),'#501008');d.line(4,y(23),-3,y(28),'#3c0c06');}
    else if(row===0){d.rect(-2,y(19),5,2,'#eef0ea');}
    else {d.rect(-1,y(19),3,2,'#eef0ea');}
    skirt('#54789f',8);
    if(front)d.line(-w-1,y(30)+8,w+1,y(30)+8,'#eef0ea');
  }else if(style==='ref-gothic'){
    // Sakiko reference redesign: deep-red bodice with black lace, red puff shoulder caps, black
    // layered skirt with cream frill hem, silver accents (black side/back bows stay from accessory).
    torso('#8c2430');
    if(front){d.rect(-1,y(20),1,10,'#1a1a20');d.line(-4,y(21),-4,y(28),'#1a1a20');d.line(4,y(21),4,y(28),'#1a1a20');d.rect(0,y(22),1,1,'#b9c0c8');}
    d.poly([[-10,y(19)],[-6,y(18)],[-5,y(23)],[-10,y(24)]],'#94242c');d.poly([[6,y(18)],[10,y(19)],[10,y(24)],[5,y(23)]],'#94242c');
    skirt('#1c1c22',8);
    if(!side)for(let x=-w+1;x<w;x+=2)d.line(x,y(30)+8,x,y(30)+9,'#d3c3b2');
    d.line(-w-1,y(30)+8,w+1,y(30)+8,'#d3c3b2');
  }else if(style.startsWith('ikka')){
    if(style==='ikka-teal-plaid'){open('#55938f',black);if(front){d.line(-5,y(22),-5,y(33),'#a0b8a2');d.line(5,y(22),5,y(33),'#a0b8a2');d.line(-7,y(26),-4,y(26),'#a0b8a2');d.line(4,y(26),7,y(26),'#a0b8a2');}}
    else if(style==='ikka-purple-bomber'){open('#636486',white);if(front){d.line(-6,y(19),-3,y(21),'#dfd27f');d.line(6,y(19),3,y(21),'#dfd27f');d.line(-5,y(31),5,y(31),gold);d.put(-8,y(25),'#91bbd6');}}
    else if(style==='ikka-pinstripe'){open(c.cloth?c.cloth[1]:'#52697e',black);for(const x of [-5,5])d.line(x,y(21),x,y(34),'#8fa3b1');}
    else if(style==='ikka-patchwork'){torso('#d887b6');skirt('#4a566e');if(front){d.rect(-5,y(28),11,3,'#efc1ac');d.line(-6,y(31),6,y(31),'#e4d27b');d.rect(3,y(33),3,4,'#60869b');}}
    else {torso('#999da2');skirt(black);if(front){d.line(-4,y(20),-1,y(29),'#e2d77e');d.line(4,y(20),1,y(29),'#e2d77e');d.rect(-9,y(25),2,6,'#bf7778');for(let yy=y(25);yy<y(32);yy+=2)d.put(-9,yy,white);}}
  }
}
function frameAnchor(im,row,col){const fx=col*64,fy=row*64;let x0=64,x1=0,y0=64;for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(im.data[((fy+y)*512+fx+x)*4+3]){x0=Math.min(x0,x);x1=Math.max(x1,x);y0=Math.min(y0,y);}return {fx,fy,cx:Math.floor((x0+x1)/2),top:y0};}
// Pokémon-style baseline: every region of the sprite keeps a 1px INNER outline in a colour
// darker than that region's own shadow tone (coloured outline, not black); black-ish ink is the
// fallback for colours that belong to no known ramp. Inner outline = silhouette edge pixels are
// replaced in place, so extents/anchor/feet placement are untouched.
function pokeOutline(sheet,c){
  const ramps=[c.hair,c.cloth,c.sleevePalette,c.shoePalette,c.iris,c.otherEye].filter(Boolean).map(p=>p.map(rgb));
  const SKIN=[['#f9d5ba'],['#edc5a8'],['#d38b59'],['#ae6b3f'],['#95381c']].map(p=>p.map(rgb));
  const ink=[36,31,43];
  for(let row=0;row<4;row++)for(let col=0;col<8;col++){
    const fx=col*64,fy=row*64,edges=[];
    for(let y=0;y<64;y++)for(let x=0;x<64;x++){
      const j=((fy+y)*512+fx+x)*4;if(!sheet.data[j+3])continue;
      const open=(xx,yy)=>xx<0||yy<0||xx>63||yy>63||!sheet.data[((fy+yy)*512+fx+xx)*4+3];
      if(open(x-1,y)||open(x+1,y)||open(x,y-1)||open(x,y+1))edges.push(j);
    }
    for(const j of edges){
      const r=sheet.data[j],g=sheet.data[j+1],b=sheet.data[j+2];
      let best=null,bestD=1e9;
      for(const ramp of [...ramps,...SKIN.map(s=>[s[0]])]){
        for(const [r2,g2,b2] of ramp){
          const d=(r-r2)**2+(g-g2)**2+(b-b2)**2;
          if(d<bestD){bestD=d;best=ramp;}
        }
      }
      if(best&&bestD<=3600){
        // outline = shadow colour of the region's ramp, darkened one more step
        const s=best[best.length-1];
        sheet.data.set([Math.round(s[0]*0.6),Math.round(s[1]*0.6),Math.round(s[2]*0.6),255],j);
      }else sheet.data.set([...ink,255],j);
    }
  }
  return sheet;
}
const SLEEVELESS=['mygo-offshoulder','ref-bluedress'];
const SHOULDER_STRIP=['mygo-offshoulder','ref-bluedress','millsage-ruffle','millsage-crop','mew-yellow','mew-purple-lace'];
export function composeWalk(c,sources,stage='final',diag){
  const names=walkLayerNames(c);
  if(!c.band){const out=blank(512,256);for(const name of names)blend(out,name==='head'?headIrisRecolor(sources.head,c):sources[name]);return walkFaces(out,c,sources.head);}
  const [body,pants,shirt,shoes,head,hair]=names.map(n=>sources[n]);
  const legwear=recolor(pants,c.walkLegwear==='pants-white'?['#faf8f0','#ccd5dc','#8b9aa8']:['#596174','#303744','#202636']);
  const legPalette={white:['#f6f5ed','#d4dce4','#9baab9'],pink:['#f4aecb','#ce6b9d','#8d416f'],blue:['#abdcef','#65a8d4','#3b6a9b'],yellow:['#f4dc8b','#d6b45d','#907949']};
  if(legPalette[c.walkLegwear]){const dyed=recolor(pants,legPalette[c.walkLegwear]);for(let i=0;i<legwear.data.length;i+=4)if(Math.floor(i/4/512)%64>=53)legwear.data.set(dyed.data.subarray(i,i+4),i);}
  if(['bare','warmers','striped','net'].includes(c.walkLegwear))for(let i=0;i<legwear.data.length;i+=4){const y=Math.floor(i/4/512)%64,x=Math.floor(i/4)%64;if(y>=53){
    if(c.walkLegwear==='bare'||c.walkLegwear==='warmers'&&y<56)legwear.data[i+3]=0;
    else if(c.walkLegwear==='striped'&&y%2===0&&legwear.data[i+3])legwear.data.set([228,232,225],i);
    else if(c.walkLegwear==='net'&&(x+y)%2===0&&legwear.data[i+3])legwear.data[i+3]=0;}}
  const shirtR=recolor(shirt,c.cloth);
  // Base figure: skin, legwear, garment, shoes. Sleeves animate with the LPC arms; sleeveless
  // styles drop the animated sleeve pixels so the bare arm comes from the body layer.
  const anchors0=[...Array(4)].map((_,row)=>[...Array(8)].map((_,col)=>({garment:frameAnchor(shirtR,row,col),body:frameAnchor(body,row,col)})));
  // Arm masks per direction/frame, computed from the raw layer alphas before any compositing.
  // The LPC garment/body layers contain the arm animation: pixels whose colour deviates from the
  // 8-frame median (aligned by the body bob) carry the moving sleeve/hand track, and pixels
  // outside the always-covered torso silhouette are the protruding limbs. Legs are excluded via
  // the pants/shoes layers. nearArm = deviation track ∪ protrusions on the back/near side; farArm
  // = remaining detached protrusions. `sleeve` = arm pixels covered by the garment layer, used to
  // remap sleeves to a second palette (two-tone jackets) before the base is built.
  const armInfo=[];
  for(let row=0;row<4;row++){
    const tops=anchors0[row].map(a=>a.body.top);
    const cx=anchors0[row][0].garment.cx;
    // Aligned coordinate a = abs_row - tops[f]: every frame's own top becomes row 0, which
    // removes the 1px walking bob before comparing frames.
    const at=(f,x,a)=>{const yy=a+tops[f];return yy<0||yy>63?-1:((row*64+yy)*512+f*64+x)*4;};
    const opaque=(f,x,a)=>{const j=at(f,x,a);return j>=0&&(body.data[j+3]!==0||shirtR.data[j+3]!==0);};
    const legs=(f,x,a)=>{const j=at(f,x,a);return j>=0&&(pants.data[j+3]!==0||shoes.data[j+3]!==0);};
    const torsoM=new Uint8Array(64*64),interior=new Uint8Array(64*64),dil=new Uint8Array(64*64);
    for(let a=0;a<64;a++)for(let x=0;x<64;x++){let all=1;
      for(let f=0;f<8;f++)if(!opaque(f,x,a)){all=0;break;}
      torsoM[a*64+x]=all;}
    for(let a=1;a<63;a++)for(let x=1;x<63;x++){let all=1;
      for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]])if(!torsoM[(a+dy)*64+x+dx]){all=0;break;}
      interior[a*64+x]=all;}
    for(let a=0;a<64;a++)for(let x=0;x<64;x++)if(torsoM[a*64+x])for(const [dx,dy] of [[0,0],[1,0],[-1,0],[0,1],[0,-1]]){const nx=x+dx,na=a+dy;if(nx>=0&&na>=0&&nx<64&&na<64)dil[na*64+nx]=1;}
    // Raw-layer red channel vs the 8-frame median: the garment/body art carries the sleeve and
    // hand animation as a moving shade track. Measured on the raw palette (recolor compresses
    // the steps); threshold 14 validated against the source sheets.
    const RED=14;
    const layerR=(f,j)=>shirt.data[j+3]!==0?shirt.data[j]:body.data[j+3]!==0?body.data[j]:null;
    const medianDev=(f,x,a)=>{const vals=[];
      for(let g=0;g<8;g++){const j=at(g,x,a);const v=j>=0?layerR(g,j):null;if(v==null)return 0;vals.push(v);}
      vals.sort((p,q)=>p-q);const med=(vals[3]+vals[4])/2;const jf=at(f,x,a);const fv=jf>=0?layerR(f,jf):null;
      return fv==null?0:Math.abs(fv-med);};
    const backDx=row===1?1:row===3?-1:0;
    const info=[];
    for(let f=0;f<8;f++){
      const armPx=(x,y)=>{const a=y-tops[f];return a>=0&&a<64&&y>=tops[f]-1&&y<=47&&Math.abs(x-cx)<=14
        &&!legs(f,x,a)&&opaque(f,x,a)
        &&((interior[a*64+x]&&medianDev(f,x,a)>RED)||!dil[a*64+x]);};
      const comps=[];const seen=new Set();
      for(let y=tops[f]-1;y<=47;y++)for(let x=cx-14;x<=cx+14;x++){
        if(!armPx(x,y)||seen.has(y*64+x))continue;
        const comp=[[x,y]];seen.add(y*64+x);const q=[[x,y]];
        while(q.length){const [qx,qy]=q.pop();for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[1,-1],[-1,1],[-1,-1]]){const nx=qx+dx,ny=qy+dy;if(armPx(nx,ny)&&!seen.has(ny*64+nx)){seen.add(ny*64+nx);comp.push([nx,ny]);q.push([nx,ny]);}}}
        comps.push(comp);}
      // near = components carrying the deviation track (sleeve shading moving inside the torso)
      // or lying on the back side; far = detached protrusions on the leading edge.
      const isTrack=p=>{const a=p[1]-tops[f];return interior[a*64+p[0]]!==0&&medianDev(f,p[0],a)>RED;};
      let trackCount=0;const near=[],far=[];
      for(const comp of comps){
        const track=comp.some(isTrack);
        if(track)trackCount+=comp.length;
        const onBack=backDx!==0&&comp.some(([x])=>(x-cx)*backDx>4);
        if(track||onBack)near.push(...comp);else far.push(...comp);}
      const idx=pts=>pts.map(([x,y])=>((row*64+y)*512+f*64+x)*4);
      const nearIdx=idx(near),farIdx=idx(far);
      const sleeve=nearIdx.concat(farIdx).filter(j=>shirtR.data[j+3]!==0);
      info.push({phase:trackCount>=30?'front':trackCount>=8?'mid':'pass',near:nearIdx,far:farIdx,sleeve,nearCount:near.length,farCount:far.length});
    }
    armInfo.push(info);
  }
  // Two-tone garments (varsity jackets): animated sleeve pixels get a second palette before the
  // base is built, so the remapped sleeves ride the arm animation and re-blend with the near arm.
  if(c.sleevePalette){const sr=recolor(shirt,c.sleevePalette);
    for(const info of armInfo)for(const {sleeve}of info)for(const j of sleeve)shirtR.data.set(sr.data.subarray(j,j+4),j);}
  if(SLEEVELESS.includes(c.costume))for(let row=0;row<4;row++)for(let col=0;col<8;col++){const cx=anchors0[row][col].garment.cx,fx=col*64,fy=row*64;
    for(let y=0;y<64;y++)for(let x=0;x<64;x++)if(Math.abs(x-cx)>4){const j=((fy+y)*512+fx+x)*4;if(shirtR.data[j+3])shirtR.data[j+3]=0;}}
  const base=blank(512,256);blend(base,body);blend(base,legwear);blend(base,shirtR);blend(base,recolor(shoes,c.shoePalette||['#57586b','#353645','#202636']));
  if(SHOULDER_STRIP.includes(c.costume)&&!SLEEVELESS.includes(c.costume))for(let row=0;row<4;row++)for(let col=0;col<8;col++){const a=anchors0[row][col],fx=col*64,fy=row*64;
    for(let yy=a.body.top+2;yy<a.body.top+13;yy++)for(let xx=a.garment.cx-13;xx<=a.garment.cx+13;xx++)if(Math.abs(xx-a.garment.cx)>6){const j=((fy+yy)*512+fx+xx)*4;if(shirtR.data[j+3]&&body.data[j+3])base.data.set(body.data.subarray(j,j+4),j);}}
  const out=blank(512,256);
  // Side-view hair tails hang behind the body: drawn before the base so the body, torso clothes
  // and the re-blended near arm pass in front of them. Both twin tails keep their FULL length —
  // ends are never trimmed; where they overlap the figure they are occluded and only reappear in
  // the transparent gaps past the silhouette (front/back view tails are drawn later, above).
  const sideTail=(row,col)=>{const a=frameAnchor(head,row,col),d=painter(out,a.fx+a.cx,a.fy+a.top),h=c.hair,style=c.walkStyle,tail=c.walkTailLength??(['long','wavy','twins','braids'].includes(style)?32:style==='medium'||style==='wavy-medium'?23:0);
    if(!tail)return;
    if(style==='twins'||style==='braids'){
      const wobble=style==='braids'?col%2:Math.floor(col/3)%2;
      for(const s of [-1,1]){
        d.poly([[s*7,1],[s*11,4],[s*(11+wobble),tail],[s*7,tail+3],[s*6,8]],h[2]);d.line(s*8,6,s*9,tail-1,h[1]);if(style==='braids')for(let yy=7;yy<tail;yy+=4)d.line(s*7,yy,s*10,yy+1,h[0]);}
    }else if(style==='long'||style==='wavy'){
      const s=row===1?1:-1;d.poly([[s*3,4],[s*9,6],[s*10,tail-1],[s*6,tail+3],[s*3,tail-2]],h[2]);d.line(s*6,8,s*7,tail,h[1]);}};
  for(let row=1;row<4;row+=2)for(let col=0;col<8;col++)sideTail(row,col);
  blend(out,base);
  if(stage!=='bare'){
    // Stage costume pieces, anchored per frame to the garment centre at the body top (the head
    // and body bob together). Coat/skirt length is preserved to the baseline geometry.
    for(let row=0;row<4;row++){const cx=anchors0[row][0].garment.cx;
      for(let f=0;f<8;f++)walkCostume(painter(out,f*64+cx,row*64+anchors0[row][f].body.top),c,row);}
    // Near arm + sleeve + hand come back over the torso clothes (and over the back tail).
    for(const info of armInfo)for(const {near}of info)for(const j of near)out.data.set(base.data.subarray(j,j+4),j);
  }
  if(stage==='clothes')return out;
  // Hair tails for front/back views ride behind the head; each overlay follows the source head's
  // per-frame position, including the one-pixel walking bob.
  for(let row of [0,2])for(let col=0;col<8;col++){
    const a=frameAnchor(head,row,col),d=painter(out,a.fx+a.cx,a.fy+a.top),h=c.hair,style=c.walkStyle,tail=c.walkTailLength??(['long','wavy','twins','braids'].includes(style)?32:style==='medium'||style==='wavy-medium'?23:0);
    if(tail){
      if(style==='twins'||style==='braids'){
        for(const s of [-1,1]){const wobble=style==='braids'?col%2:Math.floor(col/3)%2;d.poly([[s*7,1],[s*11,4],[s*(11+wobble),tail],[s*7,tail+3],[s*6,8]],h[2]);d.line(s*8,6,s*9,tail-1,h[1]);if(style==='braids')for(let yy=7;yy<tail;yy+=4)d.line(s*7,yy,s*10,yy+1,h[0]);}
      }else if(row===0){d.poly([[-8,3],[8,3],[9,tail-2],[5,tail+2],[-7,tail+1],[-10,tail-3]],h[2]);for(let xx=-6;xx<=6;xx+=3)d.line(xx,8,xx+(style.includes('wavy')?2:0),tail,h[1]);}
      else for(const s of [-1,1]){d.poly([[s*7,5],[s*10,7],[s*10,tail],[s*7,tail+2],[s*6,11]],h[2]);d.line(s*8,8,s*8,tail,h[1]);}
    }
  }
  const coloredHead=headIrisRecolor(head,c);
  blend(out,coloredHead);blend(out,recolor(hair,c.hair));
  // Neck accessories (choker/chain) sit on the front neck below the chin, above hair.
  if(c.refChoker)for(let col=0;col<8;col++){
    const a=frameAnchor(head,2,col),d=painter(out,a.fx+a.cx,a.fy+a.top);
    d.rect(-3,20,7,1,c.refChoker);if(c.refChain)d.put(-2,21,c.refChain),d.put(2,21,c.refChain);
  }
  for(let row=0;row<4;row++)for(let col=0;col<8;col++){
    const a=frameAnchor(head,row,col),d=painter(out,a.fx+a.cx,a.fy+a.top),side=row===1?-1:row===3?1:0;
    if(c.walkStyle==='asym-bob'&&row===2){d.poly([[-7,2],[0,3],[-1,15],[-5,17],[-8,11]],c.hair[1]);d.line(-6,5,-4,14,c.hair[0]);}
    if(c.streak){const sx=side?side*-4:-5;d.line(sx,0,sx,7,c.streak);if(row===0)d.line(-4,8,-4,17,c.streak);}
    const central=['beret','cat-yellow','cat-pink','bear-blue','bunny','pearl-band','veil','earrings'].includes(c.accessory),flowerSide=c.accessory==='flower-left'?1:-1;
    // Back view gets the headgear, while face details stay exclusively on front/profile frames.
    if(['black-bows','red-ties'].includes(c.accessory)){if(row===0||row===2){ornament(d,c.accessory,-8,3,1,c.accent);ornament(d,c.accessory,8,3,1,c.accent);}else ornament(d,c.accessory,row===1?5:-5,3,1,c.accent);}
    else if(central||row!==0)ornament(d,c.accessory,central?0:flowerSide*6,central?-1:4,1,c.accent);
  }
  const result=walkFaces(out,c,head);
  if(stage==='diagnostic'){
    // Mask/layer diagnostics: sprite dimmed to 45%, near arm red, far arm blue, torso yellow.
    for(let i=0;i<result.data.length;i+=4)if(result.data[i+3]){result.data[i]=Math.round(result.data[i]*0.45+140*0.55);result.data[i+1]=Math.round(result.data[i+1]*0.45+140*0.55);result.data[i+2]=Math.round(result.data[i+2]*0.45+140*0.55);}
    for(const info of armInfo)for(const {near,far}of info){
      for(const j of near){result.data[j]=Math.round(result.data[j]*0.3+235*0.7);result.data[j+1]=Math.round(result.data[j+1]*0.3+70*0.7);result.data[j+2]=Math.round(result.data[j+2]*0.3+70*0.7);}
      for(const j of far){result.data[j]=Math.round(result.data[j]*0.3+70*0.7);result.data[j+1]=Math.round(result.data[j+1]*0.3+150*0.7);result.data[j+2]=Math.round(result.data[j+2]*0.3+235*0.7);}}
    return result;
  }
  if(diag)diag.push(armInfo);
  return result;
}
