# 像素卡店素材

生成方式：内置 ImageGen 工具，未使用外部 API 或 CLI。

- `card-shop.png`：完整单间卡店背景。保留生成原图，由 Phaser 显示为 960×640 世界。
- `owner.png`：店主角色，保留生成原图的透明通道。运行时只按透明边界选择显示区域，不覆盖原图；移动时轻微上下摆动并左右转向。顾客复用该精灵并换色。
- 场景碰撞、寻路、交互区域和文字标记由 `shop.js` 提供，与背景家具对应。

## 店铺背景最终提示词

Use case: stylized-concept. Asset type: production background map for a playable top-down pixel art card-shop RPG, landscape aspect ratio 3:2, 1536x1024 output. Create a single coherent beautiful cozy trading card shop interior viewed in orthographic top-down 3/4 SNES RPG perspective, genuinely crisp pixel art with consistent chunky pixels, like a 384x256 pixel scene scaled up nearest-neighbor. No interface, no text, no letters, no watermark, no people or characters. Entire room shown. Warm honey wood floor with walkable large open central area, muted forest green and cream palette, late afternoon sunlight through two upper windows. Layout critical: back wall occupies top 18 percent, with windows, leafy plants and wall shelves holding colorful card booster boxes; long solid wooden service COUNTER centered horizontally at x=32%-65%, y=26%-38% with a dark green countertop, small cash register and a few booster packs on it; a small freestanding cylindrical dark metal TRASH BIN near right wall at x=88%, y=62%; one round green felt CARD GAME TABLE with two stools near x=75%, y=74%; tall wooden CARD DISPLAY SHELVES on left wall x=9%-22%, y=40%-70%, colorful little boxes; a red-brown rectangular doormat and OPEN DOOR centered on bottom edge at x=45%-55%, y=91%; a small cream woven rug in central walkable area x=38%-59%, y=53%-75%. Leave clear continuous walking corridors down center and around the objects. Room bounds are near image edges. Show appealing substantial chunky furniture and lovingly detailed pixel textures, visually legible at 768x512. No isometric diamond view, no tilted room, no tiny clutter blocking walking paths.

## 店主精灵最终提示词

Use case: stylized-concept. Asset type: one playable pixel art RPG character sprite on true transparent background. A friendly young adult card shop owner, short dark brown hair, forest green apron over cream shirt, brown trousers and dark shoes, small chibi proportions, warm approachable face, facing viewer with slight top-down RPG camera angle. Full body standing idle, arms at sides, exact centered single isolated sprite. Crisp chunky pixel art, SNES era 24x32 pixel character aesthetic displayed enlarged with clean nearest-neighbor edges, limited warm earth colors and clear dark pixel outline. Character must occupy about 70% of image height, 45% width, centered. No floor, no scenery, no drop shadow outside the feet, no text, no extra poses, no sheet or grid. Transparent background.
