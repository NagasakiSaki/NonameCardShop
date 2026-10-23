// frontend/world/lighting-view.mjs — 昼夜光层：按 Host 游戏分钟决定环境色与灯光强度。
function ambientForMinute(minute) {
  const m = ((minute % 1440) + 1440) % 1440;
  // 关键色：深夜 / 清晨 / 白天 / 黄昏 / 入夜
  const keys = [
    { t: 0, color: 0x2f3d78, dark: 0.84 },
    { t: 5 * 60, color: 0x3f4d86, dark: 0.78 },
    { t: 7 * 60, color: 0xbf9c8c, dark: 0.36 },
    { t: 9 * 60, color: 0xffffff, dark: 0 },
    { t: 16 * 60, color: 0xfff0d2, dark: 0.05 },
    { t: 18 * 60, color: 0xd89a76, dark: 0.3 },
    { t: 19.5 * 60, color: 0x7a5c86, dark: 0.56 },
    { t: 21 * 60, color: 0x3a4682, dark: 0.76 },
    { t: 24 * 60, color: 0x2f3d78, dark: 0.84 },
  ];
  let prev = keys[0];
  for (const key of keys) {
    if (m <= key.t) {
      const t = prev.t === key.t ? 0 : (m - prev.t) / (key.t - prev.t);
      return {
        color: Phaser.Display.Color.Interpolate.ColorWithColor(
          Phaser.Display.Color.ValueToColor(prev.color),
          Phaser.Display.Color.ValueToColor(key.color),
          100,
          Math.round(t * 100),
        ),
        dark: prev.dark + (key.dark - prev.dark) * t,
      };
    }
    prev = key;
  }
  return { color: { r: 255, g: 255, b: 255 }, dark: 0 };
}

export class LightingView {
  constructor(scene, map) {
    this.scene = scene;
    this.map = map;
    const offset=map.worldOffset||{x:0,y:0};
    this.overlay = scene.add.rectangle(offset.x, offset.y, map.width * map.tileSize, map.height * map.tileSize, 0xffffff, 0.001)
      .setOrigin(0, 0)
      .setDepth(8000)
      .setBlendMode(Phaser.BlendModes.MULTIPLY);
    this.glows = [];
    for (const light of map.lights || []) {
      const glow = scene.add.image(light.x+offset.x, light.y+offset.y, "glow")
        .setDepth(8100)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setScale((light.radius || 64) / 48)
        .setAlpha(0);
      this.glows.push(glow);
    }
    this.lastMinute = -1;
    this.ambient = { r: 255, g: 255, b: 255, dark: 0 };
  }

  update(clock) {
    if (!clock) return;
    const minute = Math.floor(clock.minute);
    const bucket = Math.floor(minute / 2) * 2;
    if (bucket === this.lastMinute) return;
    this.lastMinute = bucket;
    const { color, dark } = ambientForMinute(bucket);
    this.ambient = { ...color, dark };
    // Canvas 渲染器对图形对象不保证 MULTIPLY，这里用"暗色 + 透明度"直接压暗，
    // 色相仍取自上面的关键色，因此夜里偏蓝紫、黄昏偏橙。
    const nightColor = Phaser.Display.Color.GetColor(
      Math.round(color.r * 0.5 + 14),
      Math.round(color.g * 0.5 + 12),
      Math.round(color.b * 0.58 + 26),
    );
    this.overlay.setBlendMode(Phaser.BlendModes.NORMAL);
    this.overlay.setFillStyle(nightColor, Math.min(0.76, dark * 0.94));
    for (const glow of this.glows) {
      const flicker = 0.94 + Math.sin((this.scene.time.now || 0) / 640) * 0.06;
      glow.setAlpha(Math.min(0.9, dark * 0.95 * flicker));
    }
  }

  destroy() {
    this.overlay.destroy();
    for (const glow of this.glows) glow.destroy();
    this.glows = [];
  }
}
