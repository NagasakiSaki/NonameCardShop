import {mountNativeRound,nativeProfile} from '../../integration/modes/index.mjs';
const arena=document.querySelector('#arena'),status=document.querySelector('#status');
let mounted=null,sequence=0;const events=[];
export function samplePlan(scenario='landlord'){
  const versus=scenario.startsWith('versus'),farmer=scenario==='farmer',alternate=scenario==='versus-alternate';
  const formatId=versus?'versus2v2-bo3':'doudizhu-bo3',profile=nativeProfile(formatId),gameId='native-harness-'+(++sequence)+'-'+crypto.randomUUID();
  const seats=versus?[
    {seatId:'left-main',teamId:'left',role:'teammate',controller:alternate?'ai':'human',generalId:'guanyu',sourceRef:'fixture-card-1'},
    {seatId:'right-main',teamId:'right',role:'teammate',controller:alternate?'human':'ai',generalId:'caocao',sourceRef:'fixture-card-2'},
    {seatId:'left-ally',teamId:'left',role:'teammate',controller:'ai',generalId:'zhangfei',sourceRef:'fixture-card-3'},
    {seatId:'right-ally',teamId:'right',role:'teammate',controller:'ai',generalId:'zhangliao',sourceRef:'fixture-card-4'},
  ]:[
    {seatId:'landlord',teamId:'landlord',role:'landlord',controller:farmer?'ai':'human',generalId:'caocao',sourceRef:'fixture-card-1'},
    {seatId:'farmer-main',teamId:'farmers',role:'farmer',controller:farmer?'human':'ai',generalId:'guanyu',sourceRef:'fixture-card-2'},
    {seatId:'farmer-ally',teamId:'farmers',role:'farmer',controller:'ai',generalId:'zhangfei',sourceRef:'fixture-card-3'},
  ];
  const human=seats.find(s=>s.controller==='human');
  return {version:1,worldId:'native-fixture-world',branchId:'native-fixture-branch',matchId:gameId+'-series',gameId,roundId:'round-1',formatId,engineMode:profile.engineMode,nativeVariant:profile.nativeVariant,profileId:profile.id,seed:13579,reserveDigest:'fixture-reserve-only',playerTeamId:human.teamId,controlledSeatId:human.seatId,seats};
}
async function start(scenario,{seriesId,roundNumber=1}={}){
  document.querySelector('#scenario').value=scenario;
  await mounted?.dispose();mounted=null;events.length=0;status.textContent='正在核对并载入本地原生模式…';
  const runtime=await fetch('/api/runtime').then(r=>r.json());
  const plan=samplePlan(scenario);
  if(seriesId)plan.matchId=seriesId;plan.roundId='round-'+roundNumber;
  mounted=await mountNativeRound({container:arena,plan,onEvent:event=>{events.push(event);if(events.length>200)events.shift();status.textContent=JSON.stringify(event,null,2);}}, {engineOrigin:runtime.engineOrigin});
  return plan;
}
document.querySelector('#start').onclick=()=>start(document.querySelector('#scenario').value).catch(e=>{status.textContent=e.code+': '+e.message;});
document.querySelector('#stop').onclick=()=>mounted?.dispose();
document.querySelector('#takeover').onclick=()=>{
  try{const seat=mounted?.plan.seats.find(s=>s.teamId===mounted.plan.playerTeamId&&s.seatId!==mounted.plan.controlledSeatId);if(!seat)throw Error('当前阵营没有队友。');mounted.control({action:'takeover',seatId:seat.seatId});}catch(error){status.textContent=error.message;}
};
document.querySelector('#release').onclick=()=>{try{mounted?.control({action:'release'});}catch(error){status.textContent=error.message;}};
window.nativeHarness={start,events,get mount(){return mounted;}};
