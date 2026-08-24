# Agéntmon

A GBA-styled robot monster-collecting RPG. You play a young AI engineer exploring a
near-future world where the creatures are robots — Stackchan-likes, Reachy Minis,
humanoid factory units — the houses are composite-shelled and solar-tiled, and the
gyms are datacenters.

Live: **https://agentmon.azurewebsites.net**

Everything renders into a **240×160** internal framebuffer (the Game Boy Advance
resolution) and is integer-scaled to the viewport, with colours clamped to the
GBA's 15-bit palette. There is no game engine dependency — the loop, scene stack,
tilemap, sprite, bitmap-font, transition and chiptune-audio layers are all in
`client/src/engine`.

## Contents

| | |
|---|---|
| Species | 45 across 10 types (VOLT, METAL, DATA, THERMAL, CRYO, KINETIC, OPTIC, NEURAL, VIRAL, QUANTUM) — including 8 homages to real robots, one of them with 8 forms |
| Moves | 76 |
| Items | 33 |
| Maps | 26 — 4 towns/cities, 3 routes, a forest, interiors, and 3 datacenter gyms + the Citadel |
| Trainer classes | 12 |
| Languages | 5 — English, Español, Français, Italiano, 日本語 |
| Ambience | 4 weathers (rain, storm, fog, ash) + a 4-phase day/night cycle on the real clock |
| Battle intro | Animated VS card on every trainer encounter |

## Repository layout

```
client/          Vite + TypeScript game (zero runtime dependencies)
  src/engine/    Loop, scenes, renderer, input, tilemap, sprites, font, audio, procedural tiles
  src/game/      Scenes (title/intro/overworld/battle/menus/shop/evolution), data, battle engine
  src/net/       API client + offline localStorage save fallback
  tools/smoke.mjs  Headless verification harness (see below)
server/          Node 22 + Express API; also serves the built client
  src/db/        Store abstraction with Cosmos DB and in-memory implementations
shared/          agentdex.json — the species/move/type database, shared by both sides
tools/           Python art pipeline (AI concept art -> GBA sprite sheets)
  agentmon_art/  azureimg (Azure image API), pixelize, anim (the animation tool),
                 chibi (procedural overworld sprites), char_styles, sheet (packer)
infra/           Bicep template + deploy script
```

## Running locally

```powershell
npm install
npm run dev            # client on :5173, API on :8080
```

The client dev server proxies `/api` to the backend (override with `AGENTMON_API`).
Without `COSMOS_ENDPOINT` the server uses an in-memory store, and the client falls
back to `localStorage` saves when logged out — so the whole game is playable with
no cloud dependencies at all.

```powershell
npm run typecheck      # tsc --noEmit for client and server
npm test               # vitest data-integrity suite
npm run build          # client -> client/dist, server -> server/dist
```

## The art pipeline

All character, creature, building, backdrop and title art starts as AI concept art
from an Azure OpenAI **gpt-image-2** deployment and is then converted into
GBA-authentic pixel art locally. Terrain and furniture tiles are *not* AI art —
they are authored procedurally in `client/src/engine/tilegen.ts` so they tile
seamlessly and stay crisp at 1×.

```powershell
$env:AGENTMON_IMAGE_ENDPOINT = 'https://<resource>.cognitiveservices.azure.com'
$env:AGENTMON_IMAGE_DEPLOYMENT = 'gpt-image-2-1'
$env:AGENTMON_IMAGE_KEY = (az cognitiveservices account keys list -n <resource> -g <rg> --query key1 -o tsv)

python tools\generate_assets.py --all --workers 3
python tools\generate_assets.py --characters --only rival,mom     # subset
python tools\generate_assets.py --creatures --rebuild             # re-post-process cached art, no API calls
```

Stages:

1. **`azureimg`** — calls the image deployment, with an on-disk cache in `tools/.cache`
   keyed by `sha256(prompt + size + quality + deployment)`. Editing a prompt is what
   invalidates the cache, so re-running is free until you actually change something.
   The API has no transparent-background mode here, so prompts ask for a magenta
   RGB(255,0,255) backdrop which the pipeline chroma-keys out.
2. **`pixelize`** — chroma-key, trim, fit to the target cell, nearest-neighbour
   downsample, colour-quantize, clamp every channel to the GBA's 5-bit-per-channel
   colour space, add a darkened outline, then despeckle.
