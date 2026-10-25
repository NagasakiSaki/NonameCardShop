# 候选收包与沙盒工具

来自 CV6-17，由主模型复核、修正后接入。只服务开发，不被游戏运行时加载；不要求仓库已有 `deliverables/` 才能启动。Node 使用项目当前运行时。

在工程根运行：

```powershell
node tools/cv6/src/cli.mjs check CV6-19
node tools/cv6/src/cli.mjs all
node tools/cv6/src/cli.mjs summary
node tools/cv6/src/cli.mjs sandbox CV6-17 --name review
node tools/cv6/tests/run-tests.mjs
```

输出默认在 `.local/cv6/`，原作者交付只读。`--json` / `--out` 也只能写本工具输出根。`CV6_PACKAGE_DIR` 可指定独立测试输出根；不要指向正式源码或别人的交付目录。

沙盒复制文本，`.local` 单独创建，不共享玩家数据或发布仓库。大资源 `assets/node_modules/vendor` 使用 junction；工具自己的复制/补丁写入拒绝穿过链接和硬链接。junction 不提供操作系统层面的只读执行隔离，运行其他程序前仍须检查其写入行为。`verify` 是事后观察，不能阻止任意子进程写穿，也不能把 mtime 扫描当作完整内容一致性证明。

收包结构通过不等于功能正确；`wired` 只是静态引用线索。正文写了“完整”不代表真实 Host、浏览器或引擎链已验证。输入哈希漂移要判断差异影响，不应盲目改哈希冒充复验。

正式采用仍由主模型检查最小补丁。只读区是外部作者的写入边界，主模型可以在具体审查后接入；不全局放宽 `--allow-readonly`。补丁工具只支持普通文本 unified diff；二进制、重命名、无 hunk、无尾换行等明确拒绝，必要时在仓库根用 Git 单独处理。

`purge` 只清理本工具拥有的退役沙盒，不清其他目录。旧报告保留，不自动删除手写说明。默认不提交、不推送、不更新 EXE。
