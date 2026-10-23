export const CONTRACT = 'card-shop-ui/1.0';
export const RARITIES = ['N', 'R', 'SR', 'SSR'];
export const clone = value => structuredClone(value);
export const id = prefix => `${prefix}-${globalThis.crypto.randomUUID()}`;
export const sum = values => values.reduce((a,b)=>a+b,0);
export const clamp = (n,a,b) => Math.max(a,Math.min(b,n));
export function fail(code,message,details){throw Object.assign(new Error(message),{code,details});}
export function need(condition,code,message){if(!condition)fail(code,message);}
export function integer(n,min=1,max=1000000){need(Number.isSafeInteger(n)&&n>=min&&n<=max,'INVALID_INPUT','数量或金额超出允许范围。');return n;}
export function errorDTO(error){return {code:error.code||'INTERNAL_ERROR',message:error.message||'操作失败。',retryable:['CONCURRENT_UPDATE','STORAGE_ERROR'].includes(error.code),...(error.details?{details:error.details}:{})};}
export function random(world){world.seed=(Math.imul(world.seed,1664525)+1013904223)>>>0;return world.seed/4294967296;}
export function pick(world,items){need(items.length,'EMPTY_POOL','该稀有度没有可发行的卡。');return items[Math.floor(random(world)*items.length)];}
export function shuffle(world,items){const a=[...items];for(let i=a.length-1;i>0;i--){const j=Math.floor(random(world)*(i+1));[a[i],a[j]]=[a[j],a[i]];}return a;}
export function serial(world,prefix){return `${prefix}-${world.worldId}-${++world.serial}`;}
export function money(n){need(Number.isSafeInteger(n)&&n>=0,'INVALID_AMOUNT','金额必须是非负安全整数。');return n;}
export function debit(wallet,n){money(n);need(wallet.available>=n,'INSUFFICIENT_FUNDS','可用游戏币不足。');wallet.available-=n;}
export function credit(wallet,n){money(n);money(wallet.available+n);wallet.available+=n;}
export function page(rows,input={}){const start=integer(Number(input.cursor||0),0,10000000),limit=integer(input.limit??48,1,200);return {items:rows.slice(start,start+limit),total:rows.length,nextCursor:start+limit<rows.length?String(start+limit):null};}