3. **`anim`** — the animation tool. It has no external animation input: it derives
   every frame from a single still by compositing geometric transforms —
   `idle_bob` (translate + vertical squash about the feet), `hover`, `attack_lunge`,
   `hit_shake`, `faint`, `appear`, `charge_glow` (additive tint on the brightest
   pixels), `led_cycle` (phase-shifts pixels above a luminance threshold so status
   LEDs blink), and `walk_cycle`, which slices the sprite at a configurable leg
   ratio and shears only the lower rows so the legs stride while the torso stays put.
4. **`sheet`** — packs the frames into a strip/grid PNG plus a JSON atlas
   (`{ frameWidth, frameHeight, animations: { name: { row, frames, fps } } }`).

Character sheets come out as 80×112 = 4 columns × 4 rows of 20×28 cells, one row
per facing (`walk_down`, `walk_up`, `walk_left`, `walk_right`).

### Why the chroma key needs a second pass

`gpt-image-2` is asked for a subject on a flat magenta backdrop, and `keyout()`
strips it with a flood fill seeded from the image border. That handles the
backdrop *around* the subject, but not backdrop *enclosed* by it — the gap
between a robot's legs, the hole through a ring, the slot inside a claw. Those
pockets are never reached by a border-seeded fill, so they survived as opaque
magenta blobs stamped across the sprite.

The obvious fix — key out every magenta pixel globally — is wrong here, because
several species are *designed* magenta: ROOTKRAKEN's eye, QUBITTO's core,
ENTANGL's glow. A global key deletes them.

The separator that does work is measured, not assumed. Label the leftover
pockets as connected components, then compare each one's **mean colour distance
to the backdrop reference** (the median of a 3px border ring, typically around
`(246, 2, 249)` rather than a clean `#FF00FF`). Across the whole dex:

| component kind    | mean distance to backdrop |
| ----------------- | ------------------------- |
| leftover backdrop | 4 – 13                    |
| designed magenta  | 45 – 78                   |

That is a wide, unambiguous margin, so `keyout()` removes only components that
are both large (`>= max(24, 0.0002 · h · w)` px) and closer than `22.0`. Per
component *standard deviation* was also tried and rejected — 6–8 vs 18–20, which
overlaps and misclassifies.

One numpy trap worth recording: computing that distance as
`(arr.astype(np.int16) - bg) ** 2` overflows, because 255² = 65025 exceeds
int16's range, and the resulting negatives turn into NaN under `sqrt`. Cast to
float64. `pixelize.py` is safe because `np.median` already returns float64 and
promotes the subtraction, but any ad-hoc diagnostic must cast explicitly.

Re-running the key costs nothing: `tools/.cache` holds every generated PNG, so
`python tools/generate_assets.py --creatures --trainers --buildings --backdrops
--title` re-post-processes the cached art without calling Azure at all.

### Why a brand accent disappears (`keep_colors`)

`quantize()` median-cuts the sprite to 15 colours. A detail that covers a handful
of pixels — Unitree's visor bar, NEO's ear ring, Figure 03's pixel eyes — never
wins a palette slot, so a render that is perfect at 1024 px comes out blank at
68 px. **When a sprite looks wrong, open `tools/.cache/images/<key>.*.png` first**
to tell a bad render from a bad downscale.

The fix is `PixelizeConfig.keep_colors`, driven by a per-species `accents=` field
in `tools/newmons.py`. Three rules, all learned the hard way:

- Beacon pixels must be excluded from the median-cut **sample**, not merely
  repainted afterwards, or the accent hue biases (and is averaged into) a
  neighbouring slot. The palette budget shrinks by the number of reserved
  colours, and the beacons are painted back GBA-snapped after quantization.
- `keep_tolerance` is a **sum-of-channels** distance (`tolerance × 3`). 62 was
  too loose — NEO's beige bodysuit matched pure white. **34 is the default.**
- A single bright stop is not enough for a thin feature: LANCZOS downscaling
  blends it toward the background, so give glows **two stops** (bright +
  falloff), e.g. Unitree `(0x48,0xC8,0xF8)` + `(0x18,0x88,0xC0)`.

`connect_antennae()` has the same problem for 1 px stalks and must run on
**every** view, not just the COVER pose — hence the per-species `antennae=True`.

### Two more sprite invariants

