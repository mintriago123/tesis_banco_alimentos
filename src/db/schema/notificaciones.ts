import { boolean, index, jsonb, pgTable, text, timestamp, unique, uuid, varchar } from 'drizzle-orm/pg-core';
import { usuarios } from './identity';

export const notificaciones = pgTable(
  'notificaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    titulo: varchar('titulo', { length: 255 }).notNull(),
    mensaje: text('mensaje').notNull(),
    tipo: varchar('tipo', { length: 50 }).default('info'),
    destinatarioId: uuid('destinatario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    rolDestinatario: varchar('rol_destinatario', { length: 50 }),
    categoria: varchar('categoria', { length: 100 }).notNull(),
    urlAccion: varchar('url_accion', { length: 500 }),
    metadatos: jsonb('metadatos').default({}),
    fechaCreacion: timestamp('fecha_creacion', { withTimezone: true, mode: 'date' }).defaultNow(),
    expiraEn: timestamp('expira_en', { withTimezone: true, mode: 'date' }),
  },
  (t) => [
    index('idx_notificaciones_categoria').on(t.categoria),
    index('idx_notificaciones_destinatario').on(t.destinatarioId),
    index('idx_notificaciones_fecha_creacion').on(t.fechaCreacion),
    index('idx_notificaciones_rol').on(t.rolDestinatario),
  ],
);

export const notificacionesUsuario = pgTable(
  'notificaciones_usuario',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    notificacionId: uuid('notificacion_id')
      .notNull()
      .references(() => notificaciones.id, { onDelete: 'cascade' }),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    leida: boolean('leida').default(false),
    oculta: boolean('oculta').default(false),
    fechaLectura: timestamp('fecha_lectura', { withTimezone: true, mode: 'date' }),
    fechaOcultacion: timestamp('fecha_ocultacion', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('notificaciones_usuario_notificacion_usuario_key').on(t.notificacionId, t.usuarioId),
    index('idx_notificaciones_usuario_usuario_notificacion').on(t.usuarioId, t.notificacionId),
    index('idx_notificaciones_usuario_usuario_visible').on(t.usuarioId, t.oculta),
  ],
);

export const configuracionNotificaciones = pgTable(
  'configuracion_notificaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id').references(() => usuarios.id, { onDelete: 'cascade' }),
    categoria: varchar('categoria', { length: 100 }).notNull(),
    emailActivo: boolean('email_activo').default(true),
    pushActivo: boolean('push_activo').default(true),
    sonidoActivo: boolean('sonido_activo').default(true),
    fechaActualizacion: timestamp('fecha_actualizacion', { withTimezone: true, mode: 'date' }).defaultNow(),
  },
  (t) => [unique('configuracion_notificaciones_usuario_categoria_key').on(t.usuarioId, t.categoria)],
);
