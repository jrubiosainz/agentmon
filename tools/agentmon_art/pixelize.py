"""Concept art -> GBA-authentic pixel art.

Pipeline stages
---------------
1. `keyout`        remove the flat chroma background with a corner-seeded flood fill
2. `trim`          crop to the sprite silhouette
3. `fit`           box-fit into the target sprite cell (area-average downscale)
4. `quantize`      median-cut palette reduction snapped to the GBA 15-bit color space
5. `outline`       add the classic 1px dark keyline around the silhouette
6. `despeckle`     drop orphan pixels that survived the downscale
"""

from __future__ import annotations

from collections import deque
from dataclasses import dataclass
from pathlib import Path

import numpy as np
from PIL import Image, ImageEnhance

# --------------------------------------------------------------------------- #
# GBA colour space: 5 bits per channel (32 levels), no alpha blending.
# --------------------------------------------------------------------------- #
GBA_LEVELS = 32
_GBA_LUT = np.array([round(i * 255 / (GBA_LEVELS - 1)) for i in range(GBA_LEVELS)], dtype=np.uint8)


def to_gba_color(rgb: np.ndarray) -> np.ndarray:
    """Snap 8-bit RGB to the GBA's 5-bit-per-channel colour space."""
    idx = np.clip((rgb.astype(np.int32) * (GBA_LEVELS - 1) + 127) // 255, 0, GBA_LEVELS - 1)
    return _GBA_LUT[idx]


@dataclass
class PixelizeConfig:
    width: int = 64
    height: int = 64
    colors: int = 15
    outline: bool = True
    outline_darken: float = 0.42
    saturation: float = 1.28
    contrast: float = 1.10
    alpha_threshold: int = 128
    key_tolerance: int = 88
    despeckle: bool = True
    pad_bottom: int = 0
    align: str = "center"  # center | bottom


# --------------------------------------------------------------------------- #
# 1. Chroma key
# --------------------------------------------------------------------------- #
def keyout(img: Image.Image, tolerance: int = 88) -> Image.Image:
    """Flood-fill the flat background inwards from the image border.

    Safer than a global colour-distance key: interior pixels that happen to
    match the backdrop colour (e.g. a green LED) are preserved because the fill
    never reaches them.
    """
    img = img.convert("RGBA")
    arr = np.array(img)
    h, w = arr.shape[:2]
    rgb = arr[:, :, :3].astype(np.int16)

    # Background reference = median of a thin border ring.
    ring = np.concatenate(
        [rgb[0:3, :, :].reshape(-1, 3), rgb[h - 3 : h, :, :].reshape(-1, 3),
         rgb[:, 0:3, :].reshape(-1, 3), rgb[:, w - 3 : w, :].reshape(-1, 3)]
    )
    bg = np.median(ring, axis=0)

    dist = np.sqrt(((rgb - bg) ** 2).sum(axis=2))
    similar = dist < tolerance

    # BFS from every border pixel that is background-like.
    visited = np.zeros((h, w), dtype=bool)
    q: deque[tuple[int, int]] = deque()
    for x in range(w):
        for y in (0, h - 1):
            if similar[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))
    for y in range(h):
        for x in (0, w - 1):
            if similar[y, x] and not visited[y, x]:
                visited[y, x] = True
                q.append((y, x))

    while q:
        y, x = q.popleft()
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and not visited[ny, nx] and similar[ny, nx]:
                visited[ny, nx] = True
                q.append((ny, nx))

    alpha = arr[:, :, 3].astype(np.int16)
    alpha[visited] = 0

    # The border fill cannot reach backdrop that the subject encloses - the gap
    # between two limbs, the hole through a ring. Those pockets survived as
    # opaque magenta blobs stamped across the sprite. Sweep them up here, but
    # only when a pocket really is backdrop: large enough to matter, and its
    # mean distance to the reference colour is tiny. A *designed* magenta (a
    # glowing eye, a plasma core) sits far from the flat key colour - measured
    # across the dex, backdrop pockets score 4-13 and designed magenta 45-78 -
    # so the threshold separates them with a wide margin.
    pockets = similar & ~visited
    if pockets.any():
        min_size = max(24, int(h * w * 0.0002))
        labels = np.zeros((h, w), dtype=np.int32)
        blob = 0
        for sy, sx in zip(*np.nonzero(pockets)):
            if labels[sy, sx]:
                continue
            blob += 1
            labels[sy, sx] = blob
            stack = [(int(sy), int(sx))]
            while stack:
                y, x = stack.pop()
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = y + dy, x + dx
                    if 0 <= ny < h and 0 <= nx < w and pockets[ny, nx] and not labels[ny, nx]:
                        labels[ny, nx] = blob
                        stack.append((ny, nx))
        for i in range(1, blob + 1):
            m = labels == i
            if int(m.sum()) < min_size:
                continue
            if float(dist[m].mean()) < 22.0:
                alpha[m] = 0
                visited |= m

    # Soften the 1px halo: pixels adjacent to the removed background that are
    # still close to the key colour get partial alpha so the downscale blends.
    edge = _dilate(visited) & ~visited
    halo = edge & (dist < tolerance * 1.6)
    alpha[halo] = (alpha[halo] * 0.35).astype(np.int16)

    arr[:, :, 3] = np.clip(alpha, 0, 255).astype(np.uint8)
    return Image.fromarray(arr, "RGBA")


def _dilate(mask: np.ndarray) -> np.ndarray:
    out = mask.copy()
    out[1:, :] |= mask[:-1, :]
    out[:-1, :] |= mask[1:, :]
    out[:, 1:] |= mask[:, :-1]
    out[:, :-1] |= mask[:, 1:]
    return out


