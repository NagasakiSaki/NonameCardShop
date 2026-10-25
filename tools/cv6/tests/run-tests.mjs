// CV6-17 自测：不用外部框架，零依赖，退出码 0/1，结果同时写 evidence/test-results.json。
// cv6-scan: ignore-file —— 本文件是工具自测，用例里必须写入"故意违规"的字符串（硬编码绝对路径、
// 反向依赖 deliverables），再断言扫描能抓出来。豁免会在报告里以 N_SCAN_SUPPRESSED 留痕，不是静默放行。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {makeRepo, writeGoodPackage, overwriteManifest, freshRoot, write} from './fixtures.mjs';
import {checkPackage} from '../src/lib/check.mjs';
import {normalizeRel, classifyZone, safeWrite, PathViolation, isInside} from '../src/lib/fs-safe.mjs';
import {checkPatches} from '../src/lib/patch.mjs';
import {checkDependencies} from '../src/lib/deps.mjs';
import {createSandbox, verifySandbox, removeSandbox} from '../src/lib/sandbox.mjs';
import {Report} from '../src/lib/report.mjs';
import {buildIntegrationManifest} from '../src/lib/aggregate.mjs';
import {layerOf, wiringOf, auditTargets, materializeInto, renderBatches} from '../src/lib/integrate.mjs';
import {buildTicket, renderTicket} from '../src/lib/rework.mjs';
import {renderSummary} from '../src/lib/summary.mjs';
import {PACKAGE_DIR, DEFAULT_REPO_ROOT} from '../src/lib/config.mjs';

const results = [];
let only = process.argv[2] ?? null;

async function test(name, fn) {
  if (only && !name.includes(only)) return;
  const started = Date.now();
  try {
    await fn();
    results.push({name, passed: true, ms: Date.now() - started});
    process.stdout.write(`  ok   ${name}\n`);
  } catch (error) {
    results.push({name, passed: false, ms: Date.now() - started, error: error.message});
    process.stdout.write(`  FAIL ${name}\n       ${String(error.message).split('\n').join('\n       ')}\n`);
  }
}

function codes(report, severity) {
  return report.items.filter((item) => (severity ? item.severity === severity : true)).map((item) => item.code);
}

function expectCode(report, code) {
  if (!codes(report, 'error').includes(code)) {
    assert.fail(`期望出现 ${code}，实际 error：${JSON.stringify(codes(report, 'error'))}`);
  }
}

function expectNoError(report) {
  if (!report.ok) assert.fail(`期望通过，实际 error：${JSON.stringify(codes(report, 'error'))}`);
}

process.stdout.write('CV6-17 交付工具自测\n\n[路径安全]\n');

await test('normalizeRel 拒绝绝对路径/盘符/UNC/.. 逃逸', () => {
  for (const bad of ['/etc/passwd', 'C:\\Windows\\x', '\\\\server\\share', '../x', 'a/../../b', '']) {
    assert.throws(() => normalizeRel(bad), PathViolation, `应拒绝 ${bad}`);
  }
  assert.equal(normalizeRel('./modules\\backend\\x.mjs'), 'modules/backend/x.mjs');
  assert.equal(normalizeRel('modules/backend/x.mjs'), 'modules/backend/x.mjs');
});

await test('classifyZone 区分禁写/只读/玩家档', () => {
  assert.equal(classifyZone('deliverables/commercial-v6/CV6-03/x.mjs')?.kind, 'hard');
  assert.equal(classifyZone('node_modules/x/y.js')?.kind, 'hard');
  assert.equal(classifyZone('assets/frontend/maps/store.json')?.kind, 'readonly');
  assert.equal(classifyZone('contracts/card-shop-host.d.ts')?.kind, 'readonly');
  assert.equal(classifyZone('saves/profile/day1.json')?.kind, 'protected');
  assert.equal(classifyZone('modules/backend/trading.mjs'), null);
});

