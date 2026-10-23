import {clone,integer,need,serial,sum} from './common.mjs';
import {productEnabled} from './distribution.mjs';
import {productDTO} from './products.mjs';
import {note} from './world.mjs';

/** A basket has distinct product/unit rows. Reject duplicates instead of silently changing quantities. */
export function basketQuote(world,input){
  need(input&&typeof input==='object'&&!Array.isArray(input)&&Array.isArray(input.lines),'INVALID_INPUT','采购购物篮必须提供商品行。');
  need(input.lines.length>=1&&input.lines.length<=38,'INVALID_INPUT','购物篮需包含 1 至 38 行商品。');
  const seen=new Set();
  const lines=input.lines.map(line=>{
    need(line&&typeof line==='object'&&!Array.isArray(line),'INVALID_INPUT','采购商品行格式不正确。');
    need(typeof line.productId==='string'&&line.productId.length>0&&['pack','box'].includes(line.unit),'INVALID_INPUT','商品编号或采购单位不正确。');
    const quantity=integer(line.quantity,1,20),key=`${line.productId}|${line.unit}`;
    need(!seen.has(key),'INVALID_INPUT','相同商品和单位只能出现一行，请先合并数量。');seen.add(key);
    const product=world.products.find(p=>p.productId===line.productId);
    need(productEnabled(world.rules,line.productId)&&product?.availability==='available','UNAVAILABLE_PRODUCT','购物篮内商品已停止发行或无法供货。');
    const unitAmount=product.prices[line.unit].wholesale,total=unitAmount*quantity;
    need(Number.isSafeInteger(unitAmount)&&unitAmount>=0&&Number.isSafeInteger(total),'INVALID_AMOUNT','采购金额不正确。');
    return {productId:product.productId,themeName:product.name,unit:line.unit,quantity,unitAmount,total,productVersion:product.productVersion,priceVersion:product.priceVersion};
  });
  const totalDebit=sum(lines.map(line=>line.total));
  need(Number.isSafeInteger(totalDebit),'INVALID_AMOUNT','采购总额超出允许范围。');
  const cashDebit=Math.min(totalDebit,world.wallet.available),creditDebit=totalDebit-cashDebit;
  return {kind:'supplier-basket',lines,totalDebit,cashDebit,creditDebit,availableCash:world.wallet.available,supplierCreditAvailable:Math.max(0,world.rules.supplierCreditLimit-world.wallet.debt),validUntil:{day:world.clock.day,minute:1200}};
}

/** The runtime invokes this only on its transaction fork; no order is committed on any failure. */
export function placeBasketOrder(world,quote){
  need(world.clock.phase!=='closed','SHOP_CLOSED','请在准备或营业时下单。');
  need(quote.kind==='supplier-basket'&&quote.validUntil.day===world.clock.day&&world.clock.minute<=quote.validUntil.minute,'QUOTE_EXPIRED','采购购物篮报价已过期。');
  const products=quote.lines.map(line=>{
    const product=world.products.find(p=>p.productId===line.productId);
    need(productEnabled(world.rules,line.productId)&&product?.availability==='available','UNAVAILABLE_PRODUCT','购物篮内商品已停止发行或无法供货。');
    need(product.productVersion===line.productVersion&&product.priceVersion===line.priceVersion&&product.prices[line.unit].wholesale===line.unitAmount,'QUOTE_EXPIRED','购物篮内商品的供货版本或价格已变化。');
    return product;
  });
  const shortfall=Math.max(0,quote.totalDebit-world.wallet.available);
  need(world.wallet.debt+shortfall<=world.rules.supplierCreditLimit||shortfall===0,'INSUFFICIENT_FUNDS','游戏币或供应商信用额度不足，购物篮尚未下单。');
  world.wallet.available-=quote.totalDebit-shortfall;world.wallet.debt+=shortfall;
  const orders=quote.lines.map((line,index)=>{
    const product=products[index];
    const order={orderId:serial(world,'order'),product:clone(product),productId:line.productId,unit:line.unit,quantity:line.quantity,unitCost:line.unitAmount,cost:line.total,status:'pending',dueAt:world.clock.day*1440+world.clock.minute+world.rules.deliveryMinutes};
    world.orders.push(order);world.daily.purchases+=order.cost;
    world.lifetime.ordered+=line.quantity*(line.unit==='box'?product.packsPerBox:1);
    note(world,'orderPlaced',{orderId:order.orderId,amount:order.cost});
    return {...clone(order),themeName:product.name,productVersion:product.productVersion,total:order.cost,product:productDTO(product)};
  });
  return {orderIds:orders.map(o=>o.orderId),orders,totalDebit:quote.totalDebit,cashDebit:quote.totalDebit-shortfall,creditDebit:shortfall};
}
