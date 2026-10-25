// 集成清单汇总：把各包 manifest 拼成一张“谁要改哪个正式文件”的总表。
// A 阶段只做结构与冲突发现：同一 target 被多包认领、同一文件被多包打补丁，
// 都必须在合并前回到原作者按唯一合同拆分，17 不自行裁决。
import fs from 'node:fs';
import path from 'node:path';
import {PACKAGE_ID_PATTERN} from './config.mjs';
import {gitHead} from './hash.mjs';
import {parsePatch} from './patch.mjs';

function readManifest(packageDir) {
  const abs = path.join(packageDir, 'manifest.json');
  if (!fs.existsSync(abs)) return null;
  try {
    return JSON.parse(fs.readFileSync(abs, 'utf8'));
  } catch {
    return null;
  }
}

export function listPackages(deliveryRoot) {
  if (!fs.existsSync(deliveryRoot)) return [];
  return fs
    .readdirSync(deliveryRoot, {withFileTypes: true})
    .filter((item) => item.isDirectory() && PACKAGE_ID_PATTERN.test(item.name))
    .map((item) => path.join(deliveryRoot, item.name))
    .sort();
}

/** 拓扑排序：依赖先于被依赖方产出；循环依赖单独列出，不静默打断。 */
function orderPackages(packages) {
  const byId = new Map(packages.map((item) => [item.packageId, item]));
  const order = [];
  const visiting = new Set();
  const done = new Set();
  const cycles = [];

  const visit = (id, trail) => {
    if (done.has(id) || !byId.has(id)) return;
    if (visiting.has(id)) {
      cycles.push([...trail.slice(trail.indexOf(id)), id]);
      return;
    }
    visiting.add(id);
    const item = byId.get(id);
    for (const dep of item.dependsOn ?? []) visit(dep, [...trail, id]);
    visiting.delete(id);
    done.add(id);
    order.push(id);
  };
  for (const item of packages) visit(item.packageId, []);
  return {order, cycles};
}

/**
 * @param {{repoRoot:string, deliveryRoot:string, packageDirs?:string[], includeStatus?:string[]}} options
 */
export function buildIntegrationManifest(options) {
  const {repoRoot, deliveryRoot} = options;
  const packageDirs = options.packageDirs ?? listPackages(deliveryRoot);
  const packages = [];
  const targets = new Map();
  const patchTargets = new Map();
  const skipped = [];

  for (const dir of packageDirs) {
    const manifest = readManifest(dir);
    const packageId = path.basename(dir);
    if (!manifest) {
      skipped.push({packageId, reason: 'manifest.json 缺失或不可解析'});
      continue;
    }
    packages.push({
      packageId: manifest.packageId ?? packageId,
      dir,
      status: manifest.status ?? null,
      baseCommit: manifest.baseCommit ?? null,
      dependsOn: Array.isArray(manifest.dependsOn) ? manifest.dependsOn : [],
      contractRevision: manifest.contractRevision ?? null,
      contentRevision: manifest.contentRevision ?? null,
      fileCount: Array.isArray(manifest.files) ? manifest.files.length : 0,
      patchCount: Array.isArray(manifest.patches) ? manifest.patches.length : 0
    });

    for (const file of Array.isArray(manifest.files) ? manifest.files : []) {
      if (typeof file?.target !== 'string') continue;
      const key = file.target.replace(/\\/g, '/');
      if (!targets.has(key)) targets.set(key, []);
      targets.get(key).push({packageId: manifest.packageId ?? packageId, candidate: file.candidate ?? null, kind: file.kind ?? null});
    }

    for (const patch of Array.isArray(manifest.patches) ? manifest.patches : []) {
      const value = typeof patch === 'string' ? patch : patch?.path;
      if (typeof value !== 'string') continue;
      const abs = path.resolve(dir, value);
      if (!fs.existsSync(abs)) continue;
      for (const entry of parsePatch(fs.readFileSync(abs, 'utf8')).entries) {
        const rel = entry.newPath ?? entry.oldPath;
        if (!rel) continue;
        const key = rel.replace(/\\/g, '/');
        if (!patchTargets.has(key)) patchTargets.set(key, []);
        patchTargets.get(key).push({packageId: manifest.packageId ?? packageId, patch: value});
      }
    }
  }

  const conflicts = [];
  for (const [target, owners] of targets) {
    if (owners.length > 1) {
      conflicts.push({
        code: 'C_TARGET_MULTI_OWNER',
        target,
        owners: owners.map((owner) => owner.packageId),
        note: '同一正式路径被多包认领：按 04 §3 由原作者按唯合同拆分，17 不自行合并'
      });
    }
  }
  for (const [target, owners] of patchTargets) {
    const unique = [...new Set(owners.map((owner) => owner.packageId))];
    if (unique.length > 1) {
      conflicts.push({
        code: 'C_PATCH_MULTI_OWNER',
        target,
        owners: unique,
        note: '同一文件被多包打补丁：必须收敛为一份最小 patch'
      });
    }
  }

  const {order, cycles} = orderPackages(packages);
  for (const cycle of cycles) {
    conflicts.push({code: 'C_DEPENDENCY_CYCLE', owners: cycle, note: '依赖成环，需主模型裁决'});
  }

  return {
    schemaVersion: 1,
    kind: 'cv6-integration-manifest',
    generatedAt: new Date().toISOString(),
    repoRoot,
    baseHead: gitHead(repoRoot),
    packageCount: packages.length,
    packages,
    targets: [...targets.entries()]
      .map(([target, owners]) => ({target, owners: owners.map((owner) => owner.packageId)}))
      .sort((a, b) => a.target.localeCompare(b.target)),
    patchTargets: [...patchTargets.entries()]
      .map(([target, owners]) => ({target, owners: [...new Set(owners.map((owner) => owner.packageId))]}))
      .sort((a, b) => a.target.localeCompare(b.target)),
    mergeOrder: order,
    conflicts,
    skipped,
    notes: [
      '本文件只描述“谁想改哪里”，不代表已合并。',
      'conflicts 非空时不得进入正式合并，先出返工单给原作者。'
    ]
  };
}
