// 路径与写入安全：本工具所有落盘都必须经过这里。
// 两条硬规则（04 §2）：
//   1) 写入不得逃出本包目录（不写正式工程、不写别的包）；
//   2) 不得写 symlink/junction 的真实目标 —— 祖先里只要有链接，就拒绝写入。
import fs from 'node:fs';
import path from 'node:path';
import {HARD_FORBIDDEN, READONLY_ZONES, PROTECTED_NAME_PATTERNS} from './config.mjs';

export class PathViolation extends Error {
  constructor(code, message, detail = {}) {
    super(message);
    this.name = 'PathViolation';
    this.code = code;
    this.detail = detail;
  }
}

export function toPosix(value) {
  return String(value).split(path.sep).join('/');
}

/** 仓库内统一用 posix 相对路径，禁止绝对路径/盘符/UNC/.. 逃逸。 */
export function normalizeRel(input) {
  if (typeof input !== 'string' || !input.trim()) {
    throw new PathViolation('E_PATH_EMPTY', '路径为空');
  }
  const raw = input.trim();
  if (/^[a-zA-Z]:[\\/]/.test(raw)) throw new PathViolation('E_PATH_ABSOLUTE', `路径是盘符绝对路径：${raw}`);
  if (/^[\\/]/.test(raw)) throw new PathViolation('E_PATH_ABSOLUTE', `路径是绝对路径：${raw}`);
  if (/^\\\\/.test(raw)) throw new PathViolation('E_PATH_UNC', `路径是 UNC 路径：${raw}`);
  if (/^[a-z]+:/i.test(raw) && !/^\.\.?\//.test(raw)) {
    throw new PathViolation('E_PATH_SCHEME', `路径带协议前缀：${raw}`);
  }
  const posix = raw.replace(/\\/g, '/').replace(/^\.\//, '');
  const segments = posix.split('/');
  if (segments.some((s) => s === '..')) {
    throw new PathViolation('E_PATH_ESCAPE', `路径含 .. 逃逸：${raw}`);
  }
  if (segments.some((s) => s === '')) {
    throw new PathViolation('E_PATH_EMPTY_SEGMENT', `路径含空段：${raw}`);
  }
  if (segments.some(s => s === '.' || /[<>:"|?*\x00-\x1f]/.test(s) || /[. ]$/.test(s) || /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(s))) {
    throw new PathViolation('E_PATH_SEGMENT', `路径含不支持的文件名：${raw}`);
  }
  return segments.join('/');
}

export function isInside(child, parent) {
  const rel = path.relative(parent, child);
  return rel === '' || (!rel.startsWith('..') && !path.isAbsolute(rel));
}

/** 判断一个仓库相对路径是否落在禁写/只读分区；返回 {zone, severity} 或 null。 */
export function classifyZone(relPath) {
  const first = relPath.split('/')[0].toLowerCase();
  const lower = relPath.toLowerCase();
  if (HARD_FORBIDDEN.includes(first) || HARD_FORBIDDEN.some((z) => lower === z || lower.startsWith(`${z}/`))) {
    return {zone: first, severity: 'error', kind: 'hard'};
  }
  if (first === '.git' || lower.startsWith('.git/')) return {zone: '.git', severity: 'error', kind: 'hard'};
  if (READONLY_ZONES.includes(first)) return {zone: first, severity: 'error', kind: 'readonly'};
  const segments = relPath.split('/');
  if (segments.some((s) => PROTECTED_NAME_PATTERNS.some((re) => re.test(s)))) {
    return {zone: segments.find((s) => PROTECTED_NAME_PATTERNS.some((re) => re.test(s))), severity: 'error', kind: 'protected'};
  }
  return null;
}

/** 祖先里是否存在 symlink/junction（Windows 的 junction 在 lstat 里同样是 symlink）。 */
export function linkAncestors(target, stopAt) {
  const found = [];
  let current = path.resolve(target);
  const stop = path.resolve(stopAt);
  const guard = new Set();
  while (isInside(current, stop) && !guard.has(current)) {
    guard.add(current);
    let stat = null;
    try {
      stat = fs.lstatSync(current);
    } catch {
      stat = null;
    }
    if (stat && stat.isSymbolicLink()) found.push(current);
    if (current === stop) break;
    current = path.dirname(current);
  }
  return found;
}

/**
 * 唯一允许的写入出口。
 * 拒绝：目标逃出 root、路径段命中禁写区、祖先含链接。
 */
export function assertWritable(root, target, {label = '写入'} = {}) {
  const absRoot = path.resolve(root);
  const absTarget = path.resolve(target);
  if (!isInside(absTarget, absRoot)) {
    throw new PathViolation('E_WRITE_ESCAPE', `${label}目标逃出允许根：${absTarget}`);
  }
  const links = linkAncestors(absTarget, absRoot);
  if (links.length) {
    throw new PathViolation(
      'E_WRITE_THROUGH_LINK',
      `${label}目标位于链接下，拒绝写入其真实目标：${toPosix(path.relative(absRoot, links[0]))}`,
      {link: links[0], target: absTarget}
    );
  }
  if (fs.existsSync(absTarget)) {
    const stat = fs.lstatSync(absTarget);
    if (!stat.isFile() || stat.nlink > 1) throw new PathViolation('E_WRITE_TARGET', `${label}目标不是独占普通文件：${absTarget}`);
  }
  return absTarget;
}

export function safeWrite(root, target, data, options = {}) {
  const absTarget = assertWritable(root, target, options);
  fs.mkdirSync(path.dirname(absTarget), {recursive: true});
  fs.writeFileSync(absTarget, data);
  return absTarget;
}

export function safeMkdir(root, dir) {
  const absRoot = path.resolve(root);
  const absDir = path.resolve(dir);
  if (!isInside(absDir, absRoot)) throw new PathViolation('E_WRITE_ESCAPE', `目录逃出允许根：${absDir}`);
  const links = linkAncestors(absDir, absRoot);
  if (links.length) {
    throw new PathViolation('E_WRITE_THROUGH_LINK', `目录位于链接下，拒绝创建：${absDir}`);
  }
  fs.mkdirSync(absDir, {recursive: true});
  return absDir;
}

/** 只读判断：不会写入，因此允许穿过链接（reads 走真实文件是合法的）。 */
export function readText(absPath, maxBytes) {
  const stat = fs.statSync(absPath);
  if (maxBytes && stat.size > maxBytes) return {text: null, skipped: 'too-large', size: stat.size};
  return {text: fs.readFileSync(absPath, 'utf8'), size: stat.size};
}

export function exists(absPath) {
  try {
    fs.lstatSync(absPath);
    return true;
  } catch {
    return false;
  }
}

export function isDirectory(absPath) {
  try {
    return fs.statSync(absPath).isDirectory();
  } catch {
    return false;
  }
}