await test('safeWrite 拒绝写穿 junction 的真实目标', () => {
  const root = freshRoot(PACKAGE_DIR, 'fs-safe');
  const realDir = path.join(root, 'real-assets');
  const boxRoot = path.join(root, 'box');
  write(path.join(realDir, 'keep.json'), '{"keep":true}\n');
  fs.mkdirSync(boxRoot, {recursive: true});
  const link = path.join(boxRoot, 'assets');
  fs.symlinkSync(realDir, link, 'junction');
  assert.throws(() => safeWrite(boxRoot, path.join(link, 'evil.json'), 'x'), (error) => error.code === 'E_WRITE_THROUGH_LINK');
  assert.equal(fs.existsSync(path.join(realDir, 'evil.json')), false, '真实目标不应被写入');
  // 正常写入仍然可用
  safeWrite(boxRoot, path.join(boxRoot, 'own/file.txt'), 'ok');
  assert.equal(fs.readFileSync(path.join(boxRoot, 'own/file.txt'), 'utf8'), 'ok');
  // 逃出根目录被拒绝
  assert.throws(() => safeWrite(boxRoot, path.join(root, 'outside.txt'), 'x'), (error) => error.code === 'E_WRITE_ESCAPE');
  fs.rmSync(root, {recursive: true, force: true});
});

process.stdout.write('\n[收包体检]\n');

await test('合格包：0 error', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'good');
  const pkg = writeGoodPackage(repoRoot);
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  assert.equal(report.ok, true, JSON.stringify(codes(report, 'error')));
  assert.equal(report.checks.patch.status, 'pass');
  assert.equal(report.facts.patchesApplicable, 1);
});

await test('缺 manifest.json：E_MANIFEST_MISSING', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'no-manifest');
  const pkg = writeGoodPackage(repoRoot);
  fs.unlinkSync(pkg.manifestPath);
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_MANIFEST_MISSING');
  assert.equal(report.ok, false);
});

await test('manifest 路径逃逸/绝对路径：报错', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'bad-target');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {files: [{candidate: 'src/candidate.mjs', target: '../../escape.mjs', kind: 'source'}]});
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_MANIFEST_TARGET_PATH');
});

await test('target 落在只读区 assets：报错；--allow-readonly 降级为 warning', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'readonly-target');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {files: [{candidate: 'src/candidate.mjs', target: 'assets/frontend/x.json', kind: 'source'}]});
  const strict = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(strict, 'E_TARGET_READONLY');
  const loose = checkPackage({repoRoot, packageDir: pkg.dir, allowReadonly: ['assets']});
  assert.ok(codes(loose, 'warning').includes('W_TARGET_READONLY_OVERRIDE'));
  assert.equal(codes(loose, 'error').includes('E_TARGET_READONLY'), false);
});

await test('候选哈希不符：E_MANIFEST_HASH_MISMATCH', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'hash-drift');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {files: [{candidate: 'src/candidate.mjs', target: 'modules/backend/candidate.mjs', kind: 'source', sha256: '0'.repeat(64)}]});
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_MANIFEST_HASH_MISMATCH');
});

await test('输入哈希不符：E_INPUT_HASH_MISMATCH', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'input-drift');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {inputs: [{path: 'modules/backend/example.mjs', sha256: '1'.repeat(64)}]});
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_INPUT_HASH_MISMATCH');
});

await test('证据表类型非法 + unverified 造假：报错', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'evidence-lie');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {evidence: [{scenarioId: 'N04', type: 'looks-fine', result: 'pass'}]});
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_EVIDENCE_TYPE');

  overwriteManifest(pkg, {evidence: [{scenarioId: 'N04', type: 'unverified', result: 'pass'}]});
  const second = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(second, 'E_EVIDENCE_HONESTY');
});

await test('DELIVERY.md 断链：E_LINK_BROKEN', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'broken-link');
  const pkg = writeGoodPackage(repoRoot);
  const file = path.join(pkg.dir, 'DELIVERY.md');
  fs.writeFileSync(file, fs.readFileSync(file, 'utf8') + '\n见 [不存在的文件](src/missing.mjs)。\n');
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_LINK_BROKEN');
});

