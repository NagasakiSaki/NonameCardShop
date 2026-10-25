#!/usr/bin/env node
// CV6-17 交付沙盒工具 CLI。
// 用法：
//   node src/cli.mjs check <CV6-XX|路径> [--repo <root>] [--allow-readonly assets] [--json out.json]
//   node src/cli.mjs scan [目录...] [--repo <root>]            反向依赖/绝对路径扫描
//   node src/cli.mjs patch <包路径> [--target <root>]          只做补丁检查
//   node src/cli.mjs sandbox <包路径> [--name s1] [--force]    建可复现 sandbox
//   node src/cli.mjs verify <sandbox路径> [--since ISO]        验证没写穿链接
//   node src/cli.mjs all [--repo <root>]                       扫全部已收包
// 退出码：0 通过；1 有 error；2 用法错误。
import fs from 'node:fs';
import path from 'node:path';
import {resolveRepoRoot, deliveryRoot, PACKAGE_DIR, PACKAGE_ID_PATTERN} from './lib/config.mjs';
import {checkPackage} from './lib/check.mjs';
import {checkPatches, materializePatches} from './lib/patch.mjs';
import {checkDependencies} from './lib/deps.mjs';
import {createSandbox, verifySandbox, removeSandbox, listRetired} from './lib/sandbox.mjs';
import {Report} from './lib/report.mjs';
import {buildIntegrationManifest} from './lib/aggregate.mjs';
import {auditTargets, materializeInto, runGroups, renderBatches} from './lib/integrate.mjs';
import {buildTicket, writeTickets} from './lib/rework.mjs';
import {renderSummary, writeSummary} from './lib/summary.mjs';
import {gitHead} from './lib/hash.mjs';
import {toPosix, safeWrite, safeMkdir, linkAncestors} from './lib/fs-safe.mjs';

function parseArgs(argv) {
  const args = {_: []};
  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith('--')) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[index + 1];
    if (next && !next.startsWith('--')) {
      args[key] = next;
      index += 1;
    } else {
      args[key] = true;
    }
  }
  return args;
}

function listPackages(repoRoot) {
  const root = deliveryRoot(repoRoot);
  if (!fs.existsSync(root)) return [];
  return fs
    .readdirSync(root, {withFileTypes: true})
    .filter((item) => item.isDirectory() && PACKAGE_ID_PATTERN.test(item.name))
    .map((item) => path.join(root, item.name))
    .sort();
}

function resolvePackage(repoRoot, token) {
  if (!token) return null;
  if (fs.existsSync(token) && fs.statSync(token).isDirectory()) return path.resolve(token);
  if (PACKAGE_ID_PATTERN.test(token)) {
    const candidate = path.join(deliveryRoot(repoRoot), token);
    if (fs.existsSync(candidate)) return candidate;
  }
  return null;
}

function emit(report, args) {
  const json = report.toJSON();
  process.stdout.write(`${report.toText()}\n`);
  if (args.json) {
    // --json 相对当前工作目录解析，避免因包目录不同而落到意外位置
    const out = path.resolve(process.cwd(), args.json);
    fs.mkdirSync(path.dirname(out), {recursive: true});
    safeWrite(PACKAGE_DIR, out, JSON.stringify(json, null, 2));
    process.stdout.write(`报告已写入 ${out}\n`);
  }
  return json;
}

