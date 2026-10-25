// 阶段 3：返工单。把体检结果翻译成原作者能直接动手的短单。
// 格式按 04 §6：问题ID、文件/位置、复现输入、预期/实际、需重测项。
// 17 只出单，不改对方目录；普通缺口回原作者，只有政策类才升级给主模型。
import fs from 'node:fs';
import path from 'node:path';
import {safeWrite,safeMkdir} from './fs-safe.mjs';

// 每个错误码：这条到底要作者改什么、改完要重测哪些项。
const GUIDE = {
  E_MANIFEST_MISSING: {fix: '补 manifest.json（模板见 共享资料/docs/collaboration/commercial-v6/manifest模板.json）', retest: 'check 通过；evidence[].path 与 files[].sha256 均为真实值'},
  E_MANIFEST_JSON: {fix: '修 JSON 语法', retest: 'check 能解析 manifest'},
  E_MANIFEST_PACKAGE_MISMATCH: {fix: 'manifest.packageId 改成与目录一致', retest: 'check manifest 通过'},
  E_MANIFEST_STATUS: {fix: 'status 用枚举值 contract-proposal/candidate-only/sandbox-integrated/ready-for-review/blocked', retest: 'check manifest 通过'},
  E_MANIFEST_HASH_FORMAT: {fix: 'sha256 必须是 64 位小写十六进制（不要写 "n/a"、短hash、大写）', retest: '所有 inputs/files 哈希可核对'},
  E_MANIFEST_HASH_MISMATCH: {fix: '候选文件改过就重算 sha256（sha256sum 或 node 一行命令）', retest: 'check 无 E_MANIFEST_HASH_MISMATCH'},
  E_INPUT_HASH_MISMATCH: {fix: '确认你基于的输入还是不是仓库当前版本；是的话更新 manifest 记录的哈希，不是你改的文件的话说明基线已漂，需重做受影响部分', retest: 'inputs 全部核对通过'},
  E_MANIFEST_CANDIDATE_MISSING: {fix: 'candidate 指向的文件不存在，补文件或改路径（包内相对）', retest: 'check 能读到每个候选'},
  E_MANIFEST_CANDIDATE_IS_DIR: {fix: 'files[] 必须逐文件列出，不能写目录（当前写成目录了）', retest: '每个条目都是文件且带 target'},
  E_MANIFEST_ENTRY: {fix: '补齐 files[].candidate / files[].target 等必填字段', retest: 'check manifest 通过'},
  E_MANIFEST_TYPE: {fix: '按模板类型填：版本类是数组、依赖/命令/限制是字符串数组', retest: 'check manifest 通过'},
  E_MANIFEST_TARGET_PATH: {fix: 'target 必须是仓库相对路径，不能绝对、不能含 ..', retest: 'check manifest 通过'},
  E_TARGET_READONLY: {fix: '目标落在只读区（assets/data/contracts/vendor/desktop）。要么改到可写区，要么由主模型裁决放行并写进 authorityEffects', retest: '裁决后重跑 check；未裁决前不算可收'},
  E_TARGET_FORBIDDEN: {fix: '目标落在 deliverables/node_modules/.git 等禁写区，必须改到正式路径', retest: 'check 无禁写命中'},
  E_TARGET_PROTECTED: {fix: '目标命中玩家档/原图保护区，禁止写入', retest: 'check 无保护区命中'},
  E_PATCH_READONLY: {fix: '补丁写了只读区；素材用只读复用，不要打补丁', retest: 'patch 检查通过'},
  E_PATCH_FORBIDDEN: {fix: '补丁写了禁写区，改方案', retest: 'patch 检查通过'},
  E_PATCH_CONTEXT: {fix: '补丁与目标文件当前内容对不上（hunk 行号/内容都给了）。按当前文件重做补丁', retest: 'patch 检查通过，且 --check 不落盘'},
  E_PATCH_MISSING_FILE: {fix: '补丁要改的文件不存在；新文件请用 /dev/null 的 new file 形式', retest: 'patch 检查通过'},
  E_PATCH_NEW_EXISTS: {fix: '声明为新增但文件已存在，改成 modify 或说明覆盖理由', retest: 'patch 检查通过'},
  E_PATCH_EMPTY: {fix: '文件不是 unified diff（git diff 产出），重新导出', retest: 'patch 能解析出条目'},
  E_DEP_DELIVERABLES: {fix: '正式代码不能 import deliverables/；把依赖改成正式路径', retest: '扫描无 E_DEP_DELIVERABLES'},
  E_DEP_FIXTURE_SOURCE: {fix: '候选源码依赖 demo/fixture/mock；改成真实模块或标为测试文件', retest: '扫描通过'},
  E_ABSOLUTE_PATH: {fix: '去掉硬编码绝对路径，用相对仓库根或配置项', retest: '扫描无 E_ABSOLUTE_PATH'},
  E_DELIVERY_MISSING: {fix: '补 DELIVERY.md（模板见 DELIVERY模板.md）', retest: 'check delivery 通过'},
  E_DELIVERY_STATUS: {fix: 'DELIVERY.md 加一行「状态：<枚举值>」，放在文件开头', retest: 'check 能读出状态'},
  E_DELIVERY_STATUS_VALUE: {fix: '状态用枚举值，不要自创词', retest: 'check 能读出合法状态'},
  E_DELIVERY_SECTION: {fix: '补齐四个段落：接入 / 证据 / 返工或决策 / 来源与边界', retest: 'check delivery 通过'},
  E_DELIVERY_EVIDENCE_TABLE: {fix: '证据表表头要有「场景ID」「证据类型」两列', retest: 'check 能解析证据表'},
  E_DELIVERY_EVIDENCE_TYPE: {fix: '证据类型必须是 9 种枚举之一（static/unit/host-integration/browser-real/engine-controlled/engine-natural/manual-observation/preview-fixture/unverified）', retest: 'check 能解析所有证据行'},
  E_EVIDENCE_TYPE: {fix: 'manifest.evidence[].type 用枚举值', retest: 'check manifest 通过'},
  E_EVIDENCE_HONESTY: {fix: '标了 unverified 就写 result=not-run；不许把没跑写成 pass', retest: '证据等级与 result 一致'},
  E_EVIDENCE_MISSING: {fix: 'evidence[].path 指向的证据文件不存在（包内/仓库内都找不到），补文件或改路径', retest: 'check 能打开每条证据'},
  E_GAPS_MISSING: {fix: '补 gaps.md，逐条列未做/未测，或明确写「无」', retest: 'check 通过'},
  E_GAPS_EMPTY: {fix: 'gaps.md 内容过短，等于没写', retest: 'check 通过'},
  E_GAPS_UNSTRUCTURED: {fix: 'gaps.md 用列表逐条写，或明确声明无缺口', retest: 'check 通过'},
  E_LINK_BROKEN: {fix: '文档里的相对链接指向不存在的文件，按行号修', retest: 'check links 通过'}
};

