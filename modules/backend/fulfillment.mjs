import {need} from './common.mjs';
import {makeSealed} from './products.mjs';
import {note} from './world.mjs';

// Shared by instant purchases and legacy paid orders. Never charges the wallet.
export function receiveOrder(world,order){
  need(order?.status==='arrived','NOT_READY','订单尚未到货或已经入库。');
  const refs=[];
  for(let i=0;i<order.quantity;i++)refs.push(makeSealed(world,order.product,order.unit,order.unitCost).inventoryRef);
  order.status='received';order.inventoryRefs=refs;
  order.receivedAt={day:world.clock.day,minute:world.clock.minute};
  world.lifetime.received+=order.quantity*(order.unit==='box'?24:1);
  note(world,'goodsReceived',{orderId:order.orderId,quantity:refs.length});
  return {inventoryRefs:refs,stock:{packs:order.quantity*(order.unit==='box'?24:1)}};
}

export function deliverImmediately(world,order){
  order.fulfillment='instant';order.status='arrived';
  order.dueAt=world.clock.day*1440+world.clock.minute;
  return receiveOrder(world,order);
}
