import type { SaveRecord, Store, UserRecord } from './store.js';
import { saveRecordId } from './store.js';

/**
 * A simple in-memory Store implementation used for local development and CI
 * when Cosmos DB is not configured. Not persisted across process restarts.
 */
export class MemoryStore implements Store {
  private usersById = new Map<string, UserRecord>();
  private usersByEmail = new Map<string, string>(); // emailLower -> id
  private saves = new Map<string, SaveRecord>(); // `${userId}:${slot}` -> record

  async createUser(u: UserRecord): Promise<void> {
    if (this.usersByEmail.has(u.emailLower)) {
      const err = new Error('User with this email already exists') as Error & { code?: string };
      err.code = 'CONFLICT';
      throw err;
    }
    this.usersById.set(u.id, { ...u });
    this.usersByEmail.set(u.emailLower, u.id);
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const id = this.usersByEmail.get(email.toLowerCase());
    if (!id) return null;
    const user = this.usersById.get(id);
    return user ? { ...user } : null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const user = this.usersById.get(id);
    return user ? { ...user } : null;
  }

  async updateUser(u: UserRecord): Promise<void> {
    this.usersById.set(u.id, { ...u });
  }

  async listSaves(userId: string): Promise<SaveRecord[]> {
    const results: SaveRecord[] = [];
    for (const save of this.saves.values()) {
      if (save.userId === userId) results.push({ ...save });
    }
    return results.sort((a, b) => a.slot - b.slot);
  }

  async getSave(userId: string, slot: number): Promise<SaveRecord | null> {
    const save = this.saves.get(saveRecordId(userId, slot));
    return save ? { ...save } : null;
  }

  async putSave(save: SaveRecord): Promise<SaveRecord> {
    const stored = { ...save };
    this.saves.set(saveRecordId(save.userId, save.slot), stored);
    return { ...stored };
  }

  async deleteSave(userId: string, slot: number): Promise<void> {
    this.saves.delete(saveRecordId(userId, slot));
  }
}
