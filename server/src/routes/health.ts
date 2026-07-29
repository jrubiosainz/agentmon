import { Router } from 'express';
import { createRequire } from 'node:module';
import { isCosmosConfigured } from '../config.js';

const require = createRequire(import.meta.url);
// eslint-disable-next-line @typescript-eslint/no-var-requires
const pkg = require('../../package.json') as { version?: string };

export function createHealthRouter(): Router {
  const router = Router();

  router.get('/', (_req, res) => {
    res.status(200).json({
      status: 'ok',
      store: isCosmosConfigured ? 'cosmos' : 'memory',
      version: pkg.version ?? '0.0.0',
      uptime: process.uptime(),
    });
  });

  return router;
}
