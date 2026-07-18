import type { SupabaseClient } from '@supabase/supabase-js';
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

export const updateSolicitudById = async (
  supabaseClient: SupabaseClient,
  solicitudId: string,
  updateData: Record<string, unknown>
) => supabaseClient
  .from('solicitudes')
  .update(updateData)
  .eq('id', solicitudId);

export const rollbackSolicitudState = async (
  supabaseClient: SupabaseClient,
  solicitudId: string,
  snapshot: SolicitudStateSnapshot
) => updateSolicitudById(supabaseClient, solicitudId, { ...snapshot });
