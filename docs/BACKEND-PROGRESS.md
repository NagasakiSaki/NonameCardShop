# 新版后端逐步清单与接入说明

更新日期：2026-10-23。当前已完成第三批前后端集成，根入口已切换新版，旧页面保留在 legacy.html；exe 未更新。

## 逐步清单

| 顺序 | 内容 | 当前状态 |
| --- | --- | --- |
| 1 | 正式 Host 契约、独立模块和入口 | 已完成；`integration/frontend-host.mjs` 导出 `createHost()` |
| 2 | 新世界、原子存储、暂停令牌、开发旧档重置 | 已完成；独立 IndexedDB、并发版本检查、失败不提交 |
| 3 | 全局评分、四档、各主题动态配方与报价 | 已完成；全目录重算，模型变更生成新评分版本，下一营业日发行新品 |
| 4 | 进货、送达、签收、密封零售、实体盒、批量开包、留一上架 | 已完成基础闭环；真实实物、固定内容与成本守恒 |
| 5 | 二级市场、流通登记、NPC 钱包与持卡 | 已完成基础闭环；顾客购买后开包、真实持卡、有效挂单开放流通资格 |
| 6 | 对战房、战绩、托管、按天存档 | 无赌注玩家与 NPC 自动对战、整场战绩与日档已接入；下注托管原语已写，实际下注仍关闭 |
| 7 | 设施、员工、街坊预约 | 已完成基础闭环；实际容量/服务效果、轮班、日结工资、预付款托管、交卡与到期退款 |
| 8 | 新前端正式联调与开发入口 | 已完成；真实营业日、BO3、档案文件导入导出通过，开发监视覆盖新版目录 |

后续继续：完整牌局恢复与下注开放、特殊技能兼容与长期数值平衡。已有基础闭环不代表全部武将技能均已验证。

## 文件边界

- 后端：`modules/backend/*.mjs`、`data/backend-*.json`、`integration/frontend-host.mjs`、`integration/host-battle.mjs`、`integration/npc-engine.mjs`；共用引擎适配仅修改 `integration/engine-preload.js` 与 `integration/duel.js`。
- 正式类型：`contracts/card-shop-host.d.ts`；地图元数据规格：`contracts/map.schema.json`。
- 前端模型交付已独立保存为 `7875aedf`；主模型在此基础上完成接口、交互和开发工具集成，保留美术源文件和历史验收记录。
- 静态服务已支持 `.mjs`；根 HTML 转入新版，旧入口原样保存在 legacy.html，安装包未更新。

## 前端现在可以接入

```js
const {createHost} = await import('/integration/frontend-host.mjs');
const host = await createHost();
const connection = await host.connect({
  contractVersion:'card-shop-ui/1.0',
  clientId:crypto.randomUUID()
});
const unsubscribe = host.subscribe(event => {
  // snapshotUpdated / actorsUpdated / battleStatusChanged / worldReset
});
```

`createHost()` 本身不会 connect；连接后经营时钟由后端计时，不需要 Phaser 每帧 tick。`connect().capabilities` 是真实能力开关，尚未接入的内容不要用旧全局函数绕过。

首次启动这个新 Host 会建立 `noname-card-shop-world-v2` 数据库，然后按用户授权定向清理该地址的旧卡店键与旧日档库；不会清整个浏览器存储，不删除引擎目录。**根入口现已调用新版前端和 Host。** 普通浏览器、开发端口、Electron 的存储仍相互隔离。

### 实际参数约定

- `products.quote`：`{productId, quantity, unit:'pack'|'box', action:'purchase'}`。
- `supplier.placeOrder`：payload 同商品参数，加可选 `credit`；`quoteId` 在请求顶层。
- `opening.preview`：`{includeBoxes:true|false, quantity?, productId?, inventoryRefs?}`；省略 quantity 预览全部可用仓库包，提供时只选指定包数。从盒中只开一部分时，其他密封包保留原内容和分摊成本。
- `opening.execute`：顶层 `previewId`，payload 可为空；同一次重试复用 requestId。
- `inventory.surplusPreview`：`{mergePrints?:boolean, rarity?}`。
- `market.listSurplus`：顶层 `previewId`；payload `{multiplier:1}`，允许 0.5～2。
- 单件操作使用 `inventoryRef`；`inventory.list` 默认返回实体行，`owned=1`，`grouped:true` 返回后端按卡种/印刷版/位置聚合的卡片行与实际 inventoryRefs。前端显示 ×数量，提交仍使用具体实物引用，不凭聚合数改库存。
- `inventory.setProtection`：`{inventoryRef,protected:true|false}`。
- `market.placeListing`：`{inventoryRef,amount?}`，省略 amount 使用当前后端参考价。
- `market.quote`：`{listingId,quantity:1}`；`market.acceptTrade` 带同一 listingId 和顶层 quoteId。
- `combat.eligible` 返回 `{mode,slots,items}`。`combat.preview`：`{mode,opponentId?,inventoryRefs,tableId?,withStake:false}`，对手来自 `management.people.customers` 且实际有可用牌；省略 opponentId 时选择空闲且实际持卡的 NPC。
- `combat.register`：顶层 previewId；返回顶层 matchId 与 `data.match` 兼容别名。`combat.start` 的 payload 为 `{matchId}`。
- `host.battle.mount({container,matchId})` 可在 start 成功后调用，也可自动启动已登记/中断/待下一局的玩家比赛；BO3 下一局先 dispose 旧挂载，再 continue 或重新 mount。不能挂载/认输 NPC 自主比赛。
- `combat.cancel`：取消未开局比赛并退还托管费用。`combat.surrender` 的 scope 为 `bout` 时认输 BO3 小局，其他情况按整场退赛。
- `saves.export` 返回 `{fileName,mimeType,content}`，由前端下载；`saves.import` 接收 `{content:文件文本}`。

