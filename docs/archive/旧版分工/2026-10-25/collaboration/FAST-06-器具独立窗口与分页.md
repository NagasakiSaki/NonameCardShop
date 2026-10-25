# FAST-06：采购、仓库、拆包的独立分页候选

先读 [总分工](2026-10-24-窗口与牌桌新版分工.md) 和 [共享草案](PLAY4-共享界面与接口草案.md)。唯一可写 `D:\GameDev\NonameCardShop\deliverables\playability-v4\FAST-06\`。你负责纯组件与候选预览；正式窗口管理、即时入库、赠品、报价/保底/随机与Host绑定由主模型负责。

## 只读参考

`frontend-next/components/workspace/{purchase,unbox,collection,dom,ops,styles}.mjs`、`frontend-next/screens/workspace.mjs`、`frontend-next/services/operations.mjs`、`contracts/card-shop-host.d.ts`、`assets/frontend-next/products/manifest.json`、`tests/playability-integration.mjs`、`tests/trade-workspace-pagination.mjs`。已有真实卡面与包装函数可以复用，别从deliverables旧包导入。

## 可独立完成的工作

- 提供 `components/purchase.mjs`、`warehouse.mjs`、`opening.mjs`，各自独立root/mount/update/draft/dispose，及本包命名空间CSS。不能做一个大交易台再塞几个标签页冒充独立窗口。
- **采购**：商品分页，包装图、包/盒、单价、数量、篮内合计、一次购买动作。别把最终报价算法写在组件里；只显示view给的金额或标明预估，权威变化由action返回。成功时“已入库”及可选去向，失败保留原购物篮。
- **仓库**：显示真实盒/包库存与可用数量、在架/占用等必要区别，分页；选择后表达去货架/拆包台的意图。不能远程调用开包绕过站位。新档赠送说明来自view，不在组件发礼包。
- **拆包**：选一个包/一盒/全部范围，数量明确、一次确认后展示结果；结果按固定页看真实卡面、稀有度和重复数量。跳动画/关闭重开保留已经返回的结果，不重新调用开包。库存选择与结果是同一器具的不同阶段，不混采购或单卡挂单。
- 主模型内部仍可能“取预览→提交”；用户操作只需一次明确确认。未知结果单独显示“正在确认上次操作”与“查看结果”，不提供会新开第二批的重试按钮。
- 标出与现有 DTO 差异，尤其当前供应接口返回pending而非立即入库。候选fixture可以用拟定received结果，必须标注“演示输入，正式后端待接”。

## 分页/适配

严格遵守共享草案的五种尺寸与无长滚动要求：标题/页码/主按钮固定可达；内容超出时减少页容量/切换信息页，不隐藏溢出内容。每页不要求48张，优先实际容纳4～8个商品/卡面；全量搜索/总数不能丢。

搜索翻页、尾页删除、数量修改、resize不改变真实ID选择或重复提交。大批结果以fixture给出1000条，但仅创建当前页卡块。卡面缺失有名称占位。

## 输出和边界

README、DELIVERY、gaps、components/、styles/、demo/、fixtures/、screenshots/（有视觉时）和少量必要的交互验证。独立demo可注入异步actions记录器，标明未接Host，生产不依赖demo数据。代码参考正式纯DOM接口，不引新框架、全局CSS、独立暂停系统或第二套窗口管理。

检查：购买一次/响应未知、页内外选库存、开一包/一盒/全部范围、结果翻页、无图、空库存、长名称、406宽度及1280×720主按钮。只查本包，不循环跑全库、不动真实存档、不安装素材/EXE、不git提交。

可直接发送：请执行 `D:\GameDev\NonameCardShop\docs\collaboration\FAST-06-器具独立窗口与分页.md`，在独立目录交采购/仓库/拆包纯组件候选；正式规则和合并留给主模型。
