import {buildStoreMap as originalStore,buildBattleRoomMap as originalBattle} from './maps.mjs';
import {PROP_META,TILES} from './props-v2.mjs';
export const TILE=16,MAP_W=30,MAP_H=20,NAV_VERSION='nav-2026-10-24-playability-facilities';
const at=(x,y)=>({x:x*16+8,y:y*16+8,tile:{x,y}});
const storeProps=[
  ['rug',176,112],['shelf',24,40],['shelf',24,112],['shelf',192,32],
  ['display_packs',104,48],['display_boxes',104,144],['counter_retail',32,208],
  ['counter_service',256,192],['kiosk',336,32],['trash',432,256],
  ['plant',272,32],['plant',416,32],['plant',24,264],['plant',432,184],
  ['poster',104,2],['poster',288,2],['clock',240,2],['sofa',176,272],
  ['tea',304,96],['board',368,216],['case_stack',352,144],['case_stack',32,176],
  ['lamp',8,80],['lamp',320,48],['lamp',400,240],['door_mat',224,256],
  ['trophy',288,144],['speaker',440,80],['counter_service',144,200],
];
const battleProps=[
  ['rug',72,72],['rug',248,168],['table',80,64],['table',256,160],
  ['chair',108,48],['chair',108,120],['chair',280,144],['chair',280,216],
  ['kiosk',336,16],['shelf',24,24],['board',208,32],['trophy',264,40],
  ['sofa',176,264],['sofa',32,224],['tea',144,224],['shelf',400,192],
  ['plant',96,24],['plant',432,264],['poster',144,2],['poster',288,2],
  ['clock',240,2],['speaker',424,96],['lamp',8,48],['lamp',336,224],
  ['door_mat',0,136],['case_stack',352,160],
];
const PROP_UPGRADES={shelf:'pa_shelf_full',display_packs:'pa_display_packs',display_boxes:'pa_display_boxes',counter_retail:'pa_counter_cashier',counter_service:'pa_counter_procure',trash:'pa_trash',table:'pa_table_idle',rug:'pa_rug_round'};
 for(const list of [storeProps,battleProps])for(const p of list){p[0]=PROP_UPGRADES[p[0]]||p[0];}
 storeProps.find(p=>p[0]==='pa_counter_procure'&&p[1]===144)[0]='pa_counter_opening';
 const market=storeProps.find(p=>p[0]==='kiosk');market[0]='pa_counter_market';market[2]+=16;
 storeProps.push(['pa_wall_display',136,2],['pa_wall_display',352,2],['pa_lamp_hang',208,0],['pa_cabinet_collect',416,120]);
 // The candidate's extra rack at (296,232) blocks the procurement stand: replace an existing stack instead.
 const rack=storeProps.find(p=>p[0]==='case_stack'&&p[1]===352);rack[0]='pa_box_rack';

