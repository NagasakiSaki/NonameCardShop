# 开发、测试与版本管理

2026-10-24 技术路线已确认：继续 Phaser + HTML/CSS + JavaScript 规则，沿用现有无名杀与桌面接入。新增功能按 [Phaser 长期维护与优化约定](Phaser长期维护与优化约定.md) 和 [V6 最新总分工](collaboration/commercial-v6/README.md) 推进；其中待建工具和性能基线不视为已实现。

项目根目录为 `D:\GameDev\NonameCardShop`。所有工具按自身位置解析路径，整个目录可以再次搬迁。已关联 GitHub 私有仓库 [NagasakiSaki/NonameCardShop](https://github.com/NagasakiSaki/NonameCardShop)，素材通过 Git LFS 管理。个人进度、依赖、构建产物和上游安装目录中的 Home 用户缓存不上传。

2026-10-23：默认入口已改为新版前端与正式 Host，集成说明见 [FRONTEND-INTEGRATION.md](FRONTEND-INTEGRATION.md)。旧页面保留在 `/legacy.html`，安装版没有更新。

## 日常入口

| 操作 | 双击文件 | 命令 |
| --- | --- | --- |
| 浏览器开发、自动刷新 | `开发启动.cmd` | `npm run dev:open` |
| 桌面开发、独立进度 | `桌面开发.cmd` | `npm run dev:desktop` |
| 全部回归 | `运行测试.cmd` | `npm test` |
| 环境诊断 | — | `npm run doctor` |
| 生成 Windows 安装包 | `打包发布.cmd` | `npm run build:exe` |
| 只生成可运行目录 | — | `npm run build:dir` |
| 普通浏览器试玩 | 原 `start.cmd` | `npm start` |

新电脑先安装 Node.js 22.12+、Git 和 Git LFS。在克隆目录执行 `git lfs install`、`git lfs pull`，再双击 `初始化环境.cmd`，或依次执行 `npm ci`、`npm run setup`。初始化安装锁定的根目录/桌面依赖、Electron 开发运行时和 Playwright Chromium；首次需要联网，之后本地试玩与测试不需要联网。`npm ci` 也会还原用于提取武将的两个源码适配器，其源文件在 `tools/adapters`。

## 存档与端口

| 场景 | 页面 / 引擎端口 | 进度位置 |
| --- | --- | --- |
| 普通浏览器试玩 | 5174 / 5175 | 该地址 IndexedDB `noname-card-shop-world-v2` |
| 浏览器开发 | 5190 / 5191 | 开发地址独立 IndexedDB `noname-card-shop-world-v2` |
| 安装版或普通桌面启动 | 51740 / 51741 | `%APPDATA%\NonameCardShop` |
| 桌面开发 | 5192 / 5193 | 项目 `.local/desktop-dev` |
| 自动回归 | 系统分配空闲端口 | 临时浏览器上下文；桌面进度在该次 `test-results` 目录 |

新版开发工具支持安全刷新、暂停时钟和打开档案导出；既定原子存储保留世界进度。旧版空店、经营库存、第 7 天牌桌三套 localStorage 测试场景只在 `/legacy.html` 开发页提供，不导入新版世界。新版场景数据通过版本 2 的档案文件导入。

浏览器开发与普通试玩的隔离依赖端口，请固定使用上述入口。更换浏览器、端口或用户目录会显示该位置的新进度。迁移实际玩家存档用游戏导出/导入功能。测试不会访问正式桌面用户目录，也不会改普通试玩页面的 localStorage。

## 自动更新的范围

页面样式修改直接更新样式，不中断牌局。界面脚本、经营模块、JSON 配置、像素素材修改后，保存开发存档并整页刷新；正在对局或编辑任务/模块 JSON 时等待关闭后再刷新。模块配置的浏览器覆盖仍优先于项目默认文件，需要测试新默认值时使用编辑器“恢复项目默认”。

新版监视额外覆盖 `frontend/**`、`assets/frontend/**`、`modules/backend/**`、`integration/*.mjs` 与 `contracts/**`。任意窗口打开时等待关闭；玩家正在进行的小局结束后才自动重载。`npm run test:frontend` 跑真实集成，`npm run test:backend` 跑权威逻辑与原引擎，`npm run test:dev` 跑新版开发服务。`npm test` 默认组合 unit/backend/frontend/dev，旧 UI/桌面安装包不混入默认集成；历史 UI 单独 `npm run test:legacy`。

Node 的 `--watch` 监视已导入的服务端模块并重启后台，页面连接恢复后自动刷新。引擎上游目录不会因素材文件变化触发整页刷新；修改引擎或 `integration/duel.js` 后应重新开始测试对局。`dev/runtime.mjs` 的 `watchedFile` 是前端监视范围接口，`dev/client.js` 的 `blocked` 是推迟刷新条件接口。

桌面开发也会更新前端。修改 `desktop/main.cjs` 或 Electron 原生菜单后，使用“显示 → 重启桌面开发进程”，或关闭重开桌面开发。菜单还提供开发者工具。正在进行的完整引擎事件栈不会因刷新而恢复，沿用游戏已有的比赛中断恢复规则。

## 回归测试

`npm test` 按顺序运行下面五组。可以单独运行 `npm run test:unit`、`test:ui`、`test:engine`、`test:dev`、`test:desktop`；`npm run test:saves` 单测按天存档。每次创建带时间戳的目录，保存日志、界面截图和 JSON；`test-results/latest.json` 记录最近一次测试选择与结果。失败返回非零状态；测试超时会终止该测试拥有的进程树。依赖缺失时先执行初始化。

| 分组 | 验证内容 |
| --- | --- |
| unit | 订货/签收/库存守恒、日结/垃圾桶/债务、任务、模块迁移与事务、账本成本、比赛幂等结算、稀有度与 260 万包抽样；1300盒定额与冻结/拆卖/成本守恒；服务启停、占用回滚、私有目录不可访问 |
| ui | 实际浏览器旧存档迁移、配置校验、拆包、卡牌详情、NPC 成交、委托、保护卡、升级、次日清空、导出、移动布局；整盒采购/签收、实际120张定额与NPC整盒成交 |
| engine | 原版无名杀实际牌局：KOF 手牌继承与清理、杀的死亡边界、连锁阵亡/平局、BO3 两胜与单次奖励 |
| dev | 三个测试进度、真实文件监视、CSS 更新、对局/编辑器推迟刷新、后台重连与进度保留、开发与普通页面隔离 |
| desktop | 源码启动 Electron、沙箱、武将技能代码、原版对战、原生菜单导入/导出、自动备份、重启存档与端口释放 |

桌面组验证当前源码。另有 `npm run test:release` 验证 `build:dir` 生成的真实 exe（启动、技能、对战、导入/导出、备份和重启）；它需要先构建，不包含在默认回归中。发布前还需重建安装包并做实际安装、启动、卸载检查。`npm run verify:engine` 核对15876个运行引擎文件的大小与SHA-256，排除原包中450个用户配置/缓存文件；原始完整清单仍保留作来源记录。引擎定制优先放 `integration`。

## Git 日常使用

`v0.7.1-baseline` 标签对应建立仓库时的开发基线。原本地历史保留完整原包；发布副本 `.local/github-publish.git` 从所有导出历史中排除上游 Home 浏览器配置/缓存，绝不改写原目录或原历史。代码、配置、运行引擎均上传；大图片、音频等通过 Git LFS 保存。依赖、安装包、个人/测试进度、重复的旧 `assets/character` 卡图目录不上传，实际卡图在 `vendor/noname/image`。

修改前后查看：

```powershell
git status --short
git diff
git log --oneline -8
```

完成一项改动并通过相应回归后：

```powershell
git add app.js modules data docs
git commit -m "说明这次改动的目的"
npm run publish:private
```

按实际修改选择文件。对照初始版本使用 `git diff v0.7.1-baseline -- 文件路径`。Git 不管理玩家进度，回退代码不会自动恢复进度，改存档格式前先用游戏导出备份。

必须用 `npm run publish:private` 导出并推送，原仓库的直接push入口已禁用，防止误传原包缓存。导出历史的提交ID与原本地历史不同，消息和版本标签对应保留；发布脚本先确认目标为私有仓库，再检查所有导出对象没有 Home 路径。私有远程同时保存所需Git历史与LFS对象；迁机克隆后先 `git lfs pull` 再初始化。磁盘备份包含隐藏 `.git` 与 `.git/lfs/objects`，单独 `git bundle` 不含LFS大文件。个人存档另用游戏导出备份。

发布需要 GitHub CLI（`gh`）已登录且有该私有仓库权限；只做本地开发不需要。首次素材上传较大，进度保存在忽略的 `.local/lfs-upload-progress.log`，后续提交只传新增对象。

## 发布与模块扩展

启动前新增卡店存档管理，游戏内“存档”区分按天回退与即时备份。运行入口、独立数据库、顾客离店和 NPC 自然比赛验证见 [本轮修复](顾客访问与启动存档修复.md)。新菜单测试用 `node tests/profile-menu.mjs`；需要直接启动旧库做隔离自动化时使用 `?profile=legacy`。

2026-10-24：交易页面已从 Mock 样稿接入正式 Host，默认入口使用新采购/收藏/开包/市场/详情。接口、模块和截图见 [真实交易接入与维护](真实交易界面接入与维护.md)。`npm run test:trading` 单独验证相关业务与界面；`npm run art:products` 重建原创像素包装图。`?tradeUI=classic` 仅用于同存档兼容回归，不能作为隔离试玩环境。

开发入口直接运行源码；安装包是构建时的快照，改代码不会更新已经生成的 exe。打包命令自动设置 NSIS 所需的 `ELECTRON_BUILDER_7Z_FILTER=BCJ`，使用锁定依赖并禁用自动发布；输出在 `desktop/dist`。现有 0.7.1 安装包保留，开发工具改动后发布需重新构建。

游戏规则接口继续见 [MODULES.md](MODULES.md)、[TASK_AUTHORING.md](TASK_AUTHORING.md)、[BALANCE-V07.md](BALANCE-V07.md)。评分和卡池数据修改后运行 `npm run balance:build`，再运行对应回归。新增测试注册到 `tests/run.mjs` 的 `groups`；测试路径和端口通过环境传递，禁止写死个人目录或正式桌面端口。
