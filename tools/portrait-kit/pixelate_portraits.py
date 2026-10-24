#!/usr/bin/env python3
"""User-source portrait conversion engine, adapted from reviewed ART-03.

Deterministic full-body official art -> pixel standing portrait pipeline.
Methods:
  area     L1  alpha-weighted box average (baseline, like plain downscale)
  contrast L2  contrast-aware weighted downscale (PixelOE-inspired, numpy reimpl)
  retouch  L3  contrast + per-character face-detail boost + despeckle/defringe
  pixeloe  P1  real PixelOE via tool/pixeloe-env (see run_pixeloe.py), optional

Usage examples:
  python tool/pixelate_portraits.py convert --ids bd-tomori --canvas 256x448 --methods area,contrast,retouch
  python tool/pixelate_portraits.py sheets --ids bd-tomori,bd-rana
  python tool/pixelate_portraits.py preview
Writes only inside CARD_SHOP_PORTRAIT_WORKDIR (default .local/portrait-build). Use build.py for normal operations.
"""

from __future__ import annotations
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time
from pathlib import Path

import numpy as np
from PIL import Image, ImageFont

HERE = Path(__file__).resolve().parent
ROOT = Path(os.environ.get("CARD_SHOP_PORTRAIT_WORKDIR", str(HERE.parents[1] / ".local" / "portrait-build"))).resolve()
PROJECT = HERE.parents[1]  # formal project root

SUBJECT_HEIGHT_FRAC = 0.96    # subject occupies 96% of canvas height
TOP_MARGIN_FRAC = 0.02
ALPHA_THRESHOLD = 0.5
SUBGRID = 8                   # subpixel grid factor for exact box averaging

# ---------------------------------------------------------------- basics

def sha256_file(path: Path) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for chunk in iter(lambda: f.read(1 << 16), b""):
            h.update(chunk)
    return h.hexdigest()


def load_presets() -> dict:
    p = ROOT / "presets" / "presets.json"
    return json.loads(p.read_text(encoding="utf-8")) if p.exists() else {"characters": {}}


def subject_bbox(arr: np.ndarray) -> tuple[int, int, int, int]:
    a = arr[..., 3]                # arr is normalized to [0,1]
    ys, xs = np.where(a > 8 / 255)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def integral(img: np.ndarray) -> np.ndarray:
    return np.pad(img.cumsum(0).cumsum(1), ((1, 0), (1, 0), (0, 0)))


def srgb_to_linear(c: np.ndarray) -> np.ndarray:
    return np.where(c <= 0.04045, c / 12.92, ((c + 0.055) / 1.055) ** 2.4)


# ---------------------------------------------------------------- downscale core

def render_subgrid(im: Image.Image, box: tuple[int, int, int, int], tw: int, th: int, m: int) -> np.ndarray:
    """Crop source to subject box and resample once to (th*m, tw*m) RGBA float in [0,1]."""
    x0, y0, x1, y1 = box
    crop = im.crop((x0, y0, x1, y1))
    out = crop.resize((tw * m, th * m), Image.LANCZOS)
    return np.asarray(out, dtype=np.float64) / 255.0


def block_reduce_weighted(sub: np.ndarray, m: int, k: float, grad_norm: float | None = None):
    """Weighted block mean on the subgrid. Returns float RGBA target-size array.

    Color channels are averaged premultiplied (weight = alpha*(1+k*contrast)),
    alpha is the plain area mean, so transparency never darkens colors.
    """
    H, W, _ = sub.shape
    th, tw = H // m, W // m
    a = sub[..., 3]
    if k > 0.0:
        lum = srgb_to_linear(sub[..., :3]).mean(-1)
        gy, gx = np.gradient(lum)
        g = np.hypot(gy, gx)
        if grad_norm is None or grad_norm <= 0:
            grad_norm = float(np.quantile(g[a > 0.5], 0.95)) if (a > 0.5).any() else 1.0
        w = a * (1.0 + k * np.clip(g / grad_norm, 0.0, 4.0))
    else:
        w = a.copy()

    Iwc = integral(sub[..., :3] * w[..., None])
    Iw = integral(w[..., None])
    Ia = integral(a[..., None])

    ys = np.arange(th) * m
    xs = np.arange(tw) * m
    y1 = (ys + m).clip(0, H)
    x1 = (xs + m).clip(0, W)
    Y0, X0 = np.meshgrid(ys, xs, indexing="ij")
    Y1, X1 = np.meshgrid(y1, x1, indexing="ij")

    def box(I):
        return I[Y1, X1] - I[Y0, X1] - I[Y1, X0] + I[Y0, X0]

    sw = box(Iw)[..., 0]
    sa = box(Ia)[..., 0]
    swc = box(Iwc)
    safe = np.maximum(sw, 1e-9)
    rgb = swc / safe[..., None]
    rgb[sw <= 1e-9] = 0.0
    out = np.empty((th, tw, 4), dtype=np.float64)
    out[..., :3] = rgb
    out[..., 3] = sa / (m * m)
    return out


# ---------------------------------------------------------------- cleanup / palette

def label_components(mask: np.ndarray, max_area: int, mode: str) -> np.ndarray:
    """Remove opaque islands (mode=drop) or fill enclosed holes (mode=fill) up to max_area px."""
    H, W = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    keep = mask.copy()
    for sy in range(H):
        for sx in range(W):
            if visited[sy, sx] or not mask[sy, sx]:
                continue
            stack = [(sy, sx)]
            visited[sy, sx] = True
            comp = []
            touch_border = False
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                if y == 0 or y == H - 1 or x == 0 or x == W - 1:
                    touch_border = True
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        stack.append((ny, nx))
            if mode == "fill":
                # holes: transparent components not touching border are inside the body
                continue
            if not touch_border and len(comp) <= max_area:
                for y, x in comp:
                    keep[y, x] = False
    return keep


