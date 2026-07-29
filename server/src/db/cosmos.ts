import { Container, CosmosClient, Database } from '@azure/cosmos';
import { DefaultAzureCredential } from '@azure/identity';
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

function isForbidden(err: unknown): boolean {
  const e = err as CosmosError;
  return e?.code === 403 || e?.code === '403';
}

/**
 * Cosmos DB backed Store implementation.
 *
 * Authentication is either a shared key (COSMOS_KEY) or, when the account has
 * local auth disabled, Entra ID via the host's managed identity. Data-plane
 * RBAC does not grant control-plane rights, so if the database/containers
 * cannot be created we assume infrastructure already provisioned them and just
 * bind to them by name.
 */
export class CosmosStore implements Store {
  private client: CosmosClient;
  private database: Database | undefined;
  private usersContainer: Container | undefined;
  private savesContainer: Container | undefined;
  private ready: Promise<void>;

  constructor() {
    if (!config.cosmosEndpoint) {
      throw new Error('Cosmos DB is not configured: COSMOS_ENDPOINT missing');
    }
    this.client = config.cosmosKey
      ? new CosmosClient({ endpoint: config.cosmosEndpoint, key: config.cosmosKey })
      : new CosmosClient({
          endpoint: config.cosmosEndpoint,
          aadCredentials: new DefaultAzureCredential(),
        });
    this.ready = this.init();
  }

  private async init(): Promise<void> {
    const dbId = config.cosmosDatabase;
    try {
      const { database } = await this.client.databases.createIfNotExists({ id: dbId });
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
      return;
    } catch (err) {
      if (!isForbidden(err)) throw err;
    }

    // Entra-only account: the identity holds data-plane rights only, so bind to
    // the resources provisioned by the infrastructure template.
    // eslint-disable-next-line no-console
    console.log('Cosmos: binding to pre-provisioned database/containers (data-plane RBAC).');
    this.database = this.client.database(dbId);
    this.usersContainer = this.database.container('users');
    this.savesContainer = this.database.container('saves');
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
