import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const rootDir = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  test: {
    environment: 'jsdom',
    setupFiles: ['./src/test/setup.ts'],
    // Explicit include (rather than exclude) so the integration config's own
    // `include` for tests/integration/**/*.test.ts isn't fought by
    // mergeConfig concatenating this file's `exclude` array into it.
    include: ['src/**/*.test.{ts,tsx}', 'tests/unit/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json-summary', 'html'],
      reportsDirectory: './coverage',
      exclude: ['src/test/**', '**/*.d.ts', '**/index.ts'],
      thresholds: {
        statements: 60,
        branches: 50,
        functions: 60,
        lines: 60,
      },
    },
  },
  resolve: {
    alias: {
      '@': resolve(rootDir, 'src'),
      'server-only': resolve(rootDir, 'src/test/server-only.ts'),
    },
  },
});
