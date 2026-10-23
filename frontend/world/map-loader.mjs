// frontend/world/map-loader.mjs — 读取素材清单与地图 JSON，并把清单里的根路径解析成本页可用的 URL。
const SITE_ROOT = new URL("../../", import.meta.url);

export function assetUrl(path) {
  if (!path) return "";
  if (/^https?:|^data:|^blob:/.test(path)) return path;
  if (path.startsWith("/")) return new URL(path.slice(1), SITE_ROOT).href;
  return new URL(path, SITE_ROOT).href;
}

export function createMapLoader() {
  let manifest = null;
  const maps = new Map();
  const urls = {
    manifest: new URL("../../assets/frontend/manifest.json", import.meta.url).href,
  };

  async function loadManifest() {
    if (manifest) return manifest;
    const response = await fetch(urls.manifest, { cache: "no-cache" });
    if (!response.ok) throw new Error("读取素材清单失败：" + urls.manifest + " (" + response.status + ")");
    manifest = await response.json();
    return manifest;
  }

  async function loadMap(mapId) {
    if (maps.has(mapId)) return maps.get(mapId);
    await loadManifest();
    const path = manifest.maps && manifest.maps[mapId];
    if (!path) throw new Error("清单里没有地图 " + mapId);
    const response = await fetch(assetUrl(path), { cache: "no-cache" });
    if (!response.ok) throw new Error("读取地图失败：" + mapId);
    const data = await response.json();
    maps.set(mapId, data);
    return data;
  }

  return { loadManifest, loadMap, get manifest() { return manifest; }, urls };
}

/** 地图像素换算与可达性，前后端共用同一份 nav 数据。 */
export function tileAt(map, x, y) {
  const tx = Math.floor(x / map.tileSize);
  const ty = Math.floor(y / map.tileSize);
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return null;
  return { x: tx, y: ty, walkable: map.walkable[ty * map.width + tx] === 1 };
}

export function isWalkable(map, tx, ty) {
  if (tx < 0 || ty < 0 || tx >= map.width || ty >= map.height) return false;
  return map.walkable[ty * map.width + tx] === 1;
}

export function nearestInteraction(map, x, y, padding = 8) {
  let best = null;
  for (const interaction of map.interactions || []) {
    const dx = interaction.stand.x - x;
    const dy = interaction.stand.y - y;
    const distance = Math.hypot(dx, dy);
    const reach = (interaction.radius || 24) + padding;
    if (distance <= reach && (!best || distance < best.distance)) best = { interaction, distance };
  }
  return best;
}

export function exitAt(map, x, y) {
  for (const exit of map.exits || []) {
    const rect = exit.rect;
    if (x >= rect.x && x <= rect.x + rect.w && y >= rect.y && y <= rect.y + rect.h) return exit;
  }
  return null;
}
