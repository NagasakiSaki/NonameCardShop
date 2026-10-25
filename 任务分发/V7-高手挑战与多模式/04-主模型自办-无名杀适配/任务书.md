# V7-D：原生斗地主、2v2与长期适配

**本包由主模型本人承担，不下发外部模型。** 可在 `deliverables/operations-v7/V7-D/` 做自己的隔离试验，再由主模型按正式接入流程修改桥接源码；禁止修改vendor。其他组不是前置条件，使用共享RoundPlan独立启动。外部A/B/C/E/F不等本包完成。

阶段状态：底层实现与测试已完成，首批049c499a、修正594de611，正式卡店系列赛/挑战接线待整合。可选接管保留，详见共享资料06/07；下面任务清单保留为实施和回归依据，不要求外部重做D。

## 连续任务

1. 盘点本地1.11.6 doudizhu/versus模式初始化、chooseCharacter、座位、控制、team判定、game.over、AI与子模式配置。报告文件+函数+hash，选择首版明确nativeVariant/profile，不凭网上新版本推断，不下载覆盖vendor。
2. 制作外挂native-mode adapter接口，与原bo3/kof桥隔离：mode/profile探测、参数传输、名单白名单、种子、角色/座位初始化。不能拿两人duel重新命名；原生规则优先，改钩子要有结构/版本前置校验和失败出口。
3. 地主真实3座：玩家地主/玩家农民两条路径都跑；玩家农民主将human、AI同伴，另一阵营AI。禁用原生另开无关随机选将，准确使用C计划。核对地主加成/农民规则按所选profile运行，不套旧决斗首轮规则。
4. 2v2真实4座：主将human，其余3AI；队伍/行动顺序确定，原生若有单人控制整队选项必须关掉。玩家死亡后继续观察AI，阵营死亡才结束；不把同伴私有手牌曝光为玩家可操作。
5. 可信消息：ready含profile/全部席位/阵容摘要；结果带gameId/roundId/resultId/teamId与摘要。验证origin+event.source+当前frame+world/branch/game/profile，主进程/Host补可信标记。冲突/迟到拒绝，不由网页参数决定赢家。
6. 挂载、隐藏页面、销毁、超时、错误、下一局重挂、重复ready/result、dispose全部覆盖，清理listener/frame/timer与本组租约。重用Host比赛暂停；整场时间由C/Host管，D不自行加30分钟或颁发奖励。
7. 能力探测必须实际校验本地可用规则/钩子，返回supported+reason/profile/hash。新模式失败不破坏原KOF/BO3。列出非兼容武将与原因、名单隔离策略，不通过禁掉全部复杂技能实现“兼容”。
8. 独立浏览器/本地服务测试：每模式两种玩家席位/胜负路径、AI同伴仍活、完整BO3串联测试脚本；至少用真实内核完成每模式一条自然完整结果。加速/控制fixture的其他反例要单独标识，不把直接game.over当自然对局。
9. 提交原桥接文件的建议补丁、可运行测试页、profile证据与回滚策略。兼容未来上游时通过能力/profile版本适配，不fork vendor，不让经营层依赖内部对象。

## 候选产物

`src/integration/modes/`，隔离native-harness页面，profile/耦合与兼容报告、实际engine-real日志/截图及一条自测命令；INTEGRATION列engine-server/engine-preload/duel/host-battle改法。

不能只交调查文档、模式按钮、随机胜负模拟。若本地原生模式存在真实阻断，交能复现的错误、已完成的另一模式和该模式完整候选/探测失败出口，继续本组剩余任务，不虚报通过、不要求其他组停工。
