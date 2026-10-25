import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {NATIVE_PROFILES,NATIVE_PROTOCOL} from './profiles.mjs';
export function probeModeCapabilities({engineRoot}={}){
  const hashes=new Map();
  return {protocol:NATIVE_PROTOCOL,items:Object.entries(NATIVE_PROFILES).map(([formatId,p])=>{
    const mismatches=[];
    for(const [name,expected]of Object.entries(p.hashes)){
      if(!hashes.has(name)){try{hashes.set(name,crypto.createHash('sha256').update(fs.readFileSync(path.join(engineRoot,name))).digest('hex'));}catch{hashes.set(name,null);}}
      if(hashes.get(name)!==expected)mismatches.push(name);
    }
    const hash=crypto.createHash('sha256').update(JSON.stringify(p)).digest('hex');
    return {formatId,engineMode:p.engineMode,nativeVariant:p.nativeVariant,profileId:p.id,engineVersion:p.engineVersion,supported:!mismatches.length,reason:mismatches.length?'内核文件与已验证适配版本不同：'+mismatches.join('、'):null,hash,probe:'source-pinned',runtimeHandshakeRequired:true,rules:p.rules};
  })};
}
