/**
 * LocalSaveStore: a localStorage-backed fallback that mirrors the same save
 * API surface as `api` (see api.ts) so the game remains fully playable while
 * logged out / offline. Keys are namespaced under `agentmon.save.<slot>`.
 */

import type { SaveMeta, SaveSummary } from './api.js';

const KEY_PREFIX = 'agentmon.save.';
const SLOTS = [1, 2, 3];

type StoredSave = {
  slot: number;
  version: number;
  updatedAt: string;
  playTimeSeconds: number;
  summary: SaveSummary;
  data: unknown;
};

function keyFor(slot: number): string {
  return `${KEY_PREFIX}${slot}`;
}

function readSlot(slot: number): StoredSave | null {
  try {
    const raw = localStorage.getItem(keyFor(slot));
    if (!raw) return null;
    return JSON.parse(raw) as StoredSave;
  } catch {
    return null;
  }
}

function writeSlot(slot: number, save: StoredSave): void {
  try {
    localStorage.setItem(keyFor(slot), JSON.stringify(save));
  } catch {
    // ignore storage quota errors
  }
}

function toMeta(save: StoredSave): SaveMeta {
  return {
    slot: save.slot,
    version: save.version,
    updatedAt: save.updatedAt,
    playTimeSeconds: save.playTimeSeconds,
    summary: save.summary,
  };
}

export const localSaves = {
  async listSaves(): Promise<SaveMeta[]> {
    const saves: SaveMeta[] = [];
    for (const slot of SLOTS) {
      const save = readSlot(slot);
      if (save) saves.push(toMeta(save));
    }
    return saves.sort((a, b) => a.slot - b.slot);
  },

  async loadSave(slot: number): Promise<{ save: StoredSave } | null> {
    const save = readSlot(slot);
    return save ? { save } : null;
  },

  async saveSlot(
    slot: number,
    payload: { playTimeSeconds: number; summary: SaveSummary; data: unknown },
  ): Promise<SaveMeta> {
    const existing = readSlot(slot);
    const save: StoredSave = {
      slot,
      version: (existing?.version ?? 0) + 1,
      updatedAt: new Date().toISOString(),
      playTimeSeconds: payload.playTimeSeconds,
      summary: payload.summary,
      data: payload.data,
    };
    writeSlot(slot, save);
    return toMeta(save);
  },

  async deleteSave(slot: number): Promise<void> {
    try {
      localStorage.removeItem(keyFor(slot));
    } catch {
      // ignore storage errors
    }
  },
};