响应的 `ok=false` 是业务失败，不当成空列表；异常/断线后通过 `operations.get` 查询原 requestId。成功命令记录在数据库中，刷新后重复请求不会再次扣款。库存变动会使批量预览失效。

暂停采用 `host.pause.acquire({ownerId,reason})` / `release(leaseId)`。背包、详情、确认框分别持有自己的令牌，全部关闭后才恢复；玩家战斗独立执行，店铺时间暂停。

玩家显示实体 ID 为 `actor:owner`；库存归属仍为 `ownerId:'player'`，两者不要混用。

### 设施、员工和街坊接口

- `management.upgrades` 返回 `{available,capacity,items}`；每行含 upgradeId、name、level、maxLevel、nextCost、dailyCost、effect、unlocked。`upgrades.purchase({upgradeId})` 实扣购置费。
- `management.people` 返回 `{items:员工,neighbors:街坊,customers:实际顾客}`。员工行含 personId、role、wage、hired、mood；街坊行含 personId、relation、dialog、pending；customers 含 actorId、budget、ownedCards。
- `management.orders` 返回 `{items}`，含未签收进货单及有效街坊请求；单卡请求以 kind 区分 purchase（街坊求购）和 offer（街坊出售已有实物）。
- `neighbors.act({personId:'staff:cashier'|'staff:stocker',action:'hire'|'schedule',onDuty?})` 雇用/排班；休息停用效果，合同工资仍在日结支付一次。
- `neighbors.act({personId,action:'talk'})` 每天只增加一次关系；`action:'accept',orderId` 扣买家钱包转入托管；`action:'deliver',orderId,inventoryRef?` 交付同卡种的可用收藏副本并结算；`decline` 或过期退还预付款。街坊出售自己的卡必须明确 `action:'buy'`，不会因接任务自动扣店主钱。
- `config.list` 返回 `{items,permissions}`。`config.validate` / `config.apply` 接受 `{configId,value}` 或 `{configId,draft:JSON文本}`；支持 backend-rules 与 backend-management。已报价订单冻结金额与到期日，不允许删去有有效订单的街坊、删除已购设施或改写已雇员工工资合同。

`data/backend-management.json` 留出容量、员工效果、补货周期/目标/仓库保留量、工资、解锁日、街坊预算/台词/报价/期限的调整接口。当前基础货架 36 位，一盒占 4 位；升级货架每级增加 12 位。补货员每 30 游戏分钟从真实仓库补到每种 3 包，并保留至少 1 包；不生成商品。展示柜影响新客初始资金，外部资金有记录。牌桌升级增加服务费，不创建地图外的桌位。

### NPC 真实引擎后台比赛

Host 连接后，`integration/npc-engine.mjs` 调度一个独立无名杀 iframe。只选实际持有可用流通卡且付得起桌费的两名 NPC，走门口路径入座，再由原引擎托管 AI 完成 BO3。NPC 保留自己的钱包、卡片与冷却；店主比赛不会占用该后台控制器。

当前最多一场后台比赛，默认每 45 游戏分钟尝试开桌、每位 NPC 冷却 90 分钟。每局最多 60 回合，三次平局结束整场；这些参数在 backend-rules 内。技术错误或停滞按中断作废处理，不生成随机胜负。开局前退款；引擎 ready 后服务费已经取得，技术作废不新增胜率。

任一交互暂停令牌会暂停后台引擎与经济更新。暂停期间已经到达的 ready/result 先持久化排队，恢复后按顺序应用；重连保留这些待处理事件。玩家桌和 NPC 桌分别使用 `packer_match_v1_` 与 `packer_npc_match_v1_` 引擎配置前缀，玩家桌不会开启全自动。BO3 整场只收费一次、各参赛武将只登记一次整场战绩；NPC 统计不触发店主亲自参赛任务。

