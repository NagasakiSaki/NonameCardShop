# 无名卡店 Windows 桌面版 0.8.2

当前安装包：`NonameCardShop-0.8.2-Setup-x64.exe`，发布页 https://github.com/NagasakiSaki/NonameCardShop/releases/tag/v0.8.2 。Windows x64，自带运行环境，无需另装 Node.js。双击安装，可选择位置；桌面/开始菜单的「无名卡店」启动游戏。

0.8.2 同步当前经营界面、三种赛制（KOF 三将接力 / 斗地主换边 BO3 / 2v2 BO3）、按天回退存档、高手顺延与借款目标。此次新增地板移动采样优化、25 人四向独立待机、伙伴正面到岗，以及「高手伙伴 → 伙伴排班 → 约战赚钱（有输赢）」。伙伴下注采用后台模拟、营业不暂停，含游戏币托管、每日止损和收益流水。见根目录的 `docs/releases/v0.8.2.md` 和规则文档。

安装版仍用本机 51740/51741 端口，玩家资料保留在 `%APPDATA%\NonameCardShop`，更新不清空。开发页面 5190 和安装版分开保存；通过游戏内「存档」导出/导入新版世界 JSON，不直接复制浏览器数据库。每 30 秒及正常退出自动备份；进行中的原生牌局沿用中断恢复规则。F11 全屏，WASD/方向键移动，B 打开卡册。安装包未配置在线自动更新。

本地重建：先在根目录初始化依赖，运行 `npm run build:exe`。`npm run test:release` 针对真实 `desktop/dist/win-unpacked/NonameCardShop.exe` 使用独立档案验证原生菜单、导入导出、按天存档、沙箱与退出；不访问玩家目录。角色、场景与剧情资源均由 `config/project-layout.cjs` 统一纳入。

发布包没有发布者代码签名证书，未添加联网账号或遥测。游戏内权利与开源许可见安装目录 `resources/game/THIRD_PARTY_NOTICES.md`、`LICENSE` 与 `NONAME-LICENSE`。

## 历史记录：0.8.0（以下不作为当前玩法及维护口径）

源码更新（2026-10-24）：当前开发源码的原生菜单已适配新版 Host 世界存档与日档，构建清单已补新版前端/资源。验证命令为 `npm run test:desktop`；尚未重新发布 EXE。新版世界 JSON 与旧试玩 JSON 分开校验，不自动互转；下面 0.8.0 安装/旧数值说明保留为历史发布记录。

Windows x64 安装版，自带 Electron 45.0.0、Chromium、Node 运行环境、完整无名杀 v1.11.6、卡图与音频；无需另装 Node.js 或启动 start.cmd。默认安装到当前用户，可选择安装路径。

双击 NonameCardShop-0.8.0-Setup-x64.exe 完成安装，从桌面/开始菜单启动「无名卡店」。F11全屏；存档菜单可导入/导出进度。桌面程序使用51740与51741两个本地端口，和试玩页5174/5175分开；关闭程序时一起关闭，只允许启动一份。0.8.0新增24包实体卡盒、固定稀有度配额与整盒保底，旧库存仍作为散包保留，详见 docs/BOOSTER-BOXES.md。

浏览器试玩版的进度不会自动迁移。先在原试玩页「街坊与经营→库存账本→导出完整存档备份」，再到桌面菜单「存档→导入存档」。导入前自动备份当前桌面进度。新旧应用的存档互不覆盖。

桌面存档、日志与自动备份位于 `%APPDATA%\NonameCardShop`；菜单可直接打开。每30秒及正常退出保存 latest.json；导入前另存带时间戳的 before-import 文件。更新安装不删除存档，卸载默认保留存档。完整引擎牌局的事件栈仍不会保存，进行中的比赛按原有中断恢复规则处理。

游戏资源与可编辑模块位于安装目录 `resources/game`。核心参数继续维护 data/balance.json、power-model.json 等，评分修改后需重建卡表。桌面启动源码和锁定依赖位于 `resources/desktop-source`，Electron本体与Chromium许可证在安装目录。无名杀GPL及来源清单位于 resources/game/NONAME-LICENSE 和 data/engine-manifest.json。

源码开发：在游戏根目录执行 `npm ci`、`npm run setup`，之后双击根目录“桌面开发.cmd”。它使用5192/5193和项目 `.local/desktop-dev`，不覆盖正式桌面存档。界面自动刷新；原生菜单/主进程修改后从“显示”菜单重启桌面开发进程。详细流程见 `docs/DEVELOPMENT.md`。

重建：安装版内将 desktop-source 复制为 game/desktop，再在 game 根目录初始化开发环境；`npm run build:dir` 生成解包目录，`npm run build:exe` 生成NSIS安装包，自动设置 BCJ 压缩过滤器。构建使用锁文件；安装后的玩家无需这些开发工具。

本地构建未购买发布者代码签名证书，exe没有发布者数字签名。未添加更新器、联网账号或遥测。
