'use server';

import { revalidatePath } from 'next/cache';
import { and, desc, eq } from 'drizzle-orm';
import { withRlsContext, type Tx } from '@/db/client';
import { alimentos, donaciones } from '@/db/schema';
import { requireRole } from '@/lib/server-auth';
import { generarCodigoComprobante } from '@/lib/comprobante';
import { sendNotification } from '@/modules/shared/services/notificationClient';
import { parseEnumValue, parseOptionalTextValue, parsePositiveIntegerValue } from '@/lib/validation-core';
import type { Donation, DonationEstado, MotivoCancelacion, ServiceResult } from './types';
import { SYSTEM_MESSAGES } from './constants';

const MOTIVOS_CANCELACION = [
  'error_donante',
  'no_disponible',
  'calidad_inadecuada',
  'logistica_imposible',
  'duplicado',
  'solicitud_donante',
  'otro',
] as const satisfies readonly MotivoCancelacion[];

function toDonation(row: typeof donaciones.$inferSelect, alimentoNombre: string | null, alimentoCategoria: string | null): Donation {
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
    tipo_persona_donante: (row.tipoPersonaDonante as Donation['tipo_persona_donante']) ?? 'Natural',
    alimento_id: row.alimentoId ?? undefined,
    tipo_producto: row.tipoProducto,
    categoria_comida: row.categoriaComida,
    es_producto_personalizado: row.esProductoPersonalizado,
    cantidad: Number(row.cantidad),
    unidad_id: row.unidadId,
    unidad_nombre: row.unidadNombre,
    unidad_simbolo: row.unidadSimbolo,
    fecha_vencimiento: row.fechaVencimiento ?? null,
    fecha_disponible: row.fechaDisponible,
    direccion_entrega: row.direccionEntrega,
    horario_preferido: row.horarioPreferido,
    observaciones: row.observaciones,
    impacto_estimado_personas: row.impactoEstimadoPersonas,
    impacto_equivalente: row.impactoEquivalente,
    estado: row.estado as DonationEstado,
    creado_en: row.creadoEn.toISOString(),
    actualizado_en: row.actualizadoEn.toISOString(),
    alimento: alimentoNombre ? { nombre: alimentoNombre, categoria: alimentoCategoria ?? 'Sin categoría' } : null,
    codigo_comprobante: row.codigoComprobante ?? undefined,
    motivo_cancelacion: (row.motivoCancelacion as MotivoCancelacion | null) ?? null,
    observaciones_cancelacion: row.observacionesCancelacion,
    usuario_cancelacion_id: row.usuarioCancelacionId,
    fecha_cancelacion: row.fechaCancelacion ? row.fechaCancelacion.toISOString() : null,
  };
}

