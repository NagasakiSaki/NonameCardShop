import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
const root=path.resolve(import.meta.dirname,'../..'),registryFile=path.join(root,'data/character-portraits.json');
export function applyPortraitOverrides(manifest,registry,{verifyFiles=true}={}){
 if(!registry){if(!fs.existsSync(registryFile))return manifest;registry=JSON.parse(fs.readFileSync(registryFile,'utf8'));}
 assert.equal(registry.version,1);
 for(const [id,c]of Object.entries(registry.characters)){
  const actor=manifest.characters[id];assert.ok(actor,'立绘角色没有对应皮肤：'+id);
  for(const asset of [c.portrait,c.avatar]){
   assert.match(asset.url,/^\/assets\/frontend\/portraits\/bd-[a-z]+\.[a-f0-9]{10}\.png$/);
   if(verifyFiles){const bytes=fs.readFileSync(path.join(root,asset.url.slice(1)));assert.equal(createHash('sha256').update(bytes).digest('hex'),asset.sha256,'已登记立绘损坏：'+id);}
  }
  Object.assign(actor,{portrait:c.portrait.url,avatar:c.avatar.url,portraitSize:[128,224],portraitSource:{kind:'user-local-pack',sourceFile:c.sourceFile,sha256:c.sourceSha256,method:c.method,palette:c.palette}});
 }
 manifest.artVersion=registry.artVersion;return manifest;
}
