import type { NextFunction, Request, Response } from 'express';
import { verifyToken } from '../auth/tokens.js';

export const TOKEN_COOKIE_NAME = 'am_token';

function extractToken(req: Request): string | null {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    return authHeader.slice('Bearer '.length).trim();
  }
  const cookieToken = (req.cookies as Record<string, string> | undefined)?.[TOKEN_COOKIE_NAME];
  return cookieToken ?? null;
}

export function requireAuth(req: Request, res: Response, next: NextFunction): void {
  const token = extractToken(req);
  if (!token) {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Authentication required' } });
    return;
  }
  try {
    req.user = verifyToken(token);
    next();
  } catch {
    res.status(401).json({ error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' } });
  }
}
