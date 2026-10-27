import {clone,id} from './common.mjs';
import {engineMessage} from './matches.mjs';
import {applyMatchTime} from './match-time.mjs';
import {dayArchiveViews} from './views.mjs';

// Runtime retains transaction/commit/event ownership. This policy only builds snapshots
// and chooses retention on the caller's fork, with the original injected clock/catalogue.
export function createArchivePolicy({catalogFor,navigation,now}){
  function archive(world,slot){
    const saved=clone(world);
    for(const event of saved.pendingEngineEvents||[]){const m=saved.matches.find(m=>m.matchId===event.matchId);if(m?.status==='running'&&m.gameId===event.message.matchId)engineMessage(saved,event.matchId,event.message);}
    applyMatchTime(saved,catalogFor(saved.rules),navigation);
    saved.pendingEngineEvents=[];let restarted=false;
    for(const m of saved.matches){delete m.needsRestartAfterEvents;if(m.background&&!m.simulated&&m.status==='running'){m.status='interrupted';restarted=true;}}
    return {id:id('archive'),format:'noname-shop-world-save',version:2,worldId:world.worldId,branchId:world.branchId,day:saved.clock.day,minute:saved.clock.minute,slot,createdAt:now(),...(restarted?{recoveryNote:'读取后 NPC 当前小局重开，已完成小局、费用和比分保留。'}:{}),world:saved};
  }
  function saveArchive(next,slot){
    if(['start','close'].includes(slot)&&next.archives.some(a=>a.worldId===next.world.worldId&&a.branchId===next.world.branchId&&a.day===next.world.clock.day&&a.slot===slot))return;
    next.archives.push(archive(next.world,slot));
    const cutoff=next.world.clock.day-next.world.rules.maxDays+1;
    const eligible=next.archives.filter(a=>a.slot==='before-load'||a.day>=cutoff),capacity=next.world.rules.maxArchives;
    const daily=new Set(dayArchiveViews(eligible,next.world.branchId,next.world.branchLineage).slice(0,Math.max(0,capacity-2)).map(a=>a.id));
    const recent=eligible.filter(a=>!daily.has(a.id)).slice(-Math.max(0,capacity-daily.size));
    const kept=new Set([...daily,...recent.map(a=>a.id)]);next.archives=eligible.filter(a=>kept.has(a.id));
  }
  return {archive,saveArchive};
}
