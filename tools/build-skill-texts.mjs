import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {parse} from './vendor/acorn.mjs';
import {projectRoot as root,nonameRoot,characterRoot,sourceLabel} from './lib/noname-source.mjs';
import {captureSkillText,skillPlainText} from './lib/skill-text-capture.mjs';
import {sha256} from './lib/file-inventory.mjs';
import {reserveCandidateDirectory,argument} from './lib/candidate-output.mjs';
const args=process.argv.slice(2),out=reserveCandidateDirectory({root,output:argument(args,'out',`.local/skill-texts-${Date.now()}`)});
if(JSON.parse(fs.readFileSync(path.join(nonameRoot,'package.json'))).version!=='1.11.6')throw Error('此提取器固定为1.11.6，请先审查新内核的文本兼容');
globalThis.window=globalThis;globalThis.document={createElement:()=>({style:{},classList:{add(){},remove(){}}}),addEventListener(){},querySelector:()=>null};globalThis.localStorage={getItem:()=>null,setItem(){}};
const {get,lib,captured}=await import('noname');
const capture=captureSkillText({get,lib}),packs=new Map(),translations=new Map(),inputs=[],dynamic=new Map();
const data=JSON.parse(fs.readFileSync(path.join(root,'data/cards.json')));
for(const file of ['data/cards.json','tools/build-skill-texts.mjs','tools/lib/skill-text-capture.mjs','tools/adapters/noname/index.js'])inputs.push({file,sha256:sha256(fs.readFileSync(path.join(root,file)))});
function walk(node,visit){if(!node||typeof node!=='object')return;visit(node);for(const [key,value]of Object.entries(node))if(!['loc','start','end'].includes(key)){if(Array.isArray(value))value.forEach(n=>walk(n,visit));else if(value&&typeof value==='object')walk(value,visit);}}
const propName=p=>p.key?.name??p.key?.value;
const glossaryFile=path.join(nonameRoot,'noname/library/poptip.js'),glossarySource=fs.readFileSync(glossaryFile,'utf8');
inputs.push({file:sourceLabel(glossaryFile),sha256:sha256(glossarySource)});
const glossaryAst=parse(glossarySource,{ecmaVersion:'latest',sourceType:'module'});
walk(glossaryAst,node=>{if(node.type!=='VariableDeclarator'||node.id.name!=='_poptipMap')return;
  for(const entry of node.init.arguments[0].elements){const [key,object]=entry.elements;const record={};for(const p of object.properties)if(p.value.type==='Literal'||p.value.type==='TemplateLiteral'&&!p.value.expressions.length)record[propName(p)]=p.value.value??p.value.quasis[0].value.cooked;capture.definitions.set(key.value,record);}
});
const zhanfaFile=path.join(nonameRoot,'noname/library/zhanfa.js'),zhanfaSource=fs.readFileSync(zhanfaFile,'utf8');inputs.push({file:sourceLabel(zhanfaFile),sha256:sha256(zhanfaSource)});
walk(parse(zhanfaSource,{ecmaVersion:'latest',sourceType:'module'}),node=>{if(node.type!=='VariableDeclarator'||node.id.name!=='_zhanfa')return;for(const p of node.init.properties){const values=Object.fromEntries(p.value.properties.filter(p=>p.value?.type==='Literal').map(p=>[propName(p),p.value.value]));capture.definitions.set(propName(p),{name:values.translate,info:values.info});}});
// Card translations supply names referenced by character descriptions. No card effects are run.
for(const file of fs.readdirSync(path.join(nonameRoot,'card')).filter(f=>f.endsWith('.js'))){const full=path.join(nonameRoot,'card',file),source=fs.readFileSync(full,'utf8');inputs.push({file:sourceLabel(full),sha256:sha256(source)});const ast=parse(source,{ecmaVersion:'latest',sourceType:'module'});walk(ast,node=>{
  const object=node.type==='Property'&&propName(node)==='translate'?node.value:node.type==='VariableDeclarator'&&/^translates?(?:\$\w+)?$/.test(node.id.name)?node.init:null;
  if(object?.type==='ObjectExpression')for(const p of object.properties)if(typeof p.value?.value==='string')translations.set(propName(p),p.value.value);
});}
for(const pack of data.packs){
  const file=path.join(characterRoot,pack.id+'.js'),source=fs.readFileSync(file,'utf8');inputs.push({file:sourceLabel(file),sha256:sha256(source)});
  const ast=parse(source,{ecmaVersion:'latest',sourceType:'module',locations:true}),keys=[];
  for(const node of ast.body)if(node.type==='VariableDeclaration')for(const d of node.declarations)if(/^translates(?:\$\w+)?$/.test(d.id.name)&&d.init?.type==='ObjectExpression')for(const p of d.init.properties)if(p.kind==='get')keys.push({key:propName(p),line:p.loc.start.line});
  dynamic.set(pack.id,keys);
  const before=captured.length;await import(pathToFileURL(file).href);const pkg=captured.splice(before).find(p=>p.type==='character'&&p.data);
  if(!pkg)throw Error('无法提取 '+pack.id);packs.set(pack.id,pkg.data);
  for(const [key,value]of Object.entries(pkg.data.translate||{}))if(typeof value==='string')translations.set(key,value);
}
const unresolved=[],changed=[],records={},missingBase=[];
function resolveText(raw,local,terms,trail=new Set()){
  if(typeof raw!=='string')return '';
  return raw.replace(/⟦NONAME_TEXT_(\d+)⟧/g,(_all,index)=>{
    const token=capture.tokens[Number(index)];if(!token){unresolved.push({kind:'token',id:index});return '〔内容待核对〕';}
    const {kind,value:id}=token,key=kind+':'+id;
    if(trail.has(key))return '';
    const next=new Set(trail).add(key),definition=capture.definitions.get(id);
    if(kind==='info')return resolveText(definition?.info||local[id+'_info']||translations.get(id+'_info'),local,terms,next);
    const name=definition?.name||local[id]||translations.get(id);
    if(!name){unresolved.push({kind,id});return '〔'+id+'：说明待核对〕';}
    if(kind==='term')terms.add(id);
    return resolveText(name,local,terms,next);
  });
}
for(const card of data.cards){
  const pkg=packs.get(card.pack),local=pkg.translate||{};
  for(const skill of card.skills){
    const key=card.pack+':'+skill.id;if(records[key])continue;
    const terms=new Set(),raw=local[skill.id+'_info']??translations.get(skill.id+'_info')??skill.description;
    let description=skillPlainText(resolveText(raw,local,terms));
    if(!description){missingBase.push(key);description='上游未提供此技能的基础说明，请查看技能源码及实际对局提示。';}
    const explanations=[];
    // Resolve nested terms until the finite source graph is exhausted, and include derivations.
    for(const id of terms){if(explanations.length>=80)throw Error('术语引用过深 '+key);const d=capture.definitions.get(id),name=skillPlainText(resolveText(d?.name||local[id]||translations.get(id)||id,local,new Set()));const info=skillPlainText(resolveText(d?.info||local[id+'_info']||translations.get(id+'_info'),local,terms,new Set(['term:'+id])));if(info&&info!==description)explanations.push({id,name,description:info});}
    const extraKeys=Object.keys(local).filter(k=>k===skill.id+'_append'||k.startsWith(skill.id+'_info_')||[skill.id+'_rewrite_info',skill.id+'_faq_info'].includes(k));
    const variants=extraKeys.map(id=>({id,name:skillPlainText(resolveText(local[id.replace(/_info$/,'')]||'其他状态说明',local,new Set())),description:skillPlainText(resolveText(local[id],local,new Set()))})).filter(v=>v.description&&v.description!==description);
    const dynamicTranslation=Object.hasOwn(pkg.dynamicTranslate||{},skill.id);
    const text=[description,...(explanations.length?['\n术语与关联技能：',...explanations.map(t=>t.name+'：'+t.description)]:[]),...(dynamicTranslation?['\n此技能说明会随对局状态变化；这里展示基础说明，对局时请查看实时技能提示。']:[])].join('\n');
    records[key]={originalDescription:skill.description||'',description:text,dynamicTranslation,terms:explanations,variants};
    if(text!==skill.description)changed.push({key,before:skill.description||'',after:text});
  }
}
for(const input of inputs)if(sha256(fs.readFileSync(path.join(root,input.file)))!==input.sha256)throw Error('复核期间上游源变化：'+input.file);
const report={schema:1,engineVersion:'1.11.6',cards:data.cards.length,skills:Object.keys(records).length,changed:changed.length,missingBase,unresolved:[...new Map(unresolved.map(r=>[JSON.stringify(r),r])).values()],dynamicSkills:Object.entries(records).filter(([,r])=>r.dynamicTranslation).map(([key])=>key),sourceGetters:Object.fromEntries([...dynamic].filter(([,keys])=>keys.length)),inputs,generator:{file:'tools/build-skill-texts.mjs',sha256:sha256(fs.readFileSync(new URL(import.meta.url)))},changes:changed};
const generated='// Generated from pinned vendor translations; display only. Never use this corpus for pricing.\nexport const SKILL_TEXT_VERSION="noname-1.11.6-text-1";\nexport const SKILL_TEXT_INPUTS='+JSON.stringify(inputs)+';\nexport const SKILL_TEXTS='+JSON.stringify(records)+';\n';
fs.writeFileSync(path.join(out,'skill-texts.mjs'),generated);fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
if(args.includes('--install')){if(report.unresolved.length)throw Error('仍有 '+report.unresolved.length+' 项未解析引用，拒绝安装；见 '+out);fs.writeFileSync(path.join(root,'data/skill-texts.mjs'),generated);}
console.log(JSON.stringify({report:path.join(out,'report.json'),skills:report.skills,changed:report.changed,unresolved:report.unresolved,dynamic:report.dynamicSkills.length,installed:args.includes('--install')},null,2));
