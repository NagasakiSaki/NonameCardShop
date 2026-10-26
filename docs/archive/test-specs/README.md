# 历史测试规格归档

2026-10-27 结构清理。下列文本保留旧阶段的意图和证据，不再作为当前执行测试。原始版本可从 Git 稳定标签 `stable-2026-10-27-before-structure-audit` 查看。归档并不表示这些旧断言在当前代码中通过。

| 历史规格 | 为什么归档 | 当前替代覆盖 |
| --- | --- | --- |
| backend-browser | 单将 BO3 注册、两局结算旧流程已移除 | native-modes-browser、operations-v7-browser、three-formats、storage-archives-browser |
| npc-engine-browser | NPC 默认后台挂真实引擎，已改后台模拟 | gameplay-adjustments、shop-experience、long-term-operations |
| backend-management | 旧设施数值、旧顾客卡池与旧 BO3 后台结算耦合 | long-term-operations、high-quality-pass、customer-demand |
| backend-edge-cases | 大量依赖旧单将报名、全主题开局可买与 N/R 市场 | battle-lifecycle、rooms-and-strength、basket、day-starts、storage-archives-browser |
| distribution-skins | 19 包、动态按评分印刷、通用皮肤已取消 | ideal-yield-and-editions、band-only-appearances、frontend-skins |
| frontend-integration | 经典前端与标准包、旧顶部按钮、旧 BO3 全链路 | formal trading、playability-integration、scroll-and-album-browser、三模式检查 |
| core4-matchmaking | 旧单将队列与 BO3 局数规则 | rooms-and-strength、three-formats、operations-v7 |
| core4-ui | 旧单将入口、八张分页和旧选将组件 | pack-roster-browser、scroll-and-album-browser、room-format-selection-browser |
| trade-workspace-pagination | 用户已要求滚动界面，不能继续断言每页仅八张 | trade-workspace-scroll：千行可达、排序、选择不跳顶、筛选和真实挂单 |
| narrative-browser | 原外置故事面板，与现在场景对话呈现相冲突 | world-story-browser、long-term-browser、narrative-runtime |

仍有价值的原检查已保留或更新：订单幂等、金额与成本守恒、未知响应恢复、同模式选将、旧档内容、按天回退、外观原图、嵌套暂停、分支隔离和权限校验。测试使用当前配置或明确标注的独立组件夹具；不得为了让旧测试通过而恢复已取消的玩法。
