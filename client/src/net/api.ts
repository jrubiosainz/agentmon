/**
 * Typed fetch wrapper for the Agentmon backend API.
 *
 * Uses same-origin requests (base URL `''`) so the Vite dev server proxy
 * (see vite.config.ts) forwards `/api/*` calls to the local backend, and in
 * production the API is served from the same origin as the static client.
 *
 * The JWT returned by register/login is persisted to localStorage so it can
 * be sent as a Bearer token (in addition to the HttpOnly cookie the server
 * also sets), which keeps auth working even in contexts where cookies are
 * unavailable (e.g. some embedded/preview iframes).
 */

const TOKEN_STORAGE_KEY = 'agentmon.token';

export type ApiUser = {
  id: string;
  email: string;
  displayName: string;
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

export type SaveMeta = {
  slot: number;
  version: number;
  updatedAt: string;
  playTimeSeconds: number;
  summary: SaveSummary;
};

export type SaveData = {
  slot: number;
  version: number;
  updatedAt: string;
  playTimeSeconds: number;
  summary: SaveSummary;
  data: unknown;
};

type ApiErrorBody = {
  error?: {
    code?: string;
    message?: string;
    details?: unknown;
  };
};

export class ApiError extends Error {
  code: string;
  status: number;
  details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

function setToken(token: string | null): void {
  try {
    if (token) localStorage.setItem(TOKEN_STORAGE_KEY, token);
    else localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {
    // ignore storage errors (e.g. private browsing quota)
  }
}

const BASE_URL = '';

async function request<T>(
  path: string,
  init: RequestInit = {},
  opts: { allowNull404?: boolean } = {},
): Promise<T> {
  const token = getToken();
  const headers = new Headers(init.headers);
  if (init.body && !headers.has('Content-Type')) {
    headers.set('Content-Type', 'application/json');
  }
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers,
    credentials: 'include',
  });

  if (res.status === 404 && opts.allowNull404) {
    return null as T;
  }

  if (res.status === 204) {
    return undefined as T;
  }

  let body: unknown = undefined;
  const contentType = res.headers.get('content-type') ?? '';
  if (contentType.includes('application/json')) {
    body = await res.json().catch(() => undefined);
  }

  if (!res.ok) {
    const errBody = (body ?? {}) as ApiErrorBody;
    throw new ApiError(
      res.status,
      errBody.error?.code ?? 'UNKNOWN_ERROR',
      errBody.error?.message ?? `Request failed with status ${res.status}`,
      errBody.error?.details,
    );
  }

  return body as T;
}

export const api = {
  async register(
    email: string,
    password: string,
    displayName: string,
  ): Promise<{ user: ApiUser }> {
    const result = await request<{ user: ApiUser; token: string }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ email, password, displayName }),
    });
    setToken(result.token);
    return { user: result.user };
  },

  async login(email: string, password: string): Promise<{ user: ApiUser }> {
    const result = await request<{ user: ApiUser; token: string }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    setToken(result.token);
    return { user: result.user };
  },

  async logout(): Promise<void> {
    try {
      await request<void>('/api/auth/logout', { method: 'POST' });
    } finally {
      setToken(null);
    }
  },

  async me(): Promise<{ user: ApiUser } | null> {
    try {
      return await request<{ user: ApiUser }>('/api/auth/me', { method: 'GET' });
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) return null;
      throw err;
    }
  },

  async listSaves(): Promise<SaveMeta[]> {
    const result = await request<{ saves: SaveMeta[] }>('/api/saves', { method: 'GET' });
    return result.saves;
  },

  async loadSave(slot: number): Promise<{ save: SaveData } | null> {
    return request<{ save: SaveData } | null>(
      `/api/saves/${slot}`,
      { method: 'GET' },
      { allowNull404: true },
    );
  },

  async saveSlot(
    slot: number,
    payload: { playTimeSeconds: number; summary: SaveSummary; data: unknown },
  ): Promise<SaveMeta> {
    return request<SaveMeta>(`/api/saves/${slot}`, {
      method: 'PUT',
      body: JSON.stringify(payload),
    });
  },

  async deleteSave(slot: number): Promise<void> {
    await request<void>(`/api/saves/${slot}`, { method: 'DELETE' });
  },
};