/** ADMINISTRADOR + OPERADOR can both view/approve; only ADMINISTRADOR can cancel — the `validar_cancelacion_donacion` trigger enforces this too (raises for any role outside DONANTE/ADMINISTRADOR). */
export async function fetchDonationsAction(): Promise<ServiceResult<Donation[]>> {
  const auth = await requireRole(['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  try {
    const rows = await withRlsContext(auth.profile.id, (tx: Tx) =>
      tx
        .select({ donacion: donaciones, alimentoNombre: alimentos.nombre, alimentoCategoria: alimentos.categoria })
        .from(donaciones)
        .leftJoin(alimentos, eq(donaciones.alimentoId, alimentos.id))
        .orderBy(desc(donaciones.id)),
    );

    return { success: true, data: rows.map((r) => toDonation(r.donacion, r.alimentoNombre, r.alimentoCategoria)) };
  } catch (err) {
    console.error('Error consultando donaciones', err);
    return { success: false, error: SYSTEM_MESSAGES.loadError, errorDetails: err };
  }
}

export interface UpdateDonationEstadoResult {
  message: string;
  warning?: boolean;
}

export async function updateDonationEstadoAction(
  donationId: number,
  nuevoEstado: DonationEstado,
  cancelacionData?: { motivo: MotivoCancelacion; observaciones?: string },
): Promise<ServiceResult<UpdateDonationEstadoResult>> {
  const isCancelling = nuevoEstado === 'Cancelada';
  const auth = await requireRole(isCancelling ? ['ADMINISTRADOR'] : ['ADMINISTRADOR', 'OPERADOR']);
  if (auth.response) {
    return { success: false, error: 'No autorizado' };
  }

  const parsedId = parsePositiveIntegerValue(donationId, { name: 'donationId', min: 1, max: 2147483647 });
  if (!parsedId.success) {
    return { success: false, error: parsedId.error };
  }

  let motivo: MotivoCancelacion | undefined;
  let observaciones: string | null = null;

  if (isCancelling) {
    if (!cancelacionData) {
      return { success: false, error: 'Se requiere motivo y observaciones para cancelar una donación' };
    }

    const motivoResult = parseEnumValue(cancelacionData.motivo, MOTIVOS_CANCELACION, { name: 'motivo' });
    if (!motivoResult.success) {
      return { success: false, error: motivoResult.error };
    }

    const observacionesResult = parseOptionalTextValue(cancelacionData.observaciones, { name: 'observaciones', maxLength: 500 });
    if (!observacionesResult.success) {
      return { success: false, error: observacionesResult.error };
    }

    if (motivoResult.value === 'otro' && !observacionesResult.value) {
      return { success: false, error: 'Las observaciones son obligatorias cuando el motivo es otro' };
    }

    motivo = motivoResult.value;
    observaciones = observacionesResult.value;
  }

  try {
    const result = await withRlsContext(auth.profile.id, async (tx: Tx) => {
      // The donation must still be Pendiente to transition at all (matches
      // the `validar_cancelacion_donacion`/RLS state machine — this is a
      // friendlier pre-check, not a substitute for it, so the trigger's own
      // exception still fires on a genuine race).
      const [current] = await tx.select({ estado: donaciones.estado, idDeposito: donaciones.idDeposito }).from(donaciones).where(eq(donaciones.id, parsedId.value)).limit(1);

      if (!current) {
        return { success: false as const, error: 'Donación no encontrada' };
      }

      if (isCancelling && current.estado !== 'Pendiente') {
        return { success: false as const, error: 'Solo se pueden cancelar donaciones pendientes' };
      }

      const codigoComprobante = generarCodigoComprobante('donacion', String(parsedId.value));

      const updateData: Partial<typeof donaciones.$inferInsert> = {
        estado: nuevoEstado,
        actualizadoEn: new Date(),
        codigoComprobante,
      };

      if (isCancelling && motivo) {
        updateData.motivoCancelacion = motivo;
        updateData.observacionesCancelacion = observaciones;
        // usuario_cancelacion_id / fecha_cancelacion are stamped by the
        // `validar_cancelacion_donacion` trigger itself (from auth.uid()),
        // not set here.
      }

      try {
        await tx.update(donaciones).set(updateData).where(and(eq(donaciones.id, parsedId.value)));
      } catch (updateError) {
        console.error('Error actualizando estado de donación', updateError);
        return { success: false as const, error: 'No fue posible actualizar el estado de la donación', errorDetails: updateError };
      }

      // `trigger_crear_producto` (AFTER UPDATE) creates the inventory entry
      // automatically when estado transitions to 'Aprobada' — nothing to do
      // here. There is no inventory rollback path to port: the cancellation
      // trigger only permits Pendiente -> Cancelada, so an already-approved
      // donation (which would have an inventory entry) can never reach this
      // branch — the old app's rollback-on-cancel code was unreachable dead
      // code under the current trigger and was not ported.

      return { success: true as const, data: { message: SYSTEM_MESSAGES.stateUpdateSuccess(nuevoEstado) } };
    });

    if (result.success) {
      await sendNotification({ event: 'donation_status_changed', entityId: String(parsedId.value) });
      revalidatePath('/admin/reportes/donaciones');
      revalidatePath('/operador/donaciones');
    }

    return result;
  } catch (err) {
    console.error('Excepción al actualizar estado de donación', err);
    const message = err instanceof Error ? err.message : 'Error inesperado al actualizar la donación';
    return { success: false, error: message, errorDetails: err };
  }
}
