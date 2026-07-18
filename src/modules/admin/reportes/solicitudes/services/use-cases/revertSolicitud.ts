import type {
  Solicitud,
  SupabaseSolicitudUnidad,
  SupabaseSolicitudUsuario,
} from '../../types';
import { updateSolicitudById } from './solicitudStatePersistence';
import type { SolicitudActionResult, SolicitudUseCaseDeps } from './types';

interface RevertSolicitudParams {
  solicitudId: string;
}

interface SupabaseSolicitudReversionRow {
  id: string;
  usuario_id: string;
  tipo_alimento: string | null;
  cantidad: number | null;
  comentarios?: string | null;
  estado: Solicitud['estado'];
  created_at: string;
  latitud?: number | null;
  longitud?: number | null;
  fecha_respuesta?: string | null;
  comentario_admin?: string | null;
  unidad_id?: number | null;
  codigo_comprobante?: string | null;
  unidades?: SupabaseSolicitudUnidad | SupabaseSolicitudUnidad[] | null;
  usuarios?: SupabaseSolicitudUsuario | SupabaseSolicitudUsuario[] | null;
}

export const revertSolicitud = async (
  params: RevertSolicitudParams,
  deps: SolicitudUseCaseDeps
): SolicitudActionResult => {
  const { solicitudId } = params;
  deps.logger.info(`Iniciando reversión de solicitud ${solicitudId}`);

  const { data: solicitudData, error: fetchError } = await deps.supabaseClient
    .from('solicitudes')
    .select(`
      id,
      usuario_id,
      tipo_alimento,
      cantidad,
      comentarios,
      estado,
      created_at,
      latitud,
      longitud,
      fecha_respuesta,
      comentario_admin,
      unidad_id,
      codigo_comprobante,
      unidades:unidad_id (
        id,
        nombre,
        simbolo,
        tipo_magnitud_id,
        es_base
      ),
      usuarios:usuario_id (
        nombre,
        cedula,
        telefono,
        email,
        direccion,
        tipo_persona
      )
    `)
    .eq('id', solicitudId)
    .single();

  if (fetchError || !solicitudData) {
    deps.logger.error('Error obteniendo solicitud para revertir', fetchError);
    return {
      success: false,
      error: 'No fue posible obtener la información de la solicitud',
      errorDetails: fetchError,
    };
  }

  const solicitud = mapReversionRowToSolicitud(solicitudData as SupabaseSolicitudReversionRow);

  if (solicitud.estado !== 'aprobada') {
    deps.logger.warn(`Intento de revertir solicitud que no está aprobada. Estado actual: ${solicitud.estado}`);

    if (solicitud.estado === 'entregada') {
      return {
        success: false,
        error: 'No se pueden revertir solicitudes que ya fueron entregadas. Este cambio es permanente.',
      };
    }

    return {
      success: false,
      error: 'Solo se pueden revertir solicitudes que estén en estado aprobada',
    };
  }

  const movimientosEgreso = await deps.movementService.obtenerMovimientosEgresoSolicitud(solicitud);

  if (movimientosEgreso.length > 0) {
    deps.logger.info(`Se encontraron ${movimientosEgreso.length} movimientos de egreso para restaurar`);

    const resultadoRestauracion = await deps.inventoryService.restaurarInventario(movimientosEgreso);

    if (resultadoRestauracion.error) {
      deps.logger.error('Error restaurando inventario', resultadoRestauracion.error);
      return {
        success: false,
        error: `No fue posible restaurar el inventario: ${resultadoRestauracion.error}`,
        errorDetails: resultadoRestauracion.errorDetails,
      };
    }

    const movimientoResult = await deps.movementService.registrarMovimientoReversion(solicitud, movimientosEgreso);

    if (!movimientoResult.success) {
      return {
        success: false,
        error: movimientoResult.error ?? 'No fue posible registrar el movimiento de reversión',
        errorDetails: movimientoResult.errorDetails,
      };
    }

    deps.logger.info('Inventario restaurado y movimiento de ingreso registrado exitosamente');
  } else {
    deps.logger.warn('No se encontraron movimientos de egreso relacionados con la solicitud. Continuando con la reversión del estado únicamente.');
  }

  const { error: updateError } = await updateSolicitudById(deps.supabaseClient, solicitudId, {
    estado: 'pendiente',
    fecha_respuesta: null,
  });

  if (updateError) {
    deps.logger.error('Error al revertir solicitud', updateError);
    return {
      success: false,
      error: 'No fue posible revertir la solicitud',
      errorDetails: updateError,
    };
  }

  const mensaje = movimientosEgreso.length > 0
    ? 'Solicitud revertida a pendiente exitosamente. El inventario ha sido restaurado.'
    : 'Solicitud revertida a pendiente exitosamente. No se encontraron movimientos de egreso para restaurar.';

  return {
    success: true,
    data: {
      success: true,
      message: mensaje,
      warning: movimientosEgreso.length === 0,
    },
  };
};

const mapReversionRowToSolicitud = (row: SupabaseSolicitudReversionRow): Solicitud => {
  const unidadesNormalizadas = normalizeRelation(row.unidades);
  const usuariosNormalizados = normalizeRelation(row.usuarios);

  return {
    id: row.id,
    usuario_id: row.usuario_id,
    tipo_alimento: row.tipo_alimento ?? 'Producto desconocido',
    cantidad: row.cantidad ?? 0,
    comentarios: row.comentarios ?? undefined,
    estado: row.estado,
    created_at: row.created_at,
    latitud: row.latitud ?? undefined,
    longitud: row.longitud ?? undefined,
    fecha_respuesta: row.fecha_respuesta ?? undefined,
    comentario_admin: row.comentario_admin ?? undefined,
    unidad_id: row.unidad_id ?? undefined,
    codigo_comprobante: row.codigo_comprobante ?? undefined,
    unidades: unidadesNormalizadas ? {
      id: unidadesNormalizadas.id ?? 0,
      nombre: unidadesNormalizadas.nombre ?? '',
      simbolo: unidadesNormalizadas.simbolo ?? '',
      tipo_magnitud_id: unidadesNormalizadas.tipo_magnitud_id ?? 0,
      es_base: unidadesNormalizadas.es_base ?? false,
    } : null,
    usuarios: usuariosNormalizados ? {
      nombre: usuariosNormalizados.nombre ?? 'N/A',
      cedula: usuariosNormalizados.cedula ?? 'N/A',
      telefono: usuariosNormalizados.telefono ?? 'N/A',
      email: usuariosNormalizados.email ?? undefined,
      direccion: usuariosNormalizados.direccion ?? undefined,
      tipo_persona: usuariosNormalizados.tipo_persona ?? undefined,
    } : null,
  };
};

const normalizeRelation = <T>(value: T | T[] | null | undefined): T | null => {
  if (Array.isArray(value)) {
    return (value[0] ?? null) as T | null;
  }

  return (value ?? null) as T | null;
};
