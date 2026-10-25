// 两页内的审查摘要：主模型只读这一份就能决定「先收哪批、谁要返工、卡在哪」。
// 输入全部来自同一次运行产出的结构化结果，不额外判断好坏。
import fs from 'node:fs';
import path from 'node:path';
import {safeWrite} from './fs-safe.mjs';

const pad = (value, width) => String(value ?? '').padEnd(width);

export function renderSummary({audit, checks, tickets, decisions, head}) {
  const lines = [];
  const blocked = checks.filter((item) => !item.ok);

  lines.push('# CV6 集成审查摘要（CV6-17 生成）');
  lines.push('');
  lines.push(`- 仓库 HEAD：\`${head ?? '未知'}\``);
  lines.push(`- 生成时间：${new Date().toISOString()}`);
  lines.push(`- 包：${checks.length} 个，通过 ${checks.length - blocked.length}，阻塞 ${blocked.length}`);
  lines.push(`- 候选文件：${audit.fileCount} 个；已接线 ${audit.verdicts.wired}，未接线 ${audit.verdicts.inert}，落只读区 ${audit.verdicts.readonlyNew}`);
  lines.push('');

  lines.push('## 1. 谁能收、谁要返工');
  lines.push('');
  lines.push('| 包 | 状态 | 候选 | 阻塞项 | 提醒项 | 主要阻塞码 |');
  lines.push('| --- | --- | --- | --- | --- | --- |');
  for (const item of checks) {
    lines.push(
      `| ${item.packageId} | ${item.ok ? '可收' : '返工'} | ${item.files ?? '-'} | ${item.errors} | ${item.warnings} | ${(item.codes ?? []).slice(0, 3).join(', ') || '—'} |`
    );
  }
  lines.push('');

  lines.push('## 2. 候选落地后会怎样');
  lines.push('');
  lines.push(`- 已接线（正式代码里出现该路径）：**${audit.verdicts.wired}** 个`);
  lines.push(`- 未接线（落进去没人读，行为不会变）：**${audit.verdicts.inert}** 个`);
  lines.push(`- 落在只读区的新文件（需裁决 D1）：**${audit.verdicts.readonlyNew}** 个`);
  lines.push('');
  lines.push('| 批次 | 内容 | 文件数 | 涉及包 |');
  lines.push('| --- | --- | --- | --- |');
  for (const batch of audit.byBatch) {
    lines.push(`| 批 ${batch.batch} | ${batch.label} | ${batch.files} | ${batch.packages.join(', ') || '—'} |`);
  }
  lines.push('');
  const batch2 = audit.byBatch.find((batch) => batch.batch === 2);
  lines.push(
    `提交顺序按批次即可回退：批 1 工具/纯模块 → 批 2 权威接入 → 批 3 内容与文档。` +
      (batch2?.files ? `当前批 2 有 ${batch2.files} 个代码接入候选，合并前必须先跑受影响测试组。` : '当前批 2 为空（没有代码接入候选）。')
  );
  lines.push('');

  lines.push('## 3. 返工单');
  lines.push('');
  if (!tickets.length) {
    lines.push('无（没有包需要返工）。');
  } else {
    lines.push('| 包 | 条目 | 阻塞 | 文件 |');
    lines.push('| --- | --- | --- | --- |');
    for (const ticket of tickets) {
      lines.push(`| ${ticket.packageId} | ${ticket.total} | ${ticket.blocking} | rework/${ticket.packageId}.md |`);
    }
  }
  lines.push('');

  lines.push('## 4. 需主模型裁决（最小集）');
  lines.push('');
  if (!decisions.length) {
    lines.push('无。');
  } else {
    for (const item of decisions) lines.push(`- **${item.id}** ${item.title}：${item.ask}`);
  }
  lines.push('');

  lines.push('## 5. 建议下一步');
  lines.push('');
  lines.push('1. 先裁决 D1（`data/` 只读区放行权）——这是当前唯一挡住 3 个内容包的系统性问题。');
  lines.push('2. 对「批 1」里体检通过的包直接分批提交（当前只有 CV6-17、CV6-20 同批可用）。');
  lines.push('3. 阻塞包按 `rework/CV6-XX.md` 回原作者，修完 17 只重跑受影响项。');
  lines.push('4. 候选全部 inert：真正生效要等 21/22/23 的接线（运行器、编辑器、校验器）落地后重跑本审计。');
  return lines.join('\n') + '\n';
}

export function writeSummary(packageDir, content) {
  const abs = path.join(packageDir, 'review-summary.md');
  safeWrite(packageDir, abs, content);
  return abs;
}
