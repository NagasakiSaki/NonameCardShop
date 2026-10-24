#!/usr/bin/env python3
"""Generate preview/index.html -- fully local static viewer for ART-03 samples.

B3: every selectable method/canvas/palette combination comes from the files that
actually exist (per character); missing combos are disabled with a reason, and a
broken image load shows a visible placeholder instead of nothing.
"""
from __future__ import annotations
import json
import os
import re
from pathlib import Path

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("CARD_SHOP_PORTRAIT_WORKDIR", str(HERE.parents[1] / ".local" / "portrait-build"))).resolve()

HTML = """<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<title>ART-03 立绘转换预览（本地静态）</title>
<style>
  :root { color-scheme: dark; }
  body { font: 14px/1.5 system-ui, "Microsoft YaHei", sans-serif; margin: 0; background: #16161c; color: #e8e8ee; }
  header { padding: 12px 20px; border-bottom: 1px solid #2c2c36; position: sticky; top: 0; background: #16161c; z-index: 5; }
  header h1 { font-size: 16px; margin: 0 0 6px; }
  .controls { display: flex; flex-wrap: wrap; gap: 14px; align-items: center; font-size: 13px; }
  .controls label { display: inline-flex; align-items: center; gap: 4px; }
  select, button { background: #232330; color: #e8e8ee; border: 1px solid #3a3a48; border-radius: 6px; padding: 3px 8px; }
  select:disabled { opacity: .35; }
  main { padding: 16px 20px 60px; }
  .char-tabs { display: flex; gap: 8px; margin-bottom: 14px; flex-wrap: wrap; }
  .char-tabs button.active { border-color: #7b7bff; background: #2c2c48; }
  .notice { border: 1px solid #6a5a2a; background: #332a14; color: #ffd98a; border-radius: 6px;
            padding: 8px 12px; margin: 0 0 12px; font-size: 13px; display: none; }
  .stage { display: flex; flex-wrap: wrap; gap: 22px; align-items: flex-start; }
  .figure { margin: 0; }
  .figure figcaption { font-size: 12px; color: #a8a8b8; margin-top: 4px; text-align: center; max-width: 280px; }
  .frame { border: 1px solid #3a3a48; border-radius: 4px; overflow: hidden; display: inline-block; }
  .frame.checker { background: repeating-conic-gradient(#3a3a44 0 25%, #2c2c36 0 50%) 0 0 / 24px 24px; }
  .frame.dark { background: #101014; }
  .frame.light { background: #f4f4f6; }
  .frame.magenta { background: #ff00ff; }
  img { display: block; image-rendering: pixelated; }
  .imgfail { padding: 24px; color: #ff9a9a; font-size: 13px; max-width: 260px; }
  .panel-demo { margin-top: 26px; }
  .panel-demo h3 { font-size: 14px; }
  .panel-row { display: flex; gap: 18px; flex-wrap: wrap; align-items: flex-end; }
  .panel-box { border: 1px dashed #555566; padding: 6px; border-radius: 6px; text-align: center; }
  .panel-box .lbl { font-size: 11px; color: #a8a8b8; margin-bottom: 4px; }
  .avatar-note { color: #8a8a9a; font-size: 12px; margin-top: 8px; max-width: 720px; }
  .hint { color: #8a8a9a; font-size: 12px; margin-top: 8px; }
</style>
</head>
<body>
<header>
  <h1>ART-03 原版立绘 → 像素转换预览</h1>
  <div class="controls">
    <span>角色</span><span id="tabs" class="char-tabs" style="margin:0"></span>
    <label>方法 <select id="method"></select></label>
    <label>画布 <select id="canvas"></select></label>
    <label>色板 <select id="palette"></select></label>
    <label>背景
      <select id="bg">
        <option value="checker">透明棋盘</option>
        <option value="dark">深色</option>
        <option value="light">浅色</option>
        <option value="magenta">洋红</option>
      </select></label>
    <label>缩放
      <select id="zoom">
        <option value="1">1×</option><option value="2">2×</option>
        <option value="3">3×</option><option value="4">4×</option>
      </select></label>
    <label><input type="checkbox" id="showOriginal"> 显示原版对照</label>
    <label><input type="checkbox" id="showCode"> 显示当前代码立绘</label>
    <a href="../samples/sheets/" style="color:#9a9aff">对照大图(sheets)</a>
  </div>
</header>
<main>
  <div class="notice" id="notice"></div>
  <div class="stage" id="stage"></div>
  <section class="panel-demo">
    <h3>游戏面板实际显示尺寸预览（CSS 缩放，pixelated）</h3>
    <div class="panel-row" id="panels"></div>
    <p class="avatar-note" id="avatarNote"></p>
    <p class="hint">面板尺寸沿用当前正式立绘档位：对话全身 128×224 / 96×168，头像 96×96 / 128×128。
      宽幅道具角色（楽奈贝斯、祥子键盘）在小面板里人脸偏小属预期：正式方案为
      「大立绘面板 + 独立头像」，不以拉伸全身补救。候选原生图 256×448 / 384×672，
      接入正式 manifest 前以本页目测为准。</p>
  </section>
</main>
<script id="manifest" type="application/json">__MANIFEST__</script>
<script>
const M = JSON.parse(document.getElementById('manifest').textContent);
const REASONS = {
  'pixeloe|96': 'PixelOE 运行慢（单图 62–272 秒），对照用途只生成了 c64',
  'pixeloe64q|96': 'pixeloe64q 是对 pixeloe c64 输出的后量化，仅存在 c64',
};
let cur = M.characters[0].id;
let want = { method: 'retouch', canvas: '256x448', palette: '64' };

const $ = id => document.getElementById(id);
function notice(html) { const n = $('notice'); n.innerHTML = html; n.style.display = html ? 'block' : 'none'; }

function charData() { return M.characters.find(c => c.id === cur); }
function has(method, canvas, palette) {
  return charData().combos.some(c => c.method === method && c.canvas === canvas && c.palette === palette);
}
function reasonFor(method, palette) {
  return REASONS[method + '|' + palette] || '该组合未生成';
}

function fillSel(sel, values, current, isAvail) {
  sel.innerHTML = '';
  let anyOff = false;
  values.forEach(v => {
    const o = document.createElement('option');
    o.value = v; o.textContent = v;
    const avail = isAvail(v);
    if (!avail) { o.disabled = true; anyOff = true; }
    sel.appendChild(o);
  });
  sel.value = current;
  if (sel.selectedOptions.length === 0 || sel.selectedOptions[0].disabled) {
    for (const o of sel.options) if (!o.disabled) { sel.value = o.value; break; }
  }
  return anyOff;
}

function render() {
  const tabs = $('tabs'); tabs.innerHTML = '';
  M.characters.forEach(c => {
    const b = document.createElement('button');
    b.textContent = c.id + ' ' + c.name;
    b.className = c.id === cur ? 'active' : '';
    b.onclick = () => { cur = c.id; render(); };
    tabs.appendChild(b);
  });
  const cd = charData();
  const methods = [...new Set(cd.combos.map(c => c.method))];
  const canvases = [...new Set(cd.combos.map(c => c.canvas))];
  const palettes = [...new Set(cd.combos.map(c => c.palette))].sort((a,b)=>a-b);

  // keep user intent when possible, else fall back and explain
  let msgs = [];
  if (!has(want.method, want.canvas, want.palette)) {
    if (!methods.includes(want.method)) { msgs.push(`本角色无方法 ${want.method}，已切到 ${methods[0]}`); want.method = methods[0]; }
    if (!has(want.method, want.canvas, want.palette)) {
      const cand = cd.combos.find(c => c.method === want.method && c.palette === want.palette)
               || cd.combos.find(c => c.method === want.method);
      if (cand.canvas !== want.canvas) msgs.push(`画布 ${want.canvas} 在当前选择下不可用，已切到 ${cand.canvas}`);
      want.canvas = cand.canvas;
      if (!has(want.method, want.canvas, want.palette)) {
        const cand2 = cd.combos.find(c => c.method === want.method && c.canvas === want.canvas);
        msgs.push(`色板 c${want.palette} 不可用（${reasonFor(want.method, want.palette)}），已切到 c${cand2.palette}`);
        want.palette = cand2.palette;
      }
    }
  }
  fillSel($('method'), methods, want.method, m => cd.combos.some(c => c.method === m));
  fillSel($('canvas'), canvases, want.canvas, v => has(want.method, v, want.palette));
  fillSel($('palette'), palettes, want.palette, p => has(want.method, want.canvas, p));
  // mark disabled reasons in tooltip
  [...$('palette').options].forEach(o => { if (o.disabled) o.textContent = o.value + '（未生成）'; });
  notice(msgs.length ? '⚠ ' + msgs.join('；') : '');

  const zoom = +$('zoom').value, bg = $('bg').value;
  const stage = $('stage'); stage.innerHTML = '';
  const mk = (src, w, h, label) => {
    const fig = document.createElement('figure'); fig.className = 'figure';
    const fr = document.createElement('div'); fr.className = 'frame ' + bg;
    const img = document.createElement('img');
    img.width = w * zoom; img.height = h * zoom;
    img.onload = () => fr.appendChild(img);
    img.onerror = () => { const d = document.createElement('div'); d.className = 'imgfail';
      d.textContent = '图片缺失：' + src; fr.appendChild(d); };
    img.src = src;
    fig.appendChild(fr);
    const cap = document.createElement('figcaption');
    cap.textContent = label + ' — ' + w + '×' + h;
    fig.appendChild(cap);
    stage.appendChild(fig);
  };
  const [w, h] = want.canvas.split('x').map(Number);
  mk(`../samples/${cur}/portrait-${want.canvas}-${want.method}-c${want.palette}.png`,
     w, h, `${want.method} / c${want.palette}`);
  if ($('showOriginal').checked)
    mk('../sources/' + cur + '-official.png', 275, 350, '原版（1100×1400 缩放显示）');
  if ($('showCode').checked && cd.codePortrait)
    mk('../' + cd.codePortrait, 128, 224, '当前代码立绘 128×224');

  const panels = $('panels'); panels.innerHTML = '';
  const file = `../samples/${cur}/portrait-${want.canvas}-${want.method}-c${want.palette}.png`;
  const dem = (w2, h2, lbl) => {
    const box = document.createElement('div'); box.className = 'panel-box';
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = lbl + ' (' + w2 + '×' + h2 + ')';
    const img = document.createElement('img'); img.width = w2; img.height = h2; img.src = file;
    box.appendChild(l); box.appendChild(img); panels.appendChild(box);
  };
  dem(128, 224, '全身·面板'); dem(96, 168, '全身·小'); dem(64, 112, '全身·列表');
  ['96', '128'].forEach(t => {
    const box = document.createElement('div'); box.className = 'panel-box';
    const l = document.createElement('div'); l.className = 'lbl'; l.textContent = '头像 ' + t + '×' + t;
    const fr = document.createElement('div'); fr.className = 'frame ' + bg; fr.style.display = 'inline-block';
    const im = document.createElement('img');
    im.onerror = () => { const d = document.createElement('div'); d.className = 'imgfail'; d.textContent = '头像缺失'; fr.appendChild(d); };
    im.src = `../samples/${cur}/avatar-${t}.png`;
    fr.appendChild(im); box.appendChild(l); box.appendChild(fr); panels.appendChild(box);
  });
  $('avatarNote').textContent =
    '头像说明：96/128 头像固定取自 retouch/c64 的 384×672 原生图，按逐人真实头部矩形（headRectSource）' +
    '最近邻 2:1 整数采样裁出，不随上方算法/色板切换（裁切坐标与安全区见 results.json 的 avatar 条目）。';
}

$('method').addEventListener('change', e => { want.method = e.target.value; render(); });
$('canvas').addEventListener('change', e => { want.canvas = e.target.value; render(); });
$('palette').addEventListener('change', e => { want.palette = e.target.value; render(); });
['bg','zoom','showOriginal','showCode'].forEach(id => $(id).addEventListener('input', render));
render();
</script>
</body>
</html>
"""


