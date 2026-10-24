# card-shop-ui/1.0 集成约定

2026-10-24 可玩性后端第一批已增加经营观察、可跳过的三日引导、事件来源记录和可选交流会，仍为 v1 兼容扩展。接口与口径见 [经营体验接口](经营体验接口.md)，类型见 `shop-experience.d.ts`。A/B/C 不用改自己的交付目录边界；候选仍使用 Mock，主模型最终接入。

权威方法定义：`card-shop-host.d.ts`；地图格式：`map.schema.json`。下面固定本次已集成的具体负载，后续页面不自行推导缺失金额或修改库存。

## 公共规则

- command 输入 `{requestId,type,payload?,quoteId?,previewId?}`；requestId 仅允许字母/数字/下划线/连字符、最长 150 字符。同一操作重试必须复用 ID 与参数；成功结果在新世界数据库中持久化。
- 成功记录绑定世界与分支。读档后重试旧分支操作会返回 STALE_OPERATION，补查为 stale，避免把旧结果当成新分支成交。
- query/command 返回 `{ok:true,revision,data}` 或 `{ok:false,error:{code,message,retryable}}`；业务失败不能当空列表。
- `operations.get({requestId})` 返回 `{status,result?}`，成功原响应在 result，业务负载在 `result.data`。开包补查读取 `result.data.opening`。
- 金额为整数游戏币，currency.minorUnit=1。概率为 0～1，平均张数允许小数。
- 所有交互窗口持有独立暂停令牌；没有成功申请暂停前不提交。关闭后释放，包括“申请完成前已关窗”的情况。

## 目录、库存、开包

第三版配盒：新发行仅保留 19 主题，商品含 `collationVersion`，每包 4 个 N/R 基础槽与 1 个 R/SR/SSR 进阶槽；配比、价格与历史实物兼容见 [卡包配盒与角色第三版](../docs/卡包配盒与角色第三版.md)。`catalog.list` 默认在售目录，`includeRetired:true` 查询历史完整卡种；旧 `catalog.detail` 引用保持有效。

| 接口 | 具体约定 |
| --- | --- |
| products.list | 分页 `{items,total,nextCursor}`；商品含 themeName/name、unitAmounts（采购价）、prices.pack/box.wholesale/retail、全局评分版本、配比与盒定额；unavailable 商品不能询价 |
| products.quote | 输入 productId、quantity、unit='pack'/'box'；返回 quoteId、unit、unitAmount、totalDebit、版本等；下单保留原 quoteId |
| supplier.orders | 分页；行含 orderId、themeName、productVersion、quantity、unit、total、status（pending/arrived/received）；仅 arrived 可签收 |
| supplier.placeOrder / receive | 成功返回 orderId / `{inventoryRefs,stock:{packs}}` |
| inventory.list | 默认每个实物一行；指定 grouped:true 返回按 cardKey/printVersion/printedRarity/location 聚合的卡片行；含 inventoryRefs、owned、available、protected、locked、listed。状态可重叠，available 由后端计算 |
| inventory.sealedSummary | `{items,total}`；按 productId/productVersion/kind 聚合包/盒；含 owned/warehouse/available/onShelf/protected/locked、可用仓库 inventoryRefs、可用货架 retailRefs、公开 spec。不得包含 cards/packets 等密封内容 |
| catalog.detail | 输入 cardKey、可选 includeCode；返回真实 holdings、copies、printings、referencePrice.amount、当前全局分级、技能、stats.bo3/kof（games/sessions、胜负平）、流通和准入说明 |
| opening.preview | 输入 quantity?、includeBoxes?、inventoryRefs?、productId?；省略 quantity 为全部可用包；返回 previewId、packs、cards、boxes、excluded。部分拆盒剩余包保持原内容 |
| opening.execute | 顶层 previewId；返回 `{operationId,cards,packs,opening:{packs,byRarity,results}}`；results 含名字/卡图/印刷稀有度/isNew 与实物引用 |
| inventory.surplusPreview | 返回 previewId、keep=1、newListings、alreadyListed、lockedExcluded、estimatedFee、quantity；market.listSurplus 带顶层 previewId，返回 created 与真实 listings |

