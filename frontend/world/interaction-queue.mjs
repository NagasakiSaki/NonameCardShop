// frontend/world/interaction-queue.mjs — 一次只记一个“被打断的交互意图”。
//
// 场景对话会在玩家走向柜台/牌桌的途中主动弹出。此时点击意图已经发生，
// 但窗口不能在对话之上打开。以前这个意图被直接丢掉：玩家到达站位后
// handleInteraction 被调用一次，openPanel 因为 v7.blocked 返回 null，
// 对话结束后没有任何补救，玩家必须重新点一次。
//
// 这里把“记住 / 取回 / 丢弃”拆成纯逻辑，便于单测：
//   - 仍被挡（对话或窗口还在）→ 保留，等下一次；
//   - 换了世界或分支 → 丢弃，绝不跨档重放；
//   - 可以执行 → 取回并清空，只执行一次。
export function createInteractionQueue({branchOf = null} = {}) {
  let pending = null;
  const branch = () => (typeof branchOf === 'function' ? branchOf() : null);

  function push(interaction, { branch: at } = {}) {
    if (!interaction) return false;
    pending = { interaction, branch: at ?? branch() };
    return true;
  }

  function take({ blocked = false, branch: now } = {}) {
    if (!pending) return { status: 'empty' };
    if (blocked) return { status: 'blocked' };
    const current = now ?? branch();
    if (pending.branch !== null && current !== null && pending.branch !== current) {
      pending = null;
      return { status: 'stale' };
    }
    const interaction = pending.interaction;
    pending = null;
    return { status: 'ready', interaction };
  }

  return {
    push,
    take,
    clear() { pending = null; },
    get pending() { return pending; },
  };
}
