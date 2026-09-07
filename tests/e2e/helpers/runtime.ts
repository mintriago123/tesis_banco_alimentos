import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

export const AUTH_DIRECTORY = resolve(process.cwd(), 'tests', '.auth');
export const RUNTIME_DIRECTORY = resolve(process.cwd(), 'tests', '.runtime');
export const RUNTIME_FILE = resolve(RUNTIME_DIRECTORY, 'e2e-users.json');

export type E2eRole = 'SOLICITANTE' | 'DONANTE' | 'OPERADOR' | 'ADMINISTRADOR';
export type E2eAccountStatus = 'activo' | 'bloqueado';

export interface E2eAccount {
  id: string;
  email: string;
  password: string;
  role: E2eRole;
  status: E2eAccountStatus;
  storageStatePath?: string;
}

export interface E2eRuntime {
  runId: string;
  accounts: E2eAccount[];
}

const requiredEnvironment = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`La suite E2E requiere ${name}.`);
  }
  return value;
};

const isRuntime = (value: unknown): value is E2eRuntime => {
  if (typeof value !== 'object' || value === null || !('runId' in value) || !('accounts' in value)) {
    return false;
  }

  const candidate = value as { runId: unknown; accounts: unknown };
  return typeof candidate.runId === 'string' && Array.isArray(candidate.accounts);
};

export const readRuntime = async (): Promise<E2eRuntime> => {
  const parsed: unknown = JSON.parse(await readFile(RUNTIME_FILE, 'utf8'));
  if (!isRuntime(parsed)) {
    throw new Error('El archivo temporal E2E no tiene el formato esperado.');
  }
  return parsed;
};

export const getAccount = (
  runtime: E2eRuntime,
  role: E2eRole,
  status: E2eAccountStatus = 'activo',
): E2eAccount => {
  const account = runtime.accounts.find(
    (candidate) => candidate.role === role && candidate.status === status,
  );
  if (!account) {
    throw new Error(`No existe una cuenta E2E ${role}/${status}.`);
  }
  return account;
};

export const createAdminClient = (): SupabaseClient => createClient(
  requiredEnvironment('SUPABASE_TEST_URL'),
  requiredEnvironment('SUPABASE_TEST_SERVICE_ROLE_KEY'),
  { auth: { autoRefreshToken: false, persistSession: false } },
);

export const createRoleClient = async (account: E2eAccount): Promise<SupabaseClient> => {
  const client = createClient(
    requiredEnvironment('SUPABASE_TEST_URL'),
    requiredEnvironment('SUPABASE_TEST_PUBLISHABLE_KEY'),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const { error } = await client.auth.signInWithPassword({
    email: account.email,
    password: account.password,
  });
  if (error) {
    throw error;
  }
  return client;
};
