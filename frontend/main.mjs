// frontend/main.mjs — 唯一入口：解析模式、连接 Host、挂载外壳、错误与重试。
import { readMode, connectHost, HostConnectionError } from "./host/host-loader.mjs";

const boot = document.getElementById("boot");
const bootHint = document.getElementById("boot-hint");
const bootError = document.getElementById("boot-error");
const retryButton = document.getElementById("boot-retry");
const appRoot = document.getElementById("app");

const mode = readMode();
let mounted = null;
let connecting = false;
let activeSession=null;

function showError(error) {
  window.__bootFailed = true;
  boot.hidden = false;
  appRoot.hidden = true;
  bootHint.textContent = "未能进入经营世界";
  bootError.hidden = false;
  const code = error instanceof HostConnectionError ? error.code : "BOOT_FAILED";
  bootError.textContent = "[" + code + "] " + (error?.message || String(error));
  retryButton.hidden = false;
  console.error("[boot]", error);
}

async function boot0() {
  if (connecting) return;
  connecting = true;
  retryButton.hidden = true;
  bootError.hidden = true;
  boot.hidden = false;
  appRoot.hidden = true;
  bootHint.textContent = mode.mode === "mock"
    ? "正在载入前端演示世界（" + mode.fixture + "）…"
    : "正在连接正式经营接口…";
  try {
    if(mounted){mounted.destroy();mounted=null;}
    await activeSession?.teardown();activeSession=null;
    const session = await connectHost({ mode: mode.mode, fixture: mode.fixture });
    activeSession=session;
    bootHint.textContent = "正在准备像素店面…";
    // 先让外壳参与布局，Phaser 才能拿到真实的画布尺寸（启动页仍盖在上面）
    appRoot.hidden = false;
    const { startApp } = await import("./app-shell.mjs");
    // scene 参数支持 ?scene=battle-room 直接进入对战房
    mounted = await startApp({
      host: session.host,
      connection: session.connection,
      mode: session.mode,
      fixture: session.fixture,
      teardown: session.teardown,
    });
    boot.hidden = true;
    appRoot.hidden = false;
    window.__cardShopReady = true;
    window.__cardShopMode = session.mode;
  } catch (error) {
    await activeSession?.teardown();activeSession=null;
    showError(error);
  } finally {
    connecting = false;
  }
}

retryButton.addEventListener("click", () => {
  window.__bootFailed = false;
  boot0();
});

window.addEventListener("error", (event) => {
  if (!window.__cardShopReady) return;
  console.error("[runtime]", event.error || event.message);
});

boot0();
window.addEventListener('pagehide',()=>activeSession?.teardown());
