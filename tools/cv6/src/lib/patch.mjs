// 补丁检查：候选补丁能不能真的落地、会落到哪里。
// 四道关：
//   1) 路径合法（不逃逸、不写盘符）；
//   2) 分区合法（禁写区/只读区/玩家档）；
//   3) 逐 hunk 与目标文件真实内容匹配 —— 自己算，不依赖 git 的模糊/跳过行为；
//   4) git apply --check 作为第二意见，只记结论（在仓库子目录里 git 会“Skipped”，不能当通过）。
import fs from 'node:fs';
import path from 'node:path';
import * as cp from 'node:child_process';
import {normalizeRel, classifyZone, safeWrite, assertWritable, isInside} from './fs-safe.mjs';

const DIFF_HEADER = /^diff --git a\/(.+?) b\/(.+)$/;
const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@/;

/** 解析 unified diff。返回 entries，每个含 hunks[{oldStart,oldCount,newStart,newCount,lines}] */
export function parsePatch(text) {
  const lines = text.split(/\r?\n/);
  const entries = [];
  let current = null;
  let hunk = null;

  const closeHunk = () => {
    if (hunk && current) current.hunks.push(hunk);
    hunk = null;
  };
  const closeEntry = () => {
    closeHunk();
    if (current) entries.push(current);
    current = null;
  };

  for (const line of lines) {
    const diff = DIFF_HEADER.exec(line);
    if (diff) {
      closeEntry();
      current = newEntry(diff[1], diff[2]);
      continue;
    }
    if (!current && /^--- /.test(line)) current = newEntry('', '');
    if (!current) continue;

    if (line.startsWith('--- ')) {
      const value = line.slice(4).split('\t')[0].trim();
      current.oldPath = value === '/dev/null' ? null : stripPrefix(value);
      current.isNew = value === '/dev/null';
      continue;
    }
    if (line.startsWith('+++ ')) {
      const value = line.slice(4).split('\t')[0].trim();
      current.newPath = value === '/dev/null' ? null : stripPrefix(value);
      current.isDelete = value === '/dev/null';
      continue;
    }
    if (/^GIT binary patch/.test(line) || /^Binary files /.test(line)) {
      current.binary = true;
      continue;
    }
    if (/^new file mode /.test(line)) {
      current.isNew = true;
      continue;
    }
    if (/^deleted file mode /.test(line)) {
      current.isDelete = true;
      continue;
    }
    const header = HUNK_HEADER.exec(line);
    if (header) {
      closeHunk();
      hunk = {
        oldStart: Number(header[1]),
        oldCount: header[2] === undefined ? 1 : Number(header[2]),
        newStart: Number(header[3]),
        newCount: header[4] === undefined ? 1 : Number(header[4]),
        lines: [],
        raw: line
      };
      continue;
    }
    if (hunk) {
      // 只接受三类行；空行按上下文空行处理（有些工具会剥掉前导空格）
      if (line.startsWith('+')) hunk.lines.push({type: '+', text: line.slice(1)});
      else if (line.startsWith('-')) hunk.lines.push({type: '-', text: line.slice(1)});
      else if (line.startsWith(' ')) hunk.lines.push({type: ' ', text: line.slice(1)});
      else if (line === '') continue; // patch 文件末尾空行
      else if (line.startsWith('\\')) continue; // "\ No newline at end of file"
      else hunk.lines.push({type: ' ', text: line});
    }
  }
  closeEntry();

  for (const entry of entries) {
    entry.removedLines = entry.hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === '-').length, 0);
    entry.addedLines = entry.hunks.reduce((sum, h) => sum + h.lines.filter((l) => l.type === '+').length, 0);
  }
  return {entries, binary: entries.some((entry) => entry.binary)};
}

function newEntry(oldPath, newPath) {
  return {
    oldPath: oldPath ? stripPrefix(oldPath) : oldPath,
    newPath: newPath ? stripPrefix(newPath) : newPath,
    hunks: [],
    binary: false,
    isNew: false,
    isDelete: false,
    removedLines: 0,
    addedLines: 0
  };
}

