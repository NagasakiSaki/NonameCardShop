// 极简 assert 垫片：Node 与浏览器双环境可用（避免 node:assert 在浏览器被 CORS 拦截）。
export function ok(cond, msg) { if (!cond) throw new Error(msg || "expected truthy"); }
export function equal(actual, expected, msg) { if (actual !== expected) throw new Error(msg || `expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`); }
export function match(value, re, msg) { if (!re.test(String(value))) throw new Error(msg || `expected ${String(value).slice(0, 80)} to match ${re}`); }
export default { ok, equal, match };
