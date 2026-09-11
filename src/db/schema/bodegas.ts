import { check, doublePrecision, index, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './identity';
import { depositos } from './inventario';

export const solicitudesBodega = pgTable(
  'solicitudes_bodega',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donanteId: uuid('donante_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    idDeposito: uuid('id_deposito').references(() => depositos.idDeposito, { onDelete: 'restrict' }),
    tipo: text('tipo').notNull(),
    nombre: text('nombre').notNull(),
    descripcion: text('descripcion'),
    direccion: text('direccion').notNull(),
    telefono: text('telefono').notNull(),
    latitud: doublePrecision('latitud'),
    longitud: doublePrecision('longitud'),
    estado: text('estado').default('PENDIENTE').notNull(),
    motivoRechazo: text('motivo_rechazo'),
    revisadoPor: uuid('revisado_por').references(() => usuarios.id, { onDelete: 'set null' }),
    revisadoAt: timestamp('revisado_at', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_solicitudes_bodega_donante_estado').on(t.donanteId, t.estado),
    index('idx_solicitudes_bodega_estado_created').on(t.estado, t.createdAt),
    uniqueIndex('solicitudes_bodega_alta_pendiente_unica')
      .on(t.donanteId, t.nombre)
      .where(sql`${t.tipo} = 'ALTA' AND ${t.estado} = 'PENDIENTE'`),
    uniqueIndex('solicitudes_bodega_modificacion_pendiente_unica')
      .on(t.donanteId, t.idDeposito)
      .where(sql`${t.tipo} = 'MODIFICACION' AND ${t.estado} = 'PENDIENTE'`),
    check('solicitudes_bodega_tipo_valido', sql`${t.tipo} IN ('ALTA', 'MODIFICACION')`),
    check('solicitudes_bodega_nombre_longitud', sql`length(${t.nombre}) BETWEEN 2 AND 150`),
    check('solicitudes_bodega_direccion_longitud', sql`length(${t.direccion}) BETWEEN 5 AND 250`),
    check('solicitudes_bodega_telefono_longitud', sql`length(${t.telefono}) BETWEEN 7 AND 30`),
    check(
      'solicitudes_bodega_estado_valido',
      sql`${t.estado} IN ('PENDIENTE', 'APROBADA', 'RECHAZADA', 'CANCELADA')`,
    ),
    check(
      'solicitudes_bodega_tipo_deposito_check',
      sql`(${t.tipo} = 'ALTA' AND ${t.idDeposito} IS NULL) OR (${t.tipo} = 'MODIFICACION' AND ${t.idDeposito} IS NOT NULL)`,
    ),
    check(
      'solicitudes_bodega_rechazo_check',
      sql`${t.estado} <> 'RECHAZADA' OR length(${t.motivoRechazo}) >= 5`,
    ),
    check('solicitudes_bodega_latitud_rango', sql`${t.latitud} IS NULL OR ${t.latitud} BETWEEN -90 AND 90`),
    check('solicitudes_bodega_longitud_rango', sql`${t.longitud} IS NULL OR ${t.longitud} BETWEEN -180 AND 180`),
  ],
);
