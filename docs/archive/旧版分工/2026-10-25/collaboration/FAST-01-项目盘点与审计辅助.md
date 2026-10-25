# FAST-01：高速模型的项目盘点与审计辅助

先读 [当前分工](2026-10-24-有限模型资源分工.md)。本包只做容易核对的事实整理，**不承担完整代码审计结论**；HQ-AUDIT 负责跨模块判断。

唯一可写：`D:\GameDev\NonameCardShop\deliverables\playability-v3\FAST-01\`。正式工程、Git、存档、其他交付只读。先记实际 HEAD/dirty 路径，不 checkout/reset/clean，不提交推送。

## 按清单执行

1. 用 `rg --files` 列自有源码/配置/契约/测试/工具/桌面/旧入口，按目录统计数量、文件类型和职责。跳过 node_modules、缓存、生成包体和 .git 的逐文件读取；vendor 单列第三方来源、体量与项目触达入口，不能全排除后写“全项目”。
2. 从 package scripts、README、server、frontend/main/app-shell、integration、desktop/main 和 tests/run 提取实际启动/默认/回退/legacy/试验入口与测试组；记录文件与行号，不猜引用关系。
3. 画简单模块依赖表：谁调用 Host、谁持有权威世界、哪些查询/命令在哪定义/调用、哪些页面仍旧实现。可写 AST/文本扫描辅助脚本，结果标为静态扫描，不冒充动态调用图。
4. 检查引用的本地文件是否存在、配置 JSON 是否可解析、PNG 是否是 LFS 指针、同名文档契约差异；只对能够确定的内容给证据。动态 import、URL、生成路径识别不了时标“需人工确认”，不能全报 missing。
5. 输出测试地图：测试名、针对默认/previous/classic/legacy/Mock 哪条路径、是否自启服务/用真 Host、是否看起来写存储；没有读到就写未知。只整理，不启动全库测试。
6. 列 TODO/空实现/可疑死引用线索，但必须标为线索，不报严重 Bug、不自行修复。不得输出个人配置、密钥、玩家存档内容。

## 输出

`README.md`、`baseline.md`、`inventory.csv`、`entrypoints.md`、`dependencies.md`、`test-map.md`、`leads.md`、`scripts/`、`DELIVERY.md`。每个线索含文件/行、扫描依据和置信度；数量为 0 也如实写，不追求报错数。

先交入口/测试表供 HQ-AUDIT 用，再补完清单。无需改正式配置、运行 `npm test` 或安装工具。完成后可由同一个高速模型继续 FAST-04，不需要额外模型。

可直接发送：请执行 `D:\GameDev\NonameCardShop\docs\collaboration\FAST-01-项目盘点与审计辅助.md`，只做全项目盘点、入口/调用/测试地图和有证据的机械检查，写自己的目录，供高质量模型审计使用。不要修正式代码，不把扫描线索写成已证实 Bug。
