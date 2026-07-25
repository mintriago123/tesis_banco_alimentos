import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CatalogoSolicitudResult,
  CrearSolicitudAltaInput,
  RechazarSolicitudAltaInput,
  RevisarSolicitudAltaInput,
  SolicitudAltaAlimento,
  SolicitudAltaUnidad
} from './types';
import {
  isPlainRecord,
  parseOptionalTextValue,
  parsePositiveIntegerArrayValue,
  parsePositiveIntegerValue,
  parseUuidValue,
} from '@/lib/validation-core';

type SolicitudAltaRow = Omit<SolicitudAltaAlimento, 'unidades' | 'solicitante'> & {
  unidades?: SolicitudAltaUnidad[] | null;
  solicitante?: { nombre: string | null; email: string | null } | null;
};

const normalizeSolicitud = (row: SolicitudAltaRow): SolicitudAltaAlimento => ({
  ...row,
  unidades: row.unidades ?? [],
  solicitante: row.solicitante ?? null
});

const solicitudSelect = `
  id,
  solicitante_id,
  nombre,
  categoria,
  comentario_donante,
  estado,
  comentario_admin,
  alimento_creado_id,
  revisado_por,
  fecha_revision,
  created_at,
  updated_at,
  solicitante:usuarios!solicitudes_alta_alimentos_solicitante_id_fkey(nombre, email),
  unidades:solicitudes_alta_alimentos_unidades(
    id,
    unidad_id,
    es_unidad_principal,
    unidad:unidades(id, nombre, simbolo)
  )
`;

const MAX_UNIDADES_SOLICITUD = 50;
const MAX_COMENTARIO_LENGTH = 500;

const readResponseJson = async (response: Response): Promise<unknown> => {
  try {
    return await response.json();
  } catch {
    return null;
  }
};

const getResponseError = (payload: unknown, fallback: string): string => {
  if (isPlainRecord(payload) && typeof payload.error === 'string') {
    return payload.error;
  }

  return fallback;
};