## 原子采购购物篮（2026-10-24）

- `supplier.basketQuote({lines:[{productId,unit:'pack'|'box',quantity}]})` 只冻结报价，不扣款、不订货、不改变存档。1 至 38 行，每行 quantity 为严格整数 1 至 20，禁止数字字符串、缺失单位和重复的 productId + unit；客户端应先合并同商品同单位的数量，超过 20 需减少数量。
- 返回 `SupplierBasketQuote`：`quoteId`、`kind:'supplier-basket'`、`lines`（productId/themeName/unit/quantity/unitAmount/total/productVersion/priceVersion）、`totalDebit`、`cashDebit`、`creditDebit`、`availableCash`、`supplierCreditAvailable`、`validUntil:{day,minute:1200}`。金额全部来自当前商品批发价；包和盒是独立商品行。cashDebit/creditDebit 为询价当时的现金与授信补差预估，不冻结余额。
- 下单 `command({requestId,type:'supplier.placeBasketOrder',quoteId,payload:{}})`；站位、准备/营业期间限制与旧采购相同。现金不足部分自动使用剩余供应商授信，仅记欠款，不增加现金；确认 UI 应明确显示可能使用的授信。
- 命令重新核对当前可售状态、商品版本、价格版本、实际单价及资金。所有行在一次事务内创建普通订单；任意行或总资金不合格则全部拒绝。返回 `{orderIds,orders,totalDebit,cashDebit,creditDebit}`，现金与授信金额为实际扣款；订单沿用普通延迟和签收入口。
- 跨日、读档/导入建立新分支后旧报价无效；成功下单重试必须复用原 requestId 和参数，返回原结果，不重复扣款或下单。其他来源报价不能用于购物篮下单。旧单行接口保持原语义。

## 零售、市场、账目

2026-10-24 交易视图补充：聚合库存行新增 `availableRefs`（仅未保护、未锁定的可售收藏）与 `referencePrice.amount`；`retail.list.shelves` 新增 productId，unitAmount 对应第一件在架实物；`market.list` 行新增玩家实际 holdings。买入/本店挂单的 rarity 筛选实际印刷版，求购与成交历史筛选当前全局分级。新旧字段兼容，正式入口说明见 [真实交易接入](../docs/真实交易界面接入与维护.md)。

- 查询 `retail.list` 是货架视图 `{shelves,capacity,used,note}`；每组含 inventoryRefs（在架实物）、stockRefs（可补货实物）、warehouse、stock、unitAmount。命令 `retail.list` 是上架单个 inventoryRef，两者不能混为一谈。
- `retail.setPrice({inventoryRef,amount})` 改指定在架实物；withdraw 同样指定 inventoryRef。包/盒以外不能进入正店货架。
- `market.list` 的 tab='buy'/'mine'/'bids'/'history' 分别为非自营可买挂单、本店挂单、实际街坊求购、真实成交日志；支持 search/rarity。无 tab 维持原全部挂单语义。
- `market.quote({listingId,quantity:1})` 冻结实际购买金额，`market.acceptTrade` 带同一 listingId 和顶层 quoteId。
- `market.placeListing({inventoryRef,amount?})` 挂单不会到账；单卡出售、成交等实物操作仍需到二级市场柜台。
- `ledger.daily` 保留旧平铺日账，并返回 revenue（sealedSales/secondarySales/serviceIncome/total）、cost（procurement/costOfGoods/wages/rent/investment）、combat、escrow、netProfit、unsoldValuation。采购是现金流，利润扣已售成本和实际运营费。

## 移动、对局、档案

