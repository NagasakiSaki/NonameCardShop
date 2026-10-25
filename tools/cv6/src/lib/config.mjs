// CV6-17 交付校验工具：全局常量、仓库根解析、只读/禁写分区。
// 本文件只读判断，不写任何路径。所有写入都经过 fs-safe.mjs 的 safeWrite()。
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * 向上找工作区根：要求同时存在 package.json 与 deliverables/。
 * 这样工具被采用到 tools/cv6/ 之后仍然指得回仓库根，不靠固定层数。
 */
function findRepoRoot(start) {
  let current = path.resolve(start);
  for (let depth = 0; depth < 8; depth += 1) {
    if (fs.existsSync(path.join(current, 'package.json')) && fs.existsSync(path.join(current, 'modules/backend/runtime.mjs'))) return current;
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
  return null;
}

export const DEFAULT_REPO_ROOT = process.env.CV6_REPO_ROOT
  ? path.resolve(process.env.CV6_REPO_ROOT)
  : findRepoRoot(here) ?? path.resolve(here, '..', '..', '..', '..');

// 交付包根：deliverables/commercial-v6/<CV6-XX>/
export const DELIVERY_ROOT_REL = 'deliverables/commercial-v6';

// 本包目录：默认按包号从仓库根推，也可用 CV6_PACKAGE_DIR 覆盖（工具被采用到 tools/ 后仍指得回来）。
export const PACKAGE_DIR = process.env.CV6_PACKAGE_DIR
  ? path.resolve(process.env.CV6_PACKAGE_DIR)
  : path.join(DEFAULT_REPO_ROOT, '.local', 'cv6');

// 任何包都不得写、也不得作为候选目标的位置。与 04 §2/§3 一致。
// hard：无例外，工具直接判错，不接受命令行覆盖。
export const HARD_FORBIDDEN = [
  '.git',
  'node_modules',
  '.local',
  'deliverables', // 正式代码不得反向依赖/覆盖交付目录
  'test-results',
  'dist',
  'build'
];

// readonly：本阶段只读的正式资产域。默认判错，可用 --allow-readonly=<zone> 显式放行并记入报告，
// 因为放行属于主模型/唯一合同所有者才有的权限，工具不自行裁决。
export const READONLY_ZONES = ['assets', 'vendor', 'data', 'contracts', 'desktop'];

// 玩家档/原图/存档相关目录名，出现在候选路径里一律拒绝。
export const PROTECTED_NAME_PATTERNS = [
  /^save$/i,
  /^saves$/i,
  /^savedata$/i,
  /^profile$/i,
  /^home$/i,
  /^\.home$/i
];

// 文本源码：可复制进 sandbox 的扩展名白名单（04 §2「文本源码复制」）。
export const TEXT_EXTENSIONS = new Set([
  '.mjs', '.js', '.cjs', '.mts', '.cts', '.ts', '.tsx', '.jsx',
  '.json', '.jsonc', '.md', '.txt', '.css', '.html', '.htm',
  '.yml', '.yaml', '.csv', '.map', '.sql'
]);

// 大资源：只读复用，绝不复制（04 §2「避免每包复制上 GB 文件」）。
// vendor/ 必须一起链接：引擎静态根是 vendor/noname（1.4G），不链接则 /noname/entry.js 直接 404。
export const LINK_ONLY_DIRS = ['assets', 'node_modules', 'vendor'];

// 默认纳入 sandbox 的正式源码目录（只复制其中的文本文件）。
export const DEFAULT_SOURCE_DIRS = [
  'modules', 'integration', 'contracts', 'data', 'dev', 'tests',
  'frontend', 'frontend-next', 'tools', 'scripts', 'docs'
];

// sandbox 里也需要的根级文本文件（存在才复制）。
export const ROOT_FILES = [
  'package.json', 'package-lock.json', 'server.mjs', 'index.html',
  'app.js', 'battle.js', 'shop-state.js', 'shop-business.js', 'shop-tasks.js'
];

export const LIMITS = {
  // 单文件 16MB：cards.json(7.5MB)/engine-manifest.json(2.2MB) 这类数据必须进 sandbox，
  // 否则 tools/ 下的测试根本跑不起来；再大的“文本”多半是生成物，跳过并登记。
  maxTextFileBytes: 16 * 1024 * 1024,
  maxCopiedBytes: 200 * 1024 * 1024, // sandbox 文本总量上限
  maxScanFileBytes: 1 * 1024 * 1024
};

// 证据类型枚举（05 §2 / 04 §7）。未测必须标 unverified，不得用“没报错”代替。
export const EVIDENCE_TYPES = [
  'static',
  'unit',
  'host-integration',
  'browser-real',
  'engine-controlled',
  'engine-natural',
  'manual-observation',
  'preview-fixture',
  'unverified'
];

// 包状态枚举（DELIVERY 模板 §1）。
export const PACKAGE_STATUS = [
  'contract-proposal',
  'candidate-only',
  'sandbox-integrated',
  'ready-for-review',
  'blocked'
];

export const PACKAGE_ID_PATTERN = /^CV6-\d{2}$/;
export const SCENARIO_ID_PATTERN = /^[A-Z]{1,3}\d{2}$/;

export function resolveRepoRoot(arg) {
  if (arg) return path.resolve(arg);
  if (process.env.CV6_REPO_ROOT) return path.resolve(process.env.CV6_REPO_ROOT);
  return DEFAULT_REPO_ROOT;
}

export function deliveryRoot(repoRoot) {
  return path.join(repoRoot, DELIVERY_ROOT_REL);
}
