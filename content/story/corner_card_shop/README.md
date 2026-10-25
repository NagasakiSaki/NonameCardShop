# 《街角牌局》首批剧情编辑源

已收序章、首章与林澄/许遥/周野三条支线小样：5 个流程文件、60 个节点。人物人格原创，外形引用与人物身份分离。源头来自 CV6-19/20，接入修订见工程 `docs/reviews/2026-10-25-cv6-first-deliveries.md`。

这是 `card-shop-story-authoring/1` 制作数据，不是已激活的运行包。当前 Host 不加载这些文件，不会新增人物、奖励、考核或地图。`schemaVersion:1` 是候选内容版本；运行器合同尚未冻结，不能把它等同于正式 story runtime schema。

在工程根运行：

```powershell
node tools/story/validate.mjs
```

校验流程/文本/人物/旗标、跳转、失败出口、可达性和无出口循环，并实际执行 `tests/scenario-tests.json` 的 5 个纯文本预演。输出 `preview-fixture`，不能证明真实成交、保存恢复或牌技资格。

当前制作工具支持本批使用的 line/choice/wait/action/end 五种节点。未来 branch/cue/transition 在对应运行器合同与工具支持后再开放，未知节点现在直接拒绝。流程文件是编辑真源；可读台本是审阅稿，不能与 JSON 同时作为运行输入。

`historyPolicy: include-prior-actual-business` 明确首章首单可读取此前已真实完成的交易指标；“等待下一笔”的新节点必须改用相应运行时事件合同。状态指标不会被预演注入正式世界。

旗标的 `writableByStory` 是本批制作约束：仅开放已用的意图/偏好旗标，实际成交、赛果、资格和战役完成等保留字段不能靠一句台词自行置真。`practiceQuestUnlocked` / `fridayEventPlanned` 目前只表达剧情意向，不代表已开桌或已承办赛事。

立绘占位 ID、人物出现条件、后续地图名、触发器和引擎 profile 都还需运行器绑定。现有地点身份仍是 store/battle-room；不按策划稿中的 `map_store_main` 等草拟名改旧档。第二至六章尚有骨架，没有最终台本或可达性实测。
