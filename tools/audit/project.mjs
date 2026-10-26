// Read-only structural audit. A missing static reference is an error; a module
// without static callers is only a review candidate (HTML/dynamic loading exists).
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {parse} from '../vendor/acorn.mjs';
export const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../..');
const folders=['frontend','frontend-next','modules','integration','contracts','content','config','dev','desktop','tools','tests','experiments'];
const excluded=new Set(['node_modules','dist','build','evidence','__pycache__','.local','.git']);
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(e=>{
  const file=path.join(folder,e.name);if(e.isSymbolicLink()||excluded.has(e.name))return [];
  return e.isDirectory()?walk(file):/\.(?:mjs|js|cjs|html|css)$/.test(e.name)?[file]:[];
});}
const rel=file=>path.relative(root,file).replaceAll('\\','/');
function resolve(file,spec){
  const clean=spec.split(/[?#]/)[0];
  if(!clean||/^(?:https?:|data:|blob:|#)/i.test(spec))return null;
  // These imports execute in the separate engine origin, not the shop origin.
  const engineAliases={'/shop-integration/duel.js':'integration/duel.js','/shop-integration/modes/bootstrap.mjs':'integration/modes/bootstrap.mjs'};
  if(engineAliases[clean])return path.join(root,engineAliases[clean]);
  if(/^\/(?:noname(?:\.js|\/)|game\/)/.test(clean))return path.join(root,'vendor/noname',clean.slice(1));
  const candidate=path.resolve(clean.startsWith('/')?root:path.dirname(file),'.'+(clean.startsWith('/')?clean:'/'+clean));
  return [candidate,candidate+'.js',candidate+'.mjs',candidate+'.cjs',candidate+'.json',path.join(candidate,'index.js')].find(f=>fs.existsSync(f)&&fs.statSync(f).isFile())||candidate;
}
export function auditProject(){
  const files=[...fs.readdirSync(root,{withFileTypes:true}).filter(e=>e.isFile()&&/\.(mjs|js|cjs|html|css)$/.test(e.name)).map(e=>path.join(root,e.name)),...folders.filter(d=>fs.existsSync(path.join(root,d))).flatMap(d=>walk(path.join(root,d)))];
  const report={files:files.length,errors:[],edges:[],boundaries:[],dynamicImports:[]},seen=new Set();
  const reference=(file,spec,kind)=>{
    if(kind==='module'&&!spec.startsWith('.')&&!spec.startsWith('/'))return;
    const target=resolve(file,spec);if(!target)return;
    const key=rel(file)+'|'+spec;if(seen.has(key))return;seen.add(key);
    report.edges.push({from:rel(file),to:rel(target),kind});
    if(!fs.existsSync(target))report.errors.push({file:rel(file),reference:spec,reason:'missing-reference'});
    if(/^(modules|integration)\//.test(rel(file))&&/^(deliverables|tools|tests|frontend|frontend-next)\//.test(rel(target)))report.boundaries.push({from:rel(file),to:rel(target)});
  };
  for(const file of files){
    const text=fs.readFileSync(file,'utf8');
    if(/\.(mjs|js|cjs)$/.test(file)){
      let ast;try{ast=parse(text,{ecmaVersion:'latest',sourceType:'module',allowReturnOutsideFunction:true});}catch(e){report.errors.push({file:rel(file),reason:'syntax',message:e.message});continue;}
      const visit=node=>{
        if(!node||typeof node!=='object')return;
        if(['ImportDeclaration','ExportNamedDeclaration','ExportAllDeclaration'].includes(node.type)&&node.source)reference(file,node.source.value,'module');
        if(node.type==='ImportExpression'){if(typeof node.source?.value==='string')reference(file,node.source.value,'module');else report.dynamicImports.push(rel(file));}
        if(node.type==='CallExpression'&&node.callee?.name==='require'&&typeof node.arguments[0]?.value==='string')reference(file,node.arguments[0].value,'module');
        for(const [key,value]of Object.entries(node))if(key!=='source'){if(Array.isArray(value))value.forEach(visit);else if(value&&typeof value==='object')visit(value);}
      };visit(ast);
    }else if(file.endsWith('.html')){
      for(const m of text.matchAll(/<(?:script|link|img)\b[^>]*?\b(?:src|href)=["']([^"']+)["']/gi))reference(file,m[1],'html');
    }else for(const m of text.matchAll(/url\(\s*["']?([^\s'"()]+)["']?\s*\)/g))reference(file,m[1],'css');
  }
  const callers=new Set(report.edges.map(e=>e.to));
  report.reviewCandidates=files.map(rel).filter(f=>/\.mjs$/.test(f)&&!callers.has(f)&&! /^(tools|tests|dev|experiments)\//.test(f));
  const catalogue=JSON.parse(fs.readFileSync(path.join(root,'data/cards.json'),'utf8'));
  const editions=JSON.parse(fs.readFileSync(path.join(root,'data/print-editions.json'),'utf8'));
  const missing=catalogue.cards.filter(c=>!fs.existsSync(path.join(root,'vendor/noname/image/character',c.img)));
  report.assetCoverage={cards:catalogue.cards.length,missingCharacterArt:missing.map(c=>({generalId:c.id,name:c.name,themeId:c.pack,image:c.img,active:!!editions.products[c.pack]}))};
  report.dynamicImports=[...new Set(report.dynamicImports)];return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditProject(),out=path.join(root,'.local/project-audit/structure.json');fs.mkdirSync(path.dirname(out),{recursive:true});fs.writeFileSync(out,JSON.stringify(report,null,2));
  console.log(JSON.stringify({files:report.files,staticReferences:report.edges.length,errors:report.errors,boundaries:report.boundaries,reviewCandidates:report.reviewCandidates.length,missingCharacterArt:report.assetCoverage.missingCharacterArt.length,report:out},null,2));
  if(report.errors.length||report.boundaries.length)process.exitCode=1;
}
