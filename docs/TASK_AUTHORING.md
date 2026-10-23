# 任务与经营接口（v0.5）

## 文件与编辑方式

- `data/tasks.json`：任务默认配置；`data/tasks.schema.json` 提供编辑器补全。
- `data/business.json`：时间、进货价格、零售价、成本、目标、客流、顾客画像；`data/business.schema.json` 提供结构补全。
- `shop-tasks.js`：任务验证、进度、奖励、依赖、每日重置。
- `shop-business.js`：与 DOM 无关的时间 / 交易 / 换日模型。
- `business-ui.js`：柜台、仓库、任务簿、编辑器、结算界面。
- `integration/task-extensions.js`：项目扩展入口，先于配置校验加载。
- `tools/test-business.cjs`：`node tools/test-business.cjs` 运行纯模型回归测试，无 npm 依赖。

游戏内：手账 → 全部任务 → 任务 / 经营编辑器。支持 JSON 导入、校验应用、导出、恢复项目默认。编辑器暂停模拟。

应用只保存到当前浏览器的 `noname-task-config-v1` / `noname-business-config-v1`，不改磁盘默认文件。将导出的文件替换相应 `data/*.json`，即可作为项目默认。浏览器覆盖配置优先；改磁盘后如果看不到变化，使用“恢复项目默认配置”。配置文件每次刷新重新读取，无构建步骤。

任务 id 是稳定存档标识。调整文字不会重复发奖；已领取的同 id 即使修改奖励也不会再发。新增任务用新 id。修改未领取任务的目标结构会重置该任务的事件累计，快照指标会重新计算。不要通过改 id 给现有任务改标题。

## 营业时间与财务口径

默认 08:00 准备、09:00 开门、20:00 自动打烊。准备阶段计时到 09:00 后等待手动开门；也可以提前点击开门，直接进入 09:00。默认每真实秒推进 2 个游戏分钟，支持 1 / 2 / 4 倍速。

普通背包、任务簿、柜台等面板不暂停营业。手动暂停、手册、编辑器、结算、对局、切到后台时暂停；不计算离线经营。

`daily.revenue` 只计算 AI 顾客真实付款的商品金额，未结账购物不记收入。任务奖励不计营业额。供应商下单即扣款，缺口在明确勾选赊购且额度足够时形成欠款；销售及任务现金收入优先偿还欠款。欠款偿还不减少“顾客营业额”。

每日“收支差额” = 顾客营业额 − 本日进货总额 − 营业成本。进货总额包含赊购，不等于本日现金支出；任务奖励、偿还旧欠款和仍在仓库的库存会使现金变化不同。它用于展示本日经营投入与回收，不是会计利润。

打烊幂等：只扣一次营业成本。未足额支付的成本记入欠款。打烊后可捡回垃圾桶卡片，仓库和货架保留。点击开始下一天时：自动领取当日已完成但未领取的每日任务奖励，归档日报，清空垃圾桶，递增营业日并重置每日指标；主线任务、资金、欠款、背包、货架、仓库、送货订单保留。跨夜到期的订单会显示已送达，仍需签收。

## 一个完整任务

```json
{
  "id": "rare_sales_evening",
  "title": "晚间稀有卡专场",
  "description": "第 3 天起，每天 17:00—20:00 卖出两张 SR 或 UR。",
  "scope": "daily",
  "conditions": [{ "type": "minDay", "value": 3 }],
  "dependsOn": ["first_customers"],
  "deadlineMinute": 1200,
  "objectives": [{
    "type": "event",
    "event": "sale",
    "filter": { "kind": "card", "rarity": ["SR", "UR"] },
    "window": { "from": 1020, "to": 1200 },
    "target": 2
  }],
  "rewards": [{ "type": "cash", "amount": 100 }, { "type": "reputation", "amount": 2 }],
  "guide": "display"
}
```

`scope`：`once` 为主线，一次性跨天保留；`daily` 每个营业日独立进度与奖励。`dependsOn` 指向配置中已领取奖励的任务，不仅是进度已满。依赖缺失或形成循环会被拒绝。

