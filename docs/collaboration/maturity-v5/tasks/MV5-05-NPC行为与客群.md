# MV5-05：NPC行为与客群

**只执行此包；这是后续任务，不表示已经下发或实现。** 先读 `docs/collaboration/maturity-v5/README.md`、`02-接口版本与内核升级设计.md`、`03-协作边界与验收规范.md`、`05-验收场景矩阵.md`。不需要用户重复粘贴整个对话。

- 工程：`D:\GameDev\NonameCardShop`；起始参考 HEAD `3472cec4`，实际以启动记录为准，不重置。
- 唯一可写目录：`deliverables/maturity-v5/MV5-05/`；正式源码/数据/素材/vendor/其他交付只读。
- 执行能力：高速代码模型；先纯决策，后接入 patch。
- 正式验收依赖：MV5-02。依赖未齐可先盘点/样例/纯逻辑，不造成功回调冒充接入。

## 目标

让 NPC 拥有可解释需求和完整离店路径，同时协调购物、拆包、拾牌、参赛与复访。

## 最小只读输入

modules/backend/visits.mjs、customer-identity.mjs、trading.mjs、trash.mjs、match-queue.mjs、npc-tables.mjs、management.mjs；tests/customer-visits.mjs、customer-trash.mjs、core4-matchmaking.mjs；MV5-02 阻塞。

## 分步工作

1. A：列出现有 NPC 状态/优先级/锁拥有者，画一次完整访问。提出单一意图仲裁器的最小候选；已有任务不被参赛抢走，同一 NPC 不双重入桌或堵门。

2. B：实现纯决策/状态转换模块及接入 patch，覆盖购买/缺货/贵价/拆包弃牌/贫穷拾牌/候战/参赛/退场。预算、实物、流通沿用现有权威函数。

3. C：加入少量可配置客群偏好与复访理由，交自然客流观察；顾客不足时活动解释/延期，不能凭空填满名单。检验新局门口、满场和打烊均可离场。

## 专项交付

src/intent-policy.mjs 与必要局部模块；config/customer-profiles.json；patches/；tests/正常访问+拥挤/取消/失败；npc-state-map.md、evidence/。

另交 `DELIVERY.md`、`manifest.json`、`gaps.md`，格式见共享规范和 `DELIVERY模板.md`。代码需要目标路径映射、最小 patch、自包含测试、固定依赖与复现命令；研究/采样需要结构化证据和来源。

## 验收标准

B03/B04/B05/C02/C05；每个意图有退出/超时，异常不吞掉整世界 tick；卡与钱包不复制、不因赶人清空库存；profile/昵称只在批准配置内。

每条结论标证据种类、输入/基线与未覆盖项；仅跑本包必要场景。当前已实现 API 与共享草案新 API 分开；没有绑定的接口写候选，不填假数据 0 或假成功。

## 本包边界

不另建 NPC ID/钱包/持卡库；不全量重写 visits；与 09 只通过活动意图/状态合同交互。

所有动态操作用本包 sandbox、临时端口、新浏览器 context/内存仓库。不要动玩家真实档、标签页、原图或不属于你的进程；不提交推送、不直接调用其他模型。完成后由用户回收，MV5-17 沙盒接入、MV5-16 独立复核，主模型最终审定合并。
