import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {reserveCandidateDirectory} from '../lib/candidate-output.mjs';
import {fileInventory,inventoryHash,sha256} from '../lib/file-inventory.mjs';
import {NATIVE_PROFILES,NATIVE_PROTOCOL} from '../../integration/modes/profiles.mjs';

// No candidate JavaScript is imported, evaluated or served. Root Home is upstream user data.
const skip=relative=>/^(Home|\.git|\.cache)(\/|$)/i.test(relative);
export function diffFiles(before,after){
  const old=new Map(before.map(f=>[f.path,f])),fresh=new Map(after.map(f=>[f.path,f]));
  return {added:after.filter(f=>!old.has(f.path)),removed:before.filter(f=>!fresh.has(f.path)),changed:after.filter(f=>old.has(f.path)&&old.get(f.path).sha256!==f.sha256).map(f=>({path:f.path,before:old.get(f.path).sha256,after:f.sha256}))};
}
export function stageEngine({root,source,output,baselineDirectory,baselineManifest,cards,printPolicy,profiles=NATIVE_PROFILES}){
  source=fs.realpathSync(source);baselineDirectory=fs.realpathSync(baselineDirectory);
  const out=reserveCandidateDirectory({root,output,sources:[source,baselineDirectory]});
  const installed=fileInventory(baselineDirectory,{skip}),candidate=fileInventory(source,{skip});
  const expected=baselineManifest.manifest.filter(f=>!skip(f.file)).map(f=>({path:f.file,bytes:f.bytes,sha256:f.sha256}));
  const installedDrift=diffFiles(expected,installed),diff=diffFiles(installed,candidate),byPath=new Map(candidate.map(f=>[f.path,f]));
  const stage=path.join(out,'engine');fs.mkdirSync(stage);
  for(const file of candidate){
    const destination=path.join(stage,file.path);fs.mkdirSync(path.dirname(destination),{recursive:true});
    fs.copyFileSync(path.join(source,file.path),destination,fs.constants.COPYFILE_EXCL);
    assert.equal(sha256(fs.readFileSync(destination)),file.sha256,'复制过程中源发生变化：'+file.path);
  }
  const readVersion=dir=>{try{return JSON.parse(fs.readFileSync(path.join(dir,'package.json'))).version||null;}catch{return null;}};
  const version=readVersion(stage),actualVersion=readVersion(baselineDirectory);
  const hasDrift=Object.values(installedDrift).some(list=>list.length);
  const capabilities=Object.entries(profiles).map(([formatId,profile])=>{
    const mismatches=Object.entries(profile.hashes).filter(([file,hash])=>byPath.get(file)?.sha256!==hash).map(([file,expected])=>({file,expected,actual:byPath.get(file)?.sha256||null}));
    return {formatId,profileId:profile.id,profileHash:sha256(JSON.stringify(profile)),profileEngineVersion:profile.engineVersion,versionMatches:version===profile.engineVersion,mismatches,staticQualification:version===profile.engineVersion&&!mismatches.length&&!hasDrift?'pinned-files-match':'review-required',runtimeHandshake:'not-run',controlledEvidence:'not-run',naturalEvidence:'not-run',approvedForInstall:false};
  });
  capabilities.push({formatId:'kof',profileId:null,staticQualification:'adapter-review-required',adapter:'integration/host-battle.mjs (legacy KOF bridge)',runtimeHandshake:'not-run',controlledEvidence:'not-run',naturalEvidence:'not-run',approvedForInstall:false});
  const changes=[...diff.added,...diff.removed,...diff.changed].map(f=>f.path);
  const changedPackFiles=changes.filter(f=>f.startsWith('character/'));
  const affectedCards=cards.filter(card=>changedPackFiles.some(file=>file===`character/${card.pack}.js`||file.startsWith(`character/${card.pack}/`)));
  const report={schema:1,createdAt:new Date().toISOString(),node:process.version,source,baseline:{directory:baselineDirectory,declaredVersion:baselineManifest.version,packageVersion:actualVersion,inventoryHash:inventoryHash(installed),drift:installedDrift},candidate:{directory:stage,version,files:candidate.length,bytes:candidate.reduce((sum,f)=>sum+f.bytes,0),inventoryHash:inventoryHash(candidate)},excludedRoots:['Home','.git','.cache'],diff,protocol:NATIVE_PROTOCOL,capabilities,
    impacts:{
      cardKeys:{existingPrefix:'noname-1.11.6:',migrationApplied:false,note:'版本更新不能原地改旧 cardKey；新旧目录与版本映射需要单独迁移设计。',potentiallyAffected:affectedCards.map(c=>({cardKey:'noname-1.11.6:'+c.id,pack:c.pack}))},
      skills:{changedPackFiles,keys:[...new Set(affectedCards.flatMap(c=>(c.skills||[]).map(s=>s.key||`${c.pack}:${s.id}`)))],semanticAnalysis:'not-performed',note:'按包保守标记；静态文件变化不能推断技能收益或自然对局兼容。共享引擎变化还可能影响所有技能。'},
      prints:{policyVersion:printPolicy.version,policyHash:sha256(JSON.stringify(printPolicy)),mutated:false,note:'已印刷实物、已封装包盒、已付款订单内容及发行比例不重算。'},
      saves:{opened:false,migrated:false,fieldsToReview:['inventory.cardKey','inventory.skillVersion','products/box contents','orders paid snapshots','match/series round state','archives/day-start snapshots'],note:'不读取玩家存档；升级前需使用复制的旧档做回退与结果接线验证。'},
      resources:{changedFiles:changes.filter(f=>/^(image|audio|theme|layout)\//.test(f)),note:'仅文件差异，动态拼接资源和可选音频仍需运行时检查。'}
    },
    requiredReview:['核对发行来源、版本与完整性及许可','审查差异及所有 profile 依赖，不自动改白名单','隔离原生握手与受控回归','自然完成 KOF、斗地主与 2v2 各局及整场回执','复制旧档的实物/发行/按天回退验证','人工决定发布与可回退版本'],installed:false};
  fs.writeFileSync(path.join(out,'candidate-manifest.json'),JSON.stringify({version,files:candidate},null,2)+'\n');
  fs.writeFileSync(path.join(out,'report.json'),JSON.stringify(report,null,2)+'\n');
  return {out,report};
}
