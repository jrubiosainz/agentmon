# Agéntmon

A GBA-styled robot monster-collecting RPG. You play a young AI engineer exploring a
near-future world where the creatures are robots — Stackchan-likes, Reachy Minis,
humanoid factory units — the houses are composite-shelled and solar-tiled, and the
gyms are datacenters.

Live: **https://agentmon-web-vli2qcm6niw26.azurewebsites.net**

Everything renders into a **240×160** internal framebuffer (the Game Boy Advance
resolution) and is integer-scaled to the viewport, with colours clamped to the
GBA's 15-bit palette. There is no game engine dependency — the loop, scene stack,
tilemap, sprite, bitmap-font, transition and chiptune-audio layers are all in
`client/src/engine`.

## Contents

| | |
|---|---|
| Species | 37 across 10 types (VOLT, METAL, DATA, THERMAL, CRYO, KINETIC, OPTIC, NEURAL, VIRAL, QUANTUM) |
| Moves | 65 |
| Items | 33 |
| Maps | 26 — 4 towns/cities, 3 routes, a forest, interiors, and 3 datacenter gyms + the Citadel |
| Trainer classes | 12 |

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

## Controls

| Key | Action |
|---|---|
| Arrows | Move / navigate |
| `Enter` `Space` `Z` | A — confirm, talk |
| `Esc` `Backspace` `X` | B — cancel |
| `Shift` | START — main menu (save is in here, available anywhere in the field) |
| `Tab` | SELECT |
| `Q` `E` | L / R |

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
