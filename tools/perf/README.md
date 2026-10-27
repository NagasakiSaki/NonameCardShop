# 性能和稳定性测量

所有脚本使用内存仓库或随机服务 origin 下的新浏览器/数据库，不操作实际玩家档。报告必须写新文件；旧原始 JSON 保留，不覆盖不利样本。

```powershell
npm run perf:browser -- --cards 1000 --rounds 2 --json .local/grid-1000-new.json
npm run perf:browser -- --cards 5000 --rounds 2 --json .local/grid-5000-new.json
npm run perf:browser -- --cards 5000 --rounds 2 --baseline-ref 3747a6ba --json .local/grid-before-new.json
npm run perf:soak -- --seconds 600 --cards 1000 --json .local/operations-new.json
npm run perf:windows -- --seconds 600 --json .local/windows-new.json
```

## 浏览器 v5

`browser.mjs` 是 `grid.mjs` 的兼容入口。v4 原脚本保留在稳定标签 `stable-2026-10-27-stage-c-maintenance` 的 Git 历史；原始 v1～v4 JSON 不改写。v5 不与旧口径混算。

每轮重新加载，重置搜索/页签草稿，强制验证逻辑行数等于注入卡种数。相同打开时点计首个可操作卡片与点击逻辑末行的累计耗时；不是只看 DOM 的最后一个。滚动从 top=0、同一逻辑总数开始，记录实际 rAF 间隔/计数、真实位置/可见行变化、长任务和 DOM 峰值；虚拟化不要求全表同时挂 DOM。另验证搜索实际应用、焦点和关闭清理。

`--baseline-ref` 只接受提交 SHA，在临时 HTTP 响应中替换该版 collection 模块；其余都是当前代码。它是隔离组件前后对照，不是整个旧版本复现。记录实际响应哈希和输入文件哈希。v5 不再使用旧 `--render-mode full`，复验历史报告应回到对应提交。

## 长测

`operations-soak`：1000 张初始实物、店长测试资金100万、游戏4倍速；默认顾客预算与流量不变。通过真实 Host 采购20包/天、移动站位、上架、营业、自动 NPC 购物/拆包/比赛、打烊和下一天。周期性重连真实 IndexedDB，业务字段逐项相等；允许的 NPC 坐标/导航/外观版本校正另记。销售与日账逐日核对，结束后验证日初资金/库存/时钟回退。

先单独测30次 IndexedDB `transaction.oncomplete`，其后长跑耗时是功能压力证据，不作无竞争性能指标；序列化 UTF-8 估值不称实际磁盘字节，commit 完成不称 fsync。`--tick-ms 0 --seconds 15` 可做加速流程预检，但15秒不冒充10分钟长跑。

`windows-soak`：5000 实物的暂停测试世界，反复打开收藏、滚动五个区间、真实右键看技能、Esc 返回和关窗；校验缓冲 DOM 有界、暂停原因回到原状态、根节点移除、window/document 监听器不增。两次热身后记录基线，定期强制 GC 仅供堆与监听器诊断；瞬时 toast 与持久 DOM 分开，堆缓存增长不直接等于泄漏。

两个长测互补，不把暂停 UI 世界冒充高成交经营，也不把 NPC 模拟比赛计作真实原生对局。可与完整回归并行做功能检查；需要比较性能时单独运行。同版本真实磁盘、EXE、低端机、触摸和复杂技能自然状态仍需后续覆盖。
