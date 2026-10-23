# 卡面交易样稿 UI-01

预览：`http://127.0.0.1:5190/frontend-next/experiments/card-trade/index.html`。使用现有一键启动器/服务器即可。主入口和正式游戏没有切换到这个页面。

- 市场：真实本地卡图、N/R/SR/SSR 演示标签、×持有、搜索武将/技能、稀有度筛选、大图与完整技能文字。
- 收藏：模拟单张上架、保留/占用之外的重复牌批量上架；挂单不即时计入收入。
- 采购：卡盒/散包两种商品，进价、建议售价、仓库/在架/在途、供货数量、常驻购物篮。
- 收货：已付款单据快照，直接签收；重复签收入口消失，不再次扣款、不自动拆包。
- 窄屏：两列卡面、详情弹层、采购底部结算条；桌面 1366×768 与 1280×720 保留 4×2 首屏卡牌。

所有交易、余额、价格、稀有度、数量都是 **Mock 演示数据**，只放在内存；刷新恢复。未接 Host、真实存档、计时暂停服务或引擎。页脚“营业时间暂停”也是界面展示。技能文字和原卡图来自已有卡库；卡图不整体像素化。未实现技能源代码展示，待接真实 `catalog.detail({includeCode:true})`。

金额在本样稿内以整数分保存，仅为展示；正式游戏 `currency.minorUnit=1`，接入时必须通过适配器读取 Host 货币信息，不能直接搬用模拟货币假设。Mock 格式不是 `card-shop-ui/2.0`，真实 DTO 尚待冻结。

组件在 `frontend-next/components/trade.mjs`，只接受数据和回调，不导入 Host。样稿控制器在 app.mjs，模拟业务不许迁入正式业务模块。样式在 `frontend-next/styles/trade.css`。将来采用组件时，应传入权威报价/库存/可售数量和金额格式化函数，替换 Mock 回调。

`build-fixtures.mjs` 从已有卡库摘取 12 人的卡图引用与技能文字，生成演示配置；同时用代码新绘 12 张像素商品包装（包 64×96，盒 96×96）。这些包装为本项目新增，无第三方包装素材；不代表真实产品出货配比。生成器只写本样稿 assets 与 mock/trade-fixtures.mjs，不改正式资源。

```powershell
node frontend-next/experiments/card-trade/build-fixtures.mjs
node tests/frontend-next/card-trade.mjs
```

测试使用独立服务器和浏览器上下文，覆盖大图/技能、搜索、模拟交易、购物篮、签收、窄屏、缺图占位和刷新恢复；检查无业务接口请求、localStorage/IndexedDB 写入、HTTP 错误或页面异常。截图和报告在 `.local/collaboration/QA-02/card-trade/`，不提交私人数据。
