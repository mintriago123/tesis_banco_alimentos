import { eq } from 'drizzle-orm';
import type { PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import type * as schema from '@/db/schema';
import { solicitudes } from '@/db/schema';
import type { Solicitud } from '../../types';
import type { SolicitudStateSnapshot } from './types';

export const snapshotSolicitudState = (solicitud: Solicitud): SolicitudStateSnapshot => ({
  estado: solicitud.estado,
  fecha_respuesta: solicitud.fecha_respuesta ?? null,
  comentario_admin: solicitud.comentario_admin ?? null,
  codigo_comprobante: solicitud.codigo_comprobante ?? null,
  operador_aprobacion_id: solicitud.operador_aprobacion_id ?? null,
  fecha_aprobacion: solicitud.fecha_aprobacion ?? null,
  cantidad_entregada: solicitud.cantidad_entregada ?? null,
  tiene_entregas_parciales: solicitud.tiene_entregas_parciales ?? null,
});

// The use-case files build their update payloads as snake_case records
// (matching the old Supabase `.update({...})` calls almost verbatim, to keep
// the ported business logic close to the original). This maps those keys to
// the actual Drizzle column set for `solicitudes` once, here.
const FIELD_MAP: Record<string, keyof typeof solicitudes.$inferInsert> = {
  estado: 'estado',
  fecha_respuesta: 'fechaRespuesta',
  comentario_admin: 'comentarioAdmin',
  motivo_rechazo: 'motivoRechazo',
  operador_rechazo_id: 'operadorRechazoId',
  fecha_rechazo: 'fechaRechazo',
  operador_aprobacion_id: 'operadorAprobacionId',
  fecha_aprobacion: 'fechaAprobacion',
  codigo_comprobante: 'codigoComprobante',
  cantidad_entregada: 'cantidadEntregada',
  tiene_entregas_parciales: 'tieneEntregasParciales',
};

function toDrizzleUpdate(updateData: Record<string, unknown>): Partial<typeof solicitudes.$inferInsert> {
  const mapped: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(updateData)) {
    const column = FIELD_MAP[key];
    if (!column) continue;

    if (value instanceof Date) {
      mapped[column] = value;
    } else if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T/.test(value)) {
      mapped[column] = new Date(value);
    } else {
      mapped[column] = value;
    }
  }

  return mapped as Partial<typeof solicitudes.$inferInsert>;
}

export const updateSolicitudById = async (
  db: PostgresJsDatabase<typeof schema>,
  solicitudId: string,
  updateData: Record<string, unknown>,
): Promise<{ error: unknown }> => {
  try {
    await db.update(solicitudes).set(toDrizzleUpdate(updateData)).where(eq(solicitudes.id, solicitudId));
    return { error: null };
  } catch (error) {
    return { error };
  }
};

export const rollbackSolicitudState = async (
  db: PostgresJsDatabase<typeof schema>,
  solicitudId: string,
  snapshot: SolicitudStateSnapshot,
) => updateSolicitudById(db, solicitudId, { ...snapshot });
