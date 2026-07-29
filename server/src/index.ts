import compression from 'compression';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import helmet from 'helmet';
import { existsSync } from 'node:fs';
import { createServer } from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { config } from './config.js';
import { createStore } from './db/index.js';
import { sendError } from './lib/http.js';
import { createAuthRouter } from './routes/auth.js';
import { createHealthRouter } from './routes/health.js';
import { createSavesRouter } from './routes/saves.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
// server/dist/index.js -> ../../client/dist
const clientDistDir = path.resolve(__dirname, '../../client/dist');

async function main(): Promise<void> {
  const store = await createStore();

  const app = express();
  app.disable('x-powered-by');

  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          imgSrc: ["'self'", 'data:', 'blob:'],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          connectSrc: ["'self'"],
          mediaSrc: ["'self'", 'data:', 'blob:'],
        },
      },
    }),
  );
  app.use(compression());
  app.use(
    cors({
      origin: config.allowedOrigins,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '1mb' }));

  app.use('/api/health', createHealthRouter());
  app.use('/api/auth', createAuthRouter(store));
  app.use('/api/saves', createSavesRouter(store));

  const hasClientBuild = existsSync(clientDistDir);
  if (hasClientBuild) {
    app.use(
      express.static(clientDistDir, {
        index: false,
        setHeaders: (res, filePath) => {
          if (path.basename(filePath) === 'index.html') {
            res.setHeader('Cache-Control', 'no-cache');
          } else {
            res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
          }
        },
      }),
    );

    app.get(/^(?!\/api).*/, (req, res, next) => {
      if (req.method !== 'GET') {
        next();
        return;
      }
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(path.join(clientDistDir, 'index.html'));
    });
  }

  // 404 for anything else (mainly unmatched /api routes)
  app.use((req, res) => {
    sendError(res, 404, 'NOT_FOUND', `No route for ${req.method} ${req.path}`);
  });

  // Centralized error handler
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    // eslint-disable-next-line no-console
    console.error('Unhandled error:', err);
    if (res.headersSent) return;
    sendError(res, 500, 'INTERNAL_ERROR', 'An unexpected error occurred');
  });

  const server = createServer(app);
  server.listen(config.port, '0.0.0.0', () => {
    // eslint-disable-next-line no-console
    console.log(
      `Agentmon server listening on 0.0.0.0:${config.port} (env=${config.nodeEnv}, ` +
        `store=${hasClientBuild ? 'static+api' : 'api-only'})`,
    );
  });

  const shutdown = (signal: string): void => {
    // eslint-disable-next-line no-console
    console.log(`Received ${signal}, shutting down gracefully...`);
    server.close((err) => {
      if (err) {
        // eslint-disable-next-line no-console
        console.error('Error during shutdown:', err);
        process.exit(1);
      }
      process.exit(0);
    });
    // Force-exit if close hangs
    setTimeout(() => process.exit(1), 10_000).unref();
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

main().catch((err) => {
  // eslint-disable-next-line no-console
  console.error('Fatal startup error:', err);
  process.exit(1);
});
