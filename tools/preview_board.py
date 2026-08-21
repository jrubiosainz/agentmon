"""Build the HTML approval board for the new Agentmon.

Reads the packed sheets in tools/.preview/creatures and the design manifest in
newmons.py, and emits tools/.preview/index.html - every creature animated at 4x
next to its full stat block, so the designs can be reviewed before they are
folded into the dex.
"""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import newmons  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "tools" / ".preview"
SPRITES = OUT / "creatures"
ZOOM = 4

TYPE_COLORS = {
    "volt": "#f0c020", "alloy": "#a8b0c0", "data": "#58a8e8", "thermal": "#e86038",
    "cryo": "#78d8e8", "servo": "#c08850", "optic": "#e878c8", "neural": "#a878e8",
    "viral": "#88c040", "quantum": "#8060d8",
}
STAT_LABELS = ["HP", "ATK", "DEF", "SP.ATK", "SP.DEF", "SPEED"]


def sprite(key: str, anim: str = "idle", zoom: int = ZOOM, speed: float = 0.9) -> str:
    """A CSS-animated sprite driven straight off the packed sheet."""
    meta_path = SPRITES / f"{key}.json"
    if not meta_path.exists():
        return f'<div class="missing">{key}</div>'
    meta = json.loads(meta_path.read_text(encoding="utf-8"))
    fw, fh = meta["frameWidth"], meta["frameHeight"]
    info = meta["animations"].get(anim) or next(iter(meta["animations"].values()))
    row, n = info["row"], info["frames"]
    cols = max(a["frames"] for a in meta["animations"].values())
    rows = len(meta["animations"])
    cls = f"s_{key}_{anim}"
    style = (
        f".{cls}{{width:{fw * zoom}px;height:{fh * zoom}px;"
        f"background-image:url('creatures/{key}.png');"
        f"background-size:{cols * fw * zoom}px {rows * fh * zoom}px;"
        f"background-position:0 -{row * fh * zoom}px;"
        f"animation:{cls} {speed}s steps({n}) infinite}}"
        f"@keyframes {cls}{{to{{background-position:-{n * fw * zoom}px -{row * fh * zoom}px}}}}"
    )
    return f'<style>{style}</style><div class="spr {cls}"></div>'


def chips(types: list[str]) -> str:
    return "".join(
        f'<span class="chip" style="background:{TYPE_COLORS.get(t, "#888")}">{t.upper()}</span>'
        for t in types
    )


def stat_block(stats: list[int]) -> str:
    rows = []
    for label, v in zip(STAT_LABELS, stats):
        pct = min(100, round(v / 130 * 100))
        hue = 0 if v < 60 else (40 if v < 85 else (90 if v < 110 else 140))
        rows.append(
            f'<tr><th>{label}</th><td class="num">{v}</td>'
            f'<td class="barcell"><i style="width:{pct}%;background:hsl({hue} 70% 48%)"></i></td></tr>'
        )
    rows.append(f'<tr class="bst"><th>BST</th><td class="num">{sum(stats)}</td><td></td></tr>')
    return f'<table class="stats">{"".join(rows)}</table>'


def learn_list(learn: list) -> str:
    cells = "".join(f"<li><b>{lv}</b> {key.replace('_', ' ').upper()}</li>" for lv, key in learn)
    return f'<ul class="learn">{cells}</ul>'


