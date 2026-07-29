/** The complete, serialisable save file. Everything the cloud stores lives here. */

import type { AgentInstance } from './data/agent.ts';

export const SAVE_VERSION = 1;

export type Facing = 'down' | 'up' | 'left' | 'right';

export interface BagEntry {
  key: string;
  count: number;
}

export interface DexRecord {
  seen: string[];
  caught: string[];
}

export interface PlayerPos {
  map: string;
  x: number;
  y: number;
  facing: Facing;
}

export interface SaveData {
  version: number;
  playerName: string;
  trainerId: number;
  gender: 'm' | 'f';
  money: number;
  playtimeFrames: number;
  pos: PlayerPos;
  /** Where the player respawns after a blackout. */
  respawn: PlayerPos;
  party: AgentInstance[];
  boxes: AgentInstance[][];
  bag: BagEntry[];
  dex: DexRecord;
  badges: string[];
  /** Arbitrary story/NPC flags. */
  flags: Record<string, number>;
  /** Rival's chosen starter. */
  rivalStarter: string | null;
  rivalName: string;
  /** Steps remaining on the active repel, if any. */
  repelSteps: number;
  options: GameOptions;
  savedAt: number;
}

export interface GameOptions {
  textSpeed: 0 | 1 | 2;
  battleStyle: 'shift' | 'set';
  musicVolume: number;
  sfxVolume: number;
  muted: boolean;
  frame: number;
}

export const DEFAULT_OPTIONS: GameOptions = {
  textSpeed: 1,
  battleStyle: 'shift',
  musicVolume: 0.34,
  sfxVolume: 0.42,
  muted: false,
  frame: 0,
};

/** Storage banks. `newSave` allocates all of them empty; `addAgent` tops up
 *  legacy saves that were written with fewer. */
export const BOX_COUNT = 8;
export const BOX_SIZE = 30;

export function newSave(playerName: string, gender: 'm' | 'f', rivalName: string): SaveData {
  return {
    version: SAVE_VERSION,
    playerName,
    trainerId: Math.floor(Math.random() * 65536),
    gender,
    money: 3000,
    playtimeFrames: 0,
    pos: { map: 'home_bedroom', x: 3, y: 4, facing: 'down' },
    respawn: { map: 'home_ground', x: 4, y: 6, facing: 'down' },
    party: [],
    boxes: Array.from({ length: BOX_COUNT }, () => []),
    bag: [{ key: 'nanocore', count: 5 }, { key: 'patch', count: 3 }],
    dex: { seen: [], caught: [] },
    badges: [],
    flags: {},
    rivalStarter: null,
    rivalName,
    repelSteps: 0,
    options: { ...DEFAULT_OPTIONS },
    savedAt: Date.now(),
  };
}

// --------------------------------------------------------------------------- //
// Bag helpers
// --------------------------------------------------------------------------- //
export function bagAdd(save: SaveData, key: string, count = 1): void {
  const entry = save.bag.find((b) => b.key === key);
  if (entry) entry.count = Math.min(99, entry.count + count);
  else save.bag.push({ key, count: Math.min(99, count) });
}

export function bagRemove(save: SaveData, key: string, count = 1): boolean {
  const i = save.bag.findIndex((b) => b.key === key);
  if (i < 0) return false;
  const entry = save.bag[i]!;
  if (entry.count < count) return false;
  entry.count -= count;
  if (entry.count <= 0) save.bag.splice(i, 1);
  return true;
}

export function bagCount(save: SaveData, key: string): number {
  return save.bag.find((b) => b.key === key)?.count ?? 0;
}

export function hasItem(save: SaveData, key: string): boolean {
  return bagCount(save, key) > 0;
}

// --------------------------------------------------------------------------- //
// Flags & dex
// --------------------------------------------------------------------------- //
export function flag(save: SaveData, key: string): number {
  return save.flags[key] ?? 0;
}

export function setFlag(save: SaveData, key: string, value = 1): void {
  save.flags[key] = value;
}

export function seeSpecies(save: SaveData, key: string): void {
  if (!save.dex.seen.includes(key)) save.dex.seen.push(key);
}

export function catchSpecies(save: SaveData, key: string): void {
  seeSpecies(save, key);
  if (!save.dex.caught.includes(key)) save.dex.caught.push(key);
}

// --------------------------------------------------------------------------- //
// Party helpers
// --------------------------------------------------------------------------- //
export function firstHealthy(save: SaveData): AgentInstance | undefined {
  return save.party.find((a) => a.hp > 0);
}

export function partyWiped(save: SaveData): boolean {
  return save.party.length > 0 && save.party.every((a) => a.hp <= 0);
}

/** Adds to the party, or to the first box with room. Returns where it went. */
export function addAgent(save: SaveData, agent: AgentInstance): 'party' | 'box' | 'full' {
  if (save.party.length < 6) {
    save.party.push(agent);
    return 'party';
  }
  for (const box of save.boxes) {
    if (box.length < BOX_SIZE) {
      box.push(agent);
      return 'box';
    }
  }
  // Open a fresh bank rather than releasing the capture, up to the cap.
  if (save.boxes.length < BOX_COUNT) {
    save.boxes.push([agent]);
    return 'box';
  }
  return 'full';
}

export function formatPlaytime(frames: number): string {
  const totalSeconds = Math.floor(frames / 60);
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  return `${h}:${m.toString().padStart(2, '0')}`;
}

export function formatMoney(n: number): string {
  return n.toLocaleString('en-US');
}

/** Repair the shape of a save loaded from disk/cloud so old files keep working. */
export function migrate(raw: unknown): SaveData {
  const s = raw as Partial<SaveData>;
  const base = newSave(s.playerName ?? 'ADA', s.gender ?? 'm', s.rivalName ?? 'REX');
  const merged: SaveData = {
    ...base,
    ...s,
    options: { ...DEFAULT_OPTIONS, ...(s.options ?? {}) },
    dex: { seen: s.dex?.seen ?? [], caught: s.dex?.caught ?? [] },
    flags: s.flags ?? {},
    bag: s.bag ?? base.bag,
    party: s.party ?? [],
    boxes: s.boxes ?? base.boxes,
    badges: s.badges ?? [],
    version: SAVE_VERSION,
  };
  while (merged.boxes.length < BOX_COUNT) merged.boxes.push([]);
  return merged;
}
