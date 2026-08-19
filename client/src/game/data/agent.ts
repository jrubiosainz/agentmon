/** A single owned/wild Agéntmon instance and the maths that governs it. */

import { rng } from '../../engine/rng.ts';
import {
  expForLevel, levelForExp, move, species,
  type MoveDef, type SpeciesDef, type Stats, type TypeKey,
} from './dex.ts';

export type StatusKey = 'none' | 'poison' | 'burn' | 'freeze' | 'paralysis' | 'sleep' | 'confusion';

/**
 * Status labels stay English here: this module is evaluated at import time, so a
 * `t()` call in these literals would freeze the boot language forever. Read
 * sites wrap them in `tUpper()` instead.
 */
export const STATUS_SHORT: Record<StatusKey, string> = {
  none: '', poison: 'CRP', burn: 'OVH', freeze: 'FRZ',
  paralysis: 'SHT', sleep: 'SLP', confusion: 'CNF',
};

export const STATUS_NAME: Record<StatusKey, string> = {
  none: '', poison: 'CORRUPTED', burn: 'OVERHEATED', freeze: 'FROZEN',
  paralysis: 'SHORTED', sleep: 'SLEEPING', confusion: 'CONFUSED',
};

/** Localisable status labels, for the catalogue extractor. */
export function statusStrings(): string[] {
  return [...Object.values(STATUS_SHORT), ...Object.values(STATUS_NAME)].filter(Boolean);
}

export const STATUS_COLOR: Record<StatusKey, string> = {
  none: '#f8f8f8', poison: '#a040a0', burn: '#f08030', freeze: '#68d0f8',
  paralysis: '#f8d030', sleep: '#8090a0', confusion: '#f88098',
};

export interface MoveSlot {
  key: string;
  pp: number;
  maxPp: number;
}

export interface AgentInstance {
  /** Unique per save so party/box references stay stable. */
  uid: string;
  speciesKey: string;
  nickname: string | null;
  level: number;
  exp: number;
  ivs: Stats;
  evs: Stats;
  hp: number;
  status: StatusKey;
  /** Turns of forced sleep left. */
  sleepTurns: number;
  moves: MoveSlot[];
  /** Trainer id that caught it (for the traded-boost flavour and dex ownership). */
  otName: string;
  otId: number;
  /** Where and when it was met. */
  metMap: string;
  metLevel: number;
  shiny: boolean;
  /** Friendship-ish stat used by NET CORE and a few dialogue checks. */
  bond: number;
  /** Species to evolve into once the current battle finishes. */
  pendingEvolution?: string;
}

const ZERO: Stats = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };

function randomIvs(): Stats {
  return {
    hp: rng.int(0, 31), atk: rng.int(0, 31), def: rng.int(0, 31),
    spa: rng.int(0, 31), spd: rng.int(0, 31), spe: rng.int(0, 31),
  };
}

let uidCounter = 0;
export function newUid(): string {
  uidCounter = (uidCounter + 1) % 100000;
  return `${Date.now().toString(36)}${uidCounter.toString(36)}${rng.int(0, 1295).toString(36)}`;
}

export function statAt(sp: SpeciesDef, key: keyof Stats, level: number, iv: number, ev: number): number {
  const base = sp.baseStats[key];
  if (key === 'hp') {
    return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + level + 10;
  }
  return Math.floor(((2 * base + iv + Math.floor(ev / 4)) * level) / 100) + 5;
}

export function maxHp(a: AgentInstance): number {
  return statAt(species(a.speciesKey), 'hp', a.level, a.ivs.hp, a.evs.hp);
}

export function stats(a: AgentInstance): Stats {
  const sp = species(a.speciesKey);
  return {
    hp: statAt(sp, 'hp', a.level, a.ivs.hp, a.evs.hp),
    atk: statAt(sp, 'atk', a.level, a.ivs.atk, a.evs.atk),
    def: statAt(sp, 'def', a.level, a.ivs.def, a.evs.def),
    spa: statAt(sp, 'spa', a.level, a.ivs.spa, a.evs.spa),
    spd: statAt(sp, 'spd', a.level, a.ivs.spd, a.evs.spd),
    spe: statAt(sp, 'spe', a.level, a.ivs.spe, a.evs.spe),
  };
}

/** The four most recent level-up moves at or below `level`. */
export function defaultMoves(speciesKey: string, level: number): MoveSlot[] {
  const sp = species(speciesKey);
  const learned = sp.learnset.filter(([lv]) => lv <= level).map(([, key]) => key);
  const unique: string[] = [];
  for (const k of learned) if (!unique.includes(k)) unique.push(k);
  return unique.slice(-4).map((key) => {
    const m = move(key);
    return { key, pp: m.pp, maxPp: m.pp };
  });
}

export interface CreateOptions {
  level: number;
  nickname?: string | null;
  otName?: string;
  otId?: number;
  metMap?: string;
  moves?: string[];
  shinyChance?: number;
  ivFloor?: number;
}

