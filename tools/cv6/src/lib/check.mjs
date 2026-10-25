// 收包总检查：一个包的完整机械体检。组合 manifest / DELIVERY / 链接 / 补丁 / 依赖 / 目录卫生。
import fs from 'node:fs';
import path from 'node:path';
import {Report} from './report.mjs';
import {checkManifest} from './manifest.mjs';
import {checkDeliveryDoc} from './delivery.mjs';
import {checkLinks} from './links.mjs';
import {checkPatches} from './patch.mjs';
import {checkDependencies} from './deps.mjs';
import {gitHead, gitDirty} from './hash.mjs';
import {normalizeRel, toPosix, isInside, isDirectory} from './fs-safe.mjs';
import {deliveryRoot, LIMITS} from './config.mjs';

// 生成物目录不参与收包体检：tmp/ 是本地夹具，sandbox/ 是重建产物。
const GENERATED_DIRS = new Set(['tmp', 'sandbox', 'node_modules', '.git']);

function walkFiles(root, {maxDepth = 12} = {}) {
  const out = [];
  const walk = (dir, depth) => {
    if (depth > maxDepth) return;
    let items;
    try {
      items = fs.readdirSync(dir, {withFileTypes: true});
    } catch {
      return;
    }
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (item.isSymbolicLink()) {
        out.push({abs, rel: toPosix(path.relative(root, abs)), link: true});
        continue;
      }
      if (item.isDirectory()) {
        if (GENERATED_DIRS.has(item.name)) {
          out.push({abs, rel: toPosix(path.relative(root, abs)), dir: true, skipped: item.name !== 'tmp' && item.name !== 'sandbox'});
          continue;
        }
        walk(abs, depth + 1);
        continue;
      }
      if (item.isFile()) out.push({abs, rel: toPosix(path.relative(root, abs))});
    }
  };
  walk(root, 0);
  return out;
}

function checkHygiene(report, packageDir, files) {
  const before = report.errors.length;
  let links = 0;
  let big = 0;
  for (const file of files) {
    if (file.link) {
      links += 1;
      let target = null;
      try {
        target = fs.realpathSync(file.abs);
      } catch {
        report.error('E_LINK_DANGLING', `包内链接无法解析：${file.rel}`, {file: file.rel});
        continue;
      }
      if (!isInside(target, report.repoRoot)) {
        report.error('E_LINK_OUTSIDE_REPO', `包内链接指向仓库外：${file.rel} -> ${target}`, {file: file.rel});
      } else {
        report.note('N_LINK_IN_PACKAGE', `包内链接（只读复用，本身不可写）：${file.rel} -> ${toPosix(path.relative(report.repoRoot, target))}`, {file: file.rel});
      }
      continue;
    }
    if (file.dir) {
      if (file.skipped) report.warn('W_PACKAGE_DIRTY', `包内出现 ${path.basename(file.rel)}，交付目录不应携带依赖/仓库元数据：${file.rel}`, {file: file.rel});
      continue;
    }
    const stat = fs.statSync(file.abs);
    if (stat.size > 8 * 1024 * 1024) {
      big += 1;
      report.warn('W_PACKAGE_BIG_FILE', `包内文件 ${(stat.size / 1024 / 1024).toFixed(1)}MB，大资源应只读复用而非复制：${file.rel}`, {file: file.rel});
    }
    if (file.rel.endsWith('manifest.json')) {
      try {
        JSON.parse(fs.readFileSync(file.abs, 'utf8'));
      } catch (error) {
        report.error('E_PACKAGE_JSON', `包内 JSON 无法解析：${file.rel}（${error.message}）`, {file: file.rel});
      }
    }
  }
  report.facts.packageLinks = links;
  report.facts.packageBigFiles = big;
  report.facts.packageFiles = files.length;
  report.markCheck('hygiene', report.errors.length > before ? 'fail' : 'pass', {files: files.length, links});
}

/**
 * 重复运行器检查（04 §3）：不允许各包自带第二个"跑全部测试"的入口。
 * 判据：目标文件名像 runner，或内容里同时出现 groups 表和子进程启动。
 */
