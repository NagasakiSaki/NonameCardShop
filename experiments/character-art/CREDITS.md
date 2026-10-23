# 人物美术独立试验

本目录为视觉比较与素材工具验证，不导入正式 Host、不连接引擎、不读写 localStorage 或 IndexedDB。没有替换正式人物、改存档或更新 exe。网页中的营业额和顾客业务状态均为演示。

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

本试验选取部分头发、面部和服装部件，将原 Godot 着色公式移植到浏览器 Canvas，通过 JavaScript 组合并修改配色。没有运行下载的 Godot 项目。输出保持 96×96 原生网格和透明通道。

## 行走人物

Project: **LPC Revised**, https://github.com/ElizaWy/LPC

Artists for the selected body/head: **Stephen Challener (Redshrike)** and **Eliza Wyatt (DeathsDarling)**. Hair and clothing by **Eliza Wyatt (DeathsDarling)**, based on the corresponding LPC body geometry.

License: **OGA-BY 3.0**. See the complete supplied component credit notices:

- `sources/lpc/credits.txt`
- `sources/lpc/hair-credits.txt`
- `sources/lpc/clothing-credits.txt`

License: https://static.opengameart.org/OGA-BY-3.0.txt

本试验组合选定的身体、头部、发型、上衣、长裤和鞋；源帧 64×64、四向八帧，图集 512×256。行序为上、左、下、右。头像与行走部件来自不同作者，服装和具体发型尚未完全对应；这次用于比较风格及技术可用性，不作为最终角色定稿。

## 调整入口

- `portrait-kit.mjs`：可独立复用的头像组合、颜色映射、图集组合和 PNG/JSON 导出函数。
- `appearance-data.mjs` 内的 `PRESETS`：人物配置和共用着色公式；没有把职业和性格绑定到外形。
- `app.mjs`：独立试验页面和行走动画；与正式经营逻辑完全分离。
- `style.css`：A/B 方案的布局、配色与显示尺寸。

当前验证重点是“成熟部件能否通过代码修改并输出可用 PNG”，以及“小型行走人物＋独立头像”和“头像式经营”的画面取舍。没有重新开发完整绘图编辑器，也没有安装 Aseprite、LibreSprite 或 Pixelorama。

## 已生成与核对的样例

`generated/` 保存三套透明头像、三套行走图集、闭眼表情、头像对照图和人物配置。命令行导出与网页组合器共享 `appearance-data.mjs`，不依赖截图或游戏存档。

在项目根目录执行：

```powershell
npm install --prefix .local/art-lab/tools --ignore-scripts --no-audit --no-fund pngjs@7.0.0
node experiments/character-art/build-samples.mjs
```

PNG 解码依赖 pngjs 7.0.0，仅安装在 `.local`，不增加正式游戏运行依赖。批处理包含原生尺寸、透明通道、表情变化、改色变化、四向差异与确定性导出的核对。

本次浏览器实测了 A/B 页切换、右向行走、独立侧面、闭眼切换和三套样稿的显示。网页下载按钮已提供，内置浏览器的自动落盘位置未确认；需要现成文件时可直接使用 `generated/` 下的 PNG。

当前结论：独立头像的造型质量与可编辑性明显优于上一版参数绘图模板；LPC 小人仍偏西式 RPG，头像与小人的服装也未完全统一。推荐先确认头像审美方向，再决定保留行走还是采用头像经营界面。本试验不代表最终美术定稿。