await test('DELIVERY.md 缺段落/缺状态：报错', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'delivery-shape');
  const pkg = writeGoodPackage(repoRoot);
  fs.writeFileSync(path.join(pkg.dir, 'DELIVERY.md'), '# 交付\n\n随便写写。\n');
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_DELIVERY_STATUS');
  expectCode(report, 'E_DELIVERY_SECTION');
});

await test('候选代码反向依赖 deliverables：E_DEP_DELIVERABLES', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'dep-deliverables');
  const pkg = writeGoodPackage(repoRoot);
  write(path.join(pkg.dir, 'src/candidate.mjs'), "import {x} from '../../../../../deliverables/playability-v4/FAST-05/x.mjs';\nexport const value = x;\n");
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_DEP_DELIVERABLES');
});

await test('候选代码硬编码绝对路径：E_ABSOLUTE_PATH', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'dep-absolute');
  const pkg = writeGoodPackage(repoRoot);
  write(path.join(pkg.dir, 'src/candidate.mjs'), "export const save = 'C:\\\\Users\\\\lenovo\\\\save.json';\n");
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_ABSOLUTE_PATH');
});

await test('宽容项：仓库相对路径 / 合并证据类型 / 对象版版本号 → warning 而非 error', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'lenient');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {
    mapRevisions: [{path: 'assets/frontend/maps/store.json', revision: 3}],
    files: [{candidate: 'deliverables/commercial-v6/CV6-90/src/candidate.mjs', target: 'modules/backend/candidate.mjs', kind: 'source'}],
    evidence: [
      {scenarioId: 'N04', type: 'static+browser-real', result: 'pass'},
      {scenarioId: 'T04', type: 'static', result: 'pass', path: 'deliverables/commercial-v6/CV6-90/evidence/check.txt'}
    ]
  });
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  assert.equal(report.ok, true, `不应有 error：${JSON.stringify(codes(report, 'error'))}`);
  const warnings = codes(report, 'warning');
  for (const code of ['W_MANIFEST_OBJECT_ENTRY', 'W_PATH_REPO_RELATIVE', 'W_EVIDENCE_COMBINED']) {
    assert.ok(warnings.includes(code), `缺少 ${code}，实际 ${JSON.stringify(warnings)}`);
  }
});

await test('candidate 写成目录（尾斜杠）→ E_MANIFEST_CANDIDATE_IS_DIR', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'candidate-dir');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {files: [{candidate: 'src/', target: 'modules/backend/candidate.mjs', kind: 'source'}]});
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  expectCode(report, 'E_MANIFEST_CANDIDATE_IS_DIR');
});

await test('状态行写在正文靠后：warning 而非 error', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'status-late');
  const pkg = writeGoodPackage(repoRoot);
  const file = path.join(pkg.dir, 'DELIVERY.md');
  const text = fs.readFileSync(file, 'utf8').split('\n');
  const index = text.findIndex((line) => /状态/.test(line));
  const [statusLine] = text.splice(index, 1);
  const filler = Array.from({length: 70}, (_, i) => `第 ${i + 1} 行说明。`);
  fs.writeFileSync(file, [...text, '', ...filler, '', statusLine].join('\n'));
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  assert.equal(codes(report, 'error').includes('E_DELIVERY_STATUS'), false, JSON.stringify(codes(report, 'error')));
  assert.ok(codes(report, 'warning').includes('W_DELIVERY_STATUS_LATE'));
});

await test('真实写法兼容：`- **状态**：`candidate-only`` 与包内自指 target', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'real-style');
  const pkg = writeGoodPackage(repoRoot);
  const file = path.join(pkg.dir, 'DELIVERY.md');
  fs.writeFileSync(
    file,
    fs.readFileSync(file, 'utf8').replace(/- 状态：candidate-only。/, '- **状态**：`candidate-only`（说明文字）')
  );
  overwriteManifest(pkg, {
    files: [
      {candidate: 'src/candidate.mjs', target: 'modules/backend/candidate.mjs', kind: 'source'},
      {candidate: 'gaps.md', target: 'deliverables/commercial-v6/CV6-90/gaps.md', kind: 'doc'}
    ]
  });
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  assert.equal(report.ok, true, JSON.stringify(codes(report, 'error')));
  assert.equal(report.facts.deliveryStatus, 'candidate-only');
  assert.ok(codes(report, 'note').includes('N_TARGET_SELF'));
});

