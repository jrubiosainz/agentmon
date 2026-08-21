"""Dump a single contact sheet of every packed preview sprite (idle frame 0)."""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

OUT = Path(__file__).resolve().parents[1] / "tools" / ".preview"
SPRITES = OUT / "creatures"
ZOOM = 3
CELL = (150, 240)
COLS = 7


def first_frame(key: str) -> Image.Image | None:
    meta_path = SPRITES / f"{key}.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    row = meta["animations"].get("idle", {"row": 0})["row"]
    sheet = Image.open(SPRITES / f"{key}.png").convert("RGBA")
    return sheet.crop((0, row * fh, fw, row * fh + fh))


def main() -> int:
    keys = sorted(p.stem for p in SPRITES.glob("*.json"))
    rows = (len(keys) + COLS - 1) // COLS
    canvas = Image.new("RGBA", (CELL[0] * COLS, CELL[1] * rows), (24, 26, 34, 255))
    draw = ImageDraw.Draw(canvas)
    for i, key in enumerate(keys):
        f = first_frame(key)
        if f is None:
            continue
        f = f.resize((f.width * ZOOM, f.height * ZOOM), Image.NEAREST)
        cx, cy = (i % COLS) * CELL[0], (i // COLS) * CELL[1]
        canvas.paste(f, (cx + (CELL[0] - f.width) // 2, cy + CELL[1] - 22 - f.height), f)
        draw.text((cx + 6, cy + CELL[1] - 16), key, fill=(200, 212, 236, 255))
    dest = OUT / "contact.png"
    canvas.save(dest)
    print(f"{len(keys)} sprites -> {dest}  ({canvas.width}x{canvas.height})")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
