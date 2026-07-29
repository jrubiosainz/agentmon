import { Container, CosmosClient, Database } from '@azure/cosmos';
import { config } from '../config.js';
import type { SaveRecord, Store, UserRecord } from './store.js';
import { saveRecordId } from './store.js';

type CosmosError = Error & { code?: number | string };

function isNotFound(err: unknown): boolean {
  const e = err as CosmosError;
  return e?.code === 404;
}

function isConflict(err: unknown): boolean {
  const e = err as CosmosError;
  return e?.code === 409;
}

/**
 * Cosmos DB backed Store implementation. Requires COSMOS_ENDPOINT and
 * COSMOS_KEY to be configured. Creates the database and containers on
 * first use if they do not already exist.
 */
export class CosmosStore implements Store {
  private client: CosmosClient;
  private database: Database | undefined;
  private usersContainer: Container | undefined;
  private savesContainer: Container | undefined;
  private ready: Promise<void>;

  constructor() {
    if (!config.cosmosEndpoint || !config.cosmosKey) {
      throw new Error('Cosmos DB is not configured: COSMOS_ENDPOINT/COSMOS_KEY missing');
    }
    this.client = new CosmosClient({
      endpoint: config.cosmosEndpoint,
      key: config.cosmosKey,
    });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const { database } = await this.client.databases.createIfNotExists({
      id: config.cosmosDatabase,
    });
    this.database = database;

    const { container: usersContainer } = await database.containers.createIfNotExists({
      id: 'users',
      partitionKey: { paths: ['/id'] },
      uniqueKeyPolicy: {
        uniqueKeys: [{ paths: ['/emailLower'] }],
      },
    });
    this.usersContainer = usersContainer;

    const { container: savesContainer } = await database.containers.createIfNotExists({
      id: 'saves',
      partitionKey: { paths: ['/userId'] },
    });
    this.savesContainer = savesContainer;
  }

  private async users(): Promise<Container> {
    await this.ready;
    if (!this.usersContainer) throw new Error('Cosmos users container not initialized');
    return this.usersContainer;
  }

  private async savesC(): Promise<Container> {
    await this.ready;
    if (!this.savesContainer) throw new Error('Cosmos saves container not initialized');
    return this.savesContainer;
  }

  async createUser(u: UserRecord): Promise<void> {
    const container = await this.users();
    try {
      await container.items.create(u);
    } catch (err) {
      if (isConflict(err)) {
        const e = new Error('User with this email already exists') as Error & { code?: string };
        e.code = 'CONFLICT';
        throw e;
      }
      throw err;
    }
  }

  async getUserByEmail(email: string): Promise<UserRecord | null> {
    const container = await this.users();
    const query = {
      query: 'SELECT * FROM c WHERE c.emailLower = @emailLower',
      parameters: [{ name: '@emailLower', value: email.toLowerCase() }],
    };
    const { resources } = await container.items.query<UserRecord>(query).fetchAll();
    return resources[0] ?? null;
  }

  async getUserById(id: string): Promise<UserRecord | null> {
    const container = await this.users();
    try {
      const { resource } = await container.item(id, id).read<UserRecord>();
      return resource ?? null;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async updateUser(u: UserRecord): Promise<void> {
    const container = await this.users();
    await container.item(u.id, u.id).replace(u);
  }

  async listSaves(userId: string): Promise<SaveRecord[]> {
    const container = await this.savesC();
    const query = {
      query: 'SELECT * FROM c WHERE c.userId = @userId ORDER BY c.slot',
      parameters: [{ name: '@userId', value: userId }],
    };
    const { resources } = await container.items.query<SaveRecord>(query).fetchAll();
    return resources;
  }

  async getSave(userId: string, slot: number): Promise<SaveRecord | null> {
    const container = await this.savesC();
    const id = saveRecordId(userId, slot);
    try {
      const { resource } = await container.item(id, userId).read<SaveRecord>();
      return resource ?? null;
    } catch (err) {
      if (isNotFound(err)) return null;
      throw err;
    }
  }

  async putSave(save: SaveRecord): Promise<SaveRecord> {
    const container = await this.savesC();
    const { resource } = await container.items.upsert<SaveRecord>(save);
    return (resource as SaveRecord) ?? save;
  }

  async deleteSave(userId: string, slot: number): Promise<void> {
    const container = await this.savesC();
    const id = saveRecordId(userId, slot);
    try {
      await container.item(id, userId).delete();
    } catch (err) {
      if (isNotFound(err)) return;
      throw err;
    }
  }
}