**Realistic human proportions do not survive 68 px.** A 1:7.5 humanoid puts the
head at ~9 px and the brand cue at 1 px. Humanoid prompts therefore ask for
*stylised creature proportions, the head deliberately oversized at roughly one
quarter of the total body height* — which is what GBA-era Pokémon actually do.
It was decisive for NEO and Figure 03 and cost nothing in recognisability.

**A featureless silhouette needs an explicit `art_back`.** The generic "seen
from directly behind" view string applied to a smooth barrel — Reachy Mini —
produces a blob indistinguishable from its shut COVER pose. That looked like a
sprite-lookup bug and was not one: `sheetFor()` only swaps to `:cover` when
`c.covered` is true. `REACHY_BACK` describes the head held upright above an open
neck gap so the two poses read differently.

### Why the overworld cast is drawn in code, not generated

The 15 walking characters go through a different path — `agentmon_art/chibi.py`,
a procedural sprite generator — and this was the single biggest art correction of
the project.

Running the AI concept art through the pipeline above produced sheets with
**105–107 colours** and no readable silhouette. The cause is proportion, not
resolution: a realistically proportioned figure squeezed into a 20×28 cell gets a
**~4 pixel head**, which cannot carry a face. Handheld sprites of this era look
the way they do because they are *authored* chibi — head roughly 45% of the total
figure, ~15 flat colours, a hard 1px keyline all the way round. Those are
decisions made while drawing; no downscaler can recover them from a photorealistic
source.

So `chibi.py` draws each character from a `ChibiStyle` — skin, hair, top, bottom,
shoes, trim, plus `hair_style` (short/spiky/long/ponytail/bun/bald), `headgear`
(cap/hardhat/helmet/hood), `accessory` (glasses/visor/goggles), and the flags
`coat`, `backpack`, `beard`, `height` and `extras` (apron/collar/badge). From one
style it emits all 16 frames: front, back and profile views, each with a 4-frame
walk cycle. The gait alternates a planted leg (extended 1px) against a trailing
leg (lifted 1px) and lifts the upper body 1px on the step frames — that bob is
what actually sells walking at this size. The profile view uses a scissor gait
and `walk_left` is a horizontal flip of `walk_right`.

The 15 styles live in `agentmon_art/char_styles.py` and are matched to the same
written descriptions the battle portraits are generated from, so the overworld
sprite and the portrait agree. Result: **15–20 colours per sheet** instead of 105,
and all 15 sheets together weigh 25 KB.

The lesson generalises — it is also why the terrain tiles are authored in
`client/src/engine/tilegen.ts` rather than generated. AI art earns its place where
detail is the point (creatures, buildings, portraits, backdrops, title art) and
loses to hand-authored pixels wherever a tiny cell has to stay legible.

A practical note that cost a lot of iterations on the generated art: sprites read
badly on the dark datacenter backdrops unless the prompt asks for light, saturated
garment colours *and* explicitly says `bright even daylight, high contrast, no
dark shadows`. Every character prompt in `tools/generate_assets.py` is written
that way and the resulting sheets average a luminance of ~105–160.

## The homage roster (forms and COVER)

Dex numbers **38–45** are portraits of real robots, named after the machines they
honour: `stackchan`, `reachymini`, `optimus`, `spot` → `spotarm` (level 36),
`figure03`, `unitree`, `neo`. Their design lives in `tools/newmons.py`
(`NEW_MOVES`, `REACHY_BODY`, `SPECIES`); run `python tools\build_dex.py` from the
repo root after any edit, then `python tools\ship_newmons.py` to stage the sheets.

Two rules governed the integration and must hold for any future addition:

- **Species ids are appended, never inserted.** They are baked into saved games,
  so the homage roster sits *after* the legendaries even though it reads oddly in
  the dex order.
- **Dex entries stay ≤ ~120 characters.** `menu.ts` wraps the entry at 124 px and
  slices to 5 lines (≈100 chars) on the summary page and at 216 px / 4 lines
  (≈144) in the dex page; `starter.ts` allows 3 lines at 220 px. A longer entry is
  not an error, it just silently loses its last sentence.

### Forms

`REACHYMINI` is the only species with `forms` populated, and the only one that
learns `COVER`. Colour forms (`snow` `sky` `lime` `sun` `ember`) share types and
learnset and differ only by shell tint; shape forms (`hallow` `zebra` `hf`) add a
second type and their own moves. `rollForm()` gives a wild encounter a 12 % chance
of a shape form, the remainder split evenly across colours.

