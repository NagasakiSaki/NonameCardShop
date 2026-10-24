# 用户图源立绘工具

入口为 `python tools/portrait-kit/build.py`。本工具由 ART-03 最终候选转换流程接入，使用 Pillow、numpy，不需要游戏存档、浏览器会话、API 密钥或默认安装 PixelOE。角色 ID 与后端身份/钱包/行为无关。

当前登记：`data/character-portraits.json`，五团 25 人。默认图源为用户提供的桌面 `全部角色基础全身立绘/PNG透明格式`；源目录可用 `--source-dir` 改位置，但同一版图片必须通过 SHA-256 核验。旧官方页来源仍保留在 `data/character-reference-audit.json`，不作为当前立绘的输入。

本批验证环境为 Python 3.13.2、Pillow 12.1.1、numpy 2.4.3；依赖版本在 requirements.txt。已有环境无需重复安装；另一台机器可在独立虚拟环境安装该清单，避免量化算法版本变化影响逐字节复现。

```powershell
# 只列出本次重建，不写文件
python tools/portrait-kit/build.py --ids bd-tomori,bd-rana --dry-run
# 仅重建选定角色；输出是独立工作目录，原图和正式资源不修改
python tools/portrait-kit/build.py --ids bd-tomori,bd-rana --out .local/portrait-build
# 全量重建省略 --ids，约数分钟；默认输出 128×224、384×672 与 96/128 头像
python tools/portrait-kit/build.py --source-dir 'D:\MyPortraits\PNG透明格式'
# 全量候选通过审查后，由工程负责人统一导入
node tools/character-kit/import-portraits.mjs --candidate .local/portrait-build --source-dir 'D:\MyPortraits\PNG透明格式' --dry-run
node tools/character-kit/import-portraits.mjs --candidate .local/portrait-build --source-dir 'D:\MyPortraits\PNG透明格式'
```

局部重建目录保留其他已重建角色，不凭空补齐未生成的 25 人；正式导入必须 25 人全部齐全。`import-portraits` 无 --candidate 时读取现有 ART-03 候选目录。首次运行导入需要 `npm run art:setup` 安装现有 pngjs 工具依赖，游戏运行不需要它。

原图只读，工作目录暂存 canonical ID 的 PNG 和参数；默认 `.local/portrait-build` 不提交 Git。原图变化时停止重建，先重新检查 `presets.json` 的 `headRectSource`，不要把旧头框无条件套到另一张图上。角色构图、道具和原图已有的裁切保持，不补画图源没有的身体。

原生正式立绘为 128×224、64 色；头像为 96×96、二值 alpha、整数最近邻采样。保留 384×672 工作图用于准确头像裁切。导入时检查全部 ID、原图哈希、最终记录及像素尺寸，再将选中的 50 张成品编码为项目支持的 filter-0 PNG：**像素保持一致，文件压缩字节与候选可能不同**，登记中分别保留 candidateSha256 与正式 sha256。

正式图像采用内容哈希文件名，登记由 `portrait-overrides.mjs` 在人物包重建后应用，因此 `npm run art:install` 不会把新立绘还原为旧几何稿。该覆盖只涉及 portrait/avatar/来源字段，不改行走图、预算、存档或角色 ID。

预览入口：`/experiments/character-portraits/index.html`，与游戏读取同一份正式登记；旧代码画稿保留供比较。原有 `/experiments/character-art/index.html` 继续承担行走/代码换装实验，不将静态立绘当作行走动画。

`pixelate_portraits.py`、`build_preview.py`、`build_sheets.py`、`run_pixeloe.py` 保留了候选管线实现，默认工作目录可通过 `CARD_SHOP_PORTRAIT_WORKDIR` 指定。日常使用上面的 build.py 包装即可；PixelOE 属可选对照，没有默认复制或安装它的虚拟环境。组件开源许可不改变用户图源本身的权利归属。

定向检查：`node tests/portrait-sources.mjs` 与 `node tests/frontend/assets.mjs`。不需要为单纯更换立绘重跑经济或真实牌局测试。
