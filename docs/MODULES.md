# 模块接口与修改指南（v0.6）

## 从哪里改

| 需求 | 配置/文件 | 边界 |
|---|---|---|
| 时间、资金、基础价格、客流 | data/business.json | 原有经营时钟与资金模型 |
| 主线、每日任务、奖励 | data/tasks.json | 引用指标与领域事件 |
| 周内行情、赛事热度 | data/market.json | 改价格/需求，不改抽卡内容与战斗强度 |
| 常客、关系、收卡和预约 | data/neighbors.json | 每日生成并冻结具体报价 |
| 设施费用、工资、员工效率 | data/upgrades.json | 通过查询提供容量与成本加成 |
| 周赛日期、报名、奖金、AI 阵容 | data/tournaments.json | 比赛报名与奖励快照 |
| 单挑将池、起始手牌、先手补偿 | data/combat.json | 只允许已实现的 KOF / BO3 规则 |
| 新经营系统 | modules/*.js | 独立状态、命令、查询、事件 |
| 新赛制的引擎接入 | integration/duel.js | 引擎事件边界，不修改 vendor/noname |
| 经营界面 | management-ui.js / management.css | 只展示与调用命令 |
| 比赛界面及 iframe 消息 | battle.js | 校验来源、局 ID，转交比赛模型 |

每个新增配置都有同名 `.schema.json`，为编辑器提供结构提示；运行时校验器同时检查值范围和部分关联。默认配置在项目文件中，浏览器编辑覆盖保存在 `noname-module-模块ID-v1`。导出后替换文件可成为项目默认；没有自动写回项目文件。

入口：顶部“街坊与经营”→“模块编辑器”。普通经营手账继续营业，模块编辑器、原任务编辑器、对局、手册、结算和后台会暂停时间。

## 稳定接口

`ShopModules` 负责注册、配置加载、迁移、查询、同步命令和事件分发。通过脚本顺序注册模块，最后由 app.js 加载配置和初始化，未增加打包工具或 npm 依赖。

```js
ShopModules.register({
  id: "loyalty",             // 发布后保持稳定，不用中文或原型属性名
  title: "会员系统",
  version: 1,               // 仅在状态结构变化时升级
  file: "data/loyalty.json", // 可选；提供后需同时提供 validate
  requires: ["neighbors"],
  defaults: () => ({ points: 0 }),
  validate(config, catalog) {
    return config?.version === 1 && Number.isSafeInteger(config.dailyPoints)
      && config.dailyPoints >= 0 ? [] : ["dailyPoints 需要非负整数"];
  },
  migrate(oldData, save, oldVersion) {
    return { points: Number.isSafeInteger(oldData?.points) ? oldData.points : 0 };
  },
  actions: {
    redeem({state, error, emit}, payload) {
      if (state.points < 10) return error("积分不足");
      state.points -= 10;
      emit("loyaltyRedeemed", {quantity: 1});
      return {ok: true};
    }
  },
  queries: {
    "loyalty.points"({state}, previous, detail) { return state.points; }
  },
  onEvent({state, config}, event) {
    if (event.type === "customerOrderCompleted") state.points += config.dailyPoints;
  }
});
```

将新脚本加入 index.html，在 app.js 前注册。代码示例用于说明接口，示例的每日积分命名并不自动附带“每天只奖励一次”；如果有次数限制，应在自己的模块状态中记录日期或已消费的订单 ID。

调用：

```js
const result = ShopModules.dispatch(state, "loyalty.redeem", {});
if (result.ok) store.save(state);
else ShopGame.toast(result.error);

const points = ShopModules.value("loyalty.points", state, 0);
```

命令必须同步完成，使用传入的 save，不直接操作 DOM/localStorage、发请求或写文件。成功后由调用层保存；失败或抛异常会还原整份存档，并丢弃尚未发送的命令事件。查询必须无副作用。onEvent 用于轻量状态处理，避免重复发出同一事件造成递归；自定义外部副作用不在存档回滚范围内。

`ShopModules.batch(save, [{command,payload}, ...])` 把多个命令放进同一事务。例如创建比赛与支付报名费：任意步骤失败，比赛、锁定、资金全部回滚。命令内部不要再 dispatch/batch；共享逻辑提为纯函数，或在提交后通过事件处理。

## 状态与迁移

存档在原 `noname-packer-v1` 内扩展：

```text
modules.<id> = { version, data }
ledger        库存数量/成本、当日收支、30 天成本账
inventory     收藏保留数量、10 套已存阵容、当前参赛保留
market        有时限的赛后行情与营业报记录
upgrades      各设施等级、补货员下次补货时间与累计补货数
neighbors     常客关系、日期、预约、收卡申请
tournaments   报名与奖励快照、已结算 ID
combat        当前整场比赛及最近 60 场记录
```

旧存档的收藏、现金、订单和原任务进度保留，首次升级原始 JSON 备份到 `noname-packer-before-modules-v1`。已有模块数据会在 normalise 中保留，未知模块的状态也不删除。未提供 migrate 时按 defaults 与旧 data 的顶层字段合并；复杂或嵌套结构升级应显式实现 migrate。遇到比程序新的模块版本会拒绝降级读取，避免静默重置。

模块 ready 在读档后运行；不要重复调用它作为每帧更新。combat.ready 会将上次仍运行的对局标为中断，方便显式继续。

配置 ID 同样保持稳定。改显示名称、金额、概率、台词不改 ID；新增物件用新 ID。删除配置项不会自动退还已购买设施或删除旧订单。已生成订单、收购价、报名奖池按快照履约，新配置影响后续生成。

## 现有查询

| 查询 | fallback / detail | 用处 |
|---|---|---|
| card.price | 基础价 / {card} | 行情参考价，之后再乘玩家定价 |
| pack.price | 基础价 / {pack} | 整包行情 |
| shelf.capacity | 原容量 | 设施加成后容量 |
| business.dailyCost | 原每日费用 | 含已雇员工工资 |
| customer.profile | 原画像 / {random} | 生成常客画像 |
| customer.productScore | 原偏好得分 / {profile,kind,item} | 行情与人物喜好 |
| customer.maxConcurrent | 原人数 | 收银员接待加成 |
| customer.checkoutMs | 原结账耗时 | 收银员效率 |
| customer.regularChance | 原概率 | 展示柜吸引常客 |
| customer.regularBudget | 原预算 | 展示柜预算加成 |
| inventory.available | 背包数量 / {cardId} | 扣除保留后的可交易数量 |
| inventory.locked | 0 / {cardId} | 当前保留数量 |
| ledger.summary | {} | 当日毛差、未知成本数量、库存已知成本 |
| market.active | [] | 今天生效的公开话题 |
| neighbors.completed | 0 | 已完成预约累计数 |
| upgrades.level | 0 / {id} | 设施等级 |
| combat.active | null | 当前整场比赛 |

同名查询按 index.html 的注册顺序依次处理 previous 值，所以多个系统可以叠加加成。不要为了新增模块在 UI 中复制价格算法，统一查询模型。

## 任务事件

原经营事件保留。新增事件：

| 事件 | 常用字段 |
|---|---|
| cardPurchased | offerId, regularId, cardId, quantity, amount |
| customerOrderAccepted / Declined | orderId, regularId, cardId |
| customerOrderCompleted | orderId, regularId, cardId, quantity, amount |
| regularTalked | regularId |
| collectionLockChanged | cardId, quantity |
| upgradePurchased | upgradeId, level, amount |
| tournamentRegistered | matchId, amount |
| tournamentRewarded | matchId, result, amount, reputation |
| boutStarted / boutFinished | matchId, gameId, mode, bout, result（结束时） |
| generalDefeated | matchId, gameId, side, index, general, mode |
| generalReplaced | matchId, gameId, side, index, oldGeneral, newGeneral, inherited |
| matchFinished | matchId, mode, result, ranked, roster, regularId |
| cardsOpened | packId, cards（ID 数组）, quantity |

side 为 mine/enemy，result 为 win/loss/draw。所有事件由 ShopBusiness.emit 添加 day/minute/serial。外层不接收对手隐藏手牌内容。

sale 现在同时记录 source=shelf/customerOrder、quantity、regularId。预约交付只通过一次统一 checkout 计收入与扣库存，任务奖和赛事奖不算营业额。battleWon 只在整场获胜触发，BO3 赢一小局不触发。

新增任务指标 `management.ordersCompleted`、`management.upgradeLevels`，条件 `management.upgrade`（upgradeId、level）。更多指标、奖励仍从 integration/task-extensions.js 注册。配置只引用函数名，不执行函数字符串。

## 成本口径

库存成本按同类商品加权平均，在背包/货架/垃圾桶之间转移不改变总成本；出售或换日清空时扣除。卡包成本在拆包时按各武将基础参考价的比例分摊，五张成本合计等于卡包成本。

旧库存没有可靠采购成本，因此标为 unknown，混入同名商品后继续显示成本未知，直到该批同名库存售空。不能用 0 成本伪造利润。任务赠品按 0 采购成本入账。卡包收货成本与下单支出分开，赊购不丢失商品成本。

当日营业额−进货总额−营业费用是原日报的收支差额，不是库存会计利润。新账本单列已知已售成本、未知成本件数、设施投资、垃圾桶损失，以及赛事报名/奖励。营业费用含员工工资，且每日只扣一次。

## 赛制边界

KOF 三将固定顺序，同一牌局与牌堆；新将满体力，只继承剩余实体手牌；旧装备、判定、技能和角色标记清除。死亡连锁与当前用牌/伤害事件结束后再统一补位，避免原伤害继续打到新将。BO3 每局重新初始化、先到两胜，平局重赛且不变比分。

data/combat.json 首版只开放 25 位标准武将作为单挑将池。它不是 2563 武将全适配保证；复杂死亡遗产、额外座位、变将或改写胜利条件的武将需要单独验证后再加入。收藏稀有度不加战斗属性。

每场固化起手与先手补偿参数。之后编辑配置不改变已登记比赛。对局结果验证 iframe origin/source 与独立 gameId，模型再次检查当前局 ID 与状态，重复/过期消息不计分、不领奖。KOF 店赛报名与比赛创建同事务，每个营业周日仅报名一次，胜负奖金按报名快照结算。

刷新可恢复 BO3 已完成局的比分和报名。运行中的引擎牌局本身尚未保存完整事件栈，继续时从当前小局开头重开；KOF 从该场开头重开。加载失败只标记中断；明确退赛记整场落败，BO3 认输按钮只认输一小局。原版模式大厅仍独立保留；网络玩家联机没有在此版本实现。

v0.7 已重评2563武将稀有度并实装独立五槽卡包。抽样与报价统一由 modules/balance.js 处理，balance.json 可在模块编辑器调整。强度模型与逐将修正由 power-model.json 维护，构建后生成卡表和审计。详见 BALANCE-V07.md。旧的封盒/印刷版本草案仍未实装。

## 检查

```text
node tools/test-balance.cjs    评分规则与260万包概率/价值模拟
node tools/test-business.cjs   原有按日经营回归
node tools/test-modules.cjs    新模块迁移、成本、委托、关系、升级、比分与奖励事务
node tools/verify-engine.mjs   原版引擎文件校验
```

实际浏览器检查还应覆盖：收卡/交单/锁定、常客走到柜台付款、手机布局、配置编辑导出、KOF 零/多手牌交接与连锁死亡、BO3 跨局和原版大厅。加新武将或赛制时，模型测试不能替代引擎里的实际事件测试。
