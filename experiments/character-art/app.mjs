import {PRESETS,renderPortrait,renderWalkSheet,loadImage,saveCanvas,saveJSON} from './portrait-kit.mjs';
import {BANDS} from '../../data/band-appearances.mjs';
const $=s=>document.querySelector(s),byId=new Map(PRESETS.map(p=>[p.id,p]));
let current=structuredClone(byId.get('bd-tomori')),portraits=new Map(),sheets=new Map(),livePortrait,revision=0,activeTab='walk',paused=false,cycle=false,portraitScale=3;
const notice=text=>$('#notice').textContent=text;
const attribution={portrait:{author:'Viktor Hahn',license:'CC-BY-4.0',source:'https://github.com/V-ktor/pixel-art-portraits',modifications:'JavaScript layer compositor, palette changes and selected combinations'},walk:{authors:['Stephen Challener (Redshrike)','Eliza Wyatt (DeathsDarling)'],license:'OGA-BY-3.0',source:'https://github.com/ElizaWy/LPC',modifications:'Layer composition only; individual credit files are included in sources/lpc'}};
function cloneCanvas(source){const c=document.createElement('canvas');c.width=source.width;c.height=source.height;c.getContext('2d').drawImage(source,0,0);return c;}
function showPortrait(selector,source){$(selector).replaceChildren(cloneCanvas(source));}
function updateFields(){
  $('#preset').value=current.id;$('#hair-color').value=current.hair[0];$('#cloth-color').value=current.cloth[0];$('#expression').value=current.eyes==='closed01'?'closed01':'open';$('#fringe').value=current.front;
}
async function refreshCurrent(){
  const id=++revision,[next,sheet]=await Promise.all([renderPortrait(current),renderWalkSheet(current)]);if(id!==revision)return;sheets.set(current.id,sheet);livePortrait=next;showPortrait('#large-portrait',next);$('#large-portrait canvas').style.cssText=`width:${96*portraitScale}px;height:${96*portraitScale}px`;showPortrait('#dialog-portrait',next);$('#dialog-role').textContent='顾客';$('#dialog-name').textContent='Maya Chen';$('#config').textContent=JSON.stringify({...current,attribution},null,2);$('#appearance-note').textContent=(current.characterName||current.name)+' · '+(current.features||'基础外观模板');$('#appearance-reference').href=current.reference||'./CREDITS.md';
  document.querySelectorAll('.roster-card').forEach(b=>b.classList.toggle('active',b.dataset.id===current.id));
}
async function select(id){current=structuredClone(byId.get(id));updateFields();await refreshCurrent();}
const bandSelect=document.createElement('select');bandSelect.id='band-filter';bandSelect.setAttribute('aria-label','按乐团筛选外观');for(const b of [...BANDS,{id:'base',name:'基础模板'},{id:'all',name:'全部 28 套'}]){const o=document.createElement('option');o.value=b.id;o.textContent=b.name;bandSelect.append(o);}$('#roster-toolbar').append(bandSelect);
function filterRoster(){document.querySelectorAll('.roster-card').forEach(b=>{const p=byId.get(b.dataset.id),band=bandSelect.value;b.hidden=band!=='all'&&(p.band||'base')!==band;});}
bandSelect.addEventListener('change',async()=>{filterRoster();const next=PRESETS.find(p=>bandSelect.value==='all'||(p.band||'base')===bandSelect.value);if(next)await select(next.id);});
for(const p of PRESETS){const o=document.createElement('option');o.value=p.id;o.textContent=p.name;$('#preset').append(o);}
document.querySelectorAll('[data-tab]').forEach(button=>button.addEventListener('click',()=>{activeTab=button.dataset.tab;document.querySelectorAll('[data-tab]').forEach(b=>b.classList.toggle('active',b===button));document.querySelectorAll('.panel').forEach(p=>p.classList.toggle('active',p.id===activeTab));notice('');}));
$('#preset').addEventListener('change',e=>select(e.target.value));
for(const [id,key]of [['hair-color','hair'],['cloth-color','cloth']])$( '#'+id).addEventListener('input',e=>{const hex=e.target.value,channels=hex.match(/\w\w/g).map(n=>parseInt(n,16));current[key]=[hex,'#'+channels.map(n=>Math.round(n*.63).toString(16).padStart(2,'0')).join(''),'#'+channels.map(n=>Math.round(n*.38).toString(16).padStart(2,'0')).join('')];refreshCurrent();});
$('#expression').addEventListener('change',e=>{current.eyes=e.target.value==='open'?byId.get(current.id).eyes:e.target.value;refreshCurrent();});$('#fringe').addEventListener('change',e=>{current.front=e.target.value;refreshCurrent();});
document.querySelectorAll('[data-scale]').forEach(b=>b.addEventListener('click',()=>{document.querySelectorAll('[data-scale]').forEach(x=>x.classList.toggle('selected',x===b));portraitScale=Number(b.dataset.scale);$('#large-portrait').querySelector('canvas').style.cssText=`width:${96*portraitScale}px;height:${96*portraitScale}px`;}));
$('#export-png').addEventListener('click',()=>saveCanvas(livePortrait,current.id+'-portrait-96.png'));$('#export-sheet').addEventListener('click',()=>{saveCanvas(sheets.get(current.id),current.id+'-walk-64x64.png');notice('已导出 64×64 单帧、8 列×4 行图集；行序：上、左、下、右。五团模板的发色与服装主色共享配置。');});$('#export-json').addEventListener('click',()=>saveJSON({version:2,portrait:current,walk:{frameWidth:64,frameHeight:64,columns:8,directions:{up:0,left:1,down:2,right:3},prototypeOnly:true},attribution},current.id+'-appearance.json'));
$('.brand').addEventListener('click',e=>e.preventDefault());document.querySelectorAll('.choices button,.zone-action').forEach(b=>b.addEventListener('click',()=>notice('这是独立视觉样稿；该入口未接入正式游戏业务。')));
$('#motion-toggle').addEventListener('click',()=>{paused=!paused;$('#motion-toggle').textContent=paused?'继续动作':'暂停动作';});$('#side-demo').addEventListener('click',()=>{cycle=!cycle;$('#side-demo').textContent=cycle?'退出四向轮播':'四向轮播';});
const screen=$('#shop'),ctx=screen.getContext('2d');ctx.imageSmoothingEnabled=false;
const player={x:244,y:242,direction:'down',moving:false},keys=new Set(),directionRows={up:0,left:1,down:2,right:3};let destination=null,last=performance.now(),time=0;
document.addEventListener('keydown',e=>{if(activeTab!=='walk'||/INPUT|SELECT|TEXTAREA/.test(e.target.tagName)||!['ArrowUp','ArrowDown','ArrowLeft','ArrowRight','w','a','s','d','W','A','S','D'].includes(e.key))return;e.preventDefault();keys.add(e.key.toLowerCase());destination=null;});document.addEventListener('keyup',e=>keys.delete(e.key.toLowerCase()));window.addEventListener('blur',()=>keys.clear());
screen.addEventListener('click',e=>{const r=screen.getBoundingClientRect();destination={x:(e.clientX-r.left)*480/r.width,y:(e.clientY-r.top)*320/r.height};});
function label(text,x,y){ctx.font='8px "Microsoft YaHei",sans-serif';ctx.textAlign='center';const w=ctx.measureText(text).width;ctx.fillStyle='#1d2b2be6';ctx.fillRect(x-w/2-4,y-8,w+8,13);ctx.fillStyle='#f2ead0';ctx.fillText(text,x,y+1);}
async function start(){
  for(const p of PRESETS){portraits.set(p.id,await renderPortrait(p));sheets.set(p.id,await renderWalkSheet(p));}
  for(const p of PRESETS){const b=document.createElement('button');b.className='roster-card';b.dataset.id=p.id;b.append(cloneCanvas(portraits.get(p.id)));const span=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=p.name;small.textContent=BANDS.find(v=>v.id===p.band)?.name||'基础外观';span.append(strong,small);b.append(span);b.addEventListener('click',()=>select(p.id));$('#walk-roster').append(b);}filterRoster();
  showPortrait('#keeper-portrait',portraits.get('keeper'));
  for(const [target,id,state]of [['#checkout-face','collector','正在挑选卡盒'],['#market-face','regular','正在查看寄售']]){const el=$(target),span=document.createElement('span'),strong=document.createElement('strong'),small=document.createElement('small');strong.textContent=byId.get(id).name.split(' · ')[1];small.textContent=state;span.append(strong,small);el.append(cloneCanvas(portraits.get(id)),span);}
  updateFields();await refreshCurrent();
  const manifest=await fetch('/assets/frontend/manifest.json').then(r=>r.json()),map=await fetch(manifest.maps.store).then(r=>r.json()),tiles=await loadImage(manifest.tileset.image),props=await loadImage(manifest.props.image),back=document.createElement('canvas');back.width=480;back.height=320;const bg=back.getContext('2d');bg.imageSmoothingEnabled=false;
  const tf=manifest.tileset.frameSize||16;
  for(const l of map.layers)for(let i=0;i<l.data.length;i++){const n=l.data[i];if(n>=0)bg.drawImage(tiles,n%manifest.tileset.columns*tf,Math.floor(n/manifest.tileset.columns)*tf,tf,tf,i%map.width*16,Math.floor(i/map.width)*16,16,16);}
  const allProps=[...map.props].sort((a,b)=>(['rug','door_mat'].includes(a.prop)?-100:a.y+a.footY)-(['rug','door_mat'].includes(b.prop)?-100:b.y+b.footY));
  for(const p of allProps){const source=manifest.props.list.find(s=>s.prop===p.prop);bg.drawImage(props,source.x,source.y,source.w,source.h,p.x,p.y,p.w,p.h);}
  const can=(x,y)=>x>=5&&x<475&&y>=15&&y<314&&map.walkable[Math.floor(y/16)*map.width+Math.floor(x/16)]===1;
  function actor(id,x,y,direction,frame,name){
    ctx.fillStyle='#171f244a';ctx.beginPath();ctx.ellipse(x,y-1,8,3,0,0,Math.PI*2);ctx.fill();const scale=1,size=64*scale;ctx.drawImage(sheets.get(id),frame*64,directionRows[direction]*64,64,64,Math.round(x-size/2),Math.round(y-61*scale),size,size);label(name,x,y-53);
  }
  function draw(now){
    const dt=Math.min(.05,(now-last)/1000);last=now;if(!paused&&activeTab==='walk')time+=dt;
    let vx=Number(keys.has('arrowright')||keys.has('d'))-Number(keys.has('arrowleft')||keys.has('a')),vy=Number(keys.has('arrowdown')||keys.has('s'))-Number(keys.has('arrowup')||keys.has('w'));
    if(!vx&&!vy&&destination){const dx=destination.x-player.x,dy=destination.y-player.y,n=Math.hypot(dx,dy);if(n>3){vx=dx/n;vy=dy/n;}else destination=null;}
    const n=Math.hypot(vx,vy);player.moving=n>0&&!paused&&activeTab==='walk';
    if(player.moving){const step=75*dt/n,nx=player.x+vx*step,ny=player.y+vy*step;if(can(nx,player.y))player.x=nx;if(can(player.x,ny))player.y=ny;player.direction=Math.abs(vx)>=Math.abs(vy)?vx>0?'right':'left':vy>0?'down':'up';}
    if(cycle)player.direction=['down','left','up','right'][Math.floor(time/1.1)%4];
    ctx.clearRect(0,0,480,320);ctx.drawImage(back,0,0);
    const people=[{id:current.id,...player,frame:player.moving||cycle?Math.floor(time*9)%8:0,name:'店长 · '+(current.characterName||current.name.split(' · ').at(-1))}, {id:'bd-yuno',x:176,y:104,direction:'down',frame:0,name:'Rina Tanaka · 顾客'}, {id:'bd-hotaru',x:384,y:128,direction:'left',frame:0,name:'Alex Rivera · 常客'}].sort((a,b)=>a.y-b.y);
    for(const p of people)actor(p.id,p.x,p.y,p.direction,p.frame,p.name);
    $('#motion-status').textContent=(cycle?'四向轮播':player.moving?'行走中 · '+({down:'向下',left:'向左',up:'向上',right:'向右'})[player.direction]:'待机')+' · 64×64 帧 / 8 帧步态';requestAnimationFrame(draw);
  }
  window.artLab={ready:true,get config(){return structuredClone(current);},get player(){return {...player};},get portrait(){return livePortrait;},get sheets(){return sheets;},attribution};requestAnimationFrame(draw);
}
start().catch(e=>{notice(e.message);console.error(e);});
