import {clone,integer,need} from './common.mjs';
import {managementEffects} from './management.mjs';
import {note} from './world.mjs';

export function favoritesView(world){return {cardKeys:[...(world.player.favoriteCardKeys||[])]};}
export function setFavorite(world,catalog,{cardKey,favorite}){
  need(typeof favorite==='boolean','INVALID_INPUT','请选择是否收藏。');
  need(typeof cardKey==='string'&&catalog.byKey.has(cardKey),'NOT_FOUND','武将不存在。');
  const keys=new Set(world.player.favoriteCardKeys||[]);
  if(favorite)keys.add(cardKey);else keys.delete(cardKey);
  world.player.favoriteCardKeys=[...keys];
  return {cardKey,favorite,...favoritesView(world)};
}
export function tableSettingsView(world){
  const automaticAmount=managementEffects({...world,storeSettings:{...world.storeSettings,tableFee:null}}).tableFee;
  return {amount:managementEffects(world).tableFee,automaticAmount,source:world.storeSettings?.tableFee==null?'automatic':'manual',revision:world.storeSettings?.feeRevision||0,min:0,max:1000};
}
export function setTableFee(world,{amount}){
  if(amount!==null)integer(amount,0,1000);
  world.storeSettings??={tableFee:null,feeRevision:0};
  if(world.storeSettings.tableFee!==amount){world.storeSettings.tableFee=amount;world.storeSettings.feeRevision++;note(world,'tableFeeChanged',{amount,revision:world.storeSettings.feeRevision});}
  return clone(tableSettingsView(world));
}
