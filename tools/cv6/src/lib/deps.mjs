// 反向依赖扫描：04 §2「正式采用文件不反向 import deliverables/demo/fixture」。
// 只做静态判定，不执行被扫代码。测试与自身工具可以合法用 fixture，因此按文件角色分级。
import fs from 'node:fs';
import path from 'node:path';
import {normalizeRel, toPosix, isInside} from './fs-safe.mjs';
import {LIMITS, TEXT_EXTENSIONS} from './config.mjs';

const IMPORT_PATTERNS = [
  /(?:^|[^\w$])import\s+(?:[\w*{}\s,$]+\s+from\s+)?['"]([^'"]+)['"]/g,
  /(?:^|[^\w$])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|[^\w$])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g,
  /(?:^|[^\w$])export\s+\*\s+from\s+['"]([^'"]+)['"]/g
];

// 只看代码类文件；md/css 里的示例不算依赖。
const CODE_EXT = new Set(['.mjs', '.js', '.cjs', '.mts', '.cts', '.ts', '.tsx', '.jsx']);

function isTestRole(rel) {
  return /(^|\/)tests?\//.test(rel) || /\.(test|spec)\.[a-z]+$/i.test(rel);
}

function isDemoOrFixtureSpecifier(spec) {
  return /(^|\/)(demo|demos|fixtures?|mock|mocks|__mocks__|experiments)\//i.test(spec);
}

export function scanFile(absPath, relToRoot) {
  const findings = [];
  let text;
  try {
    const stat = fs.statSync(absPath);
    if (stat.size > LIMITS.maxScanFileBytes) return {findings, skipped: 'too-large', size: stat.size};
    text = fs.readFileSync(absPath, 'utf8');
  } catch {
    return {findings, skipped: 'unreadable'};
  }
  if (text.includes('\u0000')) return {findings, skipped: 'binary'};

  // 抑制标记：测试夹具里必须写"故意违规的字符串"，不能因此把作者自己的测试判死。
  // 标记必须是独占一行的注释（避免把说明文字/正则源码里的示例当成真标记）。
  // 用了标记必须留痕（report 里出 N_SCAN_SUPPRESSED），主模型一眼能看到谁用了豁免。
  const MARKER = /^\s*(?:\/\/+|\/\*+|#)\s*cv6-scan:\s*(ignore-file|ignore-next|ignore-line)\b/;
  const lines = text.split(/\r?\n/);
  const markers = lines.map((line) => (MARKER.exec(line) ?? [])[1]).filter(Boolean);
  if (markers.includes('ignore-file')) return {findings, suppressed: 'file'};

  const suppressedLines = new Set();
  for (let index = 0; index < lines.length; index += 1) {
    const kind = (MARKER.exec(lines[index]) ?? [])[1];
    if (kind === 'ignore-next') suppressedLines.add(index + 2); // 标记的下一行
    if (kind === 'ignore-line') suppressedLines.add(index + 1);
  }

  for (let index = 0; index < lines.length; index += 1) {
    if (suppressedLines.has(index + 1)) continue;
    const line = lines[index];
    for (const pattern of IMPORT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(line)) !== null) {
        findings.push({specifier: match[1], line: index + 1, file: relToRoot, column: match.index + 1});
      }
    }
    // 硬编码绝对路径：换机就崩，且常伴随读取用户目录。
    const winPath = /['"]((?:[a-zA-Z]:\\[^'"]+)|(?:\/(?:home|Users)\/[^'"]+))['"]/.exec(line);
    if (winPath) findings.push({specifier: winPath[1], line: index + 1, file: relToRoot, absolute: true});
  }
  // 去重（同一行同一说明符会被多个正则命中）
  const seen = new Set();
  return {
    findings: findings.filter((item) => {
      const key = `${item.line}:${item.specifier}:${item.absolute ? 'abs' : 'imp'}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
  };
}

/**
 * @param {import('./report.mjs').Report} report
 * @param {string} repoRoot
 * @param {string[]} relFiles 相对 repoRoot 的文件路径
 * @param {{sourceRole?:boolean}} options sourceRole=true 表示这些文件是要进正式工程的代码，从严
 */
export function checkDependencies(report, repoRoot, relFiles, options = {}) {
  const before = report.errors.length;
  let scanned = 0;
  let findings = 0;
  const suppressedFiles = [];

  for (const rel of relFiles) {
    const abs = path.join(repoRoot, rel);
    if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
    if (!CODE_EXT.has(path.extname(rel).toLowerCase())) continue;
    scanned += 1;
    const result = scanFile(abs, rel);
    if (result.skipped) {
      report.note('N_SCAN_SKIPPED', `跳过扫描（${result.skipped}）：${rel}`, {file: rel});
      continue;
    }
    if (result.suppressed) {
      suppressedFiles.push(rel);
      report.note('N_SCAN_SUPPRESSED', `该文件声明了扫描豁免（cv6-scan: ignore-file），需人工确认豁免理由：${rel}`, {file: rel});
      continue;
    }
    const testFile = isTestRole(rel);
    for (const finding of result.findings) {
      findings += 1;
      if (finding.absolute) {
        report.error('E_ABSOLUTE_PATH', `硬编码绝对路径，换机即失效：${finding.specifier}`, {file: rel, line: finding.line});
        continue;
      }
      const spec = finding.specifier;
      if (/^(?:https?:|node:)/.test(spec)) {
        if (/^https?:/.test(spec)) {
          report.warn('W_REMOTE_IMPORT', `运行时远程依赖，离线发行会失败：${spec}`, {file: rel, line: finding.line});
        }
        continue;
      }
      if (/(^|\/)deliverables\//.test(spec) || /(^|[\\/])deliverables[\\/]/.test(spec)) {
        report.error(
          'E_DEP_DELIVERABLES',
          `正式代码反向依赖交付目录：${spec}（04 §2 禁止；候选必须落到正式路径）`,
          {file: rel, line: finding.line}
        );
        continue;
      }
      if (isDemoOrFixtureSpecifier(spec)) {
        if (testFile) {
          report.note('N_DEP_FIXTURE_TEST', `测试引用 demo/fixture（可接受）：${spec}`, {file: rel, line: finding.line});
        } else if (options.sourceRole) {
          report.error('E_DEP_FIXTURE_SOURCE', `候选源码依赖 demo/fixture/mock：${spec}`, {file: rel, line: finding.line});
        } else {
          report.warn('W_DEP_FIXTURE', `非测试文件引用 demo/fixture/mock：${spec}`, {file: rel, line: finding.line});
        }
        continue;
      }
      // 相对说明符解析后是否越出仓库
      if (spec.startsWith('.')) {
        const resolved = path.resolve(path.dirname(abs), spec);
        if (!isInside(resolved, repoRoot)) {
          report.error('E_DEP_ESCAPE', `相对依赖越出仓库：${spec}`, {file: rel, line: finding.line});
        }
      }
    }
  }

  report.facts.depFilesScanned = scanned;
  report.facts.depFindings = findings;
  report.facts.depSuppressedFiles = suppressedFiles;
  report.markCheck('deps', report.errors.length > before ? 'fail' : 'pass', {scanned, findings, suppressed: suppressedFiles.length});
}
