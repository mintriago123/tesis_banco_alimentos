import { bigint, bigserial, boolean, check, index, numeric, pgTable, text, timestamp, unique } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';

export const alimentos = pgTable(
  'alimentos',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    nombre: text('nombre').notNull(),
    categoria: text('categoria'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('idx_alimentos_categoria').on(t.categoria), index('idx_alimentos_nombre').on(t.nombre)],
);

export const tiposMagnitud = pgTable(
  'tipos_magnitud',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    nombre: text('nombre').notNull().unique(),
    descripcion: text('descripcion'),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [index('idx_tipos_magnitud_nombre').on(t.nombre)],
);

export const unidades = pgTable(
  'unidades',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    nombre: text('nombre').notNull(),
    simbolo: text('simbolo').notNull(),
    tipoMagnitudId: bigint('tipo_magnitud_id', { mode: 'number' })
      .notNull()
      .references(() => tiposMagnitud.id),
    esBase: boolean('es_base').default(false).notNull(),
    activa: boolean('activa').default(true).notNull(),
    esDiscreta: boolean('es_discreta').default(false).notNull(),
    esPresentacion: boolean('es_presentacion').default(false).notNull(),
    permiteFraccion: boolean('permite_fraccion').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    index('idx_unidades_nombre').on(t.nombre),
    index('idx_unidades_simbolo').on(t.simbolo),
    index('idx_unidades_tipo_magnitud').on(t.tipoMagnitudId),
    index('idx_unidades_es_base').on(t.esBase).where(sql`${t.esBase} = true`),
  ],
);

export const alimentosUnidades = pgTable(
  'alimentos_unidades',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    alimentoId: bigint('alimento_id', { mode: 'number' })
      .notNull()
      .references(() => alimentos.id, { onDelete: 'cascade' }),
    unidadId: bigint('unidad_id', { mode: 'number' })
      .notNull()
      .references(() => unidades.id, { onDelete: 'cascade' }),
    esUnidadPrincipal: boolean('es_unidad_principal').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('alimentos_unidades_alimento_unidad_key').on(t.alimentoId, t.unidadId),
    index('idx_alimentos_unidades_alimento').on(t.alimentoId),
    index('idx_alimentos_unidades_unidad').on(t.unidadId),
  ],
);

export const conversiones = pgTable(
  'conversiones',
  {
    id: bigserial('id', { mode: 'number' }).primaryKey(),
    unidadOrigenId: bigint('unidad_origen_id', { mode: 'number' })
      .notNull()
      .references(() => unidades.id),
    unidadDestinoId: bigint('unidad_destino_id', { mode: 'number' })
      .notNull()
      .references(() => unidades.id),
    factorConversion: numeric('factor_conversion', { precision: 15, scale: 8 }).notNull(),
    activo: boolean('activo').default(true).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    unique('conversiones_origen_destino_key').on(t.unidadOrigenId, t.unidadDestinoId),
    index('idx_conversiones_origen').on(t.unidadOrigenId),
    index('idx_conversiones_destino').on(t.unidadDestinoId),
    index('idx_conversiones_bidireccional').on(t.unidadOrigenId, t.unidadDestinoId),
    check('conversiones_unidades_diferentes', sql`${t.unidadOrigenId} <> ${t.unidadDestinoId}`),
    check('conversiones_factor_positivo', sql`${t.factorConversion} > 0`),
  ],
);
