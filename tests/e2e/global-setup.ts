import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import bcrypt from 'bcryptjs';
import postgres from 'postgres';
import { chromium, type FullConfig } from '@playwright/test';
import { AUTH_DIRECTORY, RUNTIME_DIRECTORY, RUNTIME_FILE, type E2eAccount, type E2eAccountStatus, type E2eRole, type E2eRuntime } from './helpers/runtime';

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

/**
 * Creates real accounts directly against Postgres via bcrypt + SQL (mirrors
 * what `registrarAction` does, minus the DONANTE/SOLICITANTE-only
 * restriction, since E2E needs all four roles) — replaces the old
 * `adminClient.auth.admin.createUser` call, which no longer exists.
 */
export default async function globalSetup(config: FullConfig) {
  // Playwright's global-setup runs in plain Node — Next.js's own .env.local
  // auto-loading doesn't apply here.
  try {
    process.loadEnvFile('.env.local');
  } catch {
    // No .env.local (e.g. CI with real env vars already set) — fine.
  }

  const appOrigin = String(config.projects[0]?.use.baseURL ?? 'http://127.0.0.1:3000');
  const sql = postgres(requiredEnv('DATABASE_MIGRATE_URL'), { max: 1 });
  const runId = randomUUID();
  const accounts: E2eAccount[] = [];

  await Promise.all([mkdir(AUTH_DIRECTORY, { recursive: true }), mkdir(RUNTIME_DIRECTORY, { recursive: true })]);

  try {
    for (const [index, definition] of accountDefinitions.entries()) {
      const email = `e2e-${definition.label}-${runId}@example.test`;
      const password = `E2e-${runId}-A1!`;
      const passwordHash = await bcrypt.hash(password, 10);

      const [user] = await sql`insert into "user" (email, password_hash) values (${email}, ${passwordHash}) returning id`;
      const fechaFinBloqueo = definition.status === 'bloqueado' ? sql`now() + interval '1 day'` : sql`null`;

      await sql`
        insert into usuarios (id, email, nombre, rol, estado, tipo_persona, cedula, direccion, telefono, latitud, longitud, fecha_fin_bloqueo, motivo_bloqueo)
        values (
          ${user.id}, ${email}, ${`E2E ${definition.label}`}, ${definition.role}, ${definition.status}, 'Natural',
          ${`09000000${String(index).padStart(2, '0')}`}, ${`Dirección E2E ${definition.label}`}, ${`09900000${String(index).padStart(2, '0')}`},
          -2.17, -79.92, ${fechaFinBloqueo}, ${definition.status === 'bloqueado' ? 'Cuenta de prueba E2E' : null}
        )
      `;

      if (definition.role === 'DONANTE') {
        const [deposito] = await sql`
          insert into depositos (nombre, direccion, latitud, longitud, activo) values (${`Bodega E2E ${runId}`}, 'Dirección E2E', -2.17, -79.92, true) returning id_deposito
        `;
        await sql`insert into donante_depositos (donante_id, id_deposito, es_principal, activo) values (${user.id}, ${deposito.id_deposito}, true, true)`;
      }

      accounts.push({ id: user.id, email, password, role: definition.role, status: definition.status });
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
        await page.locator('#password').fill(account.password);
        await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
        await page.waitForURL(new RegExp(`${dashboardByRole[account.role]}(?:\\?.*)?$`), { timeout: 30_000 });

        account.storageStatePath = resolve(AUTH_DIRECTORY, `${account.role.toLowerCase()}.json`);
        await context.storageState({ path: account.storageStatePath });
        await context.close();
        await writeFile(RUNTIME_FILE, JSON.stringify(runtime), { mode: 0o600 });
      }
    } finally {
      await browser.close();
    }
  } finally {
    await sql.end();
  }
}

function requiredEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`La suite E2E requiere ${name}.`);
  return value;
}