function checkDuplicateRunners(report, packageDir, manifest) {
  const before = report.errors.length;
  let flagged = 0;
  for (const file of Array.isArray(manifest?.files) ? manifest.files : []) {
    const target = typeof file?.target === 'string' ? file.target : '';
    const candidate = typeof file?.candidate === 'string' ? file.candidate : '';
    // 只在仓库级 tests/ 或 scripts/ 下才叫"第二个运行器"；
    // 包自带的工具自测（如 tools/cv6/tests/run-tests.mjs）是它自己的事，不该算。
    const nameLooksLikeRunner = /^(tests|scripts)\/(run|runner|run-all|test-all)\.(mjs|cjs|js)$/i.test(target);
    let spawns = false;
    let hasGroups = false;
    const abs = path.resolve(packageDir, candidate);
    const isTestFile = /(^|\/)tests?\//.test(candidate);
    if (!isTestFile && candidate && fs.existsSync(abs) && fs.statSync(abs).isFile() && fs.statSync(abs).size < LIMITS.maxScanFileBytes) {
      const text = fs.readFileSync(abs, 'utf8');
      // 行首匹配：避免把"夹具字符串里写的示例代码"当成真的运行器（本包自己就踩过）
      spawns = /^\s*(?:const|let|var|await|\w+\s*=)?[^'"\n]*\bspawn(Sync)?\s*\(/m.test(text);
      hasGroups = /^\s*(?:const|let|var)?\s*groups\s*=\s*\{/m.test(text);
    }
    if (nameLooksLikeRunner || (spawns && hasGroups)) {
      flagged += 1;
      report.warn(
        'W_DUPLICATE_RUNNER',
        `疑似自带第二个测试运行器：${target || candidate}（既有入口是 tests/run.mjs；新测试应登记进它的 groups 表）`,
        {file: 'manifest.json'}
      );
    }
  }
  if (flagged) report.markCheck('runners', 'warn', {flagged});
  else report.markCheck('runners', 'pass');
  return report.errors.length > before;
}

/**
 * @param {{repoRoot:string, packageDir:string, expectedId?:string, allowReadonly?:string[], targetRoot?:string}} options
 */
export function checkPackage(options) {
  const {repoRoot, packageDir, expectedId, allowReadonly = [], targetRoot} = options;
  const packageId = expectedId ?? path.basename(packageDir);
  const report = new Report({packageId, packageDir, repoRoot});

  // 0) 基线：只记录，不重置（README/04 §2）
  report.facts.actualHead = gitHead(repoRoot);
  const dirty = gitDirty(repoRoot);
  report.facts.dirtyCount = dirty === null ? null : dirty.length;
  report.facts.dirtySample = dirty ? dirty.slice(0, 10) : null;
  report.facts.node = process.version;
  report.facts.platform = `${process.platform}/${process.arch}`;

  // 1) 位置：包必须在交付根下，且不能是交付根本身
  if (!isDirectory(packageDir)) {
    report.error('E_PACKAGE_MISSING', `包目录不存在：${packageDir}`);
    report.markCheck('layout', 'fail');
    report.finish();
    return report;
  }
  const root = deliveryRoot(repoRoot);
  if (!isInside(packageDir, root) || path.resolve(packageDir) === path.resolve(root)) {
    report.error('E_PACKAGE_LOCATION', `包目录必须位于 ${toPosix(path.relative(repoRoot, root))}/<CV6-XX>/ 之下：${packageDir}`);
    report.markCheck('layout', 'fail');
  } else {
    report.markCheck('layout', 'pass');
  }

  const files = walkFiles(packageDir);
  checkHygiene(report, packageDir, files);

  // 2) 三件套
  const manifest = checkManifest(report, packageDir, {expectedId: packageId, allowReadonly});
  checkDeliveryDoc(report, packageDir);

  // 3) 包内文档链接
  const mdFiles = files.filter((file) => !file.dir && !file.link && /\.(md|markdown)$/i.test(file.rel)).map((file) => file.rel);
  checkLinks(report, packageDir, mdFiles);

  // 4) 补丁
  const patches = Array.isArray(manifest?.patches) ? manifest.patches : [];
  if (patches.length) {
    checkPatches(report, packageDir, patches, {targetRoot: targetRoot ?? repoRoot, allowReadonly});
  } else {
    report.markCheck('patch', 'empty', {patches: 0});
  }

  // 5) 反向依赖：先扫候选文件（真正要被采用的东西），再扫已存在的正式目标
  const candidateRels = [];
  for (const file of Array.isArray(manifest?.files) ? manifest.files : []) {
    if (typeof file?.candidate !== 'string') continue;
    try {
      candidateRels.push(normalizeRel(file.candidate));
    } catch {
      /* manifest 检查已报 */
    }
  }
  if (candidateRels.length) checkDependencies(report, packageDir, candidateRels, {sourceRole: true});
  const targetRels = [];
  for (const file of Array.isArray(manifest?.files) ? manifest.files : []) {
    if (typeof file?.target !== 'string') continue;
    try {
      const rel = normalizeRel(file.target);
      if (fs.existsSync(path.join(repoRoot, rel))) targetRels.push(rel);
    } catch {
      /* manifest 检查已报 */
    }
  }
  if (targetRels.length) checkDependencies(report, repoRoot, targetRels, {sourceRole: true});

  // 6) 重复运行器（04 §3）
  checkDuplicateRunners(report, packageDir, manifest);

  report.finish();
  return report;
}
