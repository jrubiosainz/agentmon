"""Procedural sprite animation.

Real sprite animation for a game this size is normally hand-drawn frame by
frame.  Instead we *derive* frames from a single pixel-art base sprite using
classic 2D animation primitives - squash & stretch, secondary motion, limb
segmentation and palette cycling - so every creature gets a consistent,
believable set of animations for free.

Every function returns a list of RGBA `PIL.Image` frames of identical size.
All resampling is NEAREST so the pixel grid is never softened.
"""

from __future__ import annotations

import math
from typing import Callable, Sequence

import numpy as np
from PIL import Image

Frame = Image.Image


# --------------------------------------------------------------------------- #
# low-level helpers
# --------------------------------------------------------------------------- #
def _blank(size: tuple[int, int]) -> Frame:
    return Image.new("RGBA", size, (0, 0, 0, 0))


def translate(img: Frame, dx: int, dy: int) -> Frame:
    out = _blank(img.size)
    out.paste(img, (int(dx), int(dy)), img)
    return out


def scale_about(img: Frame, sx: float, sy: float, anchor: str = "bottom") -> Frame:
    """Non-uniform scale that keeps the sprite anchored (squash & stretch)."""
    w, h = img.size
    nw, nh = max(1, int(round(w * sx))), max(1, int(round(h * sy)))
    scaled = img.resize((nw, nh), Image.NEAREST)
    out = _blank((w, h))
    ox = (w - nw) // 2
    oy = (h - nh) if anchor == "bottom" else (h - nh) // 2
    out.paste(scaled, (ox, oy), scaled)
    return out


def tint(img: Frame, color: tuple[int, int, int], amount: float) -> Frame:
    arr = np.array(img).astype(np.float32)
    mask = arr[:, :, 3] > 0
    for i, c in enumerate(color):
        arr[:, :, i][mask] = arr[:, :, i][mask] * (1 - amount) + c * amount
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def silhouette(img: Frame, color: tuple[int, int, int, int]) -> Frame:
    arr = np.array(img).copy()
    mask = arr[:, :, 3] > 0
    arr[mask] = color
    return Image.fromarray(arr, "RGBA")


def alpha_mul(img: Frame, factor: float) -> Frame:
    arr = np.array(img).astype(np.float32)
    arr[:, :, 3] *= factor
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


def shear_x(img: Frame, amount: float, pivot: float = 1.0) -> Frame:
    """Lean the sprite; rows further from the pivot line shift more."""
    arr = np.array(img)
    h, w = arr.shape[:2]
    out = np.zeros_like(arr)
    py = pivot * h
    for y in range(h):
        shift = int(round(amount * (py - y) / max(1.0, h)))
        if shift == 0:
            out[y] = arr[y]
        elif shift > 0:
            out[y, shift:] = arr[y, : w - shift]
        else:
            out[y, :shift] = arr[y, -shift:]
    return Image.fromarray(out, "RGBA")


def slice_rows(img: Frame, y0: int, y1: int) -> Frame:
    """Isolate a horizontal band (used for limb segmentation)."""
    arr = np.array(img).copy()
    arr[:y0] = 0
    arr[y1:] = 0
    return Image.fromarray(arr, "RGBA")


def composite(*layers: Frame) -> Frame:
    out = _blank(layers[0].size)
    for layer in layers:
        out.alpha_composite(layer)
    return out


def content_bounds(img: Frame) -> tuple[int, int, int, int]:
    arr = np.array(img)
    mask = arr[:, :, 3] > 0
    if not mask.any():
        return (0, 0, img.size[0], img.size[1])
    ys, xs = np.where(mask)
    return int(xs.min()), int(ys.min()), int(xs.max()) + 1, int(ys.max()) + 1


def led_cycle(img: Frame, phase: float, threshold: int = 200) -> Frame:
    """Palette-cycle the brightest pixels so LEDs / screens appear to blink."""
    arr = np.array(img).astype(np.int16)
    lum = arr[:, :, :3].max(axis=2)
    mask = (arr[:, :, 3] > 0) & (lum >= threshold)
    if mask.any():
        boost = 1.0 + 0.32 * math.sin(phase * math.tau)
        for i in range(3):
            arr[:, :, i][mask] = np.clip(arr[:, :, i][mask] * boost, 0, 255)
    return Image.fromarray(np.clip(arr, 0, 255).astype(np.uint8), "RGBA")


# --------------------------------------------------------------------------- #
# animation generators
# --------------------------------------------------------------------------- #
def idle_bob(base: Frame, frames: int = 4, amp: int = 2, squash: float = 0.045) -> list[Frame]:
    """Breathing loop: vertical bob with counter-phase squash & stretch."""
    out: list[Frame] = []
    for i in range(frames):
        t = i / frames
        dy = -round(amp * math.sin(t * math.tau))
        sy = 1.0 + squash * math.sin(t * math.tau)
        sx = 1.0 - squash * 0.6 * math.sin(t * math.tau)
        f = scale_about(base, sx, sy, "bottom")
        f = translate(f, 0, dy)
        out.append(led_cycle(f, t))
    return out


def hover(base: Frame, frames: int = 6, amp: int = 3, lean: float = 1.4) -> list[Frame]:
    """Floating loop for airborne creatures - bob plus a gentle sway."""
    out: list[Frame] = []
    for i in range(frames):
        t = i / frames
        dy = -round(amp * math.sin(t * math.tau))
        f = shear_x(base, lean * math.sin(t * math.tau + 0.6), pivot=1.0)
        f = translate(f, 0, dy)
        out.append(led_cycle(f, t))
    return out


