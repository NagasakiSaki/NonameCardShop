// 阶段 2：整合候选。只做机械部分——
//   1) 目标审计：这个候选落到什么分区、是不是新路径、正式代码有没有引用它（接得上还是摆设）；
//   2) 分批建议：按 04 §8 分成「工具/纯模块 → 权威接入 → 内容与资源」三批，便于回退；
//   3) 沙盒落地：把候选写到沙盒里的目标路径，再跑受影响测试组。
// 不判断候选内容好不好，也不改任何人的目录。
import fs from 'node:fs';
import path from 'node:path';
import * as cp from 'node:child_process';
import {normalizeRel, classifyZone, toPosix, isInside, safeWrite} from './fs-safe.mjs';
import {sha256FileSync} from './hash.mjs';
import {TEXT_EXTENSIONS, LIMITS} from './config.mjs';

/** 提交批次：04 §8「日常工具/纯模块、权威接入、内容与资源分开便于回退」。 */
export function layerOf(target) {
  if (/^(tools|scripts)\//.test(target)) return {batch: 1, layer: '工具/纯模块'};
  if (/^(modules|integration|contracts|frontend|frontend-next)\//.test(target) || target === 'server.mjs') {
    return {batch: 2, layer: '权威接入'};
  }
  if (/^(content|data|assets)\//.test(target)) return {batch: 3, layer: '内容与资源'};
  if (/^docs\//.test(target)) return {batch: 3, layer: '文档'};
  return {batch: 3, layer: '其它'};
}

function walkText(dir, root, out, depth = 0) {
  if (depth > 10) return;
  let items;
  try {
    items = fs.readdirSync(dir, {withFileTypes: true});
  } catch {
    return;
  }
  for (const item of items) {
    const abs = path.join(dir, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      if (['node_modules', '.git', '.local', 'test-results', 'sandbox', 'tmp'].includes(item.name)) continue;
      walkText(abs, root, out, depth + 1);
      continue;
    }
    if (!item.isFile()) continue;
    if (!TEXT_EXTENSIONS.has(path.extname(item.name).toLowerCase())) continue;
    try {
      if (fs.statSync(abs).size > LIMITS.maxScanFileBytes) continue;
      out.push({abs, rel: toPosix(path.relative(root, abs))});
    } catch {
      /* 读不到就跳过 */
    }
  }
}

/**
 * 正式代码是否“引用”了某个候选目标路径。
 * 判据：代码文本里出现目标的仓库相对路径、或其文件名（含无扩展名形式）。
 * 这是廉价的近似，够用来区分「已接线」和「塞进去没人读」。
 */
export function buildWiringIndex(repoRoot) {
  const files = [];
  for (const dir of ['modules', 'integration', 'contracts', 'frontend', 'frontend-next', 'tests', 'tools', 'dev']) {
    const abs = path.join(repoRoot, dir);
    if (fs.existsSync(abs)) walkText(abs, repoRoot, files);
  }
  for (const rel of ['server.mjs', 'index.html', 'app.js', 'shop-state.js', 'shop-business.js', 'shop-tasks.js', 'battle.js', 'package.json']) {
    const abs = path.join(repoRoot, rel);
    if (fs.existsSync(abs)) files.push({abs, rel});
  }
  const index = files
    .filter((file) => /\.(mjs|cjs|js|ts|json|html)$/i.test(file.rel))
    .map((file) => {
      try {
        return {rel: file.rel, text: fs.readFileSync(file.abs, 'utf8')};
      } catch {
        return null;
      }
    })
    .filter(Boolean);
  return index;
}

export function wiringOf(target, index) {
  const base = path.posix.basename(target);
  const dirName = path.posix.dirname(target).split('/').pop();
  const hits = [];
  for (const file of index) {
    if (file.rel === target) continue;
    if (file.text.includes(target)) {
      hits.push({file: file.rel, how: 'full-path'});
      continue;
    }
    // 只靠文件名太容易误判（"manifest"、"characters" 这种词到处都是）：
    // 必须同时出现文件名和它所在目录名，才算这条代码指向这个路径。
    if (dirName && dirName.length > 3 && file.text.includes(base) && file.text.includes(dirName)) {
      hits.push({file: file.rel, how: 'basename+dir'});
    }
  }
  return hits.slice(0, 6);
}

/**
 * 目标审计：每个候选落到哪、是否新文件、正式代码是否读它。
 * @param {{repoRoot:string, deliveryRoot:string, packageDirs?:string[], wiringIndex?:Array}} options
 */
export function auditTargets(options) {
  const {repoRoot, deliveryRoot} = options;
  const packageDirs = options.packageDirs ?? fs
    .readdirSync(deliveryRoot, {withFileTypes: true})
    .filter((item) => item.isDirectory() && /^CV6-\d{2}$/.test(item.name))
    .map((item) => path.join(deliveryRoot, item.name))
    .sort();
  const index = options.wiringIndex ?? buildWiringIndex(repoRoot);

  const rows = [];
  const packages = [];
  for (const dir of packageDirs) {
    const packageId = path.basename(dir);
    const manifestPath = path.join(dir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      packages.push({packageId, status: 'no-manifest', files: 0});
      continue;
    }
    let manifest;
    try {
      manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    } catch {
      packages.push({packageId, status: 'bad-manifest', files: 0});
      continue;
    }
    const files = Array.isArray(manifest.files) ? manifest.files : [];
    packages.push({packageId, status: manifest.status ?? 'unknown', files: files.length});
    for (const file of files) {
      if (typeof file?.target !== 'string') continue;
      let target;
      try {
        target = normalizeRel(file.target);
      } catch {
        rows.push({packageId, candidate: file.candidate, target: file.target, verdict: 'bad-path'});
        continue;
      }
      const abs = path.join(repoRoot, target);
      const exists = fs.existsSync(abs) && fs.statSync(abs).isFile();
      const zone = classifyZone(target);
      const {batch, layer} = layerOf(target);
      const hits = wiringOf(target, index);
      const candidateAbs = path.resolve(dir, String(file.candidate ?? ''));
      const candidateOk = fs.existsSync(candidateAbs) && fs.statSync(candidateAbs).isFile();
      // target 指回自己包内：只是登记文件现状，不是要写正式工程
      const selfTarget = isInside(path.resolve(repoRoot, target), dir);

      let verdict;
      if (selfTarget) verdict = 'self';
      else if (zone?.kind === 'hard') verdict = 'forbidden';
      else if (zone?.kind === 'readonly' && !exists) verdict = 'readonly-new';
      else if (hits.length) verdict = 'wired';
      else verdict = 'inert';

      rows.push({
        packageId,
        candidate: file.candidate,
        target,
        kind: file.kind ?? null,
        layer,
        batch,
        exists,
        zone: zone?.zone ?? null,
        wiredBy: hits,
        verdict,
        candidateBytes: candidateOk ? fs.statSync(candidateAbs).size : null,
        candidateSha256: candidateOk ? sha256FileSync(candidateAbs) : null,
        targetSha256: exists ? sha256FileSync(abs) : null
      });
    }
  }

  const BATCH_LABEL = {1: '工具/纯模块', 2: '权威接入', 3: '内容与文档'};
  const byBatch = [1, 2, 3].map((batch) => {
    const rowsInBatch = rows.filter((row) => row.batch === batch);
    const layers = {};
    for (const row of rowsInBatch) layers[row.layer] = (layers[row.layer] ?? 0) + 1;
    return {
      batch,
      label: BATCH_LABEL[batch],
      files: rowsInBatch.length,
      layers,
      packages: [...new Set(rowsInBatch.map((row) => row.packageId))]
    };
  });

  const count = (predicate) => rows.filter(predicate).length;
  const summary = {
    generatedAt: new Date().toISOString(),
    repoRoot,
    packages,
    fileCount: rows.length,
    verdicts: {
      wired: count((row) => row.verdict === 'wired'),
      inert: count((row) => row.verdict === 'inert'),
      exists: count((row) => row.exists),
      readonlyNew: count((row) => row.verdict === 'readonly-new'),
      forbidden: count((row) => row.verdict === 'forbidden'),
      self: count((row) => row.verdict === 'self'),
      badPath: count((row) => row.verdict === 'bad-path')
    },
    byBatch,
    rows
  };
  return summary;
}

/** 分批提交清单：每批一个可直接粘贴的 git add 块，按包分组。 */
export function renderBatches(audit) {
  const lines = [];
  lines.push('# CV6 分批提交清单（CV6-17 生成）');
  lines.push('');
  lines.push(`- 生成时间：${audit.generatedAt}`);
  lines.push('- 原则（04 §8）：日常工具/纯模块 → 权威接入 → 内容与资源 分开提交，便于单独回退。');
  lines.push('- 只列目标路径；候选→正式路径的对应关系见 integration-audit.json。');
  lines.push('');
  for (const batch of audit.byBatch) {
    lines.push(`## 批 ${batch.batch}：${batch.label}（${batch.files} 个文件）`);
    lines.push('');
    if (!batch.files) {
      lines.push('_本批当前没有候选。_');
      lines.push('');
      continue;
    }
    const rows = audit.rows.filter((row) => row.batch === batch.batch);
    const byPackage = {};
    for (const row of rows) (byPackage[row.packageId] ??= []).push(row);
    for (const [packageId, items] of Object.entries(byPackage)) {
      lines.push(`### ${packageId}（${items.length}）`);
      lines.push('');
      lines.push('```bash');
      for (const item of items) {
        const note = item.verdict === 'readonly-new' ? '  # 只读区，需裁决 D1' : item.verdict === 'self' ? '  # 包内自指，可跳过' : item.exists ? '  # 目标已存在，先比对再覆盖' : '';
        lines.push(`git add "${item.target}"${note}`);
      }
      lines.push('```');
      lines.push('');
    }
  }
  lines.push('## 不建议提交的');
  lines.push('');
  const skip = audit.rows.filter((row) => ['forbidden', 'bad-path', 'self'].includes(row.verdict));
  if (!skip.length) {
    lines.push('无。');
  } else {
    for (const row of skip) lines.push(`- ${row.packageId} \`${row.target ?? row.candidate}\`（${row.verdict}）`);
  }
  return lines.join('\n') + '\n';
}

/**
 * 把候选写到沙盒里的目标路径。只在沙盒内落盘，且必须经过 isInside 校验。
 * @returns {{written:Array, skipped:Array}}
 */
export function materializeInto(sandboxDir, packageDir, manifest, {only, allowReadonly = []} = {}) {
  const written = [];
  const skipped = [];
  for (const file of Array.isArray(manifest?.files) ? manifest.files : []) {
    if (typeof file?.target !== 'string') {
      skipped.push({candidate: file?.candidate, reason: 'no-target'});
      continue;
    }
    let target;
    try {
      target = normalizeRel(file.target);
    } catch {
      skipped.push({candidate: file.candidate, reason: 'bad-target'});
      continue;
    }
    if (only && !target.startsWith(only)) continue;
    const zone = classifyZone(target);
    if (zone && (zone.kind !== 'readonly' || !allowReadonly.includes(zone.zone))) {
      skipped.push({candidate: file.candidate, reason: 'protected-target'}); continue;
    }
    // 补丁类候选（.patch/.diff 或 kind=patch）不能当普通文件复制到 target——
    // 有的包会把"补丁文件"登记成 files[]，target 写的是它要改的那个文件；直接复制会把正式文件覆盖成 diff 文本。
    if (file.kind === 'patch' || /\.(patch|diff)$/i.test(String(file.candidate ?? '')) || /\.(patch|diff)$/i.test(target)) {
      skipped.push({candidate: file.candidate, reason: 'patch-deferred-to-patch-pipeline'});
      continue;
    }
    const src = path.resolve(packageDir, String(file.candidate ?? ''));
    if (!isInside(src, packageDir) || !fs.existsSync(src) || !isInside(fs.realpathSync(src), fs.realpathSync(packageDir))) {
      skipped.push({candidate: file.candidate, reason: 'candidate-escape-or-missing'}); continue;
    }
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) {
      skipped.push({candidate: file.candidate, reason: 'candidate-missing-or-dir'});
      continue;
    }
    const dst = path.join(sandboxDir, target);
    if (!isInside(dst, sandboxDir)) {
      skipped.push({candidate: file.candidate, reason: 'escape'});
      continue;
    }
    if (file.sha256 && sha256FileSync(src) !== file.sha256) throw new Error(`Candidate hash changed: ${file.candidate}`);
    safeWrite(sandboxDir, dst, fs.readFileSync(src));
    written.push({candidate: file.candidate, target, bytes: fs.statSync(dst).size, sha256: sha256FileSync(dst)});
  }
  return {written, skipped};
}

/** 在沙盒里跑受影响测试组；输出写到 evidenceDir。 */
export function runGroups({sandboxDir, groups, evidenceDir, timeoutMs = 480000}) {
  const results = [];
  for (const group of groups) {
    const started = Date.now();
    const result = cp.spawnSync(process.execPath, ['tests/run.mjs', group], {
      cwd: sandboxDir,
      encoding: 'utf8',
      timeout: timeoutMs,
      windowsHide: true,
      env: {...process.env, CARD_SHOP_TEST_RESULTS: evidenceDir, CARD_SHOP_TEST_PACKAGED: '0'}
    });
    const logRel = `group-${group}.log`;
    fs.mkdirSync(evidenceDir, {recursive: true});
    fs.writeFileSync(path.join(evidenceDir, logRel), `${result.stdout ?? ''}\n${result.stderr ?? ''}`.trim() + '\n');
    results.push({
      group,
      passed: result.status === 0,
      status: result.status,
      seconds: Math.round((Date.now() - started) / 100) / 10,
      log: logRel,
      tail: `${result.stdout ?? ''}`.trim().split('\n').slice(-3).join('\n')
    });
  }
  return results;
}
