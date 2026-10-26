# 明亮卡店素材构建

从前端候选中审查接入。运行 `npm run art:bright`，只更新 `assets/frontend-bright-anime/`，不会覆盖原素材、业务规则、导航、存档或当前 manifest。

工具使用 Node 内置模块与本目录的像素绘图/PNG 实现，无额外美术依赖。`props.mjs` 为 76 项设施及状态的可编辑绘图源；`tiles.mjs` 对应 17 个既有地砖 ID，逻辑网格仍为 16。

需要更新正式美术映射时运行 `npm run art:bright:install`。安装器先校验设施 ID、数量、逻辑尺寸、脚点、遮挡与地砖顺序；不兼容时停止，不自动改地图。角色注册及用户立绘不被覆盖。

- 地砖帧 64×64，对应 16×16 世界坐标。
- 家具单元格 384×384、artScale=4，8列10行；实际物体保持原世界宽高、footY、碰撞与状态 ID。
- 图集 3072×3840，RGBA 展开约45MiB；不要只看约388KiB的压缩 PNG。
- 包盒包装用稳定 productId 选择七组新绘制配色，主题名、价格与出率仍读 Host。映射在 build.mjs，不按中文名称猜测。
- 人物再调色稿会导出到 characters/ 供后续对比；正式 manifest 暂保留已认可的原行走图集和用户立绘，没有把再调色当成重画五官。

导出的 `manifest.props.json` 是美术映射片段，`ASSET-INVENTORY.csv` 是设施清单。更改可视大小、脚点或布局前先同步场景/交互与导航约束；生成图像不等于允许自动改变这些几何字段。

原设施图集留在 `assets/frontend/props/`，原地砖留在 `assets/frontend/tiles/`；不是运行时从候选目录加载。所有正式样式在 `frontend/styles/`，Shadow DOM 通过 surface 适配载入 bright-panels.css。昼夜和装饰见 world/lighting-view、scenes/world-scene。
