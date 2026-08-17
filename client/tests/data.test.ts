/**
 * Data integrity suite.
 *
 * Loads the real dex, maps, trainers and items and walks them with the
 * production `TileMap` so collision, warps and reachability are validated with
 * the same logic the game runs, not a copy of it.
 */

import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';

import { buildTileset, type TileSetResult } from '../src/engine/tilegen.ts';
import { Battle, type PlayerAction } from '../src/game/battle/engine.ts';
import {
  BACKDROP_KEYS, BUILDING_KEYS, CHARACTER_KEYS, TRAINER_KEYS,
} from '../src/game/data/artkeys.ts';
import { createAgent } from '../src/game/data/agent.ts';
import { DEX, setDex, move as moveDef, species as speciesDef, typeEffect } from '../src/game/data/dex.ts';
import { ITEMS } from '../src/game/data/items.ts';
import { ALL_MAPS, mapExists } from '../src/game/data/maps.ts';
import { ALL_TRACKS, trackExists } from '../src/game/data/music.ts';
import { rivalStarterFor, STARTER_KEYS } from '../src/game/data/starters.ts';
import { TRAINERS } from '../src/game/data/trainers.ts';
import { addAgent, newSave } from '../src/game/state.ts';
import { TileMap, type MapDef } from '../src/game/world/tilemap.ts';

// --------------------------------------------------------------------------
// Canvas stub - the tile generator only ever draws, so swallowing every call
// is enough to get a real tile index/solid table out of it under Node.
// --------------------------------------------------------------------------
const noop = (): void => {};
function stubContext(): unknown {
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'canvas') return { width: 0, height: 0 };
      if (prop === 'getImageData') return () => ({ data: new Uint8ClampedArray(4) });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') {
        return () => ({ addColorStop: noop });
      }
      return noop;
    },
    set: () => true,
  });
}

const CHARACTER_SPRITES = new Set(CHARACTER_KEYS);
const BUILDING_SPRITES = new Set(BUILDING_KEYS);
const BACKDROPS = new Set(BACKDROP_KEYS);
const MUSIC = new Set([
  'title', 'town', 'city', 'route', 'forest', 'gym', 'gymleader', 'lab', 'citadel',
  'center', 'mart', 'rival', 'battleWild', 'battleTrainer', 'victory', 'champion',
  'elite', 'evolution', 'intro', 'overworld', 'home', 'house', 'cave', 'wild', 'trainer',
]);
const SCRIPTS = new Set([
  'ada', 'champion', 'citadel_block', 'gift_fullreset', 'gift_rarechip', 'gift_toolkit',
  'gym1_leader', 'gym2_leader', 'gym3_leader', 'mom', 'rival_final', 'rival_lab',
  'rival_r3', 'route1_block', 'route2_block', 'route3_block', 'heal',
]);

const START = { map: 'home_bedroom', x: 3, y: 4 };

/** True when a tile is a counter-style spot reachable by talking across one solid tile. */
function overCounter(map: TileMap, x: number, y: number): boolean {
  return ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const).some(([dx, dy]) => {
    const mx = x + dx;
    const my = y + dy;
    const px = x + dx * 2;
    const py = y + dy * 2;
    return map.inBounds(mx, my) && map.isSolid(mx, my)
      && map.inBounds(px, py) && !map.isSolid(px, py);
  });
}

let tiles: TileSetResult;
const built = new Map<string, TileMap>();

beforeAll(() => {
  (globalThis as Record<string, unknown>).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => stubContext() }),
  };
  const dexPath = fileURLToPath(new URL('../../shared/agentdex.json', import.meta.url));
  setDex(JSON.parse(readFileSync(dexPath, 'utf8')));
  tiles = buildTileset(1337);
  for (const def of ALL_MAPS) built.set(def.id, new TileMap(def, tiles));
});

