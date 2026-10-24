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
let menuDispose=null,selection=null;
const menuBack=document.createElement('button');menuBack.className='btn';menuBack.textContent='返回存档选择';menuBack.hidden=true;document.querySelector('.boot__card').append(menuBack);

function showError(error) {
  window.__bootFailed = true;
  boot.hidden = false;
  appRoot.hidden = true;
  bootHint.textContent = "未能进入经营世界";
  bootError.hidden = false;
  const code = error instanceof HostConnectionError ? error.code : "BOOT_FAILED";
  bootError.textContent = "[" + code + "] " + (error?.message || String(error));
  retryButton.hidden = false;
  menuBack.hidden=mode.mode==='mock';
  console.error("[boot]", error);
}

async function boot0(input=selection||{}) {
  if (connecting) return;
  connecting = true;
  selection=input;menuBack.hidden=true;
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
    const session = await connectHost({ mode: mode.mode, fixture: mode.fixture,profileId:input.profileId });
    activeSession=session;
    const loadingLease=await session.host.pause.acquire({ownerId:'startup',reason:'准备进入卡店'});
    if(input.archiveId){const restored=await session.host.command({requestId:'menu-day-'+crypto.randomUUID(),type:'saves.loadDay',payload:{archiveId:input.archiveId}});if(!restored.ok)throw Error(restored.error.message);}
    const current=await session.host.query('shop.snapshot');if(!current.ok)throw Error(current.error.message);session.connection.initialSnapshot=current.data;session.connection.worldId=current.data.worldId;session.connection.branchId=current.data.branchId;session.connection.revision=current.data.revision;
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
    await session.host.pause.release(loadingLease.leaseId);
    window.__cardShopReady = true;
    window.__cardShopMode = session.mode;
    menuDispose?.();menuDispose=null;
    if(mode.mode==='host'){const url=new URL(location.href);url.searchParams.set('profile',input.profileId||'legacy');history.replaceState(null,'',url);}
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

async function openMenu(){
  window.__cardShopReady=false;window.__bootFailed=false;menuBack.hidden=true;retryButton.hidden=true;
  if(activeSession)await activeSession.host.pause.acquire({ownerId:'main-menu',reason:'返回主菜单'}).catch(()=>{});
  mounted?.destroy();mounted=null;await activeSession?.teardown();activeSession=null;window.__cardShopApp=null;selection=null;
  appRoot.hidden=true;boot.hidden=false;bootHint.textContent='正在读取卡店存档…';
  const url=new URL(location.href);url.searchParams.delete('profile');history.replaceState(null,'',url);
  try{const {showStartMenu}=await import('./ui/start-menu.mjs');menuDispose?.();menuDispose=await showStartMenu({onStart:boot0});boot.hidden=true;}catch(e){showError(e);}
}
window.__cardShopReturnToMenu=openMenu;menuBack.addEventListener('click',openMenu);
const requestedProfile=new URLSearchParams(location.search).get('profile');
if(mode.mode==='mock'||requestedProfile)boot0({profileId:requestedProfile||undefined});else openMenu();
window.addEventListener('pagehide',()=>activeSession?.teardown());
