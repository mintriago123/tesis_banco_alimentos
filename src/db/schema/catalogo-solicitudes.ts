import { bigint, boolean, check, pgTable, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usuarios } from './identity';
import { alimentos, unidades } from './catalogo';

export const solicitudesAltaAlimentos = pgTable(
  'solicitudes_alta_alimentos',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    solicitanteId: uuid('solicitante_id')
      .notNull()
      .references(() => usuarios.id),
    nombre: text('nombre').notNull(),
    categoria: text('categoria').notNull(),
    comentarioDonante: text('comentario_donante'),
    estado: text('estado').default('pendiente').notNull(),
    comentarioAdmin: text('comentario_admin'),
    alimentoCreadoId: bigint('alimento_creado_id', { mode: 'number' }).references(() => alimentos.id),
    revisadoPor: uuid('revisado_por').references(() => usuarios.id),
    fechaRevision: timestamp('fecha_revision', { withTimezone: true, mode: 'date' }),
    createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
  },
  (t) => [
    check('solicitudes_alta_estado_valido', sql`${t.estado} IN ('pendiente', 'aprobada', 'rechazada')`),
    check('solicitudes_alta_nombre_no_vacio', sql`length(trim(${t.nombre})) > 0`),
    check('solicitudes_alta_categoria_no_vacia', sql`length(trim(${t.categoria})) > 0`),
  ],
);

export const solicitudesAltaAlimentosUnidades = pgTable(
  'solicitudes_alta_alimentos_unidades',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    solicitudId: uuid('solicitud_id')
      .notNull()
      .references(() => solicitudesAltaAlimentos.id, { onDelete: 'cascade' }),
    unidadId: bigint('unidad_id', { mode: 'number' })
      .notNull()
      .references(() => unidades.id),
    esUnidadPrincipal: boolean('es_unidad_principal').default(false),
  },
  (t) => [unique('solicitudes_alta_alimentos_unidades_solicitud_unidad_key').on(t.solicitudId, t.unidadId)],
);