await test('自带第二个测试运行器：W_DUPLICATE_RUNNER', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'dup-runner');
  const pkg = writeGoodPackage(repoRoot);
  write(
    path.join(pkg.dir, 'scripts/run-all.mjs'),
    "import {spawn} from 'node:child_process';\nconst groups={unit:['a'],e2e:['b']};\nspawn(process.execPath,['tests/run.mjs','all'],{stdio:'inherit'});\n"
  );
  overwriteManifest(pkg, {
    files: [
      {candidate: 'src/candidate.mjs', target: 'modules/backend/candidate.mjs', kind: 'source'},
      {candidate: 'scripts/run-all.mjs', target: 'scripts/run-all.mjs', kind: 'test'}
    ]
  });
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  assert.ok(codes(report, 'warning').includes('W_DUPLICATE_RUNNER'), JSON.stringify(codes(report, 'warning')));
  assert.equal(report.ok, true, '这只该是提醒，不该阻塞收包');
});

await test('路径里夹中文说明：W_PATH_HAS_NOTE（会真的坏，必须提示）', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'path-note');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {
    files: [{candidate: 'src/candidate.mjs', target: 'tests/cv6-90/x.test.mjs（正式入口由 17 决定）', kind: 'test'}]
  });
  const report = checkPackage({repoRoot, packageDir: pkg.dir});
  assert.ok(codes(report, 'warning').includes('W_PATH_HAS_NOTE'), JSON.stringify(codes(report, 'warning')));
});

process.stdout.write('\n[补丁]\n');

await test('补丁写 assets：报错；显式放行后仅 warning', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'patch-assets');
  const pkg = writeGoodPackage(repoRoot);
  const patch = [
    'diff --git a/assets/frontend/tiny.json b/assets/frontend/tiny.json',
    '--- a/assets/frontend/tiny.json',
    '+++ b/assets/frontend/tiny.json',
    '@@ -1 +1 @@',
    '-{"ok":true}',
    '+{"ok":false}',
    ''
  ].join('\n');
  write(path.join(pkg.dir, 'patches/assets.patch'), patch);
  const strictReport = new Report({repoRoot});
  checkPatches(strictReport, pkg.dir, ['patches/assets.patch'], {targetRoot: repoRoot});
  expectCode(strictReport, 'E_PATCH_READONLY');

  const looseReport = new Report({repoRoot});
  checkPatches(looseReport, pkg.dir, ['patches/assets.patch'], {targetRoot: repoRoot, allowReadonly: ['assets']});
  assert.equal(codes(looseReport, 'error').includes('E_PATCH_READONLY'), false);
  assert.ok(codes(looseReport, 'warning').includes('W_PATCH_READONLY_OVERRIDE'));
});

await test('补丁上下文不匹配：E_PATCH_CONTEXT（自己算，不靠 git 的跳过行为）', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'patch-broken');
  const pkg = writeGoodPackage(repoRoot);
  const patch = [
    'diff --git a/modules/backend/example.mjs b/modules/backend/example.mjs',
    '--- a/modules/backend/example.mjs',
    '+++ b/modules/backend/example.mjs',
    '@@ -1 +1 @@',
    "-export const example = 'not-what-is-in-the-file';",
    "+export const example = 'x';",
    ''
  ].join('\n');
  write(path.join(pkg.dir, 'patches/broken.patch'), patch);
  const report = new Report({repoRoot});
  checkPatches(report, pkg.dir, ['patches/broken.patch'], {targetRoot: repoRoot});
  expectCode(report, 'E_PATCH_CONTEXT');
});

