import { bigint, boolean, check, doublePrecision, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './identity';
import { unidades } from './catalogo';
import { productosDonados } from './inventario';

export const solicitudes = pgTable(
  'solicitudes',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    tipoAlimento: text('tipo_alimento').notNull(),
    cantidad: numeric('cantidad').notNull(),
    comentarios: text('comentarios'),
    latitud: doublePrecision('latitud'),
    longitud: doublePrecision('longitud'),
    estado: text('estado').default('pendiente').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    fechaRespuesta: timestamp('fecha_respuesta', { withTimezone: true, mode: 'date' }),
    comentarioAdmin: text('comentario_admin'),
    unidadId: bigint('unidad_id', { mode: 'number' })
      .notNull()
      .references(() => unidades.id),
    motivoRechazo: text('motivo_rechazo'),
    operadorRechazoId: uuid('operador_rechazo_id'),
    operadorAprobacionId: uuid('operador_aprobacion_id'),
    fechaRechazo: timestamp('fecha_rechazo', { withTimezone: true, mode: 'date' }),
    fechaAprobacion: timestamp('fecha_aprobacion', { withTimezone: true, mode: 'date' }),
    codigoComprobante: text('codigo_comprobante'),
    cantidadEntregada: numeric('cantidad_entregada', { precision: 10, scale: 2 }).default('0').notNull(),
    tieneEntregasParciales: boolean('tiene_entregas_parciales').default(false),
  },
  (t) => [
    index('idx_solicitudes_codigo_comprobante').on(t.codigoComprobante),
    index('idx_solicitudes_fecha_aprobacion').on(t.fechaAprobacion),
    index('idx_solicitudes_fecha_rechazo').on(t.fechaRechazo),
    index('idx_solicitudes_id_usuario').on(t.usuarioId),
    index('idx_solicitudes_motivo_rechazo').on(t.motivoRechazo),
    index('idx_solicitudes_operador_aprobacion').on(t.operadorAprobacionId),
    index('idx_solicitudes_operador_rechazo').on(t.operadorRechazoId),
    index('idx_solicitudes_unidad_id').on(t.unidadId),
    index('idx_solicitudes_estado_fecha_respuesta').on(t.estado, t.fechaRespuesta),
    check('solicitudes_estado_valido', sql`${t.estado} IN ('pendiente', 'aprobada', 'rechazada', 'entregada')`),
  ],
);

export const detallesSolicitud = pgTable('detalles_solicitud', {
  idDetalle: uuid('id_detalle').primaryKey().defaultRandom(),
  idSolicitud: uuid('id_solicitud').references(() => solicitudes.id, { onDelete: 'cascade' }),
  idProducto: uuid('id_producto').references(() => productosDonados.idProducto, { onDelete: 'set null' }),
  cantidadSolicitada: numeric('cantidad_solicitada'),
  cantidadEntregada: numeric('cantidad_entregada'),
  fechaRespuesta: timestamp('fecha_respuesta', { withTimezone: true, mode: 'date' }),
  comentarioAdmin: text('comentario_admin'),
});

export const historialDonaciones = pgTable(
  'historial_donaciones',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solicitudId: uuid('solicitud_id')
      .notNull()
      .references(() => solicitudes.id, { onDelete: 'cascade' }),
    cantidadEntregada: numeric('cantidad_entregada', { precision: 10, scale: 2 }).notNull(),
    porcentajeEntregado: numeric('porcentaje_entregado').notNull(),
    cantidadSolicitada: numeric('cantidad_solicitada', { precision: 10, scale: 2 }).notNull(),
    operadorId: uuid('operador_id').references(() => usuarios.id, { onDelete: 'set null' }),
    comentario: text('comentario'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_historial_donaciones_fecha').on(t.createdAt),
    index('idx_historial_donaciones_operador').on(t.operadorId),
    index('idx_historial_donaciones_solicitud').on(t.solicitudId),
    check('historial_cantidad_entregada_positiva', sql`${t.cantidadEntregada} > 0`),
    check('historial_porcentaje_rango', sql`${t.porcentajeEntregado} BETWEEN 0 AND 100`),
  ],
);
