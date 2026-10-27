// 资源打包闭包验收：正式 manifest 引用的每个运行时素材都必须真实存在，并且被实际 electron-builder
// 运行范围（config/project-layout.cjs + desktop/electron-builder.cjs）包含。
//
// 为什么需要它：开发期由源码服务直接读磁盘，`npm run audit:structure` 只检查静态 import 与分层，
// `assets/frontend/manifest.json` 的 schema 校验也只检查字段。三者都不会发现“文件在仓库里、
// 但打包 filter 没带上”。2026-10-27 交接核查发现的 5 张明亮场景贴图正是这一类。
//
// 判定依据必须来自真实构建配置，不能靠手写目录清单：
//   1. 读取 layout.directories / rootFiles / exclusions；
//   2. 读取 electron-builder 的 extraResources，找到 from 指向工程根的那一条；
//   3. 用与 app-builder-lib 相同的 minimatch 语义（dot:true，目录允许 partial 匹配）逐条判定。
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';

const require=createRequire(import.meta.url);
const here=path.dirname(fileURLToPath(import.meta.url));
export const projectRoot=path.resolve(here,'..','..');

const desktopRoot=path.join(projectRoot,'desktop');
const layout=require(path.join(projectRoot,'config','project-layout.cjs'));
const packaging=require(path.join(desktopRoot,'electron-builder.cjs'));

/** 随发行包一起发布的正式清单。role=runtime 表示前端会 fetch/import；art-source 是素材工具源清单。 */
export const MANIFEST_SOURCES=Object.freeze([
  {file:'assets/frontend/manifest.json',role:'runtime',
   loadedBy:'frontend/world/map-loader.mjs、frontend/app-shell.mjs（角色图集/立绘/头像、地图、瓦片、道具、光效）'},
  {file:'assets/frontend-next/products/manifest.json',role:'runtime',
   loadedBy:'frontend-next/screens/supplier.mjs、frontend-next/screens/workspace.mjs（包装图）'},
  {file:'assets/frontend-bright-anime/products/manifest.json',role:'runtime',
   loadedBy:'frontend-next/screens/stations.mjs（明亮二次元包装图）'},
  {file:'assets/frontend-bright-anime/manifest.characters.json',role:'art-source',
   loadedBy:'素材工具源清单，运行时不读取'},
  {file:'assets/frontend-bright-anime/manifest.props.json',role:'art-source',
   loadedBy:'素材工具源清单，运行时不读取'},
]);

/** 清单里出现的非 /assets/ 指针必须显式登记，避免新指针被静默忽略。 */
export const NON_ASSET_REFERENCES=Object.freeze({
  '/experiments/character-art/CREDITS.md':'人物素材来源记录。只作清单内文档指针，运行时不加载，experiments/ 也不进入发行包。',
});

const minimatchOptions={dot:true};

function loadMinimatch(){
  const candidates=[
    path.join(desktopRoot,'node_modules','minimatch'),
    path.join(projectRoot,'node_modules','minimatch'),
  ];
  for(const candidate of candidates){
    try{
      const version=require(path.join(candidate,'package.json')).version;
      return {module:require(candidate),name:`minimatch@${version}`,source:path.relative(projectRoot,candidate)};
    }catch{/* 换下一个候选 */}
  }
  return null;
}

/** minimatch 缺失时的等价兜底：只支持 layout 实际使用的 * / ** / ? 与 '!' 取反。 */
function globToRegExp(pattern){
  let out='';let index=0;
  while(index<pattern.length){
    const char=pattern[index];
    if(char==='*'){
      if(pattern[index+1]==='*'){
        index+=2;
        if(pattern[index]==='/')index+=1;
        out+='(?:.*/)?';
      }else{index+=1;out+='[^/]*';}
    }else if(char==='?'){index+=1;out+='[^/]';}
    else{out+=char.replace(/[.+^${}()|[\]\\]/g,'\\$&');index+=1;}
  }
  return new RegExp('^'+out+'$');
}

/**
 * 与 app-builder-lib/out/util/filter.js 的 minimatchAll 同语义：
 * 正向模式决定是否命中，负向模式（'!'）在已命中后重新排除。
 */
