import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';

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

export const getAccount = (runtime: E2eRuntime, role: E2eRole, status: E2eAccountStatus = 'activo'): E2eAccount => {
  const account = runtime.accounts.find((candidate) => candidate.role === role && candidate.status === status);
  if (!account) {
    throw new Error(`No existe una cuenta E2E ${role}/${status}.`);
  }
  return account;
};
