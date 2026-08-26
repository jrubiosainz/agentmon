"""Side-by-side review board for a subset of `newmons.SPECIES`.

For every requested key it lays the raw Azure render next to the packed GBA
sprite at 4x, front and back, so a design can be judged for fidelity *and* for
how it survives the 68px reduction in one glance.

    python tools/preview_trio.py beni loona emo
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

from PIL import Image, ImageDraw

sys.path.insert(0, str(Path(__file__).resolve().parent))

import newmons  # noqa: E402
import preview_newmons  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = ROOT / "tools" / ".cache" / "images"
SPRITES = ROOT / "tools" / ".preview" / "creatures"
BG = (24, 26, 34, 255)


def raw_render(key: str) -> Image.Image | None:
    hits = sorted(CACHE.glob(f"{key}.*.png"))
    return Image.open(hits[0]).convert("RGBA") if hits else None


def sprite(key: str, zoom: int = 4) -> Image.Image | None:
    meta_path = SPRITES / f"{key}.json"
    if not meta_path.exists():
        return None
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    row = meta["animations"].get("idle", {"row": 0})["row"]
    strip = Image.open(SPRITES / f"{key}.png").convert("RGBA")
    frame = strip.crop((0, row * fh, fw, row * fh + fh))
    return frame.resize((fw * zoom, fh * zoom), Image.NEAREST)


def panel(key: str, label: str, w: int = 300, h: int = 340) -> Image.Image:
    tile = Image.new("RGBA", (w, h), BG)
    d = ImageDraw.Draw(tile)

    raw = raw_render(key)
    if raw is not None:
        raw.thumbnail((w - 20, h - 130), Image.LANCZOS)
        tile.alpha_composite(raw, ((w - raw.width) // 2, 24))

    spr = sprite(key)
    if spr is not None:
        if spr.height > 190:
            spr = spr.resize((spr.width * 3 // 4, spr.height * 3 // 4), Image.NEAREST)
        tile.alpha_composite(spr, ((w - spr.width) // 2, h - spr.height - 20))

    d.text((10, 8), label, fill=(240, 240, 250, 255))
    d.line([(0, h - 1), (w, h - 1)], fill=(70, 74, 90, 255))
    return tile


def main(keys: list[str]) -> int:
    wanted = [s for s in newmons.SPECIES if s["key"] in keys]
    if not wanted:
        raise SystemExit(f"no species matched {keys}")

    cols, cw, ch = 2, 300, 340
    rows = len(wanted)
    board = Image.new("RGBA", (cols * cw, rows * ch), BG)
    for r, s in enumerate(wanted):
        for c, suffix in enumerate(("front", "back")):
            key = f"{s['key']}_{suffix}"
            board.alpha_composite(panel(key, f"{s['name']} {suffix}"), (c * cw, r * ch))

    out = ROOT / "tools" / ".preview" / f"board_{'_'.join(keys)}.png"
    board.save(out)
    print(out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main(sys.argv[1:] or ["beni", "loona", "emo"]))
