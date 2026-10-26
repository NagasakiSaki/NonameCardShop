import assert from 'node:assert/strict';
import {createCatalogProvider} from '../modules/backend/catalog-cache.mjs';
let builds=0;const source={cards:[]},get=createCatalogProvider(source,{capacity:2,build(s,r){assert.equal(s,source);builds++;if(r.invalid)throw Error('invalid');return {value:structuredClone(r)};}});
const a=get({score:1});assert.equal(get({score:1}),a);assert.equal(builds,1);
const rules={score:2},b=get(rules);rules.score=3;assert.notEqual(get(rules),b);assert.equal(builds,3);
assert.equal(get({score:2}),b,'recent restored rules reuse the matching catalogue');assert.notEqual(get({score:1}),a,'bounded cache evicts oldest');
assert.throws(()=>get({invalid:true}));const before=builds;get({score:1});assert.equal(builds,before,'failure did not evict a valid entry');
const other=createCatalogProvider(source,{build(){return {};}});assert.notEqual(other({score:1}),get({score:1}),'sessions never share catalogue objects');
console.log('PASS bounded runtime catalogue reuse, mutable rules, restored configurations, failed builds and session isolation');