`objectives` 默认全部满足；`mode: "any"` 表示满足任一。`target` 为正整数，或 `"dailyRevenueGoal"`（当日营业目标）。每日目标默认首日 180，每天增加 60，上限 900。

`guide` 可选 `counter` / `display` / `trash` / `battle`，生成“前往处理”按钮并寻路。

`deadlineMinute` 是当天绝对分钟。时间窗口为左闭右开 `[from,to)`；例如 780=13:00，13:00 起的交易不计入午前任务。期限内完成的任务可在当天稍后领取；已经过期的任务不能被之后的销售复活。每日未完成任务在打烊时过期。

条件持续影响任务可用性及领取资格。`phase` 条件若只允许 open，打烊后便不能领取；需要打烊后可领时应包含 closed，或不使用该条件。

## 指标目标

`{ "type": "metric", "metric": "daily.revenue", "target": 200 }`

每日和累计指标分别使用 `daily.*`、`lifetime.*`：

| 字段 | 含义 |
|---|---|
| revenue | 顾客付款总额 |
| soldCards / soldPacks | 已售单卡 / 整包数量 |
| ordersPlaced / purchasedPacks | 下单次数 / 下单卡包数量 |
| purchaseExpense | 下单总额（含赊购） |
| receivedPacks / openedPacks | 已签收 / 已拆包数量 |
| listedUnits | 上架总件数（撤回再上架也算一次上架行为） |
| visitors / served / lostCustomers | 进店 / 成交 / 未购离店人数 |
| discarded / recovered | 丢入 / 捡回数量 |
| taskRewards | 现金任务奖励总额 |
| debtPaid | 已偿还欠款 |
| battlesWon | 对局获胜数 |

其它快照指标：`cash`、`reputation`、`inventory.cards`、`inventory.packs`、`inventory.shelfUnits`、`inventory.trash`，以及示例扩展 `custom.uniqueOwned`。快照指标不是任务激活后的增量；例如新解锁的任务可以认可之前已经完成的累计签收量。事件目标则从任务激活后累计。

`ShopTasks.metricNames()` 返回运行时可用指标。新增类型先在扩展文件注册，再在配置中引用。

## 事件目标与筛选

`{ "type":"event", "event":"sale", "measure":"amount", "filter":{"kind":"pack"}, "target":190 }`

默认每个匹配事件加 1；`measure: "amount"` 累计金额，`"quantity"` 累计数量。筛选支持标量相等或数组包含，不执行表达式或 JavaScript。

每个事件都有 `type`、`day`、`minute`、`serial`。主要事件：

| 事件 | 额外字段 |
|---|---|
| orderPlaced | packId, quantity, amount, credit |
| deliveryArrived | orderId, packId, quantity |
| goodsReceived / packOpened | packId, quantity |
| stockListed / stockWithdrawn | kind, packId 或 cardId, quantity |
| cardDiscarded / cardRecovered | cardId, quantity |
| sale | kind(card/pack), id, rarity(单卡), amount, quantity, customerId |
| customerEntered / customerLeft | 后者包含 reason |
| priceChanged | kind(cards/packs), multiplier |
| shopOpened / dayClosed / dayStarted | dayClosed 包含 achieved/revenue；dayStarted 包含 clearedTrash |
| taskClaimed | taskId |
| battleWon | general, opponent |

交易不预扣排队顾客的商品。结账时重新核对库存与预算；多个 NPC 同时选中最后一件商品时，只有首次成功结账会扣库存和入账，其他顾客不会重复付款。

## 条件与奖励

内置条件：`minDay`、`maxDay`、`reputation`、`cash`（value 为阈值），`phase`（value 为阶段或阶段数组），`taskClaimed`（value 为任务 id）。示例扩展 `custom.ownsCard` 使用 cardId / quantity。

内置奖励：

```json
[
  { "type": "cash", "amount": 50 },
  { "type": "reputation", "amount": 1 },
  { "type": "packs", "packId": "standard", "quantity": 1 }
]
```