await test('补丁整文件覆盖倾向：W_PATCH_WHOLE_FILE', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'patch-rewrite');
  const pkg = writeGoodPackage(repoRoot);
  const lines = Array.from({length: 40}, (_, index) => `export const line${index} = ${index};`);
  write(path.join(repoRoot, 'modules/backend/big.mjs'), lines.join('\n') + '\n');
  const patch = [
    'diff --git a/modules/backend/big.mjs b/modules/backend/big.mjs',
    '--- a/modules/backend/big.mjs',
    '+++ b/modules/backend/big.mjs',
    `@@ -1,${lines.length} +1,${lines.length} @@`,
    ...lines.map((line) => `-${line}`),
    ...lines.map((line) => `+${line} // touched`),
    ''
  ].join('\n');
  write(path.join(pkg.dir, 'patches/rewrite.patch'), patch);
  const report = new Report({repoRoot});
  checkPatches(report, pkg.dir, ['patches/rewrite.patch'], {targetRoot: repoRoot});
  assert.equal(codes(report, 'error').length, 0, JSON.stringify(codes(report, 'error')));
  assert.ok(codes(report, 'warning').includes('W_PATCH_WHOLE_FILE'), JSON.stringify(codes(report, 'warning')));
});

await test('标为新增但目标已存在：E_PATCH_NEW_EXISTS', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'patch-new-exists');
  const pkg = writeGoodPackage(repoRoot);
  const patch = [
    'diff --git a/modules/backend/example.mjs b/modules/backend/example.mjs',
    'new file mode 100644',
    '--- /dev/null',
    '+++ b/modules/backend/example.mjs',
    '@@ -0,0 +1,1 @@',
    '+export const other = 1;',
    ''
  ].join('\n');
  write(path.join(pkg.dir, 'patches/new-exists.patch'), patch);
  const report = new Report({repoRoot});
  checkPatches(report, pkg.dir, ['patches/new-exists.patch'], {targetRoot: repoRoot});
  expectCode(report, 'E_PATCH_NEW_EXISTS');
});

await test('补丁不写文件（--check 只验证）：正式文件保持不变', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'patch-noop');
  const pkg = writeGoodPackage(repoRoot);
  const report = new Report({repoRoot});
  checkPatches(report, pkg.dir, ['patches/add-candidate.patch'], {targetRoot: repoRoot});
  assert.equal(fs.existsSync(path.join(repoRoot, 'modules/backend/candidate.mjs')), false);
  expectNoError(report);
});

process.stdout.write('\n[反向依赖扫描]\n');

await test('正式源码不依赖 deliverables/demo/fixture；测试可用 fixture', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'scan');
  write(path.join(repoRoot, 'modules/backend/ok.mjs'), "export const a = 1;\n");
  const report = new Report({repoRoot});
  checkDependencies(report, repoRoot, ['modules/backend/ok.mjs', 'modules/backend/example.mjs'], {sourceRole: true});
  expectNoError(report);

  write(path.join(repoRoot, 'modules/backend/bad.mjs'), "import {y} from '../../deliverables/commercial-v6/CV6-90/src/candidate.mjs';\n");
  const second = new Report({repoRoot});
  checkDependencies(second, repoRoot, ['modules/backend/bad.mjs'], {sourceRole: true});
  expectCode(second, 'E_DEP_DELIVERABLES');
});

await test('扫描豁免标记必须是独占一行的注释，且用后留痕', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'scan-suppress');
  // 说明文字里的标记不算：这行只是字符串常量
  write(path.join(repoRoot, 'modules/backend/note.mjs'), "export const tip = 'cv6-scan: ignore-file 这样写不算';\nimport {y} from '../../deliverables/x/y.mjs';\n");
  const strict = new Report({repoRoot});
  checkDependencies(strict, repoRoot, ['modules/backend/note.mjs'], {sourceRole: true});
  expectCode(strict, 'E_DEP_DELIVERABLES');

  // 独占一行的注释才算，且报告里必须出现豁免留痕
  write(path.join(repoRoot, 'tests/scan-fixture.mjs'), '// cv6-scan: ignore-file —— 夹具故意\nimport {z} from "../../deliverables/z.mjs";\n');
  const forgiven = new Report({repoRoot});
  checkDependencies(forgiven, repoRoot, ['tests/scan-fixture.mjs'], {sourceRole: true});
  assert.equal(forgiven.errors.length, 0, JSON.stringify(codes(forgiven, 'error')));
  assert.ok(codes(forgiven, 'note').includes('N_SCAN_SUPPRESSED'));
});

