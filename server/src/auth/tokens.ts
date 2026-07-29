import jwt from 'jsonwebtoken';
import { config } from '../config.js';

export type TokenPayload = {
  sub: string;
  email: string;
  name: string;
};

const EXPIRES_IN = '30d';

export function signToken(payload: TokenPayload): string {
  return jwt.sign(payload, config.jwtSecret, {
    algorithm: 'HS256',
    expiresIn: EXPIRES_IN,
  });
}

export function verifyToken(token: string): TokenPayload {
  const decoded = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof decoded === 'string' || !decoded) {
    throw new Error('Invalid token payload');
  }
  const { sub, email, name } = decoded as Record<string, unknown>;
  if (typeof sub !== 'string' || typeof email !== 'string' || typeof name !== 'string') {
    throw new Error('Invalid token payload');
  }
  return { sub, email, name };
}
