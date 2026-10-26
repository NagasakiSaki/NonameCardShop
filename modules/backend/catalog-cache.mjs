import {buildCatalog} from './catalog.mjs';

// Owned by one runtime. Catalogue consumers must treat results as read-only.
// A full rules key detects in-place configuration edits and restored day archives.
// Bound retention avoids holding every historical configuration for the whole session.
export function createCatalogProvider(source,{capacity=3,build=buildCatalog}={}){
  if(!Number.isSafeInteger(capacity)||capacity<1||capacity>16)throw Error('Invalid catalogue cache capacity');
  const entries=new Map();
  return rules=>{
    const key=JSON.stringify(rules);
    if(entries.has(key)){const value=entries.get(key);entries.delete(key);entries.set(key,value);return value;}
    const value=build(source,rules); // Failed builds never poison subsequent requests.
    entries.set(key,value);
    if(entries.size>capacity)entries.delete(entries.keys().next().value);
    return value;
  };
}
