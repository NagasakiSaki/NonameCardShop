# 架构与规则文档索引

更新：2026-10-27。本页是**当前有效文档**与**历史文档**的唯一入口。接手或排查前先看这里，避免把历史设计当成现行规则。

裁决顺序：使用者在当轮会话中的明确指令 → 当前可运行实现与配置 → 冻结玩法规则（下表“现行”）→ 最新验证记录 → 专项架构说明 → 历史设计与候选。

## 现行（以此为准）

| 文档 | 覆盖范围 | 对应实现 |
| --- | --- | --- |
| [三赛制与定价规则](三赛制与定价规则.md) | 三种对战格式、整场备战人数、210/360/510 基准档、固定发行与市场准入 | `modules/combat-formats/`、`modules/backend/v7-policy.mjs`、`data/print-editions.json` |
| [两回合收益论与固定发行-v1](两回合收益论与固定发行-v1.md) | 模型 `ideal-two-round-1`、场景分/斗地主分/全局定价分公式、印刷与发行分离 | `modules/backend/strength-modes.mjs`、`modules/backend/ideal-yield.mjs`、`data/strength-modes.json` |
| [长线经营与高手挑战-v1](长线经营与高手挑战-v1.md) | 高手链（第 2 天起、击败次日顺延）、伙伴岗位、四期借款目标、未来系统接口 | `modules/progression/`、`modules/backend/campaign-loan.mjs`、`modules/backend/debt-challenge.mjs` |
| [V7经营挑战与赛制接入](V7经营挑战与赛制接入.md) | 房间、系列赛、选将、挑战与经营窗口的接线 | `modules/backend/operations-v7.mjs`、`modules/backend/battle-rooms.mjs` |
| [工程目录与维护边界](工程目录与维护边界.md) | 目录职责、运行范围、备份与审计边界 | `config/project-layout.cjs`、`desktop/electron-builder.cjs`、`tools/audit/` |
| [策略来源与失效链](策略来源与失效链.md) | 现行/历史配置、版本、缓存和冻结实物 | `catalog-cache.mjs`、`v7-policy.mjs`、`audit:policies` |
| [上游内核升级暂存流程](上游内核升级暂存流程.md) | 新版本独立暂存、差异、静态资格与旧内容影响 | `npm run engine:stage` |
| [测试范围与证据等级](测试范围与证据等级.md) | OPT 任务选测、成本标签、原生/受控证据、失败补跑 | `tests/check-map.mjs`、`tests/run.mjs` |
| [技能描述提取与复核](技能描述提取与复核.md) | 术语恢复、动态文案边界、展示与评分分离 | `skills:audit`、`modules/backend/skill-descriptions.mjs` |
| [明亮素材工具](../../tools/frontend-art-bright/README.md) | 隔离构建、源图只读、25 人和几何双次复现 | `npm run art:reproduce` |
| [原生多人牌局适配与队友接管](原生多人牌局适配与队友接管.md) | 原生 profile、挂载校验、可选队友接管（页面顶部有 2026-10-27 校准块） | `integration/modes/`、`integration/host-battle.mjs` |
| [剧情运行器与兼容接口](剧情运行器与兼容接口.md) | 剧情源→包→游标、条件/动作注册、场景对话（页面顶部有 2026-10-27 校准块） | `modules/narrative/`、`frontend/v7-dialogue.mjs`、`content/story/` |
| [`contracts/README.md`](../../contracts/README.md) | Host 契约负载说明 | `contracts/*.d.ts`、`modules/backend/runtime.mjs` |

## 历史（保留证据，不作当前规则）

| 文档 | 状态 | 现行替代 |
| --- | --- | --- |
| [对战房间与四模式评分](对战房间与四模式评分.md) | 历史设计。四模式等权平均、`(BO3+KOF+斗地主+2v2)/4` 已废弃；仅“身份分”概念仍有效 | 三赛制与定价规则、两回合收益论 |
| [../FRONTEND-INTEGRATION.md](../FRONTEND-INTEGRATION.md) | 历史。96×128 人物、通用皮肤、固定八张分页、英文顾客均非当前规格 | 明亮二次元 64×64 规格、滚动交互 |
| [../下一版前端重建开发文档.md](../下一版前端重建开发文档.md) | 历史重建方案 | 同上 |
| [../前端重建第一阶段与工具交付.md](../前端重建第一阶段与工具交付.md) | 历史交付记录 | 同上 |
| [noname-v6/](noname-v6/) | V6 阶段的接入设计 | V7 现行文档 |
| [../archive/](../archive/) | 公开前历史与已归档测试规格 | 见 [test-specs/README](../archive/test-specs/README.md) |

历史文档只增补“当前状态/历史范围”说明，**不重写过去的验证结果**，也不因为文档写着旧玩法就回退实现。

## 验证入口

| 范围 | 命令 |
| --- | --- |
| 结构与资源闭包 | `npm run test:structure`（含 `tests/project-structure.mjs`、`tests/package-closure.mjs`） |
| 契约样本 | `node tests/contract-samples.mjs`（也包含在 `backend` 组） |
| 三赛制与房间 | `npm run test:rooms` |
| 原生模式 | `npm run test:native` |
| 长线与借款 | `npm run test:long-term` |
| 两回合收益与发行 | `npm run test:ideal-yield` |
| 剧情 | `npm run test:narrative` |
| 完整回归 | `npm run test:all`，失败可用 `--failed-from=` 补跑 |

测试清单只在 [`tests/groups.mjs`](../../tests/groups.mjs) 维护。受控夹具通过不等于自然对局或全技能认证。
