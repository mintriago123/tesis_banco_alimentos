import { defineConfig, devices } from '@playwright/test';

// Without this, a bare `pnpm test:e2e` resolves `appOrigin` to the
// 127.0.0.1 fallback below while `.env.local` (which the dev/prod server
// itself auto-loads) says `localhost` — same app, two different cookie
// hosts, so a storageState saved by one is silently invisible to the other.
// Found by actually running the AUTH-P0-003 multi-role isolation test, not
// from a type/build check.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local (e.g. CI with real env vars already set) — fine.
}

const appOrigin = process.env.APP_ORIGIN ?? 'http://127.0.0.1:3000';

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: './test-results',
  globalSetup: './tests/e2e/global-setup.ts',
  globalTeardown: './tests/e2e/global-teardown.ts',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  workers: 1,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : [['list'], ['html', { open: 'never' }]],
  use: {
    baseURL: appOrigin,
    trace: 'retain-on-first-failure',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
  },
  webServer: {
    command: 'pnpm start',
    url: appOrigin,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    // Redirects outgoing mail at the spawned server to Mailpit instead of
    // Gmail, so PROFILE-P1-001 can assert on a real captured email — only
    // for this process; .env.local's own EMAIL_* defaults (suppressed) stay
    // untouched for `pnpm dev`/`pnpm start` run by hand.
    env: {
      EMAIL_PROVIDER: 'smtp',
      EMAIL_SUPPRESS_SEND: 'false',
      EMAIL_LOG_ONLY: 'false',
      EMAIL_SMTP_HOST: process.env.EMAIL_SMTP_HOST ?? '127.0.0.1',
      EMAIL_SMTP_PORT: process.env.EMAIL_SMTP_PORT ?? '1025',
    },
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});