`agentSpriteKey()` **falls back to the bare species key** whenever a form has no
tint of its own (`snow` *is* the base render) or is unknown. That is what makes a
legacy save, or a hand-edited form key, incapable of 404-ing a sprite sheet.

### COVER

`alloy`/status, power 0, **accuracy 100**, PP 10, priority 4, target self, effect
`shell_cover`. It blocks every *damaging* move for one turn, lets status moves
through, heals `floor(maxHp / 10)`, and — deliberately, at the player's request —
**does not prevent a wild unit from being caught**.

Accuracy is 100 rather than a sentinel because `every move is internally
consistent` caps it there, and status moves skip the accuracy gate anyway
(`m.accuracy < 100 || m.category !== 'status'`).

Two independent brakes stop it becoming a stall lock: a Protect-style ladder
(`odds = 1 / 2 ** coverStreak`) and the PP pool.

**Testing gotcha:** `covered` is cleared inside `finishTurn()`, so it is *always*
false once `takeTurn()` returns. To observe the shell up, use
`openTurn(forcedFoeAction)` then `closeTurn(playerAction)`, or set
`playerC.covered` by hand for a frame.

Verify with `client/tools/verify-newmons.mjs` (22 checks: every new sheet resolves
front/back/cover through the live loader, a real battle starts, the shell blocks
damage and the shut pose is the one actually drawn).

## Languages

Playable in **EN / ES / FR / IT / JA**, picked from the title screen or from
OPTIONS mid-game. `client/src/game/i18n.ts` is the runtime;
`localStorage['agentmon.lang']` is the source of truth, because the selector sits
on the title screen *before* any save loads. **English source strings are the
translation keys**, so an unknown key falls through to English and can never
crash. Species names, character names and place names are never translated.

Three traps, each of which cost a round-trip:

- **Eager evaluation.** `maps.ts`, `interiors.ts`, `items.ts`, `trainers.ts` and
  `agent.ts` build `export const X = {...}` literals at import time, so a `t()`
  inside one freezes the boot language forever. Data stays English; localisation
  happens at the accessor (`moveName()`, `itemName()`, `genusOf()`, `typeName()`…)
  or the draw call. Never translate twice — `upper(typeName(x))`, never
  `tUpper(typeName(x))`.
- **The extractor's blind spot.** `i18n-scan.mjs` reads `t('…')` literals out of
  the source and cannot see a table indexed at runtime (`t(STAT_NAME[stat])`).
  Any new module-level string table must be exported through an `xxxStrings()`
  function folded into `dataStrings()` in `main.ts`, or it silently ships in
  English.
- **Orthography.** The font composes accents over the base glyph, so the advance
  stays 6 px and a diacritic is *free* — but the translation pass still shipped
  `tres`/`ete` (fr) and `E'`/`piu'` (it). `npm run i18n:accents` is the permanent
  gate and must print `ACCENTS OK`. Its Italian pattern is case-insensitive (or
  `Puo'` escapes) and `po'` is deliberately allowed, being correct Italian.

`npm run i18n:check` proves every key exists in every catalogue with placeholders
intact; `npm run verify:i18n` boots the game in all five languages and asserts
glyph coverage, label widths and an empty `missingKeys`. Both need
`npm run preview`.

## Move effects (do not regress)

Before this layer existed, all 76 moves rendered identically: attack pose, screen
shake, hit pose — only the SFX differed. Every move now resolves to a
`MoveFxSpec` and plays a signature effect.

- `client/src/engine/fx.ts` — reusable `ParticleField` plus the drawing
  primitives (`drawBeam`, `boltPath`/`strokePath`, `drawShockRing`, `drawSlash`,
  `drawTint`). No game knowledge, so the overworld can share it.
- `client/src/game/battle/movefx.ts` — the 17 `FX_KINDS`, the
  `MOVE_FX_OVERRIDE` table, `resolveMoveFx()` and the `MoveFxPlayer` timeline.

Four rules hold:

**Colours come from the MOVE's type, not the user's**, so a VOLT move always
reads as VOLT no matter who fires it.

