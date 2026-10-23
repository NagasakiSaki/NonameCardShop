// frontend/host/normalize.mjs — 把 Host 的返回整理成界面稳定依赖的形状。
// 正式 Host 与 Mock 在某些列表上返回 {items} 或裸数组；这里统一成 {items,total,nextCursor}，
// 并把任务的 goal/target 字段归一。任何"猜测业务字段"的逻辑都不放在这里。

const LIST_QUERIES = new Set([
  "catalog.list", "inventory.list", "products.list", "supplier.orders",
  "market.list", "tasks.list", "management.upgrades", "management.people",
  "management.orders", "saves.list", "combat.eligible", "config.list",
]);

function toList(data) {
  if (Array.isArray(data)) return { items: data, total: data.length, nextCursor: null };
  if (!data || typeof data !== "object") return { items: [], total: 0, nextCursor: null };
  const items = Array.isArray(data.items) ? data.items : Array.isArray(data.rows) ? data.rows : [];
  return {
    ...data,
    items,
    total: typeof data.total === "number" ? data.total : items.length,
    nextCursor: data.nextCursor ?? null,
  };
}

function normalizeTask(task) {
  const goal = Number(task.goal ?? task.target ?? 1) || 1;
  const progress = Number(task.progress ?? 0);
  return {
    ...task,
    title: task.title || task.name || task.taskId,
    goal,
    progress,
    completed: typeof task.completed === "boolean" ? task.completed : progress >= goal,
    unit: task.unit || "次",
    reward: Number(task.reward ?? 0),
    hint: task.hint || "走到对应柜台按 E 交互",
    target: task.guide || task.mapTarget || (typeof task.target === 'string' ? task.target : null),
  };
}

export function normalizeQuery(name, result) {
  if (!result || !result.ok) return result;
  let data = result.data;
  if (LIST_QUERIES.has(name)) {
    data = toList(data);
    if (name === "tasks.list") data.items = data.items.map(normalizeTask);
    if (name === "saves.list") {
      data.branches = Array.isArray(data.branches) && data.branches.length
        ? data.branches
        : [...new Set(data.items.map((row) => row.branch).filter(Boolean))];
    }
    if (name === "management.people") {
      data.neighbors = Array.isArray(data.neighbors) ? data.neighbors : [];
    }
    if (name === "combat.eligible") {
      data.slots = Number(data.slots) || (data.mode === "bo3" ? 1 : 3);
    }
  } else if (name === "room.snapshot") {
    data = { ...data, tables: Array.isArray(data && data.tables) ? data.tables : [], service: (data && data.service) || { fee: 0 } };
  } else if (name === "catalog.detail") {
    data = {
      ...data,
      skills: Array.isArray(data.skills) ? data.skills : [],
      holdings: data.holdings || { owned: 0, available: 0, protected: 0, listed: 0 },
      marketEligibility: data.marketEligibility || { eligible: false, reasons: [] },
      stats: data.stats || { kof: {}, bo3: {}, sampleSufficient: false, note: "实战样本不足" },
    };
  }
  return { ...result, data };
}