process.stdout.write('\n[sandbox]\n');

await test('sandbox：文本复制 + 大资源 junction + 可复现清单', async () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'sandbox-build');
  const pkg = writeGoodPackage(repoRoot);
  const first = createSandbox({repoRoot, packageDir: pkg.dir, name: 's1'});
  assert.equal(fs.existsSync(path.join(first.dir, 'modules/backend/example.mjs')), true, '文本源码应被复制');
  assert.equal(first.manifest.copiedBytes > 0, true);
  assert.equal(first.manifest.links.some((link) => link.path === 'assets' && link.kind === 'junction'), true);
  assert.equal(fs.realpathSync(path.join(first.dir, 'assets')), fs.realpathSync(path.join(repoRoot, 'assets')));

  const verify = await verifySandbox({repoRoot, sandboxDir: first.dir, since: first.manifest.createdAt});
  assert.equal(verify.ok, true, JSON.stringify(verify.problems));

  // 同一输入重建 → 同一清单摘要
  removeSandbox(first.dir);
  const second = createSandbox({repoRoot, packageDir: pkg.dir, name: 's1'});
  assert.equal(second.manifest.digest, first.manifest.digest, '确定性复制应得到同一摘要');
});

await test('sandbox verify 能发现写穿只读资源', async () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'sandbox-write-through');
  const pkg = writeGoodPackage(repoRoot);
  const box = createSandbox({repoRoot, packageDir: pkg.dir, name: 's2'});
  const target = path.join(box.dir, 'assets/frontend/injected.json');
  fs.writeFileSync(target, '{"oops":true}\n'); // 故意绕过 safeWrite，模拟别处的错误写入
  const verify = await verifySandbox({repoRoot, sandboxDir: box.dir, since: box.manifest.createdAt});
  assert.equal(verify.ok, false);
  assert.ok(verify.problems.some((problem) => problem.code === 'E_SANDBOX_LINK_WRITE'), JSON.stringify(verify.problems));
  fs.unlinkSync(target);
  removeSandbox(box.dir);
});

await test('sandbox 不覆盖已有同名目录', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'sandbox-exists');
  const pkg = writeGoodPackage(repoRoot);
  const box = createSandbox({repoRoot, packageDir: pkg.dir, name: 's3'});
  assert.throws(() => createSandbox({repoRoot, packageDir: pkg.dir, name: 's3'}), (error) => error.code === 'E_SANDBOX_EXISTS');
  removeSandbox(box.dir);
});

process.stdout.write('\n[集成汇总]\n');

await test('aggregate：同 target 多包认领 → C_TARGET_MULTI_OWNER', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'aggregate');
  const root = path.join(repoRoot, 'deliverables/commercial-v6');
  const a = writeGoodPackage(repoRoot, {packageId: 'CV6-90'});
  const b = writeGoodPackage(repoRoot, {packageId: 'CV6-91'});
  const manifest = buildIntegrationManifest({repoRoot, deliveryRoot: root});
  assert.equal(manifest.packageCount, 2);
  assert.ok(manifest.conflicts.some((item) => item.code === 'C_TARGET_MULTI_OWNER' && item.target === 'modules/backend/candidate.mjs'), JSON.stringify(manifest.conflicts));
  assert.equal(manifest.packageCount, manifest.packages.length);
  assert.deepEqual(manifest.skipped, []);
  assert.ok(fs.existsSync(a.dir) && fs.existsSync(b.dir));
});