**`resolveMoveFx` is total.** A move can never end up without an effect. It also
self-corrects a damaging move that was mis-tagged as a self-kind — `solar_charge`
(power 70, effect `spa_up`) was mapped to `buff`, which forced `target: 'self'`
and left the enemy with no visual at all. The guard is structural, not a
one-entry fix, because "damages *and* buffs" is a whole class of move.

**Particles are opaque and rimmed, never additive.** This is the most
GBA-authentic decision in the file and it was learned the hard way: additive
1 px highlights over a bright sky blow out to invisible white, which is what
`shards` and `spiral` originally did. Real hardware sprites were opaque and
outlined, so every particle carries `outline: darken(spec.dark)` drawn one pixel
fatter behind the body. Additive is reserved for the beam/bolt/flash primitives,
which are wide enough to read on their own. All coordinates are `Math.round`ed
and alpha is quantised to eighths — a subpixel particle or a smooth fade betrays
the GBA look instantly.

**The scene waits on `contacted`, not `done`**, so the target's damage reaction
lands on the impact frame rather than after the debris settles. Debris keeps
drawing over the following `damage` event because the field updates
unconditionally.

Offset ownership is the subtle risk: `updateFx()` writes `offX`/`offY` on the
attacker every frame, and `faint`/`withdraw`/`sendOut` own those same fields.
All three call `releaseFx(side)` first, and `updateFx` zeroes them the moment the
effect finishes.

```powershell
cd client
npm run preview                 # in another shell
npm run verify:fx               # -> "FX OK"
npm run shot:fx                 # filmstrips into tools/shots/fx/
```

`verify:fx` drives ten real battles and measures the pixels: every move must
spawn a kind, particles and an impact; the effect must change the battlefield
against the calm baseline; and **no two moves may produce the same frame** — the
original "everything looks the same" bug, stated as a measurement.

## Overworld particles (do not regress)

`OverworldScene` owns a small `ParticleField` (limit 90) reusing the battle FX
engine. `footFx()` runs on every step, from the *step-landed* branch of
`updateActors()` — which must capture `a.jumping` **before** it is cleared, or a
ledge landing is indistinguishable from a walk.

- **Tall grass** flicks two symmetric fans of pale blades. They are deliberately
  *paler* than the tile: a mid-green fleck on mid-green grass is invisible, the
  exact mistake the battle FX made with additive highlights. Same rimmed-opaque
  rule as `fx.ts`.
- **Dust** only comes off loose ground (`TileMap.isDusty` → `path`/`sand` with
  nothing drawn over it) or off a ledge landing anywhere. Puffing dust on a lawn
  or a tiled plaza is what makes an engine look generic.
- **Interiors spawn nothing.** That is a feature, not an omission.

The field is drawn **under** the depth-sorted actors, inside a
`translate(-camX, -camY)` so it lives in world space. Drawing it over the actors
buries the sprite's legs under a slab of blades and the character stops reading.
`loadMap()` calls `fx.clear()` so debris never survives a map change.

## Region map

`scenes/regionmap.ts`, reachable from the pause menu once you hold a badge.

**It is hand-authored, not projected from `maps.ts`.** Tile grids are the wrong
shape and scale to auto-layout; the result looks like a debug view. What *is*
derived is the state: a node is charted once you have stood in it.

**Visits ride the existing flag bag** (`flag:visit:<nodeId>`, set by
`markVisited()` from `loadMap`) rather than a new `SaveData` field, so old saves
stay loadable and cloud sync needs no migration.

**The coastline is a boolean cell mask, never overlapping rectangles** — rects
leak their own lit top edge into the middle of the continent. `SHAPE` paints the
lobes, then `stamp()` widens the mask around every node and along every road, and
only then is it rendered as shallow-water halo → land → lit/dark edges. The thin
isthmuses that give the region a waist come from the road corridors, which is why
`SHAPE` is deliberately sparse.

**`legPath()` is shared** between the drawn road and the land corridor beneath
it. Two separate implementations of the same elbow is how you end up with a road
running through the sea.

`regionStrings()` must stay folded into `dataStrings()` in `main.ts` or the node
descriptions silently ship in English.

```powershell
cd client
npm run preview                 # in another shell
npm run verify:overworld        # -> "OVERWORLD FX OK"
```

The harness asserts grass spawns, path dust spawns, **lawn and interior spawn
zero**, that the map opens on the town you are standing in, that the cursor
walks, and that B closes it. Screenshots land in `tools/shots/overworld/`.

