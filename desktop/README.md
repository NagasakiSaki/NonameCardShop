# 无名卡店 Windows 桌面版 0.7.1

Windows x64 安装版，自带 Electron 45.0.0、Chromium、Node 运行环境、完整无名杀 v1.11.6、卡图与音频；无需另装 Node.js 或启动 start.cmd。默认安装到当前用户，可选择安装路径。

双击 NonameCardShop-0.7.1-Setup-x64.exe 完成安装，从桌面/开始菜单启动「无名卡店」。F11全屏；存档菜单可导入/导出进度。桌面程序使用51740与51741两个本地端口，和试玩页5174/5175分开；关闭程序时一起关闭，只允许启动一份。

浏览器试玩版的进度不会自动迁移。先在原试玩页「街坊与经营→库存账本→导出完整存档备份」，再到桌面菜单「存档→导入存档」。导入前自动备份当前桌面进度。新旧应用的存档互不覆盖。

桌面存档、日志与自动备份位于 `%APPDATA%\NonameCardShop`；菜单可直接打开。每30秒及正常退出保存 latest.json；导入前另存带时间戳的 before-import 文件。更新安装不删除存档，卸载默认保留存档。完整引擎牌局的事件栈仍不会保存，进行中的比赛按原有中断恢复规则处理。

游戏资源与可编辑模块位于安装目录 `resources/game`。核心参数继续维护 data/balance.json、power-model.json 等，评分修改后需重建卡表。桌面启动源码和锁定依赖位于 `resources/desktop-source`，Electron本体与Chromium许可证在安装目录。无名杀GPL及来源清单位于 resources/game/NONAME-LICENSE 和 data/engine-manifest.json。

重建：将 desktop-source 复制为 game/desktop，在此目录用 Node.js 22.12+ 执行 `npm ci`；`npm run pack` 生成解包目录；PowerShell执行 `$env:ELECTRON_BUILDER_7Z_FILTER='BCJ'` 后运行 `npm run dist` 生成NSIS安装包。构建使用锁文件；安装后的玩家无需这些开发工具。开发模式首次运行需要 `npx install-electron`，或先运行pack自动下载运行环境。

本地构建未购买发布者代码签名证书，exe没有发布者数字签名。未添加更新器、联网账号或遥测。
