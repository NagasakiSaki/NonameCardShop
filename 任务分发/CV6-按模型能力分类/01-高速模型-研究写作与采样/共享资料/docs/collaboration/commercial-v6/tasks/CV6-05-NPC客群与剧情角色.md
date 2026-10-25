# CV6-05：NPC客群与剧情角色

**后续任务书，尚未下发/实施。** 先读 `docs/collaboration/commercial-v6/` 下的 README、03-剧情与店外世界接口、04-分工排期与接入规程、05-完整产品验收；故事/工具包另读01/02。正式当前源码基线为 `74c7a8e9`，启动记录实际HEAD，不重置。

- 唯一可写：`deliverables/commercial-v6/CV6-05/`。正式工程、其他交付、用户原图/存档、vendor只读。
- 能力：代码模型，先纯决策再patch。
- 最终验收依赖：CV6-02、CV6-19。A阶段合同/样例可先行，不等依赖包全部未来内容完成。
- 现行规则：三档价100/200/300；NPC对战不暂停不跳时，玩家整场暂停/+30一次；KOF新将摸四张、不继承；普通交互暂停保留。

## 目标

统一自然顾客、熟客、员工和命名剧情人物，不分身、不堵门、不双重占桌。

## 最小只读输入

visits/customer-identity/trading/trash/match-queue/npc-tables/management；19人物、24位置模型；既有NPC测试。

## 分步工作

1. 画当前访问/购物/开包/拾牌/对战/离店状态与锁拥有者；列personId→actorId→appearanceId绑定。

2. 交命名人物与自然行为的最小仲裁模块、预约/延后/取消/离场；复用钱包、实际持卡与流通，不新造NPC存储。

3. 覆盖台词会面与营业冲突、人物不在、打烊/跨地图/旧档；外形不决定财富/行为，剧情不强行传送忙碌顾客。

## 专项交付

src/意图与绑定模块、人物/客群配置、patches/、状态图、正常/拥挤/取消/跨日回归。

另交 `DELIVERY.md`、`manifest.json`、`gaps.md`，含基线/哈希、合同版本、候选到正式路径、最小patch、复现命令、证据与限制。研究/内容包交可用结构化文件，不只复述本任务书；代码不能正式依赖demo/fixture/deliverables。

## 验收

W02/G02/N08；同一人物唯一；每个意图有退出；NPC对战不停经营；两套日程不得争抢控制。

场景号见05。证据分static/unit/host-integration/browser-real/engine-controlled/manual-observation/preview-fixture/unverified；未测如实列出。新API尚为提案，不能假成功。只跑必要关联链，不反复全库验证。

## 协作与边界

不提交/发布/安装正式EXE，不改玩家档/原图、不清工程、不停他人进程、不自动联系模型。动态操作用本包sandbox、临时端口、新context/内存仓库，测试输出仅本包evidence。与共享文件冲突交17汇总，普通缺口由原作者补齐；主模型只裁决关键合同/持久风险和最终合并。
