// ============================================================================
// Service: Solicitudes
// ============================================================================

import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  Solicitud,
  SolicitudFormData,
  SolicitudEditData,
  FiltroEstadoSolicitud,
} from '../types';
import {
  parseEnumValue,
  parseFiniteNumberValue,
  parseOptionalTextValue,
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

type SolicitudWithUnidad = Solicitud & {
  unidades?: {
    simbolo?: string | null;
  } | null;
};

const ESTADOS_SOLICITUD_FILTRO = ['pendiente', 'aprobada', 'rechazada', 'entregada'] as const;

export class SolicitudesService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Obtener todas las solicitudes de un usuario
   */
  async getSolicitudesByUsuario(
    usuarioId: string,
    filtroEstado?: FiltroEstadoSolicitud
  ): Promise<{ data: SolicitudWithUnidad[] | null; error: unknown }> {
    try {
      const parsedUsuarioId = parseUuidValue(usuarioId, { name: 'usuarioId' });
      if (!parsedUsuarioId.success) {
        return { data: null, error: parsedUsuarioId.error };
      }

      let query = this.supabase
        .from('solicitudes')
        .select(`
          *,
          unidades:unidad_id (
            simbolo
          )
        `)
        .eq('usuario_id', parsedUsuarioId.value)
        .order('created_at', { ascending: false });

      // Aplicar filtro de estado si no es TODOS
      if (filtroEstado && filtroEstado !== 'TODOS') {
        const estado = parseEnumValue(filtroEstado, ESTADOS_SOLICITUD_FILTRO, { name: 'filtroEstado' });
        if (!estado.success) {
          return { data: null, error: estado.error };
        }

        query = query.eq('estado', estado.value);
      }

      const { data, error } = await query;
      
      // Log de depuración para ver datos de solicitudes rechazadas
      if (data) {
        const rechazadas = (data as SolicitudWithUnidad[]).filter((s) => s.estado === 'rechazada');
        if (rechazadas.length > 0) {
          console.log('📋 Solicitudes rechazadas obtenidas desde BD:', rechazadas.map((s) => ({
            id: s.id,
            motivo_rechazo: s.motivo_rechazo,
            fecha_rechazo: s.fecha_rechazo,
            operador_rechazo_id: s.operador_rechazo_id,
            comentario_admin: s.comentario_admin
          })));
        }
      }
      
      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Crear una nueva solicitud
   */
  async createSolicitud(
    usuarioId: string,
    solicitudData: SolicitudFormData
  ): Promise<{ data: Solicitud | null; error: unknown }> {
    try {
      const parsedUsuarioId = parseUuidValue(usuarioId, { name: 'usuarioId' });
      if (!parsedUsuarioId.success) {
        return { data: null, error: parsedUsuarioId.error };
      }

      const cantidad = parseFiniteNumberValue(solicitudData.cantidad, {
        name: 'cantidad',
        min: 0,
      });
      if (!cantidad.success || cantidad.value <= 0) {
        return {
          data: null,
          error: cantidad.success ? 'cantidad debe ser mayor a 0.' : cantidad.error,
        };
      }

      const unidadId = parsePositiveIntegerValue(solicitudData.unidad_id, {
        name: 'unidad_id',
        min: 1,
      });
      if (!unidadId.success) {
        return { data: null, error: unidadId.error };
      }

      const comentarios = parseOptionalTextValue(solicitudData.comentarios, {
        name: 'comentarios',
        maxLength: 500,
      });
      if (!comentarios.success) {
        return { data: null, error: comentarios.error };
      }

      console.log('[SolicitudesService] Intentando crear solicitud:', {
        usuarioId,
        solicitudData
      });

      const insertData = {
        usuario_id: parsedUsuarioId.value,
        tipo_alimento: solicitudData.tipo_alimento,
        cantidad: cantidad.value,
        unidad_id: unidadId.value,
        comentarios: comentarios.value,
        latitud: solicitudData.latitud || null,
        longitud: solicitudData.longitud || null,
      };

      console.log('[SolicitudesService] Datos a insertar:', insertData);

      const { data, error } = await this.supabase
        .from('solicitudes')
        .insert(insertData)
        .select()
        .single();

      if (error) {
        console.error('[SolicitudesService] Error al crear solicitud:', error);
      } else {
        console.log('[SolicitudesService] Solicitud creada exitosamente:', data);
      }

      return { data, error };
    } catch (error) {
      console.error('[SolicitudesService] Exception al crear solicitud:', error);
      return { data: null, error };
    }
  }

  /**
   * Actualizar una solicitud existente
   */
  async updateSolicitud(
    solicitudId: string,
    updateData: SolicitudEditData
  ): Promise<{ data: Solicitud | null; error: unknown }> {
    try {
      const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
      if (!parsedSolicitudId.success) {
        return { data: null, error: parsedSolicitudId.error };
      }

      const comentarios = parseOptionalTextValue(updateData.comentarios, {
        name: 'comentarios',
        maxLength: 500,
      });
      if (!comentarios.success) {
        return { data: null, error: comentarios.error };
      }

      const { data, error } = await this.supabase
        .from('solicitudes')
        .update({ comentarios: comentarios.value })
        .eq('id', parsedSolicitudId.value)
        .select()
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }

  /**
   * Eliminar una solicitud
   */
  async deleteSolicitud(id: string): Promise<{ error: unknown }> {
    try {
      const parsedSolicitudId = parseUuidValue(id, { name: 'id' });
      if (!parsedSolicitudId.success) {
        return { error: parsedSolicitudId.error };
      }

      const { error } = await this.supabase
        .from('solicitudes')
        .delete()
        .eq('id', parsedSolicitudId.value);

      return { error };
    } catch (error) {
      return { error };
    }
  }

  /**
   * Obtener una solicitud por ID
   */
  async getSolicitudById(
    solicitudId: string
  ): Promise<{ data: Solicitud | null; error: unknown }> {
    try {
      const parsedSolicitudId = parseUuidValue(solicitudId, { name: 'solicitudId' });
      if (!parsedSolicitudId.success) {
        return { data: null, error: parsedSolicitudId.error };
      }

      const { data, error } = await this.supabase
        .from('solicitudes')
        .select('*')
        .eq('id', parsedSolicitudId.value)
        .single();

      return { data, error };
    } catch (error) {
      return { data: null, error };
    }
  }
}
