// frontend/ui/window-manager.mjs — 统一窗口管理：嵌套、Esc 关闭最上层、暂停令牌成对申请/释放。
import { el, clear, toast } from "./components.mjs";
import { normalizeQuery } from "../host/normalize.mjs";

export function createWindowManager({ host, mount, onChange } = {}) {
  const stack = [];
  let seq = 0;

  function notify() {
    if (typeof onChange === "function") onChange(stack.map((item) => item.id));
  }

  function closeTop() {
    const top = stack[stack.length - 1];
    if (top) top.handle.close();
  }

  function closeAll() {
    for (const item of [...stack].reverse()) item.handle.close();
  }

  function open({ id, title, subtitle, width = "", render, footer, onClose, pauseReason } = {}) {
    const key = id || "window-" + (seq += 1);
    const existing = stack.find((item) => item.id === key);
    if (existing) {
      existing.handle.focus();
      return existing.handle;
    }

    const currency = host.currency || { code: "GOLD", label: "金币", minorUnit: 1 };
    const cleanups = new Set();
    let lease = null;
    let leaseOk = false;
    let closed = false;
    let busy = false;

    const titleNode = el("h2", { class: "window__title", text: title || "窗口" });
    const subNode = el("span", { class: "window__sub", text: subtitle || "" });
    const body = el("div", { class: "window__body" });
    const foot = el("div", { class: "window__foot" });
    const note = el("p", { class: "small muted", style: { marginRight: "auto" }, text: "正在申请暂停令牌…" });

    const closeButton = el("button", { class: "btn btn--sm window__close", type: "button", text: "关闭 (Esc)" });
    const element = el("section", { class: "window " + width, role: "dialog", "aria-modal": "true", "aria-label": title || "窗口" }, [
      el("header", { class: "window__head" }, [titleNode, subNode, closeButton]),
      body,
      foot,
    ]);

    const handle = {
      id: key,
      element,
      get closed() { return closed; },
      focus() {
        element.style.outline = "2px solid rgba(232,182,74,0.4)";
        setTimeout(() => { element.style.outline = ""; }, 420);
      },
      refresh() {
        return renderContext.refresh();
      },
      close,
      setBusy(value) { busy = value; },
      canSubmit() { return leaseOk && !busy && !closed; },
      query(name, input) { return host.query(name, input).then((result) => normalizeQuery(name, result)); },
      command(input) { return submit(input); },
      onCleanup(fn) { cleanups.add(fn); },
      toast,
      currency,
    };

    async function submit(input) {
      if (busy) return { ok: false, error: { code: "BUSY", message: "上一个操作还没结束", retryable: true } };
      if (!leaseOk) return { ok: false, error: { code: "NOT_PAUSED", message: "世界尚未成功暂停，暂时不能提交", retryable: true } };
      busy = true;
      try {
        return await host.command(input);
      } finally {
        busy = false;
      }
    }

    const renderContext = {
      host,
      currency,
      handle,
      query: handle.query,
      submit,
      canSubmit: handle.canSubmit,
      body,
      foot,
      element,
      titleNode,
      subNode,
      note,
      render,
      canSubmit: handle.canSubmit,
      submit,
      toast,
      onCleanup: handle.onCleanup,
      setFooter(nodes) {
        clear(foot);
        foot.append(note);
        for (const node of [].concat(nodes || [])) if (node) foot.append(node);
      },
      async refresh() {
        clear(body);
        try {
          await render(renderContext);
        } catch (error) {
          console.error("[window] 渲染失败", error);
          body.append(el("p", { class: "small", style: { color: "#f0a08a" }, text: "窗口渲染失败：" + error.message }));
        }
      },
    };

    function close() {
      if (closed) return;
      closed = true;
      const index = stack.findIndex((item) => item.id === key);
      if (index >= 0) stack.splice(index, 1);
      for (const fn of cleanups) {
        try { fn(); } catch (error) { console.error("[window] 清理失败", error); }
      }
      cleanups.clear();
      element.remove();
      const releaseLease = lease
        ? host.pause.release(lease.leaseId).catch((error) => {
            toast("error", "暂停令牌释放失败", "经营世界由 Host 保持暂停：" + (error?.message || error));
          })
        : Promise.resolve();
      releaseLease.then(() => {
        if (typeof onClose === "function") onClose(handle);
        notify();
      });
    }

    closeButton.addEventListener("click", close);
    element.addEventListener("click", (event) => {
      if (event.target === element) handle.focus();
    });

    stack.push({ id: key, handle, title: title || key });
    mount.append(element);
    notify();

    // 暂停令牌：申请成功后才允许提交业务操作
    (async () => {
      try {
        lease = await host.pause.acquire({ ownerId: "window:" + key, reason: pauseReason || title || "打开窗口" });
        leaseOk = true;
        note.textContent = "经营世界已暂停";
        note.classList.add("muted");
      } catch (error) {
        leaseOk = false;
        note.textContent = "暂停失败，只能查看，不能提交";
        note.style.color = "#f0a08a";
        toast("error", "无法暂停经营世界", "只能查看数据；请关闭窗口后重试。" + (error?.message || ""));
      }
      if (typeof render === "function") await renderContext.refresh();
    })();

    return handle;
  }

  return { open, closeTop, closeAll, stack, get depth() { return stack.length; } };
}
