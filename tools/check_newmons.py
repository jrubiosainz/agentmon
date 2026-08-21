"""Validate that every learnset key in `newmons.py` resolves."""

from __future__ import annotations

import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

import newmons  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
dex = json.loads((ROOT / "shared" / "agentdex.json").read_text(encoding="utf-8"))
have = {m["key"] for m in dex["moves"]} | {m[0] for m in newmons.NEW_MOVES}

bad: set[str] = set()
for s in newmons.SPECIES:
    for ls in [s["learn"], *(f["learn"] for f in s.get("shape_forms", []))]:
        for _, key in ls:
            if key not in have:
                bad.add(key)

print("unknown move keys:", sorted(bad) if bad else "none")
print("new moves:", len(newmons.NEW_MOVES))
for s in newmons.SPECIES:
    forms = len(s.get("colour_forms", [])) + len(s.get("shape_forms", []))
    print(f"  {s['name']:<10} {'/'.join(s['types']):<14} BST={sum(s['stats']):<4}"
          f"forms={forms:<3}<- {s['inspired']}")
if bad:
    raise SystemExit(1)