function createMatcher(patterns,{builtin=false}={}){
  const minimatch=builtin?null:loadMinimatch();
  // 注意：负向模式必须保留 '!' 交给 Minimatch 处理。去掉 '!' 再自己取反，
  // 会让“不相关路径”被算成未命中，从而把前面的正向命中抹掉。
  const compiled=patterns.map(pattern=>{
    if(minimatch)return {negate:false,body:pattern,glob:new minimatch.module.Minimatch(pattern,minimatchOptions),regExp:null};
    const negate=pattern.startsWith('!');
    return {negate,body:negate?pattern.slice(1):pattern,glob:null,regExp:globToRegExp(negate?pattern.slice(1):pattern)};
  });
  if(minimatch)for(let index=0;index<compiled.length;index+=1)compiled[index].negate=compiled[index].glob.negate;
  const test=(entry,relative,isDirectory)=>{
    if(entry.glob)return entry.glob.match(relative,isDirectory&&!entry.negate);
    // 兜底实现：目录用“前缀 + 任意后缀”近似 partial 匹配，负向模式整体取反。
    const hit=entry.regExp.test(relative)||Boolean(isDirectory&&!entry.negate&&entry.regExp.test(relative+'/x'));
    return entry.negate?!hit:hit;
  };
  return {
    engine:minimatch?minimatch.name:'builtin-fallback',
    engineSource:minimatch?minimatch.source:null,
    patterns:[...patterns],
    includes(relative,{isDirectory=false}={}){
      let matched=false;
      for(const entry of compiled){
        if(matched!==entry.negate)continue;
        matched=test(entry,relative,isDirectory);
      }
      return matched;
    },
  };
}

/** 供测试交叉验证：同一组模式分别用真实 minimatch 与内置兜底实现构造匹配器。 */
export function createPatternMatcher(patterns,options){return createMatcher(patterns,options);}

/** 运行范围：工程根 -> 发行包 game/ 的那条 extraResources 规则。 */
export function runtimeScope(){
  const fromRoot=path.resolve(desktopRoot,'..');
  const entry=(packaging.extraResources||[]).find(item=>path.resolve(desktopRoot,item.from)===fromRoot);
  if(!entry)throw new Error('electron-builder.cjs 没有覆盖工程根的 extraResources 规则，无法判定运行范围。');
  const patterns=[...entry.filter];
  const matcher=createMatcher(patterns);
  return {
    from:entry.from,to:entry.to,patterns,
    engine:matcher.engine,engineSource:matcher.engineSource,
    isPackaged(relativePath,options){return matcher.includes(relativePath.replace(/\\/g,'/'),options);},
    /** 目录是否会被遍历：任一正向模式 partial 命中即可。 */
    isTraversed(relativePath){return matcher.includes(relativePath.replace(/\\/g,'/'),{isDirectory:true});},
  };
}

/** 递归收集清单内所有以 '/' 开头的字符串引用（去重、去查询串）。 */
export function collectManifestReferences(manifest){
  const found=new Map();
  const walk=(value,pointer)=>{
    if(Array.isArray(value)){value.forEach((item,index)=>walk(item,`${pointer}[${index}]`));return;}
    if(value&&typeof value==='object'){
      for(const [key,item] of Object.entries(value))walk(item,pointer?`${pointer}.${key}`:key);
      return;
    }
    if(typeof value==='string'&&value.startsWith('/')){
      const clean=value.split('?')[0].split('#')[0];
      if(!found.has(clean))found.set(clean,pointer);
    }
  };
  walk(manifest,'');
  return [...found].map(([reference,pointer])=>({reference,pointer})).sort((a,b)=>a.reference.localeCompare(b.reference));
}

function fileOf(reference){return path.join(projectRoot,reference.replace(/^\/+/,''));}

/**
 * 执行闭包验收。
 * errors 是必须修复的问题；warnings 是需要知道但本轮不改的观察项。
 */
