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
  FX_KINDS, MOVE_FX_OVERRIDE, MoveFxPlayer, resolveMoveFx,
} from '../src/game/battle/movefx.ts';
import {
  BACKDROP_KEYS, BUILDING_KEYS, CHARACTER_KEYS, TRAINER_KEYS,
} from '../src/game/data/artkeys.ts';
import { createAgent, evolveTo, maxHp, types as agentTypes } from '../src/game/data/agent.ts';
import {
  DEX, allSpecies, hasCoverPose, learnsetOf, setDex, move as moveDef, species as speciesDef,
  spriteKey, typeEffect, typesOf, type MoveDef,
} from '../src/game/data/dex.ts';
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
/**
 * Script ids and gift item keys read straight out of the overworld source.
 *
 * A hand-kept list drifts: three gift NPCs once shipped with item keys that
 * `item()` throws on, which soft-locked the overworld because the rejection
 * escaped before `busy` was cleared. Deriving both sets from `runScript`'s
 * switch means a new script or a mistyped item key fails here instead.
 */
const OVERWORLD_SRC = readFileSync(
  fileURLToPath(new URL('../src/game/scenes/overworld.ts', import.meta.url)),
  'utf8',
);
const SCRIPTS = new Set(
  [...OVERWORLD_SRC.matchAll(/case '([a-z0-9_]+)':/g)].map((m) => m[1]),
);
const GIFT_ITEM_KEYS = [...OVERWORLD_SRC.matchAll(
  /scriptGift\(\s*'[^']*',\s*'[^']*',\s*'([^']*)'/g,
)].map((m) => m[1]);

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

  it('every gift script hands out an item that exists', () => {
    // `item()` throws on an unknown key, and that rejection used to escape
    // `talkTo()` before `busy` was cleared - a one-character typo bricked the
    // overworld until the tab was reloaded.
    expect(GIFT_ITEM_KEYS.length).toBeGreaterThan(0);
    expect(GIFT_ITEM_KEYS.filter((k) => !ITEMS[k])).toEqual([]);
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

  it('every leader gate lists trainers that exist and are reachable', () => {
    const problems: string[] = [];
    // Which trainers can actually be fought, i.e. some NPC points at them.
    const placed = new Set<string>();
    for (const def of ALL_MAPS) {
      for (const n of def.npcs ?? []) if (n.trainer) placed.add(n.trainer);
    }
    for (const [key, t] of Object.entries(TRAINERS)) {
      for (const req of t.requires ?? []) {
        if (!TRAINERS[req]) { problems.push(`${key}: requires unknown trainer '${req}'`); continue; }
        if (req === key) problems.push(`${key}: requires itself`);
        if (!placed.has(req)) problems.push(`${key}: requires '${req}' which no NPC fields`);
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

describe('turn order', () => {
  /**
   * The order is settled *before* the player is asked to choose, so the menu
   * only ever opens when it is genuinely the player's moment to act. Nothing
   * the foe does may land between the choice and its execution - that was the
   * old behaviour and it made every decision a guess.
   */
  function duel(seed: number, myLevel: number, foeLevel: number, myMoves = ['tackle']): Battle {
    const mine = createAgent('stackbit', { level: myLevel, moves: myMoves });
    const theirs = createAgent('boltkin', { level: foeLevel, moves: ['tackle'] });
    return new Battle([mine], [theirs], {
      kind: 'wild', playerName: 'AAA', canRun: true, seed,
    });
  }

  const firstUseMove = (ev: readonly { t: string }[], side: 'player' | 'foe'): number =>
    ev.findIndex((e) => e.t === 'useMove' && (e as { side: string }).side === side);

  it('the foe never acts between the choice and its execution', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = duel(seed, 25, 25);
      const opening = b.openTurn();
      if (!opening.playerActs) continue;
      const closing = b.closeTurn({ kind: 'move', index: 0 });
      const iPlayer = firstUseMove(closing, 'player');
      const iFoe = firstUseMove(closing, 'foe');
      expect(iPlayer, `seed ${seed}: the player never acted`).toBeGreaterThanOrEqual(0);
      if (iFoe >= 0) {
        expect(iFoe, `seed ${seed}: the foe cut in front of the chosen move`).toBeGreaterThan(iPlayer);
      }
    }
  });

  it('a foe that wins the order has already acted when the player is asked', () => {
    let wentFirst = 0;
    for (let seed = 1; seed <= 40; seed++) {
      const b = duel(seed, 25, 25);
      const opening = b.openTurn();
      if (!opening.foeWentFirst) {
        expect(firstUseMove(opening.events, 'foe'), `seed ${seed}: foe moved out of turn`).toBe(-1);
        continue;
      }
      wentFirst++;
      expect(firstUseMove(opening.events, 'foe'), `seed ${seed}: opening has no foe move`).toBeGreaterThanOrEqual(0);
      if (!opening.playerActs) continue;
      const closing = b.closeTurn({ kind: 'move', index: 0 });
      expect(firstUseMove(closing, 'foe'), `seed ${seed}: the foe acted twice`).toBe(-1);
    }
    expect(wentFirst, 'the foe never won the order in 40 seeds').toBeGreaterThan(0);
  });

  it('each side acts at most once per turn', () => {
    for (let seed = 1; seed <= 40; seed++) {
      const b = duel(seed, 25, 25);
      const opening = b.openTurn();
      const ev = opening.playerActs
        ? [...opening.events, ...b.closeTurn({ kind: 'move', index: 0 })]
        : opening.events;
      for (const side of ['player', 'foe'] as const) {
        const used = ev.filter((e) => e.t === 'useMove' && e.side === side);
        expect(used.length, `seed ${seed}: ${side} acted ${used.length} times`).toBeLessThanOrEqual(1);
      }
    }
  });

  it('speed decides who opens the turn', () => {
    for (let seed = 1; seed <= 20; seed++) {
      expect(duel(seed, 5, 60).openTurn().foeWentFirst, `seed ${seed}: the fast foe did not open`).toBe(true);
      expect(duel(seed, 60, 5).openTurn().foeWentFirst, `seed ${seed}: the slow foe opened`).toBe(false);
    }
  });

  it('a first-strike move earns the opening slot however slow you are', () => {
    // The order is fixed before the choice, so "always strikes first" has to
    // mean the bearer takes the opening slot - QUICK JAB would be dead weight
    // otherwise.
    expect(moveDef('quick_jab').priority).toBeGreaterThan(0);
    for (let seed = 1; seed <= 20; seed++) {
      const b = duel(seed, 5, 60, ['quick_jab']);
      const opening = b.openTurn();
      expect(opening.foeWentFirst, `seed ${seed}: QUICK JAB lost the opening slot`).toBe(false);
      expect(opening.playerActs, `seed ${seed}: the player was skipped`).toBe(true);
    }
  });

  it('closeTurn without an opening still resolves a whole turn', () => {
    // The scene always opens first, but nothing may desync if it ever does not.
    const b = duel(7, 25, 25);
    const ev = b.closeTurn({ kind: 'move', index: 0 });
    expect(firstUseMove(ev, 'player'), 'the player never acted').toBeGreaterThanOrEqual(0);
    expect(b.turn, 'the turn counter did not advance').toBe(1);
  });

  it('a knockout in the opening skips the choice and asks for a replacement', () => {
    const mine = createAgent('stackbit', { level: 5, moves: ['tackle'] });
    const spare = createAgent('stackbit', { level: 5, moves: ['tackle'] });
    const theirs = createAgent('boltkin', { level: 60, moves: ['tackle'] });
    const b = new Battle([mine, spare], [theirs], {
      kind: 'wild', playerName: 'AAA', canRun: true, seed: 3,
    });
    const opening = b.openTurn();
    expect(opening.foeWentFirst, 'the fast foe did not open').toBe(true);
    expect(opening.playerActs, 'a downed agent was still asked to act').toBe(false);
    // Exactly one announcement: a turn runs checkFaints more than once.
    const faints = opening.events.filter((e) => e.t === 'faint' && e.side === 'player');
    expect(faints.length, 'the KO was announced twice').toBe(1);
    expect(opening.events.some((e) => e.t === 'requestSwitch'), 'no replacement asked for').toBe(true);
    expect(b.outcome, 'the battle ended with a healthy agent on the bench').toBe(null);
    b.replaceFainted(1);
    expect(() => b.openTurn(), 'the next turn could not open').not.toThrow();
  });

  it('a wipe in the opening ends the battle', () => {
    const mine = createAgent('stackbit', { level: 5, moves: ['tackle'] });
    const theirs = createAgent('boltkin', { level: 60, moves: ['tackle'] });
    const b = new Battle([mine], [theirs], {
      kind: 'wild', playerName: 'AAA', canRun: true, seed: 4,
    });
    const opening = b.openTurn();
    expect(opening.playerActs).toBe(false);
    expect(b.outcome).toBe('lose');
  });
});

describe('battlefield view', () => {
  /**
   * `checkFaints()` calls `doSwitch()` synchronously while it is still building
   * the event array, so the engine's `foeC` points at the REPLACEMENT before
   * the scene has drawn a single frame of the knockout. Anything the scene
   * renders during narration must therefore come from the event log, exactly
   * like the HP bars: the battlefield only changes hands on `sendOut`.
   */
  function trainerDuel(): Battle {
    const mine = createAgent('stackbit', { level: 60, moves: ['tackle'] });
    const a = createAgent('boltkin', { level: 3, moves: ['tackle'] });
    const b = createAgent('stackbit', { level: 3, moves: ['tackle'] });
    return new Battle([mine], [a, b], {
      kind: 'trainer', playerName: 'AAA', canRun: false, seed: 11,
      trainerName: 'RIVAL', payout: 10,
    });
  }

  /** Replay the log the way the scene does and report the agent on screen. */
  function replay(startIndex: number, events: readonly { t: string }[]): {
    atFaint: number; atEnd: number; sendOuts: number;
  } {
    let shown = startIndex;
    let atFaint = -1;
    let sendOuts = 0;
    for (const ev of events) {
      const e = ev as { t: string; side?: string; index?: number };
      if (e.t === 'faint' && e.side === 'foe') atFaint = shown;
      if (e.t === 'sendOut' && e.side === 'foe') { shown = e.index!; sendOuts++; }
    }
    return { atFaint, atEnd: shown, sendOuts };
  }

  it('the engine has already swapped the foe before the log is narrated', () => {
    const b = trainerDuel();
    const opening = b.openTurn();
    const events = opening.playerActs
      ? [...opening.events, ...b.closeTurn({ kind: 'move', index: 0 })]
      : [...opening.events];
    expect(events.some((e) => e.t === 'faint' && e.side === 'foe'), 'nothing was KOd').toBe(true);
    // The model is useless as a render source: it is already showing member 1.
    expect(b.foe.activeIndex, 'the engine did not swap in the replacement').toBe(1);
  });

  it('a knockout narrates on the fainted agent, not on its replacement', () => {
    const b = trainerDuel();
    // Snapshot the view BEFORE the turn resolves, as the scene does.
    const shownBefore = b.foe.activeIndex;
    const opening = b.openTurn();
    const events = opening.playerActs
      ? [...opening.events, ...b.closeTurn({ kind: 'move', index: 0 })]
      : [...opening.events];
    const seen = replay(shownBefore, events);
    expect(seen.atFaint, 'the replacement took the killing blow').toBe(0);
    expect(seen.sendOuts, 'the replacement never walked on').toBe(1);
    expect(seen.atEnd, 'the wrong agent is left on the field').toBe(1);
  });

  it('every foe damage event before the sendOut belongs to the fainted agent', () => {
    const b = trainerDuel();
    const opening = b.openTurn();
    const events = opening.playerActs
      ? [...opening.events, ...b.closeTurn({ kind: 'move', index: 0 })]
      : [...opening.events];
    const cut = events.findIndex((e) => e.t === 'sendOut' && e.side === 'foe');
    expect(cut, 'no replacement was sent out').toBeGreaterThan(0);
    const hits = events.slice(0, cut).filter((e) => e.t === 'damage' && e.side === 'foe');
    expect(hits.length, 'the foe was never hit').toBeGreaterThan(0);
    // The last one must land on zero: that is the agent the faint refers to.
    expect((hits.at(-1) as { to: number }).to, 'the KO blow did not empty the bar').toBe(0);
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

describe('forms', () => {
  /**
   * REACHYMINI is the only species with alternate looks. Colour forms are pure
   * palette swaps; shape forms bring their own typing and moves. Everything
   * downstream (sprite key, learnset, type chart) has to follow the form, and
   * every species that predates forms has to keep behaving exactly as before.
   */
  it('only species that declare forms have them, and every form is well formed', () => {
    const problems: string[] = [];
    for (const s of allSpecies()) {
      for (const f of s.forms) {
        if (!f.key || !f.label) problems.push(`${s.key}: form with no key/label`);
        if (f.kind !== 'colour' && f.kind !== 'shape') problems.push(`${s.key}/${f.key}: bad kind`);
        if (f.kind === 'shape') {
          if (!f.types?.length) problems.push(`${s.key}/${f.key}: shape form without types`);
          if (!f.learnset?.length) problems.push(`${s.key}/${f.key}: shape form without learnset`);
        }
        for (const ty of f.types ?? []) {
          if (!DEX().types[ty]) problems.push(`${s.key}/${f.key}: unknown type ${ty}`);
        }
        for (const [, k] of f.learnset ?? []) {
          if (!DEX().moves[k]) problems.push(`${s.key}/${f.key}: unknown move ${k}`);
        }
      }
    }
    expect(problems).toEqual([]);
  });

  it('a form overrides typing and learnset, and the base is untouched', () => {
    const base = createAgent('reachymini', { level: 30, form: null });
    const zebra = createAgent('reachymini', { level: 30, form: 'zebra' });
    expect(agentTypes(base)).toEqual(speciesDef('reachymini').types);
    expect(agentTypes(zebra)).not.toEqual(agentTypes(base));
    expect(typesOf('reachymini', 'zebra')).toEqual(agentTypes(zebra));
    // Shape forms carry their own moves, so the auto-filled set must differ.
    expect(zebra.moves.map((m) => m.key)).not.toEqual(base.moves.map((m) => m.key));
  });

  it('a colour form is a palette swap: same types, same learnset, own sprite', () => {
    const sky = createAgent('reachymini', { level: 30, form: 'sky' });
    expect(agentTypes(sky)).toEqual(speciesDef('reachymini').types);
    expect(learnsetOf('reachymini', 'sky')).toEqual(speciesDef('reachymini').learnset);
    expect(spriteKey('reachymini', 'sky')).toBe('reachymini_sky');
  });

  it('the untinted colour form falls back to the species sheet', () => {
    // SNOW *is* the base render, so it ships no sheet of its own; asking for
    // one would 404 and leave the battler invisible.
    const snow = speciesDef('reachymini').forms.find((f) => f.kind === 'colour' && !f.tint);
    expect(snow, 'expected an untinted colour form').toBeTruthy();
    expect(spriteKey('reachymini', snow!.key)).toBe('reachymini');
  });

  it('species without forms are completely unaffected', () => {
    const a = createAgent('stackbit', { level: 20 });
    expect(a.form).toBeNull();
    expect(spriteKey('stackbit', a.form)).toBe('stackbit');
    expect(agentTypes(a)).toEqual(speciesDef('stackbit').types);
  });

  it('an unknown form key never crashes and never changes behaviour', () => {
    expect(typesOf('reachymini', 'nope')).toEqual(speciesDef('reachymini').types);
    expect(spriteKey('reachymini', 'nope')).toBe('reachymini');
    // Saves written before forms existed have no `form` field at all.
    const legacy = createAgent('reachymini', { level: 10 });
    delete (legacy as { form?: string | null }).form;
    expect(agentTypes(legacy)).toEqual(speciesDef('reachymini').types);
  });

  it('evolving drops a form the new species does not have', () => {
    const a = createAgent('reachymini', { level: 30, form: 'zebra' });
    evolveTo(a, 'stackbit');
    expect(a.form).toBeNull();
    expect(agentTypes(a)).toEqual(speciesDef('stackbit').types);
  });

  it('every declared form that needs art has a sheet on disk', () => {
    const problems: string[] = [];
    for (const s of allSpecies()) {
      for (const f of s.forms) {
        const key = spriteKey(s.key, f.key);
        if (key === s.key) continue;
        for (const suffix of ['', '_back']) {
          const p = new URL(`../public/assets/creatures/${key}${suffix}.png`, import.meta.url);
          if (!existsSync(fileURLToPath(p))) problems.push(`missing ${key}${suffix}.png`);
        }
        if (hasCoverPose(s.key, f.key)) {
          const p = new URL(`../public/assets/creatures/${key}_cover.png`, import.meta.url);
          if (!existsSync(fileURLToPath(p))) problems.push(`missing ${key}_cover.png`);
        }
      }
      if (hasCoverPose(s.key, null)) {
        const p = new URL(`../public/assets/creatures/${s.key}_cover.png`, import.meta.url);
        if (!existsSync(fileURLToPath(p))) problems.push(`missing ${s.key}_cover.png`);
      }
    }
    expect(problems).toEqual([]);
  });
});

describe('COVER', () => {
  /**
   * COVER closes the shell for exactly one turn: no damage gets through, a
   * tenth of max HP comes back, and - deliberately - a wild unit can still be
   * caught while hiding. Chaining it has to decay, or the move is a soft lock.
   */
  function stage(seed: number, foeMove = 'tackle'): Battle {
    const mine = createAgent('reachymini', { level: 30, form: null, moves: ['cover', 'tackle'] });
    const theirs = createAgent('boltkin', { level: 30, moves: [foeMove] });
    return new Battle([mine], [theirs], { kind: 'wild', playerName: 'AAA', canRun: true, seed });
  }

  it('blocks every incoming damaging move for the turn', () => {
    for (let seed = 1; seed <= 30; seed++) {
      const b = stage(seed);
      b.playerC.agent.hp = 1;
      b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      expect(b.playerC.agent.hp, `seed ${seed}: damage leaked through COVER`).toBeGreaterThan(0);
    }
  });

  it('restores a tenth of max HP', () => {
    const b = stage(7);
    const max = maxHp(b.playerC.agent);
    b.playerC.agent.hp = Math.floor(max / 2);
    const before = b.playerC.agent.hp;
    b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.playerC.agent.hp).toBe(before + Math.floor(max / 10));
  });

  it('lasts exactly one turn', () => {
    const b = stage(11);
    b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.playerC.covered, 'the shell stayed shut into the next turn').toBe(false);
    const before = b.playerC.agent.hp;
    b.takeTurn({ kind: 'move', index: 1 }, { kind: 'move', index: 0 });
    expect(b.playerC.agent.hp, 'the next attack should land').toBeLessThan(before);
  });

  it('decays when chained, so it can never stall forever', () => {
    // Two independent brakes: PP (10 uses) and the halving ladder. This isolates
    // the ladder by topping PP up, so a shell that never failed would show up.
    const b = stage(3);
    let failures = 0;
    for (let i = 0; i < 60; i++) {
      b.playerC.agent.hp = maxHp(b.playerC.agent);
      b.playerC.agent.moves[0]!.pp = b.playerC.agent.moves[0]!.maxPp;
      const before = b.playerC.coverStreak;
      b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
      if (before > 0 && b.playerC.coverStreak === 0) failures++;
    }
    expect(failures, 'COVER never failed - infinite stall').toBeGreaterThan(5);
  });

  it('runs out of PP long before it becomes a lock', () => {
    const b = stage(3);
    for (let i = 0; i < 40; i++) {
      b.playerC.agent.hp = maxHp(b.playerC.agent);
      b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    }
    expect(b.playerC.agent.moves[0]!.pp).toBe(0);
  });

  it('using any other move resets the ladder', () => {
    const b = stage(5);
    b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.playerC.coverStreak).toBe(1);
    b.takeTurn({ kind: 'move', index: 1 }, { kind: 'move', index: 0 });
    expect(b.playerC.coverStreak).toBe(0);
  });

  it('a hiding wild unit can still be caught', () => {
    // Explicit design call: hiding makes a robot easier to scoop up, not safe.
    // COVER has priority 4, so forcing it as the foe's action makes it resolve
    // in `openTurn` - the shell is shut while the ball is still in the air.
    let caught = false;
    let everCovered = false;
    for (let seed = 1; seed <= 60 && !caught; seed++) {
      const mine = createAgent('stackbit', { level: 40, moves: ['tackle'] });
      const wild = createAgent('reachymini', { level: 5, form: null, moves: ['cover'] });
      const b = new Battle([mine], [wild], { kind: 'wild', playerName: 'AAA', canRun: true, seed });
      b.openTurn({ kind: 'move', index: 0 });
      if (!b.foeC.covered) continue;
      everCovered = true;
      b.closeTurn({ kind: 'item', key: 'quantumcore' });
      if (b.outcome === 'caught') caught = true;
    }
    expect(everCovered, 'the wild unit never covered').toBe(true);
    expect(caught, 'a covered wild unit was never catchable').toBe(true);
  });

  it('status moves still get through a closed shell', () => {
    const b = stage(9, 'static_field');
    b.takeTurn({ kind: 'move', index: 0 }, { kind: 'move', index: 0 });
    expect(b.playerC.agent.status).not.toBe('none');
  });
});

// --------------------------------------------------------------------------- //
// Move effects
// --------------------------------------------------------------------------- //
describe('move fx', () => {
  const moves = (): MoveDef[] => Object.values(DEX().moves);

  it('every move in the dex resolves to an effect', () => {
    const kinds = new Set<string>(FX_KINDS);
    for (const m of moves()) {
      const fx = resolveMoveFx(m);
      expect(kinds.has(fx.kind), `${m.key} -> unknown kind ${fx.kind}`).toBe(true);
      expect(fx.color, `${m.key} has no colour`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(fx.core, `${m.key} has no beam core colour`).toMatch(/^#[0-9a-f]{6}$/i);
      expect(fx.intensity, `${m.key} intensity out of range`).toBeGreaterThan(0);
      expect(fx.intensity).toBeLessThanOrEqual(1);
    }
  });

  it('every override names a move that actually exists', () => {
    // A typo here would silently fall back to the generic look, which is
    // exactly the regression this whole table exists to prevent.
    for (const key of Object.keys(MOVE_FX_OVERRIDE)) {
      expect(DEX().moves[key], `override for unknown move '${key}'`).toBeTruthy();
    }
  });

  it('damaging moves resolve on the target, self-buffs on the user', () => {
    for (const m of moves()) {
      const fx = resolveMoveFx(m);
      if (m.power > 0) {
        expect(fx.target, `${m.key} is a damaging move but plays on the user`).toBe('foe');
        expect(fx.shake, `${m.key} deals damage but never shakes`).toBeGreaterThan(0);
      }
      if (fx.kind === 'heal' || fx.kind === 'buff' || fx.kind === 'guard') {
        expect(fx.target, `${m.key} buffs but plays on the foe`).toBe('self');
        expect(fx.lunge, `${m.key} is a self effect but lunges`).toBe(0);
      }
    }
  });

  it('multi-hit moves play one impact per hit', () => {
    const multi = moves().filter((m) => m.effect === 'multi_hit');
    expect(multi.length, 'no multi-hit moves in the dex').toBeGreaterThan(0);
    for (const m of multi) expect(resolveMoveFx(m).hits).toBeGreaterThan(1);
  });

  it('uses a broad spread of effect kinds', () => {
    // Guards against the mapping collapsing so that everything looks the same
    // again, which is the bug this feature was built to fix.
    const used = new Set(moves().map((m) => resolveMoveFx(m).kind));
    expect(used.size, `only ${used.size} distinct effects across the dex`).toBeGreaterThanOrEqual(12);
  });

  it('players out a full effect without stalling', () => {
    const fx = new MoveFxPlayer();
    for (const m of moves()) {
      fx.play(resolveMoveFx(m), { x: 62, y: 114, r: 28 }, { x: 174, y: 68, r: 23 });
      let guard = 0;
      while (!fx.done && guard++ < 600) fx.update();
      expect(fx.done, `${m.key} never finished`).toBe(true);
      expect(fx.contacted, `${m.key} never connected`).toBe(true);
      fx.cancel();
    }
  });

  it('draws without throwing for every move', () => {
    const g = stubContext() as unknown as CanvasRenderingContext2D;
    const fx = new MoveFxPlayer();
    for (const m of moves()) {
      fx.play(resolveMoveFx(m), { x: 62, y: 114, r: 28 }, { x: 174, y: 68, r: 23 });
      let guard = 0;
      while (!fx.done && guard++ < 600) {
        fx.update();
        fx.draw(g);
      }
      fx.cancel();
    }
  });
});
