import assert from 'node:assert/strict';
import http from 'node:http';
import path from 'node:path';
import {inspectService,serviceFingerprint,ownedServicePid} from '../dev/service-health.mjs';
import {startDevelopmentServer} from '../dev/runtime.mjs';
import {root} from '../dev/process.mjs';
import {discoverModeCapabilities} from '../integration/mode-discovery.mjs';

const fingerprint=serviceFingerprint(),dev=await startDevelopmentServer({port:0,enginePort:0,watch:false});
try{
 const ready=await inspectService({origin:dev.origin,engineOrigin:dev.engineOrigin});assert.equal(ready.kind,'ready');assert.equal(ready.status.serviceFingerprint,fingerprint);
 assert.equal((await inspectService({origin:dev.origin,engineOrigin:dev.engineOrigin,fingerprint:'different-build'})).kind,'stale');
 const actual=await discoverModeCapabilities(async url=>{const r=await fetch(new URL(url,dev.origin));if(!r.ok)throw Error('HTTP '+r.status);return r.json();});assert(actual.every(p=>p.supported));
}finally{await dev.close();}
let fingerprintValue=null;const old=http.createServer((req,res)=>{res.setHeader('content-type','application/json');if(req.url==='/__dev/status')return res.end(JSON.stringify({application:'noname-card-shop-development',serviceFingerprint:fingerprintValue}));if(req.url==='/api/runtime')return res.end(JSON.stringify({ready:true,engineOrigin:oldOrigin}));res.statusCode=404;res.end('{}');});
await new Promise(resolve=>old.listen(0,'127.0.0.1',resolve));const oldOrigin='http://127.0.0.1:'+old.address().port;
try{assert.equal((await inspectService({origin:oldOrigin,engineOrigin:oldOrigin})).kind,'stale');fingerprintValue=fingerprint;const missing=await inspectService({origin:oldOrigin,engineOrigin:oldOrigin});assert.equal(missing.kind,'stale');assert.match(missing.reason,/能力接口/);}finally{old.closeAllConnections();await new Promise(resolve=>old.close(resolve));}
const status={application:'noname-card-shop-development'},owned={ProcessId:98765,Name:'node.exe',CommandLine:'"C:/Program Files/nodejs/node.exe" "'+path.join(root,'dev/launch.mjs')+'"'};
assert.equal(ownedServicePid(status,[owned]),owned.ProcessId);assert.equal(ownedServicePid({...status,pid:123},[owned]),null);assert.equal(ownedServicePid(status,[owned,{...owned,ProcessId:98766}]),null);assert.equal(ownedServicePid({application:'other'},[owned]),null);assert.equal(ownedServicePid(status,[{...owned,CommandLine:'node unrelated.mjs "'+path.join(root,'dev/launch.mjs')+'"'}]),null);
const failure=await discoverModeCapabilities(async()=>{throw Error('404');});assert.equal(failure.length,2);assert(failure.every(p=>p.supported===false&&p.reason.includes('一键启动')));
const incompatible=await discoverModeCapabilities(async url=>String(url)==='/api/runtime'?{ready:true,engineOrigin:'http://localhost'}:{items:[{formatId:'doudizhu-bo3',profileId:'ddz',supported:false,reason:'内核不匹配'},{formatId:'versus2v2-bo3',profileId:'two',supported:true}]});assert.equal(incompatible[0].reason,'内核不匹配');
console.log('PASS current service health, stale service/missing mode endpoint rejection, exact process ownership, actionable discovery errors and real incompatibility preservation');