/** 从 DECISIONS-needed.md 读裁决项，供摘要只列最小集。 */
function loadDecisions(packageDir) {
  const abs = path.join(packageDir, 'DECISIONS-needed.md');
  if (!fs.existsSync(abs)) return [];
  const text = fs.readFileSync(abs, 'utf8');
  const heads = [...text.matchAll(/^##\s+(D\d+)\s+(.+)$/gm)];
  const items = heads.map((match, index) => {
    const start = match.index;
    const end = index + 1 < heads.length ? heads[index + 1].index : text.length;
    const body = text.slice(start, end);
    const ask = /建议[：:]\s*(.+)/.exec(body)?.[1]?.trim() ?? '见 DECISIONS-needed.md';
    return {id: match[1], title: match[2].trim(), ask};
  });
  // 最小集：D1 只在真的有只读区候选时才提；D3/D6 是 17 自身口径，常在。
  const always = new Set(['D3', 'D6']);
  return items.filter((item) => always.has(item.id) || item.id === 'D1');
}

function printHelp() {  process.stdout.write(`CV6-17 交付沙盒工具

  check <CV6-XX|路径>            收包体检：manifest / DELIVERY / 链接 / 补丁 / 反向依赖 / 目录卫生
  scan [目录...]                 只做反向依赖与绝对路径扫描
  patch <包路径>                 只做补丁路径与可应用性检查
  sandbox <包路径>               建可复现 sandbox（文本复制 + 大资源只读 junction）
  verify <sandbox路径>           校验 sandbox 未写穿只读资源
  aggregate                      汇总各包 manifest → integration-manifest.json
  integrate [--materialize P1,P2] [--groups unit]  目标审计；可选把候选落进沙盒并跑受影响组
  rework [CV6-XX]                生成返工单（默认全部包）→ rework/
  summary                        生成 review-summary.md + batches.md + 全部返工单
  purge <包路径>                 清理 *.old-* 退役目录（受宿主批量删除策略约束）
  all                            扫描 <repo>/deliverables/commercial-v6 下全部包

通用参数：--repo <root>  --json <文件>  --allow-readonly <zone>[,<zone>]
`);
}

async function main(argv) {
  const args = parseArgs(argv);
  const command = args._[0];
  const repoRoot = resolveRepoRoot(args.repo);
  safeMkdir(PACKAGE_DIR, PACKAGE_DIR);
  if (args.name !== undefined && (typeof args.name !== 'string' || !/^[a-zA-Z0-9_-]{1,64}$/.test(args.name))) throw new Error('Invalid sandbox name');
  const allowReadonly = String(args['allow-readonly'] ?? '')
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean);

  if (!command || command === 'help' || command === '--help') {
    printHelp();
    return 0;
  }

  if (command === 'check') {
    const packageDir = resolvePackage(repoRoot, args._[1]);
    if (!packageDir) {
      process.stderr.write(`找不到包：${args._[1] ?? '(未指定)'}\n`);
      return 2;
    }
    const report = checkPackage({repoRoot, packageDir, allowReadonly});
    emit(report, args);
    return report.ok ? 0 : 1;
  }

  if (command === 'all') {
    const packages = listPackages(repoRoot);
    if (!packages.length) {
      process.stdout.write(`没有已收包：${toPosix(path.relative(repoRoot, deliveryRoot(repoRoot)))}\n`);
      return 0;
    }
    let failed = 0;
    const rows = [];
    for (const packageDir of packages) {
      const report = checkPackage({repoRoot, packageDir, allowReadonly});
      rows.push({
        packageId: report.packageId,
        ok: report.ok,
        errors: report.errors.length,
        warnings: report.warnings.length,
        codes: [...new Set(report.errors.map((item) => item.code))]
      });
      if (!report.ok) failed += 1;
      process.stdout.write(`\n${report.toText()}\n`);
    }
    process.stdout.write(`\n汇总：${rows.length - failed}/${rows.length} 包通过\n`);
    if (args.json) {
      safeWrite(PACKAGE_DIR, path.resolve(args.json), JSON.stringify(rows, null, 2));
    }
    return failed ? 1 : 0;
  }

  if (command === 'scan') {
    const report = new Report({repoRoot, packageDir: repoRoot});
    const targets = args._.slice(1);
    let files = [];
    if (targets.length) {
      for (const target of targets) {
        const abs = path.resolve(repoRoot, target);
        if (!fs.existsSync(abs)) continue;
        if (fs.statSync(abs).isFile()) files.push(toPosix(path.relative(repoRoot, abs)));
        else files.push(...walk(abs, repoRoot));
      }
    } else {
      for (const dir of ['modules', 'integration', 'contracts', 'frontend', 'frontend-next', 'server.mjs']) {
        const abs = path.join(repoRoot, dir);
        if (!fs.existsSync(abs)) continue;
        if (fs.statSync(abs).isFile()) files.push(dir);
        else files.push(...walk(abs, repoRoot));
      }
    }
    // 仓库广扫不是收包判定：demo/fixture 引用只记 warning，由收包人结合角色判断。
    // deliverables 反向依赖与绝对路径无论何时都是 error。
    checkDependencies(report, repoRoot, files, {sourceRole: Boolean(args.strict)});
    emit(report, args);
    return report.ok ? 0 : 1;
  }

  if (command === 'patch') {
    const packageDir = resolvePackage(repoRoot, args._[1]);
    if (!packageDir) {
      process.stderr.write(`找不到包：${args._[1] ?? '(未指定)'}\n`);
      return 2;
    }
    const manifestPath = path.join(packageDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      process.stderr.write(`缺少 manifest.json：${toPosix(path.relative(repoRoot, packageDir))}\n`);
      return 1;
    }
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    const report = new Report({repoRoot, packageDir, packageId: manifest.packageId ?? path.basename(packageDir)});
    checkPatches(report, packageDir, manifest.patches ?? [], {targetRoot: args.target ?? repoRoot, allowReadonly});
    emit(report, args);
    return report.ok ? 0 : 1;
  }

  if (command === 'sandbox') {
    const packageDir = resolvePackage(repoRoot, args._[1]);
    if (!packageDir) {
      process.stderr.write(`找不到包：${args._[1] ?? '(未指定)'}\n`);
      return 2;
    }
    const result = createSandbox({
      repoRoot,
      packageDir: PACKAGE_DIR,
      name: typeof args.name === 'string' ? args.name : 'default',
      force: Boolean(args.force),
      sourceDirs: typeof args.dirs === 'string' ? args.dirs.split(',').map((v) => v.trim()).filter(Boolean) : undefined
    });
    const manifest = result.manifest;
    process.stdout.write(
      [
        `sandbox：${toPosix(path.relative(repoRoot, result.dir))}`,
        `文本副本：${manifest.copiedCount} 个 / ${(manifest.copiedBytes / 1024 / 1024).toFixed(1)}MB`,
        `只读链接：${manifest.links.filter((link) => link.kind === 'junction').length}/${manifest.links.length}`,
        `跳过：${manifest.skipped.length}（非文本/超限）`,
        `清单摘要：${manifest.digest}`
      ].join('\n') + '\n'
    );
    const failedLinks = manifest.links.filter((link) => link.kind !== 'junction');
    return failedLinks.length ? 1 : 0;
  }

  if (command === 'purge') {
    const packageDir = resolvePackage(repoRoot, args._[1]);
    if (!packageDir) {
      process.stderr.write(`找不到包：${args._[1] ?? '(未指定)'}\n`);
      return 2;
    }
    const retired = listRetired(PACKAGE_DIR);
    if (!retired.length) {
      process.stdout.write('没有退役目录需要清理\n');
      return 0;
    }
    let done = 0;
    for (const dir of retired) {
      try {
        removeSandbox(dir);
        done += 1;
        process.stdout.write(`已清理 ${toPosix(path.relative(repoRoot, dir))}\n`);
      } catch (error) {
        process.stderr.write(
          `未清理 ${toPosix(path.relative(repoRoot, dir))}：${error.message}\n` +
            '  （本机宿主会拦截单轮批量删除，请在宿主外手动删除，或分开多次执行）\n'
        );
      }
    }
    return done === retired.length ? 0 : 1;
  }

  if (command === 'aggregate') {
    const manifest = buildIntegrationManifest({repoRoot, deliveryRoot: deliveryRoot(repoRoot)});
    const out = path.resolve(
      repoRoot,
      typeof args.out === 'string' ? args.out : path.join(PACKAGE_DIR, 'integration-manifest.json')
    );
    safeWrite(PACKAGE_DIR, out, JSON.stringify(manifest, null, 2));
    process.stdout.write(
      [
        `汇总 ${manifest.packageCount} 个包 → ${toPosix(path.relative(repoRoot, out))}`,
        `目标文件 ${manifest.targets.length} 个，补丁目标 ${manifest.patchTargets.length} 个`,
        `冲突 ${manifest.conflicts.length} 个${manifest.conflicts.length ? '：' + manifest.conflicts.map((item) => item.code).join(',') : ''}`,
        `跳过 ${manifest.skipped.length} 个（缺 manifest）`
      ].join('\n') + '\n'
    );
    return manifest.conflicts.length ? 1 : 0;
  }

  if (command === 'integrate') {
    const audit = auditTargets({repoRoot, deliveryRoot: deliveryRoot(repoRoot)});
    const out = path.resolve(process.cwd(), typeof args.out === 'string' ? args.out : path.join(PACKAGE_DIR, 'integration-audit.json'));
    safeWrite(PACKAGE_DIR, out, JSON.stringify(audit, null, 2));
    process.stdout.write(
      [
        `目标审计：${audit.fileCount} 个候选 / ${audit.packages.length} 个包`,
        `已接线 ${audit.verdicts.wired} · 未接线(inert) ${audit.verdicts.inert} · 已存在文件 ${audit.verdicts.exists} · 只读区新增 ${audit.verdicts.readonlyNew} · 禁写 ${audit.verdicts.forbidden}`,
        ...audit.byBatch.map((batch) => `  批 ${batch.batch}（${batch.label}）：${batch.files} 个文件，涉及 ${batch.packages.join(',') || '—'}`),
        `审计结果 → ${toPosix(path.relative(repoRoot, out))}`
      ].join('\n') + '\n'
    );

    const materialize = typeof args.materialize === 'string' ? args.materialize.split(',').map((v) => v.trim()).filter(Boolean) : [];
    if (materialize.length) {
      const sandboxDir = path.join(PACKAGE_DIR, 'sandbox', typeof args.name === 'string' ? args.name : 'probe');
      if (!fs.existsSync(sandboxDir)) {
        const created = createSandbox({repoRoot, packageDir: PACKAGE_DIR, name: typeof args.name === 'string' ? args.name : 'probe'});
        process.stdout.write(`已建 sandbox：${toPosix(path.relative(repoRoot, created.dir))}\n`);
      }
      if (linkAncestors(sandboxDir, PACKAGE_DIR).length || JSON.parse(fs.readFileSync(path.join(sandboxDir,'sandbox.json'),'utf8')).kind !== 'cv6-sandbox') throw new Error('Not an owned sandbox');
      const evidenceDir = path.join(PACKAGE_DIR, 'evidence', `integration-${new Date().toISOString().replace(/[:.]/g, '-')}`);
      const materialized = [];
      for (const packageId of materialize) {
        if (!PACKAGE_ID_PATTERN.test(packageId)) throw new Error('Invalid package ID');
        const dir = path.join(deliveryRoot(repoRoot), packageId);
        const manifestPath = path.join(dir, 'manifest.json');
        if (!fs.existsSync(manifestPath)) {
          process.stderr.write(`跳过 ${packageId}：无 manifest\n`);
          continue;
        }
        const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
        const validation = checkPackage({repoRoot, packageDir: dir, allowReadonly});
        if (!validation.ok) throw new Error(`${packageId}: package validation failed; run check first`);
        const result = materializeInto(sandboxDir, dir, manifest, {only: typeof args.only === 'string' ? args.only : undefined, allowReadonly});
        // 补丁也要真落到沙盒里，否则"整合"只是复制了几个新文件，等于没接上
        const patchReport = new Report({repoRoot: sandboxDir, packageDir: dir, packageId});
        const {previews} = checkPatches(patchReport, dir, manifest.patches ?? [], {targetRoot: sandboxDir, allowReadonly});
        if (patchReport.errors.length) throw new Error(`${packageId}: patch validation failed`);
        const applied = materializePatches(sandboxDir, previews);
        materialized.push({
          packageId,
          ...result,
          patches: applied,
          patchErrors: patchReport.errors.map((item) => `${item.code}: ${item.message}`)
        });
        process.stdout.write(
          `落地 ${packageId}：写入 ${result.written.length}，跳过 ${result.skipped.length}，补丁 ${applied.length}/${(manifest.patches ?? []).length}` +
            (patchReport.errors.length ? `（补丁错误 ${patchReport.errors.length}）` : '') +
            '\n'
        );
      }
      const groups = typeof args.groups === 'string' ? args.groups.split(',').map((v) => v.trim()).filter(Boolean) : ['unit'];
      const results = runGroups({sandboxDir, groups, evidenceDir});
      for (const result of results) process.stdout.write(`  组 ${result.group}：${result.passed ? '通过' : '失败'}（${result.seconds}s）\n`);
      const record = {
        at: new Date().toISOString(),
        sandbox: toPosix(path.relative(repoRoot, sandboxDir)),
        packages: materialize,
        materialized,
        groups: results,
        evidenceDir: toPosix(path.relative(repoRoot, evidenceDir))
      };
      const recordPath = path.join(PACKAGE_DIR, 'integration-run.json');
      safeWrite(PACKAGE_DIR, recordPath, JSON.stringify(record, null, 2));
      process.stdout.write(`整合运行记录 → ${toPosix(path.relative(repoRoot, recordPath))}\n`);
      return results.every((result) => result.passed) ? 0 : 1;
    }
    return audit.verdicts.forbidden || audit.verdicts.badPath ? 1 : 0;
  }

  if (command === 'rework') {
    const packages = listPackages(repoRoot);
    const targets = typeof args._[1] === 'string' ? [args._[1]] : packages.map((dir) => path.basename(dir));
    const tickets = [];
    for (const packageId of targets) {
      if (!PACKAGE_ID_PATTERN.test(packageId)) throw new Error('Invalid package ID');
      const packageDir = path.join(deliveryRoot(repoRoot), packageId);
      if (!fs.existsSync(packageDir)) {
        process.stderr.write(`跳过 ${packageId}：目录不存在\n`);
        continue;
      }
      const report = checkPackage({repoRoot, packageDir, allowReadonly});
      tickets.push(buildTicket({packageId, report}));
    }
    const written = writeTickets(PACKAGE_DIR, tickets);
    for (const item of written) process.stdout.write(`${item.package}：${item.items} 条 → ${item.path}\n`);
    const blocking = tickets.reduce((sum, ticket) => sum + ticket.blocking, 0);
    process.stdout.write(`合计 ${tickets.length} 个包 / ${blocking} 条阻塞项\n`);
    return 0;
  }

  if (command === 'summary') {
    const boxes = listPackages(repoRoot);
    const audit = auditTargets({repoRoot, deliveryRoot: deliveryRoot(repoRoot)});
    safeWrite(PACKAGE_DIR, path.join(PACKAGE_DIR, 'integration-audit.json'), JSON.stringify(audit, null, 2));
    safeWrite(PACKAGE_DIR, path.join(PACKAGE_DIR, 'batches.md'), renderBatches(audit));

    const checks = [];
    const tickets = [];
    for (const packageDir of boxes) {
      const report = checkPackage({repoRoot, packageDir, allowReadonly});
      const packageId = report.packageId;
      checks.push({
        packageId,
        ok: report.ok,
        files: report.facts.manifestFiles ?? null,
        errors: report.errors.length,
        warnings: report.warnings.length,
        codes: [...new Set(report.errors.map((item) => item.code))]
      });
      if (!report.ok || report.warnings.length) tickets.push(buildTicket({packageId, report}));
    }
    writeTickets(PACKAGE_DIR, tickets);
    const decisions = loadDecisions(PACKAGE_DIR);
    const content = renderSummary({
      audit,
      checks,
      tickets,
      decisions,
      head: gitHead(repoRoot)
    });
    const abs = writeSummary(PACKAGE_DIR, content);
    process.stdout.write(
      [
        `摘要 → ${toPosix(path.relative(repoRoot, abs))}`,
        `分批清单 → ${toPosix(path.relative(repoRoot, path.join(PACKAGE_DIR, 'batches.md')))}`,
        `返工单 ${tickets.length} 份 → rework/`,
        `通过 ${checks.filter((item) => item.ok).length}/${checks.length} 个包`
      ].join('\n') + '\n'
    );
    return 0;
  }

  if (command === 'verify') {    const sandboxDir = path.resolve(repoRoot, args._[1] ?? '');
    if (!fs.existsSync(sandboxDir)) {
      process.stderr.write(`sandbox 不存在：${sandboxDir}\n`);
      return 2;
    }
    const result = await verifySandbox({repoRoot, sandboxDir, since: args.since});
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return result.ok ? 0 : 1;
  }

  process.stderr.write(`未知命令：${command}\n`);
  printHelp();
  return 2;
}

function walk(dir, repoRoot) {
  const out = [];
  for (const item of fs.readdirSync(dir, {withFileTypes: true})) {
    const abs = path.join(dir, item.name);
    if (item.isSymbolicLink()) continue;
    if (item.isDirectory()) {
      if (['node_modules', '.git', '.local'].includes(item.name)) continue;
      out.push(...walk(abs, repoRoot));
      continue;
    }
    if (item.isFile()) out.push(toPosix(path.relative(repoRoot, abs)));
  }
  return out;
}

main(process.argv.slice(2))
  .then((code) => {
    process.exitCode = code;
  })
  .catch((error) => {
    process.stderr.write(`失败：${error.message}\n`);
    if (process.env.CV6_DEBUG) process.stderr.write(`${error.stack}\n`);
    process.exitCode = 1;
  });