# --------------------------------------------------------------------------- #
# 2. Trim
# --------------------------------------------------------------------------- #
def trim(img: Image.Image, alpha_min: int = 16) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    mask = arr[:, :, 3] > alpha_min
    if not mask.any():
        return img
    ys, xs = np.where(mask)
    return img.crop((int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1))


# --------------------------------------------------------------------------- #
# 3. Fit into the sprite cell
# --------------------------------------------------------------------------- #
def fit(img: Image.Image, cfg: PixelizeConfig) -> Image.Image:
    cw, ch = cfg.width, cfg.height - cfg.pad_bottom
    w, h = img.size
    scale = min(cw / w, ch / h)
    nw, nh = max(1, int(round(w * scale))), max(1, int(round(h * scale)))

    # Two-step downscale keeps more silhouette detail than one huge jump.
    work = img
    while work.size[0] > nw * 2 and work.size[1] > nh * 2:
        work = work.resize((work.size[0] // 2, work.size[1] // 2), Image.LANCZOS)
    work = work.resize((nw, nh), Image.LANCZOS)

    canvas = Image.new("RGBA", (cfg.width, cfg.height), (0, 0, 0, 0))
    ox = (cfg.width - nw) // 2
    oy = (cfg.height - cfg.pad_bottom - nh) if cfg.align == "bottom" else (cfg.height - cfg.pad_bottom - nh) // 2
    canvas.paste(work, (ox, max(0, oy)), work)
    return canvas


# --------------------------------------------------------------------------- #
# 4. Quantize to a small GBA palette
# --------------------------------------------------------------------------- #
def quantize(img: Image.Image, cfg: PixelizeConfig) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    alpha = arr[:, :, 3]
    hard = (alpha >= cfg.alpha_threshold).astype(np.uint8) * 255

    rgb = Image.fromarray(arr[:, :, :3], "RGB")
    rgb = ImageEnhance.Color(rgb).enhance(cfg.saturation)
    rgb = ImageEnhance.Contrast(rgb).enhance(cfg.contrast)

    # Median-cut over opaque pixels only, so the palette isn't wasted on fringe.
    opaque = np.array(rgb)
    tmp = opaque.copy()
    tmp[hard == 0] = tmp[hard > 0].mean(axis=0).astype(np.uint8) if (hard > 0).any() else 0
    pal_src = Image.fromarray(tmp, "RGB").quantize(colors=cfg.colors, method=Image.MEDIANCUT, dither=Image.NONE)
    reduced = np.array(pal_src.convert("RGB"))

    reduced = to_gba_color(reduced)
    out = np.dstack([reduced, hard]).astype(np.uint8)
    out[hard == 0] = (0, 0, 0, 0)
    return Image.fromarray(out, "RGBA")


# --------------------------------------------------------------------------- #
# 5. Keyline outline
# --------------------------------------------------------------------------- #
def outline(img: Image.Image, darken: float = 0.42) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    a = arr[:, :, 3] > 0
    ring = _dilate(a) & ~a

    h, w = a.shape
    out = arr.copy()
    ys, xs = np.where(ring)
    for y, x in zip(ys, xs):
        # Average the neighbouring sprite colours, then darken them.
        acc, cnt = np.zeros(3, dtype=np.int32), 0
        for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1)):
            ny, nx = y + dy, x + dx
            if 0 <= ny < h and 0 <= nx < w and a[ny, nx]:
                acc += arr[ny, nx, :3].astype(np.int32)
                cnt += 1
        if cnt:
            base = acc / cnt
            out[y, x, :3] = to_gba_color(np.clip(base * darken, 0, 255).astype(np.uint8))
            out[y, x, 3] = 255
    return Image.fromarray(out, "RGBA")


# --------------------------------------------------------------------------- #
# 6. Despeckle
# --------------------------------------------------------------------------- #
def despeckle(img: Image.Image, min_neighbours: int = 2) -> Image.Image:
    arr = np.array(img.convert("RGBA"))
    a = (arr[:, :, 3] > 0).astype(np.uint8)
    n = np.zeros_like(a, dtype=np.uint8)
    n[1:, :] += a[:-1, :]
    n[:-1, :] += a[1:, :]
    n[:, 1:] += a[:, :-1]
    n[:, :-1] += a[:, 1:]
    lonely = (a == 1) & (n < min_neighbours)
    arr[lonely] = (0, 0, 0, 0)
    return Image.fromarray(arr, "RGBA")


# --------------------------------------------------------------------------- #
# Full pipeline
# --------------------------------------------------------------------------- #
def pixelize(src: Image.Image | str | Path, cfg: PixelizeConfig | None = None) -> Image.Image:
    cfg = cfg or PixelizeConfig()
    img = src if isinstance(src, Image.Image) else Image.open(src)
    img = img.convert("RGBA")
    img = keyout(img, cfg.key_tolerance)
    img = trim(img)
    img = fit(img, cfg)
    img = quantize(img, cfg)
    if cfg.despeckle:
        img = despeckle(img)
    if cfg.outline:
        img = outline(img, cfg.outline_darken)
    return img


def palette_of(img: Image.Image, limit: int = 32) -> list[tuple[int, int, int]]:
    arr = np.array(img.convert("RGBA"))
    opaque = arr[arr[:, :, 3] > 0][:, :3]
    if len(opaque) == 0:
        return []
    uniq, counts = np.unique(opaque, axis=0, return_counts=True)
    order = np.argsort(-counts)
    return [tuple(int(c) for c in uniq[i]) for i in order[:limit]]
