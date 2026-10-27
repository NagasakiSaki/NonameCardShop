// 两个房间预先绘制在同一连续世界中；切换逻辑房间不重建场景。
import {ensureAnims,ActorView} from '../world/actor-view.mjs';
import {LightingView} from '../world/lighting-view.mjs';
import {alignCameraPixels,cameraFollowLerp} from '../world/pixel-camera.mjs';
let CONTEXT=null;
export function setSceneContext(context){CONTEXT=context;}
function bakeMap(scene,map){
  const frame=CONTEXT.manifest.tileset.frameSize||16,columns=CONTEXT.manifest.tileset.columns||8,scale=frame/map.tileSize;
  const key='room-bake-'+map.mapId;
  if(scene.textures.exists(key))scene.textures.remove(key);
  const texture=scene.textures.createCanvas(key,map.width*frame,map.height*frame),ctx=texture.getContext(),source=scene.textures.get('tiles').getSourceImage();
  ctx.imageSmoothingEnabled=false;
  for(const layer of map.layers)for(let y=0;y<map.height;y++)for(let x=0;x<map.width;x++){
    const i=layer.data[y*map.width+x];if(i==null||i<0)continue;
    ctx.drawImage(source,(i%columns)*frame,Math.floor(i/columns)*frame,frame,frame,x*frame,y*frame,frame,frame);
  }
  // Decorative contact shade only; tile IDs, collisions and navigation are untouched.
  const walls=map.layers.find(layer=>layer.name==='walls'),isWall=(x,y)=>x>=0&&y>=0&&x<map.width&&y<map.height&&(walls?.data[y*map.width+x]??-1)>=0;
  for(let y=1;y<map.height;y++)for(let x=0;x<map.width;x++)if(!isWall(x,y)&&isWall(x,y-1)){
    const shade=ctx.createLinearGradient(0,y*frame,0,y*frame+frame*.8);shade.addColorStop(0,'rgba(95,62,35,.20)');shade.addColorStop(1,'rgba(95,62,35,0)');ctx.fillStyle=shade;ctx.fillRect(x*frame,y*frame,frame,frame*.8);
  }
  texture.refresh();const o=map.worldOffset||{x:0,y:0};
  const image=scene.add.image(o.x,o.y,key).setOrigin(0,0).setScale(1/scale).setDepth(-1000);
  image.floorBake={source:key,mapId:map.mapId,width:map.width*map.tileSize,height:map.height*map.tileSize};return image;
}
function fitBakedMap(scene,image,zoom){
  const b=image.floorBake,key='room-raster-'+b.mapId;
  // Chromium clips a partially offscreen drawImage before nearest resampling.
  // Repeated fractional downscaling of the giant 4x atlas can change texel
  // boundaries even with integer translation. Resample ONCE per zoom instead.
  image.setTexture(b.source);if(scene.textures.exists(key))scene.textures.remove(key);
  const texture=scene.textures.createCanvas(key,Math.round(b.width*zoom),Math.round(b.height*zoom)),ctx=texture.getContext();
  ctx.imageSmoothingEnabled=false;ctx.drawImage(scene.textures.get(b.source).getSourceImage(),0,0,texture.width,texture.height);texture.refresh();
  image.setTexture(key).setScale(1/zoom);
}
export function createWorldSceneClass(){return class WorldScene extends Phaser.Scene{
  constructor(){super('world');}
  init(data){this.mapId=data?.mapId||'store';this.zoom=data?.zoom||2;this.playerActorId=CONTEXT.getPlayerActorId();this.ready=false;this.lastInteractionRefresh=0;}
  preload(){
    const {manifest:m,assetUrl}=CONTEXT;
    if(!this.textures.exists('tiles'))this.load.spritesheet('tiles',assetUrl(m.tileset.image),{frameWidth:m.tileset.frameSize||m.tileSize,frameHeight:m.tileset.frameSize||m.tileSize});
    if(!this.textures.exists('props'))this.load.spritesheet('props',assetUrl(m.props.image),{frameWidth:m.props.cellSize,frameHeight:m.props.cellSize});
    for(const [id,e]of Object.entries(m.characters)){
      if(!this.textures.exists('char-'+id))this.load.spritesheet('char-'+id,assetUrl(e.sheet),{frameWidth:e.frameWidth,frameHeight:e.frameHeight});
      if(e.idleSheet&&!this.textures.exists('char-idle-'+id))this.load.spritesheet('char-idle-'+id,assetUrl(e.idleSheet),{frameWidth:e.frameWidth,frameHeight:e.frameHeight});
    }
    if(!this.textures.exists('glow'))this.load.image('glow',assetUrl(m.fx.lampGlow));
    if(!this.textures.exists('shadow'))this.load.image('shadow',assetUrl(m.fx.shadow));
    if(m.fx.sunShaft&&!this.textures.exists('sun-shaft'))this.load.image('sun-shaft',assetUrl(m.fx.sunShaft));
  }
  worldActors(){return CONTEXT.getActors().map(a=>{const map=CONTEXT.getMap(a.roomId||'store'),o=map?.worldOffset||{x:0,y:0};return {...a,x:a.x+o.x,y:a.y+o.y};});}
  create(){
    const m=CONTEXT.manifest;this.characterMeta=m.characters;this.map=CONTEXT.getMap(this.mapId);this.roomMaps=Object.keys(m.maps).map(id=>CONTEXT.getMap(id));this.lights=[];this.propSprites=[];this.floorSprites=[];
    ensureAnims(this,m.characters);const propIndex=new Map(m.props.list.map(p=>[p.prop,p]));this.propIndex=propIndex;this.shopTiles=m.tileset.tiles;
    for(const map of this.roomMaps){
      this.floorSprites.push(bakeMap(this,map));const o=map.worldOffset||{x:0,y:0};
      for(const p of map.props){const meta=propIndex.get(p.prop);if(!meta)continue;
        const image=this.add.image(p.x+o.x,p.y+o.y,'props',meta.cell).setOrigin(0,0).setScale(1/(m.props.artScale||1));
        image.setDepth(p.prop.includes('rug')||p.prop==='door_mat'?-800:p.y+o.y+p.footY);image.shopProp={...p,mapId:map.mapId,tableId:p.family==='table'?'battleRoom.'+map.tables[map.props.filter(v=>v.family==='table').indexOf(p)]?.id:null};this.propSprites.push(image);
        const upgrade=p.family==='shelf'?'shelf':p.family==='table'?'table':p.prop==='pa_cabinet_collect'?'showcase':p.prop==='pa_counter_cashier'?'cashier':p.prop==='pa_counter_procure'?'stocker':null;
        if(upgrade){image.upgradeKey=upgrade;image.levelBadge=this.add.text(p.x+o.x+3,p.y+o.y+3,'',{fontFamily:'Microsoft YaHei, sans-serif',fontSize:'7px',fontStyle:'bold',color:'#fff6dc',backgroundColor:'#846044',resolution:4,padding:{x:2,y:1}}).setDepth(6999).setVisible(false);}
      }
      for(const s of map.signs||[]){this.add.text(s.x+o.x,s.y+o.y,s.text,{fontFamily:'Microsoft YaHei, sans-serif',fontSize:s.brand?'7px':'8px',fontStyle:'bold',color:s.brand?'#89613b':'#594431',resolution:4,backgroundColor:s.brand?undefined:'#fff5df',padding:{x:3,y:2}}).setOrigin(.5,1).setDepth(s.brand?200:7000);}
      this.lights.push(new LightingView(this,map));
    }
    this.actorView=new ActorView(this);this.actorView.sync(this.worldActors(),{playerActorId:this.playerActorId});
    const camera=this.cameras.main,maxX=Math.max(...this.roomMaps.map(map=>(map.worldOffset?.x||0)+map.width*16));
    camera.setBounds(0,0,maxX,320);camera.setBackgroundColor('#f4e7d1');camera.setZoom(this.zoom);
    for(const image of this.floorSprites)fitBakedMap(this,image,camera.zoom);this.floorRasterZoom=camera.zoom;
    const player=this.actorView.getSprite(this.playerActorId);if(player){
      // Keep sub-world-pixel positions, then align the final camera matrix once
      // after Phaser preRender. Per-object/world rounding creates fractional-
      // zoom stepping and cannot keep the 64px floor texels stable.
      camera.startFollow(player,false,.18,.18);camera.centerOn(player.x,player.y);
      camera.on('followupdate',alignCameraPixels);this.pixelCamera=camera;
    }
    this.input.on('pointerdown',pointer=>{if(CONTEXT.isBlocked())return;const world=pointer.positionToCamera(camera),map=this.roomMaps.find(map=>{const o=map.worldOffset||{x:0,y:0};return world.x>=o.x&&world.x<o.x+map.width*16&&world.y>=o.y&&world.y<o.y+map.height*16;});if(map){const o=map.worldOffset||{x:0,y:0};CONTEXT.onWorldClick(world.x-o.x,world.y-o.y,map.mapId);}});
    this.ready=true;this.events.once('shutdown',()=>this.destroyScene());CONTEXT.onSceneReady(this.mapId);
  }
  setActiveRoom(id){this.mapId=id;this.map=CONTEXT.getMap(id);}
  update(time,delta){
    if(!this.ready)return;this.actorView.sync(this.worldActors(),{playerActorId:this.playerActorId});this.actorView.update(delta);
    this.cameras.main.setLerp(cameraFollowLerp(delta));
    if(this.floorRasterZoom!==this.cameras.main.zoom){this.floorRasterZoom=this.cameras.main.zoom;for(const image of this.floorSprites)fitBakedMap(this,image,this.floorRasterZoom);}
    const snapshot=CONTEXT.getSnapshot();for(const light of this.lights)light.update(snapshot?.clock);
    if(snapshot?.revision!==this.lastStorefrontRevision){this.lastStorefrontRevision=snapshot?.revision;const view=snapshot?.storefront;
      if(view)for(const image of this.propSprites){const p=image.shopProp;let target=p.prop;
        if(p.family==='shelf'&&p.mapId==='store'){const n=view.sealed.pack+view.sealed.box;target=`pa_shelf_lv${Math.min(3,view.upgrades?.shelf||0)}_${n===0?'empty':n<3?'low':'full'}`;}
        if(p.family==='table'){const t=view.tables.find(t=>t.tableId===p.tableId);target=`pa_table_lv${Math.min(2,view.upgrades?.table||0)}_`+({playing:'sim',reserved:'reserved',ended:'end',idle:'idle'}[t?.state]||'idle');}
        if(p.prop==='pa_cabinet_collect')target=view.upgrades?.showcase?'pa_showcase_lv1_bought':'pa_showcase_lv0_unbought';
        if(p.prop==='pa_counter_cashier')target='pa_counter_cashier_'+(view.staff?.cashier||'unhired');
        if(p.prop==='pa_counter_procure')target='pa_counter_stocker_'+(view.staff?.stocker||'unhired');
        const frame=this.propIndex.get(target);if(frame&&image.frame.name!==frame.cell)image.setFrame(frame.cell);
        if(image.levelBadge){const level=view.upgrades?.[image.upgradeKey]||0;image.levelBadge.setText('Lv.'+level).setVisible(level>0);}
      }
    }
    const player=CONTEXT.getActors().find(a=>a.actorId===this.playerActorId);
    if(player&&!CONTEXT.isBlocked()&&time-this.lastInteractionRefresh>35){this.lastInteractionRefresh=time;CONTEXT.onPlayerMoved(player,this.map);}
  }
  destroyScene(){this.pixelCamera?.off('followupdate',alignCameraPixels);this.actorView?.destroy();for(const light of this.lights||[])light.destroy();}
};}
export function worldSceneZoom(width,height,mapWidth=480,mapHeight=320){
  const fit=Math.min((Number(width)||720)/mapWidth,(Number(height)||480)/mapHeight);
  return Math.max(1,Math.min(3,Math.floor(fit*4)/4));
}