export function createAgent(speciesKey: string, opts: CreateOptions): AgentInstance {
  const sp = species(speciesKey);
  const level = Math.max(1, Math.min(100, opts.level));
  const ivs = randomIvs();
  if (opts.ivFloor) {
    for (const k of Object.keys(ivs) as (keyof Stats)[]) {
      ivs[k] = Math.max(ivs[k], opts.ivFloor);
    }
  }
  const agent: AgentInstance = {
    uid: newUid(),
    speciesKey,
    nickname: opts.nickname ?? null,
    level,
    exp: expForLevel(sp.growthRate, level),
    ivs,
    evs: { ...ZERO },
    hp: 0,
    status: 'none',
    sleepTurns: 0,
    moves: opts.moves
      ? opts.moves.map((key) => ({ key, pp: move(key).pp, maxPp: move(key).pp }))
      : defaultMoves(speciesKey, level),
    otName: opts.otName ?? 'WILD',
    otId: opts.otId ?? 0,
    metMap: opts.metMap ?? 'unknown',
    metLevel: level,
    shiny: rng.next() < (opts.shinyChance ?? 1 / 512),
    bond: 70,
  };
  agent.hp = maxHp(agent);
  return agent;
}

export function displayName(a: AgentInstance): string {
  return a.nickname ?? species(a.speciesKey).name;
}

export function isFainted(a: AgentInstance): boolean {
  return a.hp <= 0;
}

export function types(a: AgentInstance): TypeKey[] {
  return species(a.speciesKey).types;
}

export function healFully(a: AgentInstance): void {
  a.hp = maxHp(a);
  a.status = 'none';
  a.sleepTurns = 0;
  for (const m of a.moves) m.pp = m.maxPp;
}

export function expToNextLevel(a: AgentInstance): { have: number; need: number } {
  const sp = species(a.speciesKey);
  if (a.level >= 100) return { have: 1, need: 1 };
  const cur = expForLevel(sp.growthRate, a.level);
  const next = expForLevel(sp.growthRate, a.level + 1);
  return { have: a.exp - cur, need: Math.max(1, next - cur) };
}

export interface LevelUpResult {
  levels: number[];
  learned: { level: number; move: MoveDef }[];
  hpGain: number;
}

/** Apply experience, returning the levels gained and moves that became available. */
export function gainExp(a: AgentInstance, amount: number): LevelUpResult {
  const sp = species(a.speciesKey);
  const before = a.level;
  const beforeMax = maxHp(a);
  a.exp = Math.min(a.exp + Math.max(0, amount), expForLevel(sp.growthRate, 100));
  const after = levelForExp(sp.growthRate, a.exp);
  const levels: number[] = [];
  const learned: { level: number; move: MoveDef }[] = [];
  for (let lv = before + 1; lv <= after; lv++) {
    levels.push(lv);
    for (const [reqLv, key] of sp.learnset) {
      if (reqLv === lv) learned.push({ level: lv, move: move(key) });
    }
  }
  a.level = after;
  const hpGain = maxHp(a) - beforeMax;
  if (hpGain > 0) a.hp += hpGain;
  return { levels, learned, hpGain };
}

/** Award EVs from a defeated opponent (simplified: spread by base stats). */
export function gainEvs(a: AgentInstance, foe: SpeciesDef): void {
  const entries = Object.entries(foe.baseStats) as [keyof Stats, number][];
  entries.sort((x, y) => y[1] - x[1]);
  const best = entries[0]![0];
  const total = Object.values(a.evs).reduce((s, v) => s + v, 0);
  if (total >= 510) return;
  a.evs[best] = Math.min(252, a.evs[best] + 2);
}

export function canEvolve(a: AgentInstance): string | null {
  const sp = species(a.speciesKey);
  if (sp.evolution && a.level >= sp.evolution.level) return sp.evolution.to;
  return null;
}

export function evolveTo(a: AgentInstance, targetKey: string): void {
  const beforeMax = maxHp(a);
  a.speciesKey = targetKey;
  const gain = maxHp(a) - beforeMax;
  if (gain > 0) a.hp += gain;
}

/** Moves the species would learn at exactly this level (used post-evolution). */
export function movesAtLevel(speciesKey: string, level: number): MoveDef[] {
  return species(speciesKey).learnset
    .filter(([lv]) => lv === level)
    .map(([, key]) => move(key));
}

export function learnMove(a: AgentInstance, key: string, replaceIndex?: number): boolean {
  if (a.moves.some((m) => m.key === key)) return false;
  const m = move(key);
  const slot: MoveSlot = { key, pp: m.pp, maxPp: m.pp };
  if (a.moves.length < 4) {
    a.moves.push(slot);
    return true;
  }
  if (replaceIndex !== undefined && replaceIndex >= 0 && replaceIndex < 4) {
    a.moves[replaceIndex] = slot;
    return true;
  }
  return false;
}
