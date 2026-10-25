// manifest.json 校验：按 04 §7 + manifest模板.json。
// 只做结构与一致性判断，不判断“这个候选好不好”——那是作者自测与 16 审计的事。
import fs from 'node:fs';
import path from 'node:path';
import {
  PACKAGE_ID_PATTERN,
  PACKAGE_STATUS,
  EVIDENCE_TYPES,
  SCENARIO_ID_PATTERN,
  LIMITS
} from './config.mjs';
import {normalizeRel, classifyZone, isInside, PathViolation} from './fs-safe.mjs';
import {SHA256_PATTERN, sha256FileSync} from './hash.mjs';

const ALLOWED_TOP_KEYS = new Set([
  'schemaVersion', 'packageId', 'status', 'baseCommit', 'contractRevision',
  'contentSchemaVersion', 'contentRevision', 'engineProfiles', 'mapRevisions',
  'dependsOn', 'inputs', 'files', 'patches', 'runCommands', 'evidence',
  'authorityEffects', 'newDependencies', 'assetSources', 'limitations',
  'blockingDecisions', 'rollbackNotes', 'notes'
]);

function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function isStringArray(value) {
  return Array.isArray(value) && value.every((item) => typeof item === 'string');
}

/**
 * 路径解析：先按“包内相对”，找不到再容忍“仓库内相对”写法（真实包常这么写）。
 * 返回 {abs, mode} 或 null。mode='repo' 时调用方要给 warning，避免养成坏习惯但也不判死。
 */
function resolveEntryPath(packageDir, repoRoot, relPath) {
  const cleaned = String(relPath).replace(/\/+$/, '');
  const inPackage = path.resolve(packageDir, cleaned);
  if (isInside(inPackage, packageDir) && fs.existsSync(inPackage)) return {abs: inPackage, mode: 'package'};
  if (repoRoot) {
    const inRepo = path.resolve(repoRoot, cleaned);
    if (isInside(inRepo, repoRoot) && fs.existsSync(inRepo)) return {abs: inRepo, mode: 'repo'};
  }
  return null;
}

export function loadManifest(packageDir) {
  const abs = path.join(packageDir, 'manifest.json');
  if (!fs.existsSync(abs)) return {error: 'E_MANIFEST_MISSING', path: abs};
  let text;
  try {
    text = fs.readFileSync(abs, 'utf8');
  } catch (error) {
    return {error: 'E_MANIFEST_UNREADABLE', path: abs, message: error.message};
  }
  let data;
  try {
    data = JSON.parse(text);
  } catch (error) {
    return {error: 'E_MANIFEST_JSON', path: abs, message: error.message};
  }
  return {manifest: data, path: abs, bytes: Buffer.byteLength(text)};
}

/**
 * @param {import('./report.mjs').Report} report
 * @param {string} packageDir
 * @param {{expectedId?: string, allowReadonly?: string[]}} options
 */