/** Tiles you can stand on, flooded from every tile the player can arrive at. */
function reachableTiles(def: MapDef): Set<number> {
  const map = built.get(def.id)!;
  const starts: [number, number][] = [];
  for (const other of ALL_MAPS) {
    for (const w of other.warps ?? []) if (w.to === def.id) starts.push([w.tx, w.ty]);
  }
  if (def.id === START.map) starts.push([START.x, START.y]);

  const seen = new Set<number>();
  const queue: [number, number][] = [];
  for (const [x, y] of starts) {
    if (!map.inBounds(x, y) || map.isSolid(x, y)) continue;
    const k = y * map.width + x;
    if (!seen.has(k)) { seen.add(k); queue.push([x, y]); }
  }
  while (queue.length) {
    const [x, y] = queue.pop()!;
    for (const [dx, dy] of [[0, 1], [0, -1], [1, 0], [-1, 0]] as const) {
      const nx = x + dx;
      const ny = y + dy;
      if (!map.inBounds(nx, ny) || map.isSolid(nx, ny)) continue;
      const k = ny * map.width + nx;
      if (seen.has(k)) continue;
      seen.add(k);
      queue.push([nx, ny]);
    }
  }
  return seen;
}

describe('dex', () => {
  it('has the expected content volume', () => {
    expect(Object.keys(DEX().species).length).toBeGreaterThanOrEqual(30);
    expect(Object.keys(DEX().moves).length).toBeGreaterThanOrEqual(50);
    expect(Object.keys(DEX().types).length).toBeGreaterThanOrEqual(8);
  });

  it('every species is internally consistent', () => {
    const problems: string[] = [];
    for (const s of Object.values(DEX().species)) {
      if (s.learnset.length === 0) problems.push(`${s.key}: empty learnset`);
      if (!s.learnset.some(([lv]) => lv <= 5)) problems.push(`${s.key}: no move by level 5`);
      for (const [, k] of s.learnset) if (!DEX().moves[k]) problems.push(`${s.key}: unknown move ${k}`);
      for (const t of s.types) if (!DEX().types[t]) problems.push(`${s.key}: unknown type ${t}`);
      if (s.catchRate <= 0 || s.catchRate > 255) problems.push(`${s.key}: bad catch rate`);
      if (s.evolution) {
        if (!DEX().species[s.evolution.to]) problems.push(`${s.key}: unknown evolution ${s.evolution.to}`);
        if (s.evolution.level < 2) problems.push(`${s.key}: bad evolution level`);
      }
      expect(speciesDef(s.key).key).toBe(s.key);
    }
    expect(problems).toEqual([]);
  });

  it('every move is internally consistent', () => {
    const problems: string[] = [];
    for (const m of Object.values(DEX().moves)) {
      if (!DEX().types[m.type]) problems.push(`${m.key}: unknown type ${m.type}`);
      if (m.category === 'status' && m.power > 0) problems.push(`${m.key}: status move with power`);
      if (m.pp <= 0) problems.push(`${m.key}: no PP`);
      if (m.accuracy <= 0 || m.accuracy > 100) problems.push(`${m.key}: bad accuracy`);
      expect(moveDef(m.key).key).toBe(m.key);
    }
    expect(problems).toEqual([]);
  });

  it('the type chart covers every type pair', () => {
    const problems: string[] = [];
    for (const a of Object.keys(DEX().types)) {
      for (const b of Object.keys(DEX().types)) {
        const v = DEX().typeChart[a]?.[b];
        if (v !== undefined && ![0, 0.5, 1, 2].includes(v)) problems.push(`${a}->${b} = ${v}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('items', () => {
  it('keys match and prices are sane', () => {
    const problems: string[] = [];
    for (const [key, it] of Object.entries(ITEMS)) {
      if (it.key !== key) problems.push(`${key}: key mismatch`);
      if (it.price < 0) problems.push(`${key}: negative price`);
      if (!it.name || !it.desc) problems.push(`${key}: missing name/description`);
    }
    expect(problems).toEqual([]);
  });
});

describe('trainers', () => {
  const TRAINER_SPRITES = new Set(TRAINER_KEYS);

  it('every trainer has a legal party', () => {
    const problems: string[] = [];
    for (const [key, t] of Object.entries(TRAINERS)) {
      if (t.key !== key) problems.push(`${key}: key mismatch`);
      if (t.team.length === 0) problems.push(`${key}: empty party`);
      if (!TRAINER_SPRITES.has(t.sprite)) problems.push(`${key}: unknown sprite '${t.sprite}'`);
      if (t.payout <= 0) problems.push(`${key}: non-positive payout`);
      if (t.intro.length === 0 || t.defeat.length === 0) problems.push(`${key}: missing dialogue`);
      for (const m of t.team) {
        if (!DEX().species[m.species]) { problems.push(`${key}: unknown species ${m.species}`); continue; }
        if (m.level < 2 || m.level > 100) problems.push(`${key}: level ${m.level} out of range`);
        for (const mv of m.moves ?? []) if (!DEX().moves[mv]) problems.push(`${key}: unknown move ${mv}`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('battle items', () => {
  function stage(kind: 'wild' | 'trainer'): Battle {
    const mine = createAgent('stackbit', { level: 30 });
    const theirs = createAgent('stackbit', { level: 5 });
    return new Battle([mine], [theirs], {
      kind, playerName: 'AAA', canRun: true, seed: 1234,
    });
  }

  it('announces the throw so the command prompt is replaced', () => {
    const b = stage('wild');
    const ev = b.takeTurn({ kind: 'item', key: 'nanocore' });
    const said = ev.find((e) => e.t === 'text');
    expect(said && 'text' in said ? said.text : '').toBe('AAA used the NANO CORE!');
  });

  it('emits useItem exactly once for a real use, so the bag is charged once', () => {
    const b = stage('wild');
    const ev = b.takeTurn({ kind: 'item', key: 'patch', targetIndex: 0 });
    expect(ev.filter((e) => e.t === 'useItem')).toHaveLength(1);
  });

  it('does not charge for a ball a trainer battle refuses', () => {
    const b = stage('trainer');
    const ev = b.takeTurn({ kind: 'item', key: 'nanocore' });
    expect(ev.filter((e) => e.t === 'useItem')).toHaveLength(0);
    const said = ev.find((e) => e.t === 'text');
    expect(said && 'text' in said ? said.text : '').toContain("can't capture");
  });

  it('a 255-rate core always captures', () => {
    const b = stage('wild');
    b.takeTurn({ kind: 'item', key: 'masterkey' });
    expect(b.outcome).toBe('caught');
    expect(b.caught?.otName).toBe('AAA');
  });
});

describe('battle damage attribution', () => {
  /**
   * The scene animates the event log *after* the engine has resolved the whole
   * turn, so an attack that quietly moved the wrong HP - or moved HP without
   * saying so - shows up as both bars draining on a single attack. These tests
   * pin the invariant that animation depends on.
   */
  // RAM: 100% accuracy, no recoil, no drain, non-zero against both species.
  function stage(seed: number): Battle {
    const mine = createAgent('stackbit', { level: 25, moves: ['tackle'] });
    const theirs = createAgent('boltkin', { level: 25, moves: ['tackle'] });
    return new Battle([mine], [theirs], {
      kind: 'wild', playerName: 'AAA', canRun: true, seed,
    });
  }

  /** Foe "does nothing": switching to the slot it already occupies is a no-op. */
  const IDLE: PlayerAction = { kind: 'switch', index: 0 };

  it('a player attack never touches the player', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = stage(seed);
      const before = b.playerC.agent.hp;
      const foeBefore = b.foeC.agent.hp;
      b.takeTurn({ kind: 'move', index: 0 }, IDLE);
      expect(b.playerC.agent.hp, `seed ${seed}: attacker lost HP`).toBe(before);
      expect(b.foeC.agent.hp, `seed ${seed}: foe took no damage`).toBeLessThan(foeBefore);
    }
  });

  it('a foe attack never touches the foe', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = stage(seed);
      const before = b.foeC.agent.hp;
      const playerBefore = b.playerC.agent.hp;
      // The player "switches" into the slot it already occupies, so only the foe moves.
      b.takeTurn(IDLE, { kind: 'move', index: 0 });
      expect(b.foeC.agent.hp, `seed ${seed}: attacker lost HP`).toBe(before);
      expect(b.playerC.agent.hp, `seed ${seed}: player took no damage`).toBeLessThan(playerBefore);
    }
  });

  it('damage events name the side that actually lost the HP', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = stage(seed);
      const ev = b.takeTurn({ kind: 'move', index: 0 }, IDLE);
      const hits = ev.filter((e) => e.t === 'damage');
      expect(hits.length, `seed ${seed}: no damage event`).toBeGreaterThan(0);
      for (const e of hits) {
        if (e.t !== 'damage') continue;
        expect(e.side, `seed ${seed}: player damaged by its own attack`).toBe('foe');
        expect(e.to).toBeLessThan(e.from);
      }
    }
  });

  it('HP only ever moves through an event, on the side the event names', () => {
    // Replaying the log against a mirror of the HP must reproduce the engine
    // exactly - this is what the scene does to drive the bars, so any silent
    // write or misattributed side shows up here as a desync.
    for (let seed = 1; seed <= 30; seed++) {
      const b = stage(seed);
      const shown: Record<'player' | 'foe', number> = {
        player: b.playerC.agent.hp,
        foe: b.foeC.agent.hp,
      };
      for (let turn = 0; turn < 12 && !b.outcome; turn++) {
        for (const e of b.takeTurn({ kind: 'move', index: 0 })) {
          if (e.t === 'damage' || e.t === 'heal') {
            expect(shown[e.side], `seed ${seed} turn ${turn}: bar desynced`).toBe(e.from);
            shown[e.side] = e.to;
          } else if (e.t === 'sendOut') {
            shown[e.side] = b.side(e.side).agent.hp;
          }
        }
        expect(shown.player, `seed ${seed} turn ${turn}: player HP moved silently`).toBe(b.playerC.agent.hp);
        expect(shown.foe, `seed ${seed} turn ${turn}: foe HP moved silently`).toBe(b.foeC.agent.hp);
      }
    }
  });

  it('only recoil and drain may move the attacker\'s own HP', () => {
    // These are the sole legitimate reasons an attacker's bar moves on its own
    // turn, so they must stay explicit rather than excuse stray writes.
    const specials = Object.values(DEX().moves)
      .filter((m) => m.effect === 'recoil_third' || m.effect === 'drain_half');
    expect(specials.length).toBeGreaterThan(0);

    for (const m of specials) {
      // Pick a defender the move can actually reach; an immune type would make
      // the whole thing a no-op and prove nothing.
      const victim = Object.values(DEX().species)
        .find((sp) => typeEffect(m.type, sp.types) > 0);
      expect(victim, `nothing is hittable by ${m.key}`).toBeTruthy();
      let landed = 0;
      for (let seed = 1; seed <= 12; seed++) {
        const mine = createAgent('stackbit', { level: 40, moves: [m.key] });
        const theirs = createAgent(victim!.key, { level: 40, moves: ['tackle'] });
        const b = new Battle([mine], [theirs], {
          kind: 'wild', playerName: 'AAA', canRun: true, seed,
        });
        // Drain heals the user, so start it hurt or the heal is clamped away.
        if (m.effect === 'drain_half') mine.hp = Math.max(1, Math.floor(mine.hp / 2));
        const ev = b.takeTurn({ kind: 'move', index: 0 }, IDLE);
        if (!ev.some((e) => e.t === 'damage' && e.side === 'foe')) continue;
        landed++;
        const onSelf = ev.filter((e) => (e.t === 'damage' || e.t === 'heal') && e.side === 'player');
        for (const e of onSelf) {
          const kind = e.t === 'damage' ? 'recoil_third' : 'drain_half';
          expect(kind, `${m.key} moved the attacker's HP the wrong way`).toBe(m.effect);
        }
        expect(onSelf.length, `${m.key} did not apply its own effect`).toBe(1);
      }
      expect(landed, `${m.key} never connected`).toBeGreaterThan(0);
    }
  });
});