export function auditPackageClosure(){
  const scope=runtimeScope();
  const errors=[];
  const warnings=[];
  const manifests=[];
  const allReferences=new Map();

  for(const source of MANIFEST_SOURCES){
    const absolute=path.join(projectRoot,source.file);
    if(!fs.existsSync(absolute)){
      errors.push({code:'MANIFEST_MISSING',file:source.file,message:'正式清单文件不存在。'});
      continue;
    }
    const manifest=JSON.parse(fs.readFileSync(absolute,'utf8'));
    const references=collectManifestReferences(manifest).map(({reference,pointer})=>{
      const row={reference,pointer,role:source.role};
      if(!reference.startsWith('/assets/')){
        row.kind='non-asset';
        row.allowlisted=Object.hasOwn(NON_ASSET_REFERENCES,reference);
        if(!row.allowlisted)errors.push({code:'UNKNOWN_NON_ASSET_REFERENCE',file:source.file,reference,pointer,
          message:'清单引用了未登记的非 /assets/ 指针；请确认它是否应随包发布，并登记到 NON_ASSET_REFERENCES。'});
        return row;
      }
      row.kind='asset';
      const disk=fileOf(reference);
      row.exists=fs.existsSync(disk);
      const relative=path.relative(projectRoot,disk).replace(/\\/g,'/');
      row.packaged=scope.isPackaged(relative);
      if(!row.exists)errors.push({code:'ASSET_MISSING_ON_DISK',file:source.file,reference,pointer,
        message:`清单引用的素材在磁盘上不存在：${relative}`});
      else if(!row.packaged)errors.push({code:'ASSET_EXCLUDED_FROM_PACKAGE',file:source.file,reference,pointer,
        message:`素材存在但不在运行范围内，打包后会缺失：${relative}`});
      return row;
    });
    for(const row of references){
      if(row.kind!=='asset')continue;
      const previous=allReferences.get(row.reference);
      if(previous)previous.sources.push(source.file);
      else allReferences.set(row.reference,{...row,sources:[source.file]});
    }
    manifests.push({file:source.file,role:source.role,loadedBy:source.loadedBy,
      total:references.length,assets:references.filter(row=>row.kind==='asset').length,references});
  }

  // 配置自身的完整性：登记目录/根文件必须真实存在，否则 filter 写了也没用。
  const missingDirectories=layout.directories.filter(dir=>!fs.existsSync(path.join(projectRoot,dir)));
  for(const dir of missingDirectories)errors.push({code:'LAYOUT_DIRECTORY_MISSING',reference:dir,
    message:'project-layout.directories 登记的目录不存在。'});

  const unmatchedRootFiles=layout.rootFiles.filter(pattern=>{
    if(!/[*?]/.test(pattern))return !fs.existsSync(path.join(projectRoot,pattern));
    const regExp=globToRegExp(pattern);
    return !fs.readdirSync(projectRoot).some(name=>regExp.test(name));
  });
  for(const pattern of unmatchedRootFiles)errors.push({code:'LAYOUT_ROOT_FILE_UNMATCHED',reference:pattern,
    message:'project-layout.rootFiles 里的模式没有匹配任何真实文件。'});

  // 其余 extraResources 只做存在性提示：build/desktop-source 由 prepare-build 生成，缺失不算失败。
  const resources=(packaging.extraResources||[]).map(item=>{
    const absolute=path.resolve(desktopRoot,item.from);
    return {from:item.from,to:item.to,resolved:path.relative(projectRoot,absolute),exists:fs.existsSync(absolute),
      generated:item.from.includes('desktop-source')};
  });
  for(const resource of resources){
    if(!resource.exists&&!resource.generated)errors.push({code:'EXTRA_RESOURCE_SOURCE_MISSING',reference:resource.from,
      message:'extraResources 的来源目录不存在。'});
    if(!resource.exists&&resource.generated)warnings.push({code:'EXTRA_RESOURCE_GENERATED_LATER',reference:resource.from,
      message:'该来源由 desktop/prepare-build.cjs 在打包前生成，当前目录尚未生成。'});
  }

  const assets=[...allReferences.values()].sort((a,b)=>a.reference.localeCompare(b.reference));
  return {
    version:1,generatedAt:new Date().toISOString(),
    scope:{from:scope.from,to:scope.to,engine:scope.engine,engineSource:scope.engineSource,
      directories:layout.directories,rootFiles:layout.rootFiles,exclusions:layout.exclusions,patterns:scope.patterns},
    totals:{manifests:manifests.length,assetReferences:assets.length,
      runtimeAssetReferences:assets.filter(row=>row.sources.some(file=>MANIFEST_SOURCES.find(s=>s.file===file)?.role==='runtime')).length,
      packaged:assets.filter(row=>row.packaged).length,
      missingOnDisk:assets.filter(row=>!row.exists).length,
      excluded:assets.filter(row=>row.exists&&!row.packaged).length},
    manifests,assets,resources,errors,warnings,
  };
}

export function formatClosureReport(report){
  const lines=[];
  lines.push(`运行范围 ${report.scope.from} -> ${report.scope.to}（匹配器 ${report.scope.engine}）`);
  lines.push(`清单 ${report.totals.manifests} 份，资产引用 ${report.totals.assetReferences} 条；已入包 ${report.totals.packaged}，缺文件 ${report.totals.missingOnDisk}，被排除 ${report.totals.excluded}`);
  for(const manifest of report.manifests)lines.push(`  ${manifest.role.padEnd(10)} ${manifest.file} -> ${manifest.assets} 条`);
  for(const error of report.errors)lines.push(`  FAIL ${error.code} ${error.reference||''} ${error.message||''}`);
  for(const warning of report.warnings)lines.push(`  warn ${warning.code} ${warning.reference||''} ${warning.message||''}`);
  return lines.join('\n');
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const report=auditPackageClosure();
  const jsonIndex=process.argv.indexOf('--json');
  if(jsonIndex>0&&process.argv[jsonIndex+1]){
    const target=path.resolve(process.argv[jsonIndex+1]);
    fs.mkdirSync(path.dirname(target),{recursive:true});
    fs.writeFileSync(target,JSON.stringify(report,null,2));
    console.log(`已写入 ${path.relative(process.cwd(),target)}`);
  }
  console.log(formatClosureReport(report));
  if(report.errors.length)process.exitCode=1;
}