// 这些只是“这么写也行，但收包人要留个心”的信息，不该占返工单篇幅，作者也不用改。
const NO_ACTION = new Set([
  'W_MANIFEST_UNKNOWN_KEY',
  'W_MANIFEST_OBJECT_ENTRY',
  'W_MANIFEST_KIND',
  'W_EVIDENCE_SCENARIO',
  'W_DELIVERY_STATUS_LATE',
  'W_DELIVERY_BASELINE_LATE',
  'N_SCAN_SUPPRESSED',
  'N_SCAN_SKIPPED',
  'N_TARGET_SELF',
  'N_PATCH_GIT_INCONCLUSIVE',
  'N_DEP_FIXTURE_TEST',
  'N_LINK_IN_PACKAGE'
]);

const WARNING_GUIDE = {
  W_PATH_REPO_RELATIVE: 'candidate/evidence 路径请统一用包内相对（模板要求），现在写的是仓库相对',
  W_INPUT_NO_HASH: 'inputs[].sha256 留空就没法核对基线，补上',
  W_EVIDENCE_COMBINED: '一行证据写了好几种类型，拆成多行，收包时才核得清',
  W_DELIVERY_EVIDENCE_COMBINED: '证据表一行写了好几种类型，拆成多行',
  W_EVIDENCE_CONTRADICTION: '类型不是 unverified 却写 not-run，二者只能留一个说法',
  W_DELIVERY_NO_EVIDENCE: '证据表没有数据行；没跑就写一行 unverified/not-run',
  W_DELIVERY_PLACEHOLDER: '文档里还有 TODO/TBD/待补充',
  W_PATCH_WHOLE_FILE: '删除行数过多（像整文件重写），按 04 §3 拆成最小 patch',
  W_PATCH_OFFSET: '补丁能应用但有行偏移，合并时注意行号',
  W_PATCH_BINARY: '补丁含二进制内容；素材应只读复用，不走补丁',
  W_TARGET_READONLY_OVERRIDE: '写只读区已被显式放行，需主模型在 authorityEffects 里确认',
  W_DEP_FIXTURE: '非测试文件引用了 demo/fixture/mock，确认它不会被正式采用',
  W_REMOTE_IMPORT: '运行时远程依赖，离线发行会失败',
  W_PACKAGE_BIG_FILE: '包内带了大文件，大资源应只读复用而不是复制',
  W_PACKAGE_DIRTY: '包内出现 node_modules/.git 之类，交付目录不该带',
  W_LINK_OUTSIDE: '链接指向包外文件，收包时确认该文件已入库',
  W_DUPLICATE_RUNNER: '新测试请登记进既有 tests/run.mjs 的 groups 表，不要另起一个"跑全部"的入口（04 §3）',
  W_PATH_HAS_NOTE: '路径里夹了中文说明。落地后它就是文件名的一部分（扩展名不再是 .mjs，node 无法运行）。把说明挪到 notes/limitations，路径只留裸路径'
};

