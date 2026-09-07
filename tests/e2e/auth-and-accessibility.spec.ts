import { expect, test } from '@playwright/test';
import { getAccount, readRuntime } from './helpers/runtime';

const ownRoutes = {
  SOLICITANTE: '/user/dashboard',
  DONANTE: '/donante/dashboard',
  OPERADOR: '/operador/dashboard',
  ADMINISTRADOR: '/admin/dashboard',
} as const;

test('@p0 AUTH-P0-003 E2E-P2-001 isolates anonymous and role-bound routes', async ({
  browser,
  page,
}) => {
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/auth\/iniciar-sesion\?.*error=unauthorized/);

  const runtime = await readRuntime();
  for (const account of runtime.accounts.filter(({ status }) => status === 'activo')) {
    if (!account.storageStatePath) {
      throw new Error(`Falta storageState para ${account.role}.`);
    }

    const context = await browser.newContext({ storageState: account.storageStatePath });
    const rolePage = await context.newPage();
    await rolePage.goto(ownRoutes[account.role]);
    await expect(rolePage).toHaveURL(new RegExp(`${ownRoutes[account.role]}$`));

    const forbiddenRoute = account.role === 'ADMINISTRADOR'
      ? '/operador/dashboard'
      : '/admin/dashboard';
    await rolePage.goto(forbiddenRoute);
    await expect(rolePage).toHaveURL(/\/auth\/iniciar-sesion\?.*error=forbidden/);
    await context.close();
  }
});

test('@p0 AUTH-P0-002 rejects a blocked account and clears its session', async ({ page }) => {
  const runtime = await readRuntime();
  const blocked = getAccount(runtime, 'SOLICITANTE', 'bloqueado');

  await page.goto('/auth/iniciar-sesion');
  await page.getByLabel('Correo electrónico').fill(blocked.email);
  await page.getByLabel('Contraseña', { exact: true }).fill(blocked.password);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();

  await expect(page).toHaveURL(/\/auth\/iniciar-sesion$/);
  await expect(page.getByText(/cuenta ha sido bloqueada/i)).toBeVisible();
  await page.goto('/user/dashboard');
  await expect(page).toHaveURL(/\/auth\/iniciar-sesion\?.*error=unauthorized/);
});

test('A11Y-P2-001 critical auth forms expose labels, language and keyboard validation', async ({
  page,
}) => {
  await page.goto('/auth/iniciar-sesion');

  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1, name: 'Banco de Alimentos' })).toBeVisible();
  const email = page.getByLabel('Correo electrónico');
  const password = page.getByLabel('Contraseña', { exact: true });
  await expect(email).toHaveAttribute('required', '');
  await expect(password).toHaveAttribute('required', '');
  await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute(
    'aria-pressed',
    'false',
  );

  await email.focus();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await expect(email).toBeFocused();
});

test('PROFILE-P1-001 password recovery stays inside local Mailpit', async ({ page, request }) => {
  const runtime = await readRuntime();
  const requester = getAccount(runtime, 'SOLICITANTE');

  await page.goto('/auth/olvide-contrasena');
  await page.getByLabel('Correo electrónico').fill(requester.email);
  await page.getByRole('button', { name: 'Enviar Enlace de Restablecimiento' }).click();
  await expect(page.getByText(/correo|enlace/i).last()).toBeVisible();

  await expect.poll(async () => {
    const response = await request.get('http://127.0.0.1:54324/api/v1/messages');
    if (!response.ok()) return false;
    return (await response.text()).includes(requester.email);
  }, { timeout: 15_000 }).toBe(true);
});

test('UX-P2-001 renders the requester empty state without leaking another run', async ({
  browser,
}) => {
  const runtime = await readRuntime();
  const requester = getAccount(runtime, 'SOLICITANTE');
  if (!requester.storageStatePath) throw new Error('Falta la sesión del solicitante.');

  const context = await browser.newContext({ storageState: requester.storageStatePath });
  const page = await context.newPage();
  await page.goto('/user/solicitudes');
  await expect(page.getByText('No hay solicitudes para mostrar')).toBeVisible();
  await context.close();
});