2026-10-24 修复补充：`actorsUpdated` 与 `shop.snapshot.actors` 只包含在场角色；离店 NPC 档案仍持久保存，`presence='offsite'` 不渲染、不占店内容量，不删除持卡/资金。旧无 presence 的活跃行程兼容，原闲置人群在载入时迁移离店。顾客停留/访问上限/路径停滞参数见 customerBehavior 的 lingerSeconds/maxVisitSeconds/pathStallSeconds，缺字段使用默认。

`room.diagnostics` 返回 `{paused,pauseReasons,items}`，其中最近 20 场后台比赛含 matchId/gameId/status/mode/bout/wins/losses/result/error 和当前小局的实时 progress（round/phase/skill/actor/choosing/ready/paused/activeSeconds/idleSeconds）。通信心跳不作为实际出牌进展；实时诊断不计胜率，不承担完整引擎恢复。技术作废原因持久保存在比赛 error；牌桌提示区分交互暂停与技术中断。

新增 `saves.days` 查询：`{items,note}`，每个自然日一条实际 `slot='start'`、08:00 档案，优先当前分支及其祖先。`saves.loadDay({archiveId})` 必须传真实日初档 ID，手动/打烊备份即使时间恰好 08:00 也返回 NOT_DAY_START。成功整体恢复当天起点、创建新分支和该分支日初档，并触发 worldReset；旧报价/操作不能跨分支复用。日初档优先保留在配置容量内，另保留新备份空间。原 saves.load 仍为精确时刻备份读取，两者在 UI 中分开。

启动菜单通过 `modules/backend/profiles.mjs` 的 `profileRegistry` 管理本地卡店目录：list/create/get/rename/days/remove/close。它不连接 Host，不推进时间。`createHost({profileId})` 选择独立世界数据库；省略参数维持 legacy 兼容。旧 `noname-card-shop-world-v2` 原地保留并显示“原有卡店”，新 profile 使用独立数据库；不得用清空整个 origin 实现新建/删除。删除操作只清理选定档案库，用户须在菜单确认。

- 玩家 actorId='actor:owner'，库存 ownerId='player'；两者不同。外观使用 owner/rookie/collector/competitor/passerby/regular/bigspender。
- 查询 `player.skins` 返回 `{current,items:[{appearanceId,name,selected}]}`；命令 `player.setSkin({appearanceId})` 免费修改店长外观，非法 ID 原子拒绝。外观随世界存档恢复，身份、资金和持卡不变。
- world.input 的 inputSeq 单调递增，仅为移动意图；不能通过 roomId 让角色瞬移。跨房先到出口，command `world.changeRoom({anchorId})`，确认权威 actorsUpdated 后换场景。
- combat.register 返回顶层 matchId 及 match 兼容对象；battle.mount 只接已登记玩家比赛。玩家/后台引擎配置隔离，dispose 可重复调用并返回清理 Promise。
- BO3 小局结束为 awaitingNext；重新 mount 或 combat.continue 后开始下一局。关窗中断当前无赌注小局，重开界面可继续。只有一整场结束才计一份胜率。
- 每名玩家最多一场未完成比赛。新登记只在营业中；未真正开局撤退退款，不推进比赛任务；本局认输必须等引擎 ready。
- saves.list 返回元数据数组（UI 可归一成 items），含 id/archiveId/saveId、branchId/branch、day/minute/slot、status='readable'。
- saves.create 返回 archiveId；load 输入 archiveId；export 返回 fileName/mimeType/content；import 输入 content 文件文本。前端负责文件选择/下载，后端负责格式校验、备份、全量恢复和建立分支。
- NPC 后台比赛不阻止存读档：档案保留已完成比分、费用和实际持卡，读档后当前小局重开，并返回 recoveryNote。玩家仍在运行的小局先关闭视图或完成。日档按 ID 独立保存，旧内嵌格式自动转存，不需清档。
- capabilities.wagering=false 是当前真实能力限制，不能通过 UI、配置或导入存档绕过。