def attack_lunge(base: Frame, frames: int = 6, reach: int = 10, facing: int = 1) -> list[Frame]:
    """Anticipation -> strike -> recover, the standard 3-beat attack arc."""
    out: list[Frame] = []
    keys = [-0.25, -0.4, 0.65, 1.0, 0.45, 0.0]  # normalised x offset per beat
    squash = [1.06, 1.10, 0.92, 0.88, 0.96, 1.0]
    for i in range(frames):
        k = keys[min(i, len(keys) - 1)]
        s = squash[min(i, len(squash) - 1)]
        f = scale_about(base, 2.0 - s, s, "bottom")
        f = shear_x(f, -k * 3.0 * facing, pivot=1.0)
        f = translate(f, round(k * reach * facing), round(-abs(k) * 2))
        out.append(f)
    return out


def hit_shake(base: Frame, frames: int = 6, amp: int = 3) -> list[Frame]:
    """Impact reaction: horizontal judder plus a two-frame damage flash."""
    out: list[Frame] = []
    for i in range(frames):
        dx = round(amp * math.sin(i * math.pi * 0.9) * (1 - i / frames))
        f = translate(base, dx, 0)
        if i < 2:
            f = tint(f, (255, 96, 96), 0.55)
        out.append(f)
    return out


def faint(base: Frame, frames: int = 6) -> list[Frame]:
    """Defeat: sink out of the frame while fading, like the GBA games."""
    h = base.size[1]
    out: list[Frame] = []
    for i in range(frames):
        t = (i + 1) / frames
        f = alpha_mul(base, max(0.0, 1.0 - t * 0.95))
        f = translate(f, 0, round(t * h * 0.85))
        out.append(f)
    return out


def appear(base: Frame, frames: int = 5) -> list[Frame]:
    """Send-out: pop in with an overshoot for snappy game feel."""
    out: list[Frame] = []
    curve = [0.30, 0.72, 1.12, 0.96, 1.0]
    for i in range(frames):
        s = curve[min(i, len(curve) - 1)]
        f = scale_about(base, s, s, "bottom")
        f = alpha_mul(f, min(1.0, 0.4 + i * 0.25))
        out.append(f)
    return out


def walk_cycle(base: Frame, frames: int = 4, leg_ratio: float = 0.34, stride: int = 1) -> list[Frame]:
    """Two-part walk: body bobs, legs alternate.

    The sprite is split at `leg_ratio` from the bottom of its content box; the
    lower band is shifted left/right on alternating beats while the upper band
    bobs.  On chunky robot sprites this reads convincingly as walking.
    """
    x0, y0, x1, y1 = content_bounds(base)
    if y1 <= y0:
        return [base] * frames
    split = int(round(y1 - (y1 - y0) * leg_ratio))
    upper = slice_rows(base, 0, split)
    lower = slice_rows(base, split, base.size[1])

    out: list[Frame] = []
    pattern = [0, 1, 0, -1][:frames] if frames == 4 else [
        round(math.sin(i / frames * math.tau)) for i in range(frames)
    ]
    for i in range(frames):
        p = pattern[i % len(pattern)]
        body_dy = -1 if p != 0 else 0
        legs = translate(lower, p * stride, 0)
        # far leg trails: mirror-shift the opposite half of the leg band
        body = translate(upper, 0, body_dy)
        out.append(composite(legs, body))
    return out


def turn_flip(base: Frame) -> Frame:
    return base.transpose(Image.FLIP_LEFT_RIGHT)


def charge_glow(base: Frame, frames: int = 4, color: tuple[int, int, int] = (140, 220, 255)) -> list[Frame]:
    out: list[Frame] = []
    for i in range(frames):
        t = i / frames
        amt = 0.15 + 0.35 * (0.5 - 0.5 * math.cos(t * math.tau))
        out.append(tint(base, color, amt))
    return out


# --------------------------------------------------------------------------- #
# animation set builder
# --------------------------------------------------------------------------- #
BATTLE_ANIMS: dict[str, Callable[[Frame], list[Frame]]] = {
    "idle": lambda s: idle_bob(s, 4, 2),
    "attack": lambda s: attack_lunge(s, 6, 10, 1),
    "hit": lambda s: hit_shake(s, 6, 3),
    "faint": lambda s: faint(s, 6),
    "appear": lambda s: appear(s, 5),
}


def build_battle_set(base: Frame, airborne: bool = False) -> dict[str, list[Frame]]:
    anims = {name: fn(base) for name, fn in BATTLE_ANIMS.items()}
    if airborne:
        anims["idle"] = hover(base, 6, 3)
    return anims


def build_walk_set(dir_sprites: dict[str, Frame], frames: int = 4) -> dict[str, list[Frame]]:
    """`dir_sprites` maps 'down'|'up'|'left'|'right' to a base sprite."""
    out: dict[str, list[Frame]] = {}
    for d, sprite in dir_sprites.items():
        out[f"walk_{d}"] = walk_cycle(sprite, frames=frames)
    return out


def ensure_same_size(frames: Sequence[Frame]) -> list[Frame]:
    w = max(f.size[0] for f in frames)
    h = max(f.size[1] for f in frames)
    out = []
    for f in frames:
        if f.size == (w, h):
            out.append(f)
        else:
            canvas = _blank((w, h))
            canvas.paste(f, ((w - f.size[0]) // 2, h - f.size[1]), f)
            out.append(canvas)
    return out
