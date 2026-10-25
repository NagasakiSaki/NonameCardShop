# V7 独立分工包：高手挑战与多模式

本轮是开发任务，游戏尚未实现。先将各组对应ZIP/文件夹和完整工程交给执行模型，最后主模型统一合并；不需要各组中途等其他模型。

| 包 | 内容与入口 | 能力 | 压缩包 |
| --- | --- | --- | --- |
| V7-A | [经济与卡包](01-标准模型-经济与卡包/README-先读.md) | standard-code | [ZIP](压缩包/01-标准模型-经济与卡包.zip) |
| V7-B | [高手与约战](02-标准模型-高手与约战/README-先读.md) | standard-state-machine-with-primary-review | [ZIP](压缩包/02-标准模型-高手与约战.zip) |
| V7-C | [赛制与系列赛](03-标准模型-赛制与系列赛/README-先读.md) | standard-code-with-rigorous-tests | [ZIP](压缩包/03-标准模型-赛制与系列赛.zip) |
| V7-D | [无名杀适配](04-高质量模型-无名杀适配/README-先读.md) | high-quality-code-or-primary | [ZIP](压缩包/04-高质量模型-无名杀适配.zip) |
| V7-E | [场景对话与前端](05-前端模型-场景对话与开桌/README-先读.md) | frontend-with-browser-and-visual-review | [ZIP](压缩包/05-前端模型-场景对话与开桌.zip) |
| V7-F | [独立审计与验收](06-独立模型-审计与验收/README-先读.md) | independent-code-and-browser | [ZIP](压缩包/06-独立模型-审计与验收.zip) |

每包包含独立任务书、统一指令、冻结规则、共享接口和fixture。若只有一个高质量模型，优先给D；B/C由标准模型按冻结合同做候选并由主模型审查；F保持独立。

[全部分工ZIP](压缩包/V7-全部任务包.zip)包含六组文件，不内嵌六份ZIP。唯一可编辑源在工程 `docs/collaboration/operations-v7/`，修改后运行 `python tools/package-operations-v7-docs.py` 重新生成。V6不冲突的长期任务保留，重叠规则以V7为准。
