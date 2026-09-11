import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  schema: './src/db/schema/index.ts',
  out: './src/db/drizzle',
  dialect: 'postgresql',
  dbCredentials: {
    url: process.env.DATABASE_MIGRATE_URL ?? 'postgres://postgres:postgres@localhost:5432/banco_alimentos',
  },
});
