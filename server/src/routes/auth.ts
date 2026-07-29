import { randomUUID } from 'node:crypto';
import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { z } from 'zod';
import { hashPassword, verifyPassword } from '../auth/password.js';
import { signToken } from '../auth/tokens.js';
import { config } from '../config.js';
import type { Store, UserRecord } from '../db/store.js';
import { sendError } from '../lib/http.js';
import { requireAuth, TOKEN_COOKIE_NAME } from '../middleware/auth.js';

const registerSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(8),
  displayName: z
    .string()
    .trim()
    .min(3)
    .max(20)
    .regex(/^[a-zA-Z0-9 _-]+$/, 'displayName may only contain letters, numbers, spaces, - and _'),
});

const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 10,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many requests, please try again later' } },
});

function publicUser(u: UserRecord) {
  return { id: u.id, email: u.email, displayName: u.displayName };
}

function setAuthCookie(res: import('express').Response, token: string): void {
  res.cookie(TOKEN_COOKIE_NAME, token, {
    httpOnly: true,
    secure: config.isProduction,
    sameSite: 'lax',
    maxAge: 30 * 24 * 60 * 60 * 1000,
    path: '/',
  });
}

export function createAuthRouter(store: Store): Router {
  const router = Router();

  router.post('/register', authLimiter, async (req, res, next) => {
    try {
      const parsed = registerSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
        return;
      }
      const { email, password, displayName } = parsed.data;
      const emailLower = email.toLowerCase();

      const existing = await store.getUserByEmail(emailLower);
      if (existing) {
        sendError(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists');
        return;
      }

      const { hash, salt } = await hashPassword(password);
      const now = new Date().toISOString();
      const user: UserRecord = {
        id: randomUUID(),
        email,
        emailLower,
        displayName,
        passwordHash: hash,
        salt,
        createdAt: now,
        lastLoginAt: now,
      };

      try {
        await store.createUser(user);
      } catch (err) {
        const e = err as Error & { code?: string };
        if (e.code === 'CONFLICT') {
          sendError(res, 409, 'EMAIL_TAKEN', 'An account with this email already exists');
          return;
        }
        throw err;
      }

      const token = signToken({ sub: user.id, email: user.email, name: user.displayName });
      setAuthCookie(res, token);
      res.status(201).json({ user: publicUser(user), token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/login', authLimiter, async (req, res, next) => {
    try {
      const parsed = loginSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
        return;
      }
      const { email, password } = parsed.data;
      const user = await store.getUserByEmail(email.toLowerCase());
      if (!user) {
        sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
        return;
      }
      const valid = await verifyPassword(password, user.passwordHash, user.salt);
      if (!valid) {
        sendError(res, 401, 'INVALID_CREDENTIALS', 'Invalid email or password');
        return;
      }

      user.lastLoginAt = new Date().toISOString();
      await store.updateUser(user);

      const token = signToken({ sub: user.id, email: user.email, name: user.displayName });
      setAuthCookie(res, token);
      res.status(200).json({ user: publicUser(user), token });
    } catch (err) {
      next(err);
    }
  });

  router.post('/logout', (_req, res) => {
    res.clearCookie(TOKEN_COOKIE_NAME, { path: '/' });
    res.status(200).json({ ok: true });
  });

  router.get('/me', requireAuth, async (req, res, next) => {
    try {
      const userId = req.user?.sub;
      if (!userId) {
        sendError(res, 401, 'UNAUTHORIZED', 'Authentication required');
        return;
      }
      const user = await store.getUserById(userId);
      if (!user) {
        sendError(res, 404, 'NOT_FOUND', 'User not found');
        return;
      }
      res.status(200).json({ user: publicUser(user) });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