def fill_holes(opaque: np.ndarray, max_area: int) -> np.ndarray:
    """Fill transparent components fully enclosed by opaque pixels (tiny speckle holes)."""
    H, W = opaque.shape
    transp = ~opaque
    visited = np.zeros_like(transp, dtype=bool)
    out = opaque.copy()
    for sy in range(H):
        for sx in range(W):
            if visited[sy, sx] or not transp[sy, sx]:
                continue
            stack = [(sy, sx)]
            visited[sy, sx] = True
            comp = []
            touch_border = False
            touch_opaque_border = False
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                if y == 0 or y == H - 1 or x == 0 or x == W - 1:
                    touch_border = True
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < H and 0 <= nx < W:
                        if transp[ny, nx] and not visited[ny, nx]:
                            visited[ny, nx] = True
                            stack.append((ny, nx))
                        elif opaque[ny, nx]:
                            touch_opaque_border = True
            if not touch_border and touch_opaque_border and len(comp) <= max_area:
                for y, x in comp:
                    out[y, x] = True
    return out


def quantize_palette(rgba: np.ndarray, colors: int, dither: bool = False):
    """Median-cut palette built from opaque pixels only; transparent pixels untouched."""
    opaque = rgba[..., 3] > 0
    px = rgba[opaque][..., :3]
    n = len(px)
    side = int(np.ceil(np.sqrt(n)))
    pad = np.zeros((side * side, 3), dtype=np.uint8)
    pad[:n] = (px * 255).astype(np.uint8)
    # repeat actual pixels into padding slots so filler cannot invent colors
    pad[n:] = pad[: side * side - n]
    board = pad.reshape(side, side, 3)
    q = Image.fromarray(board, "RGB").quantize(
        colors=colors, method=Image.Quantize.MEDIANCUT,
        dither=Image.Dither.FLOYDSTEINBERG if dither else Image.Dither.NONE)
    palette = np.asarray(q.getpalette()[: colors * 3], dtype=np.float64).reshape(colors, 3) / 255.0

    out = rgba.copy()
    src = px
    mapped = np.empty_like(src)
    for i in range(0, len(src), 32768):
        chunk = src[i:i + 32768]
        d = ((chunk[:, None, :] - palette[None, :, :]) ** 2).sum(-1)
        mapped[i:i + 32768] = palette[d.argmin(1)]
    out[opaque, :3] = mapped
    return out, palette


# ---------------------------------------------------------------- head detection (r2)

HAIR_COLOR_PACK = Path("D:/GameDev/NonameCardShop/.local/band-appearances-hair.json")


def _dilate(mask: np.ndarray, times: int = 2) -> np.ndarray:
    m = mask.copy()
    for _ in range(times):
        p = np.pad(m, 1)
        m = p[1:-1, 1:-1] | p[:-2, 1:-1] | p[2:, 1:-1] | p[1:-1, :-2] | p[1:-1, 2:]
    return m


def detect_head_rect(cid: str) -> dict:
    """Locate the head in the source PNG.

    Primary: largest hair-color connected blob in the upper band (band top 25%
    of subject height), color distance to the character's known hair palette
    (data/band-appearances.mjs), dilated to bridge highlight banding; the blob
    bbox is the head. Chin refined by a skin blob directly under the hair.
    Fallback for missing/tiny hair blobs: upper-band column alpha coverage
    (18% band) + 20%-subject-height chin.
    """
    im = Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA")
    a = np.asarray(im, dtype=np.float64) / 255.0
    alpha = a[..., 3] > 0.5
    bx, by, bx1, by1 = subject_bbox(a)
    bw, bh = bx1 - bx, by1 - by

    hair_hex = {}
    if HAIR_COLOR_PACK.exists():
        hair_hex = json.loads(HAIR_COLOR_PACK.read_text(encoding="utf-8"))
    rect = None
    src = None
    if hair_hex.get(cid):
        pal = [np.array([int(h[i:i + 2], 16) / 255 for i in (1, 3, 5)]) for h in hair_hex[cid]]
        d = np.stack([np.sqrt(((a[..., :3] - p) ** 2).sum(-1)) for p in pal], 0).min(0)
        zone = np.zeros(alpha.shape, bool)
        zone[by:int(by + 0.25 * bh), :] = True
        hair = _dilate((d < 0.14) & alpha & zone, times=2)
        comp = _largest_component(hair)
        if comp and len(comp) > 0.004 * bw * bh:
            ys = [p[0] for p in comp]; xs = [p[1] for p in comp]
            rect = [min(xs), min(ys), max(xs), max(ys)]
            src = f"hair-blob({len(comp)}px)"

    if rect is None:
        band_bot = int(by + 0.18 * bh)
        colcov = alpha[by:band_bot, :].sum(0)
        cols = np.where(colcov >= max(3, int(0.02 * bh)))[0]
        if len(cols) == 0:
            return {"headRectSource": [int(bx), int(by), int(bx1), int(by + 0.25 * bh)],
                    "chinFrom": "degenerate", "subjectBox": [int(bx), int(by), int(bx1), int(by1)]}
        hx0, hx1 = int(cols.min()), int(cols.max())
        htop = int(np.where(alpha[:, hx0:hx1 + 1].any(1))[0].min())
        rect = [hx0, htop, hx1, int(by + 0.20 * bh)]
        src = "column-coverage"

    # chin: skin blob directly under the hair block, inside/near its x range
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    skin = ((r > 0.70) & (r < 1.01) & (g > 0.45) & (g < 0.88) & (b > 0.35) & (b < 0.80)
            & ((r - g) > 0.08) & ((r - b) > 0.10) & alpha)
    x0, y0, x1, y1 = rect
    win = np.zeros_like(skin)
    win[y1:int(min(a.shape[0], y1 + 0.45 * (y1 - y0))), max(0, x0 - 20):x1 + 20] = True
    sk = skin & win
    comp = _largest_component(sk)
    chin = y1
    if comp:
        ys = [p[0] for p in comp]; xs = [p[1] for p in comp]
        sh, sw = max(ys) - min(ys), max(xs) - min(xs)
        if sh >= 0.015 * bh and sw >= 0.01 * bw:
            chin = int(max(ys) + 0.12 * sh)
            src += "+skin"
    rect = [int(rect[0]), int(rect[1]), int(rect[2]), int(max(chin, y1))]
    return {"headRectSource": rect, "chinFrom": src,
            "subjectBox": [int(bx), int(by), int(bx1), int(by1)]}