## 全局评分与产品版本

现有逐将校准/初估的 `power.vector` 是输入，后端通过 `backend-rules.json.scoring` 的统一权重重算 BO3、KOF 与综合分。它包括牌差、伤害、防御、回复、控制、牌质、成本、主动失血和接力收益，不再在主题内重新排名。

当前分界：N <57，R 57～<65，SR 65～<78，SSR ≥78。所有主题使用同一界线；高分但低可信的条目继续显示 estimated，不能冒充真实实战胜率。

模型、分界与模式权重生成评分版本摘要。各主题按四档真实卡种数与稀缺权重生成不同配方，24×5 的整盒固定数量与每包 R+ 小保底同时成立，至少一张 SSR；缺档明确使用全局同档补位。单卡种占比、槽位概率和每包至少一张概率分别返回。

新规则通过 `config.apply` 设置；全局评分可更新，密封产品的新版配比与报价在下一天发布。已下单商品保留产品快照，已生成盒不重抽。印刷稀有度与当前全局稀有度可不同。

次日新供货价还会吸收已验证战绩/成交形成的参考行情，单卡对发行估值的影响限制在其强度基准价的 85%～115%；挂单天价不直接代入采购报价。

## 市场与日档

- 玩家私人开包不开放市场资格。实际有效挂单、顾客购买后实际开包才登记；撤单不抹去历史。
- NPC 有有限钱包与实体卡，不凭流通资格创造牌。新顾客资金和次日外部收入有明确事件记录。
- 已有前端地图时，后端规范化其导航格式，顾客按路线去柜台；没有地图时 `navigation=false`，可做纯业务联调，不伪造地图。
- 零售只接受包/盒，单卡进入二级市场。自营卡出售记商品收入，NPC 寄售佣金单列。
- 真实引擎完成的整场才写战绩；BO3 两胜只记一次。KOF 记录实际上场者的队伍胜率，和 BO3 分开。
- 新一天按平滑战绩和有限供需更新参考价，受每日涨跌幅约束，不把挂单天价直接当成交价。
- 日起点、打烊、手动和读档前备份在同一原子记录中保存。读档恢复整份世界并创建分支，资金、持卡、市场、战绩和价格一起回退。

## 尚未开放的部分

1. **下注：** 托管、退款、整场分配、NPC 稀有度倍率提议已有独立实现；当前规则和能力开关强制禁用实际下注。原因是现有无名杀运行事件栈、全部随机源与操作日志尚不能完整恢复。不能通过配置或导入档案绕过。
2. **完整恢复：** 无赌注中断局当前可重开小局，已经完成的小局、费用与待处理事件保留；尚不能恢复引擎完整事件栈、手牌与每一步随机状态。
3. **技能全适配：** 已移除 25 将白名单，按持有与流通准入；特殊技能仍需逐项兼容。可用 `compatibilityBlocks` 明确记录故障原因，不宣称 2563 位均已实测。
4. **美术继续完善：** 当前已集成首版原创像素素材，表情差分、更多家具变体和最终美术品质仍可继续迭代。

## 本批验证

第一批已通过以下基础链路，本次没有重复跑旧版全套大回归：

- `node tests/backend.mjs`：全局评分权重、26 主题盒配额、小保底、暂停、失败回滚、重复请求、成本、市场、NPC 购卡、次日清桶与读档分支。
- `node tests/backend-browser.mjs`：真实 IndexedDB 重连、旧卡店键定向清理且保留无关键、真实无名杀 BO3 2:0、只计一次战绩和开桌费。

第二批只验证新增链路：

- `node tests/backend-management.mjs`：设施容量、员工效果/工资、每日对话、实物预约与托管到期退款、自动补货；NPC 实际持卡、暂停中结果持久化与重连、BO3 一次收费/战绩、未入座取消时安全返店。
- `node tests/npc-engine-browser.mjs`：真实引擎 NPC 托管 AI 与暂停恢复，实际引擎 BO3 2:0 只收费记账一次，玩家桌仍为手动。为压缩耗时，在确认 AI 已开始实际回合后，通过引擎角色阵亡完成后续结算；不把它当作长时间 AI 胜率或全部技能压力测试。
- 第三批新增 `tests/backend-views.mjs`（局部拆盒守恒、真实聚合持仓、市场分流、现金流与利润分开）和 `tests/frontend-integration.mjs`（真实新版页面的一天与 BO3、文件读写）；`tests/frontend-development.mjs` 验证开发自动刷新和端口存档隔离。
- `npm run test:backend` 包含五项；`npm run test:frontend` 验证正式集成，`npm run test:dev` 验证新版开发服务。历史 UI 套件使用 `npm run test:legacy`；本批没有重建 exe。
