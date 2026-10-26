import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..'),file=path.join(root,'assets/frontend/manifest.json');
const current=JSON.parse(fs.readFileSync(file)),fresh=JSON.parse(fs.readFileSync(path.join(root,'assets/frontend-bright-anime/manifest.props.json')));
if(JSON.stringify(current.tileset.tiles)!==JSON.stringify(fresh.tileset.tiles)||current.tileSize!==fresh.tileSize)throw Error('地砖 ID/逻辑格已变化，需要先审查地图兼容。');
if(current.props.list.length!==fresh.props.list.length)throw Error('设施数量已变化，需要先审查新增设施接入。');
for(const old of current.props.list){
 const next=fresh.props.list.find(p=>p.prop===old.prop);
 if(!next||old.w/current.props.artScale!==next.w/fresh.props.artScale||old.h/current.props.artScale!==next.h/fresh.props.artScale||old.footY!==next.footY||old.occludes!==next.occludes)throw Error('设施尺寸/脚点/遮挡已变化：'+old.prop);
}
const list=fresh.props.list.map(p=>Object.fromEntries(['prop','cell','x','y','w','h','footY','occludes'].map(key=>[key,p[key]])));
current.artVersion='bright-anime-1';current.generatedBy='tools/frontend-art-bright/build.mjs';current.tileset={...current.tileset,...fresh.tileset};current.props={...current.props,...fresh.props,list};current.fx={...current.fx,...fresh.fx};
fs.writeFileSync(file,JSON.stringify(current,null,2)+'\n');
console.log('Installed bright visuals: 76 facility IDs and logical geometry preserved; characters, maps, navigation and saves unchanged.');
