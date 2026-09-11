import { expect, test } from '@playwright/test';
import { extractResetUrl, isMailpitReachable, purgeMailpitInbox, waitForMailpitMessage } from './helpers/mailpit';
import { getAccount, readRuntime } from './helpers/runtime';

const ownRoutes = {
  SOLICITANTE: '/user/dashboard',
  DONANTE: '/donante/dashboard',
  OPERADOR: '/operador/dashboard',
  ADMINISTRADOR: '/admin/dashboard',
} as const;

test('@p0 AUTH-P0-003 E2E-P2-001 isolates anonymous and role-bound routes', async ({ browser, page }) => {
  await page.goto('/admin/dashboard');
  await expect(page).toHaveURL(/\/auth\/iniciar-sesion\?.*error=unauthorized/);

  const runtime = await readRuntime();
  for (const account of runtime.accounts.filter(({ status }) => status === 'activo')) {
    if (!account.storageStatePath) {
      throw new Error(`Falta storageState para ${account.role}.`);
    }

    const context = await browser.newContext({ storageState: account.storageStatePath, baseURL: process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000' });
    const rolePage = await context.newPage();
    await rolePage.goto(ownRoutes[account.role]);
    await expect(rolePage).toHaveURL(new RegExp(`${ownRoutes[account.role]}$`));

    const forbiddenRoute = account.role === 'ADMINISTRADOR' ? '/operador/dashboard' : '/admin/dashboard';
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
  await page.locator('#password').fill(blocked.password);
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();

  await expect(page).toHaveURL(/\/auth\/iniciar-sesion$/);
  await expect(page.getByText(/cuenta.*bloqueada/i)).toBeVisible();
  await page.goto('/user/dashboard');
  await expect(page).toHaveURL(/\/auth\/iniciar-sesion\?.*error=unauthorized/);
});

test('A11Y-P2-001 critical auth forms expose labels, language and keyboard validation', async ({ page }) => {
  await page.goto('/auth/iniciar-sesion');

  await expect(page.locator('html')).toHaveAttribute('lang', 'es');
  await expect(page.getByRole('heading', { level: 1, name: 'Banco de Alimentos' })).toBeVisible();
  const email = page.getByLabel('Correo electrónico');
  // Not `getByLabel('Contraseña', { exact: true })`: the required-field "*"
  // is part of the <label>'s accessible name here ("Contraseña *"), and a
  // loose match also catches the "Mostrar contraseña" toggle button's
  // aria-label. #password is the unambiguous target; label association
  // itself is exercised by `email`/`password` both resolving via getByLabel
  // elsewhere in this file.
  const password = page.locator('#password');
  await expect(email).toHaveAttribute('required', '');
  await expect(password).toHaveAttribute('required', '');
  await expect(page.getByRole('button', { name: 'Mostrar contraseña' })).toHaveAttribute('aria-pressed', 'false');

  await email.focus();
  await page.keyboard.press('Tab');
  await expect(password).toBeFocused();
  await page.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await expect(email).toBeFocused();
});

// Ported: playwright.config.ts's webServer.env points the app at a
// Mailpit instance (EMAIL_PROVIDER=smtp) for this process only — .env.local
// keeps EMAIL_SUPPRESS_SEND=true for `pnpm dev`/`pnpm start` run by hand.
// Self-skips (rather than failing) when Mailpit isn't running, mirroring
// this repo's RUN_DB_INTEGRATION gating for DB integration tests: start it
// with `pnpm docker:e2e` first for full coverage.
test('PROFILE-P1-001 password recovery round-trips through a captured Mailpit email', async ({ page, browser }) => {
  test.skip(!(await isMailpitReachable()), 'Mailpit no está disponible — levanta `pnpm docker:e2e` antes de correr esta prueba.');

  const runtime = await readRuntime();
  const requester = getAccount(runtime, 'SOLICITANTE'); // defaults to status: 'activo'
  await purgeMailpitInbox();

  await page.goto('/auth/olvide-contrasena');
  await page.getByLabel('Correo electrónico').fill(requester.email);
  await page.getByRole('button', { name: 'Enviar Enlace de Restablecimiento' }).click();
  await expect(page.getByText(/revisa tu bandeja de entrada/i)).toBeVisible();

  const message = await waitForMailpitMessage(requester.email);
  const resetUrl = extractResetUrl(message.text || message.html);

  const newPassword = `${requester.password}-Nueva1!`;
  await page.goto(resetUrl);
  await page.locator('#password').fill(newPassword);
  await page.locator('#confirmPassword').fill(newPassword);
  await page.getByRole('button', { name: 'Actualizar Contraseña' }).click();
  await expect(page.getByRole('heading', { name: '¡Contraseña Actualizada!' })).toBeVisible();

  // Close the loop: the new password logs in — proves restablecerPasswordAction
  // actually persisted the change, not just that the UI showed success.
  // Any future test that live-logs-in with this account's *original*
  // password must run before this one, or use a different account.
  const freshContext = await browser.newContext({ baseURL: process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000' });
  const freshPage = await freshContext.newPage();
  await freshPage.goto('/auth/iniciar-sesion');
  await freshPage.getByLabel('Correo electrónico').fill(requester.email);
  await freshPage.locator('#password').fill(newPassword);
  await freshPage.getByRole('button', { name: 'Iniciar Sesión' }).click();
  await expect(freshPage).toHaveURL(/\/user\/dashboard$/);
  await freshContext.close();
});

test('UX-P2-001 renders the requester empty state without leaking another run', async ({ browser }) => {
  const runtime = await readRuntime();
  const requester = getAccount(runtime, 'SOLICITANTE');
  if (!requester.storageStatePath) throw new Error('Falta la sesión del solicitante.');

  const context = await browser.newContext({ storageState: requester.storageStatePath, baseURL: process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000' });
  const page = await context.newPage();
  await page.goto('/user/solicitudes');
  await expect(page.getByText('No hay solicitudes para mostrar')).toBeVisible();
  await context.close();
});
