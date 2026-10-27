# 工程维护约定

先读 `README.md`、[架构与规则文档索引](docs/architecture/README.md) 和 `docs/architecture/工程目录与维护边界.md`。索引区分“现行”与“历史”，历史文档写着旧玩法不代表要回退实现。玩法以最新规则、配置和正式入口为准，历史任务书不能覆盖当前规则。

- 正式入口为 `frontend/index.html` → `integration/frontend-host.mjs` → `modules/backend/runtime.mjs`。`frontend-next/` 仍是正式交易界面的一部分，不能因名字含 next 就删掉。
- `modules/backend`、`modules/economy-v7`、`modules/progression`、`modules/narrative` 管理权威状态；前端提交意图。不得把资金、库存、奖励或真实胜负改为前端自行结算。
- 无名杀只保留 `vendor/noname` 一个上游源码来源，适配放 `integration/`。静态扫描看不到的动态技能、图片与音频不等于无用资源，不能按零引用批量删。
- 大范围重构前创建本机稳定备份：`npm run backup:stable`。先用 `-- --plan` 查看范围。备份不能放进工程内部，不覆盖现有快照。
- 保留任务外已修改的文件、外部模型候选交付和用户存档。自动测试仅使用独立浏览器上下文、内存仓库或测试专用桌面用户目录。
- 发行等级 `issuanceRarity` / 实物 `printedRarity` 与战力分级 `currentRarity` 分开。改评分不能重抽旧包盒、修改旧印刷或绕过解锁。
- 测试清单集中在 `tests/groups.mjs`。修改前用 `node tests/run.mjs all --list` 查看。测试要使用当前三模式、价格、固定发行及对话框；过时规格明确归档并记录替代检查，不能当作当前规则。
- `npm run audit:structure` 检查静态引用与模块边界；它的零引用候选不能作为自动删除依据。修改规则后运行相关组，跨结构改动用 `npm run test:all`；失败时可用 `--failed-from=报告/summary.json` 重跑，避免重复跑已通过的长链路。
- 桌面运行范围集中在 `config/project-layout.cjs`，构建接线在 `desktop/electron-builder.cjs`。新增运行目录必须同步登记，尤其不能漏剧情内容和接口定义。除非本次任务要求，不重打 EXE。
- 当前本地历史含上游旧用户缓存。公开更新必须用 `npm run publish:public` 的过滤发布副本，不直接从原仓库执行 `git push`。备份、存档、缓存、候选交付不上传。

当前只保留 KOF、斗地主换边 BO3、2v2 BO3。场景对话、默认日初回退和高手顺延属于正式行为；单将 BO3、标准包、旧分页界面及旧价格仅是历史记录。