## Weather and time of day (do not regress)

`world/weather.ts` and `world/daynight.ts`. Both are **purely cosmetic**: they
never touch damage, accuracy or encounter tables. Those are balanced and covered
by 79 tests, and a visual pass has no business moving them.

Four weathers, assigned per map in `maps.ts` (`MapDef.weather`) and escalating
toward the volcanic endgame: `route2` rain, `cachewood` fog, `route3` storm,
`terraflux_city` ash. The first four maps stay clear on purpose so the opening
hours read clean.

**Weather is screen space, never world space.** Rain anchored to the world and
drifting with the camera pan is the fastest way to make a top-down game look
like a modern engine wearing a GBA costume. (Contrast the footstep particles
above, which *are* world space.)

**It does not reuse `ParticleField`.** Weather particles wrap forever;
`ParticleField.update()` splices on `life <= 0`, so reusing it would mean
constant alloc/free. Fixed-size arrays with wrap is both faster and what the
hardware did.

**Rain streaks are stair-stepped `fillRect`s, not stroked lines.** A smooth
antialiased canvas diagonal reads as foreign — a real streak sprite was aliased.
Stepping by 2 halves the draw calls. Drops spawn wide of the screen because a
slanted sheet leaves a bare wedge on the upwind edge otherwise, and `hitY` is
randomised over the screen height so splashes happen at varying depths.

**Lightning is a double flash, not a fade** (`boltAlpha()`): a single fade reads
as a rendering glitch.

**Fog is one baked seamless 128×64 tile drawn twice** at different speeds and
offsets. Drawing blobs live every frame re-randomises them and shimmers
("boiling") instead of drifting. Built lazily and guarded on `typeof document`
so vitest never touches `document.createElement`.

**Embers glow, they do not get a dark rim.** The dark-rim trick the battle
particles use is wrong at 1–2 px: the rim swallows the core and the ember lands
on screen as a speck of dirt. A dim halo of its own hue plus a full-bright core
reads as heat.

**Dusk and night MULTIPLY; morning is a normal wash.** An alpha wash toward dark
blue lifts the blacks and desaturates, so night came out as a murky teal
afternoon. Multiplying scales each channel, which is what a hardware palette
swap did — hue and contrast survive. Morning is the exception because it has to
*brighten* the scene warm, and multiply can only darken. **Day is `null`** —
noon must be the untouched palette the art was drawn for.

The phase follows the player's real clock (GSC/DPP style). `?time=night` (or
`morning`/`day`/`dusk`) pins it, which is also how the harness screenshots every
phase deterministically.

**Interiors get neither.** They carry their own `tint` mood and a datacenter does
not care what hour it is.

**Draw order in `OverworldScene.render()` is load-bearing:** map → actors →
overhead → `renderTop` → `def.tint` → `drawDayTint` (outdoor only) → `weather` →
HUD. Weather *after* the wash means rain still glints at night and the lightning
punches through.

**In battle, both are clipped to `SCREEN_H - TEXTBOX_H - 2` and sit outside the
shake transform.** `drawBackdrop` paints an opaque white strip for the textbox,
which unclipped weather would tint; and a rain sheet that jolts on every hit
reads as a broken layer. Battles inherit the overworld's weather and phase
through `BattlePayload`, fed by `OverworldScene.ambience()`.

```powershell
cd client
npm run preview                 # in another shell
npm run verify:ambience         # -> "AMBIENCE OK"
```

The harness asserts each route builds the right weather, that it **moves** (in
game pixels, not percent — 40 embers and a full-screen fog bank have wildly
different coverage), that it is visible when toggled off, that all four are
distinct, that a weather set on an interior is still dropped, that `dayTint`
returns null at midday, that night is darker and dusk warmer than day, that
interiors never drift, and that a battle started from stormy Route 3 at night
inherits both. Screenshots land in `tools/shots/ambience/`.

## Trainer VS card (do not regress)

`client/src/game/scenes/vsintro.ts` is the Emerald/HGSS beat that plays between
"a trainer spotted you" and the battle transition: two diagonal panels slam
across, the opponent's portrait slides in and settles, a chunky **VS** badge
punches in with a white impact flash, and a gold-ruled name plate rises.

Three decisions that must survive any refactor:

