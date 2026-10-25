# TOOL-01：人物工具 CLI 的独立包装（可交给 zcode）

在 `D:\GameDev\NonameCardShop` 工作。先读 `docs/协作任务分工与任务包.md` 第 5、6 节及 `experiments/character-art/MODEL-GUIDE.md`。本任务只包装现有能力，不重新写渲染器。

允许新增/修改：`tools/character-kit/`、`tests/character-kit/`。禁止改 `data/`、`experiments/character-art/`、正式资源/manifest、根 package.json/锁文件、后端和存档。缺少核心能力时返回具体缺口，由主模型决定接口变更。

交付一个可独立运行的 `tools/character-kit/cli.mjs`：

- `list-parts --json`：枚举实际存在的部件、内置模板、尺寸及来源，不猜路径。
- `validate --config <file> --json`：验证当前工具已支持的配置形态、ID、三阶六位配色、部件存在性；合法退出 0，非法退出非 0，并提供结构化字段错误。
- `contact-sheet --out <directory>`：基于现成 PNG 生成分组联系表。只写指定新目录；输出已存在时拒绝覆盖或要求显式 `--overwrite`。使用项目既有 PNG 模块，不增运行依赖。
- `--help`、`--version`、错误退出码；`--json` 下 stdout 只有一个 JSON 对象，说明和警告走 stderr。

写 README，包括命令实例、允许的配置、只做包装的范围。schema 必须如实描述现有工具，不能把拟定的 v2 人物格式强塞到生产注册表。导出/安装能力继续调用既有 art CLI，本任务不要隐式运行安装、改正式 manifest 或制作新版 exe。

验收：新增一个小测试，覆盖合法配置、坏颜色、缺部件、不越界写入及结构化输出；用临时目录，不访问玩家数据。运行 `node tests/character-kit/cli.mjs` 一次。返回完整结果、文件列表、命令示例。主模型审查后才决定是否接入 npm 脚本/正式工作流。
