import 'server-only';
import postgres from 'postgres';
import { sql } from 'drizzle-orm';
import { drizzle, type PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type Schema = typeof schema;

/** The Drizzle instance type passed into `withRlsContext`/`db.transaction` callbacks. */
export type Tx = PostgresJsDatabase<Schema>;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured.`);
  return value;
}

const appPool = postgres(requireEnv('DATABASE_URL'), { max: 10 });
const adminPool = postgres(requireEnv('DATABASE_ADMIN_URL'), { max: 5 });

/** RLS-enforced connection (role `app_user`). Never query this directly outside `withRlsContext`. */
export const db: PostgresJsDatabase<Schema> = drizzle(appPool, { schema });

/** BYPASSRLS connection (role `app_admin`). Only for explicit, reviewed privileged code paths. */
export const dbAdmin: PostgresJsDatabase<Schema> = drizzle(adminPool, { schema });

/**
 * Runs `fn` inside a transaction with `app.current_user_id` set via `SET LOCAL`
 * (transaction-scoped), so every RLS policy's `auth.uid()` call resolves to
 * `userId` for the duration of the callback. This is the only sanctioned way
 * to run RLS-scoped queries — it replaces PostgREST setting `request.jwt.claims`
 * per request.
 */
export async function withRlsContext<T>(
  userId: string | null,
  fn: (tx: PostgresJsDatabase<Schema>) => Promise<T>,
): Promise<T> {
  return db.transaction(async (tx) => {
    await tx.execute(sql`select set_config('app.current_user_id', ${userId ?? ''}, true)`);
    return fn(tx as unknown as PostgresJsDatabase<Schema>);
  });
}
