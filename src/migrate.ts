import { SecretsManagerClient, GetSecretValueCommand } from '@aws-sdk/client-secrets-manager';
import { Client } from 'pg';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as path from 'path';

/**
 * CDK Custom Resource handler — applies Prisma SQL migrations directly via pg,
 * with no dependency on the Prisma CLI or any native binaries.
 *
 * Triggered automatically by CloudFormation on every deploy where the hash of
 * prisma/ changes (i.e. a new migration was added). On Delete events the
 * handler is a no-op so the database is never dropped by CDK.
 *
 * Maintains the standard _prisma_migrations table so Prisma CLI and this runner
 * share the same migration state and are fully interchangeable.
 */

const MIGRATIONS_TABLE = '_prisma_migrations';

async function buildPgClient(): Promise<Client> {
  const region = process.env.AWS_REGION_NAME || process.env.AWS_REGION || 'eu-west-1';
  const smClient = new SecretsManagerClient({ region });

  const { SecretString } = await smClient.send(
    new GetSecretValueCommand({ SecretId: process.env.DB_SECRET_ARN! }),
  );
  const { username, password } = JSON.parse(SecretString!);

  return new Client({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT ?? '5432', 10),
    database: 'transporti',
    user: username,
    password,
    ssl: { rejectUnauthorized: false },
    connectionTimeoutMillis: 10_000,
  });
}

async function ensureMigrationsTable(client: Client): Promise<void> {
  // Schema matches what Prisma itself creates so both tools are compatible.
  await client.query(`
    CREATE TABLE IF NOT EXISTS "${MIGRATIONS_TABLE}" (
      id                   VARCHAR(36)  PRIMARY KEY NOT NULL,
      checksum             VARCHAR(64)  NOT NULL,
      finished_at          TIMESTAMPTZ,
      migration_name       VARCHAR(255) NOT NULL,
      logs                 TEXT,
      rolled_back_at       TIMESTAMPTZ,
      started_at           TIMESTAMPTZ  NOT NULL DEFAULT now(),
      applied_steps_count  INTEGER      NOT NULL DEFAULT 0
    )
  `);
}

export async function handler(event: { RequestType: string; PhysicalResourceId?: string }) {
  console.log('[migrate] RequestType:', event.RequestType);

  if (event.RequestType === 'Delete') {
    return { PhysicalResourceId: event.PhysicalResourceId ?? 'prisma-migrations' };
  }

  const client = await buildPgClient();
  await client.connect();

  try {
    await ensureMigrationsTable(client);

    // Migrations are copied into /var/task/migrations/ by the afterBundling hook.
    const migrationsDir = path.join('/var/task', 'migrations');
    const folders = fs.readdirSync(migrationsDir)
      .filter(f => fs.statSync(path.join(migrationsDir, f)).isDirectory())
      .sort(); // lexicographic sort = chronological (timestamps in folder names)

    const { rows } = await client.query<{ migration_name: string }>(
      `SELECT migration_name FROM "${MIGRATIONS_TABLE}" WHERE finished_at IS NOT NULL`,
    );
    const applied = new Set(rows.map((r: { migration_name: string }) => r.migration_name));

    let count = 0;
    for (const folder of folders) {
      if (applied.has(folder)) {
        console.log(`[migrate] skip  ${folder}`);
        continue;
      }

      const sql = fs.readFileSync(path.join(migrationsDir, folder, 'migration.sql'), 'utf8');
      const checksum = crypto.createHash('sha256').update(sql).digest('hex');
      const id = crypto.randomUUID();

      console.log(`[migrate] apply ${folder}`);

      // Record start so a crash leaves a visible incomplete row.
      await client.query(
        `INSERT INTO "${MIGRATIONS_TABLE}" (id, checksum, migration_name, started_at, applied_steps_count)
         VALUES ($1, $2, $3, now(), 0)`,
        [id, checksum, folder],
      );

      await client.query(sql);

      await client.query(
        `UPDATE "${MIGRATIONS_TABLE}" SET finished_at = now(), applied_steps_count = 1 WHERE id = $1`,
        [id],
      );

      count++;
    }

    console.log(`[migrate] done — ${count} migration(s) applied`);
    return { PhysicalResourceId: 'prisma-migrations' };
  } finally {
    await client.end();
  }
}
