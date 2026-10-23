// frontend/world/actor-view.mjs — 角色显示：帧动画、朝向、平滑插值、脚下阴影与 y 排序。
const DIRECTIONS = { down: 0, left: 1, right: 2, up: 3 };
const WALK_COLUMNS = [0, 1, 2, 1];

export function ensureAnims(scene, characters) {
  for (const [id, entry] of Object.entries(characters)) {
    for (const [direction, row] of Object.entries(DIRECTIONS)) {
      const walkKey = "walk-" + id + "-" + direction;
      if (!scene.anims.exists(walkKey)) {
        scene.anims.create({
          key: walkKey,
          frames: WALK_COLUMNS.map((col) => ({ key: "char-" + id, frame: row * 3 + col })),
          frameRate: 7,
          repeat: -1,
        });
      }
      const idleKey = "idle-" + id + "-" + direction;
      if (!scene.anims.exists(idleKey)) {
        scene.anims.create({
          key: idleKey,
          frames: [{ key: "char-" + id, frame: row * 3 + entry.idleColumn }],
          frameRate: 1,
          repeat: -1,
        });
      }
    }
  }
}

export class ActorView {
  constructor(scene) {
    this.scene = scene;
    this.sprites = new Map();
  }

  sync(actors, { playerActorId } = {}) {
    const seen = new Set();
    for (const actor of actors) {
      const appearance=this.scene.textures.exists('char-'+actor.appearanceId)?actor.appearanceId:'passerby';
      seen.add(actor.actorId);
      let entry = this.sprites.get(actor.actorId);
      if (!entry) {
        const shadow = this.scene.add.image(actor.x, actor.y, "shadow").setDepth(actor.y - 1).setAlpha(0.55);
        const sprite = this.scene.add.sprite(actor.x, actor.y, "char-" + appearance, 1);
        sprite.setOrigin(12 / 24, 30 / 32);
        sprite.setDepth(actor.y);
        entry = { sprite, shadow, targetX: actor.x, targetY: actor.y, direction: actor.direction, moving: actor.moving, label: null };
        this.sprites.set(actor.actorId, entry);
        {
          entry.label = this.scene.add.text(actor.x, actor.y - 34, actor.label || '', {
            fontFamily: '"Microsoft YaHei", sans-serif',
            fontSize: "9px",
            color: "#f6e6b8",
            backgroundColor: "rgba(20,15,26,0.72)",
            padding: { left: 3, right: 3, top: 1, bottom: 1 },
          }).setOrigin(0.5, 1).setDepth(9000).setAlpha(0);
        }
      }
      entry.targetX = actor.x;
      entry.targetY = actor.y;
      entry.direction = actor.direction;
      entry.moving = actor.moving;
      entry.activity = actor.activity;
      if(entry.label){entry.label.setText(actor.label || '');entry.label.setVisible(!!actor.label);}
      const anim = (actor.moving ? "walk-" : "idle-") + appearance + "-" + (DIRECTIONS[actor.direction] == null ? "down" : actor.direction);
      if (entry.sprite.anims.currentAnim?.key !== anim) entry.sprite.play(anim, true);
      if (actor.actorId === playerActorId) entry.sprite.setDepth(actor.y + 1);
    }
    for (const [id, entry] of this.sprites) {
      if (seen.has(id)) continue;
      entry.sprite.destroy();
      entry.shadow.destroy();
      if (entry.label) entry.label.destroy();
      this.sprites.delete(id);
    }
  }

  update(dt, playerPosition) {
    const lerp = Math.min(1, dt * 0.018);
    for (const [id, entry] of this.sprites) {
      const { sprite, shadow } = entry;
      const dx = entry.targetX - sprite.x;
      const dy = entry.targetY - sprite.y;
      const distance = Math.hypot(dx, dy);
      if (distance > 72) {
        sprite.setPosition(entry.targetX, entry.targetY);
      } else if (distance > 0.35) {
        sprite.x += dx * lerp;
        sprite.y += dy * lerp;
      } else {
        sprite.setPosition(entry.targetX, entry.targetY);
      }
      sprite.setDepth(sprite.y);
      shadow.setPosition(sprite.x, sprite.y + 1);
      shadow.setDepth(sprite.y - 2);
      if (entry.label) {
        entry.label.setPosition(sprite.x, sprite.y - 33);
        const near = playerPosition ? Math.hypot(sprite.x - playerPosition.x, sprite.y - playerPosition.y) < 58 : true;
        entry.label.setAlpha(Phaser.Math.Linear(entry.label.alpha, near ? 0.95 : 0, 0.16));
      }
    }
  }

  getSprite(actorId) {
    return this.sprites.get(actorId)?.sprite || null;
  }

  destroy() {
    for (const entry of this.sprites.values()) {
      entry.sprite.destroy();
      entry.shadow.destroy();
      if (entry.label) entry.label.destroy();
    }
    this.sprites.clear();
  }
}