function hintOf(code) {
  return GUIDE[code] ?? {fix: '按错误码描述修正', retest: '重跑 check 通过'};
}

/**
 * 由一份体检报告生成返工条目。
 * 阻塞项逐条展开（作者必须改），提醒项只保留需要作者动手的，其余进 infoOnly。
 * @param {{packageId:string, report:object}} input
 */
export function buildTicket({packageId, report}) {
  const blocking = [];
  const reminders = [];
  const infoOnly = [];
  let seq = 0;

  for (const item of report.items ?? []) {
    if (item.severity === 'note') continue;
    if (item.severity === 'warning' && NO_ACTION.has(item.code)) {
      infoOnly.push({code: item.code, detail: item.message});
      continue;
    }
    seq += 1;
    const hint = hintOf(item.code);
    const entry = {
      id: `${packageId}-R${String(seq).padStart(2, '0')}`,
      code: item.code,
      file: item.file ?? null,
      line: item.line ?? null,
      detail: item.message,
      expected: item.expected ?? null,
      actual: item.actual ?? null,
      fix: WARNING_GUIDE[item.code] ?? hint.fix,
      retest: hint.retest
    };
    if (item.severity === 'error') blocking.push(entry);
    else reminders.push(entry);
  }

  return {
    packageId,
    generatedAt: new Date().toISOString(),
    baseCommit: report.facts?.actualHead ?? null,
    total: blocking.length + reminders.length,
    blocking: blocking.length,
    blockingItems: blocking,
    reminderItems: reminders,
    infoOnly,
    issues: [...blocking, ...reminders]
  };
}

export function renderTicket(ticket) {
  const lines = [];
  lines.push(`# ${ticket.packageId} 返工单`);
  lines.push('');
  lines.push(`- 生成时间：${ticket.generatedAt}`);
  lines.push(`- 仓库 HEAD：\`${ticket.baseCommit ?? '未知'}\``);
  lines.push(`- 阻塞 ${ticket.blocking} 条 · 提醒 ${ticket.reminderItems.length} 条${ticket.infoOnly.length ? ` · 另 ${ticket.infoOnly.length} 条信息项无需处理` : ''}`);
  lines.push('');
  lines.push('复现命令（在仓库根执行）：');
  lines.push('');
  lines.push('```bash');
  lines.push(`node deliverables/commercial-v6/CV6-17/src/cli.mjs check ${ticket.packageId}`);
  lines.push('```');
  lines.push('');

  if (!ticket.blocking) {
    lines.push('## 阻塞项');
    lines.push('');
    lines.push('无。本包当前可收。');
    lines.push('');
  } else {
    lines.push('## 阻塞项（必须改）');
    lines.push('');
    for (const issue of ticket.blockingItems) {
      const where = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '（见消息）';
      lines.push(`### ${issue.id} \`${issue.code}\``);
      lines.push('');
      lines.push(`- 位置：\`${where}\``);
      lines.push(`- 问题：${issue.detail}`);
      if (issue.expected !== null || issue.actual !== null) {
        lines.push(`- 期望：\`${JSON.stringify(issue.expected)}\` · 实际：\`${JSON.stringify(issue.actual)}\``);
      }
      lines.push(`- 怎么改：${issue.fix}`);
      lines.push(`- 改完重测：${issue.retest}`);
      lines.push('');
    }
  }

  if (ticket.reminderItems.length) {
    lines.push('## 提醒（建议改，不阻塞收包）');
    lines.push('');
    lines.push('| 位置 | 码 | 说明 |');
    lines.push('| --- | --- | --- |');
    for (const issue of ticket.reminderItems) {
      const where = issue.file ? `${issue.file}${issue.line ? `:${issue.line}` : ''}` : '—';
      lines.push(`| \`${where}\` | ${issue.code} | ${issue.fix} |`);
    }
    lines.push('');
  }

  lines.push('---');
  lines.push('');
  lines.push('改完把 `check` 通过的结果贴回 DELIVERY 证据表；17 收到后只重跑受影响项，不做全量复测。');
  return lines.join('\n') + '\n';
}

export function writeTickets(packageDir, tickets) {
  const dir = path.join(packageDir, 'rework');
  safeMkdir(packageDir, dir);
  const written = [];
  const keep = new Set(tickets.map((ticket) => `${ticket.packageId}.md`));
  // 清掉上一轮留下、这一轮已经不阻塞（或已不存在）的单子，避免读者看到过期结论。
  // Old reports are retained as history; avoid deleting unrelated/manual notes.
  for (const ticket of tickets) {
    const abs = path.join(dir, `${ticket.packageId}.md`);
    if (!/^CV6-\d{2}$/.test(ticket.packageId)) throw new Error('Invalid ticket package ID');
    safeWrite(packageDir, abs, renderTicket(ticket));
    written.push({package: ticket.packageId, path: path.relative(packageDir, abs).split(path.sep).join('/'), items: ticket.total});
  }
  return written;
}
