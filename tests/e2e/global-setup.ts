import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { chromium, type FullConfig } from '@playwright/test';
import {
  AUTH_DIRECTORY,
  RUNTIME_DIRECTORY,
  RUNTIME_FILE,
  createAdminClient,
  type E2eAccount,
  type E2eAccountStatus,
  type E2eRole,
  type E2eRuntime,
} from './helpers/runtime';

interface AccountDefinition {
  role: E2eRole;
  label: string;
  status: E2eAccountStatus;
}

const accountDefinitions: AccountDefinition[] = [
  { role: 'SOLICITANTE', label: 'requester', status: 'activo' },
  { role: 'DONANTE', label: 'donor', status: 'activo' },
  { role: 'OPERADOR', label: 'operator', status: 'activo' },
  { role: 'ADMINISTRADOR', label: 'administrator', status: 'activo' },
  { role: 'SOLICITANTE', label: 'blocked', status: 'bloqueado' },
];

const dashboardByRole: Record<E2eRole, string> = {
  SOLICITANTE: '/user/dashboard',
  DONANTE: '/donante/dashboard',
  OPERADOR: '/operador/dashboard',
  ADMINISTRADOR: '/admin/dashboard',
};

export default async function globalSetup(config: FullConfig) {
  const appOrigin = String(config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:3000');
  const adminClient = createAdminClient();
  const runId = crypto.randomUUID();
  const accounts: E2eAccount[] = [];

  await Promise.all([
    mkdir(AUTH_DIRECTORY, { recursive: true }),
    mkdir(RUNTIME_DIRECTORY, { recursive: true }),
  ]);

  for (const [index, definition] of accountDefinitions.entries()) {
    const email = `e2e-${definition.label}-${runId}@example.test`;
    const password = `E2e-${runId}-A1!`;
    const { data, error } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { rol: definition.role },
    });
    if (error || !data.user) {
      throw error ?? new Error(`No se creó la cuenta E2E ${definition.label}.`);
    }

    const { error: profileError } = await adminClient.from('usuarios').upsert({
      id: data.user.id,
      email,
      nombre: `E2E ${definition.label}`,
      rol: definition.role,
      estado: definition.status,
      tipo_persona: 'Natural',
      cedula: `09000000${String(index).padStart(2, '0')}`,
      direccion: `Dirección E2E ${definition.label}`,
      telefono: `09900000${String(index).padStart(2, '0')}`,
      latitud: -2.17,
      longitud: -79.92,
    });
    if (profileError) {
      throw profileError;
    }

    accounts.push({
      id: data.user.id,
      email,
      password,
      role: definition.role,
      status: definition.status,
    });
  }

  const runtime: E2eRuntime = { runId, accounts };
  await writeFile(RUNTIME_FILE, JSON.stringify(runtime), { mode: 0o600 });

  const browser = await chromium.launch();
  try {
    for (const account of accounts.filter(({ status }) => status === 'activo')) {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(`${appOrigin}/auth/iniciar-sesion`);
      await page.getByLabel('Correo electrónico').fill(account.email);
      await page.getByLabel('Contraseña', { exact: true }).fill(account.password);
      await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
      await page.waitForURL(new RegExp(`${dashboardByRole[account.role]}(?:\\?.*)?$`), {
        timeout: 30_000,
      });

      account.storageStatePath = resolve(
        AUTH_DIRECTORY,
        `${account.role.toLowerCase()}.json`,
      );
      await context.storageState({ path: account.storageStatePath });
      await context.close();
      await writeFile(RUNTIME_FILE, JSON.stringify(runtime), { mode: 0o600 });
    }
  } finally {
    await browser.close();
  }
}
