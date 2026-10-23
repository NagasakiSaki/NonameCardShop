// frontend/scenes/store-scene.mjs — 主店场景入口（具体实现共享 world-scene）。
import { createWorldSceneClass } from "./world-scene.mjs";

export const StoreMapId = "store";

export function createStoreScene() {
  return createWorldSceneClass();
}
