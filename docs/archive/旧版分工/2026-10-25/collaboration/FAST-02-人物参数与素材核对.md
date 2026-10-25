# FAST-02：高速模型的人物参数与批量素材任务

总安排见 [当前分工](2026-10-24-有限模型资源分工.md)。本包做核对、参数、可复现生成和图册，不要求高速模型独立设计复杂遮挡/新服装渲染算法。

唯一可写：`D:\GameDev\NonameCardShop\deliverables\playability-v3\FAST-02\`。只读正式 data/工具/资产和用户图源；不运行 `npm run art:install`、不改 manifest、不改正式立绘/PNG/源码。

## 1. 输入

- `tools/character-kit/README.md`、`experiments/character-art/MODEL-GUIDE.md`。
- `data/band-appearances.mjs`、`data/character-audit.mjs`、`data/character-portraits.json`、`data/walk-refinement.mjs`。
- `experiments/character-art/walk-refinement.mjs` 与正式四人行走，作为已修复基线。
- 用户只读 PNG 目录：`C:\Users\lenovo\Desktop\OurNotes_BanG_Dream剧情\全部角色基础全身立绘\PNG透明格式`。
- [旧任务第 4 节](PLAY2-X-复杂模型交接.md) 的 21 人清单/三批顺序，只继承人物规格，不继承“一个模型完成全部任务”。

已完成不重做：`bd-tomori / bd-rana / bd-sakiko / bd-yomogi`。剩余 21 人以实际 BAND_APPEARANCES 减去四人为准，核对表不得漏/重复。姓名按登记，不从翻译/文件序号猜人。

## 2. 两阶段，避免把难题硬塞给高速模型

**阶段 A，现在即可开始：**

1. 每人填写 `characters.json`：稳定 ID、登记名、对应源图、发色/眼色/上衣/袖子/腿装/鞋/发饰、可直接使用的现存版型、需要新模板的理由、核对置信度与来源。参数结构继承现有配置，不自造后端字段。
2. 有看图能力时直接对源图核对；没看图能力只提取登记事实/色板和整理图册，标“未视觉确认”。不能凭名字或文件排列编服饰。
3. 输出 source 对照、旧行走原生/2×/4×图册和 `needs-template.md`。缺新版型的角色说明哪部分不适配，不用最接近模板假装完成。

**阶段 B，模板已可用后：**

4. 只用正式已支持版型，或只读 HQ-DEV 的 `templates/APPROVED.md` 指定候选版型/配置，生成透明 PNG 和四向逐帧/左右行走预览。记录 renderer/config/hash，不能只交手改 PNG。
5. 单帧 64×64，四向×八帧，512×256，沿用现有行序/9 fps/脚底 (32,61)。`costume` 保留，精修分派用 `walkCostume`；不要以染肤色/全员镜像掩盖问题。
6. 每人核对脸/侧脸/手臂可见性/脚锚点/循环；能看图才填视觉通过。原本异色瞳和不对称发型保留。任何错误列 review 表，由 HQ-DEV/主模型决定算法修复。
7. 四人基线与 25 人正式立绘只做回归/哈希对照，不覆盖。未获支持角色标等待模板，先交已能完成者，继续其他独立工作。

禁止自行扩展公共绘制器、换规格、复制 21 个完整绘制函数、重新绘制 25 人立绘。确需工具差异在本包 proposals 里写清，不改正式工具。

## 3. 交付

README、baseline、DELIVERY、characters.json、needs-template.md、review.csv、sources.md、src/生成脚本或配置、assets/、preview/、evidence/。review 每行含角色 ID、实际生成版本、各项检查、未看图/未做项，不写笼统“全员通过”。

此任务没有视觉能力也可以完成事实与图册，但审美/动作是否通过必须留给高质量模型或主模型；不要让无多模态的高速模型自由创作。

可直接发送：请执行 `D:\GameDev\NonameCardShop\docs\collaboration\FAST-02-人物参数与素材核对.md`。先核对剩余 21 人参数/源图和模板缺口，再用已有或 HQ-DEV 明确批准模板批量生成、核对图册。只写自己目录，不独创新遮挡算法、不安装正式素材；无法视觉确认的项目如实标注。
