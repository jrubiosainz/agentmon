export type UserRecord = {
  id: string;
  email: string;
  emailLower: string;
  displayName: string;
  passwordHash: string;
  salt: string;
  createdAt: string;
  lastLoginAt?: string;
};

export type SaveSummary = {
  playerName: string;
  badges: number;
  partyCount: number;
  dexSeen: number;
  dexCaught: number;
  location: string;
  level: number;
};

export type SaveRecord = {
  id: string;
  userId: string;
  slot: number;
  version: number;
  updatedAt: string;
  playTimeSeconds: number;
  summary: SaveSummary;
  data: unknown;
};

export interface Store {
  createUser(u: UserRecord): Promise<void>;
  getUserByEmail(email: string): Promise<UserRecord | null>;
  getUserById(id: string): Promise<UserRecord | null>;
  updateUser(u: UserRecord): Promise<void>;
  listSaves(userId: string): Promise<SaveRecord[]>;
  getSave(userId: string, slot: number): Promise<SaveRecord | null>;
  putSave(save: SaveRecord): Promise<SaveRecord>;
  deleteSave(userId: string, slot: number): Promise<void>;
}

export function saveRecordId(userId: string, slot: number): string {
  return `${userId}:${slot}`;
}
