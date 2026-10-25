// 生成 manifest.json 与 integration-manifest.json。
// 候选文件改了就跑一次，保证 sha256 与文件一致（工具自己会校验这一点）。
import fs from 'node:fs';
import path from 'node:path';
import {PACKAGE_DIR, DEFAULT_REPO_ROOT} from '../src/lib/config.mjs';
import {sha256FileSync, gitHead} from '../src/lib/hash.mjs';
import {buildIntegrationManifest} from '../src/lib/aggregate.mjs';

const rel = (abs) => path.relative(PACKAGE_DIR, abs).split(path.sep).join('/');
const walk = (dir) => {
  const out = [];
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const abs = path.join(dir, item.name);
    if (item.isDirectory()) out.push(...walk(abs));
    else if (item.isFile() && abs.endsWith('.mjs')) out.push(abs);
  }
  return out.sort();
};

const candidates = [...walk(path.join(PACKAGE_DIR, 'src')), ...walk(path.join(PACKAGE_DIR, 'tools')), ...walk(path.join(PACKAGE_DIR, 'tests'))];

const files = candidates.map((abs) => ({
  candidate: rel(abs),
  // 1:1 映到 tools/cv6/ 下，保持相对导入不变（'../src/lib/x.mjs' 之类不需要改）
  target: `tools/cv6/${rel(abs)}`,
  kind: rel(abs).startsWith('tests/') ? 'test' : 'source',
  sha256: sha256FileSync(abs)
}));

const inputRels = ['package.json', 'server.mjs', 'tests/run.mjs', 'dev/process.mjs'];
const inputs = inputRels
  .filter((item) => fs.existsSync(path.join(DEFAULT_REPO_ROOT, item)))
  .map((item) => ({path: item, sha256: sha256FileSync(path.join(DEFAULT_REPO_ROOT, item))}));

const evidence = [
  {scenarioId: 'C01', type: 'unit', result: 'pass', path: 'evidence/selftest.log'},
  {scenarioId: 'C02', type: 'static', result: 'pass', path: 'evidence/scan-formal-code.json'},
  {scenarioId: 'C03', type: 'host-integration', result: 'pass', path: 'evidence/sandbox-unit-tests.log'},
  {scenarioId: 'C04', type: 'static', result: 'pass', path: 'evidence/verify.json'},
  {scenarioId: 'C05', type: 'static', result: 'pass', path: 'evidence/sandbox.json'},
  {scenarioId: 'C06', type: 'browser-real', result: 'not-run', path: null},
  {scenarioId: 'C07', type: 'manual-observation', result: 'pass', path: 'evidence/git-apply-subdir.txt'},
  {scenarioId: 'C08', type: 'static', result: 'pass', path: 'evidence/real-packages-trial.json'},
  {scenarioId: 'C09', type: 'static', result: 'pass', path: 'integration-audit.json'},
  {scenarioId: 'C10', type: 'host-integration', result: 'partial', path: 'evidence/integration-group-unit.log'},
  {scenarioId: 'C11', type: 'host-integration', result: 'partial', path: 'evidence/control-core4-clean-sandbox.log'},
  {scenarioId: 'C12', type: 'static', result: 'pass', path: 'review-summary.md'},
  {scenarioId: 'C13', type: 'host-integration', result: 'pass', path: 'evidence/integration-run-cv6-15.json'},
  {scenarioId: 'C14', type: 'manual-observation', result: 'pass', path: 'evidence/cv6-15-integration-notes.txt'}
].map((item) => (item.result === 'not-run' ? {...item, type: 'unverified'} : item));

const manifest = {
  schemaVersion: 1,
  packageId: 'CV6-17',
  status: 'candidate-only',
  baseCommit: '16cd0b06',
  contractRevision: 'commercial-v6@2026-10-25',
  contentSchemaVersion: null,
  contentRevision: null,
  engineProfiles: [],
  mapRevisions: [],
  dependsOn: [],
  inputs,
  files,
  patches: [],
  runCommands: [
    'node tools/cv6/cli.mjs check CV6-17',
    'node tools/cv6/tests/run-tests.mjs',
    'node tools/cv6/cli.mjs sandbox CV6-17 --name probe',
    'node tools/cv6/cli.mjs aggregate'
  ],
  evidence,
  authorityEffects: [],
  newDependencies: [],
  assetSources: [],
  limitations: [
    '只验证了 unit 测试组；ui/frontend 浏览器组未测（unverified）。',
    '只读复用依赖 Windows junction，Linux/macOS 未验证。',
    '单文件超过 16MB 的文本不会复制进 sandbox，会登记在 skipped[]。'
  ],
  blockingDecisions: ['D1 只读区放行权', 'D3 sandbox 链接 vendor', 'D5 退役目录清理责任', 'D6 补丁判定以自研 hunk 匹配为准'],
  rollbackNotes: '全部为本包新增文件；采用时只新增 tools/cv6/，删除该目录即完全回退，不影响正式工程任何既有文件。',
  notes: '启动 HEAD=16cd0b06（任务书写 74c7a8e9）。工作中出现并行文档提交 1bd720c5（docs: establish narrative rollback and effect consistency gates），未触及本包输入代码，本包未 reset 任何提交。'
};

fs.writeFileSync(path.join(PACKAGE_DIR, 'manifest.json'), JSON.stringify(manifest, null, 2));

const integration = buildIntegrationManifest({
  repoRoot: DEFAULT_REPO_ROOT,
  deliveryRoot: path.join(DEFAULT_REPO_ROOT, 'deliverables/commercial-v6')
});
fs.writeFileSync(path.join(PACKAGE_DIR, 'integration-manifest.json'), JSON.stringify(integration, null, 2));

process.stdout.write(
  [
    `manifest.json：${files.length} 个候选 → tools/cv6/`,
    `inputs：${inputs.length} 个哈希；baseCommit=${manifest.baseCommit}；当前 HEAD=${gitHead(DEFAULT_REPO_ROOT)}`,
    `integration-manifest.json：${integration.packageCount} 包 / ${integration.targets.length} 目标 / 冲突 ${integration.conflicts.length}`
  ].join('\n') + '\n'
);
