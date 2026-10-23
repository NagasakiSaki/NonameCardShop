import assert from 'node:assert/strict';
import {createBattleMount} from '../integration/host-battle.mjs';
function fixture({delayedFetch=false,delayedLease=false,timeout=10000}={}){
 const m={matchId:'m',status:'prepared',background:false,mode:'bo3',bout:1,mine:[{generalId:'caocao'}],enemy:[{generalId:'liubei'}],rules:{initialHand:4,firstDrawPenalty:1}},leases=new Set(),listeners=new Set(),frames=[];let releaseFetch,releaseLease,serial=0;
 const window={location:{origin:'http://127.0.0.1:9000'},addEventListener:(t,f)=>listeners.add(f),removeEventListener:(t,f)=>listeners.delete(f)};
 const document={createElement:()=>{const frame={style:{},contentWindow:{},remove(){this.removed=true;}};frames.push(frame);return frame;}};
 const runtime={inspect:()=>({world:{matches:[structuredClone(m)]}}),command:async()=>{m.status='running';m.gameId='g'+(++serial);return {ok:true};},pause:{acquire:async()=>{if(delayedLease)await new Promise(r=>releaseLease=r);leases.add('lease');return {leaseId:'lease'};},release:async id=>leases.delete(id)},interrupt:async(id,reason)=>{if(m.status==='running')m.status='interrupted';if(reason)m.error=reason;},trustedEngineEvent:async()=>{m.accepted=(m.accepted||0)+1;}};
 const fetch=async()=>{if(delayedFetch)await new Promise(r=>releaseFetch=r);return {ok:true,json:async()=>({ready:true,integrationVersion:2,engineOrigin:'http://127.0.0.1:9001'})};};
 const mount=createBattleMount(runtime,{window,document,fetch,loadTimeoutMs:timeout}),container={isConnected:true,replaceChildren(frame){this.frame=frame;}};
 return {m,mount,container,leases,listeners,frames,releaseFetch:()=>releaseFetch(),releaseLease:()=>releaseLease(),emit:(origin,source,message)=>{for(const f of listeners)f({origin,source,data:{channel:'noname-packer',matchId:m.gameId,...message}});}};
}
{
 const f=fixture({delayedFetch:true}),controller=new AbortController(),loading=f.mount({container:f.container,matchId:'m',signal:controller.signal});
 await assert.rejects(f.mount({container:f.container,matchId:'m'}),{code:'MATCH_ACTIVE'});controller.abort();f.container.isConnected=false;f.releaseFetch();await assert.rejects(loading,{code:'MOUNT_CANCELLED'});assert.equal(f.leases.size,0);assert.equal(f.m.status,'prepared');
}
{
 const f=fixture({delayedLease:true}),controller=new AbortController(),loading=f.mount({container:f.container,matchId:'m',signal:controller.signal});
 while(f.m.status!=='running')await new Promise(r=>setTimeout(r,1));await new Promise(r=>setTimeout(r,1));controller.abort();f.releaseLease();await assert.rejects(loading,{code:'MOUNT_CANCELLED'});assert.equal(f.leases.size,0);assert.equal(f.m.status,'interrupted');assert.ok(f.frames.every(f=>f.removed));
}
{
 const f=fixture({timeout:10});await f.mount({container:f.container,matchId:'m'});await new Promise(r=>setTimeout(r,30));assert.equal(f.m.status,'interrupted');assert.match(f.m.error,/超时/);assert.equal(f.leases.size,0);
}
{
 const f=fixture({timeout:15}),view=await f.mount({container:f.container,matchId:'m'});
 f.emit('http://evil.invalid',f.container.frame.contentWindow,{type:'ready'});assert.equal(f.m.accepted,undefined);
 f.emit('http://127.0.0.1:9001',f.container.frame.contentWindow,{type:'ready'});await new Promise(r=>setTimeout(r,30));assert.equal(f.m.status,'running');assert.equal(f.m.accepted,1);await view.dispose();await view.dispose();assert.equal(f.leases.size,0);assert.equal(f.listeners.size,0);
}
console.log('PASS battle lifecycle: concurrent mounts, close during fetch/lease, timeout recovery, origin checks and idempotent disposal without leaked pauses.');
