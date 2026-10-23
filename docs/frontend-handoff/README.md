# 无名小店 · 美术与前端交接包

基线：源码 v0.8.1，分支提交 `865a475c`（其后的 `6d8c627a` 为交接文档基线）。
本包实现交接文档第 3 章允许的五个目录：`frontend/`、`assets/frontend/`、`tools/frontend-art/`、`tests/frontend/`、`docs/frontend-handoff/`。

## 1. 运行方式

沿用项目现有开发服务（端口 5190，由主模型维护的 `server.mjs`/`dev/` 提供），前端是纯静态目录：

```text
http://127.0.0.1:5190/frontend/index.html?mode=mock&fixture=store-day
http://127.0.0.1:5190/frontend/index.html?mode=mock&fixture=store-evening
http://127.0.0.1:5190/frontend/index.html?mode=mock&fixture=battle-room&scene=battle-room
http://127.0.0.1:5190/frontend/index.html?mode=host
```

- `mode=mock` 必须显式书写，画面左上角会显示「前端演示数据 · <fixture 名>」。
- `mode=host` 会动态导入 `/integration/frontend-host.mjs`；缺失或连接失败时**只报错并提供重试**，不会静默切回 Mock。
- `scene=battle-room` 可直接进入对战房。
- 首次加载会读取 `/data/cards.json`（约 7.4 MB）作为演示卡库，Mock 模式下属于演示数据。

本地一次性静态服务也可用于核对（会绕开开发监视，仅供测试脚本使用）：

```bash
node tests/frontend/ui-smoke.mjs   # 自带 5199 端口静态服务 + 截图
```

## 2. 完成范围

主店与对战房两张地图、七套角色四向行走与立绘、全部交互面板、统一窗口/暂停、10 个 Mock fixture、素材生成管线与三套自动检查。

**已完成（本包可独立验证）**

| 模块 | 内容 |
| --- | --- |
| 世界 | 30×20 格、480×320 原生像素两张地图；17 块可组合瓦片（含四角墙角）+ 18 件家具；按脚底 y 排序遮挡；相机整数倍 1×/2×/3×；昼夜光层随游戏分钟变化 |
| 角色 | 店长、新手顾客、收藏家、竞技玩家、路过顾客、熟客、高预算顾客；3 列 × 4 行 12 帧；行序 下/左/右/上，待机在第 1 列，行走 0→1→2→1；落脚点 (12,30)；96×96 立绘 |
| 输入 | WASD/方向键、触屏方向键、点击地面寻路、E 交互、B 背包、Esc 关闭最上层窗口；失焦/切后台/pointercancel 清键；面板打开时地图不响应移动 |
| HUD | 营业日/时间/营业阶段/速度/暂停状态、资金、欠款、托管；入口：背包、任务、日报、存档、经营、设置 |
| 手账 | 今日任务与进度、今日收支、店面导航（一键走到交互点）、去对战房；窄屏默认折叠 |
| 面板 | 背包与收藏（搜索/稀有度/持有状态/排序/分页）、卡牌详情、进货与签收（版本变化对照）、零售货架、开包（范围/整盒/跳过动画，逐张或只看 SR+ 或汇总）、二级市场（买卡/我的出售/收购报价/行情记录 + 价格构成展开）、对战房（桌位状态/有序配队/无赌注/倍数提议/挂载区）、任务、日报、按天存档、经营（设施/员工/街坊收卡申请与预约交付/订单）、设置（字号/缩放/动效/音量偏好 + 开发配置）、垃圾桶、店主手册 |
| 暂停 | 每个窗口申请一把 `ownerId=window:<id>` 的暂停令牌，嵌套窗口各自持锁；手动暂停不会被关窗清掉；释放失败会提示且不自行把时钟改成运行 |
| 事件 | `snapshotUpdated`/`actorsUpdated`/`notification`/`worldReset`/`connectionChanged`；序号缺口或世界/分支切换时重新读快照 |
| 数据呈现 | 印刷稀有度与当前全局分级并列；`packExpectedCounts` 与 `packAtLeastOneProbabilities` 分开写；`available` 直接采用 Host 值，不用 owned 相减；在售不当作到账 |
| 美术 | 全部素材由脚本逐像素生成，可重复构建：七套角色图集、立绘、13 块瓦片、16 件家具/道具、两张地图 JSON（含 nav） |