## 连续移动与批量操作（2026-10-23）

当前前端第二版：`world.input` 支持归一化 `vector:{x,y}`，原 direction/destination 保留；地图新增 worldOffset/signs 和出口 seamlessEdge。后端坐标仍按房间本地记录，边缘转换必须通过 `world.changeRoom`。

批量操作：`supplier.receiveAll({})` 签收全部已到货订单；`retail.listAll({inventoryRefs})` 按剩余货架容量上架，返回 listed/remaining/note。与单件操作一样检查站位与 requestId，不跨过保护或库存锁。美术单位、连续场景与调整入口见 [操作与美术第二版](../docs/前端操作与美术第二版.md)。

## 顾客拆包与共享垃圾桶（2026-10-23）

- 顾客购买密封商品后分阶段拆包、挑牌、走到垃圾桶弃牌；`actorsUpdated` 的 `activity` 和 `label` 表达当前行为。
- `inventory.list({location:'trash'})` 查询全店共享实物，含来源 `discardedBy/discardedByName/discardedDay`；桶内卡不计入任何人的收藏/阵容。按 `cursor/limit` 分页，`grouped:true` 可聚合。
- `inventory.recover({inventoryRef})` 或 `{all:true}` 拾取共享桶内原卡，登记流通资格；仍需到桶旁。拾取自己原卡保留原成本，拾取他人弃卡以零成本入库，不产生交易收入。
- 部分低预算 NPC 按习惯、余额门槛、每次数量和冷却主动拾取。下一天清空全部剩余垃圾，已拾取者保留实物。
- 行为参数在 `backend-rules.customerBehavior`，缺字段沿用默认，支持旧存档。详细流程、事件与配置见 [顾客拆包与共享垃圾桶](../docs/顾客拆包与共享垃圾桶.md)。

## 2026-10-24 经营节奏补充（覆盖此前 NPC 默认真实对局的说明）

- `tasks.list` 新增 `scope:daily|starter`、`autoClaim:true`、`goal`、`claimed`；数字 `target` 与 `guide` 继续兼容。每日以当天累计值基线计进度，事务内完成即发奖励；`tasks.claim` 不再二次发奖。
- `ledger.live` 返回 `{day,cash,debt,items:CashEntry[]}`；快照新增 `cashJournal` 最近六条。`amount` 是可用现金实际差额，`debtDelta` 是供应商欠款差额，任务可附 `grossIncome`。两者不得混算，也不能把奖励当商品利润。
- `products.list` 新增 `averageStrength`、`priceTier:{id,label,version}`、`packExpectedValue`。前端仅展示服务端档位；供货按主题全局平均分分五档，旧实物/订单仍冻结原版内容与成本。
- `opening.execute` 的站位改为 `store.opening`；采购和签收仍为 `store.counter`；NPC 结账位 `store.checkout`。地图生成器和静态导航已同步。
- 玩家 `combat.eligible` 不要求全局流通，仍检查持有、副本锁定、保护、位置及技能兼容；NPC 保留流通限制。NPC 拆出的所有卡立即进入流通。
- NPC 默认 `simulated:true`，使用实际持卡阵容、后台权威随机源和保存的 `simulation.elapsedSeconds/durationSeconds`。18 秒默认模拟时长（受倍率/暂停影响）；完赛自动付费并释放桌位。`simulation.feePaid` 为已结桌费；统计可含 `simulatedGames`，不能把模拟场次宣传为真实引擎实测。
- 模拟牌局不在真实 engine worker 的 `backgroundState.matches` 中；`room.snapshot.matches` 仍提供经营展示。真实引擎后台路径可通过 `rules.npcSimulation=false` 专门测试；默认前端必须按模拟状态说明，不再等待引擎 ready。
- 默认中文姓名，已知旧国际姓名会迁移；外观不决定钱包/行为。默认 NPC 模拟不会开放下注。
