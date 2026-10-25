// 哈希与可复现输入登记：manifest 的 inputs/files sha256 校验、sandbox 清单哈希。
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import * as cp from 'node:child_process';
import {toPosix} from './fs-safe.mjs';

export const SHA256_PATTERN = /^[0-9a-f]{64}$/;

export function sha256Text(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

export function sha256File(absPath) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    const stream = fs.createReadStream(absPath);
    stream.on('error', reject);
    stream.on('data', (chunk) => hash.update(chunk));
    stream.on('end', () => resolve(hash.digest('hex')));
  });
}

export function sha256FileSync(absPath) {
  const hash = crypto.createHash('sha256');
  const fd = fs.openSync(absPath, 'r');
  try {
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let read = 0;
    while ((read = fs.readSync(fd, buffer, 0, buffer.length, null)) > 0) hash.update(buffer.subarray(0, read));
  } finally {
    fs.closeSync(fd);
  }
  return hash.digest('hex');
}

/**
 * 目录清单哈希：对 (相对路径, 大小, sha256) 排序后整体哈希。
 * 用于证明“同一输入 → 同一 sandbox 内容”，而不是只比对时间戳。
 */
export async function hashTree(root, {filter} = {}) {
  const entries = [];
  const walk = async (dir) => {
    const items = fs.readdirSync(dir, {withFileTypes: true}).sort((a, b) => a.name.localeCompare(b.name));
    for (const item of items) {
      const abs = path.join(dir, item.name);
      if (item.isSymbolicLink()) {
        entries.push({path: toPosix(path.relative(root, abs)), kind: 'link'});
        continue;
      }
      if (item.isDirectory()) {
        await walk(abs);
        continue;
      }
      if (!item.isFile()) continue;
      if (filter && !filter(abs)) continue;
      const stat = fs.statSync(abs);
      entries.push({path: toPosix(path.relative(root, abs)), kind: 'file', size: stat.size, sha256: await sha256File(abs)});
    }
  };
  await walk(root);
  const digest = sha256Text(entries.map((e) => `${e.path}\t${e.kind}\t${e.size ?? ''}\t${e.sha256 ?? ''}`).join('\n'));
  return {entries, digest, count: entries.length};
}

export function gitHead(repoRoot) {
  try {
    return cp.execFileSync('git', ['rev-parse', 'HEAD'], {cwd: repoRoot, encoding: 'utf8', windowsHide: true}).trim();
  } catch {
    return null;
  }
}

/** 记录 dirty（含未跟踪），启动时如实登记，不 reset。 */
export function gitDirty(repoRoot) {
  try {
    const out = cp.execFileSync('git', ['status', '--porcelain'], {cwd: repoRoot, encoding: 'utf8', windowsHide: true});
    return out.split(/\r?\n/).filter(Boolean);
  } catch {
    return null;
  }
}
