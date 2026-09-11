import { bigint, boolean, check, date, index, integer, jsonb, pgTable, numeric, serial, text, timestamp, unique, uuid } from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import { usuarios, users } from './identity';
import { alimentos, unidades } from './catalogo';
import { depositos } from './inventario';

export const donaciones = pgTable(
  'donaciones',
  {
    id: serial('id').primaryKey(),
    userId: uuid('user_id').references(() => usuarios.id, { onDelete: 'set null' }),
    nombreDonante: text('nombre_donante').notNull(),
    rucDonante: text('ruc_donante'),
    cedulaDonante: text('cedula_donante'),
    direccionDonanteCompleta: text('direccion_donante_completa'),
    telefono: text('telefono').notNull(),
    email: text('email').notNull(),
    representanteDonante: text('representante_donante'),
    tipoPersonaDonante: text('tipo_persona_donante'),
    alimentoId: bigint('alimento_id', { mode: 'number' }).references(() => alimentos.id),
    tipoProducto: text('tipo_producto').notNull(),
    categoriaComida: text('categoria_comida').notNull(),
    esProductoPersonalizado: boolean('es_producto_personalizado').default(false).notNull(),
    cantidad: numeric('cantidad', { precision: 10, scale: 2 }).notNull(),
    unidadId: bigint('unidad_id', { mode: 'number' })
      .notNull()
      .references(() => unidades.id),
    unidadNombre: text('unidad_nombre').notNull(),
    unidadSimbolo: text('unidad_simbolo').notNull(),
    fechaVencimiento: date('fecha_vencimiento'),
    fechaDisponible: date('fecha_disponible').notNull(),
    direccionEntrega: text('direccion_entrega').notNull(),
    horarioPreferido: text('horario_preferido'),
    observaciones: text('observaciones'),
    impactoEstimadoPersonas: integer('impacto_estimado_personas'),
    impactoEquivalente: text('impacto_equivalente'),
    estado: text('estado').default('Pendiente').notNull(),
    creadoEn: timestamp('creado_en', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    actualizadoEn: timestamp('actualizado_en', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    codigoComprobante: text('codigo_comprobante'),
    motivoCancelacion: text('motivo_cancelacion'),
    observacionesCancelacion: text('observaciones_cancelacion'),
    usuarioCancelacionId: uuid('usuario_cancelacion_id').references(() => users.id),
    fechaCancelacion: timestamp('fecha_cancelacion', { withTimezone: true, mode: 'date' }),
    idDeposito: uuid('id_deposito').references(() => depositos.idDeposito, { onDelete: 'restrict' }),
  },
  (t) => [
    index('idx_donaciones_alimento_id').on(t.alimentoId),
    index('idx_donaciones_unidad_id').on(t.unidadId),
    index('idx_donaciones_user_id').on(t.userId),
    index('idx_donaciones_estado').on(t.estado),
    index('idx_donaciones_fecha_disponible').on(t.fechaDisponible),
    index('idx_donaciones_codigo_comprobante').on(t.codigoComprobante),
    index('idx_donaciones_usuario_cancelacion').on(t.usuarioCancelacionId),
    index('idx_donaciones_id_deposito').on(t.idDeposito),
    check('donaciones_cantidad_positiva', sql`${t.cantidad} > 0`),
    check('donaciones_estado_valido', sql`${t.estado} IN ('Pendiente', 'Aprobada', 'Cancelada')`),
    check(
      'donaciones_motivo_cancelacion_valido',
      sql`${t.motivoCancelacion} IS NULL OR ${t.motivoCancelacion} IN ('error_donante', 'no_disponible', 'calidad_inadecuada', 'logistica_imposible', 'duplicado', 'solicitud_donante', 'otro')`,
    ),
    check(
      'check_observaciones_cancelacion',
      sql`${t.motivoCancelacion} <> 'otro' OR ${t.observacionesCancelacion} IS NOT NULL`,
    ),
  ],
);

export const auditoriaDonaciones = pgTable(
  'auditoria_donaciones',
  {
    id: bigint('id', { mode: 'number' }).generatedAlwaysAsIdentity().primaryKey(),
    donacionId: integer('donacion_id')
      .notNull()
      .references(() => donaciones.id, { onDelete: 'restrict' }),
    accion: text('accion').notNull(),
    estadoAnterior: text('estado_anterior'),
    estadoNuevo: text('estado_nuevo'),
    usuarioId: uuid('usuario_id')
      .notNull()
      .references(() => users.id, { onDelete: 'restrict' }),
    rolUsuario: text('rol_usuario').notNull(),
    motivo: text('motivo').notNull(),
    observaciones: text('observaciones'),
    fechaEvento: timestamp('fecha_evento', { withTimezone: true, mode: 'date' }).defaultNow().notNull(),
    metadatos: jsonb('metadatos').default({}),
  },
  (t) => [
    unique('auditoria_donaciones_donacion_accion_key').on(t.donacionId, t.accion),
    index('idx_auditoria_donaciones_donacion_fecha').on(t.donacionId, t.fechaEvento),
    index('idx_auditoria_donaciones_usuario_fecha').on(t.usuarioId, t.fechaEvento),
    check('auditoria_accion_valida', sql`${t.accion} = 'cancelacion'`),
    check('auditoria_estado_anterior_valido', sql`${t.estadoAnterior} = 'Pendiente'`),
    check('auditoria_estado_nuevo_valido', sql`${t.estadoNuevo} = 'Cancelada'`),
    check(
      'auditoria_motivo_valido',
      sql`${t.motivo} IN ('error_donante', 'no_disponible', 'calidad_inadecuada', 'logistica_imposible', 'duplicado', 'solicitud_donante', 'otro')`,
    ),
  ],
);
