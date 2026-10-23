// frontend/world/movement-view.mjs — 键盘/触屏/点击输入 → Host 的移动意图（视觉插值不在这里）。
const KEY_DIRS = {
  ArrowUp: "up", ArrowDown: "down", ArrowLeft: "left", ArrowRight: "right",
  KeyW: "up", KeyS: "down", KeyA: "left", KeyD: "right",
};

export function createMovementView({ host, sessionId, getRoom, isBlocked, onManualMove }) {
  let inputSeq = 0;
  let activeDirection = null;
  const pressed = new Set();
  let lastSent = 0;

  function send(payload) {
    if (isBlocked() && !payload.stop) return;
    const room = getRoom();
    inputSeq += 1;
    host.world.input({
      sessionId,
      inputSeq,
      roomId: room.mapId,
      navVersion: room.navVersion || "",
      ...payload,
    });
  }

  function currentDirection() {
    // 固定优先级：最近按下优先，避免斜向抖动
    const order = [...pressed];
    return order.length ? order[order.length - 1] : null;
  }

  function onKeyDown(event) {
    const target = event.target;
    if (target && (target.tagName === "INPUT" || target.tagName === "TEXTAREA" || target.tagName === "SELECT" || target.isContentEditable)) return;
    const direction = KEY_DIRS[event.code];
    if (!direction) return;
    event.preventDefault();
    if (isBlocked()) return;
    pressed.delete(direction);
    pressed.add(direction);
    if (typeof onManualMove === "function") onManualMove();
    if (activeDirection !== direction) {
      activeDirection = direction;
      send({ direction });
    }
  }

  function onKeyUp(event) {
    const direction = KEY_DIRS[event.code];
    if (!direction) return;
    pressed.delete(direction);
    if (activeDirection === direction) {
      const next = currentDirection();
      activeDirection = next;
      if (next) send({ direction: next });
      else send({ stop: true });
    }
  }

  function releaseAll() {
    pressed.clear();
    activeDirection = null;
    send({ stop: true });
  }

  function moveTo(x, y) {
    send({ destination: { x: Math.round(x), y: Math.round(y) } });
  }

  // 触屏方向键
  function bindTouchpad(container) {
    const layout = [
      [null, "up", null],
      ["left", null, "right"],
      [null, "down", null],
    ];
    const labels = { up: "▲", down: "▼", left: "◀", right: "▶" };
    container.replaceChildren();
    for (const row of layout) {
      for (const dir of row) {
        if (!dir) {
          container.append(document.createElement("span"));
          continue;
        }
        const button = document.createElement("button");
        button.type = "button";
        button.textContent = labels[dir];
        button.setAttribute("aria-label", "向" + (dir === "up" ? "上" : dir === "down" ? "下" : dir === "left" ? "左" : "右") + "走");
        button.addEventListener("pointerdown", (event) => {
          event.preventDefault();
          if (isBlocked()) return;
          pressed.add(dir);
          activeDirection = dir;
          send({ direction: dir });
        });
        const up = () => {
          pressed.delete(dir);
          if (activeDirection === dir) {
            activeDirection = currentDirection();
            if (activeDirection) send({ direction: activeDirection });
            else send({ stop: true });
          }
        };
        button.addEventListener("pointerup", up);
        button.addEventListener("pointercancel", up);
        button.addEventListener("pointerleave", up);
        container.append(button);
      }
    }
    const coarse = window.matchMedia && window.matchMedia("(pointer: coarse)").matches;
    container.hidden = !coarse;
  }

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);
  window.addEventListener("blur", releaseAll);
  const onVisibility=() => {
    if (document.hidden) releaseAll();
  };
  document.addEventListener("visibilitychange",onVisibility);

  return {
    destroy(){releaseAll();window.removeEventListener('keydown',onKeyDown);window.removeEventListener('keyup',onKeyUp);window.removeEventListener('blur',releaseAll);document.removeEventListener('visibilitychange',onVisibility);},
    stop: releaseAll,
    moveTo,
    releaseAll,
    bindTouchpad,
    bindPointer(scene, { onWorldClick }) {
      scene.input.on("pointerdown", (pointer) => {
        if (isBlocked()) return;
        const world = pointer.positionToCamera(scene.cameras.main);
        onWorldClick(world.x, world.y);
      });
    },
  };
}
