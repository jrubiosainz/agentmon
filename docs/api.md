# Agéntmon API

Base URL: same origin as the deployed site (e.g. `https://<app>.azurewebsites.net`), or
`http://localhost:8080` in local dev (the Vite dev server proxies `/api/*` to this port).

All request/response bodies are JSON. All error responses share this shape:

```json
{
  "error": {
    "code": "SOME_CODE",
    "message": "Human readable message",
    "details": { "...optional zod validation details..." }
  }
}
```

## Authentication

Two authentication mechanisms are supported simultaneously and interchangeably:

1. **Bearer token** - send `Authorization: Bearer <token>` (the token returned by
   register/login).
2. **HttpOnly cookie** - register/login also set an `am_token` HttpOnly cookie
   (`SameSite=Lax`, `Secure` in production, 30-day expiry). Send requests with
   `credentials: 'include'` to use it; no header needed.

`requireAuth` middleware accepts either. If both are absent/invalid, endpoints
return `401 UNAUTHORIZED`.

Auth endpoints (`/register`, `/login`) are rate-limited to **10 requests per 15
minutes per IP**.

---

### `POST /api/auth/register`

Create a new account.

**Body**

```json
{
  "email": "trainer1@example.com",
  "password": "sup3rsecret",
  "displayName": "Ash K"
}
```

- `password`: minimum 8 characters.
- `displayName`: 3-20 characters, letters/numbers/space/`-`/`_` only.

**201 Created**

```json
{
  "user": { "id": "uuid", "email": "trainer1@example.com", "displayName": "Ash K" },
  "token": "<jwt>"
}
```

**Errors**: `400 VALIDATION_ERROR`, `409 EMAIL_TAKEN`.

---

### `POST /api/auth/login`

**Body**

```json
{ "email": "trainer1@example.com", "password": "sup3rsecret" }
```

**200 OK** - same shape as register's success response.

**Errors**: `400 VALIDATION_ERROR`, `401 INVALID_CREDENTIALS` (generic - does not
reveal whether the email exists).

---

### `POST /api/auth/logout`

Clears the `am_token` cookie. No body required.

**200 OK**

```json
{ "ok": true }
```

---

### `GET /api/auth/me`

Requires auth.

**200 OK**

```json
{ "user": { "id": "uuid", "email": "trainer1@example.com", "displayName": "Ash K" } }
```

**Errors**: `401 UNAUTHORIZED`, `404 NOT_FOUND` (user deleted since token issued).

---

## Saves

All endpoints below require auth. Slots are integers `1`-`3`.

### `GET /api/saves`

List save **summaries** (the heavy `data` field is omitted) for the current user,
sorted by slot ascending.

**200 OK**

```json
{
  "saves": [
    {
      "id": "userId:1",
      "userId": "userId",
      "slot": 1,
      "version": 2,
      "updatedAt": "2026-07-29T12:14:29.493Z",
      "playTimeSeconds": 1234,
      "summary": {
        "playerName": "Ash",
        "badges": 2,
        "partyCount": 3,
        "dexSeen": 10,
        "dexCaught": 5,
        "location": "Route 1",
        "level": 12
      }
    }
  ]
}
```

---

### `GET /api/saves/:slot`

Full save, including the `data` payload.

**200 OK**

```json
{
  "save": {
    "id": "userId:1",
    "userId": "userId",
    "slot": 1,
    "version": 2,
    "updatedAt": "2026-07-29T12:14:29.493Z",
    "playTimeSeconds": 1234,
    "summary": { "...": "..." },
    "data": { "inventory": ["pokeball", "potion"], "flags": { "metRival": true } }
  }
}
```

**Errors**: `400 INVALID_SLOT`, `404 NOT_FOUND`.

---

### `PUT /api/saves/:slot`

Create or overwrite a save slot. `version` is server-managed: it starts at `1`
and increments on every successful write; `updatedAt` is server-set.

**Body**

```json
{
  "playTimeSeconds": 1234,
  "summary": {
    "playerName": "Ash",
    "badges": 2,
    "partyCount": 3,
    "dexSeen": 10,
    "dexCaught": 5,
    "location": "Route 1",
    "level": 12
  },
  "data": { "inventory": ["pokeball", "potion"], "flags": { "metRival": true } }
}
```

- `data` is opaque game state; capped at **512 KB** of JSON.

**200 OK** - the updated save **summary** (no `data` field):

```json
{
  "id": "userId:1",
  "userId": "userId",
  "slot": 1,
  "version": 2,
  "updatedAt": "2026-07-29T12:14:29.493Z",
  "playTimeSeconds": 1234,
  "summary": { "...": "..." }
}
```

**Errors**: `400 INVALID_SLOT`, `400 VALIDATION_ERROR`, `413 PAYLOAD_TOO_LARGE`.

---

### `DELETE /api/saves/:slot`

**204 No Content** on success (idempotent - deleting a non-existent slot also
returns 204).

**Errors**: `400 INVALID_SLOT`.

---

## Health

### `GET /api/health`

No auth required.

**200 OK**

```json
{ "status": "ok", "store": "memory", "version": "1.0.0", "uptime": 13.75 }
```

`store` is `"cosmos"` when `COSMOS_ENDPOINT`/`COSMOS_KEY` are configured, or
`"memory"` otherwise (local dev / CI fallback - not persistent).
