import fs from 'node:fs';
import {performance} from 'node:perf_hooks';
import {createWorld} from '../modules/backend/world.mjs';
import {buildCatalog} from '../modules/backend/catalog.mjs';
import {publishProducts,makeSealed} from '../modules/backend/products.mjs';
import {openingPreview,executeOpening,surplusPreview} from '../modules/backend/trading.mjs';
const data=n=>JSON.parse(fs.readFileSync(new URL(`../data/${n}.json`,import.meta.url))),rules=data('backend-rules'),catalog=buildCatalog(data('cards'),rules),product=publishProducts(catalog,rules,1).find(p=>p.productId==='standard');
const values=[];
for(let seed=1;seed<=100;seed++){const w=createWorld(rules);w.seed=seed;for(let i=0;i<10;i++)makeSealed(w,product,'pack',product.prices.pack.wholesale);executeOpening(w,openingPreview(w,{}),catalog);const p=surplusPreview(w,catalog,{});values.push(p.estimatedAmount);}
const mean=values.reduce((a,b)=>a+b,0)/values.length;
const sample={items:Object.fromEntries(Array.from({length:3000},(_,i)=>['card'+i,{kind:'card',ownerId:'player',cardKey:'noname:sample',printVersion:'example',cost:40,protected:false}]))},record={world:sample,archives:Array.from({length:30},(_,i)=>({id:'a'+i,world:structuredClone(sample)})),requests:{}};
const before=performance.now();for(let i=0;i<5;i++)structuredClone(record);const full=(performance.now()-before)/5;
const after=performance.now();for(let i=0;i<5;i++)({...record,world:structuredClone(record.world),archives:[...record.archives],requests:{...record.requests}});const scoped=(performance.now()-after)/5;
const result={scenario:'100 fixed seeds; ten standard loose packs; valuation of surplus after retaining one of every print; all surplus selling at reference price is hypothetical, not guaranteed cash',procurement:product.prices.pack.wholesale*10,surplusValue:{min:Math.min(...values),mean,max:Math.max(...values)},copyBenchmark:{archives:30,itemsPerWorld:3000,fullCopyMs:+full.toFixed(2),scopedCopyMs:+scoped.toFixed(2)}};fs.mkdirSync(new URL('../.local/game-audit/',import.meta.url),{recursive:true});fs.writeFileSync(new URL('../.local/game-audit/measurements.json',import.meta.url),JSON.stringify(result,null,2));console.log(JSON.stringify(result));