export const createCatalogoSolicitudesService = (supabase: SupabaseClient) => {
  const listarSolicitudes = async (): Promise<CatalogoSolicitudResult<SolicitudAltaAlimento[]>> => {
    try {
      const { data, error } = await supabase
        .from('solicitudes_alta_alimentos')
        .select(solicitudSelect)
        .order('estado', { ascending: false })
        .order('created_at', { ascending: false });

      if (error) {
        return {
          success: false,
          error: 'No fue posible cargar las solicitudes de alta',
          errorDetails: error
        };
      }

      const rows = (data ?? []) as unknown as SolicitudAltaRow[];
      return {
        success: true,
        data: rows.map(normalizeSolicitud).sort((a, b) => {
          if (a.estado === b.estado) {
            return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
          }
          if (a.estado === 'pendiente') return -1;
          if (b.estado === 'pendiente') return 1;
          return new Date(b.updated_at).getTime() - new Date(a.updated_at).getTime();
        })
      };
    } catch (err) {
      return {
        success: false,
        error: 'Error inesperado al cargar las solicitudes',
        errorDetails: err
      };
    }
  };

  const crearSolicitud = async (input: CrearSolicitudAltaInput): Promise<CatalogoSolicitudResult<{ id: string }>> => {
    try {
      const nombre = input.nombre.trim();
      const categoria = input.categoria.trim();
      const solicitanteId = parseUuidValue(input.solicitanteId, { name: 'solicitanteId' });
      if (!solicitanteId.success) {
        return { success: false, error: solicitanteId.error };
      }

      const unidadIdsResult = parsePositiveIntegerArrayValue(input.unidadIds, {
        name: 'unidadIds',
        min: 1,
        maxItems: MAX_UNIDADES_SOLICITUD,
      });
      if (!unidadIdsResult.success) {
        return { success: false, error: unidadIdsResult.error };
      }

      const unidadPrincipal = input.unidadPrincipalId === undefined
        ? { success: true as const, value: undefined }
        : parsePositiveIntegerValue(input.unidadPrincipalId, { name: 'unidadPrincipalId', min: 1 });
      if (!unidadPrincipal.success) {
        return { success: false, error: unidadPrincipal.error };
      }

      const comentarioDonante = parseOptionalTextValue(input.comentarioDonante, {
        name: 'comentarioDonante',
        maxLength: MAX_COMENTARIO_LENGTH,
      });
      if (!comentarioDonante.success) {
        return { success: false, error: comentarioDonante.error };
      }

      const unidadIds = unidadIdsResult.value;

      if (!nombre || !categoria) {
        return { success: false, error: 'Nombre y categoría son obligatorios' };
      }

      if (unidadPrincipal.value !== undefined && !unidadIds.includes(unidadPrincipal.value)) {
        return { success: false, error: 'La unidad principal debe estar seleccionada' };
      }

      const { data, error } = await supabase
        .from('solicitudes_alta_alimentos')
        .insert({
          solicitante_id: solicitanteId.value,
          nombre,
          categoria,
          comentario_donante: comentarioDonante.value
        })
        .select('id')
        .single();

      if (error || !data) {
        return {
          success: false,
          error: 'No fue posible crear la solicitud',
          errorDetails: error
        };
      }

      const unidadesPayload = unidadIds.map(unidadId => ({
        solicitud_id: data.id,
        unidad_id: unidadId,
        es_unidad_principal: unidadId === unidadPrincipal.value
      }));

      const { error: unidadesError } = await supabase
        .from('solicitudes_alta_alimentos_unidades')
        .insert(unidadesPayload);

      if (unidadesError) {
        return {
          success: false,
          error: 'La solicitud fue creada, pero no fue posible asociar sus unidades',
          errorDetails: unidadesError
        };
      }

      return { success: true, data: { id: data.id as string } };
    } catch (err) {
      return {
        success: false,
        error: 'Error inesperado al crear la solicitud',
        errorDetails: err
      };
    }
  };

  const aprobarSolicitud = async (input: RevisarSolicitudAltaInput): Promise<CatalogoSolicitudResult<number>> => {
    try {
      const solicitudId = parseUuidValue(input.solicitudId, { name: 'solicitudId' });
      if (!solicitudId.success) {
        return { success: false, error: solicitudId.error };
      }

      const unidadIdsResult = parsePositiveIntegerArrayValue(input.unidadIds, {
        name: 'unidadIds',
        min: 1,
        maxItems: MAX_UNIDADES_SOLICITUD,
      });
      if (!unidadIdsResult.success) {
        return { success: false, error: unidadIdsResult.error };
      }

      const unidadPrincipal = input.unidadPrincipalId === undefined
        ? { success: true as const, value: undefined }
        : parsePositiveIntegerValue(input.unidadPrincipalId, { name: 'unidadPrincipalId', min: 1 });
      if (!unidadPrincipal.success) {
        return { success: false, error: unidadPrincipal.error };
      }

      const nombre = input.nombre.trim();
      const categoria = input.categoria.trim();

      if (!nombre || !categoria) {
        return { success: false, error: 'Nombre y categoría son obligatorios' };
      }

      const unidadIds = unidadIdsResult.value;

      if (unidadPrincipal.value !== undefined && !unidadIds.includes(unidadPrincipal.value)) {
        return { success: false, error: 'La unidad principal debe estar seleccionada' };
      }

      const response = await fetch('/api/admin/catalogo-solicitudes/aprobar', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          solicitudId: solicitudId.value,
          nombre,
          categoria,
          unidadIds,
          unidadPrincipalId: unidadPrincipal.value ?? null
        })
      });
      const payload = await readResponseJson(response);

      if (!response.ok) {
        return {
          success: false,
          error: getResponseError(payload, 'No fue posible aprobar la solicitud'),
          errorDetails: payload
        };
      }

      const alimentoId = isPlainRecord(payload) ? Number(payload.alimentoId) : Number.NaN;

      if (!Number.isSafeInteger(alimentoId) || alimentoId <= 0) {
        return {
          success: false,
          error: 'La solicitud fue aprobada, pero la respuesta del alimento creado no es válida',
          errorDetails: payload
        };
      }

      return { success: true, data: alimentoId };
    } catch (err) {
      return {
        success: false,
        error: 'Error inesperado al aprobar la solicitud',
        errorDetails: err
      };
    }
  };

  const rechazarSolicitud = async (input: RechazarSolicitudAltaInput): Promise<CatalogoSolicitudResult> => {
    try {
      const solicitudId = parseUuidValue(input.solicitudId, { name: 'solicitudId' });
      if (!solicitudId.success) {
        return { success: false, error: solicitudId.error };
      }

      const adminId = parseUuidValue(input.adminId, { name: 'adminId' });
      if (!adminId.success) {
        return { success: false, error: adminId.error };
      }

      const comentarioAdminResult = parseOptionalTextValue(input.comentarioAdmin, {
        name: 'comentarioAdmin',
        maxLength: MAX_COMENTARIO_LENGTH,
      });
      if (!comentarioAdminResult.success) {
        return { success: false, error: comentarioAdminResult.error };
      }

      const comentarioAdmin = comentarioAdminResult.value;

      if (!comentarioAdmin) {
        return {
          success: false,
          error: 'El comentario de rechazo es obligatorio'
        };
      }

      const { error } = await supabase
        .from('solicitudes_alta_alimentos')
        .update({
          estado: 'rechazada',
          comentario_admin: comentarioAdmin,
          revisado_por: adminId.value,
          fecha_revision: new Date().toISOString()
        })
        .eq('id', solicitudId.value)
        .eq('estado', 'pendiente');

      if (error) {
        return {
          success: false,
          error: 'No fue posible rechazar la solicitud',
          errorDetails: error
        };
      }

      return { success: true };
    } catch (err) {
      return {
        success: false,
        error: 'Error inesperado al rechazar la solicitud',
        errorDetails: err
      };
    }
  };

  return {
    listarSolicitudes,
    crearSolicitud,
    aprobarSolicitud,
    rechazarSolicitud
  };
};
