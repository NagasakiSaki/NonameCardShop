import {clone,integer,need} from './common.mjs';
import {makeSealed} from './products.mjs';
import {productEnabled} from './distribution.mjs';
import {note} from './world.mjs';

export const DEFAULT_STARTER_GIFT={enabled:true,unit:'box',quantity:1,productId:null};
export function validateStarterGift(rules){
  const value=rules.starterGift??DEFAULT_STARTER_GIFT;
  need(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.enabled==='boolean'&&['pack','box'].includes(value.unit),'INVALID_CONFIG','开局赠品配置不正确。');
  integer(value.quantity,1,24);
  need(value.productId===null||typeof value.productId==='string'&&value.productId.length>0,'INVALID_CONFIG','开局赠品商品不正确。');
  return value;
}
// Called only while creating a genuinely new repository, before its first day-start archive.
export function grantStarterGift(world){
  if(world.starterGift)return clone(world.starterGift);
  const config=validateStarterGift(world.rules);
  if(!config.enabled)return world.starterGift={version:1,status:'disabled'};
  const products=world.products.filter(p=>p.availability==='available'&&productEnabled(world.rules,p.productId)&&(!config.productId||p.productId===config.productId));
  products.sort((a,b)=>a.prices[config.unit].wholesale-b.prices[config.unit].wholesale||a.productId.localeCompare(b.productId));
  const product=products[0];
  need(product,'INVALID_CONFIG','当前没有可发放的开局赠品，请检查供货主题和赠品设置。');
  const refs=[];
  for(let i=0;i<config.quantity;i++){
    const item=makeSealed(world,product,config.unit,0);item.acquisition='starter-gift';refs.push(item.inventoryRef);
  }
  world.starterGift={version:1,status:'granted',productId:product.productId,productVersion:product.productVersion,name:product.name,unit:config.unit,quantity:config.quantity,inventoryRefs:refs,day:world.clock.day};
  note(world,'starterGiftGranted',{productId:product.productId,unit:config.unit,quantity:config.quantity,inventoryRefs:refs});
  return clone(world.starterGift);
}
