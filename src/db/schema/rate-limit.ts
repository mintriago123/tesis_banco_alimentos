import { check, index, integer, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './identity';

export const apiRateLimits = pgTable(
  'api_rate_limits',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    endpoint: text('endpoint').notNull(),
    windowStart: timestamp('window_start', { withTimezone: true, mode: 'date' }).notNull(),
    requestCount: integer('request_count').default(1).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('api_rate_limits_user_endpoint_window_key').on(t.userId, t.endpoint, t.windowStart),
    index('idx_api_rate_limits_user_endpoint_window').on(t.userId, t.endpoint, t.windowStart),
    check('api_rate_limits_endpoint_valido', sql`${t.endpoint} IN ('consulta_cedula', 'consulta_ruc')`),
    check('api_rate_limits_count_no_negativo', sql`${t.requestCount} >= 0`),
  ],
);

export const apiDocumentLookupAuditLog = pgTable(
  'api_document_lookup_audit_log',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    userId: uuid('user_id').references(() => usuarios.id, { onDelete: 'set null' }),
    endpoint: text('endpoint').notNull(),
    documentHash: text('document_hash').notNull(),
    status: text('status').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_api_document_lookup_audit_log_user_created').on(t.userId, t.createdAt),
    check('audit_log_endpoint_valido', sql`${t.endpoint} IN ('consulta_cedula', 'consulta_ruc')`),
    check('audit_log_hash_formato', sql`${t.documentHash} ~ '^[a-f0-9]{64}$'`),
    check('audit_log_status_valido', sql`${t.status} IN ('allowed', 'blocked_rate_limit')`),
  ],
);
