// markdown 链接检查：包内文档不能指向不存在的东西。
// 只查相对链接；http(s)/mailto 等外部链接不联网核对（离线环境，联网核对会产出不可信证据）。
import fs from 'node:fs';
import path from 'node:path';
import {toPosix} from './fs-safe.mjs';

const EXTERNAL = /^(?:https?:|mailto:|tel:|data:|javascript:)/i;

export function extractLinks(text) {
  const links = [];
  const lines = text.split(/\r?\n/);
  const inline = /!?\[[^\]]*\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g;
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\s{0,3}```/.test(line)) continue; // 代码块内的示例链接不算
    let match;
    inline.lastIndex = 0;
    while ((match = inline.exec(line)) !== null) {
      links.push({target: match[1], raw: match[0], line: index + 1});
    }
    const reference = /^\s{0,3}\[[^\]]+\]:\s*(\S+)/.exec(line);
    if (reference) links.push({target: reference[1], raw: reference[0], line: index + 1, reference: true});
  }
  return links;
}

export function checkLinks(report, packageDir, files) {
  let checked = 0;
  let broken = 0;
  const before = report.errors.length;

  for (const rel of files) {
    const abs = path.join(packageDir, rel);
    const text = fs.readFileSync(abs, 'utf8');
    for (const link of extractLinks(text)) {
      if (EXTERNAL.test(link.target)) continue;
      const target = link.target.split('#')[0].split('?')[0];
      if (!target) continue; // 纯锚点
      checked += 1;
      let decoded;
      try {
        decoded = decodeURIComponent(target);
      } catch {
        decoded = target;
      }
      const resolved = path.resolve(path.dirname(abs), decoded);
      if (!fs.existsSync(resolved)) {
        broken += 1;
        report.error('E_LINK_BROKEN', `${rel}:${link.line} 链接目标不存在：${link.target}`, {file: rel, line: link.line});
      } else {
        const relResolved = toPosix(path.relative(report.repoRoot ?? packageDir, resolved));
        if (!relResolved.startsWith('deliverables/') && !fs.existsSync(resolved)) {
          report.warn('W_LINK_OUTSIDE', `${rel}:${link.line} 链接指向包外文件（收包时需确认该文件已入库）：${link.target}`, {file: rel, line: link.line});
        }
      }
    }
  }

  report.facts.linksChecked = checked;
  report.facts.linksBroken = broken;
  report.markCheck('links', report.errors.length > before ? 'fail' : 'pass', {checked, broken});
}
