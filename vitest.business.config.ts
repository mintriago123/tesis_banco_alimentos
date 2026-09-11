import { mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

// Business coverage previously only ran the jsdom unit suite, so DB-backed
// integration tests (tests/integration/**) — where most of the actual
// use-case/route coverage now lives, since that logic is DB orchestration
// unsuitable for mocking — never contributed to this number. `include`
// below is appended to (not replacing) the base config's unit-test globs by
// vitest's mergeConfig array-concatenation. Run with
// `RUN_DB_INTEGRATION=true pnpm test:coverage:business` for the full
// picture (docker compose db must be up); without that env var the
// integration describe blocks self-skip and only unit coverage is measured.
try {
  process.loadEnvFile('.env.local');
} catch {
  // No .env.local (e.g. CI with real env vars already set) — fine.
}

export default mergeConfig(baseConfig, {
  test: {
    testTimeout: 20000,
    include: ['tests/integration/**/*.test.ts'],
    coverage: {
      reportsDirectory: './coverage-business',
      reporter: ['text', 'json-summary', 'html'],
      include: ['src/app/api/**/route.ts', 'src/lib/**/*.ts', 'src/modules/**/services/**/*.ts', 'src/modules/**/hooks/**/*.{ts,tsx}', 'src/modules/**/utils/**/*.ts'],
      // No static thresholds here — enforcement is a baseline-comparison
      // ratchet (scripts/check-coverage-ratchet.mjs against
      // tests/coverage-baseline.json), not a fixed bar. See
      // package.json's "test:coverage:business:ratchet".
      thresholds: { statements: 0, branches: 0, functions: 0, lines: 0 },
    },
  },
});
