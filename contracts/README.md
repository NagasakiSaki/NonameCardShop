# card-shop-ui/1.0 集成约定

权威方法定义：`card-shop-host.d.ts`；地图格式：`map.schema.json`。下面固定本次已集成的具体负载，后续页面不自行推导缺失金额或修改库存。

## 公共规则

- command 输入 `{requestId,type,payload?,quoteId?,previewId?}`；requestId 仅允许字母/数字/下划线/连字符、最长 150 字符。同一操作重试必须复用 ID 与参数；成功结果在新世界数据库中持久化。
- query/command 返回 `{ok:true,revision,data}` 或 `{ok:false,error:{code,message,retryable}}`；业务失败不能当空列表。
- `operations.get({requestId})` 返回 `{status,result?}`，成功原响应在 result，业务负载在 `result.data`。开包补查读取 `result.data.opening`。
- 金额为整数游戏币，currency.minorUnit=1。概率为 0～1，平均张数允许小数。
- 所有交互窗口持有独立暂停令牌；没有成功申请暂停前不提交。关闭后释放，包括“申请完成前已关窗”的情况。

## 目录、库存、开包

| 接口 | 具体约定 |
| --- | --- |
| products.list | 分页 `{items,total,nextCursor}`；商品含 themeName/name、unitAmounts（采购价）、prices.pack/box.wholesale/retail、全局评分版本、配比与盒定额；unavailable 商品不能询价 |
| products.quote | 输入 productId、quantity、unit='pack'/'box'；返回 quoteId、unit、unitAmount、totalDebit、版本等；下单保留原 quoteId |
| supplier.orders | 分页；行含 orderId、themeName、productVersion、quantity、unit、total、status（pending/arrived/received）；仅 arrived 可签收 |
| supplier.placeOrder / receive | 成功返回 orderId / `{inventoryRefs,stock:{packs}}` |
| inventory.list | 默认每个实物一行；指定 grouped:true 返回按 cardKey/printVersion/printedRarity/location 聚合的卡片行；含 inventoryRefs、owned、available、protected、locked、listed。状态可重叠，available 由后端计算 |
| catalog.detail | 输入 cardKey、可选 includeCode；返回真实 holdings、copies、printings、referencePrice.amount、当前全局分级、技能、stats.bo3/kof（games/sessions、胜负平）、流通和准入说明 |
| opening.preview | 输入 quantity?、includeBoxes?、inventoryRefs?、productId?；省略 quantity 为全部可用包；返回 previewId、packs、cards、boxes、excluded。部分拆盒剩余包保持原内容 |
| opening.execute | 顶层 previewId；返回 `{operationId,cards,packs,opening:{packs,byRarity,results}}`；results 含名字/卡图/印刷稀有度/isNew 与实物引用 |
| inventory.surplusPreview | 返回 previewId、keep=1、newListings、alreadyListed、lockedExcluded、estimatedFee、quantity；market.listSurplus 带顶层 previewId，返回 created 与真实 listings |

## 零售、市场、账目

- 查询 `retail.list` 是货架视图 `{shelves,capacity,used,note}`；每组含 inventoryRefs（在架实物）、stockRefs（可补货实物）、warehouse、stock、unitAmount。命令 `retail.list` 是上架单个 inventoryRef，两者不能混为一谈。
- `retail.setPrice({inventoryRef,amount})` 改指定在架实物；withdraw 同样指定 inventoryRef。包/盒以外不能进入正店货架。
- `market.list` 的 tab='buy'/'mine'/'bids'/'history' 分别为非自营可买挂单、本店挂单、实际街坊求购、真实成交日志；支持 search/rarity。无 tab 维持原全部挂单语义。
- `market.quote({listingId,quantity:1})` 冻结实际购买金额，`market.acceptTrade` 带同一 listingId 和顶层 quoteId。
- `market.placeListing({inventoryRef,amount?})` 挂单不会到账；单卡出售、成交等实物操作仍需到二级市场柜台。
- `ledger.daily` 保留旧平铺日账，并返回 revenue（sealedSales/secondarySales/serviceIncome/total）、cost（procurement/costOfGoods/wages/rent/investment）、combat、escrow、netProfit、unsoldValuation。采购是现金流，利润扣已售成本和实际运营费。

## 移动、对局、档案

- 玩家 actorId='actor:owner'，库存 ownerId='player'；两者不同。外观使用 owner/rookie/collector/competitor/passerby/regular/bigspender。
- world.input 的 inputSeq 单调递增，仅为移动意图；不能通过 roomId 让角色瞬移。跨房先到出口，command `world.changeRoom({anchorId})`，确认权威 actorsUpdated 后换场景。
- combat.register 返回顶层 matchId 及 match 兼容对象；battle.mount 只接已登记玩家比赛。玩家/后台引擎配置隔离，dispose 可重复调用并返回清理 Promise。
- BO3 小局结束为 awaitingNext；重新 mount 或 combat.continue 后开始下一局。关窗中断当前无赌注小局，重开界面可继续。只有一整场结束才计一份胜率。
- saves.list 返回元数据数组（UI 可归一成 items），含 id/archiveId/saveId、branchId/branch、day/minute/slot、status='readable'。
- saves.create 返回 archiveId；load 输入 archiveId；export 返回 fileName/mimeType/content；import 输入 content 文件文本。前端负责文件选择/下载，后端负责格式校验、备份、全量恢复和建立分支。
- capabilities.wagering=false 是当前真实能力限制，不能通过 UI、配置或导入存档绕过。
