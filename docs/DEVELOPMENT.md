# 开发、测试与版本管理

项目根目录为 `D:\GameDev\NonameCardShop`。所有工具按自身位置解析路径，整个目录可以再次搬迁。本机已初始化本地 Git；尚未关联远程仓库或上传 GitHub。

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
| 普通浏览器试玩 | 5174 / 5175 | 原浏览器该地址的 localStorage |
| 浏览器开发 | 5190 / 5191 | 浏览器开发地址的 localStorage |
| 安装版或普通桌面启动 | 51740 / 51741 | `%APPDATA%\NonameCardShop` |
| 桌面开发 | 5192 / 5193 | 项目 `.local/desktop-dev` |
| 自动回归 | 系统分配空闲端口 | 临时浏览器上下文；桌面进度在该次 `test-results` 目录 |

开发版右下角“开发工具”可以载入空店、经营库存、第 7 天牌桌三个测试进度，也可暂停时钟、导出测试进度。载入前有确认，并把当前开发进度备份到该地址的 `noname-dev-before-fixture`；这些按钮只在开发服务出现。`dev/fixtures.json` 可添加测试场景，使用与正常导入相同的存档迁移和模块初始化。

浏览器开发与普通试玩的隔离依赖端口，请固定使用上述入口。更换浏览器、端口或用户目录会显示该位置的新进度。迁移实际玩家存档用游戏导出/导入功能。测试不会访问正式桌面用户目录，也不会改普通试玩页面的 localStorage。

## 自动更新的范围

页面样式修改直接更新样式，不中断牌局。界面脚本、经营模块、JSON 配置、像素素材修改后，保存开发存档并整页刷新；正在对局或编辑任务/模块 JSON 时等待关闭后再刷新。模块配置的浏览器覆盖仍优先于项目默认文件，需要测试新默认值时使用编辑器“恢复项目默认”。

Node 的 `--watch` 监视已导入的服务端模块并重启后台，页面连接恢复后自动刷新。引擎上游目录不会因素材文件变化触发整页刷新；修改引擎或 `integration/duel.js` 后应重新开始测试对局。`dev/runtime.mjs` 的 `watchedFile` 是前端监视范围接口，`dev/client.js` 的 `blocked` 是推迟刷新条件接口。

桌面开发也会更新前端。修改 `desktop/main.cjs` 或 Electron 原生菜单后，使用“显示 → 重启桌面开发进程”，或关闭重开桌面开发。菜单还提供开发者工具。正在进行的完整引擎事件栈不会因刷新而恢复，沿用游戏已有的比赛中断恢复规则。

## 回归测试

`npm test` 按顺序运行下面五组。可以单独运行 `npm run test:unit`、`test:ui`、`test:engine`、`test:dev`、`test:desktop`。每次创建带时间戳的目录，保存日志、界面截图和 JSON；`test-results/latest.json` 记录最近一次测试选择与结果。失败返回非零状态；测试超时会终止该测试拥有的进程树。依赖缺失时先执行初始化。

| 分组 | 验证内容 |
| --- | --- |
| unit | 订货/签收/库存守恒、日结/垃圾桶/债务、任务、模块迁移与事务、账本成本、比赛幂等结算、稀有度与 260 万包抽样；服务启停、占用回滚、私有目录不可访问 |
| ui | 实际浏览器旧存档迁移、配置校验、拆包、卡牌详情、NPC 成交、委托、保护卡、升级、次日清空、导出、移动布局 |
| engine | 原版无名杀实际牌局：KOF 手牌继承与清理、杀的死亡边界、连锁阵亡/平局、BO3 两胜与单次奖励 |
| dev | 三个测试进度、真实文件监视、CSS 更新、对局/编辑器推迟刷新、后台重连与进度保留、开发与普通页面隔离 |
| desktop | 源码启动 Electron、沙箱、武将技能代码、原版对战、原生菜单导入/导出、自动备份、重启存档与端口释放 |

桌面组验证当前源码。另有 `npm run test:release` 验证 `build:dir` 生成的真实 exe（启动、技能、对战、导入/导出、备份和重启）；它需要先构建，不包含在默认回归中。发布前还需重建安装包并做实际安装、启动、卸载检查。`npm run verify:engine` 单独核对上游 16326 文件的大小与 SHA-256，修改上游会使它失败；引擎定制优先放 `integration`。

## Git 日常使用

`v0.7.1-baseline` 标签对应建立仓库时的完整开发基线，提交 `6f694784`。代码、配置、上游引擎均已纳入；大图片、音频等通过 Git LFS 保存。依赖、安装包、个人/测试进度、重复的旧 `assets/character` 卡图目录不入库，实际使用卡图保存在 `vendor/noname/image`。

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
```

按实际修改选择文件。对照初始版本使用 `git diff v0.7.1-baseline -- 文件路径`。Git 不管理玩家进度，回退代码不会自动恢复进度，改存档格式前先用游戏导出备份。

目前只有本地版本历史，仍需要磁盘备份。备份整个项目时包含隐藏 `.git` 和其中 `.git/lfs/objects`；单独 `git bundle` 不包含 LFS 大文件内容。以后接入远程时同时推送 Git 与 LFS 对象，迁机克隆后先 `git lfs pull` 再初始化。

## 发布与模块扩展

开发入口直接运行源码；安装包是构建时的快照，改代码不会更新已经生成的 exe。打包命令自动设置 NSIS 所需的 `ELECTRON_BUILDER_7Z_FILTER=BCJ`，使用锁定依赖并禁用自动发布；输出在 `desktop/dist`。现有 0.7.1 安装包保留，开发工具改动后发布需重新构建。

游戏规则接口继续见 [MODULES.md](MODULES.md)、[TASK_AUTHORING.md](TASK_AUTHORING.md)、[BALANCE-V07.md](BALANCE-V07.md)。评分和卡池数据修改后运行 `npm run balance:build`，再运行对应回归。新增测试注册到 `tests/run.mjs` 的 `groups`；测试路径和端口通过环境传递，禁止写死个人目录或正式桌面端口。
