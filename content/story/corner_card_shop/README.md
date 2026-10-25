# 《街角牌局》首批剧情编辑源

已收序章、首章与林澄/许遥/周野三条支线小样：5 个流程文件、60 个节点。人物人格原创，外形引用与人物身份分离。源头来自 CV6-19/20，接入修订见工程 `docs/reviews/2026-10-25-cv6-first-deliveries.md`。

这是 `card-shop-story-authoring/1` 制作真源，已通过编译接入正式开发版的“故事”界面。Host 加载生成的 `card-shop-storypack/1` 包，不直接加载编辑文件。接口与维护规范见工程 `docs/architecture/剧情运行器与兼容接口.md`。

在工程根运行：

```powershell
npm run story:validate
npm run story:build
npm run test:narrative
```

校验流程/文本/人物/旗标、跳转、失败出口、可达性和无出口循环，并实际执行 `tests/scenario-tests.json` 的 5 个纯文本预演。输出 `preview-fixture`，不能证明真实成交、保存恢复或牌技资格。

共用定义支持 line/choice/wait/action/end 与 branch/cue/transition。cue 当前只是演出标记；无旅行能力时 transition 走失败出口。文本预演仍面向本批五种节点，真实 Host 行为由 test:narrative 验证。未知节点拒绝，扩展需注册受信任代码。流程 JSON 是唯一制作真源，可读台本只是审阅稿。

`runtime.json` 控制正式修订号、入口条件和人物外形绑定；编译输出在 `data/story/`。修改内容后提升 contentRevision 再构建，同一战役/修订号不能换内容。当前 corner-shop-ch01-r2 为活动版本，r1 保留给旧会话；不要删除旧包或用最新节点强行替换旧进度。

`historyPolicy: include-prior-actual-business` 明确首章首单可读取此前已真实完成的交易指标；“等待下一笔”的新节点必须改用相应运行时事件合同。状态指标不会被预演注入正式世界。

旗标的 `writableByStory` 是本批制作约束：仅开放已用的意图/偏好旗标，实际成交、赛果、资格和战役完成等保留字段不能靠一句台词自行置真。`practiceQuestUnlocked` / `fridayEventPlanned` 目前只表达剧情意向，不代表已开桌或已承办赛事。

runtime.json 已绑定现有立绘，人物作为联系人对话展示，没有新增实体剧情 NPC。现有地点仍是 store/battle-room，不按策划稿草拟地图名改旧档。第二至六章只有骨架；GUI 编辑器、实体角色日程、实际考核线和店外地图尚未实装。
