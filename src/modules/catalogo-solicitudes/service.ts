import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  CatalogoSolicitudResult,
  CrearSolicitudAltaInput,
  RechazarSolicitudAltaInput,
  RevisarSolicitudAltaInput,
  SolicitudAltaAlimento,
  SolicitudAltaUnidad
} from './types';

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

  const crearSolicitud = async (input: CrearSolicitudAltaInput): Promise<CatalogoSolicitudResult> => {
    try {
      const nombre = input.nombre.trim();
      const categoria = input.categoria.trim();
      const unidadIds = Array.from(new Set(input.unidadIds));

      if (!nombre || !categoria) {
        return { success: false, error: 'Nombre y categoría son obligatorios' };
      }

      if (unidadIds.length === 0) {
        return { success: false, error: 'Selecciona al menos una unidad de medida' };
      }

      if (input.unidadPrincipalId && !unidadIds.includes(input.unidadPrincipalId)) {
        return { success: false, error: 'La unidad principal debe estar seleccionada' };
      }

      const { data, error } = await supabase
        .from('solicitudes_alta_alimentos')
        .insert({
          solicitante_id: input.solicitanteId,
          nombre,
          categoria,
          comentario_donante: input.comentarioDonante?.trim() || null
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
        es_unidad_principal: unidadId === input.unidadPrincipalId
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

      return { success: true };
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
      const unidadIds = Array.from(new Set(input.unidadIds));

      const { data, error } = await supabase.rpc('aprobar_solicitud_alta_alimento', {
        p_solicitud_id: input.solicitudId,
        p_nombre: input.nombre.trim(),
        p_categoria: input.categoria.trim(),
        p_unidad_ids: unidadIds,
        p_unidad_principal_id: input.unidadPrincipalId ?? null
      });

      if (error) {
        return {
          success: false,
          error: error.message || 'No fue posible aprobar la solicitud',
          errorDetails: error
        };
      }

      return { success: true, data: Number(data) };
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
      const comentarioAdmin = input.comentarioAdmin.trim();

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
          revisado_por: input.adminId,
          fecha_revision: new Date().toISOString()
        })
        .eq('id', input.solicitudId)
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
