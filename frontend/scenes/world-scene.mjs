// 两个房间预先绘制在同一连续世界中；切换逻辑房间不重建场景。
import {ensureAnims,ActorView} from '../world/actor-view.mjs';
import {LightingView} from '../world/lighting-view.mjs';
let CONTEXT=null;
export function setSceneContext(context){CONTEXT=context;}
function bakeMap(scene,map){
  const frame=CONTEXT.manifest.tileset.frameSize||16,scale=frame/map.tileSize;
  const key='room-bake-'+map.mapId;
  if(scene.textures.exists(key))scene.textures.remove(key);
  const texture=scene.textures.createCanvas(key,map.width*frame,map.height*frame),ctx=texture.getContext(),source=scene.textures.get('tiles').getSourceImage();
  ctx.imageSmoothingEnabled=false;
  for(const layer of map.layers)for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=layer.data[y*map.width+x];if(i==null||i<0)continue;
    ctx.drawImage(source,(i%8)*frame,Math.floor(i/8)*frame,frame,frame,x*frame,y*frame,frame,frame);
  }
  texture.refresh();const o=map.worldOffset||{x:0,y:0};
  return scene.add.image(o.x,o.y,key).setOrigin(0,0).setScale(1/scale).setDepth(-1000);
}
export function createWorldSceneClass(){return class WorldScene extends Phaser.Scene{
  constructor(){super('world');}
  init(data){this.mapId=data?.mapId||'store';this.zoom=data?.zoom||2;this.playerActorId=CONTEXT.getPlayerActorId();this.ready=false;this.lastInteractionRefresh=0;}
  preload(){
    const {manifest:m,assetUrl}=CONTEXT;
    if(!this.textures.exists('tiles'))this.load.spritesheet('tiles',assetUrl(m.tileset.image),{frameWidth:m.tileset.frameSize||m.tileSize,frameHeight:m.tileset.frameSize||m.tileSize});
    if(!this.textures.exists('props'))this.load.spritesheet('props',assetUrl(m.props.image),{frameWidth:m.props.cellSize,frameHeight:m.props.cellSize});
    for(const [id,e]of Object.entries(m.characters))if(!this.textures.exists('char-'+id))this.load.spritesheet('char-'+id,assetUrl(e.sheet),{frameWidth:e.frameWidth,frameHeight:e.frameHeight});
    if(!this.textures.exists('glow'))this.load.image('glow',assetUrl(m.fx.lampGlow));
    if(!this.textures.exists('shadow'))this.load.image('shadow',assetUrl(m.fx.shadow));
  }
  worldActors(){return CONTEXT.getActors().map(a=>{const map=CONTEXT.getMap(a.roomId||'store'),o=map?.worldOffset||{x:0,y:0};return {...a,x:a.x+o.x,y:a.y+o.y};});}
  create(){
    const m=CONTEXT.manifest;this.characterMeta=m.characters;this.map=CONTEXT.getMap(this.mapId);this.roomMaps=Object.keys(m.maps).map(id=>CONTEXT.getMap(id));this.lights=[];this.propSprites=[];
    ensureAnims(this,m.characters);const propIndex=new Map(m.props.list.map(p=>[p.prop,p]));this.propIndex=propIndex;
    for(const map of this.roomMaps){
      bakeMap(this,map);const o=map.worldOffset||{x:0,y:0};
      for(const p of map.props){const meta=propIndex.get(p.prop);if(!meta)continue;
        const image=this.add.image(p.x+o.x,p.y+o.y,'props',meta.cell).setOrigin(0,0).setScale(1/(m.props.artScale||1));
        image.setDepth(p.prop.includes('rug')||p.prop==='door_mat'?-800:p.y+o.y+p.footY);image.shopProp={...p,mapId:map.mapId,tableId:p.family==='table'?'battleRoom.'+map.tables[map.props.filter(v=>v.family==='table').indexOf(p)]?.id:null};this.propSprites.push(image);
      }
      for(const s of map.signs||[]){this.add.text(s.x+o.x,s.y+o.y,s.text,{fontFamily:'Microsoft YaHei, sans-serif',fontSize:s.brand?'7px':'8px',fontStyle:'bold',color:s.color,resolution:4,backgroundColor:s.brand?undefined:'#344b51',padding:{x:3,y:2}}).setOrigin(.5,1).setDepth(s.brand?200:7000);}
      this.lights.push(new LightingView(this,map));
    }
    this.actorView=new ActorView(this);this.actorView.sync(this.worldActors(),{playerActorId:this.playerActorId});
    const camera=this.cameras.main,maxX=Math.max(...this.roomMaps.map(map=>(map.worldOffset?.x||0)+map.width*16));
    camera.setBounds(0,0,maxX,320);camera.setBackgroundColor('#253c3d');camera.setZoom(this.zoom);
    const player=this.actorView.getSprite(this.playerActorId);if(player){camera.startFollow(player,false,.18,.18);camera.centerOn(player.x,player.y);}
    this.input.on('pointerdown',pointer=>{if(CONTEXT.isBlocked())return;const world=pointer.positionToCamera(camera),map=this.roomMaps.find(map=>{const o=map.worldOffset||{x:0,y:0};return world.x>=o.x&&world.x<o.x+map.width*16&&world.y>=o.y&&world.y<o.y+map.height*16;});if(map){const o=map.worldOffset||{x:0,y:0};CONTEXT.onWorldClick(world.x-o.x,world.y-o.y,map.mapId);}});
    this.ready=true;this.events.once('shutdown',()=>this.destroyScene());CONTEXT.onSceneReady(this.mapId);
  }
  setActiveRoom(id){this.mapId=id;this.map=CONTEXT.getMap(id);}
  update(time,delta){
    if(!this.ready)return;this.actorView.sync(this.worldActors(),{playerActorId:this.playerActorId});this.actorView.update(delta);
    const snapshot=CONTEXT.getSnapshot();for(const light of this.lights)light.update(snapshot?.clock);
    if(snapshot?.revision!==this.lastStorefrontRevision){this.lastStorefrontRevision=snapshot?.revision;const view=snapshot?.storefront;
      if(view)for(const image of this.propSprites){const p=image.shopProp;let target=p.prop;
        if(p.family==='shelf'&&p.mapId==='store'){const n=view.sealed.pack+view.sealed.box;target=n===0?'pa_shelf_empty':n<3?'pa_shelf_low':'pa_shelf_full';}
        if(p.family==='table'){const t=view.tables.find(t=>t.tableId===p.tableId);target='pa_table_'+({playing:'sim',reserved:'reserved',ended:'end',idle:'idle'}[t?.state]||'idle');}
        const frame=this.propIndex.get(target);if(frame&&image.frame.name!==frame.cell)image.setFrame(frame.cell);
      }
    }
    const player=CONTEXT.getActors().find(a=>a.actorId===this.playerActorId);
    if(player&&!CONTEXT.isBlocked()&&time-this.lastInteractionRefresh>35){this.lastInteractionRefresh=time;CONTEXT.onPlayerMoved(player,this.map);}
  }
  destroyScene(){this.actorView?.destroy();for(const light of this.lights||[])light.destroy();}
};}
export function worldSceneZoom(width,height,mapWidth=480,mapHeight=320){
  const fit=Math.min((Number(width)||720)/mapWidth,(Number(height)||480)/mapHeight);
  return Math.max(1,Math.min(3,Math.floor(fit*4)/4));
}