- **It is an overlay owned by `OverworldScene`, not a pushed scene.** A scene
  would have to interleave with `transitions.out/cover/in`, and this project has
  already paid for that mistake once — the black-screen-on-battle bug came from
  a curtain nobody lifted. The card never touches the curtain; `OverworldScene`
  holds it in `this.vs` and draws it as the last line of `render()`.
- **It drives itself off `requestAnimationFrame`, not `update()`.** `Loop` keeps
  rendering when `update()` throws (by design), so a counter ticked from
  `update()` would freeze and the awaiting caller would hang forever behind a
  permanent VS screen. `runVsIntro()` also carries a 4000 ms wall-clock deadline
  so a throttled or backgrounded tab can never strand the battle.
- **Opponent only, exactly like the real games.** There is no player battle
  portrait — only a 16 px overworld walk sheet — and pairing a 2×-upscaled sprite
  against a native-resolution portrait is the classic amateur tell.

Both trainer-battle entry points are wired: `runTrainerBattle()` and the lab
rival fight, which builds its payload inline and so is easy to forget.

Two pixel-level rules the harness enforces:

- **The base panel overshoots the screen by the skew on both sides.** A diagonal
  the exact width of the screen leaves a triangle of live overworld alive in the
  top-right corner. The lighter accent band deliberately does *not* overshoot —
  push it out too and both of its cuts leave the frame, turning the wedge into a
  flat horizontal bar.
- **The badge scale is quantised to whole pixels** (`Math.max(2, Math.round(4 -
  easeOut(t) * 2))`) so every intermediate frame is still a legal pixel-art frame
  rather than a resampled blur, and it settles at 2× — 1× reads as a caption.

No new i18n keys: trainer names are never translated, and **VS** is a
hand-authored bitmap glyph, not text.

Verify with `npm run verify:vs`. Part A steps `frame` by hand so every
screenshot lands on a known beat, and asserts the card covers ≥95% of the map,
is darker than it, changes between beats, and gains gold pixels as the badge and
plate light up — **counting warm pixels, not mean red**, because the mean red
*falls* as the dark panels swallow the sunlit map. Part B walks into a real gym
trainer and proves the card both plays and **tears down**; a stuck overlay would
be the curtain bug wearing a new hat. Screenshots land in `tools/shots/vs/`.

## Verification harness

`client/tools/smoke.mjs` drives the real game in headless Chromium and screenshots
the **internal 240×160 buffer** (not the DOM), which makes visual regressions
obvious. It is how every screen in this project was checked.

```powershell
cd client
$env:PRELUDE = 'grass'     # newgame | town | lab | grass
$env:STEPS   = '[{"walk":["up",3]},{"until":"BattleScene","key":"up","max":400},{"shot":"wild"}]'
node tools\smoke.mjs        # $env:URL to target a deployed site
```

Steps run in a fixed order within one object: `reload` → `untilEval` → `wander` →
`walk` → `pos` → `until`/`key` → `hold` → `type` → `wait` → `eval` → `shot`.
`eval` runs against `window.agentmon`, which exposes the game, the save layer and
the agent module, so you can teleport, hand yourself a party, or push a scene
directly:

```js
() => { const s = window.agentmon.scenes.top; s.loadMap('gym_volt', 8, 14, 'left'); s.updateCamera(true); }
```

Scene identity comes from `constructor.name`, so `vite.config.ts` sets
`esbuild.keepNames` to keep the harness (and production stack traces) working
against minified builds.

`client/tools/glyphcheck.mjs` is the second half of the harness. The 5×7 bitmap
font renders a character by looking it up in a table, and a character that is not
in that table **draws nothing at all** — no box, no warning. A missing symbol can
therefore ship unnoticed, which is exactly what happened to `¥` across seven call
sites.

The character set is deliberately *not* hand-maintained, because a hand-written
list has the same blind spot as the font table: it only contains what someone
remembered to add. `glyphcheck` instead derives its set from the source — the
printable ASCII range, plus every non-ASCII character and every `\uXXXX` escape
found under `client/src` (excluding `src/game/ui`, the DOM auth overlay, which is
styled HTML rather than canvas text). Each one is rendered through the real font
onto an offscreen canvas, and the run fails if any produces zero pixels.

