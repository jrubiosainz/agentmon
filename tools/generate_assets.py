"""End-to-end art build: Azure gpt-image-2 -> pixel art -> animations -> sheets.

    python tools/generate_assets.py --all
    python tools/generate_assets.py --creatures --workers 6
    python tools/generate_assets.py --rebuild        # re-run post-processing only

Generated concept art is cached under tools/.cache/images so re-running is cheap
and post-processing can be iterated without paying for new generations.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from PIL import Image  # noqa: E402

from agentmon_art import anim, sheet  # noqa: E402
from agentmon_art.azureimg import AzureImageClient, ImageRequest  # noqa: E402
from agentmon_art.pixelize import PixelizeConfig, pixelize  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
DEX = json.loads((ROOT / "shared" / "agentdex.json").read_text(encoding="utf-8"))
OUT = ROOT / "client" / "public" / "assets"

CHROMA = ("Isolated on a completely flat uniform chroma-key background of pure vivid magenta "
          "RGB(255,0,255) filling the entire background. No shadow, no ground, no floor, no props, "
          "no text, no logos, no watermark, no border.")

CREATURE_STYLE = (
    "Official Game Boy Advance era Pokemon-style monster artwork, 2D game asset. {desc}. "
    "Full body, {view}, standing, centered and filling the frame. "
    "Bold thick black outline, flat cel-shaded coloring with clean two-tone shading, vivid saturated colors, "
    "charming stylized creature proportions, appealing readable silhouette. " + CHROMA
)

CHAR_STYLE = (
    "Official Game Boy Advance era Pokemon-style trainer character artwork, 2D game asset. {desc}. "
    "Full body from head to feet, {view}, standing straight, centered, filling the frame. "
    "Bold thick black outline, flat cel-shaded anime coloring, vivid saturated colors, "
    "chibi-adjacent heroic proportions with a slightly large head. " + CHROMA
)

BUILDING_STYLE = (
    "Game Boy Advance Pokemon-style overworld building, 2D game asset seen in three-quarter top-down "
    "orthographic projection like a Pokemon town building. {desc}. "
    "Bold black outline, flat cel-shaded coloring, vivid saturated colors, clean readable shapes, "
    "the whole building visible and centered. " + CHROMA
)

BACKDROP_STYLE = (
    "Game Boy Advance Pokemon-style battle background, a wide horizontal scene. {desc}. "
    "Flat cel-shaded pixel-art-friendly coloring, vivid saturated retro palette, simple bold shapes, "
    "no characters, no creatures, no text, no UI. Viewed from a low battle camera angle."
)


# --------------------------------------------------------------------------- #
# Character / prop catalogue
# --------------------------------------------------------------------------- #
VIEWS = {
    "down": "front view facing the viewer directly",
    "up": "seen from directly behind, back view, the back of the head and body facing the viewer, face not visible",
    "side": "strict side profile view facing to the right",
}

CHARACTERS = {
    "player_m": "A young male AI engineer, age 15, short dark tousled hair, a white hoodie with a glowing cyan circuit trim, dark cargo shorts, cyan sneakers, a small utility backpack and AR glasses pushed up on his forehead",
    "player_f": "A young female AI engineer, age 15, shoulder-length teal hair in a short ponytail, a white and magenta techwear jacket with glowing trim, black leggings, magenta sneakers, a small utility backpack and AR glasses on her forehead",
    "rival": "A confident teenage AI engineer rival, spiky bright orange hair, a vivid orange and white bomber jacket with cyan circuit-pattern trim, light grey jeans, white high-top sneakers, arms crossed attitude, a tablet clipped to his belt, bright even daylight, high contrast, no dark shadows",
    "professor": "A friendly professor of robotics, mid-forties, short grey beard, round glasses, a long white lab coat over a navy turtleneck, holding a tablet, kind expression",
    "npc_engineer": "An adult AI engineer NPC, casual grey hoodie with a laptop-sticker pattern, jeans, sneakers, a lanyard badge around the neck, holding a coffee cup",
    "npc_technician": "A datacenter technician NPC, light sky-blue work coveralls with bright yellow reflective stripes, a white hard hat, tan gloves, a tool belt, bright even daylight, high contrast, no dark shadows",
    "npc_kid": "A short cheerful junior apprentice character, bright yellow t-shirt with a cartoon robot print, blue shorts, red cap worn backwards, sneakers, energetic bouncy stance",
    "npc_medic": "A robot-clinic nurse NPC, mint-green medical uniform with a white cross emblem, short pink hair, a headset, friendly welcoming pose",
    "npc_clerk": "A shop clerk NPC, crisp teal store uniform apron over a white shirt, neat brown hair, a handheld scanner device, cheerful pose",
    "npc_guard": "A datacenter security guard NPC, light steel-grey uniform jacket with bright cyan glowing shoulder trim and chest stripe, pale grey trousers, white helmet with a clear blue visor, arms at sides, standing at attention, bright even daylight, high contrast, no dark shadows",
    "mom": "A warm friendly mother character, late thirties, dark hair in a loose bun, a soft lavender cardigan over a cream blouse, a long teal skirt, gentle smile, hands clasped, bright even daylight, high contrast",
    "leader_volt": "A cheerful gym leader, a young woman with bright yellow twin-tail hair, an electric-blue technician jumpsuit with glowing yellow cable trim, welding goggles pushed up on her head, yellow boots, confident stance, bright even daylight, high contrast, no dark shadows",
    "leader_cryo": "A stoic gym leader, a tall man in a frost-white parka over a chrome exosuit with glowing pale-blue coolant lines, white boots, arms at his sides, calm imposing stance, bright even daylight, high contrast, no dark shadows",
    "leader_thermal": "An intense gym leader, a woman in a violet and white hooded techwear coat with orange glowing seams, a bright violet visor over her eyes, white boots, commanding stance, bright even daylight, high contrast, no dark shadows",
    "champion": "The world champion AI engineer, a poised adult in a long white and gold coat with glowing cyan data trim, silver hair swept back, a high collar, gold trimmed boots, regal confident stance, bright even daylight, high contrast, no dark shadows",
}

# Full-body trainer battle portraits (shown when a trainer battle starts)
TRAINERS = {
    "trainer_rival": ("A confident young AI engineer character with spiky bright orange hair, a vivid "
                      "orange and white bomber jacket with cyan circuit-pattern trim, light grey jeans, "
                      "white high-top sneakers, one arm extended forward holding a "
                      "glowing deployment capsule, dynamic heroic stance, bright even daylight, "
                      "high contrast, no dark shadows"),
    "trainer_gym1": ("A cheerful gym leader: a young woman with bright yellow twin-tail hair, an electric-"
                     "blue technician jumpsuit with glowing yellow cable trim, welding goggles on her head, "
                     "one hand sparking with static, dynamic confident pose"),
    "trainer_gym2": ("A stoic gym leader: a tall man in a heavy frost-white parka over a chrome exosuit "
                     "with glowing pale-blue coolant lines, breath fogging, arms folded, calm intimidating pose"),
    "trainer_gym3": ("An intense gym leader: a woman in a violet and white hooded techwear coat with "
                     "glowing orange seams and cascading holographic code projected around her, a bright "
                     "violet visor over her eyes, white boots, "
                     "one arm raised commanding, mysterious powerful pose, bright even daylight, "
                     "high contrast, no dark shadows"),
    "trainer_engineer": ("An adult AI engineer opponent in a light grey hoodie and blue jeans with a "
                         "lanyard badge, confidently holding up a glowing capsule, bright even daylight, "
                         "high contrast, no dark shadows"),
    "trainer_technician": ("A datacenter technician opponent in light sky-blue coveralls with bright "
                           "yellow safety stripes and a white hard hat, gripping a wrench, ready to "
                           "battle, bright even daylight, high contrast, no dark shadows"),
    "trainer_kid": ("An energetic short junior apprentice opponent, bright yellow robot-print t-shirt, "
                    "blue shorts, backwards red cap, excitedly holding out a capsule, bright even "
                    "daylight, high contrast, no dark shadows"),
    "trainer_guard": ("A datacenter security guard opponent in a light steel-grey uniform jacket with "
                      "bright cyan glowing shoulder trim and chest stripe, pale grey trousers, a white "
                      "helmet with a clear blue visor, one arm extended commandingly, bright even "
                      "daylight, high contrast, no dark shadows"),
}

BUILDINGS = {
    "house_small": ("A small futuristic two-storey suburban house with a curved white composite shell roof, "
                    "large cyan-tinted windows, a glowing blue doorway arch, solar panel tiles, a satellite "
                    "dish and a small rooftop garden"),
    "house_large": ("A larger futuristic family house with a stepped white and light-grey shell, a glowing "
                    "cyan door, wide panoramic windows, a rooftop wind turbine and antenna array, planters "
                    "with green shrubs"),
    "lab": ("A futuristic robotics research laboratory building, wide white curved facade with a huge glass "
            "atrium front, glowing blue trim lights, a rooftop dish array and a holographic sign panel above "
            "the entrance"),
    "clinic": ("A futuristic robot repair clinic building, white and mint-green rounded facade with a large "
               "glowing red cross emblem on the roof, sliding glass doors, a red-and-white striped canopy"),
    "shop": ("A futuristic robotics supply store building, teal-blue and white facade with a big display "
             "window full of glowing components, a blue awning and a bright sign panel over the sliding doors"),
    "gym_datacenter": ("An imposing futuristic datacenter gym building, a monolithic dark-slate and cobalt "
                       "windowless cube with rows of glowing blue vertical light strips, massive cooling "
                       "towers on the roof, huge armored entrance doors with a glowing badge emblem, "
                       "chain-link perimeter and warning stripes"),
    "tower_server": ("A tall narrow futuristic server tower structure, dark metal frame packed with glowing "
                     "blue server racks, cables, cooling fins and a beacon light at the top"),
    "sign_post": ("A futuristic holographic town signpost: a slim white metal post with a floating glowing "
                  "cyan holographic panel display"),
}

BACKDROPS = {
    "bg_grass": "A sunny grassy meadow with rolling green hills, scattered wildflowers and a bright blue sky with soft clouds",
    "bg_city": "A clean futuristic town street at midday with white curved buildings, glowing cyan trim and a wide plaza",
    "bg_cave": "A dim underground server hall with endless rows of dark racks glowing with blue and green status lights, cables overhead",
    "bg_datacenter": "The interior of a vast high-tech datacenter arena, polished dark floor, towering blue-lit server monoliths, cold industrial lighting",
    "bg_road": "A wide paved route between grassy verges with futuristic lamp posts, tall grass patches and distant hills at golden hour",
    "bg_night": "A grassy field at night under a deep indigo starry sky with a large moon and soft blue rim light",
}

TITLE_ART = ("Epic Game Boy Advance JRPG title screen key art, 2D illustration: a young AI engineer hero seen "
             "from behind on a grassy hilltop at sunrise, looking out over a futuristic town with a vast "
             "glowing blue datacenter on the horizon, a small white cube robot companion with a cyan screen "
             "face beside them, dramatic warm sunrise sky with god rays, bold cel-shaded anime coloring, "
             "vivid saturated colors, thick clean outlines, no text, no logo, no UI")


# --------------------------------------------------------------------------- #
# Request builders
# --------------------------------------------------------------------------- #
def creature_requests(only: set[str] | None = None) -> list[ImageRequest]:
    reqs: list[ImageRequest] = []
    for s in DEX["species"]:
        if only and s["key"] not in only:
            continue
        q = "high" if s.get("legendary") else "medium"
        reqs.append(ImageRequest(
            key=f"cr_{s['key']}_front",
            prompt=CREATURE_STYLE.format(desc=s["art"], view="front three-quarter view facing the viewer"),
            quality=q, meta={"species": s["key"], "side": "front"}))
        reqs.append(ImageRequest(
            key=f"cr_{s['key']}_back",
            prompt=CREATURE_STYLE.format(
                desc=s["art"],
                view="seen from directly behind, rear view, the back of the creature facing the viewer, "
                     "its face and front completely hidden"),
            quality=q, meta={"species": s["key"], "side": "back"}))
    return reqs


def character_requests() -> list[ImageRequest]:
    reqs: list[ImageRequest] = []
    for key, desc in CHARACTERS.items():
        for view_key, view in VIEWS.items():
            reqs.append(ImageRequest(
                key=f"ch_{key}_{view_key}",
                prompt=CHAR_STYLE.format(desc=desc, view=view),
                quality="medium", meta={"char": key, "view": view_key}))
    return reqs


def trainer_requests() -> list[ImageRequest]:
    return [
        ImageRequest(key=f"tr_{k}",
                     prompt=CHAR_STYLE.format(desc=d, view="front three-quarter view facing the viewer"),
                     quality="medium", meta={"trainer": k})
        for k, d in TRAINERS.items()
    ]


def building_requests() -> list[ImageRequest]:
    return [
        ImageRequest(key=f"bd_{k}", prompt=BUILDING_STYLE.format(desc=d), quality="medium", meta={"building": k})
        for k, d in BUILDINGS.items()
    ]


def backdrop_requests() -> list[ImageRequest]:
    return [
        ImageRequest(key=f"bg_{k}", prompt=BACKDROP_STYLE.format(desc=d), size="1536x1024",
                     quality="medium", meta={"backdrop": k})
        for k, d in BACKDROPS.items()
    ]


def title_requests() -> list[ImageRequest]:
    return [ImageRequest(key="ui_title", prompt=TITLE_ART, size="1536x1024", quality="high")]


# --------------------------------------------------------------------------- #
# Post-processing
# --------------------------------------------------------------------------- #
def cache_path(client: AzureImageClient, req: ImageRequest) -> Path | None:
    return client.cached(req)


def build_creatures(client: AzureImageClient, reqs: list[ImageRequest]) -> None:
    by_species: dict[str, dict[str, Path]] = {}
    for r in reqs:
        p = cache_path(client, r)
        if p:
            by_species.setdefault(r.meta["species"], {})[r.meta["side"]] = p

    icons: dict[str, Image.Image] = {}
    for s in DEX["species"]:
        got = by_species.get(s["key"])
        if not got or "front" not in got:
            continue
        cw, ch = s["cell"]["w"], s["cell"]["h"]
        cfg = PixelizeConfig(width=cw, height=ch, colors=15, align="bottom")

        front = pixelize(str(got["front"]), cfg)
        anims = anim.build_battle_set(front, airborne=s.get("airborne", False))
        sh, meta = sheet.pack_animations(anims)
        meta["species"] = s["key"]
        sheet.save(sh, meta, OUT / "creatures" / f"{s['key']}.png", OUT / "creatures" / f"{s['key']}.json")

        if "back" in got:
            back_cfg = PixelizeConfig(width=int(cw * 1.15), height=int(ch * 1.15), colors=15, align="bottom")
            back = pixelize(str(got["back"]), back_cfg)
            banims = {
                "idle": anim.idle_bob(back, 4, 2),
                "attack": anim.attack_lunge(back, 6, 12, 1),
                "hit": anim.hit_shake(back, 6, 3),
                "faint": anim.faint(back, 6),
                "appear": anim.appear(back, 5),
            }
            if s.get("airborne"):
                banims["idle"] = anim.hover(back, 6, 3)
            bsh, bmeta = sheet.pack_animations(banims)
            bmeta["species"] = s["key"]
            sheet.save(bsh, bmeta, OUT / "creatures" / f"{s['key']}_back.png",
                       OUT / "creatures" / f"{s['key']}_back.json")

        icons[s["key"]] = pixelize(str(got["front"]), PixelizeConfig(width=32, height=32, colors=11,
                                                                    align="bottom", outline=True))
        print(f"  sprite {s['key']} ({cw}x{ch})", flush=True)

    if icons:
        ordered = {s["key"]: icons[s["key"]] for s in DEX["species"] if s["key"] in icons}
        gsheet, gmeta = sheet.pack_grid(ordered, columns=8)
        sheet.save(gsheet, gmeta, OUT / "atlas" / "creature_icons.png", OUT / "atlas" / "creature_icons.json")
        print(f"  icons atlas {gsheet.size}", flush=True)


def build_characters(client: AzureImageClient, reqs: list[ImageRequest]) -> None:
    by_char: dict[str, dict[str, Path]] = {}
    for r in reqs:
        p = cache_path(client, r)
        if p:
            by_char.setdefault(r.meta["char"], {})[r.meta["view"]] = p

    for key, views in by_char.items():
        cfg = PixelizeConfig(width=20, height=28, colors=12, align="bottom", outline=True, despeckle=False)
        bases: dict[str, Image.Image] = {}
        if "down" in views:
            bases["down"] = pixelize(str(views["down"]), cfg)
        if "up" in views:
            bases["up"] = pixelize(str(views["up"]), cfg)
        if "side" in views:
            right = pixelize(str(views["side"]), cfg)
            bases["right"] = right
            bases["left"] = anim.turn_flip(right)
        if not bases:
            continue

        anims: dict[str, list[Image.Image]] = {}
        for d in ("down", "up", "left", "right"):
            base = bases.get(d) or next(iter(bases.values()))
            anims[f"walk_{d}"] = anim.walk_cycle(base, frames=4, leg_ratio=0.36, stride=1)
        sh, meta = sheet.pack_animations(anims)
        meta["character"] = key
        sheet.save(sh, meta, OUT / "chars" / f"{key}.png", OUT / "chars" / f"{key}.json")
        print(f"  character {key}", flush=True)


def build_trainers(client: AzureImageClient, reqs: list[ImageRequest]) -> None:
    for r in reqs:
        p = cache_path(client, r)
        if not p:
            continue
        img = pixelize(str(p), PixelizeConfig(width=72, height=80, colors=15, align="bottom"))
        out = OUT / "trainers" / f"{r.meta['trainer']}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        print(f"  trainer {r.meta['trainer']}", flush=True)


def build_buildings(client: AzureImageClient, reqs: list[ImageRequest]) -> None:
    sizes = {
        "house_small": (64, 64), "house_large": (80, 72), "lab": (96, 80),
        "clinic": (80, 72), "shop": (80, 72), "gym_datacenter": (112, 96),
        "tower_server": (48, 88), "sign_post": (16, 24),
    }
    for r in reqs:
        p = cache_path(client, r)
        if not p:
            continue
        k = r.meta["building"]
        w, h = sizes.get(k, (64, 64))
        img = pixelize(str(p), PixelizeConfig(width=w, height=h, colors=15, align="bottom",
                                              saturation=1.15, outline=True))
        out = OUT / "world" / f"{k}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        img.save(out)
        print(f"  building {k} ({w}x{h})", flush=True)


def build_backdrops(client: AzureImageClient, reqs: list[ImageRequest]) -> None:
    from agentmon_art.pixelize import to_gba_color
    import numpy as np

    for r in reqs:
        p = cache_path(client, r)
        if not p:
            continue
        img = Image.open(p).convert("RGB")
        # Battle backdrop occupies the top 2/3 of the 240x160 screen.
        img = img.resize((240, 112), Image.LANCZOS)
        q = img.quantize(colors=24, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
        arr = to_gba_color(np.array(q))
        out = OUT / "battle" / f"{r.meta['backdrop']}.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(arr, "RGB").save(out)
        print(f"  backdrop {r.meta['backdrop']}", flush=True)


def build_title(client: AzureImageClient, reqs: list[ImageRequest]) -> None:
    from agentmon_art.pixelize import to_gba_color
    import numpy as np

    for r in reqs:
        p = cache_path(client, r)
        if not p:
            continue
        img = Image.open(p).convert("RGB").resize((240, 160), Image.LANCZOS)
        q = img.quantize(colors=32, method=Image.MEDIANCUT, dither=Image.NONE).convert("RGB")
        out = OUT / "ui" / "title_bg.png"
        out.parent.mkdir(parents=True, exist_ok=True)
        Image.fromarray(to_gba_color(np.array(q)), "RGB").save(out)
        print("  title art", flush=True)


# --------------------------------------------------------------------------- #
GROUPS = {
    "creatures": (creature_requests, build_creatures),
    "characters": (character_requests, build_characters),
    "trainers": (trainer_requests, build_trainers),
    "buildings": (building_requests, build_buildings),
    "backdrops": (backdrop_requests, build_backdrops),
    "title": (title_requests, build_title),
}


def main() -> None:
    ap = argparse.ArgumentParser()
    for g in GROUPS:
        ap.add_argument(f"--{g}", action="store_true")
    ap.add_argument("--all", action="store_true")
    ap.add_argument("--rebuild", action="store_true", help="post-process cached art only, no API calls")
    ap.add_argument("--workers", type=int, default=4)
    ap.add_argument("--only", type=str, default="", help="comma separated species keys")
    args = ap.parse_args()

    chosen = [g for g in GROUPS if getattr(args, g)] or (list(GROUPS) if args.all or args.rebuild else [])
    if not chosen:
        ap.error("pick at least one group, or --all")

    client = AzureImageClient(max_workers=args.workers)
    only = {k.strip() for k in args.only.split(",") if k.strip()} or None

    for g in chosen:
        make_reqs, build = GROUPS[g]
        reqs = make_reqs(only) if g == "creatures" else make_reqs()
        print(f"== {g}: {len(reqs)} assets ==", flush=True)
        if not args.rebuild:
            client.generate_many(reqs)
        build(client, reqs)

    print("done.", flush=True)


if __name__ == "__main__":
    if not os.environ.get("AGENTMON_IMAGE_KEY"):
        print("AGENTMON_IMAGE_KEY not set", file=sys.stderr)
        sys.exit(2)
    main()
