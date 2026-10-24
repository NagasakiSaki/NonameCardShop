# PLAY2-X：复杂模型执行任务书

这是一份可直接交给另一个模型的开发任务书。先读 [第二轮总分工](2026-10-24-第二轮分工与未完成任务.md)，然后按本文连续完成 X1～X4。你负责**候选前端、表现和测量**，主模型负责权威后端及最后合并；不用向其他 Agent 发消息。

## 0. 工作区与真实现状

工程根：`D:\GameDev\NonameCardShop`。

**唯一可写目录：`D:\GameDev\NonameCardShop\deliverables\playability-v2\PLAY2-X\`。** 首次运行先检查目录是否已有成果，有则续作，不覆盖不明文件。正式工程、旧候选、用户原图、真实存档均只读。临时测试/日志也放本包内。

代码基线为本地 `29fffdaf`，私有仓库对应 `490aafd1`。先把自己实际 HEAD 和输入源文件摘要记录到 `baseline.md`；若主模型已继续开发，以当前真实文件为准列出差异，不回滚工程，也不因为提交号不同就停工。

PLAY-A/B/C 已接入。应延续 `frontend-next/components/workspace/`、`components/management/` 的现有风格和实际功能，不能拿旧 `deliverables/playability-v1/` 覆盖新正式代码。已知整盒范围、hidden、读档身份等修正应保留。完整记录见 [PLAY 接入](../2026-10-24-PLAY候选接入.md)。

能力要求：X1/X4 需要跨模块 JavaScript、浏览器调试和生命周期处理；X2/X3 需要能直接看图并审阅四向动画。若你不能看图，继续完成工程部分、参数和可复现预览，但明确标注“未做视觉审阅”，不能声称外观已正确或美术已定稿。无需让用户反复确认常规实现细节。

## 1. 阅读入口

先读以下直接相关文件，不必通读整个 vendor 引擎：

| 内容 | 文件（均相对工程根） |
| --- | --- |
| 当前规则与兼容约束 | `docs/Phaser长期维护与优化约定.md`、`contracts/README.md`、`contracts/card-shop-host.d.ts`、`contracts/经营体验接口.md`、`contracts/shop-experience.d.ts` |
| 新组件与正式绑定 | `frontend-next/components/workspace/`、`frontend-next/components/management/`、`frontend-next/screens/workspace.mjs`、`frontend-next/screens/management.mjs`、`frontend-next/services/management-view.mjs` |
| 旧但仍在用的操作 | `frontend/ui/management.mjs`、`frontend/ui/trash.mjs`、`frontend/ui/combat-room.mjs`、`frontend/ui/day-saves.mjs`、`frontend/ui/start-menu.mjs` |
| 窗口、Host 与恢复 | `frontend/ui/window-manager.mjs`、`frontend/host/normalize.mjs`、`frontend-next/services/operations.mjs`、`frontend/app-shell.mjs` |
| 场景与升级真实效果 | `frontend/scenes/world-scene.mjs`、`frontend/world/actor-view.mjs`、`modules/backend/presentation.mjs`、`modules/backend/management.mjs`、`data/backend-management.json` |
| 人物入口 | `tools/character-kit/README.md`、`experiments/character-art/MODEL-GUIDE.md`、`data/band-appearances.mjs`、`data/walk-refinement.mjs`、`data/character-audit.mjs`、`experiments/character-art/walk-refinement.mjs` |
| 素材/空间 | `assets/frontend/manifest.json`、`tools/frontend-art/facilities.mjs`、`props-v2.mjs`、`maps-v2.mjs`、`contracts/map.schema.json` |
| 实际测试示例 | `tests/playability-integration.mjs`、`tests/shop-experience.mjs`、`tests/character-art.mjs`、`tests/frontend/assets.mjs` |

用户立绘原图只读：`C:\Users\lenovo\Desktop\OurNotes_BanG_Dream剧情\全部角色基础全身立绘\PNG透明格式`。通过 `data/character-portraits.json` 查角色映射；不可按文件序号猜角色。正式 `costume` 是原立绘版型，精修行走用独立 `walkCostume`，不要混改。

## 2. X1 / P0：让已有经营功能连成一条流程

### X1.1 经营操作与观察放在同一套界面语言里

现有新窗口主要负责日报、熟客引导、顾客/牌桌观察，旧 `frontend/ui/management.mjs` 还承担升级、员工、熟客交付和订单。请实现一套可复用的**经营操作组件**，延续现有新组件风格；可以作为经营手账的子页，不再创建与其重复的经营大首页。

保留全部实际能力：

- 设施当前等级、下一档费用、具体效果、解锁日期/满级、购买失败与余额不足状态。
- 员工雇佣、当班/休息、每日合同工资；休息不能写成自动免工资。
- 熟客真实立绘、关系、对话、寻卡申请、出售实物、场地预约及待办订单；接受、交付、支付、拒绝按实际 pending.kind/status 显示，没开放的类型不造演示业务。
- 在途采购与熟客订单分清；采购签收继续复用交易台，不能新增一条有不同费用的收货流程。
- 从日报瓶颈/熟客需要进入对应操作，保留来源和返回入口；一次只突出当前最重要动作，不要求玩家遍历所有子页。
- 缺数据、真实零、加载失败、已满级、到期、占用、提交中、结果未知、已完成各有明确显示。

接入建议对应查询是 `management.upgrades / management.people / management.orders`，现有命令是 `upgrades.purchase / neighbors.act`。详细 payload 以当前代码/契约为准，不根据名称推测。新展示字段与 command 建议写到 `integration.md`，主模型决定真实接口。

### X1.2 卡面优先的共享垃圾桶

延续真实 `inventory.list / inventory.discard / inventory.recover`，做可复用卡面组件，不重新做卡牌数据库。

- 桶内按卡种展示卡面、名称、稀有度、实际张数，能展开到实物副本与丢弃来源。来源混合时不能给整组伪造同一个丢弃者。
- 单张拾取、全部拾取、选择自己可丢弃的副本；保护/锁定/不可操作项准确禁用，数量来自当前实物。
- 卡面可看大图与已有技能详情；复用现有详情接口/组件，不在桶里内置一份过期技能。
- 提醒“开始下一天会清空”和“被他人捡走不再属于桶”，但窗口暂停时不要模拟 NPC 在现实时间偷拿。
- 大量卡分页/渐进加载，不能只读前 200 张就声称全部库存已展示。
- 丢弃和拾取的未知响应可以补查原操作；读档分支变化清空旧实物选择，不新建 requestId 重复提交。
- “查看”与“去桶旁操作”分开。正式需要站在 `store.trash`；预览按钮不得借开窗绕过站位。

### X1.3 精修引导与上下文导航

- 已完成的三日引导继续使用真实进度，不从计时器、点击次数或 fixture 直接判定完成。
- `close-first` 这类无设施目标的总结步骤应进入合适的日报/打烊入口，不全部回落到旧升级窗口。熟客任务能进入相应熟客/订单，升级任务能进入设施页。
- 为 `community-day` 显示已满足与未满足条件、今日状态和可执行动作；“条件不足”给出可继续经营的替代路径，不生成假参赛者。
- 从经营页导航离开时正确释放本页暂停；嵌套窗口保留其他暂停原因。菜单查看和站位提交的区别清楚，距离不足时让玩家正常走过去。
- 被动 HUD 继续显示时间、资金、当日营业/奖励与必要流水，避免新增十几个常驻按钮。中文姓名＋类别、设施标识和操作提示不互相遮挡。
- 战斗、存档与设置保持原能力和路由；可以交改进入口/状态文案建议，本阶段不重写真实引擎容器、存档仓库或档案菜单。

### X1 的技术要求

展示组件提供 `mount({root,view,actions,assets}) -> {update,dispose}`；兼容现有组件增量扩展，不强制换框架。数据只读，动作注入；命令包装复用现有操作恢复语义。不能另写一套按包名定价、按稀有度猜强度或按动画发奖的实现。

异步 action 必须 await，关闭/切换分支后不得更新旧节点；重复提交防护、恢复原操作、焦点/滚动保持、订阅与 timer 清理要一起处理。先完整保存 `worldId / branchId` 再比较更新后的身份；不要复发“先更新 view 再比较”的错误。

未知旧统计显示“—/暂无记录”；模拟与真实战绩分开，库存单位 pack/box 分开，奖励与营业利润分开。遵守现有 `hidden` 行为，不用 CSS 把隐藏区重新显示。

主视口 1440×900，1280×720 可用，406×1000 为窄屏回退。正文 14～16 CSS px、辅助通常不低于 12、主要按钮点击区至少 40×40；卡面和正式人物立绘保持比例，卡图/文字不要强制最近邻像素化。世界像素图才使用最近邻整数缩放。

## 3. X2 / P1：升级看得见，效果不冒充

基于已接入设施纯绘制代码补充等级/当班表现与必要状态映射。延续温暖像素小店、早期宝可梦地图的轮廓可读性；参考方向沿用旧任务，不复制参考游戏贴图。**不是再新增 20 件无用途装饰。**

| 真实升级 | 展示目标 | 不能暗示的效果 |
| --- | --- | --- |
| shelf 0～3 | 层数/陈列标识有差异；与空/低/充足状态可组合 | 图画大就多一倍容量，或按每个货架重复计算容量 |
| showcase 0～1 | 未购为普通柜/明确预留位，已购为珍藏展示外观 | 自行生成展卡实物、客户或收入 |
| table 0～2 | 服务牌、桌布、杯架等等级变化，保留空闲/预留/模拟/结束状态 | 增加不存在的桌位、自动开赌 |
| cashier / stocker | 未雇佣、当班、休息的可读标识 | 未实现的自主员工移动或自动免工资 |

输出状态选择纯函数及样例：输入实际等级、在职/当班、库存、桌位状态，输出贴图 key；未知字段有保守回退。现有 `snapshot.storefront` 含 sealed/upgrades/tables，**没有承诺所有员工活动字段**。缺数据写建议，不能从墙上的图案判断员工在职。

优先复用现有精确画布/锚点/占地，提供尺寸、分层、素材 ID 和前后对照。不要调整真实导航、牌桌 seat/stand、出口或碰撞；有必要的位置建议单列 `layout-proposal.json`，由主模型处理。四人已修复的行走和现有姓名标签不另做平行系统。

## 4. X3 / P1：完成剩余 21 人行走

四名已完成者作为回归基线，不重新换风格：`bd-tomori / bd-rana / bd-sakiko / bd-yomogi`。正式 25 人立绘/头像保持现状。

剩余目标由实际注册表列出如下；姓名仅用于核对，以 `data/character-audit.mjs` 和登记图源为准，不自行杜撰汉译：

| 批次 | 角色 ID 与登记名 |
| --- | --- |
| 1：短发/长发/复杂版型代表，5 人 | `bd-anon` 千早愛音；`bd-uika` 三角初華；`bd-nonoka` 宮永ののか；`bd-mahoro` 浜崎まほろ；`bd-chieri` 梅里ちえり |
| 2：完成 MyGO / Ave Mujica / 夢限大其余 9 人 | `bd-soyo` 長崎そよ；`bd-taki` 椎名立希；`bd-mutsumi` 若葉睦；`bd-umiri` 八幡海鈴；`bd-nyamu` 祐天寺にゃむ；`bd-arale` 仲町あられ；`bd-ritsu` 峰月律；`bd-miyako` 藤都子；`bd-yuno` 千石ユノ |
| 3：完成 millsage / 一家其余 7 人 | `bd-nagi` 琴平凪；`bd-hotaru` 汐見蛍；`bd-houka` 和泉朋花；`bd-natsume` 伊沢なつめ；`bd-raika` 須賀蕾叶；`bd-miku` 馬橋心玖；`bd-shizuku` 四宮寧月 |

规格冻结：单帧 **64×64**；4 方向×8 帧；图集 **512×256**；沿用现有方向行序、9 fps 与脚底锚点 **(32,61)**。原生、2×、4×预览都有；不能以提高分辨率或滤镜替代修复。

重点逐人处理：

1. 正脸眼睛位置、肤色、刘海、瞳色、发饰。真实异色瞳和不对称刘海保留，不能用全员左右镜像作为标准。
2. 左右为可信侧脸，近眼/鼻口与头发遮挡一致；背面不长眼，不把没脸正面当侧面。
3. 近侧手臂能摆到身体前、远臂在后，袖子跟随肩臂；短袖/长袖/露肩/宽袖分别处理，不贴静态服装盖住所有帧。
4. 长发、双马尾、辫子、帽饰、耳机和裙摆保持可认轮廓；衣服/头发/脚步共用可靠帧锚点，不跳身高、不漂脚。
5. 每个角色用登记源图对照头发/上衣/袖子/腿装/鞋，记录 64px 下主动简化的细节。外形与 NPC 姓名、预算、行为无关。

继承 `walk-refinement.mjs` 的遮挡/锚点修复，避免复制 21 个完整绘制器。能参数化的颜色/版型放配置；真正不同版型才扩展绘制函数。保留 `costume`，用 `walkCostume` 分派，`sleevePalette` 等参数可复用；如果增加新字段/版型，同步交 schema/校验器建议与 CLI/浏览器一致性证据。

交付内容必须包含源绘制器、每人参数、透明 PNG、25 人对照图册、逐角色 review 表、左右短动画及四向逐帧预览。仅改 PNG 没有生成源不合格；脚本断言通过不能代替看图。四人旧基线若有必要变化，单列原因与逐帧差异，不顺手全员重染色。

## 5. X4 / P2：先测真实版本，再提优化

建立候选包内可重复脚本，运行现有真实 Host/场景，记录默认与候选前后数据。测试自己的新浏览器 context，服务器用临时空闲端口。不要接入用户浏览器标签、真实存档或 root origin 的既有 IndexedDB。

代表场景：

- 默认普通营业，记录实际人数/库存/倍率/暂停状态。
- 当前规则合法容量内的繁忙营业，不能偷偷解除 NPC 上限来冒充普通场景。
- 明确规模的较大库存，例如 1000 张测试实物；标明为合成压力输入，不冒充实际经营所得。
- 反复开关交易/经营/垃圾桶至少 20 次，检查监听、timer、焦点和慢查询返回是否残留；测量窗口打开、关闭后可恢复状态。

记录提交、浏览器版本、系统/可获取硬件、视口、Phaser.CANVAS、资源版本、冷/热启动、样本时长、真实人数、帧间隔 p50/p95、长任务、输入到可见反馈、面板首屏与查询耗时。内存 API 不支持就写未测，不能填估计值。单次启动和 Mock fps 不能证明内存稳定。

每个压力样例约 30～60 秒即可，必要代表重复；不长时间空转、不反复全库测试。优化只对证实热点：不变文本/灯光每帧重建、重复人物同步、全量 DOM、重复大图解码、失效订阅等。交修复候选与前后数据；没有瓶颈可以只交基线，不为完成任务硬造优化。禁止擅换渲染器/引擎、改世界步长、删 NPC 或降低美术质量。

## 6. 隔离预览与真实验收怎么做

本轮不接受只有 Mock 截图的完整交付，但也不允许在玩家存档里调试。

1. `preview/` 提供 view/actions fixture，用于切换空、忙、错误、未知结果、旧档缺数据、分支失效和窄屏状态；fixture 不自行实现经济规则。
2. `tests/` 参考 `tests/playability-integration.mjs`，用 `startShopServer({port:0,enginePort:0})` 和 Playwright 新 context，在隔离测试世界调用**真实 Host**。已有 Playwright 可用，不全局安装浏览器/依赖；脚本 finally 关闭 context/浏览器/服务。
3. 在隔离页面里动态挂载自己的候选组件/接入器，复用正式窗口管理和操作恢复，actions 指向该测试 Host。可以替换这个测试 app 的局部 handler，不改磁盘正式入口，不接用户 app。
4. 新源码只放候选 `src/`，引用正式文件须标明路径。预览可通过根 URL 或 `new URL(..., import.meta.url)` 解析只读资源，避免复制一份 data/cards、技能代码或整套原图。映射到正式目标后如何恢复模块相对导入写清楚。
5. 浏览器真实输入/按钮完成代表路径；直调 Host 可用于造测试前置/查询核对，不能将直调命令成功冒充候选按钮已接通。

最低验收：默认数据下浏览设施/雇佣状态；一次升级或雇佣操作及失败态；一张实物丢弃/拾回；一次熟客订单状态动作；多窗暂停；关闭后慢响应；响应丢失补查；日初回读后旧选择失效；三种视口；升级前后图；21 人审阅/四人回归。熟客订单没有条件时在测试前置明确构造合法隔离场景，不给玩家世界偷偷加卡送钱。

新增后端字段未开放时：实际运行只用已有字段；候选预览可单独演示 proposed fixture，必须显著标注“建议字段，仅预览”，在交付矩阵写“主模型待提供”。不要宣称正式闭环已通过，也不要因此停止其他独立任务。

## 7. 交付目录与交付标准

```text
PLAY2-X/
  README.md                 # 环境、启动命令、各阶段入口
  baseline.md               # 输入提交/文件摘要/继承范围
  DELIVERY.md               # X1～X4 完成与未完成状态、逐项证据
  integration.md            # 每个正式目标、动作、字段、缺口、安装顺序
  acceptance.md             # 有效测试、真实/fixture 区分、局限
  src/                      # 可复用组件、候选接入器、绘制器/配置
  assets/                   # 实际用到的原生输出和状态映射
  preview/                  # 独立浏览与逐帧/状态预览
  fixtures/                 # 只用于候选和测试的展示输入
  tests/                    # 少量关键路径脚本
  evidence/                 # 截图/动画/性能原始结果
  proposals/                # 目标路径差异、接口缺口、布局建议