await test('aggregate：单包无冲突，依赖顺序可读', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'aggregate-single');
  const root = path.join(repoRoot, 'deliverables/commercial-v6');
  writeGoodPackage(repoRoot, {packageId: 'CV6-92'});
  const manifest = buildIntegrationManifest({repoRoot, deliveryRoot: root});
  assert.equal(manifest.conflicts.length, 0, JSON.stringify(manifest.conflicts));
  assert.deepEqual(manifest.mergeOrder, ['CV6-92']);
});

process.stdout.write('\n[整合与返工]\n');

await test('layerOf：三批归属', () => {
  assert.equal(layerOf('tools/cv6/src/cli.mjs').batch, 1);
  assert.equal(layerOf('scripts/run-first-week.mjs').batch, 1);
  assert.equal(layerOf('modules/backend/x.mjs').batch, 2);
  assert.equal(layerOf('server.mjs').batch, 2);
  assert.equal(layerOf('data/progression.json').batch, 3);
  assert.equal(layerOf('content/story/x.json').batch, 3);
  assert.equal(layerOf('docs/narrative/x.md').batch, 3);
});

await test('wiringOf：只有全路径或 文件名+目录名 才算接线（防同名误判）', () => {
  const index = [
    {rel: 'modules/other.mjs', text: "import x from 'content/story/corner_card_shop/text/zh-CN.json'"},
    {rel: 'modules/noise.mjs', text: 'const manifest = require("./manifest"); // characters 这种词到处都是'},
    {rel: 'modules/dirhit.mjs', text: 'read("characters.json", "corner_card_shop")'}
  ];
  assert.equal(wiringOf('content/story/corner_card_shop/text/zh-CN.json', index).length, 1);
  assert.equal(wiringOf('tools/cv6/src/lib/manifest.mjs', index).length, 0);
  assert.equal(wiringOf('content/story/corner_card_shop/characters.json', index)[0].file, 'modules/dirhit.mjs');
});

await test('auditTargets：self / readonly-new / forbidden / inert 判定', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'audit-targets');
  const pkg = writeGoodPackage(repoRoot);
  overwriteManifest(pkg, {
    files: [
      {candidate: 'src/candidate.mjs', target: 'modules/backend/candidate.mjs', kind: 'source'},
      {candidate: 'gaps.md', target: 'deliverables/commercial-v6/CV6-90/gaps.md', kind: 'doc'},
      {candidate: 'src/candidate.mjs', target: 'data/progression.json', kind: 'content'},
      {candidate: 'src/candidate.mjs', target: 'deliverables/commercial-v6/CV6-91/x.mjs', kind: 'source'}
    ]
  });
  const audit = auditTargets({repoRoot, deliveryRoot: path.join(repoRoot, 'deliverables/commercial-v6')});
  const byTarget = Object.fromEntries(audit.rows.map((row) => [row.target, row.verdict]));
  assert.equal(byTarget['modules/backend/candidate.mjs'], 'inert');
  assert.equal(byTarget['deliverables/commercial-v6/CV6-90/gaps.md'], 'self');
  assert.equal(byTarget['data/progression.json'], 'readonly-new');
  assert.equal(byTarget['deliverables/commercial-v6/CV6-91/x.mjs'], 'forbidden');
  assert.equal(audit.byBatch.find((batch) => batch.batch === 1).label, '工具/纯模块');
});

await test('materializeInto：只写沙盒、拒绝逃逸、跳过目录候选', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'materialize');
  const pkg = writeGoodPackage(repoRoot);
  const sandbox = freshRoot(PACKAGE_DIR, 'materialize-box');
  write(path.join(sandbox, 'package.json'), '{"name":"box"}\n');
  const result = materializeInto(sandbox, pkg.dir, {
    files: [
      {candidate: 'src/candidate.mjs', target: 'modules/backend/candidate.mjs'},
      {candidate: 'src/candidate.mjs', target: '../escape.mjs'},
      {candidate: 'src', target: 'modules/backend/dir.mjs'}
    ]
  });
  assert.equal(result.written.length, 1);
  assert.equal(fs.existsSync(path.join(sandbox, 'modules/backend/candidate.mjs')), true);
  assert.equal(fs.existsSync(path.join(PACKAGE_DIR, 'tmp/escape.mjs')), false, '不得写到沙盒外');
  const reasons = result.skipped.map((item) => item.reason);
  assert.ok(reasons.includes('bad-target'), JSON.stringify(reasons));
  assert.ok(reasons.includes('candidate-missing-or-dir'));
});

