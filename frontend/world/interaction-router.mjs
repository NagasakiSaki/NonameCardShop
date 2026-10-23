// frontend/world/interaction-router.mjs — 就近交互点判定与提示；只把"想交互"告诉 UI，不改变业务。
import { nearestInteraction, exitAt } from "./map-loader.mjs";

export function createInteractionRouter({ map, getMap, hintNode, onActivate, onExit }) {
  let current = null;
  let pending = null;
  let exitCooldownUntil = 0;
  const currentMap = () => (typeof getMap === "function" ? getMap() : map);

  function refresh(player) {
    if (!player) return null;
    const map = currentMap();
    const exit = exitAt(map, player.x, player.y);
    const near = nearestInteraction(map, player.x, player.y);
    const next = near ? near.interaction : null;
    if (next !== current) {
      current = next;
      if (hintNode) {
        if (next) {
          hintNode.hidden = false;
          hintNode.replaceChildren();
          const kbd = document.createElement("kbd");
          kbd.textContent = "E";
          hintNode.append(kbd, document.createTextNode(" " + next.label));
        } else {
          hintNode.hidden = true;
        }
      }
    }
    if (pending) {
      const reached = Math.hypot(pending.stand.x - player.x, pending.stand.y - player.y) < 22;
      if (reached) {
        const target = pending.interaction;
        pending = null;
        onActivate(target);
      }
    }
    // 出口触发带冷却：刚换房间落地时不会立刻被对面门口弹回去
    if (exit && exit.target && onExit && performance.now() > exitCooldownUntil) {
      const reachedExit = exit.seamlessEdge ? (exit.seamlessEdge==='east'?player.x>=map.width*16-6&&player.direction!=='left':player.x<=6&&player.direction!=='right') : Math.hypot(exit.fromTile.x * 16 + 8 - player.x, exit.fromTile.y * 16 + 8 - player.y) < 26;
      if (reachedExit) {
        exitCooldownUntil = performance.now() + 250;
        onExit(exit);
      }
    }
    return next;
  }

  function activateNearest() {
    if (current) onActivate(current);
    return current;
  }

  function walkThenActivate(interaction) {
    pending = { interaction, stand: interaction.stand };
  }

  /** 换房间后清掉旧地图上的交互与提示。 */
  function resetForMap() {
    current = null;
    pending = null;
    exitCooldownUntil = performance.now() + 250;
    if (hintNode) hintNode.hidden = true;
  }

  function clearPending() {
    pending = null;
  }

  return { refresh, activateNearest, walkThenActivate, clearPending, resetForMap, get current() { return current; }, get pending() { return pending; } };
}
