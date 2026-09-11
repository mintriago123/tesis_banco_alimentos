import { bigint, boolean, check, date, doublePrecision, index, integer, numeric, pgTable, text, timestamp, uniqueIndex, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './identity';
import { unidades, alimentos } from './catalogo';
import { donaciones } from './donaciones';

export const depositos = pgTable('depositos', {
  idDeposito: uuid('id_deposito').primaryKey().defaultRandom(),
  nombre: text('nombre').notNull(),
  descripcion: text('descripcion'),
  direccion: text('direccion'),
  latitud: doublePrecision('latitud'),
  longitud: doublePrecision('longitud'),
  telefono: text('telefono'),
  activo: boolean('activo').default(true).notNull(),
});

export const donanteDepositos = pgTable(
  'donante_depositos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    donanteId: uuid('donante_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'cascade' }),
    idDeposito: uuid('id_deposito')
      .notNull()
      .references(() => depositos.idDeposito, { onDelete: 'restrict' }),
    esPrincipal: boolean('es_principal').default(true).notNull(),
    activo: boolean('activo').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('donante_depositos_donante_deposito_key').on(t.donanteId, t.idDeposito),
    uniqueIndex('idx_donante_deposito_principal_activo')
      .on(t.donanteId)
      .where(sql`${t.esPrincipal} = true AND ${t.activo} = true`),
  ],
);

export const productosDonados = pgTable(
  'productos_donados',
  {
    idProducto: uuid('id_producto').primaryKey().defaultRandom(),
    idUsuario: uuid('id_usuario').references(() => usuarios.id, { onDelete: 'set null' }),
    nombreProducto: text('nombre_producto'),
    descripcion: text('descripcion'),
    fechaDonacion: timestamp('fecha_donacion', { withTimezone: true, mode: 'date' }).defaultNow(),
    fechaCaducidad: timestamp('fecha_caducidad', { withTimezone: true, mode: 'date' }),
    alimentoId: bigint('alimento_id', { mode: 'number' }).references(() => alimentos.id),
    unidadId: bigint('unidad_id', { mode: 'number' }).references(() => unidades.id),
  },
  (t) => [
    index('idx_productos_id_usuario').on(t.idUsuario),
    index('idx_productos_donados_alimento_id').on(t.alimentoId),
    index('idx_productos_donados_unidad').on(t.unidadId),
    uniqueIndex('idx_productos_donante_nombre_unidad').on(
      sql`COALESCE(${t.idUsuario}, '00000000-0000-0000-0000-000000000000'::uuid)`,
      sql`lower(trim(${t.nombreProducto}))`,
      t.unidadId,
    ),
  ],
);

export const entradasInventario = pgTable(
  'entradas_inventario',
  {
    idEntrada: uuid('id_entrada').primaryKey().defaultRandom(),
    donacionId: integer('donacion_id').references(() => donaciones.id, { onDelete: 'set null' }),
    donanteId: uuid('donante_id').references(() => usuarios.id, { onDelete: 'set null' }),
    idDeposito: uuid('id_deposito')
      .notNull()
      .references(() => depositos.idDeposito, { onDelete: 'restrict' }),
    idProducto: uuid('id_producto')
      .notNull()
      .references(() => productosDonados.idProducto, { onDelete: 'restrict' }),
    unidadId: bigint('unidad_id', { mode: 'number' }).references(() => unidades.id),
    cantidadOriginal: numeric('cantidad_original').notNull(),
    cantidadDisponible: numeric('cantidad_disponible').notNull(),
    fechaVencimiento: date('fecha_vencimiento'),
    fechaIngreso: timestamp('fecha_ingreso', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    estado: text('estado').default('disponible').notNull(),
    esLegacy: boolean('es_legacy').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    uniqueIndex('entradas_inventario_donacion_unica').on(t.donacionId).where(sql`${t.donacionId} IS NOT NULL`),
    index('entradas_inventario_stock_idx').on(t.idDeposito, t.idProducto, t.cantidadDisponible),
    index('entradas_inventario_fefo_idx')
      .on(t.idDeposito, t.idProducto, t.fechaVencimiento, t.fechaIngreso)
      .where(sql`${t.cantidadDisponible} > 0 AND ${t.estado} = 'disponible'`),
    index('idx_entradas_inventario_donante_id').on(t.donanteId),
    index('idx_entradas_inventario_id_producto').on(t.idProducto),
    index('idx_entradas_inventario_unidad_id').on(t.unidadId),
    check('entradas_cantidad_original_positiva', sql`${t.cantidadOriginal} > 0`),
    check(
      'entradas_cantidad_disponible_rango',
      sql`${t.cantidadDisponible} >= 0 AND ${t.cantidadDisponible} <= ${t.cantidadOriginal}`,
    ),
    check('entradas_estado_valido', sql`${t.estado} IN ('disponible', 'agotado', 'cancelado')`),
    check('entradas_unidad_nueva_obligatoria', sql`${t.esLegacy} = true OR ${t.unidadId} IS NOT NULL`),
  ],
);

export const bajasProductos = pgTable(
  'bajas_productos',
  {
    idBaja: uuid('id_baja').primaryKey().defaultRandom(),
    idProducto: uuid('id_producto')
      .notNull()
      .references(() => productosDonados.idProducto, { onDelete: 'cascade' }),
    idEntrada: uuid('id_entrada').references(() => entradasInventario.idEntrada, { onDelete: 'set null' }),
    cantidadBaja: numeric('cantidad_baja').notNull(),
    motivoBaja: text('motivo_baja').notNull(),
    usuarioResponsableId: uuid('usuario_responsable_id')
      .notNull()
      .references(() => usuarios.id, { onDelete: 'restrict' }),
    fechaBaja: timestamp('fecha_baja', { withTimezone: true, mode: 'date' }).defaultNow(),
    observaciones: text('observaciones'),
    estadoBaja: text('estado_baja').default('confirmada'),
    nombreProducto: text('nombre_producto'),
    cantidadDisponibleAntes: numeric('cantidad_disponible_antes'),
    idDeposito: uuid('id_deposito').references(() => depositos.idDeposito, { onDelete: 'set null' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_bajas_productos_estado').on(t.estadoBaja),
    index('idx_bajas_productos_fecha').on(t.fechaBaja),
    index('idx_bajas_productos_motivo').on(t.motivoBaja),
    index('idx_bajas_productos_producto').on(t.idProducto),
    index('idx_bajas_productos_usuario').on(t.usuarioResponsableId),
    index('idx_bajas_productos_deposito').on(t.idDeposito),
    index('idx_bajas_productos_id_entrada').on(t.idEntrada),
    check('bajas_cantidad_positiva', sql`${t.cantidadBaja} > 0`),
    check(
      'bajas_motivo_valido',
      sql`${t.motivoBaja} IN ('vencido', 'dañado', 'contaminado', 'rechazado', 'otro')`,
    ),
    check('bajas_estado_valido', sql`${t.estadoBaja} IN ('confirmada', 'pendiente_revision', 'revisada')`),
  ],
);
