# 人物像素工具：给后续模型的操作说明

2026-10-24。此工具已经可用，不依赖当前对话、API 密钥、Godot 编辑器或鼠标操作。

## 入口与边界

- 工程根目录：`D:\GameDev\NonameCardShop`，Node.js 22.12 或更高版本。
- 预览：`http://127.0.0.1:5190/experiments/character-art/index.html`。
- 五团 25 人配置：`data/band-appearances.mjs`。基础 3 套：本目录的 `appearance-data.mjs`。
- 图层组合：`appearance-data.mjs`；像素饰品、长发、双马尾及四向覆盖：`pixel-customization.mjs`。
- 批量输出：`build-samples.mjs`；浏览器组合器：`portrait-kit.mjs`。两者共用上述配置和像素函数。
- 后端身份、预算、卡牌和交易代码不属于美术工作范围。姓名池由 `modules/backend/customer-identity.mjs` 独立管理。

不要把原角色的性格、团内职位、贫富、购买偏好、技能写入顾客逻辑。皮肤 ID 只决定外形。官方参考图没有作为游戏资源分发；组件授权与原角色设计权属见 `CREDITS.md`。

## 常用命令

在工程根目录运行：

```powershell
npm run art:setup
npm run art:build
node experiments/character-art/build-samples.mjs --id bd-tomori --out .local/art-review/tomori
node experiments/character-art/build-samples.mjs --config .local/my-character.json --out .local/art-review/custom
npm run art:install
```

`art:setup` 只需安装一次 pngjs 7.0.0 到 `.local/art-lab/tools`，不增加游戏运行依赖。

`art:build` 导出全部内置模板到 `generated/`，不改正式资源清单。单人/自定义配置必须指定独立 `--out`，避免用不完整注册表覆盖整套输出。`--config` 接受单个配置、配置数组、`{presets:[...]}`，或网页导出的 `{portrait:{...}}`。保留完整人物配置；不要把导出的 `portrait` PNG 路径当作人物配置。

`art:install` 只接受完整内置配置，将 25 套新皮肤及已认可的基础店长安装到 `assets/frontend/`，更新 `manifest.json`，不触碰存档。正式资源使用内容哈希文件名，避免旧缓存显示成旧贴图。原地图构建器也调用相同安装函数，因此重建场景素材不会丢失人物包。未引用的旧哈希不要随意删除：可能被正在打开的页面使用。

## 输出规格（必须遵守）

| 项目 | 刚需 |
| --- | --- |
| 头像 | 原生 96×96，RGBA 透明 PNG，独立构图 |
| 地图人物 | 单帧 64×64，图集 512×256，8 列 × 4 行 |
| 行序 | 上 0、左 1、下 2、右 3；不要复用旧图集的行序 |
| 动画 | 每向 8 帧，9 fps；待机第 0 帧 |
| 落脚点 | (32,61)，世界显示比例 1 |
| 渲染 | 最近邻、无平滑；不能把放大图片宣称为提高原生像素量 |
| 身体 | 继续使用 LPC 的完整步态；发饰和长发跟随每一帧实际头部位置 |

旧兼容皮肤仍有 96×128、3 列格式。游戏读取每个角色的 `columns/directions/walkColumns/frameRate/anchorPx`，不要将所有人物重新写死为一个格式。

## 修改一个人物

1. 从注册表找到稳定 ID，例如 `bd-yuno`。在新预览目录导出一份基线。
2. 修改 `hair/cloth/iris` 三阶配色，以及 `base/front/back/clothes` 部件。三阶数组顺序是亮色、中间色、暗色，均为六位十六进制颜色。
3. `walkStyle` 可用 `bob/asym-bob/medium/wavy-medium/long/wavy/twins/braids`；`accessory` 选已有样式，或在共享像素模块添加饰品。`streak` 是挑染，`otherEye` 是另一只眼的三阶色。
4. 头像可用部件保存在 `sources/portraits/`；组合函数已处理没有 secondary 或 shadow 的已知部件。新增部件时先检查文件确实存在，不要猜路径。
5. 在 A 页检查上、左、下、右和移动；C 页调色、表情、导出 JSON。五团模板的发色与服装主色会同步到行走图；基础 3 套保留原参考配色。
6. 检查头像与地图人物是否保留同一发色、长短、分缝和饰品。不能只用换颜色冒充另一人。
7. 审核后修改内置配置并执行 `npm run art:install`，提交配置、图层代码、生成文件、资源清单和署名变更。

命令行构建会检查缺失图层、ID、调色板、透明底、表情与改色效果、四向差异和确定性输出。接入正式游戏后只需针对换装/帧规格跑相关检查，不必每次重跑全部经济和引擎测试。

## 素材来源和限制

基础头像部件为 Viktor Hahn 的 CC-BY 4.0 素材；基础地图身体、头部、头发和衣服为 LPC Revised 的 OGA-BY 3.0 素材。新增 PNG 来源和 SHA-256 在 `source-manifest.json`。保留各自完整署名文件。

本版是可继续编辑的像素外观首稿。服装主色、眼色、发型和识别饰品已配置；舞台服的复杂版型、格纹、花边、精确发束及长发摆动仍可逐个精修。不要把首稿描述为官方授权贴图或逐像素还原。
