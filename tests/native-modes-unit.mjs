import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {nativeProfile,validateRoundPlan,digestPlan,expectedIdentity,mapNativeResult,validateNativeEvent} from '../integration/modes/index.mjs';
import {probeModeCapabilities} from '../integration/modes/capabilities.mjs';
import {createAllyControl} from '../integration/modes/ally-control.mjs';
const profile=nativeProfile('doudizhu-bo3');
assert.equal(nativeProfile('constructor'),null);
const plan={version:1,worldId:'world',branchId:'branch',matchId:'series',gameId:'game',roundId:'round',formatId:'doudizhu-bo3',engineMode:'doudizhu',nativeVariant:'normal',profileId:profile.id,seed:42,reserveDigest:'reserve',playerTeamId:'farmers',controlledSeatId:'f1',seats:[
  {seatId:'z',teamId:'landlord',role:'landlord',controller:'ai',generalId:'caocao',loanRef:'loan1'},
  {seatId:'f1',teamId:'farmers',role:'farmer',controller:'human',generalId:'guanyu',sourceRef:'card1'},
  {seatId:'f2',teamId:'farmers',role:'farmer',controller:'ai',generalId:'zhangfei',sourceRef:'card2'},
]};
assert.deepEqual(validateRoundPlan(plan),plan);
for(const edit of [p=>p.seats.pop(),p=>p.seats[0].controller='human',p=>p.seats[2].generalId='guanyu',p=>p.profileId='new',p=>p.seats[0].teamId='farmers',p=>p.seats[0].sourceRef='card3',p=>p.seed=-1]){const p=structuredClone(plan);edit(p);assert.throws(()=>validateRoundPlan(p));}
const hash=await digestPlan(plan),expected=expectedIdentity(plan,hash),source={},token='a'.repeat(32),origin='http://127.0.0.1:9000';
const seats=plan.seats.map(s=>({...s,alive:true,hp:4,maxHp:4,handCount:4,controlled:s.controller==='human'}));
const data={...expected,type:'result',channel:'noname-shop-native',token,seats,resultId:'game:result',winningTeamId:'farmers',completed:true,simulated:false,privateHand:['not-forwarded'],originVerified:true};
const call=overrides=>validateNativeEvent({event:{origin,source,data,...overrides},origin,source,expected,token,plan});
const validated=call();assert(validated);assert(!Object.hasOwn(validated,'privateHand'));assert(!Object.hasOwn(validated,'originVerified'));
assert.equal(mapNativeResult(validated,plan).result,'win');
assert.equal(call({origin:'http://bad.example'}),null);assert.equal(call({source:{}}),null);
for(const field of ['worldId','branchId','gameId','roundId','planHash','profileId','token','reserveDigest'])assert.equal(call({data:{...data,[field]:'stale'}}),null,field);
assert.equal(call({data:{...data,winningTeamId:'third'}}),null);assert.equal(call({data:{...data,simulated:true}}),null);
const engineRoot=fileURLToPath(new URL('../vendor/noname',import.meta.url));
assert(probeModeCapabilities({engineRoot}).items.every(c=>c.supported&&c.runtimeHandshakeRequired));
assert(probeModeCapabilities({engineRoot:path.join(engineRoot,'missing')}).items.every(c=>!c.supported&&c.reason));
console.log('PASS native modes: pinned profiles, plan/seat invariants, team-relative results, event origin/source/token/identity guards, whitelist DTOs and missing-engine failure');
const controlEvents=[],bindings=plan.seats.map(seat=>({seat,player:{_shopSeatId:seat.seatId,alive:true,isAlive(){return this.alive;}}}));
const primary=bindings[1].player,game={me:primary,swapPlayer(p){this.me=p;}},context={game,ui:{arena:{classList:{remove(){}}}},_status:{auto:false}};
const control=createAllyControl({context,plan,bindings,emit:(type,data)=>controlEvents.push({type,...data}),snapshot:()=>[],isFinalised:()=>false});
control.request({requestId:'enemy',action:'takeover',seatId:'z'});assert.equal(controlEvents.at(-1).code,'NOT_TEAMMATE');
control.request({requestId:'ally',action:'takeover',seatId:'f2'});assert.equal(game.me,primary,'a pending human response is not stolen');assert.equal(controlEvents.at(-1).type,'controlPending');
control.apply();assert.equal(game.me,bindings[2].player);assert.equal(control.state().revision,1);
control.request({requestId:'ally',action:'takeover',seatId:'f2'});assert.equal(control.state().revision,1,'duplicate control is idempotent');
primary.alive=false;control.request({requestId:'release',action:'release'});control.apply();assert.equal(game.me,primary,'release can return to observing a dead captain');
control.request({requestId:'survivor',action:'takeover',seatId:'f2'});control.apply();assert.equal(game.me,bindings[2].player,'dead captain can opt into a surviving teammate');
control.request({requestId:'pending-death',action:'release'});control.apply();control.request({requestId:'target-dies',action:'takeover',seatId:'f2'});bindings[2].player.alive=false;control.apply();assert.equal(controlEvents.at(-1).code,'SEAT_DEAD');
console.log('PASS optional ally control: same-team only, safe boundary, request idempotency, release and takeover after captain death');
