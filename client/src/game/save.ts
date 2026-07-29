/** Bridges the in-memory save file to the cloud API (with a local fallback). */

import { api, ApiError, type ApiUser, type SaveMeta, type SaveSummary } from '../net/api.ts';
import { localSaves } from '../net/offline.ts';
import { maxHp } from './data/agent.ts';
import { getMap, mapExists } from './data/maps.ts';
import { migrate, type SaveData } from './state.ts';

export const SLOTS = [1, 2, 3];

export function summarise(save: SaveData): SaveSummary {
  const lead = save.party[0];
  return {
    playerName: save.playerName,
    badges: save.badges.length,
    partyCount: save.party.length,
    dexSeen: save.dex.seen.length,
    dexCaught: save.dex.caught.length,
    location: mapExists(save.pos.map) ? getMap(save.pos.map).name : save.pos.map,
    level: lead ? lead.level : 0,
  };
}

export class SaveManager {
  user: ApiUser | null = null;
  online = false;
  lastError: string | null = null;

  private get backend() {
    return this.online && this.user ? api : localSaves;
  }

  /** Probe the session cookie; falls back to local storage when unavailable. */
  async init(): Promise<void> {
    try {
      const res = await api.me();
      this.user = res?.user ?? null;
      this.online = true;
    } catch {
      this.user = null;
      this.online = false;
    }
  }

  async register(email: string, password: string, displayName: string): Promise<boolean> {
    try {
      const res = await api.register(email, password, displayName);
      this.user = res.user;
      this.online = true;
      this.lastError = null;
      return true;
    } catch (err) {
      this.lastError = err instanceof ApiError ? err.message : 'Network unavailable.';
      return false;
    }
  }

  async login(email: string, password: string): Promise<boolean> {
    try {
      const res = await api.login(email, password);
      this.user = res.user;
      this.online = true;
      this.lastError = null;
      return true;
    } catch (err) {
      this.lastError = err instanceof ApiError ? err.message : 'Network unavailable.';
      return false;
    }
  }

  async logout(): Promise<void> {
    try {
      await api.logout();
    } catch {
      // Ignore: the local token is cleared regardless.
    }
    this.user = null;
  }

  async list(): Promise<SaveMeta[]> {
    try {
      return await this.backend.listSaves();
    } catch {
      return localSaves.listSaves();
    }
  }

  async load(slot: number): Promise<SaveData | null> {
    try {
      const res = await this.backend.loadSave(slot);
      if (!res) return null;
      return migrate(res.save.data);
    } catch {
      const res = await localSaves.loadSave(slot);
      return res ? migrate(res.save.data) : null;
    }
  }

  async save(slot: number, data: SaveData): Promise<boolean> {
    data.savedAt = Date.now();
    // Never persist a corrupt HP value.
    for (const a of data.party) a.hp = Math.max(0, Math.min(a.hp, maxHp(a)));
    const payload = {
      playTimeSeconds: Math.floor(data.playtimeFrames / 60),
      summary: summarise(data),
      data: data as unknown,
    };
    // Always mirror locally so a dropped connection never loses progress.
    await localSaves.saveSlot(slot, payload).catch(() => undefined);
    if (!(this.online && this.user)) return true;
    try {
      await api.saveSlot(slot, payload);
      this.lastError = null;
      return true;
    } catch (err) {
      this.lastError = err instanceof ApiError ? err.message : 'Cloud save failed.';
      return false;
    }
  }

  async remove(slot: number): Promise<void> {
    await localSaves.deleteSave(slot).catch(() => undefined);
    if (this.online && this.user) await api.deleteSave(slot).catch(() => undefined);
  }

  /**
   * Synchronous-ish local mirror for `beforeunload` / tab hide, where an
   * awaited round-trip would be cancelled by the browser.
   */
  saveLocal(slot: number, data: SaveData): void {
    data.savedAt = Date.now();
    for (const a of data.party) a.hp = Math.max(0, Math.min(a.hp, maxHp(a)));
    void localSaves.saveSlot(slot, {
      playTimeSeconds: Math.floor(data.playtimeFrames / 60),
      summary: summarise(data),
      data: data as unknown,
    }).catch(() => undefined);
  }
}

export const saves = new SaveManager();
