import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {execFileSync} from 'node:child_process';
import {root} from './process.mjs';

const SERVER_SOURCES=['server.mjs','dev/runtime.mjs','dev/launch.mjs','dev/service-health.mjs','integration/engine-server.mjs','integration/modes/profiles.mjs','integration/modes/capabilities.mjs'];
export function serviceFingerprint(folder=root){const hash=crypto.createHash('sha256');for(const name of SERVER_SOURCES){hash.update(name);hash.update(fs.readFileSync(path.join(folder,name)));}return hash.digest('hex');}
export async function inspectService({origin='http://127.0.0.1:5190',engineOrigin='http://127.0.0.1:5191',fingerprint=serviceFingerprint(),timeoutMs=1000}={}){
  const json=async url=>{const r=await fetch(url,{signal:AbortSignal.timeout(timeoutMs),cache:'no-store'});if(!r.ok)return null;try{return await r.json();}catch{return null;}};
  let status;try{status=await json(origin+'/__dev/status');}catch{return {kind:'missing'};}
  if(status?.application!=='noname-card-shop-development')return {kind:'foreign',status};
  try{
    const runtime=await json(origin+'/api/runtime');
    if(status.serviceFingerprint!==fingerprint)return {kind:'stale',status,reason:'服务代码已更新'};
    if(runtime?.ready!==true||runtime.engineOrigin!==engineOrigin)return {kind:'stale',status,reason:'引擎服务未就绪'};
    const capabilities=await json(engineOrigin+'/shop-integration/modes/capabilities.json');
    if(!['doudizhu-bo3','versus2v2-bo3'].every(id=>capabilities?.items?.some(p=>p.formatId===id&&typeof p.supported==='boolean'&&p.profileId)))return {kind:'stale',status,reason:'缺少斗地主或 2v2 能力接口'};
    for(const route of ['/noname/entry.js','/shop-integration/modes/bootstrap.mjs']){const response=await fetch(engineOrigin+route,{signal:AbortSignal.timeout(timeoutMs)});await response.body?.cancel();if(!response.ok)return {kind:'stale',status,reason:'引擎接入文件未就绪'};}
    return {kind:'ready',status,capabilities};
  }catch{return {kind:'stale',status,reason:'无法访问引擎接入接口'};}
}
// Never terminate a port owner merely because it answered the health route.
export function ownedServicePid(status,processes,folder=root){
  if(status?.application!=='noname-card-shop-development')return null;
  const normal=s=>String(s||'').replaceAll('\\','/').toLowerCase(),launch=normal(path.join(folder,'dev/launch.mjs'));
  const owned=processes.filter(p=>{const tokens=String(p.CommandLine||'').match(/"[^"]*"|[^\s]+/g)||[],entry=tokens[1]?.replace(/^"|"$/g,'');return Number.isSafeInteger(p.ProcessId)&&p.ProcessId>0&&p.ProcessId!==process.pid&&/node(?:\.exe)?$/i.test(p.Name||'')&&normal(entry)===launch;});
  if(status.pid){const found=owned.find(p=>p.ProcessId===status.pid);return found?.ProcessId||null;}
  return owned.length===1?owned[0].ProcessId:null;
}
export function runningNodeProcesses(){
  if(process.platform!=='win32')return [];
  const output=execFileSync('powershell.exe',['-NoProfile','-NonInteractive','-Command',"Get-CimInstance Win32_Process -Filter \"Name = 'node.exe'\" | Select-Object ProcessId,Name,CommandLine | ConvertTo-Json -Compress"],{encoding:'utf8',windowsHide:true,timeout:10000});
  const rows=JSON.parse(output||'[]');return Array.isArray(rows)?rows:[rows];
}