def card(s: dict) -> str:
    forms = ""
    if s.get("colour_forms"):
        items = []
        for fkey, label, rgb in s["colour_forms"]:
            key = s["key"] if rgb is None else "{}_{}".format(s["key"], fkey)
            tag = " (base generada)" if rgb is None else ""
            items.append(
                '<figure>{}<figcaption>{}{}</figcaption></figure>'.format(
                    sprite(key + "_front", zoom=3), label, tag
                )
            )
        forms += (
            '<div class="forms"><h4>Variantes de color '
            "<small>&mdash; mismas stats, mismo learnset</small></h4>"
            f'<div class="row">{"".join(items)}</div></div>'
        )
    if s.get("shape_forms"):
        items = []
        base_moves = {k for _, k in s["learn"]}
        for f in s["shape_forms"]:
            extra = [k for _, k in f["learn"] if k not in base_moves]
            key = "{}_{}_front".format(s["key"], f["key"])
            items.append(
                '<figure>{}<figcaption><b>{}</b><br>{}<br><small>{}</small></figcaption></figure>'.format(
                    sprite(key, zoom=3), f["label"], chips(f["types"]),
                    ", ".join(m.replace("_", " ").upper() for m in extra),
                )
            )
        forms += (
            '<div class="forms"><h4>Variantes de forma '
            "<small>&mdash; mismas stats base, segundo tipo y ataques propios</small></h4>"
            f'<div class="row">{"".join(items)}</div></div>'
        )
    if s.get("extra_poses"):
        poses = "".join(
            '<figure>{}<figcaption>COBERTURA</figcaption></figure>'.format(
                sprite("{}_{}".format(s["key"], p), zoom=3)
            )
            for p in s["extra_poses"]
        )
        forms += (
            '<div class="forms"><h4>Pose de COBERTURA '
            "<small>&mdash; inmune al da&ntilde;o 1 turno, +10% PS, sigue siendo capturable</small></h4>"
            f'<div class="row">{poses}</div></div>'
        )

    evo = ""
    if s.get("evo"):
        evo = '<p class="evo">Evoluciona a <b>{}</b> al nivel {}</p>'.format(
            s["evo"]["to"].upper(), s["evo"]["level"]
        )

    return f"""
<section class="card">
  <div class="art">
    <div class="pose">{sprite(f"{s['key']}_front")}<span>frente</span></div>
    <div class="pose">{sprite(f"{s['key']}_back")}<span>espalda</span></div>
  </div>
  <div class="info">
    <h2>{s['name']} <small>&mdash; inspirado en {s['inspired']}</small></h2>
    <p class="genus">{s['genus']} &nbsp; {chips(s['types'])}</p>
    <p class="dex">{s['dex']}</p>
    <p class="meta">Captura <b>{s['catch']}</b> &middot; Exp base <b>{s['base_exp']}</b>
       &middot; {s['height']} m &middot; {s['weight']} kg &middot; curva {s['growth']}</p>
    {evo}
    {stat_block(s['stats'])}
    <h4>Movimientos</h4>
    {learn_list(s['learn'])}
    {forms}
  </div>
</section>"""


def moves_table() -> str:
    rows = []
    for key, name, typ, cat, power, acc, pp, effect, chance, target, prio, desc in newmons.NEW_MOVES:
        rows.append(
            f"<tr><td><b>{name}</b></td><td>{chips([typ])}</td><td>{cat}</td>"
            f"<td>{power or '&mdash;'}</td><td>{'&mdash;' if acc >= 999 else acc}</td><td>{pp}</td>"
            f"<td>{('+' + str(prio)) if prio else ''}</td><td>{desc}</td></tr>"
        )
    return f"""
<section class="moves">
  <h2>Movimientos nuevos ({len(newmons.NEW_MOVES)})</h2>
  <table>
    <tr><th>Nombre</th><th>Tipo</th><th>Cat.</th><th>Pot.</th><th>Prec.</th><th>PP</th>
        <th>Prio</th><th>Descripci&oacute;n</th></tr>
    {''.join(rows)}
  </table>
</section>"""


