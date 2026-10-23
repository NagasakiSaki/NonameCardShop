# 人物美术独立试验

本目录的预览网页不导入正式 Host、不连接引擎、不读写 localStorage 或 IndexedDB；营业额和顾客业务状态均为演示。2026-10-24 已把本工具生成的基础店长和五团 25 套外观通过独立安装器接入正式游戏的换装与顾客外观池，未更新 exe。其他模型的操作方法见 [MODEL-GUIDE.md](MODEL-GUIDE.md)。

打开 `http://127.0.0.1:5190/experiments/character-art/index.html`（先运行项目的一键启动游戏）。A 页支持方向键/WASD、点击地面移动和四向轮播；B 页是头像式经营构图；C 页支持部件、调色、表情和 PNG/JSON 导出。

## 官方参考

- 任天堂《宝可梦 火红／叶绿》人物与实机截图：https://www.nintendo.co.jp/n08/bprj/chara/index.html
- 任天堂《宝可梦 心金／魂银》官方截图：https://www.nintendo.co.jp/ds/ipkj/reborn/index.html

从官方实机画面观察，地图人物使用紧凑的大头比例，通过帽子、头发和服装色块识别；对战人物使用独立、更细致的画稿。具体 64×64 动画帧和 96×96 头像是本试验所用开源素材的规格，不是对宝可梦原版贴图尺寸的断言。未复制、提取或随项目分发宝可梦原版贴图。

## 头像部件

Author: **Viktor Hahn**

Project: https://github.com/V-ktor/pixel-art-portraits

Demo: https://v-ktor.itch.io/pixel-art-portrait-generator

Artwork license: **Creative Commons Attribution 4.0 International**

License: https://creativecommons.org/licenses/by/4.0/

Code license: MIT. Original notices are included in `sources/portraits/LICENSE.txt` and `CODE-LICENSE.txt`.

本试验选取部分头发、面部和服装部件，将原 Godot 着色公式移植到浏览器 Canvas，通过 JavaScript 组合并修改配色。没有运行下载的 Godot 项目。基础 3 套输出为 96×96；五团新立绘仅复用面部/头发部件，新绘身体和服饰为原生 128×224，列表头像从立绘裁切为 96×96。全部保留透明通道。

## 行走人物

Project: **LPC Revised**, https://github.com/ElizaWy/LPC

Artists for the selected body/head: **Stephen Challener (Redshrike)** and **Eliza Wyatt (DeathsDarling)**. Hair and clothing by **Eliza Wyatt (DeathsDarling)**, based on the corresponding LPC body geometry.

License: **OGA-BY 3.0**. See the complete supplied component credit notices:

- `sources/lpc/credits.txt`
- `sources/lpc/hair-credits.txt`
- `sources/lpc/clothing-credits.txt`

License: https://static.opengameart.org/OGA-BY-3.0.txt

本工具组合选定的身体、头部、发型、上衣、长裤和鞋；源帧 64×64、四向八帧，图集 512×256。行序为上、左、下、右。新增头发和白衬衣来自相同锁定提交，继承已附的头发/服装署名。五团模板进一步改色并添加代码绘制的长发、双马尾、花饰、耳机和发夹；新覆盖层跟随每帧实际头部位置。头像与行走部件来自不同作者；本轮另按全身参考新绘分团服装覆盖，包括披尾、裙裤、腿装和鞋，仍需审美确认。

## BanG Dream 外观参考

五团各 5 人的官方人物图已逐个查看，来源为 `https://bang-dream.com/artist/` 下的 MyGO!!!!!、Ave Mujica、夢限大みゅーたいぷ、millsage、一家Dumb Rock! 页面。逐人链接在 `data/band-appearances.mjs`；全身参考图的 URL/哈希元数据在 `data/character-reference-audit.json`，官方姓名和服装特征在 `data/character-audit.mjs`。本地参考图没有随工程分发。新像素稿为开源部件组合、改色与代码新绘，不是官方贴图。原角色设计权属原作者；基础组件的开源许可不等于 BanG Dream 原角色设计授权。

## 调整入口

- `standing-portrait.mjs`：25 套完整立绘的身体、服饰、发型几何和头像裁切；128×224 原生。
- `portrait-kit.mjs`：可独立复用的头像组合、颜色映射、图集组合和 PNG/JSON 导出函数。
- `appearance-data.mjs` 内的 `PRESETS`：人物配置和共用着色公式；没有把职业和性格绑定到外形。
- `app.mjs`：独立试验页面和行走动画；与正式经营逻辑完全分离。
- `style.css`：A/B 方案的布局、配色与显示尺寸。

当前已有通用 JSON 输入、单人/整包批量导出与安装 CLI，和网页调色/表情预览。没有重新开发完整绘图编辑器，也没有安装 Aseprite、LibreSprite 或 Pixelorama。

## 已生成与核对的样例

`generated/` 保存 3 套基础模板与 25 套五团外观的透明头像、行走图集、图册和人物配置；另有 25 套完整立绘及五张分团全身图册。命令行与网页共享配置、着色及像素覆盖函数，不依赖截图或游戏存档。

在项目根目录执行：

```powershell
npm install --prefix .local/art-lab/tools --ignore-scripts --no-audit --no-fund pngjs@7.0.0
node experiments/character-art/build-samples.mjs
```

PNG 解码依赖 pngjs 7.0.0，仅安装在 `.local`，不增加正式游戏运行依赖。批处理包含原生尺寸、透明通道、表情变化、改色变化、四向差异与确定性导出的核对。

本轮浏览器自动检查全部 28 张行走图、25 张完整立绘与 CLI PNG 像素一致，并核对窄屏展示、正面选人及编辑器原生尺寸。网页下载按钮已提供，内置浏览器的自动落盘位置未确认；需要现成文件时可直接使用 `generated/` 下的 PNG。

用户已认可 A 方案的行走效果，后续保留行走与独立头像。五团本轮已按全身图重画服装、发型与识别饰品；细蕾丝/网纹、局部发束和乐器遮挡处为像素概括，手持乐器与完整姿势动画尚未制作。详细核对见 `docs/人物精修与姓名服饰核对.md`。整套交易前端重建见 `docs/下一版前端重建开发文档.md`，本次人物接入不代表该前端重建已经完成。