await test('buildTicket：无动作的 warning 不进返工单，阻塞项单独展开', () => {
  const report = new Report({repoRoot: '/x'});
  report.error('E_PATCH_CONTEXT', '第 1 个 hunk 不匹配', {file: 'p.patch'});
  report.warn('W_MANIFEST_UNKNOWN_KEY', '未知字段 stage');
  report.warn('W_PATH_REPO_RELATIVE', '用了仓库相对路径');
  const ticket = buildTicket({packageId: 'CV6-90', report});
  assert.equal(ticket.blocking, 1);
  assert.equal(ticket.reminderItems.length, 1);
  assert.equal(ticket.infoOnly.length, 1);
  const text = renderTicket(ticket);
  assert.ok(text.includes('CV6-90-R01'));
  assert.ok(!text.includes('未知字段 stage'), '信息项不该出现在正文');
});

await test('renderBatches / renderSummary：给出可粘贴的 git add 与结论段', () => {
  const repoRoot = makeRepo(PACKAGE_DIR, 'batch-render');
  writeGoodPackage(repoRoot);
  const audit = auditTargets({repoRoot, deliveryRoot: path.join(repoRoot, 'deliverables/commercial-v6')});
  const batches = renderBatches(audit);
  assert.ok(batches.includes('git add "modules/backend/candidate.mjs"'));
  assert.ok(batches.includes('批 1'));

  const summary = renderSummary({
    audit,
    checks: [{packageId: 'CV6-90', ok: false, files: 1, errors: 1, warnings: 0, codes: ['E_X']}],
    tickets: [{packageId: 'CV6-90', total: 1, blocking: 1}],
    decisions: [{id: 'D1', title: '只读区放行权', ask: '只有主模型能批'}],
    head: 'deadbee'
  });
  for (const heading of ['## 1. 谁能收、谁要返工', '## 2. 候选落地后会怎样', '## 3. 返工单', '## 4. 需主模型裁决', '## 5. 建议下一步']) {
    assert.ok(summary.includes(heading), `缺段落 ${heading}`);
  }
  assert.ok(summary.split('\n').length < 90, '摘要应控制在两页内');
});

process.stdout.write('\n[本包自检]\n');
await test('正式工具不依赖交付目录，输出保存在独立本地目录', () => {
  assert.ok(fs.existsSync(path.join(DEFAULT_REPO_ROOT, 'modules/backend/runtime.mjs')));
  assert.ok(isInside(PACKAGE_DIR, path.join(DEFAULT_REPO_ROOT, '.local')));
});

const passed = results.filter((item) => item.passed).length;
const evidenceDir = path.join(PACKAGE_DIR, 'evidence');
fs.mkdirSync(evidenceDir, {recursive: true});
fs.writeFileSync(
  path.join(evidenceDir, 'test-results.json'),
  JSON.stringify({tool: 'CV6-17 tests', ranAt: new Date().toISOString(), node: process.version, total: results.length, passed, failed: results.length - passed, results}, null, 2)
);
fs.writeFileSync(
  path.join(evidenceDir, 'test-results.txt'),
  ['CV6-17 交付工具自测', ...results.map((item) => `${item.passed ? 'ok  ' : 'FAIL'} ${item.name} (${item.ms}ms)`), `合计 ${passed}/${results.length}`].join('\n')
);

process.stdout.write(`\n合计 ${passed}/${results.length}\n`);
process.exitCode = passed === results.length ? 0 : 1;
