// 可复现 sandbox：只复制文本源码，GB 级资源用 junction 只读复用。
// 硬约束（04 §2）：
//   · 不复制 assets/desktop/node_modules 等大资源，只建链接；
//   · 所有写入走 safeWrite()，祖先含链接即拒绝 —— 不会写穿到真实资源；
//   · 生成 sandbox.json 记录每个文件的哈希，任何人可重建并比对。
import fs from 'node:fs';
import path from 'node:path';
import {
  TEXT_EXTENSIONS,
  LIMITS,
  LINK_ONLY_DIRS,
  DEFAULT_SOURCE_DIRS,
  ROOT_FILES
} from './config.mjs';
import {PACKAGE_DIR} from './config.mjs';
import {safeWrite, safeMkdir, normalizeRel, linkAncestors, toPosix, isInside, PathViolation} from './fs-safe.mjs';
import {hashTree, sha256FileSync, sha256Text} from './hash.mjs';

function isTextFile(name) {
  return TEXT_EXTENSIONS.has(path.extname(name).toLowerCase());
}

function copyTextTree({from, to, rel, budget, records, skipped}) {
  let items;
  try {
    items = fs.readdirSync(from, {withFileTypes: true});
  } catch {
    return;
  }
  for (const item of items) {
    const src = path.join(from, item.name);
    const dst = path.join(to, item.name);
    const relPath = `${rel}/${item.name}`;
    if (item.isSymbolicLink()) {
      skipped.push({path: relPath, reason: 'source-link'});
      continue;
    }
    if (item.isDirectory()) {
      if (['node_modules', '.git', '.local', 'test-results'].includes(item.name)) {
        skipped.push({path: relPath, reason: 'excluded-dir'});
        continue;
      }
      // sandbox 是新建的空目录，此时还没有任何链接，故可直接创建子目录；
      // 真正需要防写穿的是建链接之后的写入（见 safeWrite）。
      fs.mkdirSync(dst, {recursive: true});
      copyTextTree({from: src, to: dst, rel: relPath, budget, records, skipped});
      continue;
    }
    if (!item.isFile()) continue;
    if (!isTextFile(item.name)) {
      skipped.push({path: relPath, reason: 'non-text'});
      continue;
    }
    const stat = fs.statSync(src);
    if (stat.size > LIMITS.maxTextFileBytes) {
      skipped.push({path: relPath, reason: 'over-file-limit', size: stat.size});
      continue;
    }
    if (budget.used + stat.size > LIMITS.maxCopiedBytes) {
      skipped.push({path: relPath, reason: 'over-total-limit'});
      continue;
    }
    fs.mkdirSync(path.dirname(dst), {recursive: true});
    fs.copyFileSync(src, dst);
    budget.used += stat.size;
    records.push({path: relPath, size: stat.size, sha256: sha256FileSync(src)});
  }
}

/**
 * 创建 sandbox。dest 必须在本包目录内（不写别的包、不写正式工程）。
 * @param {{repoRoot:string, packageDir:string, name?:string, sourceDirs?:string[], linkDirs?:string[], force?:boolean}} options
 */
