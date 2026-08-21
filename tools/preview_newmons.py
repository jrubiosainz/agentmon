"""Generate the new Agentmon sprites into a STAGING folder for approval.

Nothing here touches `client/public/assets` or `shared/agentdex.json` - the
whole point is to render every new creature, pack its battle animations and
build an HTML board so the designs can be signed off before integration.

    set AGENTMON_IMAGE_KEY=...
    python tools/preview_newmons.py

Output: tools/.preview/{creatures,preview.html}
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))

import newmons  # noqa: E402
from agentmon_art import anim, sheet  # noqa: E402
from agentmon_art.azureimg import AzureImageClient, ImageRequest  # noqa: E402
from agentmon_art.pixelize import PixelizeConfig, pixelize  # noqa: E402
from generate_assets import CREATURE_STYLE  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tools" / ".preview"
SPRITES = OUT / "creatures"


# ---------------------------------------------------------------- recolouring

def recolor_shell(img: Image.Image, target: tuple[int, int, int]) -> Image.Image:
    """Palette-swap the light neutral shell of a sprite to `target`.

    The Reachy colour variants must share one silhouette - regenerating them
    would produce eight subtly different bodies. So the base is authored in
    off-white and the shell pixels (low saturation, mid-to-high value) are
    mapped onto the target hue while keeping their relative shading. Dark
    detail - eyes, antennae, the base ring, the outline - is left alone.
    """
    rgba = np.asarray(img.convert("RGBA")).astype(np.float32)
    rgb, a = rgba[..., :3], rgba[..., 3]

    mx = rgb.max(axis=-1)
    mn = rgb.min(axis=-1)
    sat = np.where(mx > 0, (mx - mn) / np.maximum(mx, 1), 0.0)
    lum = mx / 255.0

    shell = (a > 8) & (sat < 0.34) & (lum > 0.42)
    if not shell.any():
        return img.copy()

    # Normalise shell luminance to 0..1 across its own range so the darkest
    # shell pixel becomes a shaded target and the brightest a highlight.
    lo, hi = lum[shell].min(), lum[shell].max()
    span = max(hi - lo, 1e-3)
    t = np.clip((lum - lo) / span, 0.0, 1.0)[..., None]

    tgt = np.array(target, dtype=np.float32)
    dark = tgt * 0.52
    light = tgt + (255.0 - tgt) * 0.34
    ramp = dark + (light - dark) * t

    out = rgb.copy()
    out[shell] = ramp[shell]
    return Image.fromarray(
        np.concatenate([np.clip(out, 0, 255), a[..., None]], axis=-1).astype(np.uint8),
        "RGBA",
    )


# ------------------------------------------------------------------- requests

def requests() -> list[ImageRequest]:
    """front + back for every species, shape form and extra pose."""
    reqs: list[ImageRequest] = []

    def pair(key: str, art: str, art_back: str | None = None) -> None:
        reqs.append(
            ImageRequest(
                key=f"{key}_front",
                prompt=CREATURE_STYLE.format(
                    desc=art, view="front three-quarter view facing the viewer"
                ),
            )
        )
        # A creature whose silhouette is mostly a smooth featureless shell reads
        # as "shut down" from behind unless the rear is described explicitly -
        # REACHYMINI's back view came out indistinguishable from its COVER pose.
        reqs.append(
            ImageRequest(
                key=f"{key}_back",
                prompt=CREATURE_STYLE.format(
                    desc=art_back or art,
                    view="seen from directly behind, rear view, the back of the creature facing "
                    "the viewer, its face and front completely hidden",
                ),
            )
        )

    for s in newmons.SPECIES:
        pair(s["key"], s["art"], s.get("art_back"))
        for form in s.get("shape_forms", []):
            pair(f"{s['key']}_{form['key']}", form["art"], form.get("art_back"))
        for pose, art in s.get("extra_poses", {}).items():
            reqs.append(
                ImageRequest(
                    key=f"{s['key']}_{pose}",
                    prompt=CREATURE_STYLE.format(
                        desc=art, view="front three-quarter view facing the viewer"
                    ),
                )
            )
    return reqs


def connect_antennae(img: Image.Image) -> Image.Image:
    """Redraw antenna stalks that the pixelizer dropped.

    The stalks are one source pixel wide, so quantising to 15 colours at 68px
    erases them and leaves the white ball tips floating in mid-air. Any small
    island that is detached from the main silhouette gets a 1px dark stalk
    drawn straight down until it meets the body.
    """
    a = np.array(img.convert("RGBA"))
    solid = a[..., 3] > 8
    h, w = solid.shape
    lab = np.zeros((h, w), np.int32)
    sizes: dict[int, int] = {}
    nxt = 0
    for y0 in range(h):
        for x0 in range(w):
            if not solid[y0, x0] or lab[y0, x0]:
                continue
            nxt += 1
            lab[y0, x0] = nxt
            stack = [(y0, x0)]
            n = 0
            while stack:
                cy, cx = stack.pop()
                n += 1
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not lab[ny, nx]:
                        lab[ny, nx] = nxt
                        stack.append((ny, nx))
            sizes[nxt] = n
    if not sizes:
        return img

    main = max(sizes, key=lambda k: sizes[k])
    body = lab == main
    ink = np.array([34, 32, 42, 255], np.uint8)

    def nearest_column(cx: int) -> int | None:
        for step in range(w):
            for col in (cx - step, cx + step):
                if 0 <= col < w and body[:, col].any():
                    return col
        return None

    for cid, n in sizes.items():
        if cid == main or n > sizes[main] * 0.12:
            continue
        cys, cxs = np.nonzero(lab == cid)
        col = nearest_column(int(round(cxs.mean())))
        if col is None:
            continue
        bottom, top = int(cys.max()), int(np.nonzero(body[:, col])[0].min())
        for y in range(bottom + 1, top):
            a[y, col] = ink
    return Image.fromarray(a)


# ------------------------------------------------------------------- sprites

def build_sprite(src: Path, key: str, cell: tuple[int, int], back: bool,
                 repair_antennae: bool = False,
                 accents: tuple[tuple[int, int, int], ...] = ()) -> Image.Image:
    """Pixelize one render and pack its battle animation set."""
    cw, ch = cell
    if back:
        cw, ch = int(cw * 1.15), int(ch * 1.15)
    base = pixelize(src, PixelizeConfig(width=cw, height=ch, colors=15, align="bottom",
                                        keep_colors=accents))
    if repair_antennae:
        base = connect_antennae(base)
    write_sheet(base, key, back)
    return base


def write_sheet(base: Image.Image, key: str, back: bool) -> None:
    if back:
        anims = {
            "idle": anim.idle_bob(base, frames=4, amp=1),
            "attack": anim.attack_lunge(base, frames=6, reach=8, facing=-1),
            "hit": anim.hit_shake(base, frames=6, amp=2),
            "appear": anim.appear(base, frames=5),
        }
    else:
        anims = anim.build_battle_set(base)
    png, meta = sheet.pack_animations(anims)
    sheet.save(png, meta, SPRITES / f"{key}.png", SPRITES / f"{key}.json")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    reqs = requests()
    print(f"generating {len(reqs)} renders ...")
    client = AzureImageClient(max_workers=3)
    paths = client.generate_many(reqs)
    missing = [r.key for r in reqs if r.key not in paths]
    if missing:
        raise SystemExit(f"renders failed: {missing} - rerun, the rest is cached")

    cells = {s["key"]: tuple(s["cell"]) for s in newmons.SPECIES}
    accents = {s["key"]: tuple(tuple(c) for c in s.get("accents", ())) for s in newmons.SPECIES}
    made: list[str] = []

    for s in newmons.SPECIES:
        cell = cells[s["key"]]
        acc = accents[s["key"]]
        # Hair-thin antenna stalks never survive the 15-colour reduction, so any
        # species that has them needs the repair pass on EVERY view, not just on
        # the COVER pose - the rear view lost them entirely.
        fix = bool(s.get("antennae"))
        for suffix, back in (("front", False), ("back", True)):
            key = f"{s['key']}_{suffix}"
            build_sprite(paths[key], key, cell, back, repair_antennae=fix, accents=acc)
            made.append(key)

        for form in s.get("shape_forms", []):
            facc = tuple(tuple(c) for c in form.get("accents", acc))
            for suffix, back in (("front", False), ("back", True)):
                key = f"{s['key']}_{form['key']}_{suffix}"
                build_sprite(paths[key], key, cell, back, repair_antennae=fix, accents=facc)
                made.append(key)
        for pose in s.get("extra_poses", {}):
            key = f"{s['key']}_{pose}"
            build_sprite(paths[key], key, cell, False, repair_antennae=True, accents=acc)
            made.append(key)

        # Shape forms share the shell silhouette, so their covered pose is the
        # base cover recoloured to the form's dominant hue (ZEBRA keeps white).
        cov = SPRITES / f"{s['key']}_cover.png"
        for form in s.get("shape_forms", []):
            if not cov.exists():
                continue
            meta = json.loads((SPRITES / f"{s['key']}_cover.json").read_text())
            img = Image.open(cov).convert("RGBA")
            rgb = form.get("cover_rgb")
            if rgb is not None:
                img = recolor_shell(img, tuple(rgb))
            key = f"{s['key']}_{form['key']}_cover"
            sheet.save(img, meta, SPRITES / f"{key}.png", SPRITES / f"{key}.json")
            made.append(key)

        # Colour forms are palette swaps of the generated base, never new art.
        for fkey, _label, rgb in s.get("colour_forms", []):
            if rgb is None:
                continue
            for suffix, _back in (("front", False), ("back", True)):
                src = Image.open(SPRITES / f"{s['key']}_{suffix}.png").convert("RGBA")
                meta = json.loads((SPRITES / f"{s['key']}_{suffix}.json").read_text())
                tinted = recolor_shell(src, tuple(rgb))
                key = f"{s['key']}_{fkey}_{suffix}"
                sheet.save(tinted, meta, SPRITES / f"{key}.png", SPRITES / f"{key}.json")
                made.append(key)
            # the covered pose follows the colour too
            cov = SPRITES / f"{s['key']}_cover.png"
            if cov.exists():
                meta = json.loads((SPRITES / f"{s['key']}_cover.json").read_text())
                tint = recolor_shell(Image.open(cov).convert("RGBA"), tuple(rgb))
                sheet.save(
                    tint, meta,
                    SPRITES / f"{s['key']}_{fkey}_cover.png",
                    SPRITES / f"{s['key']}_{fkey}_cover.json",
                )

    print(f"packed {len(made)} sprite sheets -> {SPRITES}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
