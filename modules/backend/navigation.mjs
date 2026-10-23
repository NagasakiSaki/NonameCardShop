import {clone,need} from './common.mjs';

export function validateMap(map){
  map=clone(map);
  if(Array.isArray(map.walkable)&&map.walkable.length===map.width*map.height&&map.walkable.every(v=>v===0||v===1))map.walkable=Array.from({length:map.height},(_,row)=>map.walkable.slice(row*map.width,(row+1)*map.width).join(''));
  if(!map.anchors&&map.spawn&&Array.isArray(map.interactions)){
    map.anchors={};
    for(const p of map.interactions)map.anchors[p.id]={...p.stand,radius:p.radius||24};
    for(const exit of map.exits||[])map.anchors[exit.id]={x:exit.fromTile.x*16+8,y:exit.fromTile.y*16+8,radius:24,...(exit.target?{targetRoom:exit.target.mapId,targetAnchor:exit.target.point,...(exit.target.spawnTile?{targetSpawn:{x:exit.target.spawnTile.x*16+8,y:exit.target.spawnTile.y*16+8}}:{})}:{})};
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
export function pathfind(map,start,destination){
  need(canStand(map,destination.x,destination.y),'NOT_REACHABLE','目标不能行走。');
  const from=[Math.floor(start.x/16),Math.floor(start.y/16)],to=[Math.floor(destination.x/16),Math.floor(destination.y/16)],key=([x,y])=>`${x},${y}`,queue=[from],parents=new Map([[key(from),null]]);
  let found;
  for(let i=0;i<queue.length;i++){const p=queue[i];if(key(p)===key(to)){found=p;break;}for(const [dx,dy] of [[0,1],[1,0],[0,-1],[-1,0]]){const n=[p[0]+dx,p[1]+dy];if(!parents.has(key(n))&&canStand(map,n[0]*16+8,n[1]*16+8)){parents.set(key(n),p);queue.push(n);}}}
  need(found,'NOT_REACHABLE','当前没有可达路径。');
  const points=[];while(parents.get(key(found))){points.unshift({x:found[0]*16+8,y:found[1]*16+8});found=parents.get(key(found));}points.push(destination);return points;
}
export function moveActor(map,actor,intent,seconds){
  if(!intent||seconds<=0){actor.moving=false;return;}
  const step=72*Math.min(seconds,.25),old={x:actor.x,y:actor.y};
  if(intent.direction){const [dx,dy]={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]}[intent.direction]||[0,0];actor.direction=intent.direction;if(canStand(map,actor.x+dx*step,actor.y+dy*step)){actor.x+=dx*step;actor.y+=dy*step;}}
  else if(intent.path?.length){const p=intent.path[0],dx=p.x-actor.x,dy=p.y-actor.y,d=Math.hypot(dx,dy);actor.direction=Math.abs(dx)>Math.abs(dy)?dx>0?'right':'left':dy>0?'down':'up';if(d<=step){actor.x=p.x;actor.y=p.y;intent.path.shift();}else {actor.x+=dx/d*step;actor.y+=dy/d*step;}}
  actor.moving=Math.abs(actor.x-old.x)+Math.abs(actor.y-old.y)>.01;
}
