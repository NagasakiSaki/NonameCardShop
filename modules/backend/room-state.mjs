import {need} from './common.mjs';
export const ROOM_VERSION=1;
export const activeRoom=w=>w.combatRooms?.version===1?w.combatRooms.items.find(r=>!['finished','cancelled'].includes(r.status)):null;
export function initialiseRooms(w){w.combatRooms??={version:ROOM_VERSION,revision:0,items:[]};}
export function validateRooms(w){
  const state=w.combatRooms;if(!state)return;
  need(Number.isSafeInteger(state.version)&&state.version>0,'INVALID_SAVE','房间数据版本不合法。');if(state.version!==ROOM_VERSION)return;
  need(Array.isArray(state.items)&&state.items.length<=100&&Number.isSafeInteger(state.revision)&&state.revision>=0,'INVALID_SAVE','房间列表不完整。');
  need(new Set(state.items.map(r=>r.roomId)).size===state.items.length&&state.items.filter(r=>!['finished','cancelled'].includes(r.status)).length<=1,'INVALID_SAVE','店长房间重复。');
  for(const r of state.items){
    need(typeof r.roomId==='string'&&r.worldId===w.worldId&&['waiting-opponent','selecting-reserve','series','finished','cancelled'].includes(r.status)&&Number.isSafeInteger(r.revision)&&Number.isFinite(r.expiresAt)&&Number.isSafeInteger(r.tableFee)&&r.tableFee>=0,'INVALID_SAVE','房间身份、费用或状态不合法。');
    if(['waiting-opponent','selecting-reserve'].includes(r.status)){
      need(r.branchId===w.branchId&&w.tables.some(t=>t.tableId===r.tableId&&t.reservation===r.roomId&&!t.matchId),'INVALID_SAVE','房间桌位预约丢失。');
      if(r.opponentId){const n=w.npcs.find(n=>n.actorId===r.opponentId);need(n?.currentRoomId===r.roomId&&n.wallet.reserved>=r.tableFee&&r.plan?.enemy?.length,'INVALID_SAVE','房间对手或桌费预留丢失。');
        for(const c of r.plan.enemy)if(c.inventoryRef)need(w.items[c.inventoryRef]?.ownerId===r.opponentId&&w.items[c.inventoryRef]?.lock===r.roomId,'INVALID_SAVE','对方备战池锁定丢失。');}
    }
  }
}
