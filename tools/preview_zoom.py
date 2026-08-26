"""Blow up packed preview sprites so a 68px design can actually be judged.

    python tools/preview_zoom.py beni_front beni_back
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

ROOT = Path(__file__).resolve().parents[1]
SPRITES = ROOT / "tools" / ".preview" / "creatures"
BG = (24, 26, 34, 255)
ZOOM = 7


def frame(key: str) -> Image.Image | None:
    meta_path = SPRITES / f"{key}.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    row = meta["animations"].get("idle", {"row": 0})["row"]
    strip = Image.open(SPRITES / f"{key}.png").convert("RGBA")
    return strip.crop((0, row * fh, fw, row * fh + fh))


def main(keys: list[str]) -> int:
    tiles = [(k, frame(k)) for k in keys]
    tiles = [(k, f) for k, f in tiles if f is not None]
    if not tiles:
        raise SystemExit("nothing to show")

    cw = max(f.width for _, f in tiles) * ZOOM + 24
    chh = max(f.height for _, f in tiles) * ZOOM + 40
    board = Image.new("RGBA", (cw * len(tiles), chh), BG)
    d = ImageDraw.Draw(board)
    for i, (k, f) in enumerate(tiles):
        big = f.resize((f.width * ZOOM, f.height * ZOOM), Image.NEAREST)
        x = i * cw + (cw - big.width) // 2
        board.alpha_composite(big, (x, 30))
        d.text((i * cw + 12, 10), k, fill=(240, 240, 250, 255))

    out = ROOT / "tools" / ".preview" / f"zoom_{'_'.join(keys)}.png"
    board.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:]))
