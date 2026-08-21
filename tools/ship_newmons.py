"""Ship the approved homage sprites from staging into the client.

Staging (`tools/.preview/creatures`) names every sheet `<key>_front`; the client
expects the front sheet at `<key>` and the back at `<key>_back`, so the front
sheets are renamed on the way in. Form and cover poses ship as
`<species>_<form>` and `<species>_cover` / `<species>_<form>_cover`.

The 32x32 party/dex icon atlas is rebuilt rather than regenerated: the existing
37 icons are lifted out of the shipped atlas so untouched species keep exactly
the pixels they had, and only the new entries are pixelized fresh.

    python tools/ship_newmons.py
"""

from __future__ import annotations

import json
import shutil
import sys
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import newmons  # noqa: E402
import preview_newmons as prev  # noqa: E402
from agentmon_art import sheet  # noqa: E402
from agentmon_art.azureimg import AzureImageClient  # noqa: E402
from agentmon_art.pixelize import PixelizeConfig, pixelize  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
STAGE = ROOT / "tools" / ".preview" / "creatures"
DEST = ROOT / "client" / "public" / "assets" / "creatures"
ATLAS = ROOT / "client" / "public" / "assets" / "atlas"
DEX = json.loads((ROOT / "shared" / "agentdex.json").read_text(encoding="utf-8"))

ICON_CFG = PixelizeConfig(width=32, height=32, colors=11, align="bottom", outline=True)


def copy_pair(src_key: str, dst_key: str) -> bool:
    png, meta = STAGE / f"{src_key}.png", STAGE / f"{src_key}.json"
    if not png.exists():
        return False
    shutil.copyfile(png, DEST / f"{dst_key}.png")
    m = json.loads(meta.read_text(encoding="utf-8"))
    m["species"] = dst_key
    (DEST / f"{dst_key}.json").write_text(json.dumps(m), encoding="utf-8")
    return True


def ship_sheets() -> list[str]:
    DEST.mkdir(parents=True, exist_ok=True)
    shipped = []
    for s in newmons.SPECIES:
        k = s["key"]
        names = [(f"{k}_front", k), (f"{k}_back", f"{k}_back"), (f"{k}_cover", f"{k}_cover")]
        for form in s.get("colour_forms", []) + [(f["key"],) for f in s.get("shape_forms", [])]:
            fk = form[0]
            names += [(f"{k}_{fk}_front", f"{k}_{fk}"),
                      (f"{k}_{fk}_back", f"{k}_{fk}_back"),
                      (f"{k}_{fk}_cover", f"{k}_{fk}_cover")]
        for src, dst in names:
            if copy_pair(src, dst):
                shipped.append(dst)
    return shipped


def existing_icons() -> dict[str, Image.Image]:
    """Slice the shipped atlas back into per-key images so nothing re-renders."""
    meta = json.loads((ATLAS / "creature_icons.json").read_text(encoding="utf-8"))
    img = Image.open(ATLAS / "creature_icons.png").convert("RGBA")
    w, h, cols = meta["frameWidth"], meta["frameHeight"], meta["columns"]
    out = {}
    for key, i in meta["index"].items():
        c, r = i % cols, i // cols
        out[key] = img.crop((c * w, r * h, (c + 1) * w, (r + 1) * h))
    return out


def new_icons() -> dict[str, Image.Image]:
    """Pixelize 32x32 icons straight from the cached full-size renders."""
    client = AzureImageClient(api_key="unused-cache-only",
                              cache_dir=ROOT / "tools" / ".cache" / "images")
    by_key = {}
    for req in prev.requests():
        p = client.cached(req)
        if p is None:
            raise SystemExit(f"no cached render for {req.key} - run preview_newmons.py first")
        by_key[req.key] = p

    icons = {}
    for s in newmons.SPECIES:
        k = s["key"]
        icons[k] = pixelize(by_key[f"{k}_front"], ICON_CFG)
        for form in s.get("shape_forms", []):
            icons[f"{k}_{form['key']}"] = pixelize(by_key[f"{k}_{form['key']}_front"], ICON_CFG)
        for fkey, _label, rgb in s.get("colour_forms", []):
            if rgb is None:
                continue
            icons[f"{k}_{fkey}"] = prev.recolor_shell(icons[k].copy(), tuple(rgb))
    return icons


def main() -> int:
    shipped = ship_sheets()
    icons = existing_icons()
    icons.update(new_icons())

    # Dex order first so the party/dex UI indexes stay stable, forms after.
    order: list[str] = []
    for s in DEX["species"]:
        order.append(s["key"])
        order += [f"{s['key']}_{f['key']}" for f in s.get("forms", [])
                  if f"{s['key']}_{f['key']}" in icons]
    ordered = {k: icons[k] for k in order if k in icons}

    gsheet, gmeta = sheet.pack_grid(ordered, columns=8)
    sheet.save(gsheet, gmeta, ATLAS / "creature_icons.png", ATLAS / "creature_icons.json")
    print(f"shipped {len(shipped)} sheets -> {DEST}")
    print(f"icon atlas {gsheet.size} with {len(ordered)} entries")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