export function createSandbox(options) {
  const {repoRoot, packageDir} = options;
  const name = options.name ?? 'sandbox';
  if (!/^[a-zA-Z0-9_-]{1,64}$/.test(name)) throw new PathViolation('E_SANDBOX_NAME', 'sandbox name must be a single safe directory name');
  const dest = path.join(packageDir, 'sandbox', name);
  if (!isInside(dest, packageDir)) {
    throw new PathViolation('E_SANDBOX_ESCAPE', `sandbox 必须位于本包目录内：${dest}`);
  }
  const sourceDirs = options.sourceDirs ?? DEFAULT_SOURCE_DIRS;
  const linkDirs = options.linkDirs ?? LINK_ONLY_DIRS;
  for (const dir of sourceDirs) {
    normalizeRel(dir);
    if (!DEFAULT_SOURCE_DIRS.some(base => dir === base || dir.startsWith(base + '/'))) throw new PathViolation('E_SANDBOX_SOURCE', `不允许复制状态目录：${dir}`);
  }
  for (const dir of linkDirs) {
    if (!LINK_ONLY_DIRS.includes(dir)) throw new PathViolation('E_SANDBOX_LINK_DIR', `不允许共享可写状态目录：${dir}`);
  }
  if (linkAncestors(dest, path.resolve(packageDir)).length) throw new PathViolation('E_WRITE_THROUGH_LINK', 'sandbox path contains a link');
  let retired = null;

  if (fs.existsSync(dest)) {
    if (!options.force) throw new PathViolation('E_SANDBOX_EXISTS', `sandbox 已存在，如需重建请加 --force：${dest}`);
    // 不用批量删除：本机宿主对“单轮 ≥50 个删除”有确认拦截，重建会半途失败留下脏目录。
    // 改成一次 rename 退役，旧目录留在旁边由 --purge 或人工清理。
    retired = `${dest}.old-${Date.now()}`;
    fs.renameSync(dest, retired);
  }
  safeMkdir(packageDir, dest);
  fs.mkdirSync(path.join(dest, '.local'), {recursive: true});

  const startedAt = new Date().toISOString();
  const budget = {used: 0};
  const copied = [];
  const skipped = [];
  const links = [];

  for (const dir of sourceDirs) {
    const src = path.join(repoRoot, dir);
    if (!fs.existsSync(src) || !fs.statSync(src).isDirectory()) continue;
    const dst = path.join(dest, dir);
    fs.mkdirSync(dst, {recursive: true});
    copyTextTree({from: src, to: dst, rel: dir, budget, records: copied, skipped});
  }

  for (const file of ROOT_FILES) {
    const src = path.join(repoRoot, file);
    if (!fs.existsSync(src) || !fs.statSync(src).isFile()) continue;
    fs.copyFileSync(src, path.join(dest, file));
    copied.push({path: file, size: fs.statSync(src).size, sha256: sha256FileSync(src)});
  }

  for (const dir of linkDirs) {
    const src = path.join(repoRoot, dir);
    if (!fs.existsSync(src)) continue;
    const dst = path.join(dest, dir);
    try {
      fs.symlinkSync(src, dst, 'junction');
      links.push({path: dir, target: src, kind: 'junction'});
    } catch (error) {
      links.push({path: dir, target: src, kind: 'failed', error: error.message});
    }
  }

  const manifest = {
    schemaVersion: 1,
    kind: 'cv6-sandbox',
    name,
    createdAt: startedAt,
    repoRoot,
    sandboxDir: dest,
    retiredPrevious: retired,
    sourceDirs,
    linkDirs: links.map((link) => link.path),
    copiedBytes: budget.used,
    copiedCount: copied.length,
    copied,
    links,
    skipped,
    notes: [
      '文本源码为物理副本，改动不会回到正式工程。',
      'assets/node_modules/vendor 为共享 junction；工具写入受保护，但任意被运行代码不受 OS 隔离，必须先审查。',
      '.local 为独立空目录，不共享玩家数据、缓存或发布仓库。',
      '重建用同一命令加 --force，并比对 copied[].sha256 与 digest。'
    ]
  };
  manifest.digest = sha256Text(copied.map((file) => `${file.path}\t${file.sha256}`).join('\n'));
  safeWrite(packageDir, path.join(dest, 'sandbox.json'), JSON.stringify(manifest, null, 2));
  return {dir: dest, manifest};
}

/**
 * 删目录：只删链接本身，不递归进 junction 的真实目标。
 * 注意本机宿主可能拦截“单轮 ≥50 个删除”（SAFE_DELETE_BULK_CONFIRM_REQUIRED），
 * 这时会抛 E_SANDBOX_PURGE_BLOCKED —— 这是环境策略，不是工具 bug，不要在工具里绕过。
 */
