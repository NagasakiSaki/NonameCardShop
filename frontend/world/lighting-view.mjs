// Bright interior lighting depends only on authoritative game minutes, never wall-clock time.
export function lightingForMinute(minute){
  const m=((Number(minute)||0)%1440+1440)%1440;
  const keys=[[0,[58,74,128],.60,.90],[300,[74,88,140],.55,.85],[420,[216,178,156],.20,.45],[540,[255,252,244],0,0],[960,[255,244,220],.02,.05],[1080,[255,196,132],.16,.30],[1170,[186,140,150],.36,.60],[1260,[86,104,158],.52,.85],[1440,[58,74,128],.60,.90]];
  for(let i=1;i<keys.length;i++)if(m<=keys[i][0]){const a=keys[i-1],b=keys[i],t=(m-a[0])/(b[0]-a[0]);return {color:{r:Math.round(a[1][0]+(b[1][0]-a[1][0])*t),g:Math.round(a[1][1]+(b[1][1]-a[1][1])*t),b:Math.round(a[1][2]+(b[1][2]-a[1][2])*t)},dark:a[2]+(b[2]-a[2])*t,warm:a[3]+(b[3]-a[3])*t};}
}
export class LightingView{
  constructor(scene,map){
    this.scene=scene;this.map=map;this.glows=[];this.sunShafts=[];
    const o=map.worldOffset||{x:0,y:0},width=map.width*map.tileSize,height=map.height*map.tileSize;
    this.overlay=scene.add.rectangle(o.x,o.y,width,height,0,0).setOrigin(0,0).setDepth(8000);
    for(const light of map.lights||[]){const diameter=(light.radius||64)*2;this.glows.push(scene.add.image(light.x+o.x,light.y+o.y,'glow').setDisplaySize(diameter,diameter).setTint(0xffd5a0).setDepth(8100).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));}
    this.fill=scene.add.image(o.x+width*.52,o.y+height*.50,'glow').setDisplaySize(width*1.2,height*1.1).setTint(0xffd2a1).setDepth(8100).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0);
    if(scene.textures.exists('sun-shaft')){const walls=map.layers.find(l=>l.name==='walls'),frame=scene.shopTiles?.indexOf('wall_window')??6;for(let i=0;i<(walls?.data.length||0);i++)if(walls.data[i]===frame)this.sunShafts.push(scene.add.image(o.x+(i%map.width+.5)*map.tileSize,o.y+(Math.floor(i/map.width)+.65)*map.tileSize,'sun-shaft').setOrigin(.5,0).setDisplaySize(46,110).setDepth(7900).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0));}
    this.lastMinute=-1;this.ambient={r:255,g:255,b:255,dark:0};
  }
  update(clock){
    if(!clock)return;const bucket=Math.floor(clock.minute/2)*2;if(bucket===this.lastMinute)return;this.lastMinute=bucket;
    const {color,dark,warm}=lightingForMinute(bucket);this.ambient={...color,dark};
    const tint=Phaser.Display.Color.GetColor(Math.round(color.r*.45+20),Math.round(color.g*.45+18),Math.round(color.b*.52+20));
    this.overlay.setVisible(dark>.02).setFillStyle(tint,Math.min(.55,dark*.82));
    for(const glow of this.glows)glow.setAlpha(Math.min(.38,warm*.34));this.fill.setAlpha(warm*.10);
    const sunlight=bucket>=420&&bucket<=1110?Math.sin((bucket-420)/690*Math.PI)*.14:0;for(const shaft of this.sunShafts)shaft.setAlpha(Math.max(0,sunlight));
  }
  destroy(){this.overlay.destroy();this.fill.destroy();for(const item of [...this.glows,...this.sunShafts])item.destroy();this.glows=[];this.sunShafts=[];}
}
