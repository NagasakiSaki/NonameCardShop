// frontend/host/host-loader.mjs — 唯一的 Host 入口。正式缺失时抛错，绝不静默切 Mock。
const CLIENT_KEY = "noname-card-shop-frontend-preview:clientId";

export class HostConnectionError extends Error {
  constructor(code, message, cause) {
    super(message);
    this.name = "HostConnectionError";
    this.code = code;
    this.cause = cause;
  }
}

function stableClientId() {
  try {
    const existing = sessionStorage.getItem(CLIENT_KEY);
    if (existing) return existing;
    const id = crypto.randomUUID();
    sessionStorage.setItem(CLIENT_KEY, id);
    return id;
  } catch {
    // 隐私模式下 storage 不可用：本次页面会话内仍保持同一个 id
    if (!globalThis.__cardShopClientId) globalThis.__cardShopClientId = crypto.randomUUID();
    return globalThis.__cardShopClientId;
  }
}

export function readMode(params = new URLSearchParams(location.search)) {
  const mode = params.get("mode") === "mock" ? "mock" : "host";
  const fixture = params.get("fixture") || "store-day";
  const scene = params.get("scene") === "battle-room" ? "battle-room" : "store";
  return { mode, fixture, scene };
}

async function loadFactory({ mode, fixture, profileId }) {
  if (mode === "mock") {
    let module;
    try {
      module = await import("../mock/mock-host.mjs");
    } catch (error) {
      throw new HostConnectionError("MOCK_UNAVAILABLE", "前端演示 Host 加载失败：" + error.message, error);
    }
    if (typeof module.createMockHost !== "function") {
      throw new HostConnectionError("MOCK_UNAVAILABLE", "mock-host.mjs 未导出 createMockHost", null);
    }
    return module.createMockHost({ fixture });
  }
  let module;
  try {
    // 正式 Host 由主模型提供；本前端只做动态导入，失败即报错。
    module = await import("/integration/frontend-host.mjs");
  } catch (error) {
    throw new HostConnectionError(
      "HOST_UNAVAILABLE",
      "未找到正式经营接口 /integration/frontend-host.mjs。\n如果你是在预览界面，请改用 ?mode=mock&fixture=store-day。",
      error,
    );
  }
  if (typeof module.createHost !== "function") {
    throw new HostConnectionError("CONTRACT_MISMATCH", "正式 Host 未导出 createHost()", null);
  }
  return module.createHost({profileId});
}

/**
 * 载入并连接 Host。返回 { host, connection, mode, fixture, clientId, teardown }。
 * clientId 在整个页面会话内复用，重试连接不会新建身份。
 */
export async function connectHost({ mode, fixture, profileId }) {
  const clientId = stableClientId();
  const host = await loadFactory({ mode, fixture, profileId });
  let connection;
  const input = { contractVersion: "card-shop-ui/1.0", clientId };
  try {
    connection = await host.connect(input);
  } catch (error) {
    await host.disconnect().catch(()=>{});
    throw new HostConnectionError("CONNECT_FAILED", "连接经营世界失败：" + (error?.message || error), error);
  }
  if (!connection || connection.contractVersion !== "card-shop-ui/1.0") {
    throw new HostConnectionError(
      "CONTRACT_MISMATCH",
      "契约版本不一致：需要 card-shop-ui/1.0，实际为 " + String(connection?.contractVersion),
      null,
    );
  }
  return {
    host,
    connection,
    mode,
    fixture,
    clientId,
    teardown: async () => {
      try {
        await host.disconnect();
      } catch (error) {
        console.warn("[host] disconnect 失败", error);
      }
    },
  };
}
