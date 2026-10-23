# 新版后端逐步清单与接入说明

更新日期：2026-10-23。当前是独立后端首批实现，根页面尚未切换，exe 未更新。

## 逐步清单

| 顺序 | 内容 | 当前状态 |
| --- | --- | --- |
| 1 | 正式 Host 契约、独立模块和入口 | 已完成；`integration/frontend-host.mjs` 导出 `createHost()` |
| 2 | 新世界、原子存储、暂停令牌、开发旧档重置 | 已完成；独立 IndexedDB、并发版本检查、失败不提交 |
| 3 | 全局评分、四档、各主题动态配方与报价 | 已完成；全目录重算，模型变更生成新评分版本，下一营业日发行新品 |
| 4 | 进货、送达、签收、密封零售、实体盒、批量开包、留一上架 | 已完成基础闭环；真实实物、固定内容与成本守恒 |
| 5 | 二级市场、流通登记、NPC 钱包与持卡 | 已完成基础闭环；顾客购买后开包、真实持卡、有效挂单开放流通资格 |
| 6 | 对战房、战绩、托管、按天存档 | 无赌注玩家对战与日档已接入；下注托管原语已写，下注仍关闭；NPC 自动对战待接入 |

不把最后一项笼统标为“全部完成”。下一批继续：NPC 对 NPC 的真实引擎后台比赛、完整牌局恢复与下注开放、设施/员工/街坊预约的新接口适配、与新前端正式联调。

## 文件边界

- 后端：`modules/backend/*.mjs`、`data/backend-rules.json`、`integration/frontend-host.mjs`、`integration/host-battle.mjs`。
- 正式类型：`contracts/card-shop-host.d.ts`；地图元数据规格：`contracts/map.schema.json`。
- 前端、美术和美术工具目录由另一模型负责，本批没有修改或提交它们。
- 本批只给静态服务补充 `.mjs` 正确 MIME，未切换根 HTML、旧 UI 或安装包。

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

首次启动这个新 Host 会建立 `noname-card-shop-world-v2` 数据库，然后按用户授权定向清理该地址的旧卡店键与旧日档库；不会清整个浏览器存储，不删除引擎目录。**原根页面没有调用新 Host，所以尚未替换玩家原来的正式运行入口。** 普通浏览器、开发端口、Electron 的存储仍相互隔离。

### 实际参数约定

- `products.quote`：`{productId, quantity, unit:'pack'|'box', action:'purchase'}`。
- `supplier.placeOrder`：payload 同商品参数，加可选 `credit`；`quoteId` 在请求顶层。
- `opening.preview`：`{includeBoxes:true|false, productId?, inventoryRefs?}`；不提供范围时选可用仓库包。
- `opening.execute`：顶层 `previewId`，payload 可为空；同一次重试复用 requestId。
- `inventory.surplusPreview`：`{mergePrints?:boolean, rarity?}`。
- `market.listSurplus`：顶层 `previewId`；payload `{multiplier:1}`，允许 0.5～2。
- 单件操作使用 `inventoryRef`；`inventory.list` 返回实体行，`owned=1`。前端按 cardKey/印刷版聚合显示 ×数量，提交时使用具体实物引用，不凭聚合数改库存。
- `inventory.setProtection`：`{inventoryRef,protected:true|false}`。
- `market.placeListing`：`{inventoryRef,amount?}`，省略 amount 使用当前后端参考价。
- `market.quote`：`{listingId,quantity:1}`；`market.acceptTrade` 带同一 listingId 和顶层 quoteId。
- `combat.preview`：`{mode,opponentId,inventoryRefs,tableId?,withStake:false}`，对手必须来自 `management.people` 且实际有可用牌。
- `combat.register`：顶层 previewId；随后 `combat.start` 的 payload 为 `{matchId}`。
- `host.battle.mount({container,matchId})` 在 start 成功后调用；BO3 下一局先 dispose 旧挂载，再 `combat.continue` 和重新 mount。
- `combat.cancel`：取消未开局比赛并退还托管费用。`combat.surrender` 的 scope 为 `bout` 时认输 BO3 小局，其他情况按整场退赛。
- `saves.export` 返回 `{fileName,mimeType,content}`，由前端下载；`saves.import` 接收 `{content:文件文本}`。

响应的 `ok=false` 是业务失败，不当成空列表；异常/断线后通过 `operations.get` 查询原 requestId。成功命令记录在数据库中，刷新后重复请求不会再次扣款。库存变动会使批量预览失效。

暂停采用 `host.pause.acquire({ownerId,reason})` / `release(leaseId)`。背包、详情、确认框分别持有自己的令牌，全部关闭后才恢复；玩家战斗独立执行，店铺时间暂停。

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
2. **NPC 自动比赛：** 尚未让两名 NPC 自动开桌并驱动真实引擎，不制造模拟胜负作为实际战绩。
3. **技能全适配：** 已移除 25 将白名单，按持有与流通准入；特殊技能仍需逐项兼容。可用 `compatibilityBlocks` 明确记录故障原因，不宣称 2563 位均已实测。
4. **旧经营扩展适配：** 新 Host 暂时将 upgrades/neighbors 设为 false；旧根页面功能原样保留，后续接入。
5. **最终前端合并：** 未修改另一模型的资源与页面；拿到交付后再切入口、接完整菜单和做最终联调。

## 本批验证

只验证本次新增链路，不跑旧版全套大回归：

- `node tests/backend.mjs`：全局评分权重、26 主题盒配额、小保底、暂停、失败回滚、重复请求、成本、市场、NPC 购卡、次日清桶与读档分支。
- `node tests/backend-browser.mjs`：真实 IndexedDB 重连、旧卡店键定向清理且保留无关键、真实无名杀 BO3 2:0、只计一次战绩和开桌费。
- 以后用 `npm run test:backend` 执行上述两项；本批没有重建 exe。
