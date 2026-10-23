// frontend/scenes/world-scene.mjs — 一个可切换地图的 Phaser 场景：瓦片层、家具、角色、昼夜光、相机。
import { ensureAnims, ActorView } from "../world/actor-view.mjs";
import { LightingView } from "../world/lighting-view.mjs";

let CONTEXT = null;

export function setSceneContext(context) {
  CONTEXT = context;
}

function bakeLayers(scene, map) {
  const ts = map.tileSize;
  const width = map.width * ts;
  const height = map.height * ts;
  const rt = scene.add.renderTexture(0, 0, width, height).setOrigin(0, 0).setDepth(-1000);
  for (const layer of map.layers) {
    const data = layer.data;
    for (let y = 0; y < map.height; y += 1) {
      for (let x = 0; x < map.width; x += 1) {
        const index = data[y * map.width + x];
        if (index == null || index < 0) continue;
        rt.drawFrame("tiles", index, x * ts, y * ts);
      }
    }
  }
  return rt;
}

export function createWorldSceneClass() {
  return class WorldScene extends Phaser.Scene {
    constructor() {
      super("world");
    }

    init(data) {
      this.mapId = (data && data.mapId) || "store";
      this.zoom = (data && data.zoom) || 2;
      this.playerActorId = CONTEXT ? CONTEXT.getPlayerActorId() : "actor:owner";
      this.map = null;
      this.props = [];
      this.actorView = null;
      this.lighting = null;
      this.ready = false;
      this.lastInteractionRefresh = 0;
      this.router = (data && data.router) || null;
    }

    preload() {
      const { manifest, assetUrl } = CONTEXT;
      if (!this.textures.exists("tiles")) {
        this.load.spritesheet("tiles", assetUrl(manifest.tileset.image), { frameWidth: manifest.tileSize, frameHeight: manifest.tileSize });
      }
      if (!this.textures.exists("props")) {
        this.load.spritesheet("props", assetUrl(manifest.props.image), { frameWidth: manifest.props.cellSize, frameHeight: manifest.props.cellSize });
      }
      for (const [id, entry] of Object.entries(manifest.characters)) {
        const key = "char-" + id;
        if (!this.textures.exists(key)) {
          this.load.spritesheet(key, assetUrl(entry.sheet), { frameWidth: entry.frameWidth, frameHeight: entry.frameHeight });
        }
      }
      if (!this.textures.exists("glow")) this.load.image("glow", assetUrl(manifest.fx.lampGlow));
      if (!this.textures.exists("shadow")) this.load.image("shadow", assetUrl(manifest.fx.shadow));
    }

    create() {
      this.map = CONTEXT.getMap(this.mapId);
      if (!this.map) {
        this.add.text(16, 16, "地图 " + this.mapId + " 未加载", { color: "#f0a08a" });
        return;
      }
      ensureAnims(this, CONTEXT.manifest.characters);
      this.bake = bakeLayers(this, this.map);

      // 家具：按脚底 y 排序，遮挡关系由深度决定
      this.propSprites = [];
      const propIndex = new Map(CONTEXT.manifest.props.list.map((item) => [item.prop, item]));
      for (const prop of this.map.props || []) {
        const meta = propIndex.get(prop.prop);
        if (!meta) continue;
        const sprite = this.add.image(prop.x, prop.y, "props", meta.cell).setOrigin(0, 0);
        sprite.setDepth(prop.y + (prop.footY || meta.footY));
        this.propSprites.push(sprite);
      }

      this.actorView = new ActorView(this);
      const actors = CONTEXT.getActors().filter((actor) => !actor.roomId || actor.roomId === this.mapId);
      this.actorView.sync(actors, { playerActorId: this.playerActorId });
      this.lighting = new LightingView(this, this.map);

      const cam = this.cameras.main;
      cam.setBounds(0, 0, this.map.width * this.map.tileSize, this.map.height * this.map.tileSize);
      cam.setBackgroundColor("#0b0910");
      cam.setZoom(this.zoom || 2);
      const player = this.actorView.getSprite(this.playerActorId);
      if (player) {
        cam.startFollow(player, true, 0.16, 0.16);
        cam.centerOn(player.x, player.y);
      } else {
        cam.centerOn(this.map.spawn.x, this.map.spawn.y);
      }

      this.input.on("pointerdown", (pointer) => {
        if (CONTEXT.isBlocked()) return;
        const world = pointer.positionToCamera(cam);
        CONTEXT.onWorldClick(world.x, world.y);
      });

      this.ready = true;
      this.events.once("shutdown", () => this.destroyScene());
      CONTEXT.onSceneReady(this.mapId);
    }

    update(time, delta) {
      if (!this.ready) return;
      const actors = CONTEXT.getActors().filter((actor) => !actor.roomId || actor.roomId === this.mapId);
      this.actorView.sync(actors, { playerActorId: this.playerActorId });
      const playerSprite = this.actorView.getSprite(this.playerActorId);
      this.actorView.update(delta, playerSprite ? { x: playerSprite.x, y: playerSprite.y } : null);
      const snapshot = CONTEXT.getSnapshot();
      if (snapshot) this.lighting.update(snapshot.clock);
      const player = actors.find((actor) => actor.actorId === this.playerActorId) || CONTEXT.getActors().find((actor) => actor.actorId === this.playerActorId);
      if (player && time - this.lastInteractionRefresh > 120) {
        this.lastInteractionRefresh = time;
        CONTEXT.onPlayerMoved(player, this.map);
      }
    }

    destroyScene() {
      if (this.actorView) this.actorView.destroy();
      if (this.lighting) this.lighting.destroy();
    }
  };
}

/**
 * 只允许 1×/2×/3× 整数倍。取"铺满视口"的整数倍：
 * 视口比地图大时提高倍数，地图比视口大时用较小的整数倍让相机动起来。
 */
export function worldSceneZoom(width, height, mapWidth = 480, mapHeight = 320) {
  const cover = Math.max(Number(width) || 0, Number(height) || 0) > 0
    ? Math.max((Number(width) || 480) / mapWidth, (Number(height) || 320) / mapHeight)
    : 2;
  return Math.max(1, Math.min(3, Math.ceil(cover)));
}
