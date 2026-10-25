import {need} from './common.mjs';
import {note} from './world.mjs';
import {tickManagement} from './management.mjs';
import {tickEconomy} from './trading.mjs';
import {tickNpcTables} from './npc-tables.mjs';

export const activeTimeMatch=w=>w.matches.find(m=>!m.background&&m.timeSession&&!m.timeSession.applied&&m.status!=='finished');
export function applyMatchTime(w,catalog,navigation){
  for(const match of w.matches){
    const session=match.timeSession;
    // Retire time leases saved by the old NPC policy without jumping the store clock.
    if(match.background&&session&&!session.applied){session.applied=true;session.policy='background-continuous';continue;}
    if(!session||session.applied||match.status!=='finished'||match.result==='cancelled')continue;
    need(session.minutes===30&&Number.isFinite(w.clock.minute)&&w.clock.minute+30<1440,'INVALID_STATE','比赛耗时不能跨过当前营业日边界。');
    const from=w.clock.minute,target=from+30,day=w.clock.day;
    // Replay bounded normal-size steps so deadlines, visits and paid legacy orders advance too.
    while(w.clock.minute<target){
      const delta=Math.min(.25*w.rules.minutesPerSecond*w.clock.speed,target-w.clock.minute),seconds=delta/(w.rules.minutesPerSecond*w.clock.speed);
      w.clock.minute=Math.min(target,w.clock.minute+delta);
      if(w.clock.phase==='open'&&w.clock.minute>=1200){w.clock.phase='closing';note(w,'shopClosing');}
      for(const order of w.orders)if(order.status==='pending'&&order.dueAt<=day*1440+w.clock.minute)order.status='arrived';
      tickManagement(w,catalog);
      tickEconomy(w,catalog,{map:navigation.get('store'),seconds});
      tickNpcTables(w,catalog,navigation,seconds,{schedule:false,simulate:false});
    }
    session.applied=true;session.appliedAt={day,minute:w.clock.minute};
    match.finishedAt={day,minute:w.clock.minute};
    note(w,'matchTimeApplied',{matchId:match.matchId,minutes:30,from,to:w.clock.minute});
  }
}