export function checkManifest(report, packageDir, options = {}) {
  const loaded = loadManifest(packageDir);
  if (loaded.error) {
    report.error(loaded.error, loaded.error === 'E_MANIFEST_MISSING'
      ? '缺少 manifest.json（04 §7 必交）'
      : `manifest.json 无法使用：${loaded.message ?? ''}`, {file: 'manifest.json'});
    report.markCheck('manifest', 'fail');
    return null;
  }

  const manifest = loaded.manifest;
  const before = report.errors.length;

  if (!isPlainObject(manifest)) {
    report.error('E_MANIFEST_SHAPE', 'manifest 顶层必须是对象', {file: 'manifest.json'});
    report.markCheck('manifest', 'fail');
    return null;
  }

  for (const key of Object.keys(manifest)) {
    if (!ALLOWED_TOP_KEYS.has(key)) report.warn('W_MANIFEST_UNKNOWN_KEY', `未知顶层字段 ${key}（模板外字段不参与校验）`, {file: 'manifest.json'});
  }

  if (manifest.schemaVersion !== 1) {
    report.error('E_MANIFEST_SCHEMA_VERSION', `schemaVersion 必须是 1，实际 ${JSON.stringify(manifest.schemaVersion)}`, {file: 'manifest.json'});
  }

  const expectedId = options.expectedId ?? path.basename(packageDir);
  if (!PACKAGE_ID_PATTERN.test(String(manifest.packageId ?? ''))) {
    report.error('E_MANIFEST_PACKAGE_ID', `packageId 不符合 CV6-NN：${JSON.stringify(manifest.packageId)}`, {file: 'manifest.json'});
  } else if (expectedId && manifest.packageId !== expectedId) {
    report.error('E_MANIFEST_PACKAGE_MISMATCH', `packageId=${manifest.packageId} 与所在目录 ${expectedId} 不一致`, {file: 'manifest.json'});
  }

  if (!PACKAGE_STATUS.includes(manifest.status)) {
    report.error('E_MANIFEST_STATUS', `status 必须是 ${PACKAGE_STATUS.join('/')}，实际 ${JSON.stringify(manifest.status)}`, {file: 'manifest.json'});
  }

  if (manifest.baseCommit !== null && manifest.baseCommit !== undefined) {
    if (!/^[0-9a-f]{7,40}$/.test(String(manifest.baseCommit))) {
      report.error('E_MANIFEST_BASE_COMMIT', `baseCommit 需为 7-40 位小写十六进制或 null：${JSON.stringify(manifest.baseCommit)}`, {file: 'manifest.json'});
    }
  } else if (report.facts.actualHead) {
    report.warn('W_MANIFEST_NO_BASE', 'baseCommit 为 null，但仓库有 HEAD——收包时无法核对基线', {file: 'manifest.json'});
  }

  // 版本类字段允许“字符串或扁平对象”（真实包常写 {path,version}），只做提示不判死；
  // 依赖/命令/限制这类必须可执行的字段仍要求纯字符串。
  for (const key of ['engineProfiles', 'mapRevisions', 'assetSources']) {
    const value = manifest[key] ?? [];
    if (!Array.isArray(value)) {
      report.error('E_MANIFEST_TYPE', `${key} 必须是数组`, {file: 'manifest.json'});
    } else if (!value.every((item) => typeof item === 'string' || isPlainObject(item))) {
      report.error('E_MANIFEST_TYPE', `${key} 的元素必须是字符串或对象`, {file: 'manifest.json'});
    } else if (value.some((item) => typeof item !== 'string')) {
      report.warn('W_MANIFEST_OBJECT_ENTRY', `${key} 含对象条目（模板要求字符串数组），收包时按原文保留`, {file: 'manifest.json'});
    }
  }
  for (const key of ['dependsOn', 'runCommands', 'newDependencies', 'limitations']) {
    if (!isStringArray(manifest[key] ?? [])) {
      report.error('E_MANIFEST_TYPE', `${key} 必须是字符串数组`, {file: 'manifest.json'});
    }
  }
  for (const key of ['authorityEffects', 'blockingDecisions']) {
    if (manifest[key] !== undefined && !Array.isArray(manifest[key])) {
      report.error('E_MANIFEST_TYPE', `${key} 必须是数组`, {file: 'manifest.json'});
    }
  }

  // ---- files[]：候选必须真在包内，target 必须是安全的仓库相对路径 ----
  const files = Array.isArray(manifest.files) ? manifest.files : [];
  if (!Array.isArray(manifest.files)) {
    report.error('E_MANIFEST_TYPE', 'files 必须是数组（可空）', {file: 'manifest.json'});
  }
  let fileErrors = 0;
  let hashChecked = 0;
  for (const [index, file] of files.entries()) {
    const at = `files[${index}]`;
    if (!isPlainObject(file)) {
      report.error('E_MANIFEST_ENTRY', `${at} 必须是对象`, {file: 'manifest.json'});
      fileErrors += 1;
      continue;
    }
    if (typeof file.candidate !== 'string' || !file.candidate.trim()) {
      report.error('E_MANIFEST_ENTRY', `${at}.candidate 缺失`, {file: 'manifest.json'});
      fileErrors += 1;
    } else {
      let rel;
      try {
        // 尾斜杠常被误用来表示目录：先去掉再判断，目录会给出更明确的 E_MANIFEST_CANDIDATE_IS_DIR
        rel = normalizeRel(file.candidate.trim().replace(/\/+$/, ''));
      } catch (error) {
        report.error('E_MANIFEST_CANDIDATE_PATH', `${at}.candidate 路径非法：${error.message}`, {file: 'manifest.json'});
        fileErrors += 1;
        rel = null;
      }
      if (rel) {
        const abs = path.resolve(packageDir, rel);
        const resolved = resolveEntryPath(packageDir, report.repoRoot, rel);
        if (!isInside(abs, packageDir)) {
          report.error('E_MANIFEST_CANDIDATE_ESCAPE', `${at}.candidate 逃出包目录：${file.candidate}`, {file: 'manifest.json'});
          fileErrors += 1;
        } else if (!resolved) {
          report.error('E_MANIFEST_CANDIDATE_MISSING', `${at}.candidate 指向的文件不存在（包内/仓库内均未找到）：${file.candidate}`, {file: 'manifest.json'});
          fileErrors += 1;
        } else if (fs.statSync(resolved.abs).isDirectory()) {
          report.error('E_MANIFEST_CANDIDATE_IS_DIR', `${at}.candidate 是目录，files[] 必须逐文件列出：${file.candidate}`, {file: 'manifest.json'});
          fileErrors += 1;
        } else if (resolved.mode === 'repo') {
          report.warn('W_PATH_REPO_RELATIVE', `${at}.candidate 用了仓库相对路径（模板要求包内相对），可收但请作者统一：${file.candidate}`, {file: 'manifest.json'});
        }
        if (resolved && !fs.statSync(resolved.abs).isDirectory() && file.sha256) {
          hashChecked += 1;
          if (!SHA256_PATTERN.test(file.sha256)) {
            report.error('E_MANIFEST_HASH_FORMAT', `${at}.sha256 不是 64 位小写十六进制`, {file: 'manifest.json'});
            fileErrors += 1;
          } else {
            const actual = sha256FileSync(resolved.abs);
            if (actual !== file.sha256) {
              report.error('E_MANIFEST_HASH_MISMATCH', `${at}.sha256 与文件不符（候选已变但 manifest 未更新）：${file.candidate}`, {
                file: 'manifest.json',
                expected: file.sha256,
                actual
              });
              fileErrors += 1;
            }
          }
        }
      }
    }
    if (typeof file.target !== 'string' || !file.target.trim()) {
      report.error('E_MANIFEST_ENTRY', `${at}.target 缺失（候选→正式路径必须显式给出）`, {file: 'manifest.json'});
      fileErrors += 1;
    } else {
      try {
        const target = normalizeRel(file.target);
        const zone = classifyZone(target);
        const selfTarget = isInside(path.resolve(report.repoRoot, target), packageDir);
        if (zone?.kind === 'hard' && selfTarget) {
          // 指向包内自身的 target 只是登记“文件现在在哪”，不构成对外写入，记 note 即可。
          report.note('N_TARGET_SELF', `${at}.target 指向包内自身路径（无副作用，仅登记）：${file.target}`, {file: 'manifest.json'});
        } else if (zone?.kind === 'hard') {
          report.error('E_TARGET_FORBIDDEN', `${at}.target 落在禁写区 ${zone.zone}：${file.target}`, {file: 'manifest.json'});
          fileErrors += 1;
        } else if (zone?.kind === 'readonly') {
          const allowed = (options.allowReadonly ?? []).includes(zone.zone);
          if (allowed) {
            report.warn('W_TARGET_READONLY_OVERRIDE', `${at}.target 落在只读区 ${zone.zone}（已被 --allow-readonly 显式放行，需主模型裁决）`, {file: 'manifest.json'});
          } else {
            report.error('E_TARGET_READONLY', `${at}.target 落在只读区 ${zone.zone}：${file.target}（04 §2）`, {file: 'manifest.json'});
            fileErrors += 1;
          }
        } else if (zone?.kind === 'protected') {
          report.error('E_TARGET_PROTECTED', `${at}.target 命中玩家档/原图保护区：${file.target}`, {file: 'manifest.json'});
          fileErrors += 1;
        }
      } catch (error) {
        report.error('E_MANIFEST_TARGET_PATH', `${at}.target 路径非法：${error.message}`, {file: 'manifest.json'});
        fileErrors += 1;
      }
    }
    if (file.kind && !['source', 'test', 'doc', 'data', 'fixture', 'patch', 'asset'].includes(file.kind)) {
      report.warn('W_MANIFEST_KIND', `${at}.kind 未登记类型：${file.kind}`, {file: 'manifest.json'});
    }
    // 路径里写中文说明（例如 "x.mjs（正式入口由 17 决定）"）会变成真实文件名，
    // 落地后扩展名不再是 .mjs，node 直接 ERR_UNKNOWN_FILE_EXTENSION。
    for (const [field, value] of [['candidate', file.candidate], ['target', file.target]]) {
      if (typeof value === 'string' && /[（）]/.test(value)) {
        report.warn(
          'W_PATH_HAS_NOTE',
          `${at}.${field} 路径里夹了中文说明，落地后就是文件名的一部分：${value}。说明请写进 notes/limitations，路径只留裸路径`,
          {file: 'manifest.json'}
        );
      }
    }
  }

  // ---- inputs[]：必须带哈希，否则“可复现”无从谈起 ----
  const inputs = Array.isArray(manifest.inputs) ? manifest.inputs : [];
  let inputHashed = 0;
  for (const [index, input] of inputs.entries()) {
    const at = `inputs[${index}]`;
    if (!isPlainObject(input) || typeof input.path !== 'string') {
      report.error('E_MANIFEST_ENTRY', `${at} 必须是 {path, sha256}`, {file: 'manifest.json'});
      continue;
    }
    try {
      normalizeRel(input.path);
    } catch (error) {
      report.error('E_MANIFEST_INPUT_PATH', `${at}.path 非法：${error.message}`, {file: 'manifest.json'});
      continue;
    }
    if (!input.sha256) {
      report.warn('W_INPUT_NO_HASH', `${at}.sha256 为空，无法核对基线输入：${input.path}`, {file: 'manifest.json'});
      continue;
    }
    inputHashed += 1;
    if (!SHA256_PATTERN.test(input.sha256)) {
      report.error('E_MANIFEST_HASH_FORMAT', `${at}.sha256 格式错误`, {file: 'manifest.json'});
      continue;
    }
    const repoRel = path.resolve(report.repoRoot ?? packageDir, input.path);
    if (fs.existsSync(repoRel) && fs.statSync(repoRel).isFile()) {
      const actual = sha256FileSync(repoRel);
      if (actual !== input.sha256) {
        report.error('E_INPUT_HASH_MISMATCH', `${at} 输入哈希与仓库当前文件不符：${input.path}`, {
          file: 'manifest.json',
          expected: input.sha256,
          actual
        });
      }
    } else {
      report.warn('W_INPUT_UNRESOLVED', `${at}.path 在仓库中不存在，跳过哈希核对：${input.path}`, {file: 'manifest.json'});
    }
  }

  // ---- patches[] ----
  const patches = Array.isArray(manifest.patches) ? manifest.patches : [];
  for (const [index, patch] of patches.entries()) {
    const at = `patches[${index}]`;
    const value = typeof patch === 'string' ? patch : patch?.path;
    if (typeof value !== 'string') {
      report.error('E_MANIFEST_ENTRY', `${at} 必须是路径字符串或 {path,...}`, {file: 'manifest.json'});
      continue;
    }
    try {
      normalizeRel(value);
    } catch (error) {
      report.error('E_MANIFEST_PATCH_PATH', `${at} 路径非法：${error.message}`, {file: 'manifest.json'});
      continue;
    }
    if (!fs.existsSync(path.resolve(packageDir, value))) {
      report.error('E_MANIFEST_PATCH_MISSING', `${at} 指向的补丁不存在：${value}`, {file: 'manifest.json'});
    }
  }

  // ---- evidence[]：未测必须 unverified/not-run ----
  const evidence = Array.isArray(manifest.evidence) ? manifest.evidence : [];
  for (const [index, item] of evidence.entries()) {
    const at = `evidence[${index}]`;
    if (!isPlainObject(item)) {
      report.error('E_MANIFEST_ENTRY', `${at} 必须是对象`, {file: 'manifest.json'});
      continue;
    }
    const typeText = String(item.type ?? '');
    const typeParts = typeText.split(/[+/、,，]/).map((part) => part.trim()).filter(Boolean);
    if (!typeParts.length || typeParts.some((part) => !EVIDENCE_TYPES.includes(part))) {
      report.error('E_EVIDENCE_TYPE', `${at}.type 不在允许枚举内：${JSON.stringify(item.type)}`, {file: 'manifest.json'});
    } else if (typeParts.length > 1) {
      report.warn('W_EVIDENCE_COMBINED', `${at}.type 合并了多种证据（${typeText}），收包时需按类型分别核对`, {file: 'manifest.json'});
    }
    if (item.scenarioId && !SCENARIO_ID_PATTERN.test(item.scenarioId)) {
      report.warn('W_EVIDENCE_SCENARIO', `${at}.scenarioId 不符合 05 场景号格式：${item.scenarioId}`, {file: 'manifest.json'});
    }
    if (typeText === 'unverified' && item.result !== 'not-run') {
      report.error('E_EVIDENCE_HONESTY', `${at} 标 unverified 时 result 必须是 not-run，实际 ${JSON.stringify(item.result)}`, {file: 'manifest.json'});
    }
    if (typeText !== 'unverified' && item.result === 'not-run') {
      report.warn('W_EVIDENCE_CONTRADICTION', `${at} 类型是 ${item.type} 却标 not-run，应改为 unverified`, {file: 'manifest.json'});
    }
    if (item.path) {
      try {
        normalizeRel(item.path);
      } catch (error) {
        report.error('E_EVIDENCE_PATH', `${at}.path 非法：${error.message}`, {file: 'manifest.json'});
        continue;
      }
      const abs = path.resolve(packageDir, item.path);
      if (!isInside(abs, packageDir)) {
        report.error('E_EVIDENCE_PATH', `${at}.path 逃出包目录：${item.path}`, {file: 'manifest.json'});
        continue;
      }
      const resolved = resolveEntryPath(packageDir, report.repoRoot, item.path);
      if (!resolved) {
        report.error('E_EVIDENCE_MISSING', `${at}.path 指向的证据不存在（包内/仓库内均未找到）：${item.path}`, {file: 'manifest.json'});
      } else if (resolved.mode === 'repo') {
        report.warn('W_PATH_REPO_RELATIVE', `${at}.path 用了仓库相对路径（模板要求包内相对），可收但请作者统一：${item.path}`, {file: 'manifest.json'});
      }
    }
  }

  report.facts.manifestFiles = files.length;
  report.facts.manifestHashesChecked = hashChecked;
  report.facts.manifestInputs = inputs.length;
  report.facts.manifestInputsHashed = inputHashed;
  report.facts.manifestEvidence = evidence.length;
  report.facts.manifestStatus = manifest.status;
  report.facts.manifestBaseCommit = manifest.baseCommit ?? null;
  report.markCheck('manifest', report.errors.length > before ? 'fail' : 'pass', {entries: files.length, fileErrors});
  return manifest;
}