**不属于本包范围（由主模型完成）**

全卡评分与四档分级计算、动态配方与报价、真实抽卡守恒、真实市场成交、无名杀引擎挂载与赛果验证、正式存档与世界重置、根入口切换与打包。

## 3. 操作说明

1. 进入页面后站在店门口，用 WASD/方向键或点击地面移动。
2. 靠近柜台时底部出现「E 交互」提示，按 E 或直接点击柜台会自动走到可站位置再打开面板。
3. 顶部按钮或快捷键 B 打开背包；Esc 逐层关闭窗口。
4. 背包 → 点卡牌 → 详情（嵌套窗口）；关掉详情后世界仍暂停，直到背包也关闭。
5. 进货：订货 → 获取报价 → 确认下单 → 待签收 → 签收；开包柜台可预览后开包并「留一，其余上架」。
6. 桌面右侧手账可直接点「密封商品零售 / 进货 / 二级市场 / 垃圾桶」走过去；对战房的门在主店右墙中部。
7. 对战房按 KOF 时出阵顺序就是点击顺序（1 号先手位 → 2 号中坚 → 3 号收尾），点上方位置可撤回单个；也可以选「无赌注对战」。
8. 背包里可按评分/名称/持有点数排序；市场每行有「价格详情」展开评分、样本、供需与版本溢价。
9. 顶部「手册」是操作与数据来源说明；设置里可切换画面缩放（1×/2×/3×/自动）与字号。

## 4. 目录

```text
frontend/
  index.html  main.mjs  app-shell.mjs
  host/        host-loader.mjs（唯一入口）normalize.mjs（形状归一）contract-types.d.ts（只读镜像）
  scenes/      world-scene.mjs  store-scene.mjs  battle-room-scene.mjs
  world/       actor-view  movement-view  map-loader  interaction-router  lighting-view
  ui/          components  hud  window-manager  inventory  card-detail  supplier
               opening  secondary-market  combat-room  tasks  day-report  day-saves
               management  settings  trash  help
  styles/      tokens.css  layout.css  components.css
  mock/        mock-host.mjs  fixtures/{cards,fixtures}.mjs
assets/frontend/  manifest.json  characters/  portraits/  tiles/  props/  fx/  maps/
tools/frontend-art/  png  pixkit  characters  props  maps  build  export-preview  probe-host  probe-perf
tests/frontend/  assets.mjs  mock-smoke.mjs  ui-smoke.mjs  run.mjs
docs/frontend-handoff/  README 改动文件清单 接口缺口 素材说明 验收记录 screenshots/
```

## 5. 复现与自检

```bash
node tools/frontend-art/build.mjs          # 重新生成 assets/frontend（同参数同输出）
node tests/frontend/run.mjs all            # 素材 12 + Mock 契约 14 + 浏览器 21 项
node tests/frontend/run.mjs assets         # 只跑素材/地图自检
node tools/frontend-art/export-preview.mjs # 导出人工目检对照图到 docs/frontend-handoff/screenshots
node tools/frontend-art/probe-perf.mjs     # 测帧率与角色负载
node tools/frontend-art/probe-host.mjs     # 用正式 Host 模式跑一次连接冒烟
```

## 6. 已知限制

- 未打包、未改根入口、未改根依赖；`frontend/` 需要经项目现有静态服务访问，不能 `file://` 双击。
- 现有开发监视不覆盖 `frontend/`，改前端后需要手动刷新（与交接文档一致，未改 `dev/runtime.mjs`）。
- 战斗房只做`battle.mount`容器与工具栏；Mock 显示占位说明，正式模式由主模型挂载引擎。
- 收购报价（bids）目前只读展示；「要求降注」需要 Host 重新报价的命令，这两项都写在 `接口缺口.md`。
- 音量只是记录偏好，本阶段没有音频；立绘没有做表情差分。
- 立绘与家具仍属首版样板：可用、可编辑、同色板，但没有做表情差分与更多家具变体。
- 部分卡图在演示卡库中缺文件，界面用「缺图」占位兜底（`tests/frontend/ui-smoke.mjs` 会统计这类 404）。
