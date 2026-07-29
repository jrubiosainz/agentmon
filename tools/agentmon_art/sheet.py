"""Sprite sheet packing + JSON atlas emission."""

from __future__ import annotations

import json
from pathlib import Path
from typing import Mapping, Sequence

from PIL import Image

Frame = Image.Image


def pack_strip(frames: Sequence[Frame]) -> Image.Image:
    """Lay frames out horizontally (one animation = one row strip)."""
    w = max(f.size[0] for f in frames)
    h = max(f.size[1] for f in frames)
    sheet = Image.new("RGBA", (w * len(frames), h), (0, 0, 0, 0))
    for i, f in enumerate(frames):
        sheet.paste(f, (i * w + (w - f.size[0]) // 2, h - f.size[1]), f)
    return sheet


def pack_animations(anims: Mapping[str, Sequence[Frame]]) -> tuple[Image.Image, dict]:
    """Grid layout: one row per animation, frames left-to-right."""
    names = list(anims.keys())
    fw = max(f.size[0] for frames in anims.values() for f in frames)
    fh = max(f.size[1] for frames in anims.values() for f in frames)
    cols = max(len(frames) for frames in anims.values())
    sheet = Image.new("RGBA", (fw * cols, fh * len(names)), (0, 0, 0, 0))

    meta: dict = {"frameWidth": fw, "frameHeight": fh, "animations": {}}
    for row, name in enumerate(names):
        frames = anims[name]
        for col, f in enumerate(frames):
            sheet.paste(f, (col * fw + (fw - f.size[0]) // 2, row * fh + (fh - f.size[1])), f)
        meta["animations"][name] = {"row": row, "frames": len(frames)}
    return sheet, meta


def pack_grid(images: Mapping[str, Frame], columns: int = 8) -> tuple[Image.Image, dict]:
    """Pack many equally-sized sprites into a uniform grid atlas."""
    keys = list(images.keys())
    fw = max(im.size[0] for im in images.values())
    fh = max(im.size[1] for im in images.values())
    rows = (len(keys) + columns - 1) // columns
    sheet = Image.new("RGBA", (fw * columns, fh * rows), (0, 0, 0, 0))
    meta: dict = {"frameWidth": fw, "frameHeight": fh, "columns": columns, "index": {}}
    for i, k in enumerate(keys):
        cx, cy = (i % columns) * fw, (i // columns) * fh
        im = images[k]
        sheet.paste(im, (cx + (fw - im.size[0]) // 2, cy + (fh - im.size[1])), im)
        meta["index"][k] = i
    return sheet, meta


def save(sheet: Image.Image, meta: dict | None, out_png: Path, out_json: Path | None = None) -> None:
    out_png.parent.mkdir(parents=True, exist_ok=True)
    sheet.save(out_png, optimize=True)
    if meta is not None and out_json is not None:
        out_json.parent.mkdir(parents=True, exist_ok=True)
        out_json.write_text(json.dumps(meta, indent=2), encoding="utf-8")
