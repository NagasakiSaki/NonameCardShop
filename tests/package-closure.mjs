// tests/package-closure.mjs — 发行包资源闭包验收。
//
// 覆盖三类此前都会漏掉的问题：
//   1. 清单引用的素材在磁盘上不存在（源码期也会 404）；
//   2. 素材存在但真实 electron-builder 运行范围没带上（源码可玩、打包缺图）；
//   3. 运行范围配置本身写错（登记了不存在的目录/根文件）。
//
// 判定不依赖手写目录：先用 config/project-layout.cjs + desktop/electron-builder.cjs 求运行范围，
// 再用 app-builder-lib 自己的 FileMatcher.createFilter 复核，两者必须一致。
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {auditPackageClosure,createPatternMatcher,projectRoot,runtimeScope,MANIFEST_SOURCES} from '../tools/audit/package-closure.mjs';

const require=createRequire(import.meta.url);
const desktopRoot=path.join(projectRoot,'desktop');
const report=auditPackageClosure();

// ---- 1. 闭包本身 ----
assert.deepEqual(report.errors,[],
  '资源闭包失败：\n'+report.errors.map(error=>`${error.code} ${error.reference||''} ${error.message||''}`).join('\n'));
assert.equal(report.totals.assetReferences,report.totals.packaged,'每条资产引用都应被运行范围纳入');
assert.equal(report.totals.missingOnDisk,0);
assert.equal(report.totals.excluded,0);
assert.ok(report.totals.assetReferences>=150,`资产引用数量异常偏低：${report.totals.assetReferences}`);

// ---- 2. 运行范围覆盖三个正式素材目录（不是只覆盖手写的那两个） ----
const layout=require(path.join(projectRoot,'config/project-layout.cjs'));
for(const directory of ['assets/frontend','assets/frontend-next','assets/frontend-bright-anime']){
  assert.ok(layout.directories.includes(directory),`project-layout.directories 缺少正式素材目录 ${directory}`);
}
for(const directory of ['tools','tests','docs','dev','deliverables','experiments']){
  assert.ok(!layout.directories.includes(directory),`${directory} 不应进入发行包`);
}

// ---- 3. C-01 回归钉子：五张明亮场景贴图必须真实入包 ----
const SCENE_ASSETS=[
  'assets/frontend-bright-anime/tiles/tileset.png',
  'assets/frontend-bright-anime/props/props.png',
  'assets/frontend-bright-anime/fx/glow.png',
  'assets/frontend-bright-anime/fx/shadow.png',
  'assets/frontend-bright-anime/fx/sun-shaft.png',
];
const scope=runtimeScope();
for(const asset of SCENE_ASSETS){
  assert.ok(fs.existsSync(path.join(projectRoot,asset)),`场景素材缺失：${asset}`);
  assert.equal(scope.isPackaged(asset),true,`场景素材未进入运行范围：${asset}`);
}
assert.ok(scope.isTraversed('assets/frontend-bright-anime'),'打包遍历不会进入 assets/frontend-bright-anime');

// ---- 4. 真实 electron-builder 配置加载 + 合并 + 官方 filter 复核 ----
let builderEngine='unavailable';
try{
  const {getConfig}=require(path.join(desktopRoot,'node_modules/app-builder-lib/out/util/config/config.js'));
  const {FileMatcher}=require(path.join(desktopRoot,'node_modules/app-builder-lib/out/fileMatcher.js'));
  const config=await getConfig(desktopRoot);
  assert.ok(Array.isArray(config.extraResources)&&config.extraResources.length>=1,'electron-builder 配置没有合并出 extraResources');
  assert.equal(config.extraResources[0].from,'..','工程根资源规则必须仍以 .. 为来源');
  assert.equal(config.build?.extends,undefined,'extends 应已被合并展开');
  const matcher=new FileMatcher(projectRoot,'game',value=>value,config.extraResources[0].filter);
  const filter=matcher.createFilter();
  const stat={isDirectory:()=>false};
  for(const asset of report.assets){
    const absolute=path.join(projectRoot,asset.reference.replace(/^\/+/,''));
    assert.equal(filter(absolute,stat),true,`electron-builder 官方 filter 判定未入包：${asset.reference}`);
  }
  for(const asset of SCENE_ASSETS){
    assert.equal(filter(path.join(projectRoot,asset),stat),true,`electron-builder 官方 filter 判定未入包：${asset}`);
  }
  builderEngine=`app-builder-lib@${require(path.join(desktopRoot,'node_modules/app-builder-lib/package.json')).version}`;
}catch(error){
  if(error?.code!=='MODULE_NOT_FOUND')throw error;
  // 未安装桌面依赖时只跳过官方复核；闭包本身仍必须通过。
  console.warn('  warn 未安装 desktop 依赖，跳过 electron-builder 官方 filter 复核（npm run setup 后可完整复核）');
}

// ---- 5. 内置兜底匹配器与 minimatch 判定一致（避免无桌面依赖的环境放宽标准） ----
if(scope.engine!=='builtin-fallback'){
  const builtin=createPatternMatcher(scope.patterns,{builtin:true});
  for(const asset of report.assets){
    assert.equal(builtin.includes(asset.reference.replace(/^\/+/,'')),
      scope.isPackaged(asset.reference.replace(/^\/+/,'')),
      `兜底匹配器与 ${scope.engine} 判定不一致：${asset.reference}`);
  }
}

// ---- 6. 清单登记表自身没有撒谎 ----
for(const source of MANIFEST_SOURCES){
  assert.ok(fs.existsSync(path.join(projectRoot,source.file)),`登记清单不存在：${source.file}`);
  assert.ok(['runtime','art-source'].includes(source.role));
}

const runtimeManifests=report.manifests.filter(manifest=>manifest.role==='runtime');
assert.equal(runtimeManifests.length,3,'运行时清单应为 3 份（世界/包装/明亮包装）');
console.log(`PASS 资源闭包：${report.manifests.length} 份清单 / ${report.totals.assetReferences} 条资产引用全部在运行范围内`
  +`（匹配器 ${scope.engine}，官方复核 ${builderEngine}，明亮场景 5 张已入包）`);
