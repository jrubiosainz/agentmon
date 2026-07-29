import { Router } from 'express';
import { z } from 'zod';
import type { SaveRecord, SaveSummary, Store } from '../db/store.js';
import { sendError } from '../lib/http.js';
import { requireAuth } from '../middleware/auth.js';

const MAX_DATA_BYTES = 512 * 1024; // 512 KB
const MIN_SLOT = 1;
const MAX_SLOT = 3;

const summarySchema: z.ZodType<SaveSummary> = z.object({
  playerName: z.string(),
  badges: z.number().int().nonnegative(),
  partyCount: z.number().int().nonnegative(),
  dexSeen: z.number().int().nonnegative(),
  dexCaught: z.number().int().nonnegative(),
  location: z.string(),
  level: z.number().int().nonnegative(),
});

const putSaveSchema = z.object({
  playTimeSeconds: z.number().nonnegative(),
  summary: summarySchema,
  data: z.unknown(),
});

function parseSlot(raw: string): number | null {
  if (!/^\d+$/.test(raw)) return null;
  const slot = Number(raw);
  if (slot < MIN_SLOT || slot > MAX_SLOT) return null;
  return slot;
}

function stripData(save: SaveRecord): Omit<SaveRecord, 'data'> {
  const { data: _data, ...rest } = save;
  return rest;
}

export function createSavesRouter(store: Store): Router {
  const router = Router();
  router.use(requireAuth);

  router.get('/', async (req, res, next) => {
    try {
      const userId = req.user!.sub;
      const saves = await store.listSaves(userId);
      const summaries = saves
        .filter((s) => s.slot >= MIN_SLOT && s.slot <= MAX_SLOT)
        .sort((a, b) => a.slot - b.slot)
        .map(stripData);
      res.status(200).json({ saves: summaries });
    } catch (err) {
      next(err);
    }
  });

  router.get('/:slot', async (req, res, next) => {
    try {
      const slot = parseSlot(req.params.slot);
      if (slot === null) {
        sendError(res, 400, 'INVALID_SLOT', 'Slot must be an integer between 1 and 3');
        return;
      }
      const userId = req.user!.sub;
      const save = await store.getSave(userId, slot);
      if (!save) {
        sendError(res, 404, 'NOT_FOUND', 'No save in this slot');
        return;
      }
      res.status(200).json({ save });
    } catch (err) {
      next(err);
    }
  });

  router.put('/:slot', async (req, res, next) => {
    try {
      const slot = parseSlot(req.params.slot);
      if (slot === null) {
        sendError(res, 400, 'INVALID_SLOT', 'Slot must be an integer between 1 and 3');
        return;
      }

      const parsed = putSaveSchema.safeParse(req.body);
      if (!parsed.success) {
        sendError(res, 400, 'VALIDATION_ERROR', 'Invalid save payload', parsed.error.flatten());
        return;
      }

      const { playTimeSeconds, summary, data } = parsed.data;
      const dataSize = Buffer.byteLength(JSON.stringify(data ?? null), 'utf8');
      if (dataSize > MAX_DATA_BYTES) {
        sendError(
          res,
          413,
          'PAYLOAD_TOO_LARGE',
          `Save data exceeds the ${MAX_DATA_BYTES} byte limit`,
        );
        return;
      }

      const userId = req.user!.sub;
      const existing = await store.getSave(userId, slot);
      const record: SaveRecord = {
        id: `${userId}:${slot}`,
        userId,
        slot,
        version: (existing?.version ?? 0) + 1,
        updatedAt: new Date().toISOString(),
        playTimeSeconds,
        summary,
        data,
      };
      const saved = await store.putSave(record);
      res.status(200).json(stripData(saved) satisfies Omit<SaveRecord, 'data'>);
    } catch (err) {
      next(err);
    }
  });

  router.delete('/:slot', async (req, res, next) => {
    try {
      const slot = parseSlot(req.params.slot);
      if (slot === null) {
        sendError(res, 400, 'INVALID_SLOT', 'Slot must be an integer between 1 and 3');
        return;
      }
      const userId = req.user!.sub;
      await store.deleteSave(userId, slot);
      res.status(204).send();
    } catch (err) {
      next(err);
    }
  });

  return router;
}

export { MAX_DATA_BYTES };
