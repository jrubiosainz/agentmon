const DEV_JWT_SECRET = 'dev-only-insecure-secret-change-me';

function parseOrigins(raw: string): string[] {
  return raw
    .split(',')
    .map((o) => o.trim())
    .filter((o) => o.length > 0);
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const isProduction = nodeEnv === 'production';

const jwtSecret = process.env.JWT_SECRET;
if (!jwtSecret && isProduction) {
  // eslint-disable-next-line no-console
  console.warn(
    '*** WARNING: JWT_SECRET is not set in production. Using an insecure development ' +
      'default. Set the JWT_SECRET environment variable immediately. ***',
  );
}

export type Config = {
  port: number;
  nodeEnv: string;
  isProduction: boolean;
  jwtSecret: string;
  cosmosEndpoint: string | undefined;
  cosmosKey: string | undefined;
  cosmosDatabase: string;
  allowedOrigins: string[];
};

export const config: Config = {
  port: Number(process.env.PORT ?? 8080),
  nodeEnv,
  isProduction,
  jwtSecret: jwtSecret && jwtSecret.length > 0 ? jwtSecret : DEV_JWT_SECRET,
  cosmosEndpoint: process.env.COSMOS_ENDPOINT,
  cosmosKey: process.env.COSMOS_KEY,
  cosmosDatabase: process.env.COSMOS_DATABASE ?? 'agentmon',
  allowedOrigins: parseOrigins(process.env.ALLOWED_ORIGINS ?? 'http://localhost:5173'),
};

export const isCosmosConfigured: boolean = Boolean(
  config.cosmosEndpoint && config.cosmosKey,
);
