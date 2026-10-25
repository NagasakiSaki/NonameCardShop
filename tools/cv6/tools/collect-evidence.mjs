// 证据采集：一条命令跑完本阶段所有检查，把结果写进 evidence/。
// 只读正式工程；写只落在本包 evidence/ 与 sandbox/。
// 用法：node tools/collect-evidence.mjs
import fs from 'node:fs';
import path from 'node:path';
import * as cp from 'node:child_process';
import {PACKAGE_DIR, DEFAULT_REPO_ROOT} from '../src/lib/config.mjs';
import {gitHead, gitDirty, sha256FileSync} from '../src/lib/hash.mjs';
import {createSandbox, verifySandbox} from '../src/lib/sandbox.mjs';

const evidence = path.join(PACKAGE_DIR, 'evidence');
fs.mkdirSync(evidence, {recursive: true});
const writeJson = (name, value) => fs.writeFileSync(path.join(evidence, name), JSON.stringify(value, null, 2));
const writeText = (name, value) => fs.writeFileSync(path.join(evidence, name), value);
const run = (args, options = {}) =>
  cp.spawnSync(process.execPath, args, {cwd: options.cwd ?? DEFAULT_REPO_ROOT, encoding: 'utf8', windowsHide: true, timeout: 300000});
const cli = path.join(PACKAGE_DIR, 'src/cli.mjs');
const started = new Date().toISOString();

// 1) 基线：只记录，不重置
const inputs = [
  'package.json',
  'server.mjs',
  'tests/run.mjs',
  'dev/process.mjs',
  'deliverables/commercial-v6/CV6-17/src/lib/check.mjs'
];
const baseline = {
  collectedAt: started,
  repoRoot: DEFAULT_REPO_ROOT,
  head: gitHead(DEFAULT_REPO_ROOT),
  dirty: gitDirty(DEFAULT_REPO_ROOT),
  node: process.version,
  platform: `${process.platform}/${process.arch}`,
  keyInputs: inputs
    .filter((rel) => fs.existsSync(path.join(DEFAULT_REPO_ROOT, rel)))
    .map((rel) => ({path: rel, sha256: sha256FileSync(path.join(DEFAULT_REPO_ROOT, rel))}))
};
writeJson('baseline.json', baseline);

// 2) 自测
const selftest = run([path.join(PACKAGE_DIR, 'tests/run-tests.mjs')], {cwd: PACKAGE_DIR});
writeText('selftest.log', `${selftest.stdout ?? ''}\n${selftest.stderr ?? ''}`.trim() + '\n');

// 3) 正式源码反向依赖扫描
const scan = run([cli, 'scan', '--json', path.join(evidence, 'scan-formal-code.json')]);
writeText('scan-formal-code.log', `${scan.stdout ?? ''}\n${scan.stderr ?? ''}`.trim() + '\n');

// 4) sandbox 重建 + 验证（存在则复用，避免无意义的批量删除）
const sandboxDir = path.join(PACKAGE_DIR, 'sandbox', 'probe');
let sandboxManifest = null;
if (!fs.existsSync(sandboxDir)) {
  const created = createSandbox({repoRoot: DEFAULT_REPO_ROOT, packageDir: PACKAGE_DIR, name: 'probe'});
  sandboxManifest = created.manifest;
} else {
  sandboxManifest = JSON.parse(fs.readFileSync(path.join(sandboxDir, 'sandbox.json'), 'utf8'));
}
writeJson('sandbox.json', {
  sandboxDir: path.relative(DEFAULT_REPO_ROOT, sandboxDir),
  createdAt: sandboxManifest.createdAt,
  copiedCount: sandboxManifest.copiedCount,
  copiedBytes: sandboxManifest.copiedBytes,
  digest: sandboxManifest.digest,
  links: sandboxManifest.links,
  skippedCount: sandboxManifest.skipped.length,
  skipped: sandboxManifest.skipped
});

const verify = await verifySandbox({repoRoot: DEFAULT_REPO_ROOT, sandboxDir, since: sandboxManifest.createdAt});
writeJson('verify.json', verify);

// 5) 索引
const summary = {
  collectedAt: started,
  finishedAt: new Date().toISOString(),
  head: baseline.head,
  selftestExitCode: selftest.status,
  scanExitCode: scan.status,
  sandboxCopiedBytes: sandboxManifest.copiedBytes,
  sandboxCopiedCount: sandboxManifest.copiedCount,
  sandboxLinks: sandboxManifest.links.filter((link) => link.kind === 'junction').length,
  verifyOk: verify.ok,
  evidence: fs.readdirSync(evidence).filter((name) => name !== 'index.json').sort()
};
writeJson('index.json', summary);
process.stdout.write(`${JSON.stringify(summary, null, 2)}\n`);
