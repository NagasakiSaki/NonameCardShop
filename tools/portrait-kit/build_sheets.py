#!/usr/bin/env python3
"""Build labeled comparison sheets for ART-03 samples.

Sheet layout per character (samples/sheets/<id>-compare.png):
  row 1: original (fitted) | current code portrait 128x224 @2x | area | contrast | retouch | pixeloe?
  row 2: face zoom x4 for each conversion
  row 3: clothing detail zoom x4 for each conversion
"""
from __future__ import annotations
import json
import os
import sys
from pathlib import Path
import numpy as np
from PIL import Image, ImageDraw, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("CARD_SHOP_PORTRAIT_WORKDIR", str(HERE.parents[1] / ".local" / "portrait-build"))).resolve()
PROJECT = HERE.parents[1]  # formal project root
sys.path.insert(0, str(HERE))
from pixelate_portraits import head_rect_canvas, load_presets

CODE_PORTRAIT_DIR = PROJECT / "experiments" / "character-art" / "generated"
ZOOM = 4
PAD = 10
LABEL_H = 18
BG = (247, 247, 250, 255)
FG = (40, 40, 48, 255)


def font(size: int = 12) -> ImageFont.ImageFont:
    try:
        return ImageFont.load_default(size=size)
    except TypeError:
        return ImageFont.load_default()


def subject_crop(im: Image.Image) -> Image.Image:
    a = np.asarray(im)[..., 3]
    ys, xs = np.where(a > 8)
    return im.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


def zoom_head(im: Image.Image, hx0: int, hy0: int, hx1: int, hy1: int) -> Image.Image:
    """Square zoom around the character's REAL head rect (canvas px), padded 55%."""
    w, h = im.size
    cx, cy = (hx0 + hx1) / 2, (hy0 + hy1) / 2
    head_h = hy1 - hy0
    side = int(min(w, h, round(head_h * 3.1)))
    x0 = int(max(0, min(w - side, cx - side / 2)))
    y0 = int(max(0, min(h - side, cy - side / 2)))
    return im.crop((x0, y0, x0 + side, y0 + side)).resize((88 * ZOOM, 88 * ZOOM), Image.NEAREST)


def tile(img: Image.Image, target_h: int) -> Image.Image:
    s = target_h / img.height
    return img.resize((max(1, round(img.width * s)), target_h), Image.NEAREST)


def build_all(ids: list[str], colors: int = 64) -> None:
    presets = json.loads((ROOT / "presets" / "presets.json").read_text(encoding="utf-8"))
    outdir = ROOT / "samples" / "sheets"
    outdir.mkdir(parents=True, exist_ok=True)
    f_label = font(13)

    for cid in ids:
        preset = presets["characters"].get(cid, {})
        src = Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA")
        subject = subject_crop(src)

        cols: list[tuple[str, Image.Image]] = [("original", subject)]
        code = CODE_PORTRAIT_DIR / f"{cid}-standing-128x224.png"
        if code.exists():
            code_img = Image.open(code).convert("RGBA").resize((256, 448), Image.NEAREST)
            cols.append(("code-128x224@2x", code_img))
        for m in ("area", "contrast", "retouch"):
            p = ROOT / "samples" / cid / f"portrait-256x448-{m}-c{colors}.png"
            if p.exists():
                cols.append((m, Image.open(p).convert("RGBA")))
        p = ROOT / "samples" / cid / f"portrait-256x448-pixeloe-c{colors}.png"
        if p.exists():
            cols.append(("pixeloe", Image.open(p).convert("RGBA")))
        p = ROOT / "samples" / cid / "portrait-256x448-pixeloe64q-c64.png"
        if p.exists() and colors == 64:
            cols.append(("pixeloe+64q", Image.open(p).convert("RGBA")))

        rows = [("full", [im for _, im in cols])]
        detail_frac = preset.get("detailRect", [0.35, 0.26, 0.65, 0.42])
        zooms_face, zooms_detail = [], []
        h256 = head_rect_canvas(cid, (256, 448), preset)
        for name, im in cols:
            if name in ("original", "code-128x224@2x"):
                # zoom the source at matching subject-relative position
                continue
            zooms_face.append(zoom_head(im, *h256))
            x0, y0, x1, y1 = detail_frac
            w, h = im.size
            cx, cy = (x0 + x1) / 2 * w, (y0 + y1) / 2 * h
            side = 96
            dx0 = int(max(0, min(w - side, cx - side / 2)))
            dy0 = int(max(0, min(h - side, cy - side / 2)))
            zooms_detail.append(im.crop((dx0, dy0, dx0 + side, dy0 + side)).resize((96 * ZOOM, 96 * ZOOM), Image.NEAREST))
        rows.append(("face x4 (conversions only)", zooms_face))
        rows.append(("detail x4 (conversions only)", zooms_detail))

        total_w = max(sum(im.width for im in ims) + PAD * (len(ims) + 1) for _, ims in rows if ims)
        total_h = sum(max(im.height for im in ims) + LABEL_H + PAD for _, ims in rows if ims) + PAD
        sheet = Image.new("RGBA", (total_w, total_h), BG)
        d = ImageDraw.Draw(sheet)
        y = PAD
        for row_name, ims in rows:
            if not ims:
                continue
            d.text((PAD, y), f"{cid}  {row_name}", fill=FG, font=f_label)
            y += LABEL_H
            x = PAD
            for im in ims:
                sheet.paste(im, (x, y), im)
                x += im.width + PAD
            y += max(im.height for im in ims) + PAD
        # column labels for row 1
        x = PAD
        d = ImageDraw.Draw(sheet)
        yy = PAD
        first = True
        for name, im in cols:
            d.text((x, yy), name, fill=FG, font=f_label)
            x += im.width + PAD
        out = outdir / f"{cid}-compare-c{colors}.png"
        sheet.convert("RGB").save(out)
        print("sheet ->", out.relative_to(ROOT))


if __name__ == "__main__":
    import sys
    ids = sys.argv[1].split(",") if len(sys.argv) > 1 else ["bd-tomori", "bd-rana", "bd-sakiko"]
    colors = int(sys.argv[2]) if len(sys.argv) > 2 else 64
    build_all(ids, colors)
