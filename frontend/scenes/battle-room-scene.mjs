// frontend/scenes/battle-room-scene.mjs — 对战房场景入口（同一套世界渲染，换地图与交互点）。
import { createWorldSceneClass } from "./world-scene.mjs";

export const BattleRoomMapId = "battle-room";

export function createBattleRoomScene() {
  return createWorldSceneClass();
}
