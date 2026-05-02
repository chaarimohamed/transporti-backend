import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { execFileSync } from 'child_process';
import * as path from 'path';
import type { Handler } from 'aws-lambda';

/**
 * Lambda handler — fetches DB + app secrets from Secrets Manager on cold start,
 * sets them as environment variables, then lazily initialises the Express app
 * so that Prisma picks up DATABASE_URL before PrismaClient is constructed.
 */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
let cachedHandler: any;

async function resolveSecrets() {
  const region = process.env.AWS_REGION_NAME || process.env.AWS_REGION || 'eu-west-1';
  const smClient = new SecretsManagerClient({ region });

  // --- Fetch DB credentials ---
  const dbSecretArn = process.env.DB_SECRET_ARN;
  if (dbSecretArn) {
    const { SecretString } = await smClient.send(
      new GetSecretValueCommand({ SecretId: dbSecretArn }),
    );
    const { username, password } = JSON.parse(SecretString!);
    const host = process.env.DB_HOST;
    const port = process.env.DB_PORT || '5432';
    const encodedPassword = encodeURIComponent(password);
    process.env.DATABASE_URL =
      `postgresql://${username}:${encodedPassword}@${host}:${port}/transporti?sslmode=require&connection_limit=1`;
  }

  // --- Fetch app secrets (JWT_SECRET, DOCUMENTS_ENCRYPTION_KEY) ---
  const appSecretArn = process.env.APP_SECRET_ARN;
  if (appSecretArn) {
    const { SecretString } = await smClient.send(
      new GetSecretValueCommand({ SecretId: appSecretArn }),
    );
    const secrets = JSON.parse(SecretString!);
    if (secrets.JWT_SECRET) process.env.JWT_SECRET = secrets.JWT_SECRET;
    if (secrets.DOCUMENTS_ENCRYPTION_KEY) process.env.DOCUMENTS_ENCRYPTION_KEY = secrets.DOCUMENTS_ENCRYPTION_KEY;
  }
}

async function getHandler() {
  if (cachedHandler) return cachedHandler;

  await resolveSecrets();

  // Lazy-import the Express app AFTER env vars are set so Prisma picks up DATABASE_URL
  const serverlessExpress = (await import('@vendia/serverless-express')).default;
  const { app } = await import('./server');
  cachedHandler = serverlessExpress({ app });
  return cachedHandler;
}

export const handler: Handler = async (event, context) => {
  // Special migration action — invoke via: aws lambda invoke --payload '{"_action":"migrate"}'
  if (event?._action === 'migrate') {
    await resolveSecrets();
    // Run prisma's build/index.js directly (avoids .bin wrapper WASM path issues)
    const prismaScript = path.join('/var/task/node_modules/prisma/build/index.js');
    const schema = path.join('/var/task/schema.prisma');
    console.log('Running prisma migrate deploy...');
    const output = execFileSync(process.execPath, [prismaScript, 'migrate', 'deploy', '--schema', schema], {
      env: { ...process.env },
      encoding: 'utf8',
    });
    console.log(output);
    return { statusCode: 200, body: output };
  }

  const h = await getHandler();
  return h(event, context);
};


