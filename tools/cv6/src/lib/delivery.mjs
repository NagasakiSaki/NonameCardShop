// DELIVERY.md / gaps.md 结构与证据诚实性校验。
// 目的不是评分，而是让主模型只读一份文件就能判断：现状、边界、证据等级、未测项。
import fs from 'node:fs';
import path from 'node:path';
import {PACKAGE_STATUS, EVIDENCE_TYPES} from './config.mjs';

const REQUIRED_SECTIONS = [
  {key: '接入', patterns: [/^##\s*.*接入/, /^##\s*接入/]},
  {key: '证据', patterns: [/^##\s*.*证据/]},
  {key: '返工或决策', patterns: [/^##\s*.*返工/, /^##\s*.*决策/]},
  {key: '来源与边界', patterns: [/^##\s*.*来源/]}
];

function readIfExists(packageDir, name) {
  const abs = path.join(packageDir, name);
  if (!fs.existsSync(abs)) return null;
  return {text: fs.readFileSync(abs, 'utf8'), abs, rel: name};
}

/** 解析 markdown 表格：返回 {header, rows:[{cells, line}]} */
export function parseTables(text) {
  const lines = text.split(/\r?\n/);
  const tables = [];
  let current = null;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    const isRow = /^\s*\|.*\|\s*$/.test(line);
    if (!isRow) {
      if (current) {
        tables.push(current);
        current = null;
      }
      continue;
    }
    const cells = line.trim().slice(1, -1).split('|').map((cell) => cell.trim());
    if (!current) {
      current = {header: cells, rows: [], line: index + 1};
      continue;
    }
    if (/^\s*\|[\s:|-]+\|\s*$/.test(line)) continue; // 分隔行
    current.rows.push({cells, line: index + 1});
  }
  if (current) tables.push(current);
  return tables;
}

export function checkDeliveryDoc(report, packageDir) {
  const before = report.errors.length;

  const delivery = readIfExists(packageDir, 'DELIVERY.md');
  if (!delivery) {
    report.error('E_DELIVERY_MISSING', '缺少 DELIVERY.md（04 §7 必交）', {file: 'DELIVERY.md'});
  } else {
    const lines = delivery.text.split(/\r?\n/);
    // 状态行：模板要求在文件头，但真实包常写成 `- **状态**：`candidate-only``。允许 markdown 强调符号。
    const statusPattern = /(?:状态|交付状态|status)[\s*_`]*[：:][\s*_`]*([a-z][a-z-]+)/i;
    const wholeMatch = statusPattern.exec(delivery.text);
    const headText = lines.slice(0, 60).join('\n');
    const headMatch = statusPattern.exec(headText);
    if (!wholeMatch) {
      report.error('E_DELIVERY_STATUS', 'DELIVERY.md 全文都没有「状态：」，无法判断交付等级', {file: 'DELIVERY.md'});
    } else if (!PACKAGE_STATUS.includes(wholeMatch[1].toLowerCase())) {
      report.error(
        'E_DELIVERY_STATUS_VALUE',
        `状态必须是 ${PACKAGE_STATUS.join('/')}，实际 ${wholeMatch[1]}`,
        {file: 'DELIVERY.md'}
      );
    } else {
      report.facts.deliveryStatus = wholeMatch[1].toLowerCase();
      if (!headMatch) {
        report.warn('W_DELIVERY_STATUS_LATE', '状态行不在文件开头 60 行内，收包人容易漏看', {file: 'DELIVERY.md'});
      }
    }

    if (!/(基线|HEAD|baseCommit)/i.test(delivery.text)) {
      report.error('E_DELIVERY_BASELINE', 'DELIVERY.md 全文未记录基线 HEAD', {file: 'DELIVERY.md'});
    } else if (!/(基线|HEAD|baseCommit)/i.test(headText)) {
      report.warn('W_DELIVERY_BASELINE_LATE', '基线 HEAD 不在开头 60 行内', {file: 'DELIVERY.md'});
    }

    for (const section of REQUIRED_SECTIONS) {
      const found = lines.some((line) => section.patterns.some((re) => re.test(line)));
      if (!found) report.error('E_DELIVERY_SECTION', `DELIVERY.md 缺少模板要求的段落：${section.key}`, {file: 'DELIVERY.md'});
    }

    const tables = parseTables(delivery.text);
    const evidenceTable = tables.find((table) => table.header.some((cell) => /场景\s*ID/i.test(cell)) && table.header.some((cell) => /证据类型/.test(cell)));
    if (!evidenceTable) {
      report.error('E_DELIVERY_EVIDENCE_TABLE', 'DELIVERY.md 缺少证据表（表头需含「场景ID」「证据类型」）', {file: 'DELIVERY.md'});
    } else {
      const typeIndex = evidenceTable.header.findIndex((cell) => /证据类型/.test(cell));
      const idIndex = evidenceTable.header.findIndex((cell) => /场景\s*ID/i.test(cell));
      let badTypes = 0;
      let unverified = 0;
      for (const row of evidenceTable.rows) {
        const type = (row.cells[typeIndex] ?? '').replace(/`/g, '').trim();
        const id = (row.cells[idIndex] ?? '').trim();
        if (!id && !type) continue;
        const parts = type.split(/[+/、,，]/).map((part) => part.trim()).filter(Boolean);
        if (type && (!parts.length || parts.some((part) => !EVIDENCE_TYPES.includes(part)))) {
          badTypes += 1;
          report.error('E_DELIVERY_EVIDENCE_TYPE', `证据表第 ${row.line} 行类型不在枚举内：${type}`, {file: 'DELIVERY.md', line: row.line});
        } else if (parts.length > 1) {
          report.warn('W_DELIVERY_EVIDENCE_COMBINED', `证据表第 ${row.line} 行合并了多种证据：${type}`, {file: 'DELIVERY.md', line: row.line});
        }
        if (parts.includes('unverified')) unverified += 1;
      }
      report.facts.deliveryEvidenceRows = evidenceTable.rows.length;
      report.facts.deliveryUnverifiedRows = unverified;
      report.facts.deliveryBadTypes = badTypes;
      if (!evidenceTable.rows.length) {
        report.warn('W_DELIVERY_NO_EVIDENCE', '证据表没有数据行：本阶段若无证据应明确写 unverified/not-run', {file: 'DELIVERY.md'});
      }
    }

    if (/\bTODO\b|\bTBD\b|待补充/.test(delivery.text)) {
      report.warn('W_DELIVERY_PLACEHOLDER', 'DELIVERY.md 仍含 TODO/TBD/待补充 占位', {file: 'DELIVERY.md'});
    }
    report.facts.deliveryBytes = Buffer.byteLength(delivery.text);
  }

  const gaps = readIfExists(packageDir, 'gaps.md');
  if (!gaps) {
    report.error('E_GAPS_MISSING', '缺少 gaps.md（04 §7 必交）', {file: 'gaps.md'});
  } else {
    const text = gaps.text.trim();
    if (text.length < 20) {
      report.error('E_GAPS_EMPTY', 'gaps.md 内容过短，无法作为缺口记录', {file: 'gaps.md'});
    }
    // 缺口要么逐条列，要么明确“无”。不允许留空泛表态。
    const declaresNone = /无(未)?(已知)?(缺口|阻塞)|没有(已知)?(缺口|阻塞)/.test(text);
    const hasList = /^\s*([-*]|\d+\.)\s+\S/m.test(text);
    if (!declaresNone && !hasList) {
      report.error('E_GAPS_UNSTRUCTURED', 'gaps.md 既没有列表项，也没有明确声明「无缺口」', {file: 'gaps.md'});
    }
  }

  report.markCheck('delivery', report.errors.length > before ? 'fail' : 'pass');
}
