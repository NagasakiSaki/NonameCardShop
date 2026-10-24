// Small, read-only scene projection. Visual states never settle money or move actors.
export function storefrontView(w){
  const sealed={pack:0,box:0};
  for(const item of Object.values(w.items))if(item.ownerId==='player'&&item.location==='retail'&&!item.lock&&!item.protected&&Object.hasOwn(sealed,item.kind))sealed[item.kind]++;
  return {sealed,upgrades:{...w.management?.levels},tables:w.tables.map(t=>{
    const active=w.matches.find(m=>m.matchId===t.matchId),last=w.matches.findLast(m=>m.tableId===t.tableId&&m.status==='finished');
    const justFinished=last?.finishedAt?.day===w.clock.day&&w.clock.minute-last.finishedAt.minute>=0&&w.clock.minute-last.finishedAt.minute<3;
    return {tableId:t.tableId,state:active?(active.status==='running'?'playing':'reserved'):t.reservation?'reserved':justFinished?'ended':'idle',simulated:!!active?.simulated};
  })};
}
