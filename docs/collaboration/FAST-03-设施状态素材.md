# FAST-03：高速模型的设施等级/状态素材

总安排见 [当前分工](2026-10-24-有限模型资源分工.md)。唯一可写 `D:\GameDev\NonameCardShop\deliverables\playability-v3\FAST-03\`；正式源/资产/地图、其他交付和用户原图只读。

## 输入与边界

读 `tools/frontend-art/facilities.mjs`、`props-v2.mjs`、`assets/frontend/manifest.json`、`data/backend-management.json`、`modules/backend/presentation.mjs` 与 `management.mjs`。复制必要纯绘制函数到包内改；不能整包重新装正式资产。

现有 20 件设施及库存/牌桌状态已接入，这次补**升级变化**，不再堆无用途装饰、不换风格。固定现有画布、原点、缩放、脚底/遮挡与占地，不能改地图碰撞、站位、出口、seat。

## 只做这四项

| 设施 | 需要交付的样式 | 约束 |
| --- | --- | --- |
| shelf 0～3 | 等级陈列标识/层次，兼容空/低/充足 | 不从画面尺寸重新计算容量，不把全店库存重复算到每架 |
| showcase 0～1 | 未购普通/预留位与已购展示对照 | 不生成不存在的展示卡实物/收入 |
| table 0～2 | 等级桌布/服务牌，兼容空闲/预留/模拟/结束 | 不新增桌位，不画可操作赌注功能 |
| cashier / stocker | 未雇佣/当班/休息的标识 | 仅展示，不能宣称已经有可行走员工或休息免工资 |

优先参数化叠层，不为每个组合复制整套绘制函数。只接受简单输入→输出纯函数/状态表；真实等级/当班数据由主模型投影。`snapshot.storefront` 目前有 sealed/upgrades/tables，不代表已有完整员工活动字段，缺字段写建议。

## 交付与检查

README、baseline、DELIVERY、src/纯绘制代码、assets/原生 PNG、states.json（键/等级/状态/尺寸/原点/层级）、preview/全状态对照、sources.md、acceptance.md。明确正式目标和新增贴图 key；不改正式 manifest/地图，不运行 art:install。

检查 PNG 尺寸/透明、每种等级状态可加载、原生/2×预览。能看图则核对清晰可认/不盖人，不能看图就标待视觉审阅。遇到新锚点/复杂动画/状态组合设计问题交 HQ-DEV 或主模型，不自行做场景系统重构。

可直接发送：请执行 `D:\GameDev\NonameCardShop\docs\collaboration\FAST-03-设施状态素材.md`，在既有纯绘制设施上补同尺寸等级和员工标识素材，交可重建代码/状态表/预览。只写自己目录，不改导航/规则/正式素材，不用外观承诺不存在的能力。
