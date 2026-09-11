import { bigint, check, index, numeric, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

import { sql } from 'drizzle-orm';
import { usuarios } from './identity';
import { unidades } from './catalogo';
import { productosDonados, entradasInventario, depositos } from './inventario';

export const movimientoInventarioCabecera = pgTable(
  'movimiento_inventario_cabecera',
  {
    idMovimiento: uuid('id_movimiento').primaryKey().defaultRandom(),
    fechaMovimiento: timestamp('fecha_movimiento', { mode: 'date' }),
    idDonante: uuid('id_donante')
      .notNull()
      .references(() => usuarios.id),
    idSolicitante: uuid('id_solicitante')
      .notNull()
      .references(() => usuarios.id),
    estadoMovimiento: text('estado_movimiento').notNull(),
    observaciones: text('observaciones'),
  },
  (t) => [
    index('idx_movimiento_donante').on(t.idDonante),
    index('idx_movimiento_solicitante').on(t.idSolicitante),
    check('movimiento_cabecera_estado_valido', sql`${t.estadoMovimiento} IN ('pendiente', 'completado', 'donado')`),
  ],
);

export const movimientoInventarioDetalle = pgTable(
  'movimiento_inventario_detalle',
  {
    idDetalle: uuid('id_detalle').primaryKey().defaultRandom(),
    idMovimiento: uuid('id_movimiento')
      .notNull()
      .references(() => movimientoInventarioCabecera.idMovimiento, { onDelete: 'cascade' }),
    idProducto: uuid('id_producto')
      .notNull()
      .references(() => productosDonados.idProducto),
    cantidad: numeric('cantidad').notNull(),
    tipoTransaccion: text('tipo_transaccion').notNull(),
    rolUsuario: text('rol_usuario').notNull(),
    observacionDetalle: text('observacion_detalle'),
    unidadId: bigint('unidad_id', { mode: 'number' }).references(() => unidades.id),
    cantidadOriginal: numeric('cantidad_original'),
    unidadConvertidaId: bigint('unidad_convertida_id', { mode: 'number' }).references(() => unidades.id),
    idEntrada: uuid('id_entrada').references(() => entradasInventario.idEntrada, { onDelete: 'set null' }),
    idDeposito: uuid('id_deposito').references(() => depositos.idDeposito, { onDelete: 'set null' }),
  },
  (t) => [
    index('idx_detalle_movimiento').on(t.idMovimiento),
    index('idx_detalle_producto').on(t.idProducto),
    index('idx_movimiento_detalle_unidad').on(t.unidadId),
    index('idx_movimiento_detalle_id_entrada').on(t.idEntrada),
    index('idx_movimiento_detalle_id_deposito').on(t.idDeposito),
    index('idx_movimiento_detalle_unidad_convertida').on(t.unidadConvertidaId),
    check('movimiento_detalle_tipo_valido', sql`${t.tipoTransaccion} IN ('ingreso', 'egreso', 'baja')`),
    check('movimiento_detalle_rol_valido', sql`${t.rolUsuario} IN ('donante', 'beneficiario', 'distribuidor')`),
    check('movimiento_detalle_cantidad_no_negativa', sql`${t.cantidad} > 0`),
  ],
);
