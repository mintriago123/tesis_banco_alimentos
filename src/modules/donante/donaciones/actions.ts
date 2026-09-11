'use server';

import { and, desc, eq } from 'drizzle-orm';
import { withRlsContext } from '@/db/client';
import { donaciones, unidades } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import { parseEnumValue, parseIsoDateValue, parseOptionalTextValue, parsePositiveIntegerValue, parsePositiveNumberValue } from '@/lib/validation-core';
import type { Donacion, MotivoCancelacion } from './types';

const MOTIVOS_CANCELACION = ['error_donante', 'no_disponible', 'calidad_inadecuada', 'logistica_imposible', 'duplicado', 'solicitud_donante', 'otro'] as const satisfies readonly MotivoCancelacion[];

function toDonacion(row: typeof donaciones.$inferSelect, unidadNombre: string | null, unidadSimbolo: string | null): Donacion {
  return {
    id: row.id,
    user_id: row.userId ?? '',
    id_deposito: row.idDeposito,
    nombre_donante: row.nombreDonante,
    ruc_donante: row.rucDonante ?? undefined,
    cedula_donante: row.cedulaDonante ?? undefined,
    direccion_donante_completa: row.direccionDonanteCompleta ?? undefined,
    telefono: row.telefono,
    email: row.email,
    representante_donante: row.representanteDonante ?? undefined,
    tipo_persona_donante: row.tipoPersonaDonante ?? undefined,
    alimento_id: row.alimentoId ?? undefined,
    tipo_producto: row.tipoProducto,
    categoria_comida: row.categoriaComida,
    es_producto_personalizado: row.esProductoPersonalizado,
    cantidad: Number(row.cantidad),
    unidad_id: row.unidadId,
    unidad_nombre: unidadNombre || row.unidadNombre || '',
    unidad_simbolo: unidadSimbolo || row.unidadSimbolo || '',
    fecha_vencimiento: row.fechaVencimiento ?? undefined,
    fecha_disponible: row.fechaDisponible,
    direccion_entrega: row.direccionEntrega,
    horario_preferido: row.horarioPreferido ?? undefined,
    observaciones: row.observaciones ?? undefined,
    impacto_estimado_personas: row.impactoEstimadoPersonas ?? undefined,
    impacto_equivalente: row.impactoEquivalente ?? undefined,
    estado: row.estado as Donacion['estado'],
    creado_en: row.creadoEn.toISOString(),
    actualizado_en: row.actualizadoEn.toISOString(),
    codigo_comprobante: row.codigoComprobante ?? undefined,
    motivo_cancelacion: (row.motivoCancelacion as MotivoCancelacion | null) ?? null,
    observaciones_cancelacion: row.observacionesCancelacion,
    usuario_cancelacion_id: row.usuarioCancelacionId,
    fecha_cancelacion: row.fechaCancelacion ? row.fechaCancelacion.toISOString() : null,
  };
}

export async function fetchMisDonacionesAction(): Promise<{ success: boolean; data: Donacion[]; error?: string }> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, data: [], error: 'No autenticado.' };
  }

  try {
    const rows = await withRlsContext(auth.profile.id, (tx) =>
      tx
        .select({ donacion: donaciones, unidadNombre: unidades.nombre, unidadSimbolo: unidades.simbolo })
        .from(donaciones)
        .leftJoin(unidades, eq(donaciones.unidadId, unidades.id))
        .where(eq(donaciones.userId, auth.profile.id))
        .orderBy(desc(donaciones.creadoEn)),
    );

    return { success: true, data: rows.map((r) => toDonacion(r.donacion, r.unidadNombre, r.unidadSimbolo)) };
  } catch (err) {
    console.error('Error al cargar donaciones:', err);
    return { success: false, data: [], error: 'Error al cargar donaciones' };
  }
}

