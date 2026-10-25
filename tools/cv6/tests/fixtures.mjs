// 测试夹具：在包内 tmp/ 下造最小仓库与交付包，每个用例独立一份，互不影响。
// 故意不写进正式工程：所有路径都落在 <CV6-17>/tmp/ 之内。
import fs from 'node:fs';
import path from 'node:path';
import {sha256FileSync, sha256Text} from '../src/lib/hash.mjs';

export function freshRoot(packageDir, name) {
  const base = path.join(packageDir, 'tmp'); fs.mkdirSync(base, {recursive: true});
  const root = fs.mkdtempSync(path.join(base, name + '-'));
  return root;
}

function write(abs, text) {
  fs.mkdirSync(path.dirname(abs), {recursive: true});
  fs.writeFileSync(abs, text);
  return abs;
}

const EXAMPLE_MODULE = "export const example = 'baseline';\n";
const CANDIDATE_MODULE = "export const value = 1;\n";

export function makeRepo(packageDir, name, {withAssets = true} = {}) {
  const root = freshRoot(packageDir, name);
  write(path.join(root, 'package.json'), JSON.stringify({name: 'fixture-repo', type: 'commonjs'}, null, 2));
  write(path.join(root, 'modules/backend/example.mjs'), EXAMPLE_MODULE);
  if (withAssets) {
    write(path.join(root, 'assets/frontend/tiny.json'), '{"ok":true}\n');
    write(path.join(root, 'desktop/host.txt'), 'desktop placeholder\n');
  }
  fs.mkdirSync(path.join(root, 'deliverables/commercial-v6'), {recursive: true});
  return root;
}

export function writeGoodPackage(repoRoot, {packageId = 'CV6-90', mutate} = {}) {
  const dir = path.join(repoRoot, 'deliverables/commercial-v6', packageId);
  const candidateRel = 'src/candidate.mjs';
  const candidateAbs = write(path.join(dir, candidateRel), CANDIDATE_MODULE);
  write(path.join(dir, 'evidence/check.txt'), 'static check: candidate parses\n');

  const patch = [
    'diff --git a/modules/backend/candidate.mjs b/modules/backend/candidate.mjs',
    'new file mode 100644',
    'index 0000000..1111111',
    '--- /dev/null',
    '+++ b/modules/backend/candidate.mjs',
    '@@ -0,0 +1,1 @@',
    '+export const value = 1;',
    ''
  ].join('\n');
  write(path.join(dir, 'patches/add-candidate.patch'), patch);

  const manifest = {
    schemaVersion: 1,
    packageId,
    status: 'candidate-only',
    baseCommit: null,
    contractRevision: 'cv6-contract-1',
    contentSchemaVersion: null,
    contentRevision: null,
    engineProfiles: [],
    mapRevisions: [],
    dependsOn: [],
    inputs: [{path: 'modules/backend/example.mjs', sha256: sha256Text(EXAMPLE_MODULE)}],
    files: [{candidate: candidateRel, target: 'modules/backend/candidate.mjs', kind: 'source', sha256: sha256FileSync(candidateAbs)}],
    patches: ['patches/add-candidate.patch'],
    runCommands: ['node tests/run.mjs unit'],
    evidence: [{scenarioId: 'N04', type: 'static', result: 'pass', path: 'evidence/check.txt'}],
    authorityEffects: [],
    newDependencies: [],
    assetSources: [],
    limitations: ['仅静态检查，未跑 Host 集成'],
    blockingDecisions: [],
    rollbackNotes: '删除 modules/backend/candidate.mjs 即可回退'
  };

  const delivery = `# ${packageId} 交付

- 状态：candidate-only。
- 基线HEAD：fixture（无 git）、输入哈希见 manifest。
- 本次完成阶段与一个完整可运行用例：候选模块可被 import 并返回 1。
- 未完成、未测、能力/资产缺口：见 gaps.md。

## 接入

候选 \`${candidateRel}\` → \`modules/backend/candidate.mjs\`，见 [候选文件](${candidateRel})。

## 证据

| 场景ID | 证据类型 | 输入/操作 | 预期/实际 | 基线版本 | 证据位置 |
| --- | --- | --- | --- | --- | --- |
| N04 | static | 静态读候选 | 通过/通过 | fixture | evidence/check.txt |

## 返工或决策

无。

## 来源与边界

夹具仓库，未修改任何正式文件。
`;
  write(path.join(dir, 'DELIVERY.md'), delivery);
  write(path.join(dir, 'gaps.md'), '# 缺口\n\n- 未跑 host-integration，等接入后补。\n');

  if (typeof mutate === 'function') {
    mutate({dir, manifest, manifestPath: path.join(dir, 'manifest.json'), delivery});
  }
  if (!fs.existsSync(path.join(dir, 'manifest.json'))) {
    fs.writeFileSync(path.join(dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  }
  return {dir, manifest, manifestPath: path.join(dir, 'manifest.json')};
}

export function overwriteManifest(pkg, patch) {
  const next = {...pkg.manifest, ...patch};
  fs.writeFileSync(pkg.manifestPath, JSON.stringify(next, null, 2));
  return next;
}

export {write};