Making that change immediately surfaced four glyphs that had been silently
invisible: `◀` (so the options screen read "Adjust with&nbsp;&nbsp;&nbsp;B to
close"), `▲`, and `○`/`●` — the AGÉNTDEX seen/caught markers, which meant the dex
had been shipping with a permanently blank status column.

```powershell
cd client
node tools\glyphcheck.mjs      # -> "all 96 glyphs render (17 discovered in source)"
```

## Controls

| Key | Action |
|---|---|
| Arrows | Move / navigate |
| `Enter` `Space` `Z` | A — confirm, talk |
| `Esc` `Backspace` `X` | B — cancel |
| `Shift` | START — main menu (save is in here, available anywhere in the field) |
| `Tab` | SELECT |
| `Q` `E` | L / R |

## Team storage

Every REPAIR BAY has a **storage terminal** beside the supply shelving. It is this
world's PC: `WITHDRAW` pulls a stored agent back into the team, `DEPOSIT` sends one
to a storage bank.

Two rules keep the player from soft-locking themselves, and both are enforced in
`StorageScene` rather than left to the caller:

- You can never deposit your way down to zero *working* agents — the check is
  "is anything else still standing", not simply "is the party bigger than one",
  so a party of one healthy and one fainted agent still refuses the healthy one.
- Storage banks are pre-allocated by `newSave` and topped up on load, and
  `addAgent` in `client/src/game/state.ts` appends one rather than releasing an
  overflow capture — `BOX_COUNT × BOX_SIZE` = 240 slots. Before this existed, a
  full party meant every capture was announced as "transferred to STORAGE" and
  then unreachable forever.

## Accounts and cloud saves

Register or log in from the title screen and the game keeps three save slots in
Cosmos DB, written from the in-game SAVE menu exactly like the classic games.
Logged-out play still works and persists to `localStorage`, and those local saves
are uploaded on the next login.

- Passwords are hashed with `scrypt` (per-user salt, constant-time compare).
- Sessions use a JWT delivered as an `HttpOnly` cookie, with a bearer fallback.
- The API is rate-limited, `helmet`-hardened, and validates every payload with `zod`.

`docs/api.md` documents the endpoints.

## Deployment

`.github/workflows/deploy.yml` builds the client and server on every push to
`main`, runs the test suite, prunes to production dependencies, zips the result and
publishes it to Azure App Service. It needs one repository variable and one secret:

```powershell
gh variable set AZURE_WEBAPP_NAME --body '<web app name>'
az webapp deployment list-publishing-profiles -n <web app name> -g <rg> --xml |
  gh secret set AZURE_WEBAPP_PUBLISH_PROFILE
```

Infrastructure is in `infra/main.bicep` (`infra/deploy.ps1` wraps it):

- Cosmos DB serverless account, `agentmon` database, `users` (pk `/id`) and
  `saves` (pk `/userId`) containers
- Linux B1 App Service Plan + Web App on Node 22 LTS, plus Application Insights
- A VNet with a delegated app subnet and a private-endpoint subnet, a private
  endpoint and private DNS zone for Cosmos, and regional VNet integration with
  `vnetRouteAllEnabled` on the Web App

The Cosmos account has **public network access disabled and local (key) auth
disabled**. The Web App reaches it over the private endpoint and authenticates
with its system-assigned managed identity, which holds the Cosmos DB Built-in
Data Contributor role. There are no database keys anywhere — in app settings, in
CI, or in this repository. Because that data-plane role grants no control-plane
rights, `CosmosStore` tries `createIfNotExists` first and, on a 403, binds to the
containers the Bicep template already created.

### The one credential that remains

`azure/webapps-deploy` with a publish profile requires **SCM basic auth to stay
enabled** on the Web App. That single secret is the weakest link in an otherwise
keyless design, and it is worth being explicit about rather than quietly leaving
it on:

- It is scoped to deployment only; it grants no access to Cosmos, which is
  reachable solely over the private endpoint via managed identity.
- Rotate it with `az webapp deployment list-publishing-profiles ... | gh secret set`
  (the same command used to set it) whenever a collaborator leaves.

To remove it entirely, swap the publish profile for OIDC federated credentials:
register an app, add a federated credential for
`repo:<owner>/agentmon:ref:refs/heads/main`, grant it Website Contributor on the
resource group, replace the publish-profile input with `azure/login@v2` +
`id-token: write` permission, and then set
`az resource update --set properties.allow=false` on the site's
`basicPublishingCredentialsPolicies/scm`. That trades one stored secret for a
short-lived token minted per run.
