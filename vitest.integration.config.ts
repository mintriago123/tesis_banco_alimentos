import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

// Integration tests need real DATABASE_URL/DATABASE_ADMIN_URL/DATABASE_MIGRATE_URL
// values (src/db/client.ts reads them at import time). Next.js auto-loads
// .env.local; vitest doesn't, so load it explicitly here — this file runs in
// plain Node, not through a Vite transform.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local (e.g. CI with real env vars already set) — fine.
}

// Standalone (not `mergeConfig`-based) deliberately: vitest's mergeConfig
// concatenates array fields like `include` rather than replacing them, which
// silently pulled every unit test back into this run when this file
// extended vitest.config.ts. Only the two small bits actually needed
// (the `@` alias, `server-only` stub) are duplicated here instead.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    testTimeout: 20000,
    coverage: { enabled: false },
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
      'server-only': resolve(rootDir, 'src/test/server-only.ts'),
    },
  },
});
