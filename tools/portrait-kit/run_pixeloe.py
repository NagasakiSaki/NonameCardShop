#!/usr/bin/env python3
"""Bridge: run real PixelOE 1.0.0 (torch pipeline, CPU backend) inside tool/pixeloe-env.

Executed by pixelate_portraits.py via the venv python. NOT the deprecated legacy CLI:
we call pixeloe.torch.pixelize.pixelize (API), backend='torch' for CPU determinism.

Transparency: PixelOE 1.0.0 torch API takes RGB tensors only. We composite the
fitted subject over white AND over magenta, pixelize both, then reconstruct alpha
as "differs from both backgrounds". Edge color contamination is measured as the
mean color distance between the two runs along the silhouette edge.
"""
from __future__ import annotations
import json
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))
from pixelate_portraits import (  # shared geometry so all methods align
    ALPHA_THRESHOLD, ROOT, SUBJECT_HEIGHT_FRAC, TOP_MARGIN_FRAC, subject_bbox,
)

M = 16  # subgrid = pixel_size for exact integer blocks


def fit_subject(cid: str, cw: int, ch: int):
    src = ROOT / "sources" / f"{cid}-official.png"
    im = Image.open(src).convert("RGBA")
    arr = np.asarray(im, dtype=np.float64) / 255.0
    box = subject_bbox(arr)
    bx, by, bx1, by1 = box
    bw, bh = bx1 - bx, by1 - by
    scale = min((ch * SUBJECT_HEIGHT_FRAC) / bh, (cw * 0.98) / bw)
    tw, th = max(1, round(bw * scale)), max(1, round(bh * scale))
    ox, oy = (cw - tw) // 2, round((ch - th) * TOP_MARGIN_FRAC / (1 - SUBJECT_HEIGHT_FRAC))
    crop = im.crop(box).resize((tw * M, th * M), Image.LANCZOS)
    return crop, ox, oy, tw, th


def composite(crop: Image.Image, color: tuple[int, int, int]) -> Image.Image:
    bg = Image.new("RGBA", crop.size, color + (255,))
    return Image.alpha_composite(bg, crop).convert("RGB")


def to_tensor(img: Image.Image):
    import torch
    a = np.asarray(img, dtype=np.float32).transpose(2, 0, 1)[None] / 255.0
    return torch.from_numpy(a)


def pixelize_rgb(img: Image.Image, colors: int):
    from pixeloe.torch.pixelize import pixelize
    t = to_tensor(img)
    out = pixelize(
        t, pixel_size=M, thickness=3, mode="contrast",
        do_quant=True, num_colors=colors, quant_mode="kmeans",
        dither_mode="none", no_post_upscale=True, backend="torch",
    )
    arr = (out[0].numpy().transpose(1, 2, 0) * 255).clip(0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGB")


def main() -> int:
    src_path, out_path, cw_s, ch_s, colors_s = sys.argv[1], sys.argv[2], sys.argv[3], sys.argv[4], sys.argv[5]
    cid = Path(src_path).stem.replace("-official", "")
    cw, ch, colors = int(cw_s), int(ch_s), int(colors_s)
    t0 = time.perf_counter()

    crop, ox, oy, tw, th = fit_subject(cid, cw, ch)
    run_w = pixelize_rgb(composite(crop, (255, 255, 255)), colors)
    run_m = pixelize_rgb(composite(crop, (255, 0, 255)), colors)
    aw = np.asarray(run_w, dtype=np.int16)
    am = np.asarray(run_m, dtype=np.int16)

    d_w = np.abs(aw - np.array([255, 255, 255], dtype=np.int16)).sum(-1)
    d_m = np.abs(am - np.array([255, 0, 255], dtype=np.int16)).sum(-1)
    opaque = (d_w > 40) & (d_m > 40)

    # edge contamination metric: how much result colors depend on composite background
    contam = float(np.abs(aw - am).sum(-1)[opaque].mean()) if opaque.any() else 0.0

    rgba = np.zeros((th, tw, 4), dtype=np.uint8)
    rgba[..., :3] = aw
    rgba[..., 3] = (opaque * 255).astype(np.uint8)
    img = Image.fromarray(rgba, "RGBA")
    canvas = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas.paste(img, (ox, oy))
    canvas.save(out_path)
    meta = {
        "pixeloeVersion": "1.0.0", "api": "pixeloe.torch.pixelize.pixelize",
        "backend": "torch(CPU)", "pixel_size": M, "thickness": 3, "mode": "contrast",
        "quant": f"kmeans c{colors} dither=none", "no_post_upscale": True,
        "alphaReconstruction": "white+magenta dual composite, threshold 40",
        "edgeContaminationMetric": round(contam, 2),
        "seconds": round(time.perf_counter() - t0, 3),
    }
    Path(out_path).with_suffix(".pixeloe-meta.json").write_text(json.dumps(meta, indent=2))
    print(json.dumps(meta))
    return 0


if __name__ == "__main__":
    sys.exit(main())
