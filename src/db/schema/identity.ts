import { boolean, check, doublePrecision, index, integer, pgTable, primaryKey, text, timestamp, uniqueIndex, uuid, varchar } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { AdapterAccountType } from 'next-auth/adapters';

// --- Auth identity table ------------------------------------------------
// `accounts`/`sessions`/`verificationTokens` below are unused now that
// src/auth.ts uses the JWT session strategy with no adapter (Credentials-only,
// no OAuth) — kept only because nothing currently reads/writes them, not
// because anything requires their shape. `users.id` is uuid so it lines up
// 1:1 with `usuarios.id`, mirroring the old `usuarios.id -> auth.users.id`
// relationship.

export const users = pgTable('user', {
  id: uuid('id').primaryKey().defaultRandom(),
  name: text('name'),
  email: text('email').notNull().unique(),
  emailVerified: timestamp('email_verified', { withTimezone: true, mode: 'date' }),
  image: text('image'),
  passwordHash: text('password_hash').notNull(),
});

export const accounts = pgTable(
  'account',
  {
    userId: uuid('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    type: text('type').$type<AdapterAccountType>().notNull(),
    provider: text('provider').notNull(),
    providerAccountId: text('provider_account_id').notNull(),
    refresh_token: text('refresh_token'),
    access_token: text('access_token'),
    expires_at: integer('expires_at'),
    token_type: text('token_type'),
    scope: text('scope'),
    id_token: text('id_token'),
    session_state: text('session_state'),
  },
  (account) => [primaryKey({ columns: [account.provider, account.providerAccountId] })],
);

export const sessions = pgTable('session', {
  sessionToken: text('session_token').primaryKey(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
});

export const verificationTokens = pgTable(
  'verification_token',
  {
    identifier: text('identifier').notNull(),
    token: text('token').notNull(),
    expires: timestamp('expires', { withTimezone: true, mode: 'date' }).notNull(),
  },
  (vt) => [primaryKey({ columns: [vt.identifier, vt.token] })],
);

// Password-reset tokens (Auth.js has no built-in flow for the Credentials
// provider). One-time, short-lived, hashed token per request.
export const passwordResetTokens = pgTable('password_reset_token', {
  id: uuid('id').primaryKey().defaultRandom(),
  userId: uuid('user_id')
    .notNull()
    .references(() => users.id, { onDelete: 'cascade' }),
  tokenHash: text('token_hash').notNull().unique(),
  expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
  usedAt: timestamp('used_at', { withTimezone: true, mode: 'date' }),
  createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
});

// --- Business profile table (was `public.usuarios`, FK'd to `auth.users`) --

export const usuarios = pgTable(
  'usuarios',
  {
    id: uuid('id')
      .primaryKey()
      .references(() => users.id, { onDelete: 'cascade' }),
    rol: text('rol').notNull(),
    tipoPersona: text('tipo_persona'),
    nombre: text('nombre'),
    ruc: text('ruc'),
    cedula: text('cedula'),
    direccion: text('direccion'),
    telefono: text('telefono'),
    representante: text('representante'),
    estado: varchar('estado', { length: 20 }).default('activo').notNull(),
    email: text('email'),
    recibirNotificaciones: boolean('recibir_notificaciones').default(true).notNull(),
    fechaFinBloqueo: timestamp('fecha_fin_bloqueo', { withTimezone: true, mode: 'date' }),
    motivoBloqueo: text('motivo_bloqueo'),
    latitud: doublePrecision('latitud'),
    longitud: doublePrecision('longitud'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_usuarios_estado').on(t.estado),
    index('idx_usuarios_fecha_fin_bloqueo').on(t.fechaFinBloqueo).where(sql`${t.fechaFinBloqueo} IS NOT NULL`),
    uniqueIndex('unique_cedula_idx')
      .on(t.cedula)
      .where(sql`${t.cedula} IS NOT NULL AND ${t.cedula} <> ''`),
    check('usuarios_rol_valido', sql`${t.rol} IN ('ADMINISTRADOR', 'DONANTE', 'SOLICITANTE', 'OPERADOR')`),
    check('usuarios_estado_valido', sql`${t.estado} IN ('activo', 'bloqueado', 'desactivado')`),
    check('usuarios_cedula_format_check', sql`${t.cedula} IS NULL OR ${t.cedula} ~ '^[0-9]{10}$'`),
    check('usuarios_ruc_format_check', sql`${t.ruc} IS NULL OR ${t.ruc} ~ '^[0-9]{13}$'`),
    check('usuarios_latitud_range_check', sql`${t.latitud} IS NULL OR ${t.latitud} BETWEEN -90 AND 90`),
    check('usuarios_longitud_range_check', sql`${t.longitud} IS NULL OR ${t.longitud} BETWEEN -180 AND 180`),
  ],
);