describe('storage', () => {
  it('every repair bay exposes a reachable storage terminal', () => {
    const bays = ALL_MAPS.filter((m) => m.id.startsWith('repairbay_'));
    expect(bays.length).toBeGreaterThan(0);
    for (const def of bays) {
      const term = def.signs?.find((s) => s.script === 'storage');
      expect(term, `${def.id} has no storage terminal`).toBeTruthy();
      // The tile itself must be solid furniture, and the tile below must be walkable
      // or the player can never face it.
      expect(def.ground[term!.y]![term!.x]).toBe('P');
      expect(def.ground[term!.y + 1]![term!.x]).toBe('l');
    }
  });

  it('boxes hold every overflow capture', () => {
    const save = newSave('TESTER', 'm', 'RIVAL');
    for (let i = 0; i < 6; i++) save.party.push(createAgent('stackbit', { level: 5 }));
    const where = addAgent(save, createAgent('reachlet', { level: 5 }));
    expect(where).toBe('box');
    expect(save.boxes.flat()).toHaveLength(1);
  });
});

describe('maps', () => {
  it('every legend character used by a layer is defined', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      for (const layer of [def.ground, def.over ?? [], def.top ?? []]) {
        for (const row of layer) {
          for (const ch of row) {
            if (ch !== ' ' && !def.legend[ch]) problems.push(`${def.id}: undefined legend char '${ch}'`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('music and battle backdrops resolve', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      if (!MUSIC.has(def.music)) problems.push(`${def.id}: unknown music '${def.music}'`);
      if (def.battleBackdrop && !BACKDROPS.has(def.battleBackdrop)) {
        problems.push(`${def.id}: unknown backdrop '${def.battleBackdrop}'`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every warp is walkable and lands somewhere walkable', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      const map = built.get(def.id)!;
      for (const w of def.warps ?? []) {
        const at = `${def.id}(${w.x},${w.y})`;
        if (!map.inBounds(w.x, w.y)) { problems.push(`${at}: out of bounds`); continue; }
        if (map.isSolid(w.x, w.y)) problems.push(`${at}: warp tile is solid`);
        if (!mapExists(w.to)) { problems.push(`${at}: unknown target '${w.to}'`); continue; }
        const dest = built.get(w.to)!;
        if (!dest.inBounds(w.tx, w.ty)) problems.push(`${at}: lands out of bounds on ${w.to}`);
        else if (dest.isSolid(w.tx, w.ty)) problems.push(`${at}: lands on solid ${w.to}(${w.tx},${w.ty})`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('every NPC stands somewhere legal and references real content', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      const map = built.get(def.id)!;
      const ids = new Set<string>();
      for (const n of def.npcs ?? []) {
        const at = `${def.id}:${n.id}`;
        if (ids.has(n.id)) problems.push(`${at}: duplicate id`);
        ids.add(n.id);
        if (!map.inBounds(n.x, n.y)) { problems.push(`${at}: out of bounds`); continue; }
        // NPCs may stand behind a counter; the player talks across one solid tile.
        if (map.isSolid(n.x, n.y) && !overCounter(map, n.x, n.y)) {
          problems.push(`${at}: stands on a solid tile`);
        }
        if (map.warpAt(n.x, n.y)) problems.push(`${at}: blocks a warp`);
        if (!CHARACTER_SPRITES.has(n.sprite)) problems.push(`${at}: unknown sprite '${n.sprite}'`);
        if (n.trainer && !TRAINERS[n.trainer]) problems.push(`${at}: unknown trainer '${n.trainer}'`);
        if (n.script) {
          if (n.script.startsWith('shop:')) {
            for (const k of n.script.slice(5).split(',')) {
              if (!ITEMS[k]) problems.push(`${at}: sells unknown item '${k}'`);
            }
          } else if (!SCRIPTS.has(n.script)) {
            problems.push(`${at}: unknown script '${n.script}'`);
          }
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('every object and item ball is placed legally', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      const map = built.get(def.id)!;
      for (const o of def.objects ?? []) {
        if (!BUILDING_SPRITES.has(o.sprite)) problems.push(`${def.id}: unknown building '${o.sprite}'`);
        if (o.x < 0 || o.y < 0 || o.x + o.w > map.width || o.y + o.h > map.height) {
          problems.push(`${def.id}: '${o.sprite}' at (${o.x},${o.y}) overflows the map`);
        }
      }
      for (const it of def.items ?? []) {
        const at = `${def.id}:${it.id}`;
        if (!map.inBounds(it.x, it.y)) { problems.push(`${at}: out of bounds`); continue; }
        if (map.isSolid(it.x, it.y)) problems.push(`${at}: inside a wall`);
        if (!ITEMS[it.item]) problems.push(`${at}: unknown item '${it.item}'`);
      }
      for (const s of def.signs ?? []) {
        if (!map.inBounds(s.x, s.y)) problems.push(`${def.id}: sign (${s.x},${s.y}) out of bounds`);
      }
    }
    expect(problems).toEqual([]);
  });

  it('encounter tables are valid and have grass to trigger them', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      const map = built.get(def.id)!;
      const table = def.encounters ?? [];
      if (table.length === 0) continue;
      let total = 0;
      for (const e of table) {
        if (!DEX().species[e.species]) { problems.push(`${def.id}: unknown species '${e.species}'`); continue; }
        if (e.min > e.max) problems.push(`${def.id}: ${e.species} min > max`);
        if (e.weight <= 0) problems.push(`${def.id}: ${e.species} weight <= 0`);
        total += e.weight;
      }
      if (total <= 0) problems.push(`${def.id}: zero total encounter weight`);
      let grass = 0;
      for (let y = 0; y < map.height; y++) {
        for (let x = 0; x < map.width; x++) if (map.isEncounter(x, y)) grass++;
      }
      if (grass === 0) problems.push(`${def.id}: encounter table but no encounter tiles`);
    }
    expect(problems).toEqual([]);
  });

  it('every warp, NPC and item is reachable on foot', () => {
    const problems: string[] = [];
    for (const def of ALL_MAPS) {
      const map = built.get(def.id)!;
      const seen = reachableTiles(def);
      if (seen.size === 0) { problems.push(`${def.id}: no reachable arrival tile`); continue; }
      for (const w of def.warps ?? []) {
        if (map.inBounds(w.x, w.y) && !seen.has(w.y * map.width + w.x)) {
          problems.push(`${def.id}: warp (${w.x},${w.y})->${w.to} unreachable`);
        }
      }
      for (const n of def.npcs ?? []) {
        if (!map.inBounds(n.x, n.y)) continue;
        const talkable = ([[0, 1], [0, -1], [1, 0], [-1, 0]] as const).some(([dx, dy]) => {
          const x = n.x + dx;
          const y = n.y + dy;
          if (map.inBounds(x, y) && seen.has(y * map.width + x)) return true;
          // Talking across a counter: one solid tile then a reachable one.
          const x2 = n.x + dx * 2;
          const y2 = n.y + dy * 2;
          return map.inBounds(x, y) && map.isSolid(x, y)
            && map.inBounds(x2, y2) && seen.has(y2 * map.width + x2);
        });
        if (!talkable) problems.push(`${def.id}: npc '${n.id}' (${n.x},${n.y}) cannot be reached`);
      }
      for (const it of def.items ?? []) {
        if (map.inBounds(it.x, it.y) && !seen.has(it.y * map.width + it.x)) {
          problems.push(`${def.id}: item '${it.id}' (${it.x},${it.y}) unreachable`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('the world graph is fully connected from the starting town', () => {
    const visited = new Set<string>([START.map]);
    const queue = [START.map];
    while (queue.length) {
      const id = queue.pop()!;
      const def = ALL_MAPS.find((m) => m.id === id);
      for (const w of def?.warps ?? []) {
        if (!visited.has(w.to) && mapExists(w.to)) { visited.add(w.to); queue.push(w.to); }
      }
    }
    const orphans = ALL_MAPS.map((m) => m.id).filter((id) => !visited.has(id));
    expect(orphans).toEqual([]);
  });
});

describe('music', () => {
  it('every map references a track that exists', () => {
    const missing = ALL_MAPS
      .filter((m) => !trackExists(m.music))
      .map((m) => `${m.id} -> ${m.music}`);
    expect(missing).toEqual([]);
  });

  it('every trainer battle theme exists', () => {
    const missing = Object.entries(TRAINERS)
      .filter(([, t]) => t.music && !trackExists(t.music))
      .map(([k, t]) => `${k} -> ${t.music}`);
    expect(missing).toEqual([]);
  });

  it('covers the themes the scenes ask for by name', () => {
    // These are hard-coded in battle/evolution/title/intro, so a rename there
    // would otherwise silently drop the music.
    for (const n of ['title', 'intro', 'battleWild', 'battleTrainer', 'victory', 'evolution']) {
      expect(trackExists(n), n).toBe(true);
    }
  });

  it('every track has channels and parseable patterns', () => {
    for (const [name, def] of Object.entries(ALL_TRACKS)) {
      expect(def.channels.length, name).toBeGreaterThan(0);
      expect(def.bpm, name).toBeGreaterThan(40);
      for (const ch of def.channels) {
        const tokens = ch.pattern.trim().split(/\s+/);
        expect(tokens.length, `${name}/${ch.wave}`).toBeGreaterThan(0);
        for (const t of tokens) {
          // `PITCH:BEATS`, with `-` meaning a rest.
          expect(t, `${name}/${ch.wave}`).toMatch(/^(-|[A-G][#b]?-?\d):\d*\.?\d+$/);
        }
      }
    }
  });
});

describe('starters', () => {
  it('offers three distinct, known species', () => {
    expect(STARTER_KEYS.length).toBe(3);
    expect(new Set(STARTER_KEYS).size).toBe(STARTER_KEYS.length);
    for (const key of STARTER_KEYS) expect(speciesDef(key).key, key).toBe(key);
  });

  it('each core has the art the bay draws, front and back', () => {
    // The selection screen shows all three at once, so a missing sheet would
    // leave the player choosing from empty pedestals.
    const missing: string[] = [];
    for (const key of STARTER_KEYS) {
      for (const file of [`${key}.png`, `${key}.json`, `${key}_back.png`, `${key}_back.json`]) {
        if (!existsSync(new URL(`../public/assets/creatures/${file}`, import.meta.url))) {
          missing.push(file);
        }
      }
      const meta = JSON.parse(
        readFileSync(new URL(`../public/assets/creatures/${key}.json`, import.meta.url), 'utf8'),
      ) as { animations?: Record<string, { frames: number }> };
      expect(meta.animations?.idle?.frames, `${key} idle`).toBeGreaterThan(0);
    }
    expect(missing).toEqual([]);
  });

  it('shows a dossier the card has room for', () => {
    for (const key of STARTER_KEYS) {
      const s = speciesDef(key);
      expect(s.name.length, `${key} name`).toBeLessThanOrEqual(10);
      expect(s.genus.length, `${key} genus`).toBeLessThanOrEqual(14);
      expect(s.types.length, `${key} types`).toBeGreaterThan(0);
      expect(s.dexEntry.length, `${key} entry`).toBeGreaterThan(0);
      // Three lines of roughly 36 characters is all the card window holds.
      expect(s.dexEntry.length, `${key} entry`).toBeLessThanOrEqual(108);
    }
  });

  it('the rival answers every pick with a counter it can actually use', () => {
    for (const key of STARTER_KEYS) {
      const answer = rivalStarterFor(key);
      expect(answer, key).not.toBe(key);
      expect(STARTER_KEYS as readonly string[], key).toContain(answer);
      expect(speciesDef(answer).key).toBe(answer);
    }
  });
});
