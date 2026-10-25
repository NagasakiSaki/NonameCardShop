# 无名杀内核适配器 Profile 提案与解耦规范 (profile-proposal.md)

> **任务标识**：CV6-11 无名杀耦合盘点
> **核心验收场景**：G04
> **设计核心**：业务与叙事仅依赖“语义能力”，彻底杜绝私有 API 与底层对象侵入。

---

## 1. 引擎适配器 Profile 定义

### Profile A：现行基准 `noname-v6-profile-standard`
- **对应内核版本**：无名杀 `@noname/electron@1.11.6`（已通过 `data/engine-manifest.json` 15,876 文件完整性校验）
- **通信模式**：独立 Iframe 沙盒运行 + PostMessage 结构化信道（`noname-packer` / `noname-shop-engine-control`）
- **特化实现**：
  - KOF 阵亡接替：`handPolicy: "fresh-four"`（新将登场重摸4张牌，不继承上家手牌）
  - 时间推进：单场整场对局结算加30分钟一次，对局中不重复叠加营业时钟
  - 暂停控制：支持宿主直接发送 `pause`/`resume` 指令控制底层时钟。

### Profile B：未来隔离型 `noname-v6-profile-isolated` (提案)
- **设计目标**：适用于无 DOM 环境（Node.js 服务端回归测试、纯 Worker 运算与未来更新升级）
- **核心改造**：
  - 将无名杀封装在隔离的 Web Worker 或 Node VM 上下文中，消除全局 `window.lib`, `window.game`, `window.ui` 污染；
  - 弃用内部 `lib.onload2.push` 与对 `identity.game.checkResult` 的函数猴子补丁，改为通过标准外部适配层接收对局参数并返回结果。

---

## 2. 引擎语义能力契约 (Semantic Capability Contract)

任何接入卡店生态的引擎 Profile 必须通过统一的 Capability 探测接口声明其能力集，业务层仅根据能力标签决策：

```json
{
  "profileId": "noname-v6-profile-standard",
  "engineVersion": "1.11.6",
  "integrationVersion": 2,
  "capabilities": {
    "kofRelay": true,
    "freshFourDraw": true,
    "externalPauseResume": true,
    "headlessEvaluation": false,
    "statusStreaming": true,
    "replayExport": true
  }
}
```

### 业务与剧情解耦铁律：
1. **剧情台本绝对不接触规则底层**：
   - 剧情作者只能调用注册动作 `actionId: "assessments.startMatch"`，传递对决配置与对手 ID；
   - 严禁在剧情台本或内容配置中书写 JavaScript 访问 `lib.character` 或修改玩家血量。
2. **胜负结果纯语义接收**：
   - 宿主仅接收语义化的有效赛果：`{ matchId, winner: 'mine' | 'enemy', rounds, completedAt }`；
   - 剧情分支据此流转至胜/负节点，不关心无名杀内部是用哪张杀或哪个技能结束的对局。
