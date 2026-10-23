import {clone,need} from './common.mjs';

export function validateMap(map){
  map=clone(map);
  if(Array.isArray(map.walkable)&&map.walkable.length===map.width*map.height&&map.walkable.every(v=>v===0||v===1))map.walkable=Array.from({length:map.height},(_,row)=>map.walkable.slice(row*map.width,(row+1)*map.width).join(''));
  if(!map.anchors&&map.spawn&&Array.isArray(map.interactions)){
    map.anchors={};
    for(const p of map.interactions)map.anchors[p.id]={...p.stand,radius:p.radius||24};
    for(const exit of map.exits||[])map.anchors[exit.id]={x:exit.fromTile.x*16+8,y:exit.fromTile.y*16+8,radius:24,...(exit.seamlessEdge?{seamlessEdge:exit.seamlessEdge}:{}),...(exit.target?{targetRoom:exit.target.mapId,targetAnchor:exit.target.point,...(exit.target.spawnTile?{targetSpawn:{x:exit.target.spawnTile.x*16+8,y:exit.target.spawnTile.y*16+8}}:{})}:{})};
    if(map.mapId==='store')map.anchors['store.entry']={...map.spawn,radius:24};
  }
  need(typeof map?.mapId==='string'&&typeof map.navVersion==='string','INVALID_MAP','地图缺少 ID 或导航版本。');
  need(Number.isInteger(map.width)&&Number.isInteger(map.height)&&map.width>0&&map.height>0&&map.width<=200&&map.height<=200&&map.tileSize===16,'INVALID_MAP','地图规格不合法。');
  need(Array.isArray(map.walkable)&&map.walkable.length===map.height&&map.walkable.every(row=>typeof row==='string'&&row.length===map.width&&/^[01]+$/.test(row)),'INVALID_MAP','walkable 必须是 0/1 字符串行，1 表示可走。');
  need(map.anchors&&typeof map.anchors==='object','INVALID_MAP','地图缺少交互锚点。');
  for(const a of Object.values(map.anchors))need(canStand(map,a.x,a.y),'INVALID_MAP','出生点或交互站位不可达。');
  return clone(map);
}
export function canStand(map,x,y){return Number.isFinite(x)&&Number.isFinite(y)&&x>=0&&y>=0&&x<map.width*16&&y<map.height*16&&map.walkable[Math.floor(y/16)]?.[Math.floor(x/16)]==='1';}
export function clearSegment(map,a,b){
  const steps=Math.max(1,Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/3));let old=a;
  for(let i=1;i<=steps;i++){const p={x:a.x+(b.x-a.x)*i/steps,y:a.y+(b.y-a.y)*i/steps};if(!canStand(map,p.x,p.y)||!canStand(map,old.x,p.y)||!canStand(map,p.x,old.y))return false;old=p;}return true;
}
export function pathfind(map,start,destination){
  need(canStand(map,destination.x,destination.y),'NOT_REACHABLE','目标不能行走。');
  const from=[Math.floor(start.x/16),Math.floor(start.y/16)],to=[Math.floor(destination.x/16),Math.floor(destination.y/16)],key=([x,y])=>`${x},${y}`,queue=[from],parents=new Map([[key(from),null]]);
  let found;
  for(let i=0;i<queue.length;i++){const p=queue[i];if(key(p)===key(to)){found=p;break;}for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]){const n=[p[0]+dx,p[1]+dy];if(!parents.has(key(n))&&canStand(map,n[0]*16+8,n[1]*16+8)){parents.set(key(n),p);queue.push(n);}}}
  need(found,'NOT_REACHABLE','当前没有可达路径。');
  const points=[];while(parents.get(key(found))){points.unshift({x:found[0]*16+8,y:found[1]*16+8});found=parents.get(key(found));}points.push(destination);
  const smooth=[];let fromPoint=start,index=0;while(index<points.length){let last=index;for(let i=index+1;i<points.length;i++)if(clearSegment(map,fromPoint,points[i]))last=i;smooth.push(points[last]);fromPoint=points[last];index=last+1;}return smooth;
}
export function moveActor(map,actor,intent,seconds){
  if(!intent||seconds<=0){actor.moving=false;return;}
  const step=(['actor:owner','player'].includes(actor.actorId)?100:72)*Math.min(seconds,.25),old={x:actor.x,y:actor.y};
  if(intent.direction||intent.vector){
    const [rawX,rawY]=intent.vector?[intent.vector.x,intent.vector.y]:{up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[intent.direction]||[0,0];
    const magnitude=Math.hypot(rawX,rawY),dx=rawX/Math.max(1,magnitude),dy=rawY/Math.max(1,magnitude);
    if(magnitude)actor.direction=Math.abs(dx)>=Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';
    const parts=Math.max(1,Math.ceil(step/3));for(let i=0;i<parts;i++){
      const sx=dx*step/parts,sy=dy*step/parts;
      if(clearSegment(map,actor,{x:actor.x+sx,y:actor.y+sy})){actor.x+=sx;actor.y+=sy;}
      else {if(canStand(map,actor.x+sx,actor.y))actor.x+=sx;if(canStand(map,actor.x,actor.y+sy))actor.y+=sy;}
    }
  }
  else if(intent.path?.length){const p=intent.path[0],dx=p.x-actor.x,dy=p.y-actor.y,d=Math.hypot(dx,dy);actor.direction=Math.abs(dx)>=Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';if(d<=step){actor.x=p.x;actor.y=p.y;intent.path.shift();}else {actor.x+=dx/d*step;actor.y+=dy/d*step;}}
  actor.moving=Math.abs(actor.x-old.x)+Math.abs(actor.y-old.y)>.01;
}