```

`integration.md` 每项写：候选 source → 正式 target，新增/替换/扩展，基于哪个源版本，需要哪些现有查询/命令，哪些字段仅建议，安装顺序及如何回退。若涉及修改共用绘制器，交完整候选模块与清楚的差异，不只写“把第 N 行替换”。最终由主模型处理正式 import、contract、资源清单与导航。

每个阶段形成可审查成果后更新 `DELIVERY.md`，继续下一阶段，不必等用户中途批准。未完成就直写未完成；不把 fixture/候选、像素断言或一张漂亮截图写成正式上线验收。不要 Git 提交/推送、打包 EXE、安装正式资源或覆盖其他模型工作。

## 8. 用户可直接发给复杂模型的指令

请读取并执行 `D:\GameDev\NonameCardShop\docs\collaboration\PLAY2-X-复杂模型交接.md`，按 X1→X2→X3→X4 完成尚未完成的前端流程、升级表现、21 人行走和性能观察。基于已接入的正式代码迭代，不重做旧 PLAY-A/B/C；只写 `deliverables/playability-v2/PLAY2-X/`，保留原图、正式工程和玩家存档。先交 X1 的可交互组件及隔离真实 Host 验证，再继续后续阶段。每阶段更新 DELIVERY，列清拟合并文件、接口缺口、真实与演示验证边界。正式后端和最终合并由主模型负责。
