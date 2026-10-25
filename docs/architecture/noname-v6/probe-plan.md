# 内核探针与回归验证计划 (probe-plan.md)

> **任务标识**：CV6-11 无名杀耦合盘点
> **核心验收场景**：G04

---

## 1. 最小探针设计

为了在不启动庞大前端界面的情况下持续监控无名杀适配器的健康度，设计 3 个轻量自动化探针：

### 探针 1：运行时服务探针 (`probe_runtime_endpoint`)
- **目标**：验证 `server.mjs` 中的 `/api/runtime` 是否正确暴露并且指向合法的无名杀入口。
- **探测逻辑**：
  ```bash
  curl -s http://127.0.0.1:8080/api/runtime | jq .
  ```
- **通过断言**：`response.ready === true && response.version === "1.11.6" && response.integrationVersion === 2`。

### 探针 2：KOF 换将摸牌规则探针 (`probe_fresh_four_rule`)
- **目标**：验证在武将阵亡接替时，严格执行“重摸4张，不继承上家手牌”的商业版 V6 规定。
- **探测逻辑**：
  - 构造受控对局用例：首发武将受到致命伤害阵亡；
  - 监听 `channel: 'noname-packer'` 的 `type: 'replacement'` 消息；
  - 断言收到的事件载荷中：`inherited === 0 && drawn === 4 && handPolicy === 'fresh-four'`。

### 探针 3：Iframe 内存生命周期探针 (`probe_iframe_lifecycle`)
- **目标**：连续运行 5 场后台 NPC 模拟对战，监控 iframe 创建、注销与消息监听器清理。
- **通过断言**：对局结束后对应的 iframe 节点被完整从 DOM 移除，没有遗留的悬挂监听器引发内存泄漏。