export function removeSandbox(dest, allowedRoot = PACKAGE_DIR) {
  dest = path.resolve(dest); allowedRoot = path.resolve(allowedRoot);
  if (!isInside(dest, allowedRoot) || dest === allowedRoot || linkAncestors(dest, allowedRoot).length) throw new PathViolation('E_SANDBOX_ESCAPE', 'refusing to remove an unowned or linked directory');
  const items = fs.readdirSync(dest, {withFileTypes: true});
  for (const item of items) {
    const abs = path.join(dest, item.name);
    try {
      if (item.isSymbolicLink()) fs.unlinkSync(abs);
      else if (item.isDirectory()) removeSandbox(abs, allowedRoot);
      else fs.unlinkSync(abs);
    } catch (error) {
      if (/SAFE_DELETE|EPERM|EBUSY/.test(String(error.message) + String(error.code))) {
        throw new PathViolation('E_SANDBOX_PURGE_BLOCKED', `删除被宿主策略拦截（${error.code ?? 'SAFE_DELETE'}）：${abs}`);
      }
      throw error;
    }
  }
  fs.rmdirSync(dest);
}

/** 列出可清理的退役目录（*.old-*），供 --purge 逐步清理或人工处理。 */
export function listRetired(packageDir) {
  const boxRoot = path.join(packageDir, 'sandbox');
  if (!fs.existsSync(boxRoot)) return [];
  return fs
    .readdirSync(boxRoot, {withFileTypes: true})
    .filter((item) => item.isDirectory() && /\.old-\d+$/.test(item.name))
    .map((item) => path.join(boxRoot, item.name));
}

/**
 * 验证 sandbox 没有被写穿：
 *   1) 每个 junction 的真实目标里没有晚于创建时间的新文件；
 *   2) 每个文本副本仍与来源一致（说明没被就地改动，或改动已被发现）。
 */
export async function verifySandbox({repoRoot, sandboxDir, since}) {
  const problems = [];
  let threshold = since ? new Date(since).getTime() : null;
  const manifestPath = path.join(sandboxDir, 'sandbox.json');

  let manifest = null;
  if (fs.existsSync(manifestPath)) {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    threshold ??= Date.parse(manifest.createdAt);
  } else {
    problems.push({code: 'E_SANDBOX_MANIFEST', message: 'sandbox.json 缺失，无法核对'});
  }

  for (const link of manifest?.links ?? []) {
    if (link.kind !== 'junction') {
      problems.push({code: 'E_SANDBOX_LINK', message: `链接创建失败：${link.path}（${link.error ?? ''}）`});
      continue;
    }
    const walk = (dir) => {
      let items;
      try {
        items = fs.readdirSync(dir, {withFileTypes: true});
      } catch {
        return;
      }
      for (const item of items) {
        const abs = path.join(dir, item.name);
        if (item.isSymbolicLink()) continue;
        if (item.isDirectory()) {
          walk(abs);
          continue;
        }
        const stat = fs.statSync(abs);
        if (stat.mtimeMs > threshold) {
          problems.push({code: 'E_SANDBOX_LINK_WRITE', message: `写入穿透到只读资源：${abs}`, mtime: stat.mtime.toISOString()});
        }
      }
    };
    walk(link.target);
  }

  let drift = 0;
  for (const file of manifest?.copied ?? []) {
    const abs = path.join(sandboxDir, file.path);
    if (!fs.existsSync(abs)) {
      problems.push({code: 'E_SANDBOX_MISSING_COPY', message: `副本缺失：${file.path}`});
      continue;
    }
    if (sha256FileSync(abs) !== file.sha256) drift += 1;
  }

  return {
    ok: problems.length === 0,
    problems,
    drift,
    copiedChecked: manifest?.copied?.length ?? 0,
    linksChecked: (manifest?.links ?? []).length,
    checkedAt: new Date().toISOString()
  };
}

/** 从 sandbox 读回文本（相对 sandbox 根），供工具做静态检查而不碰正式工程。 */
export function readSandboxFile(dest, rel) {
  const abs = path.join(dest, rel);
  if (!isInside(abs, dest)) throw new PathViolation('E_SANDBOX_ESCAPE', `读取越界：${rel}`);
  return fs.readFileSync(abs, 'utf8');
}

export {toPosix};
