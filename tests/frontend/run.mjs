// tests/frontend/run.mjs — 前端独立测试入口（不修改根 tests/run.mjs 与根依赖脚本）。
// 用法：node tests/frontend/run.mjs [assets|mock|ui|all]
import { spawnSync } from "node:child_process";
import path from "node:path";

const target = process.argv[2] || "all";
const suites = {
  assets: "tests/frontend/assets.mjs",
  mock: "tests/frontend/mock-smoke.mjs",
  ui: "tests/frontend/ui-smoke.mjs",
};
const selected = target === "all" ? Object.keys(suites) : [target];
let failed = 0;
for (const key of selected) {
  const file = suites[key];
  if (!file) {
    console.error("未知套件：" + key);
    failed += 1;
    continue;
  }
  console.log("\n=== " + key + " ===");
  const result = spawnSync(process.execPath, [path.resolve(file)], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}
console.log("\n" + (failed ? failed + " 个套件失败" : "全部套件通过"));
if (failed) process.exitCode = 1;