卡包奖励进入仓库，不自动拆包，不伪造成顾客付款或签收事件。奖励只发一次。任一奖励提供器抛错时，整次领取回滚，资金与已领取标志都不会部分更新。

## 扩展代码接口

将代码放在 `integration/task-extensions.js`。配置是数据，不包含 eval、函数字符串或任意脚本。扩展名称需唯一，函数同步执行。

```js
ShopTasks.registerMetric("custom.rareOwned", save =>
  Object.entries(save.collection).filter(([id]) =>
    ["SR", "UR"].includes(byId.get(id)?.rarity)
  ).reduce((sum, [, n]) => sum + n, 0)
);

ShopTasks.registerCondition("custom.noDebt", save => save.business.debt === 0);

ShopTasks.registerReward("custom.specificCard", (save, reward) => {
  if (!byId.has(reward.cardId) || !Number.isInteger(reward.quantity) || reward.quantity < 1) {
    throw new Error("奖励卡片或数量不合法");
  }
  save.collection[reward.cardId] = (save.collection[reward.cardId] || 0) + reward.quantity;
});

ShopBusiness.on((event, save) => {
  if (event.type === "sale") console.log(event.kind, event.amount);
});

// 在自己的玩法处理完后发出自定义事件，再提交一次存档。
window.ShopExtras = {
  finishTournament() {
    ShopBusiness.emit(state, "custom_tournament", { quantity: 1 });
    store.save(state);
  }
};
```

扩展回调只能同步更新传入的 save，不应在事件回调中重复保存、递归发同名事件、发请求或操作文件；让最外层交互完成后统一 `store.save(state)`。指标 / 条件应为只读纯函数。提供器如修改外部状态，该外部状态不在奖励回滚范围内。

## 业务模型 API

所有模型方法只修改传入存档，不自行保存到浏览器；UI 成功调用后统一 `store.save(state)`。

- `ShopBusiness.order(save, pack, quantity, useCredit)` → `{ok, order|error}`
- `ShopBusiness.receive(save, orderId)` → `{ok, quantity|error}`，重复签收失败
- `ShopBusiness.movePacks(save, packId, from, to, n)`，from/to 为 stock / packDisplay
- `ShopBusiness.openPack(save, pack)` 消耗仓库 1 包；卡片抽取与入背包由 app.js 完成
- `ShopModel.transfer(save, from, to, cardId, n)`，collection / trash / display 之间转移
- `ShopBusiness.chooseProduct(save, profile)` / `sell(save, kind, id, profile)`
- `ShopBusiness.tick(save, seconds)`，seconds 单次上限 1；是否暂停由 UI 控制，模型也尊重手动 paused
- `ShopBusiness.open(save)` / `settle(save)` / `nextDay(save)`
- `ShopTasks.evaluate(save)` / `list(save)` / `claim(save, taskId)` / `claimReady(save, scope)`
- `ShopTasks.validate(config)` / `ShopBusiness.validate(config)` 返回错误数组

存档中的业务结构：`business.day/minute/phase/speed/paused/goal/daily/lifetime/history/debt/reputation/pricing`；库存：`collection`（背包单卡）、`display`（在售单卡）、`stock`（未拆卡包仓库）、`packDisplay`（在售整包）、`trash`、`orders`。任务状态位于 `tasks`：主线键 `once:id`，每日键 `day:N:id`，保留最近 30 天。

## 建议验证

1. 编辑器先校验配置，检查依赖、奖励、时间窗口和自定义提供器是否注册。
2. `node tools/test-business.cjs`。
3. 新存档按“下单 → 到货 → 签收 → 上架 → 开门 → 顾客结账 → 领奖 → 打烊 → 次日”跑一轮。
4. 测试过期任务、重复领取、仓库空、预算不足、同时结账和打烊前后收货。
5. 升级前存档保存在 `noname-packer-before-business-v1`；不要为了测试直接清空玩家收藏。