function stripPrefix(value) {
  return value.replace(/^[ab]\//, '');
}

function toLines(text) {
  const normalized = text.replace(/\r\n/g, '\n');
  const lines = normalized.split('\n');
  if (lines.length && lines[lines.length - 1] === '') lines.pop();
  return lines;
}

/**
 * 校验一个补丁条目能否应用到给定文本。
 * 返回 {ok, problems:[{code,hunk,line,expected,actual}], result:string, offset}
 */
export function matchEntry(entry, originalText) {
  const problems = [];
  const original = originalText === null ? null : toLines(originalText);

  if (entry.isNew) {
    if (original !== null && original.length && original.some((line) => line.length)) {
      problems.push({code: 'E_PATCH_NEW_EXISTS', message: '标为新增文件，但目标已存在且非空'});
      return {ok: false, problems};
    }
  } else if (original === null) {
    problems.push({code: 'E_PATCH_MISSING_FILE', message: `目标文件不存在：${entry.oldPath ?? entry.newPath}`});
    return {ok: false, problems};
  }

  let cursor = entry.isNew ? [] : [...(original ?? [])];
  let shift = 0;
  let maxOffset = 0;

  for (const [index, hunk] of entry.hunks.entries()) {
    const expectedOld = hunk.lines.filter((line) => line.type !== '+').map((line) => line.text);
    const replacement = hunk.lines.filter((line) => line.type !== '-').map((line) => line.text);
    if (expectedOld.length !== hunk.oldCount || replacement.length !== hunk.newCount) {
      problems.push({code:'E_PATCH_HUNK_SIZE',hunk:index+1,message:'hunk counts do not match its header'}); continue;
    }
    const anchor = entry.isNew ? 0 : Math.max(0, hunk.oldStart - 1 + shift);

    let foundAt = -1;
    if (!expectedOld.length) {
      foundAt = Math.min(anchor, cursor.length);
    } else {
      if (matchesAt(cursor, expectedOld, anchor)) foundAt = anchor;
      // 允许有限偏移（等价于 git 的 offset，不改变语义）
      for (let distance = 1; distance <= 50 && foundAt < 0; distance += 1) {
        if (matchesAt(cursor, expectedOld, anchor + distance)) {
          foundAt = anchor + distance;
          maxOffset = Math.max(maxOffset, distance);
          break;
        }
        if (matchesAt(cursor, expectedOld, anchor - distance)) {
          foundAt = anchor - distance;
          maxOffset = Math.max(maxOffset, distance);
          break;
        }
      }
      if (foundAt < 0) {
        const probe = cursor.slice(anchor, anchor + Math.max(1, expectedOld.length));
        problems.push({
          code: 'E_PATCH_CONTEXT',
          hunk: index + 1,
          message: `第 ${index + 1} 个 hunk 无法匹配目标内容（原文 ${hunk.oldStart} 行起）`,
          expected: expectedOld.slice(0, 3),
          actual: probe.slice(0, 3)
        });
        continue;
      }
    }
    cursor = [...cursor.slice(0, foundAt), ...replacement, ...cursor.slice(foundAt + expectedOld.length)];
    shift = foundAt - (hunk.oldStart - 1) + replacement.length - expectedOld.length;
  }

  return {ok: problems.length === 0, problems, result: cursor.join('\n') + '\n', offset: maxOffset};
}

function matchesAt(lines, block, start) {
  if (start < 0 || start + block.length > lines.length) return false;
  for (let index = 0; index < block.length; index += 1) {
    if (lines[start + index] !== block[index]) return false;
  }
  return true;
}

function runGitApplyCheck(patchAbs, cwd) {
  try {
    const out = cp.spawnSync('git', ['apply', '--check', '--whitespace=nowarn', patchAbs], {
      cwd,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
      windowsHide: true,
      env: {...process.env, GIT_CEILING_DIRECTORIES: path.dirname(path.resolve(cwd))}
    });
    const stderr = String(out.stderr ?? '') + String(out.stdout ?? '');
    if (/Skipped patch/i.test(stderr)) return {ok: null, message: 'git 在当前目录跳过了该路径，结论不可用'};
    if (out.error || out.status !== 0) return {ok:false,message:stderr || out.error?.message || `退出码 ${out.status}`};
    return {ok: true, message: ''};
  } catch (error) {
    const stderr = String(error.stderr ?? '').trim();
    if (/Skipped patch/i.test(stderr)) return {ok: null, message: 'git 在当前目录跳过了该路径，结论不可用'};
    return {ok: false, message: stderr || `退出码 ${error.status}`};
  }
}

/**
 * @param {import('./report.mjs').Report} report
 * @param {string} packageDir
 * @param {Array<string|{path:string}>} patches
 * @param {{targetRoot?:string, allowReadonly?:string[], maxRemovalRatio?:number, preview?:boolean}} options
 */
export function checkPatches(report, packageDir, patches, options = {}) {
  const before = report.errors.length;
  const targetRoot = options.targetRoot ?? report.repoRoot;
  const allowReadonly = options.allowReadonly ?? [];
  const maxRemovalRatio = options.maxRemovalRatio ?? 0.6;
  const previews = [];

  let applicable = 0;
  let touched = 0;

  for (const patch of patches) {
    const value = typeof patch === 'string' ? patch : patch?.path;
    if (typeof value !== 'string') continue;
    const abs = path.resolve(packageDir, value);
    normalizeRel(value);
    if (!fs.existsSync(abs) || !isInside(fs.realpathSync(abs), fs.realpathSync(packageDir)) || !fs.statSync(abs).isFile()) {
      report.error('E_PATCH_PATH', `补丁必须来自本包普通文件：${value}`, {file:value}); continue;
    }
    if (!fs.existsSync(abs)) continue; // manifest 检查已报缺失
    const text = fs.readFileSync(abs, 'utf8');
    if (text.includes('\\ No newline at end of file')) {report.error('E_PATCH_FORMAT','未实现无尾换行补丁的精确保真，需用 Git 单独接入',{file:value});continue;}
    const parsed = parsePatch(text);
    if (!parsed.entries.length) {
      report.error('E_PATCH_EMPTY', `补丁没有可解析的文件头（不是 unified diff）：${value}`, {file: value});
      continue;
    }
    if (parsed.binary) {
      report.error('E_PATCH_BINARY', `不支持二进制补丁：${value}`, {file:value}); continue;
    }

    let entryProblems = 0;
    for (const entry of parsed.entries) {
      if (!entry.hunks.length || (entry.oldPath && entry.newPath && entry.oldPath !== entry.newPath)) {
        report.error('E_PATCH_FORMAT', `不支持无文本 hunk 或重命名补丁：${value}`, {file:value}); entryProblems++; continue;
      }
      const rel = entry.newPath ?? entry.oldPath;
      touched += 1;
      if (!rel) {
        report.error('E_PATCH_PATH', `补丁条目缺少目标路径：${value}`, {file: value});
        entryProblems += 1;
        continue;
      }
      let normalized;
      try {
        normalized = normalizeRel(rel);
      } catch (error) {
        report.error('E_PATCH_PATH', `补丁路径非法（${error.message}）：${rel}`, {file: value});
        entryProblems += 1;
        continue;
      }
      const zone = classifyZone(normalized);
      if (zone?.kind === 'hard') {
        report.error('E_PATCH_FORBIDDEN', `补丁写入禁写区 ${zone.zone}：${normalized}`, {file: value});
        entryProblems += 1;
        continue;
      }
      if (zone?.kind === 'readonly' && !allowReadonly.includes(zone.zone)) {
        report.error('E_PATCH_READONLY', `补丁写只读区 ${zone.zone}：${normalized}（04 §2 只读）`, {file: value});
        entryProblems += 1;
        continue;
      }
      if (zone?.kind === 'readonly') {
        report.warn('W_PATCH_READONLY_OVERRIDE', `补丁写只读区 ${zone.zone}（已显式放行，需主模型裁决）：${normalized}`, {file: value});
      }
      if (zone?.kind === 'protected') {
        report.error('E_PATCH_PROTECTED', `补丁写玩家档/原图保护区：${normalized}`, {file: value});
        entryProblems += 1;
        continue;
      }

      const targetAbs = path.join(targetRoot, normalized);
      const exists = fs.existsSync(targetAbs) && fs.statSync(targetAbs).isFile();
      const original = exists ? fs.readFileSync(targetAbs, 'utf8') : null;

      if (!entry.isNew && !exists) {
        report.error('E_PATCH_MISSING_FILE', `补丁要修改的文件在目标目录不存在：${normalized}`, {file: value});
        entryProblems += 1;
        continue;
      }

      const match = matchEntry(entry, original);
      if (!match.ok) {
        entryProblems += 1;
        for (const problem of match.problems) {
          report.error(problem.code, `${value} → ${normalized}：${problem.message}`, {
            file: value,
            expected: problem.expected,
            actual: problem.actual
          });
        }
        continue;
      }
      if (match.offset > 0) {
        report.warn('W_PATCH_OFFSET', `补丁在 ${normalized} 上有 ${match.offset} 行偏移（内容仍匹配）`, {file: value});
      }

      if (original && original.split(/\r\n|\n/).length > 20) {
        const ratio = entry.removedLines / original.split(/\r\n|\n/).length;
        if (ratio > maxRemovalRatio) {
          report.warn(
            'W_PATCH_WHOLE_FILE',
            `补丁删除 ${entry.removedLines} 行（约 ${Math.round(ratio * 100)}%），疑似整文件覆盖：${normalized}（04 §3 要求最小 patch）`,
            {file: value}
          );
        }
      }

      previews.push({patch: value, target: normalized, content: match.result, isNew: entry.isNew, isDelete: entry.isDelete});
    }

    if (!entryProblems) applicable += 1;

    if (targetRoot && fs.existsSync(targetRoot)) {
      const git = runGitApplyCheck(abs, targetRoot);
      if (git.ok === false) {
        report.error('E_PATCH_NOT_APPLY', `git 明确拒绝该补丁（与逐 hunk 结果不一致，需人工看）：${value}\n${git.message}`, {file: value});
      } else if (git.ok === null) {
        report.note('N_PATCH_GIT_INCONCLUSIVE', `git apply 在 ${targetRoot} 未给出结论（子目录跳过），以逐 hunk 匹配为准：${value}`, {file: value});
      }
    }
  }

  report.facts.patches = patches.length;
  report.facts.patchesApplicable = applicable;
  report.facts.patchPathsTouched = touched;
  report.facts.patchPreviewFiles = previews.length;
  report.markCheck('patch', report.errors.length > before ? 'fail' : (patches.length ? 'pass' : 'empty'), {patches: patches.length});
  return {previews};
}

/** 把已校验的补丁内容写进 sandbox（唯一允许的落地位置）。 */
export function materializePatches(sandboxDir, previews) {
  const written = [];
  // Validate the whole batch before writing any of it; never follow a linked target.
  for (const preview of previews) assertWritable(sandboxDir, path.join(sandboxDir, normalizeRel(preview.target)));
  for (const preview of previews) {
    const abs = path.join(sandboxDir, preview.target);
    if (preview.isDelete) {
      if (fs.existsSync(abs)) fs.unlinkSync(abs);
      written.push({target: preview.target, action: 'delete'});
      continue;
    }
    safeWrite(sandboxDir, abs, preview.content);
    written.push({target: preview.target, action: preview.isNew ? 'create' : 'modify'});
  }
  return written;
}