CSS = """
*{box-sizing:border-box}
body{margin:0;background:#12141c;color:#e8ecf4;font:14px/1.5 "Segoe UI",system-ui,sans-serif}
header{padding:26px 32px;background:linear-gradient(180deg,#1e2740,#12141c);border-bottom:2px solid #2c3a5c}
h1{margin:0;font-size:26px;letter-spacing:.5px}
header p{margin:6px 0 0;color:#9aa8c4}
main{padding:24px 32px;display:flex;flex-direction:column;gap:22px}
.card{display:grid;grid-template-columns:260px 1fr;gap:24px;background:#1a1f2e;
  border:1px solid #2c3a5c;border-radius:12px;padding:20px}
.art{display:flex;flex-direction:column;align-items:center;gap:14px;
  background:repeating-conic-gradient(#20263a 0 25%,#1a1f2e 0 50%) 0 0/16px 16px;border-radius:10px;padding:14px}
.pose{display:flex;flex-direction:column;align-items:center;gap:4px}
.pose span{font-size:11px;color:#7f8db0;text-transform:uppercase;letter-spacing:1px}
.spr{image-rendering:pixelated}
.missing{color:#e05050;font-size:12px}
h2{margin:0 0 4px;font-size:20px}
h2 small{color:#8898bc;font-weight:400;font-size:13px}
h4{margin:16px 0 6px;font-size:13px;text-transform:uppercase;letter-spacing:1px;color:#8898bc}
h4 small{text-transform:none;letter-spacing:0}
.genus{margin:0 0 8px;color:#b8c4dc}
.chip{display:inline-block;padding:1px 8px;border-radius:9px;color:#12141c;font-weight:700;
  font-size:11px;letter-spacing:.6px;margin-right:4px}
.dex{margin:8px 0;color:#c8d2e8;font-style:italic;max-width:70ch}
.meta{margin:6px 0;color:#8898bc;font-size:12.5px}
.evo{margin:6px 0;color:#7fd6a0}
.stats{border-collapse:collapse;margin-top:10px;width:340px}
.stats th{text-align:left;font-weight:500;color:#8898bc;font-size:12px;padding:1px 8px 1px 0}
.stats .num{width:36px;text-align:right;font-variant-numeric:tabular-nums;padding-right:8px}
.barcell{width:200px}
.barcell i{display:block;height:8px;border-radius:4px}
.stats .bst th,.stats .bst .num{color:#e8ecf4;font-weight:700;padding-top:5px}
.learn{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:4px 8px}
.learn li{background:#232a3e;border-radius:5px;padding:2px 8px;font-size:12px}
.learn b{color:#7fb0e8;margin-right:4px}
.forms{margin-top:16px;border-top:1px solid #2c3a5c;padding-top:10px}
.row{display:flex;flex-wrap:wrap;gap:18px;align-items:flex-end}
figure{margin:0;display:flex;flex-direction:column;align-items:center;gap:5px}
figcaption{font-size:11.5px;color:#b8c4dc;text-align:center;max-width:130px}
figcaption small{color:#7fb0e8}
.moves{background:#1a1f2e;border:1px solid #2c3a5c;border-radius:12px;padding:20px}
.moves table{border-collapse:collapse;width:100%;font-size:12.5px}
.moves th{text-align:left;color:#8898bc;font-weight:600;border-bottom:1px solid #2c3a5c;padding:5px 8px}
.moves td{padding:5px 8px;border-bottom:1px solid #232a3e;vertical-align:top}
"""


def main() -> int:
    cards = "".join(card(s) for s in newmons.SPECIES)
    html = f"""<!doctype html><html lang="es"><meta charset="utf-8">
<title>Agentmon &mdash; nuevos dise&ntilde;os</title><style>{CSS}</style>
<header>
  <h1>Agentmon &mdash; {len(newmons.SPECIES)} especies nuevas</h1>
  <p>Sprites generados con Azure gpt-image-2 y pasados por el pipeline de pixel art del juego
     (misma paleta GBA, mismo contorno, mismas animaciones de combate). Ampliado {ZOOM}&times;.</p>
</header>
<main>{cards}{moves_table()}</main></html>"""
    (OUT / "index.html").write_text(html, encoding="utf-8")
    print(f"wrote {OUT / 'index.html'}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
