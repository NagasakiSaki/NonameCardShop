# 明亮卡店素材构建

运行 `npm run art:bright`，默认输出到新的 `.local/bright-build-时间/`。可用 `npm run art:bright -- --out .local/my-art-candidate` 或工程外的新目录指定输出。已有目录拒绝覆盖；工程内只允许 `.local`，包括经 junction 解析后的实际路径。生成失败会保留不完整候选供诊断，下次换一个目录。

运行 `npm run art:reproduce` 会在隔离目录构建两次，检查完整内容哈希、25 人方向帧/锚点/动画列、设施逻辑尺寸/脚点/遮挡，并核对正式素材和所有输入未变。报告记录输入哈希、Node/平台、参数、输出清单；只把 `build-stats.json` 的 `elapsedMs` 从哈希口径排除（文件长度也使用规范化后的长度）。PNG 使用 Node 内置 zlib，无额外依赖。不同 Node/zlib 版本可能产生不同压缩字节，跨机器比较须固定版本，并另外比较像素，不把本机两次复现冒充跨机器实测。

工具使用 Node 内置模块与本目录的像素绘图/PNG 实现，无额外美术依赖。`props.mjs` 为 76 项设施及状态的可编辑绘图源；`tiles.mjs` 对应 17 个既有地砖 ID，逻辑网格仍为 16。

候选图先人工审查和备份，通过后才把确认的文件纳入正式 `assets/frontend-bright-anime/`。需要更新正式美术映射时运行 `npm run art:bright:install`：它只读取正式目录的片段、修改正式 manifest，**不会把刚生成的候选复制进来**。安装器校验设施 ID、数量、逻辑尺寸、脚点、遮挡与地砖顺序；角色注册及精修立绘/头像不会被全量重建覆盖。本次优化不安装或替换任何正式图。

- 地砖帧 64×64，对应 16×16 世界坐标。
- 家具单元格 384×384、artScale=4，8列10行；实际物体保持原世界宽高、footY、碰撞与状态 ID。
- 图集 3072×3840，RGBA 展开约45MiB；不要只看约388KiB的压缩 PNG。
- 包盒包装用稳定 productId 选择七组新绘制配色，主题名、价格与出率仍读 Host。映射在 build.mjs，不按中文名称猜测。
- 人物再调色稿导出到候选 characters/，以 `sourceSheet` 优先作为输入，避免对已调色输出反复调色。生成任何一人失败或人数不等于 25 都会报错。

导出的 `manifest.props.json` 是美术映射片段，`ASSET-INVENTORY.csv` 是设施清单。更改可视大小、脚点或布局前先同步场景/交互与导航约束；生成图像不等于允许自动改变这些几何字段。

原设施图集留在 `assets/frontend/props/`，原地砖留在 `assets/frontend/tiles/`；不是运行时从候选目录加载。所有正式样式在 `frontend/styles/`，Shadow DOM 通过 surface 适配载入 bright-panels.css。昼夜和装饰见 world/lighting-view、scenes/world-scene。

立绘流水线独立使用 `tools/portrait-kit/build.py --source-dir 源图目录 --out .local/portrait-candidate`；依赖固定在该目录 `requirements.txt`。源图只读并校验登记哈希，精修覆盖由 `tools/frontend-art/portrait-overrides.mjs` 保留。`tests/portrait-sources.mjs` 核对 25 人、50 张正式图的哈希/尺寸（立绘 128×224、头像 96×96）。本次未重新执行 Python 重绘，也未更改用户源图路径。