def build() -> None:
    import re as _re
    characters = []
    pat = _re.compile(r"portrait-(\d+x\d+)-([a-z0-9]+)-c(\d+)\.png$")
    for d in sorted((ROOT / "samples").iterdir()):
        if not d.is_dir() or d.name == "sheets":
            continue
        combos = []
        for p in d.glob("portrait-*.png"):
            if "@" in p.name:
                continue
            m = pat.match(p.name)
            if m:
                combos.append({"canvas": m.group(1), "method": m.group(2), "palette": m.group(3)})
        code_src = ROOT.parents[2] / "experiments" / "character-art" / "generated" / f"{d.name}-standing-128x224.png"
        code_rel = None
        if code_src.exists():
            dst = d / "code-standing-128x224.png"
            if not dst.exists():
                dst.write_bytes(code_src.read_bytes())
            code_rel = f"samples/{d.name}/code-standing-128x224.png"
        if combos:
            characters.append({"id": d.name, "name": d.name, "combos": combos, "codePortrait": code_rel})
    manifest = {"characters": characters}
    out = ROOT / "preview" / "index.html"
    out.parent.mkdir(exist_ok=True)
    out.write_text(HTML.replace("__MANIFEST__", json.dumps(manifest, ensure_ascii=False)), encoding="utf-8")
    n = sum(len(c["combos"]) for c in characters)
    print(f"preview -> {out.relative_to(ROOT)} ({len(characters)} chars, {n} real combos)")


if __name__ == "__main__":
    build()