export async function cancelarDonacionAction(id: number, motivo: MotivoCancelacion, observaciones?: string): Promise<{ success: boolean; data?: Donacion; error?: string }> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, error: 'No autenticado.' };
  }

  const donacionId = parsePositiveIntegerValue(id, { name: 'id', min: 1, max: 2147483647 });
  if (!donacionId.success) return { success: false, error: donacionId.error };

  const motivoResult = parseEnumValue(motivo, MOTIVOS_CANCELACION, { name: 'motivo' });
  if (!motivoResult.success) return { success: false, error: motivoResult.error };

  const observacionesResult = parseOptionalTextValue(observaciones, { name: 'observaciones', maxLength: 500 });
  if (!observacionesResult.success) return { success: false, error: observacionesResult.error };

  if (motivoResult.value === 'otro' && !observacionesResult.value) {
    return { success: false, error: 'Las observaciones son obligatorias cuando el motivo es otro' };
  }

  try {
    const rows = await withRlsContext(auth.profile.id, async (tx) => {
      // The `validar_cancelacion_donacion` trigger forces motivo='solicitud_donante'
      // and stamps usuario_cancelacion_id/fecha_cancelacion for a donor-initiated
      // cancellation — we still pass motivo/observaciones for the audit trail,
      // but the trigger is the source of truth for the state-machine guard.
      await tx
        .update(donaciones)
        .set({ estado: 'Cancelada', motivoCancelacion: motivoResult.value, observacionesCancelacion: observacionesResult.value })
        .where(and(eq(donaciones.id, donacionId.value), eq(donaciones.estado, 'Pendiente'), eq(donaciones.userId, auth.profile.id)));

      return tx
        .select({ donacion: donaciones, unidadNombre: unidades.nombre, unidadSimbolo: unidades.simbolo })
        .from(donaciones)
        .leftJoin(unidades, eq(donaciones.unidadId, unidades.id))
        .where(eq(donaciones.id, donacionId.value))
        .limit(1);
    });

    const row = rows[0];
    if (!row || row.donacion.estado !== 'Cancelada') {
      return { success: false, error: 'Solo se pueden cancelar donaciones pendientes propias' };
    }

    return { success: true, data: toDonacion(row.donacion, row.unidadNombre, row.unidadSimbolo) };
  } catch (err) {
    console.error('Error al cancelar donación', { donacionId: donacionId.value, err });
    return { success: false, error: 'Error al cancelar donación' };
  }
}

export async function actualizarDonacionAction(donacion: Donacion): Promise<{ success: boolean; error?: string }> {
  const auth = await requireRole(['DONANTE']);
  if (auth.response) {
    return { success: false, error: 'No autenticado.' };
  }

  const donacionId = parsePositiveIntegerValue(donacion.id, { name: 'donacion.id', min: 1, max: 2147483647 });
  if (!donacionId.success) return { success: false, error: donacionId.error };

  const cantidad = parsePositiveNumberValue(donacion.cantidad, { name: 'cantidad' });
  if (!cantidad.success) return { success: false, error: cantidad.error };

  const fechaDisponible = parseIsoDateValue(donacion.fecha_disponible, { name: 'fecha_disponible' });
  if (!fechaDisponible.success || !fechaDisponible.value) {
    return { success: false, error: fechaDisponible.success ? 'fecha_disponible es requerida.' : fechaDisponible.error };
  }
  const fechaDisponibleValue: string = fechaDisponible.value;

  const observaciones = parseOptionalTextValue(donacion.observaciones, { name: 'observaciones', maxLength: 500 });
  if (!observaciones.success) return { success: false, error: observaciones.error };

  try {
    await withRlsContext(auth.profile.id, (tx) =>
      tx
        .update(donaciones)
        .set({
          tipoProducto: donacion.tipo_producto,
          categoriaComida: donacion.categoria_comida,
          cantidad: String(cantidad.value),
          fechaDisponible: fechaDisponibleValue,
          direccionEntrega: donacion.direccion_entrega,
          horarioPreferido: donacion.horario_preferido,
          observaciones: observaciones.value,
        })
        .where(and(eq(donaciones.id, donacionId.value), eq(donaciones.estado, 'Pendiente'), eq(donaciones.userId, auth.profile.id))),
    );

    return { success: true };
  } catch (err) {
    console.error('Error al actualizar donación:', err);
    return { success: false, error: 'Error al actualizar donación' };
  }
}
