import '@testing-library/jest-dom/vitest';

// `@/db/client` reads these eagerly at import time (`postgres()` itself
// connects lazily, so no real DB is touched) — unit tests that pull in a
// module transitively importing `@/db/client` without meaning to exercise
// the DB would otherwise fail on missing env vars alone.
process.env.DATABASE_URL ??= 'postgres://unit-test:unit-test@localhost:5432/unit_test_unused';
process.env.DATABASE_ADMIN_URL ??= 'postgres://unit-test:unit-test@localhost:5432/unit_test_unused';
