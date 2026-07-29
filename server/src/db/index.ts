import { isCosmosConfigured } from '../config.js';
import { CosmosStore } from './cosmos.js';
import { MemoryStore } from './memory.js';
import type { Store } from './store.js';

export type { Store, UserRecord, SaveRecord, SaveSummary } from './store.js';

export async function createStore(): Promise<Store> {
  if (isCosmosConfigured) {
    return new CosmosStore();
  }
  // eslint-disable-next-line no-console
  console.warn(
    '*** Cosmos DB is not configured (COSMOS_ENDPOINT missing). ' +
      'Falling back to an in-memory store. Data will NOT persist across restarts. ***',
  );
  return new MemoryStore();
}
