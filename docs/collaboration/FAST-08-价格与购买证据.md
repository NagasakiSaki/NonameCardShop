# FAST-08：当前价格、预算与拒买原因证据

先读 [总分工](2026-10-24-窗口与牌桌新版分工.md)。唯一可写 `D:\GameDev\NonameCardShop\deliverables\playability-v4\FAST-08\`。本包只读分析、隔离采样与整理，**不改价格/强度/顾客规则，不自行设计新的“权威评分”**。用户将后续补新方法；现有数据采集不受此依赖阻塞。

## 只读入口

`modules/backend/{catalog,supply-pricing,products,distribution,trading,visits,customer-identity,management,world,runtime}.mjs`、`data/backend-rules.json`、`data/power-model.json`、`data/cards.json`、`data/shop-experience.mjs`、`contracts/card-shop-host.d.ts`。用实际有效主题数，不硬抄旧文档19。

## 输出证据

1. `prices.csv/json`：有效productId/名称、现版平均强度、分档、包/盒采购/建议零售、盒折扣、盒内固定稀有度数量、报价/发行版本。区分建议零售价与货架实际要价。
2. `budgets.csv/json`：不同顾客的初始/每日预算、消费倾向、价格上限、购买数量、对盒/包的选择条件。写精确代码/配置出处；不能只凭中文姓名猜类别或预算。
3. `purchase-path.md`：货架可用 → 在店/走到柜台 → 预算/动机/售价可接受 → 选择商品 → 钱与库存转移 → 店内开包/离开。给实际拒买原因或代码条件，明确不可观测的环节。
4. `scoring-map.md`：当前评分字段、来源/版本、规则估计与校准、BO3/KOF权重、阈值与价格映射、缺失/人工值；只整理后续新方法需要接的字段，不以旧模型自称新标准。
5. 隔离对照少量代表商品：当前建议价、预算内候选较低价、无库存/不可达/其他拒买。可在内存世界构造前置，明确合成/真实经营区别；不通过无限钱包、强制成功或跳过交易实现给出“降价后卖得好”的假结论。
6. 提供 `findings.md`：测得事实、待主模型定位、设计建议三栏；列新档首轮可采购量/经营现金与赠品、采购成本/实际成交净收益的口径。可列备选价格区间供主模型取舍，不改规则落地，不擅自搜索/搬用其他游戏价格当强度标准。

## 限制与交付

使用项目现有Node/Playwright，`startShopServer({port:0,enginePort:0})`、新context或memoryRepository；脚本、原始结果只写本目录，不连接玩家页面/档案。每次记录HEAD、相关dirty、规则与输入、种子（若可用）、观察时长、样本量、实际成交与拒绝。未观察到成交不等于价格必然错，不能从一次随机结果得出转化率结论。

README、DELIVERY、gaps、scripts/、raw/、上述表格和报告。运行必要小样本即可，不跑全库、不自动长期挂机、不装外部经济工具。主模型统一判断可负担价格与后续新评分接入。

可直接发送：请执行 `D:\GameDev\NonameCardShop\docs\collaboration\FAST-08-价格与购买证据.md`，只整理当前真实价格/预算/购买条件与可复现实验，等待用户后续强度方法，不修改正式经济。