def _largest_component(mask: np.ndarray) -> list:
    H, W = mask.shape
    visited = np.zeros_like(mask, dtype=bool)
    best: list = []
    for sy in range(H):
        for sx in range(W):
            if visited[sy, sx] or not mask[sy, sx]:
                continue
            stack = [(sy, sx)]
            visited[sy, sx] = True
            comp = []
            while stack:
                y, x = stack.pop()
                comp.append((y, x))
                for ny, nx in ((y - 1, x), (y + 1, x), (y, x - 1), (y, x + 1)):
                    if 0 <= ny < H and 0 <= nx < W and mask[ny, nx] and not visited[ny, nx]:
                        visited[ny, nx] = True
                        stack.append((ny, nx))
            if len(comp) > len(best):
                best = comp
    return best


def head_rect_warnings(cid: str, preset: dict) -> list:
    """B1-r2 guards: impossible/empty-offset boxes must be loud, not silent."""
    warns = []
    rect = preset.get("headRectSource")
    if not rect:
        return [f"{cid}: presets missing headRectSource"]
    x0, y0, x1, y1 = rect
    if x0 < 0 or y0 < 0 or x1 <= x0 or y1 <= y0:
        warns.append(f"headRectSource invalid: {rect}")
        return warns
    a = np.asarray(Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA"), dtype=np.float64) / 255.0
    alpha = a[..., 3] > 0.5
    cov = alpha[y0:y1, x0:x1].mean()
    if cov < 0.35:
        warns.append(f"headRectSource covers only {cov:.0%} opaque pixels (mostly empty space)")
    det = detect_head_rect(cid)
    tol = 0.06 * max(1, det["subjectBox"][3] - det["subjectBox"][1])
    for i, name in enumerate(("x0", "y0", "x1", "y1")):
        if abs(rect[i] - det["headRectSource"][i]) > tol:
            warns.append(f"headRectSource.{name}={rect[i]} deviates >6% from auto-detect {det['headRectSource'][i]}")
    return warns


# ---------------------------------------------------------------- per-character pipeline

def fit_geometry(cid: str, canvas: tuple[int, int]) -> dict:
    """Subject bbox + identical fit math shared by convert/avatars/sheets.

    Width-constrained subjects (wide props like rana's bass, sakiko's keyboard)
    end up shorter than 96% canvas height and vertically centered by the same
    top/bottom margin split -- consumers must use this transform instead of
    assuming head position from canvas height alone.
    """
    cw, ch = canvas
    im = Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA")
    arr = np.asarray(im, dtype=np.float64) / 255.0
    bx, by, bx1, by1 = subject_bbox(arr)
    bw, bh = bx1 - bx, by1 - by
    scale = min((ch * SUBJECT_HEIGHT_FRAC) / bh, (cw * 0.98) / bw)
    tw, th = max(1, round(bw * scale)), max(1, round(bh * scale))
    ox = (cw - tw) // 2
    oy = round((ch - th) * TOP_MARGIN_FRAC / (1 - SUBJECT_HEIGHT_FRAC))
    return {"box": (bx, by, bx1, by1), "scale": scale, "ox": ox, "oy": oy,
            "tw": tw, "th": th, "canvas": (cw, ch)}


def head_rect_canvas(cid: str, canvas: tuple[int, int], preset: dict) -> tuple[int, int, int, int]:
    """Map per-character headRectSource (source px, 1100x1400) to canvas px."""
    g = fit_geometry(cid, canvas)
    bx, by = g["box"][0], g["box"][1]
    s, ox, oy = g["scale"], g["ox"], g["oy"]
    x0, y0, x1, y1 = preset["headRectSource"]
    return (round(ox + (x0 - bx) * s), round(oy + (y0 - by) * s),
            round(ox + (x1 - bx) * s), round(oy + (y1 - by) * s))



def convert_one(cid: str, method: str, canvas: tuple[int, int], colors: int,
                presets: dict, dither: bool = False) -> dict:
    t0 = time.perf_counter()
    cw, ch = canvas
    preset = presets.get("characters", {}).get(cid, {})
    im = Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA")
    g = fit_geometry(cid, canvas)
    box, bx, by = g["box"], g["box"][0], g["box"][1]
    scale, ox, oy, tw, th = g["scale"], g["ox"], g["oy"], g["tw"], g["th"]

    sub = render_subgrid(im, box, tw, th, SUBGRID)

    k_base = {"area": 0.0, "contrast": 2.0, "retouch": 2.0}.get(method, 2.0)
    lum = srgb_to_linear(sub[..., :3]).mean(-1)
    gy, gx = np.gradient(lum)
    grad = np.hypot(gy, gx)
    am = sub[..., 3]
    grad_norm = float(np.quantile(grad[am > 0.5], 0.95)) if (am > 0.5).any() else 1.0

    out = block_reduce_weighted(sub, SUBGRID, k_base, grad_norm)

    # L3: face-detail boost -- face rect from preset fractions, or derived from headRectSource
    if method == "retouch":
        if preset.get("faceRect"):
            fx0, fy0, fx1, fy1 = preset["faceRect"]
            # faceRect given in fractions of canvas
            px0 = int(fx0 * cw); px1 = int(np.ceil(fx1 * cw))
            py0 = int(fy0 * ch); py1 = int(np.ceil(fy1 * ch))
        elif preset.get("headRectSource"):
            hx0, hy0, hx1, hy1 = head_rect_canvas(cid, canvas, preset)
            headw, headh = max(1, hx1 - hx0), max(1, hy1 - hy0)
            px0 = int(hx0 - 0.30 * headw); px1 = int(np.ceil(hx1 + 0.30 * headw))
            py0 = int(hy0 + 0.10 * headh); py1 = int(np.ceil(hy0 + 1.5 * headh))
        else:
            px0 = py0 = px1 = py1 = 0
        if px1 > px0 and py1 > py0:
            boosted = block_reduce_weighted(sub, SUBGRID, float(preset.get("faceK", 6.0)), grad_norm)
            # map canvas rect -> subject-local pixels (subject placed at ox,oy)
            sx0 = max(px0 - ox, 0); sx1 = min(px1 - ox, tw)
            sy0 = max(py0 - oy, 0); sy1 = min(py1 - oy, th)
            if sx1 > sx0 and sy1 > sy0:
                out[sy0:sy1, sx0:sx1] = boosted[sy0:sy1, sx0:sx1]

    # alpha threshold -> hard pixel edges (still subject-local)
    a = out[..., 3]
    opaque = a >= ALPHA_THRESHOLD
    rgba = np.zeros((th, tw, 4), dtype=np.float64)
    rgba[..., :3] = out[..., :3]
    rgba[..., 3] = opaque.astype(np.float64)

    if method == "retouch":
        opaque = label_components(opaque, max_area=int(preset.get("despeckleMaxArea", 2)), mode="drop")
        opaque = fill_holes(opaque, max_area=int(preset.get("despeckleMaxArea", 2)))
        rgba[..., 3] = opaque.astype(np.float64)

    rgba, palette = quantize_palette(rgba, colors, dither)
    img = Image.fromarray((rgba * 255).round().astype(np.uint8), "RGBA")
    canvas_img = Image.new("RGBA", (cw, ch), (0, 0, 0, 0))
    canvas_img.paste(img, (ox, oy))

    tag = f"{method}-c{colors}"
    outdir = ROOT / "samples" / cid
    outdir.mkdir(parents=True, exist_ok=True)
    native = outdir / f"portrait-{cw}x{ch}-{tag}.png"
    canvas_img.save(native)
    big = outdir / f"portrait-{cw}x{ch}-{tag}@2x.png"
    canvas_img.resize((cw * 2, ch * 2), Image.NEAREST).save(big)

    arr8 = np.asarray(canvas_img)
    used = len(np.unique(arr8[..., :3][arr8[..., 3] > 0].reshape(-1, 3), axis=0))
    return {
        "character": cid, "method": method, "canvas": f"{cw}x{ch}", "colors": colors,
        "dither": dither, "file": str(native.relative_to(ROOT)), "at2x": str(big.relative_to(ROOT)),
        "uniqueColors": int(used), "sha256": sha256_file(native),
        "seconds": round(time.perf_counter() - t0, 3),
        "subjectBox": list(box), "subjectCanvas": [ox, oy, tw, th], "scaleFactor": round(1.0 / scale, 2),
    }


# ---------------------------------------------------------------- PixelOE bridge

def run_pixeloe(cid: str, canvas: tuple[int, int], colors: int, presets: dict) -> dict:
    env = HERE / "pixeloe-env" / "Scripts" / "python.exe"
    if not env.exists():
        return {"character": cid, "method": "pixeloe", "error": "pixeloe-env venv missing; see tool/README-tool.md"}
    t0 = time.perf_counter()
    cw, ch = canvas
    src = ROOT / "sources" / f"{cid}-official.png"
    outdir = ROOT / "samples" / cid
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"portrait-{cw}x{ch}-pixeloe-c{colors}.png"
    cmd = [str(env), str(HERE / "run_pixeloe.py"), str(src), str(out), str(cw), str(ch), str(colors)]
    r = subprocess.run(cmd, capture_output=True, text=True, timeout=600)
    if r.returncode != 0:
        return {"character": cid, "method": "pixeloe", "error": r.stderr.strip()[-800:]}
    img = Image.open(out).convert("RGBA")
    arr = np.asarray(img)
    used = len(np.unique(arr[..., :3][arr[..., 3] > 0].reshape(-1, 3), axis=0))
    img.resize((cw * 2, ch * 2), Image.NEAREST).save(
        outdir / f"portrait-{cw}x{ch}-pixeloe-c{colors}@2x.png")
    return {
        "character": cid, "method": "pixeloe", "canvas": f"{cw}x{ch}", "colors": colors,
        "file": str(out.relative_to(ROOT)),
        "at2x": str(outdir / f"portrait-{cw}x{ch}-pixeloe-c{colors}@2x.png"),
        "uniqueColors": int(used), "sha256": sha256_file(out),
        "seconds": round(time.perf_counter() - t0, 3),
    }


# ---------------------------------------------------------------- avatars

AVATAR_SPECS = ((96, 192), (128, 256))   # target px, crop side on 384x672 native


def make_avatars(cid: str, presets: dict, colors: int) -> list[dict]:
    """Crop avatars from the 384x672 retouch native using the REAL head rect.

    B1-r2: positioning is validated, never silently shifted -- crops that would
    cross the canvas get transparent padding (recorded as padded, not clamped),
    and geometry anomalies raise warnings stored in the avatar manifest.
    B2: downscale is exact 2:1 NEAREST integer sampling on binary alpha.
    """
    preset = presets.get("characters", {}).get(cid, {})
    results = []
    src = ROOT / "samples" / cid / f"portrait-384x672-retouch-c{colors}.png"
    if not src.exists():
        return [{"character": cid, "avatars": f"skipped: no portrait-384x672-retouch-c{colors}.png"}]
    im = Image.open(src).convert("RGBA")
    hx0, hy0, hx1, hy1 = head_rect_canvas(cid, (384, 672), preset)
    hcx = (hx0 + hx1) / 2
    adir = ROOT / "samples" / cid
    warns = head_rect_warnings(cid, preset)
    if hx0 < 0 or hy0 < 0 or hx1 > 384 or hy1 > 672:
        warns.append(f"head rect on 384x672 canvas out of bounds: [{hx0},{hy0},{hx1},{hy1}]")
    sidecar = {"character": cid, "sourceMethod": "retouch", "sourcePalette": colors,
               "sourceFile": str(src.relative_to(ROOT)),
               "headRectSource": preset["headRectSource"],
               "headRectOn384x672": [hx0, hy0, hx1, hy1],
               "warnings": warns, "crops": []}
    for target, side in AVATAR_SPECS:
        # desired crop: head centered horizontally, ~10% of crop above hair top
        want_x0 = round(hcx - side / 2)
        want_y0 = round(hy0 - 0.10 * side)
        px0, py0 = max(0, want_x0), max(0, want_y0)
        px1, py1 = min(384, want_x0 + side), min(672, want_y0 + side)
        pad = [max(0, -want_x0), max(0, -want_y0),
               max(0, want_x0 + side - 384), max(0, want_y0 + side - 672)]
        crop = Image.new("RGBA", (side, side), (0, 0, 0, 0))
        crop.paste(im.crop((px0, py0, px1, py1)), (pad[0], pad[1]))
        if any(pad):
            warns_local = warns + [f"crop padded transparently l{pad[0]} t{pad[1]} r{pad[2]} b{pad[3]} instead of clamping"]
        else:
            warns_local = warns
        av = crop.resize((target, target), Image.NEAREST)
        f = adir / f"avatar-{target}.png"
        av.save(f)
        av.resize((target * 4, target * 4), Image.NEAREST).save(adir / f"avatar-{target}@4x.png")

        arr = np.asarray(av)
        alphas = np.unique(arr[..., 3])
        assert set(alphas.tolist()) <= {0, 255}, f"avatar alpha not binary: {alphas.tolist()[:8]}"
        used = len(np.unique(arr[..., :3][arr[..., 3] > 0].reshape(-1, 3), axis=0))
        # centering check on the DELIVERED avatar (in target px, crop side = 2*target)
        head_cx_crop = hcx - want_x0
        head_cy_crop = (hy0 + hy1) / 2 - want_y0
        if abs(head_cx_crop - side / 2) > 0.12 * side:
            warns_local.append(f"head center x {head_cx_crop:.0f} far from crop center {side//2}")
        margin_above = hy0 - want_y0
        margin_below = want_y0 + side - hy1
        if margin_above < 0.05 * side or margin_below < 0.08 * side:
            warns_local.append(f"head margins tight: above={margin_above:.0f}px below={margin_below:.0f}px of {side}")
        rec = {
            "character": cid, "target": target, "file": str(f.relative_to(ROOT)),
            "at4x": str((adir / f"avatar-{target}@4x.png").relative_to(ROOT)),
            "sampling": f"NEAREST exact {side}->{target} (2:1 integer)",
            "cropOriginOn384x672": [want_x0, want_y0],
            "cropRectOn384x672": [px0, py0, px1, py1],
            "paddedTransparent": [v // 2 for v in pad] if any(pad) else None,
            "headSafeArea": {
                "hairTopInCropPx": int(hy0 - want_y0), "chinInCropPx": int(hy1 - want_y0),
                "marginAboveHairPx": int(margin_above), "marginBelowChinPx": int(margin_below),
                "headCenterXInCropPx": int(head_cx_crop), "headCenterYInCropPx": int(head_cy_crop),
            },
            "alphaValues": sorted(int(x) for x in alphas),
            "semiTransparentPixels": 0,
            "uniqueColors": int(used),
            "warnings": warns_local,
            "sha256": sha256_file(f),
        }
        results.append(rec)
        sidecar["crops"].append({t: rec[t] for t in (
            "target", "cropRectOn384x672", "cropOriginOn384x672", "paddedTransparent",
            "headSafeArea", "alphaValues", "semiTransparentPixels", "uniqueColors",
            "warnings", "sha256")})
    (adir / "avatar-manifest.json").write_text(json.dumps(sidecar, ensure_ascii=False, indent=2), encoding="utf-8")
    return results


# ---------------------------------------------------------------- editable export

def export_editable(cid: str, colors: int) -> dict:
    """Equivalent-of-layered-source export: exact conversion inputs + palette + params."""
    im = Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA")
    arr = np.asarray(im, dtype=np.float64) / 255.0
    box = subject_bbox(arr)
    bx, by, bx1, by1 = box
    bw, bh = bx1 - bx, by1 - by
    edir = ROOT / "editable" / cid
    edir.mkdir(parents=True, exist_ok=True)

    for cw, ch in ((256, 448), (384, 672)):
        scale = min((ch * SUBJECT_HEIGHT_FRAC) / bh, (cw * 0.98) / bw)
        tw, th = max(1, round(bw * scale)), max(1, round(bh * scale))
        fitted = render_subgrid(im, box, tw, th, SUBGRID)
        img = Image.fromarray((fitted * 255).round().astype(np.uint8), "RGBA")
        img.save(edir / f"input-fitted-{cw}x{ch}-subgrid{SUBGRID}x.png")

    im.crop(box).save(edir / "source-trimmed.png")
    pal_src = ROOT / "samples" / cid / f"portrait-256x448-retouch-c{colors}.png"
    if pal_src.exists():
        p = Image.open(pal_src).convert("RGBA")
        a8 = np.asarray(p)
        px = a8[..., :3][a8[..., 3] > 0].reshape(-1, 3)
        uniq = np.unique(px, axis=0)
        sw = max(1, 720 // max(1, len(uniq)))
        board = Image.new("RGB", (sw * len(uniq), sw), (0, 0, 0))
        for i, c in enumerate(uniq):
            for yy in range(sw):
                for xx in range(sw):
                    board.putpixel((i * sw + xx, yy), tuple(int(v) for v in c))
        board = board.resize((720, max(8, sw)), Image.NEAREST)
        board.save(edir / f"palette-retouch-c{colors}.png")
        (edir / f"palette-retouch-c{colors}.hex.json").write_text(json.dumps(
            ["#%02x%02x%02x" % tuple(int(v) for v in c) for c in uniq.tolist()], indent=1))
    return {"character": cid, "editableDir": str(edir.relative_to(ROOT)),
            "files": sorted(p.name for p in edir.iterdir())}


# ---------------------------------------------------------------- final manifest (B4)

def build_manifest() -> dict:
    """Rebuild results.json as {meta, final, history}.

    final hashes every delivered file as it currently exists; history keeps the
    append-only run log (including superseded runs) untouched.
    """
    import re
    import PIL
    import platform

    report_path = ROOT / "results.json"
    old = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
    history = old.get("runs", old.get("history", []))
    src_index = json.loads((ROOT / "sources-index.json").read_text(encoding="utf-8"))
    # full-batch pack index uses sourcePackSha256; legacy index used sha256
    input_hashes = {c["id"]: c.get("sourcePackSha256") or c.get("sha256") for c in src_index["characters"]}
    presets = load_presets()

    files = []
    for p in sorted((ROOT / "samples").rglob("*")):
        if p.is_dir() or p.suffix != ".png":
            continue
        rel = str(p.relative_to(ROOT)).replace("\\", "/")
        if p.name.startswith("_"):
            raise SystemExit(f"temp file leaked into samples/: {rel}")
        entry = {"file": rel, "sha256": sha256_file(p), "bytes": p.stat().st_size}
        with Image.open(p) as im:
            entry["size"] = f"{im.width}x{im.height}"
        parent = p.parent.name
        m = re.match(r"portrait-(\d+)x(\d+)-([a-z0-9]+?)-c(\d+)(@2x)?\.png$", p.name)
        if parent in input_hashes:
            entry["inputSha256"] = input_hashes[parent]
        if m:
            cw, ch, method, colors, scale2 = m.group(1), m.group(2), m.group(3), int(m.group(4)), m.group(5)
            entry["kind"] = "portrait@2x" if scale2 else "portrait"
            entry["method"] = method
            entry["canvas"] = f"{cw}x{ch}"
            entry["palette"] = colors
            entry["params"] = {"presets": "presets/presets.json",
                               "subjectHeightFrac": SUBJECT_HEIGHT_FRAC,
                               "topMarginFrac": TOP_MARGIN_FRAC,
                               "alphaThreshold": ALPHA_THRESHOLD,
                               "subgrid": SUBGRID,
                               "dither": False}
            if method == "retouch":
                cp = presets["characters"][parent]
                entry["params"]["faceRect"] = cp.get("faceRect")
                entry["params"]["faceK"] = cp.get("faceK")
                entry["params"]["despeckleMaxArea"] = cp.get("despeckleMaxArea", 2)
            if method.startswith("pixeloe"):
                meta_f = p.with_name(p.name.replace("@2x", "").replace(".png", ".pixeloe-meta.json"))
                if meta_f.exists():
                    entry["pixeloeMeta"] = json.loads(meta_f.read_text(encoding="utf-8"))
                if method == "pixeloe64q":
                    entry["note"] = "PixelOE 原样输出后经本工具中位切分 64 色后量化（对照用，不推荐量产）"
        elif p.name.startswith("avatar-"):
            entry["kind"] = "avatar@4x" if "@4x" in p.name else "avatar"
            sidecar = json.loads((p.parent / "avatar-manifest.json").read_text(encoding="utf-8"))
            target = 96 if "-96" in p.name else 128
            crop = next(c for c in sidecar["crops"] if c["target"] == target)
            entry.update({
                "target": target, "sourceMethod": sidecar["sourceMethod"],
                "sourcePalette": sidecar["sourcePalette"], "sourceFile": sidecar["sourceFile"],
                "sampling": "NEAREST 2:1 integer", "cropRectOn384x672": crop["cropRectOn384x672"],
                "cropOriginOn384x672": crop.get("cropOriginOn384x672"),
                "paddedTransparent": crop.get("paddedTransparent"),
                "headRectSource": sidecar["headRectSource"],
                "headRectOn384x672": sidecar["headRectOn384x672"],
                "headSafeArea": crop["headSafeArea"],
                "alphaValues": crop.get("alphaValues"),
                "semiTransparentPixels": crop.get("semiTransparentPixels"),
                "uniqueColors": crop.get("uniqueColors"),
                "warnings": crop.get("warnings", []),
            })
        elif p.name.startswith("code-"):
            entry["kind"] = "codePortraitCopy"
            entry["note"] = "当前代码立绘副本，仅对照；原件 experiments/character-art/generated/"
        elif p.parent.name == "sheets":
            entry["kind"] = "sheet"
            entry["generator"] = "tool/build_sheets.py"
        elif p.parent.name == "diagnostics":
            entry["kind"] = "diagnostic"
            entry["generator"] = "tool/pixelate_portraits.py head-diagram"
        files.append(entry)

    for p in sorted((ROOT / "editable").rglob("*")):
        if p.is_dir():
            continue
        rel = str(p.relative_to(ROOT)).replace("\\", "/")
        entry = {"file": rel, "sha256": sha256_file(p), "bytes": p.stat().st_size,
                 "kind": "editableInput" if p.suffix == ".png" else "editablePalette",
                 "character": p.parent.name,
                 "note": "精确转换输入/色板，可用 export-editable 子命令重生成"}
        if p.suffix == ".png":
            with Image.open(p) as im:
                entry["size"] = f"{im.width}x{im.height}"
        files.append(entry)

    tool_files = {}
    for name in ("pixelate_portraits.py", "run_pixeloe.py", "build_sheets.py", "build_preview.py"):
        f = HERE / name
        if f.exists():
            tool_files[name] = sha256_file(f)
    req = HERE / "pixeloe-env-requirements.txt"
    if req.exists():
        tool_files["pixeloe-env-requirements.txt"] = sha256_file(req)

    out = {
        "meta": {
            "generatedAt": time.strftime("%Y-%m-%dT%H:%M:%S"),
            "task": "Registered user-source portrait rebuild",
            "baseline": {"sourceRegistry": "data/character-portraits.json"},
            "toolVersions": {
                "python": platform.python_version(), "pillow": PIL.__version__,
                "numpy": np.__version__,
                "pixeloe": {"version": "optional-not-used-by-default", "api": "pixeloe.torch.pixelize.pixelize",
                            "backend": "torch(CPU)", "isolatedEnv": "tool/pixeloe-env"},
            },
            "toolFileSha256": tool_files,
            "inputHashes": input_hashes,
            "notes": "final=当前交付逐文件清单（哈希/参数/输入哈希）；history=历史运行日志（含被覆盖的旧运行，仅供追溯）",
        },
        "final": {"files": files},
        "history": history,
    }
    report_path.write_text(json.dumps(out, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"manifest -> {report_path} final files={len(files)} history runs={len(history)}")
    return out


# ---------------------------------------------------------------- head diagram (r2)

def build_head_diagram(cid: str, preset: dict) -> str:
    """Diagnostic: source image + 10% grid + declared headRectSource box."""
    from PIL import ImageDraw, ImageFont
    im = Image.open(ROOT / "sources" / f"{cid}-official.png").convert("RGBA")
    W, H = im.size
    scale = 0.5
    view = im.resize((int(W * scale), int(H * scale)), Image.LANCZOS)
    comp = view.convert("RGB")
    d = ImageDraw.Draw(comp)
    for i in range(1, 10):
        x, y = int(W * scale * i / 10), int(H * scale * i / 10)
        d.line([(x, 0), (x, H * scale)], fill=(200, 200, 200), width=1)
        d.line([(0, y), (W * scale, y)], fill=(200, 200, 200), width=1)
        d.text((x + 2, 2), f"{i*10}%", fill=(120, 120, 120))
        d.text((2, y + 2), f"{i*10}%", fill=(120, 120, 120))
    x0, y0, x1, y1 = preset["headRectSource"]
    box = tuple(int(v * scale) for v in (x0, y0, x1, y1))
    d.rectangle(box, outline=(255, 0, 0), width=3)
    det = detect_head_rect(cid)
    d.text((8, int(H * scale) - 34), f"declared headRectSource={preset['headRectSource']} px (on 1100x1400)",
           fill=(0, 0, 0))
    d.text((8, int(H * scale) - 20), f"auto-detect={det['headRectSource']} chin={det['chinFrom']} subjectBox={det['subjectBox']}",
           fill=(0, 0, 0))
    outdir = ROOT / "samples" / "diagnostics"
    outdir.mkdir(parents=True, exist_ok=True)
    out = outdir / f"{cid}-headrect.png"
    comp.save(out)
    return str(out.relative_to(ROOT))


# ---------------------------------------------------------------- CLI

def parse_canvas(s: str) -> tuple[int, int]:
    w, h = s.lower().split("x")
    return int(w), int(h)


def main() -> int:
    ap = argparse.ArgumentParser(description="ART-03 pixel portrait candidate tool")
    sub = ap.add_subparsers(dest="cmd", required=True)

    c = sub.add_parser("convert", help="batch convert characters")
    c.add_argument("--ids", default="bd-tomori,bd-rana,bd-sakiko")
    c.add_argument("--canvas", default="256x448", help="e.g. 256x448 or 256x448,384x672")
    c.add_argument("--methods", default="area,contrast,retouch")
    c.add_argument("--palette", default="64", help="comma list, e.g. 64,96")
    c.add_argument("--dither", action="store_true")
    c.add_argument("--dry-run", action="store_true")
    c.add_argument("--avatars", action="store_true", help="also crop avatars from 384x672")
    c.add_argument("--report", default=str(ROOT / "results.json"))

    a = sub.add_parser("sheets", help="build comparison sheets")
    a.add_argument("--ids", default="bd-tomori,bd-rana,bd-sakiko")
    a.add_argument("--palette", default="64")

    sub.add_parser("preview", help="rebuild preview/index.html")
    p = sub.add_parser("avatars", help="crop avatars only")
    p.add_argument("--ids", default="bd-tomori,bd-rana,bd-sakiko")
    e = sub.add_parser("export-editable", help="export reproducible edit sources")
    e.add_argument("--ids", default="bd-tomori,bd-rana,bd-sakiko")
    e.add_argument("--palette", default="64")
    sub.add_parser("manifest", help="rebuild results.json as meta+final+history")
    hd = sub.add_parser("head-diagram", help="overlay headRectSource on source with grid")
    hd.add_argument("--ids", default="bd-tomori,bd-rana,bd-sakiko")
    p.add_argument("--palette", default="64")

    args = ap.parse_args()
    presets = load_presets()

    if args.cmd == "convert":
        ids = [i.strip() for i in args.ids.split(",") if i.strip()]
        canvases = [parse_canvas(x) for x in args.canvas.split(",")]
        methods = [m.strip() for m in args.methods.split(",")]
        palettes = [int(p) for p in args.palette.split(",")]
        report_path = Path(args.report)
        report = json.loads(report_path.read_text(encoding="utf-8")) if report_path.exists() else {}
        hist = report.get("history") or report.get("runs") or []   # accept both formats
        recs: list[dict] = []
        ok, fail = 0, 0
        for cid in ids:
            for canvas in canvases:
                for colors in palettes:
                    for method in methods:
                        if args.dry_run:
                            print(f"[dry] {cid} {method} {canvas[0]}x{canvas[1]} c{colors}")
                            continue
                        try:
                            if method == "pixeloe":
                                rec = run_pixeloe(cid, canvas, colors, presets)
                            else:
                                rec = convert_one(cid, method, canvas, colors, presets, args.dither)
                            if "error" in rec:
                                fail += 1
                                print(f"FAIL {cid}/{method}: {rec['error'][:200]}")
                            else:
                                ok += 1
                                print(f"OK   {cid}/{method}/{rec['canvas']}/c{colors} "
                                      f"{rec['seconds']}s {rec.get('uniqueColors', '?')} colors")
                        except Exception as e:  # one bad image must not kill the batch
                            fail += 1
                            print(f"FAIL {cid}/{method}: {type(e).__name__}: {e}")
                            rec = {"character": cid, "method": method,
                                   "canvas": f"{canvas[0]}x{canvas[1]}", "colors": colors,
                                   "error": f"{type(e).__name__}: {e}"}
                        recs.append(rec)
            if args.avatars and not args.dry_run:
                try:
                    avs = make_avatars(cid, presets, palettes[0])
                    if any("error" in a or "avatars" in a for a in avs):
                        fail += 1
                        print(f"FAIL {cid}/avatars: {avs}")
                    else:
                        ok += 1
                        print(f"OK   {cid}/avatars x{len(avs)}")
                    recs.extend(avs)
                except Exception as e:
                    fail += 1
                    print(f"FAIL {cid}/avatars: {type(e).__name__}: {e}")
                    recs.append({"character": cid, "method": "avatars",
                                 "error": f"{type(e).__name__}: {e}"})
        if not args.dry_run:
            report.pop("runs", None)          # migrate legacy key name
            report["history"] = hist + recs
            report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
            build_manifest()                  # keep final list true to disk
            print(f"report -> {report_path} (ok={ok} fail={fail})")
        return 0 if fail == 0 else 1

    if args.cmd == "avatars":
        fail = 0
        for cid in [i.strip() for i in args.ids.split(",")]:
            try:
                recs = make_avatars(cid, presets, int(args.palette))
                errored = [r for r in recs if "error" in r or "avatars" in r]
                for r in recs:
                    status = "SKIP" if "avatars" in r or "error" in r else "OK"
                    print(status, " ", r.get("file") or r)
                    for w in r.get("warnings", []):
                        print("WARN ", w)
                if errored:
                    fail += 1
            except Exception as e:
                fail += 1
                print(f"FAIL {cid}: {type(e).__name__}: {e}")
        if fail == 0:
            build_manifest()
        return 0 if fail == 0 else 1

    if args.cmd == "export-editable":
        fail = 0
        for cid in [i.strip() for i in args.ids.split(",")]:
            try:
                print("OK  ", export_editable(cid, int(args.palette)))
            except Exception as e:
                fail += 1
                print(f"FAIL {cid}: {type(e).__name__}: {e}")
        return 0 if fail == 0 else 1

    if args.cmd == "sheets":
        sys.path.insert(0, str(HERE))
        from build_sheets import build_all
        build_all([i.strip() for i in args.ids.split(",")], int(args.palette))
        return 0

    if args.cmd == "manifest":
        build_manifest()
        return 0

    if args.cmd == "head-diagram":
        for cid in [i.strip() for i in args.ids.split(",")]:
            preset = presets.get("characters", {}).get(cid, {})
            if "headRectSource" not in preset:
                print(f"FAIL {cid}: no headRectSource in presets")
                continue
            print("OK  ", build_head_diagram(cid, preset))
        return 0

    if args.cmd == "preview":
        sys.path.insert(0, str(HERE))
        from build_preview import build
        build()
        return 0

    return 0


if __name__ == "__main__":
    sys.exit(main())
