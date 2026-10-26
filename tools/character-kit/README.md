# 人物工具 character-kit 1.0

零依赖 Node CLI，供其他模型/脚本操作现有像素人物配置。Node >=22.12，从任意工作目录使用 CLI 的绝对路径也可；`--config`、`--out` 相对调用目录解析。它枚举部件、校验输入和导出核对图册，不修改渲染器、正式 manifest、存档或游戏入口。

在工程根目录：

```powershell
node tools/character-kit/cli.mjs --help
node tools/character-kit/cli.mjs list-parts --json
node tools/character-kit/cli.mjs validate --config experiments/character-art/generated/appearances.json --json
node tools/character-kit/cli.mjs contact-sheet --out .local/character-kit/review --json
node tools/character-kit/cli.mjs contact-sheet --out .local/character-kit/review --overwrite --json
node tools/character-kit/audit.mjs --out .local/collaboration/QA-01/new-review --json
```

`list-parts` 返回实际存在的 PNG 部件（路径、尺寸、许可）、25 套邦邦模板的完整配置、规格和署名入口。复制模板配置后编辑，不猜文件名。`validate` 接受人物对象、非空数组、`{presets:[...]}`、网页导出的 `{portrait:{...}}`；生成清单中的 portrait PNG 路径不能作为人物配置。字段补全用 [config.schema.json](config.schema.json)；文件存在性、ID 重复、costume 注册等额外约束由 CLI 核对。允许原工具的附加元数据，不把它们伪装成已冻结的 v2 契约。

行走精修使用可选 `walkCostume`，与立绘的 `costume` 分开；四人覆盖参数在 `data/walk-refinement.mjs`，绘制器在 `experiments/character-art/walk-refinement.mjs`。`ref-college`、`ref-bluedress`、`ref-gothic` 是新增行走版型，其余已注册版型也可用于精修路径。`sleevePalette` 为可选的三色袖子调色板。修改行走时保留原 `costume`，避免误改完整立绘；正式用户图源立绘继续走登记覆盖。

第二批已为全部 25 人启用精修分派；新增 `ref-denim-jacket`、`ref-waist-jacket`、`ref-mew-hoodie`。后者支持 `walkInnerColor / walkSkirtColor / walkTrimColor / walkHoodColor / walkSleeveStripe`（均为可选 #RRGGBB），袖条纹只改移动袖子遮罩，不画到手上。原四人 PNG 保持；取舍与源图核对见 [第二批接入](../../docs/人物行走与设施升级第二批.md)。

校验失败返回结构化 `errors:[{path,code,message}]`；例如 `/presets/0/hair`。输出目录必须在本工程内，不能在正式源码、资源或 `.git` 下；推荐 `.local/character-kit/`。已有目录默认拒绝；`--overwrite` 只接受带本工具标记的目录，不递归清理任何内容，不跟随输出文件符号链接。只读取 generated 中原生 PNG，不使用官方参考大图。

`--json` 的 stdout 始终只有一个 JSON 对象，包含 ok、command 等；不输出进度杂项。退出码：0 成功/帮助、1 配置校验失败、2 参数/文件/导出错误。工具内部不联网、不安装依赖、无 API 密钥。

图册输出五组 PNG（五团）、带姓名次序的 index.html 和机器可读标记；署名以工程 `experiments/character-art/CREDITS.md` 为准。原生立绘 128×224、列表头像 96×96、行走单帧 64×64；头像素材许可不等于原角色设计授权。

校验后沿用现有绘制/安装流程，不由本工具自动执行：

```powershell
node experiments/character-art/build-samples.mjs --config .local/my-character.json --out .local/my-render
# 审查通过后，由工程负责人安装完整内置人物包
npm run art:install
```

核心模块可直接 import：`listParts()`、`validateConfig(input)`、`contactSheet(out,{overwrite})`。核心操作规范、绘制参数和脸部图层注意事项见 `experiments/character-art/MODEL-GUIDE.md`。定向检查：`node tests/character-kit/cli.mjs`。

`audit.mjs` 是 QA-01 的独立只读检查入口，检查正式 manifest 的路径、每套格式、透明底、五团 ID/姓名/参考元数据和署名文件；输出 report.json / report.md。不能据此声称美术定稿或整个游戏无 bug。旧哈希只列报告，不删除。

## 用户图源立绘（2026-10-24）

新立绘工具见 `tools/portrait-kit/README.md`；登记入口 `data/character-portraits.json`，预览 `/experiments/character-portraits/index.html`。25 人立绘已采用用户 PNG，原生 128×224 与 96×96 头像。`import-portraits.mjs` 负责统一核验/导入，人物包重建保留新立绘覆盖；行走工具与旧几何画稿继续独立，不要将原图立绘当作四向行走帧。
