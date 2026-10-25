# 首周经济采样

```powershell
node tools/qa/first-week.mjs
node tools/qa/first-week.mjs --days 1 --out .local/first-day
node tools/qa/first-week.mjs --replay .local/first-week/initial-world.json --out .local/first-week-replay
node tools/qa/first-week.mjs --step 1 --out .local/first-week-fast
```

使用默认规则和经营配置、内存仓库、自然顾客与正常 Host 命令。默认每次推进 0.25 秒，`--step 1` 使用 Host 允许的 1 秒上限；不接受超过 1 秒的快进。到 20:00 后才结算打烊；后台 NPC 自然完成后收桌，不伪造胜负。输出只在本工程 `.local`，不读写玩家当前存档。`initial-world.json` 是本次自动新建世界的重放输入，不是奖励注入工具；不应把用户存档当测试夹具。报告记录实际步长与代码输入哈希，不把不同步长的采样当严格对照实验。

脚本采用固定进货/补货策略；单次随机世界不能证明经济已平衡。无浏览器与导航覆盖，不能替代默认 UI 首周试玩、真实引擎对战或剧情资格测试。毛利、营业利润、现金变化、任务奖励和债务分别记录；按日统计售出件数和离店转化，不汇总累计收银记录冒充日销量。

原 CV6-02 的脚本把 60 秒一次传给最多推进 1 秒的 Host，且混用了奖励/比赛收入、当日/累计销量，并把断货数写死为 0。本工具已替换该测量路径；原“七日稳定盈利/零阻塞”结论不作为验收证据。