function make(id,base,placements){
  const map=structuredClone(base.map),walk=Array(MAP_W*MAP_H).fill(0),floor=[],walls=[];
  const index=name=>TILES.indexOf(name);
  for(let y=0;y<MAP_H;y++)for(let x=0;x<MAP_W;x++){
    const seam=(id==='store'?x===29:x===0)&&y>=8&&y<=10;
    const wall=!seam&&(x===0||x===29||y<2||y===19);
    walk[y*MAP_W+x]=wall?0:1;
    const service=id==='store'&&x>=16&&x<=21&&y>=11&&y<=15;
    floor.push(index(service?'floor_tile':id==='battle-room'?'floor_stone':(x+y)%2?'floor_wood_a':'floor_wood_b'));
    walls.push(wall?index(y===0?([3,4,5,17,18,19].includes(x)?'wall_window':'wall_top'):'wall_base'):-1);
  }
  map.props=placements.map(([prop,x,y,extra={}],i)=>({id:`${prop}.${String(i+1).padStart(2,'0')}`,prop,x,y,...structuredClone(PROP_META[prop]),...extra}));
  for(const p of map.props)for(const [x,y,w,h]of p.blocks){for(let yy=Math.floor((p.y+y)/16);yy<=Math.floor((p.y+y+h-1)/16);yy++)for(let xx=Math.floor((p.x+x)/16);xx<=Math.floor((p.x+x+w-1)/16);xx++)if(xx>=0&&xx<30&&yy>=0&&yy<20)walk[yy*30+xx]=0;}
  map.layers=[{name:'floor',type:'tiles',data:floor},{name:'walls',type:'tiles',data:walls}];
  map.walkable=walk;map.navVersion=NAV_VERSION;map.worldOffset={x:id==='store'?0:480,y:0};
  map.label=id==='store'?'无名小店 · 卡牌商店':'牌友会馆 · 对战与休憩';
  map.signs=id==='store'?[
    {x:136,y:42,text:'卡包 · 卡盒',color:'#ffe2a1'},
    {x:304,y:184,text:'进货 / 收货',color:'#d9efe0'},
    {x:176,y:194,text:'拆包工作台',color:'#d9efe0'},
    {x:376,y:27,text:'二级市场',color:'#e9dcff'},
    {x:440,y:249,text:'共享回收',color:'#d9eed5'},
    {x:80,y:202,text:'顾客收银台',color:'#ffe2a1'},
    {x:443,y:126,text:'对战房 →',color:'#f3d5a7'},
    {x:240,y:31,text:'NONAME  /  CARD ATELIER',color:'#405d58',brand:true},
  ]:[
    {x:376,y:12,text:'桌位 / 比赛',color:'#e6ddf3'},
    {x:112,y:58,text:'01 · 对战桌',color:'#ffe2a1'},
    {x:288,y:154,text:'02 · 对战桌',color:'#ffe2a1'},
    {x:66,y:126,text:'← 卡店',color:'#f3d5a7'},
    {x:224,y:260,text:'牌友休息区',color:'#d9eee1'},
    {x:240,y:29,text:'CARD CLUB  /  PLAY & CHILL',color:'#405d58',brand:true},
  ];
  for(const i of map.interactions){
    const kind=i.kind==='retail'?'pa_display_packs':i.kind==='counter'?'pa_counter_procure':i.kind==='trash'?'pa_trash':id==='store'?'pa_counter_market':'kiosk';
    i.props=map.props.filter(p=>i.kind==='retail'?['pa_display_packs','pa_display_boxes','pa_counter_cashier','pa_shelf_full'].includes(p.prop):p.prop===kind).map(p=>p.id);
    if(i.kind==='retail'){i.anchor={x:136,y:80};i.label='卡包 / 卡盒零售';}
    if(i.kind==='trash'){i.anchor={x:444,y:274};i.label='共享垃圾桶';}
  }
  if(id==='store'){
    const counter=map.interactions.find(i=>i.id==='store.counter');counter.label='进货 / 收货台';counter.props=['pa_counter_procure.08'];
    map.interactions.find(i=>i.id==='store.retail').props=map.interactions.find(i=>i.id==='store.retail').props.filter(id=>id!=='pa_counter_cashier.07');
    map.interactions.push({id:'store.checkout',label:'顾客收银台',kind:'retail',anchor:{x:80,y:240},stand:at(5,16),radius:24,props:['pa_counter_cashier.07']});
    map.interactions.push({id:'store.opening',label:'独立拆包工作台',kind:'opening',panel:'opening',anchor:{x:176,y:240},stand:at(11,16),radius:24,props:['pa_counter_opening.29']});
  }
  if(id==='battle-room')map.tables.forEach((table,index)=>{
    const p=map.props.filter(p=>p.prop==='pa_table_idle')[index];
    map.interactions.push({id:'battleRoom.'+table.id,label:table.label+' · 直接入座',kind:'table',tableId:'battleRoom.'+table.id,anchor:{x:p.x+p.w/2,y:p.y+p.h/2},stand:table.observerSpots[0],radius:28,props:[p.id]});
  });
  const door=map.exits.find(e=>e.target);
  if(id==='store')Object.assign(door,{fromTile:{x:29,y:9},rect:{x:474,y:128,w:6,h:48},seamlessEdge:'east',target:{mapId:'battle-room',point:'battleRoom.toStore',spawnTile:{x:0,y:9}}});
  else Object.assign(door,{fromTile:{x:0,y:9},rect:{x:0,y:128,w:6,h:48},seamlessEdge:'west',target:{mapId:'store',point:'store.toBattleRoom',spawnTile:{x:29,y:9}}});
  if(id==='store')map.spawn={...at(14,16),facing:'up'};
  else map.spawn={...at(3,9),facing:'right'};
  map.lights=[{x:136,y:64,radius:80},{x:304,y:210,radius:90},{x:376,y:64,radius:80},{x:440,y:150,radius:72}];
  // 设施、桌位和出入口必须全部保留可达，避免美术遮挡破坏真实玩法。
  const start=map.spawn.tile,seen=new Set([start.y*30+start.x]),q=[start];
  for(let i=0;i<q.length;i++)for(const [dx,dy]of [[1,0],[-1,0],[0,1],[0,-1]]){const p={x:q[i].x+dx,y:q[i].y+dy},key=p.y*30+p.x;if(p.x>=0&&p.x<30&&p.y>=0&&p.y<20&&walk[key]&&!seen.has(key)){seen.add(key);q.push(p);}}
  const points=[...map.interactions.map(i=>({id:i.id,tile:i.stand.tile})),...map.exits.map(e=>({id:e.id,tile:e.fromTile})),...map.tables.flatMap(t=>t.seatAnchors.map(a=>({id:t.id,tile:a.tile})))];
  const problems=points.filter(p=>!seen.has(p.tile.y*30+p.tile.x)).map(p=>'站位不可达：'+p.id);
  return {map,ok:!problems.length,problems,reachableCount:seen.size};
}
export const buildStoreMap=()=>make('store',originalStore(),storeProps);
export const buildBattleRoomMap=()=>make('battle-room',originalBattle(),battleProps);
